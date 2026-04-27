const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const mysql = require('mysql2/promise');

dotenv.config();

const app = express();
const port = Number(process.env.PORT || 4000);

app.use(cors());
app.use(express.json({ limit: '20mb' }));

const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'bnsDB',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

const DEFAULT_PERMISSIONS = {
  canRegisterProduct: false,
  canReviewList: false,
  canEditProduct: false,
  canManageAsRepair: false,
  canViewDetail: false,
  canDownloadFirmware: false,
  canManagePermissions: false,
  canViewLogs: false,
};
const VALID_PRODUCT_TYPES = new Set(['adjuster', 'controller']);

const normalizePermissions = (permissions) => {
  const safe = permissions && typeof permissions === 'object' ? permissions : {};
  return {
    canRegisterProduct: !!safe.canRegisterProduct,
    // Backward compatibility: old permission rows may not include canReviewList.
    canReviewList: !!safe.canReviewList || !!safe.canManagePermissions,
    canEditProduct: !!safe.canEditProduct,
    canManageAsRepair: !!safe.canManageAsRepair,
    canViewDetail: !!safe.canViewDetail,
    canDownloadFirmware: !!safe.canDownloadFirmware,
    canManagePermissions: !!safe.canManagePermissions,
    canViewLogs: !!safe.canViewLogs,
  };
};

const parsePermissionsJson = (value) => {
  if (!value) {
    return { ...DEFAULT_PERMISSIONS };
  }

  try {
    const parsed = JSON.parse(value);
    return normalizePermissions(parsed);
  } catch (error) {
    return { ...DEFAULT_PERMISSIONS };
  }
};

const ensureActionLogsTable = async () => {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS action_logs (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      user_name VARCHAR(100) NULL,
      action_type VARCHAR(100) NOT NULL,
      target_type VARCHAR(100) NULL,
      target_id VARCHAR(100) NULL,
      description VARCHAR(255) NULL,
      metadata_json LONGTEXT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_action_logs_created_at (created_at),
      INDEX idx_action_logs_user_name (user_name)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
  );
};

const writeActionLog = async ({ userName, actionType, targetType, targetId, description, metadata }) => {
  try {
    await ensureActionLogsTable();
    await pool.query(
      `INSERT INTO action_logs (user_name, action_type, target_type, target_id, description, metadata_json)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        userName || null,
        actionType || 'unknown',
        targetType || null,
        targetId !== undefined && targetId !== null ? String(targetId) : null,
        description || null,
        metadata ? JSON.stringify(metadata) : null,
      ]
    );
  } catch (error) {
    // Logging failures should not break the main request flow.
  }
};

const parseSpecsJson = (value) => {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
};

const normalizeSpecs = (specs) => (Array.isArray(specs) ? specs : []);

const isValidProductType = (type) => VALID_PRODUCT_TYPES.has(type);

const validateProductPayload = ({ siteName, productName, type }) => {
  if (!siteName || !productName || !type) {
    return '현장명, 제품명, 타입은 필수입니다.';
  }

  if (!isValidProductType(type)) {
    return '타입 값이 올바르지 않습니다.';
  }

  return null;
};

const parseProductDiffJson = (value) => {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
};

const parseReviewPrevSnapshotJson = (value) => {
  if (!value) {
    return null;
  }
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }
    return {
      siteName: parsed.siteName || '',
      productName: parsed.productName || '',
      type: parsed.type || '',
      specs: normalizeSpecs(parsed.specs),
    };
  } catch (error) {
    return null;
  }
};

const formatSpecDetailForDiff = (value) => {
  const text = String(value || '');
  if (!text) {
    return '';
  }

  try {
    const parsed = JSON.parse(text);
    if (parsed && parsed.__bnsFileList === true && Array.isArray(parsed.files)) {
      const imageFiles = parsed.files.filter((file) => file?.kind === 'image');
      const firmwareFiles = parsed.files.filter((file) => file?.kind === 'firmware');
      if (firmwareFiles.length > 0) {
        return firmwareFiles
          .map((file) => `${file?.name || '-'} - ${file?.description || '-'}`)
          .join(', ');
      }
      if (imageFiles.length > 0) {
        return imageFiles
          .map((file) => file?.name || '-')
          .join(', ');
      }
      return parsed.files.map((file) => file?.name || '-').join(', ');
    }
    if (parsed && parsed.__bnsFile === true) {
      if (parsed.kind === 'firmware') {
        return `${parsed.name || '-'} - ${parsed.description || '-'}`;
      }
      if (parsed.kind === 'image') {
        return parsed.name || '-';
      }
      return parsed.name || '';
    }
  } catch (error) {
    // non-json text details
  }

  return text;
};

const buildSpecsMap = (specs) => {
  const map = {};
  for (const spec of normalizeSpecs(specs)) {
    const key = String(spec?.title || '').trim();
    if (!key) {
      continue;
    }
    map[key] = formatSpecDetailForDiff(spec?.details || '');
  }
  return map;
};

const buildProductDiff = (previousProduct, nextProduct) => {
  const changes = [];
  const pushChange = (field, label, before, after) => {
    if (String(before || '') !== String(after || '')) {
      changes.push({
        field,
        label,
        before: before ?? '',
        after: after ?? '',
      });
    }
  };

  pushChange('siteName', '현장명', previousProduct?.siteName, nextProduct?.siteName);
  pushChange('productName', '모델명', previousProduct?.productName, nextProduct?.productName);
  pushChange('type', '타입', previousProduct?.type, nextProduct?.type);

  const prevSpecs = buildSpecsMap(previousProduct?.specs || []);
  const nextSpecs = buildSpecsMap(nextProduct?.specs || []);
  const allSpecTitles = Array.from(new Set([...Object.keys(prevSpecs), ...Object.keys(nextSpecs)]));
  for (const title of allSpecTitles) {
    pushChange(`spec:${title}`, `사양:${title}`, prevSpecs[title], nextSpecs[title]);
  }

  return changes;
};

const ensureUsersTable = async () => {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      username VARCHAR(100) NOT NULL UNIQUE,
      phone_number VARCHAR(30) NULL,
      permissions_json LONGTEXT NULL,
      password VARCHAR(255) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
  );

  const [phoneColumnRows] = await pool.query(
    `SELECT COUNT(*) AS cnt
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ?
       AND TABLE_NAME = 'users'
       AND COLUMN_NAME = 'phone_number'`,
    [process.env.DB_NAME || 'bnsDB']
  );

  if (!phoneColumnRows[0].cnt) {
    await pool.query('ALTER TABLE users ADD COLUMN phone_number VARCHAR(30) NULL AFTER username');
  }

  const [permissionsColumnRows] = await pool.query(
    `SELECT COUNT(*) AS cnt
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ?
       AND TABLE_NAME = 'users'
       AND COLUMN_NAME = 'permissions_json'`,
    [process.env.DB_NAME || 'bnsDB']
  );

  if (!permissionsColumnRows[0].cnt) {
    await pool.query('ALTER TABLE users ADD COLUMN permissions_json LONGTEXT NULL AFTER phone_number');
    await pool.query('UPDATE users SET permissions_json = ? WHERE permissions_json IS NULL', [JSON.stringify(DEFAULT_PERMISSIONS)]);
  } else {
    const [rows] = await pool.query('SELECT id, permissions_json FROM users');
    for (const row of rows) {
      const normalized = normalizePermissions(parsePermissionsJson(row.permissions_json));
      await pool.query('UPDATE users SET permissions_json = ? WHERE id = ?', [JSON.stringify(normalized), row.id]);
    }
  }

};

const ensureProductsApprovalColumns = async () => {
  const dbName = process.env.DB_NAME || 'bnsDB';
  const ensureColumn = async (columnName, alterSql) => {
    const [rows] = await pool.query(
      `SELECT COUNT(*) AS cnt
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = ?
         AND TABLE_NAME = 'products'
         AND COLUMN_NAME = ?`,
      [dbName, columnName]
    );
    if (!rows[0].cnt) {
      await pool.query(alterSql);
    }
  };

  await ensureColumn('review_status', "ALTER TABLE products ADD COLUMN review_status VARCHAR(30) NOT NULL DEFAULT 'approved' AFTER specs_json");
  await ensureColumn('review_event_type', "ALTER TABLE products ADD COLUMN review_event_type VARCHAR(30) NULL AFTER review_status");
  await ensureColumn('review_diff_json', 'ALTER TABLE products ADD COLUMN review_diff_json LONGTEXT NULL AFTER review_event_type');
  await ensureColumn('review_prev_snapshot_json', 'ALTER TABLE products ADD COLUMN review_prev_snapshot_json LONGTEXT NULL AFTER review_diff_json');
  await ensureColumn('approved_at', 'ALTER TABLE products ADD COLUMN approved_at TIMESTAMP NULL DEFAULT NULL AFTER review_prev_snapshot_json');
  await ensureColumn('pending_requester_name', 'ALTER TABLE products ADD COLUMN pending_requester_name VARCHAR(100) NULL AFTER approved_at');
};

const ensureMailboxesTable = async () => {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS user_mailboxes (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      recipient_name VARCHAR(100) NOT NULL,
      title VARCHAR(255) NOT NULL,
      content TEXT NOT NULL,
      is_read TINYINT(1) NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_user_mailboxes_recipient_name (recipient_name),
      INDEX idx_user_mailboxes_is_read (is_read),
      INDEX idx_user_mailboxes_created_at (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
  );
};


const writeMailboxMessage = async ({ recipientName, title, content }) => {
  if (!recipientName) {
    return;
  }
  await ensureMailboxesTable();
  await pool.query(
    'INSERT INTO user_mailboxes (recipient_name, title, content, is_read) VALUES (?, ?, ?, 0)',
    [recipientName, title || '알림', content || '']
  );
};

const loadRequesterPermissions = async (requesterName) => {
  if (!requesterName) {
    return null;
  }

  await ensureUsersTable();
  const [rows] = await pool.query('SELECT permissions_json FROM users WHERE username = ? LIMIT 1', [requesterName]);
  if (rows.length === 0) {
    return null;
  }

  return parsePermissionsJson(rows[0].permissions_json);
};

const requesterCanManagePermissions = async (requesterName) => {
  const loginId = process.env.LOGIN_ID || 'admin';
  if (!requesterName) {
    return false;
  }

  if (requesterName === loginId) {
    return true;
  }

  const permissions = await loadRequesterPermissions(requesterName);
  return !!permissions?.canManagePermissions;
};

const requesterCanViewLogs = async (requesterName) => {
  const loginId = process.env.LOGIN_ID || 'admin';
  if (!requesterName) {
    return false;
  }

  if (requesterName === loginId) {
    return true;
  }

  const permissions = await loadRequesterPermissions(requesterName);
  return !!permissions && (permissions.canViewLogs || permissions.canManagePermissions);
};

const requesterCanReviewLists = async (requesterName) => {
  const loginId = process.env.LOGIN_ID || 'admin';
  if (!requesterName) {
    return false;
  }

  if (requesterName === loginId) {
    return true;
  }

  const permissions = await loadRequesterPermissions(requesterName);
  return !!permissions?.canReviewList;
};

app.post('/api/login', async (req, res) => {
  const { name, username, password } = req.body || {};
  const loginName = name || username;
  const loginId = process.env.LOGIN_ID || 'admin';
  const loginPassword = process.env.LOGIN_PASSWORD || 'admin1234';

  if (!loginName || !password) {
    res.status(400).json({ message: '이름과 비밀번호를 입력해주세요.' });
    return;
  }

  try {
    await ensureUsersTable();
    const [users] = await pool.query('SELECT id, username, phone_number, permissions_json FROM users WHERE username = ? AND password = ? LIMIT 1', [loginName, password]);
    if (users.length > 0) {
      const user = users[0];
      await writeActionLog({
        userName: user.username,
        actionType: 'login',
        targetType: 'auth',
        description: '로그인',
      });
      res.json({
        ok: true,
        user: {
          id: user.id,
          name: user.username,
          phoneNumber: user.phone_number || '',
          permissions: parsePermissionsJson(user.permissions_json),
        },
      });
      return;
    }
  } catch (error) {
    res.status(500).json({ message: '로그인 처리에 실패했습니다.', error: error.message });
    return;
  }

  if (loginName === loginId && password === loginPassword) {
    await writeActionLog({
      userName: loginId,
      actionType: 'login',
      targetType: 'auth',
      description: '로그인',
    });
    res.json({
      ok: true,
      user: {
        id: 0,
        name: loginId,
        phoneNumber: '',
        permissions: {
          canRegisterProduct: true,
          canReviewList: true,
          canEditProduct: true,
          canManageAsRepair: true,
          canViewDetail: true,
          canDownloadFirmware: true,
          canManagePermissions: true,
          canViewLogs: true,
        },
      },
    });
    return;
  }

  await writeActionLog({
    userName: loginName,
    actionType: 'login_failed',
    targetType: 'auth',
    description: '로그인 실패',
  });

  res.status(401).json({ message: '이름 또는 비밀번호가 올바르지 않습니다.' });
});

app.post('/api/signup', async (req, res) => {
  const { name, username, phoneNumber, password } = req.body || {};
  const signupName = name || username;

  if (!signupName || !phoneNumber || !password) {
    res.status(400).json({ message: '이름, 전화번호, 비밀번호를 입력해주세요.' });
    return;
  }

  try {
    await ensureUsersTable();
    const [exists] = await pool.query('SELECT id FROM users WHERE username = ? LIMIT 1', [signupName]);
    if (exists.length > 0) {
      await writeActionLog({
        userName: signupName,
        actionType: 'signup_failed',
        targetType: 'auth',
        description: '중복 이름으로 회원가입 실패',
      });
      res.status(409).json({ message: '이미 존재하는 이름입니다.' });
      return;
    }

    await pool.query(
      'INSERT INTO users (username, phone_number, permissions_json, password) VALUES (?, ?, ?, ?)',
      [signupName, phoneNumber, JSON.stringify(DEFAULT_PERMISSIONS), password]
    );
    await writeActionLog({
      userName: signupName,
      actionType: 'signup',
      targetType: 'auth',
      description: '회원가입 성공',
      metadata: { phoneNumber },
    });
    res.status(201).json({ ok: true });
  } catch (error) {
    res.status(500).json({ message: '회원가입에 실패했습니다.', error: error.message });
  }
});

app.get('/api/users', async (req, res) => {
  const requesterName = String(req.query.requesterName || '');

  try {
    const canManage = await requesterCanManagePermissions(requesterName);
    if (!canManage) {
      res.status(403).json({ message: '권한이 없습니다.' });
      return;
    }

    const [rows] = await pool.query('SELECT id, username, phone_number, permissions_json, created_at FROM users ORDER BY id ASC');
    const users = rows.map((row) => ({
      id: row.id,
      name: row.username,
      phoneNumber: row.phone_number || '',
      permissions: parsePermissionsJson(row.permissions_json),
      createdAt: row.created_at,
    }));

    res.json(users);
  } catch (error) {
    res.status(500).json({ message: '사용자 목록 조회에 실패했습니다.', error: error.message });
  }
});

app.put('/api/users/:id/permissions', async (req, res) => {
  const id = Number(req.params.id);
  const { requesterName, permissions } = req.body || {};

  if (!id || Number.isNaN(id)) {
    res.status(400).json({ message: '사용자 ID가 올바르지 않습니다.' });
    return;
  }

  try {
    const canManage = await requesterCanManagePermissions(requesterName);
    if (!canManage) {
      res.status(403).json({ message: '권한이 없습니다.' });
      return;
    }

    const [targetRows] = await pool.query('SELECT username, permissions_json FROM users WHERE id = ? LIMIT 1', [id]);
    if (targetRows.length === 0) {
      res.status(404).json({ message: '대상 사용자를 찾을 수 없습니다.' });
      return;
    }

    const previous = parsePermissionsJson(targetRows[0].permissions_json);
    const normalized = normalizePermissions(permissions);
    const changedPermissionKeys = Object.keys(DEFAULT_PERMISSIONS).filter((key) => previous[key] !== normalized[key]);
    const changedPermissions = changedPermissionKeys.reduce((acc, key) => {
      acc[key] = normalized[key];
      return acc;
    }, {});

    const [result] = await pool.query('UPDATE users SET permissions_json = ? WHERE id = ?', [JSON.stringify(normalized), id]);

    if (result.affectedRows === 0) {
      res.status(404).json({ message: '대상 사용자를 찾을 수 없습니다.' });
      return;
    }

    await writeActionLog({
      userName: requesterName,
      actionType: 'permission_update',
      targetType: 'user',
      targetId: id,
      description: '권한 관리 권한',
      metadata: {
        targetUserName: targetRows[0].username,
        changedPermissionKeys,
        changedPermissions,
        permissions: normalized,
      },
    });

    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ message: '권한 저장에 실패했습니다.', error: error.message });
  }
});

app.get('/api/logs', async (req, res) => {
  const requesterName = String(req.query.requesterName || '');
  const limit = Math.min(200, Math.max(1, Number(req.query.limit || 100)));

  try {
    const canView = await requesterCanViewLogs(requesterName);
    if (!canView) {
      res.status(403).json({ message: '로그 조회 권한이 없습니다.' });
      return;
    }

    await ensureActionLogsTable();
    const [rows] = await pool.query(
      `SELECT l.id, l.user_name, l.action_type, l.target_type, l.target_id, l.description, l.metadata_json, l.created_at,
              u.phone_number AS user_phone_number,
              p.site_name AS product_site_name,
              p.product_name AS product_name
       FROM action_logs l
       LEFT JOIN users u ON u.username = l.user_name
       LEFT JOIN products p ON p.id = CAST(l.target_id AS UNSIGNED)
       ORDER BY l.id DESC
       LIMIT ?`,
      [limit]
    );

    const logs = rows.map((row) => {
      const metadata = row.metadata_json ? (() => {
        try {
          return JSON.parse(row.metadata_json);
        } catch (error) {
          return null;
        }
      })() : null;

      const productLogActions = new Set(['product_approve', 'product_reject', 'product_delete_request', 'product_delete_approve']);
      const mergedMetadata = metadata && typeof metadata === 'object' ? { ...metadata } : {};
      if (productLogActions.has(row.action_type)) {
        if (!mergedMetadata.siteName && row.product_site_name) {
          mergedMetadata.siteName = row.product_site_name;
        }
        if (!mergedMetadata.productName && row.product_name) {
          mergedMetadata.productName = row.product_name;
        }
      }

      return {
        id: row.id,
        userName: row.user_name,
        userPhoneNumber: row.user_phone_number || '',
        actionType: row.action_type,
        targetType: row.target_type,
        targetId: row.target_id,
        description: row.description,
        metadata: Object.keys(mergedMetadata).length > 0 ? mergedMetadata : null,
        createdAt: row.created_at,
      };
    });

    res.json(logs);
  } catch (error) {
    res.status(500).json({ message: '로그 조회에 실패했습니다.', error: error.message });
  }
});

app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ ok: false, message: error.message });
  }
});

app.get('/api/products', async (req, res) => {
  try {
    await ensureProductsApprovalColumns();
    const [rows] = await pool.query(
      `SELECT p.id, p.site_name, p.product_name, p.type, p.created_at, p.specs_json,
              p.review_status, p.review_event_type, p.review_diff_json, p.approved_at, p.pending_requester_name
       FROM products p
       ORDER BY p.id DESC`
    );

    const products = rows.map((row) => ({
      id: row.id,
      siteName: row.site_name,
      name: row.product_name,
      type: row.type,
      createdAt: row.created_at,
      specs: parseSpecsJson(row.specs_json),
      reviewStatus: row.review_status || 'approved',
      reviewEventType: row.review_event_type || null,
      reviewDiff: parseProductDiffJson(row.review_diff_json),
      approvedAt: row.approved_at,
      pendingRequesterName: row.pending_requester_name || '',
    }));

    res.json(products);
  } catch (error) {
    res.status(500).json({ message: '목록 조회에 실패했습니다.', error: error.message });
  }
});

app.post('/api/logs/event', async (req, res) => {
  const { requesterName, actionType, targetType, targetId, description, metadata } = req.body || {};

  if (!requesterName || !actionType) {
    res.status(400).json({ message: 'requesterName과 actionType은 필수입니다.' });
    return;
  }

  let normalizedDescription = description;
  if (actionType === 'login') {
    normalizedDescription = '로그인';
  }
  if (actionType === 'logout') {
    normalizedDescription = '로그아웃';
  }

  await writeActionLog({
    userName: requesterName,
    actionType,
    targetType,
    targetId,
    description: normalizedDescription,
    metadata,
  });

  res.json({ ok: true });
});

app.post('/api/products', async (req, res) => {
  const { siteName, productName, type, specs, actorName } = req.body;

  const validationMessage = validateProductPayload({ siteName, productName, type });
  if (validationMessage) {
    res.status(400).json({ message: validationMessage });
    return;
  }

  try {
    await ensureProductsApprovalColumns();
    const safeSpecs = normalizeSpecs(specs);
    const specsJson = JSON.stringify(safeSpecs);

    const [productResult] = await pool.query(
      `INSERT INTO products (site_name, product_name, type, specs_json, review_status, review_event_type, review_diff_json, approved_at)
       VALUES (?, ?, ?, ?, 'pending', 'create', ?, NULL)`,
      [siteName, productName, type, specsJson, JSON.stringify([])]
    );
    await pool.query('UPDATE products SET pending_requester_name = ? WHERE id = ?', [actorName || null, productResult.insertId]);

    await writeActionLog({
      userName: actorName,
      actionType: 'product_create',
      targetType: 'product',
      targetId: productResult.insertId,
      description: '제품 등록',
      metadata: { siteName, productName, type },
    });

    res.status(201).json({ id: productResult.insertId });
  } catch (error) {
    res.status(500).json({ message: '저장에 실패했습니다.', error: error.message });
  }
});

app.put('/api/products/:id', async (req, res) => {
  const id = Number(req.params.id);
  const { siteName, productName, type, specs, actorName } = req.body;

  if (!id || Number.isNaN(id)) {
    res.status(400).json({ message: '제품 ID가 올바르지 않습니다.' });
    return;
  }

  const validationMessage = validateProductPayload({ siteName, productName, type });
  if (validationMessage) {
    res.status(400).json({ message: validationMessage });
    return;
  }

  try {
    await ensureProductsApprovalColumns();
    const safeSpecs = normalizeSpecs(specs);
    const specsJson = JSON.stringify(safeSpecs);
    const [prevRows] = await pool.query(
      'SELECT site_name, product_name, type, specs_json FROM products WHERE id = ? LIMIT 1',
      [id]
    );

    if (prevRows.length === 0) {
      res.status(404).json({ message: '수정할 제품을 찾지 못했습니다.' });
      return;
    }

    const previousProduct = {
      siteName: prevRows[0].site_name,
      productName: prevRows[0].product_name,
      type: prevRows[0].type,
      specs: parseSpecsJson(prevRows[0].specs_json),
    };
    const nextProduct = {
      siteName,
      productName,
      type,
      specs: safeSpecs,
    };
    const reviewDiff = buildProductDiff(previousProduct, nextProduct);
    const previousSnapshotJson = JSON.stringify(previousProduct);

    const [result] = await pool.query(
      `UPDATE products
       SET site_name = ?, product_name = ?, type = ?, specs_json = ?,
           review_status = 'pending', review_event_type = 'update',
           review_diff_json = ?, review_prev_snapshot_json = ?, approved_at = NULL, pending_requester_name = ?
       WHERE id = ?`,
      [siteName, productName, type, specsJson, JSON.stringify(reviewDiff), previousSnapshotJson, actorName || null, id]
    );

    if (result.affectedRows === 0) {
      res.status(404).json({ message: '수정할 제품을 찾지 못했습니다.' });
      return;
    }

    // Remove stale rejection mailbox notification when requester resubmits this list.
    await ensureMailboxesTable();
    const prevTypeLabel = previousProduct.type === 'controller' ? '제어기' : '조절기';
    await pool.query(
      `DELETE FROM user_mailboxes
       WHERE recipient_name = ?
         AND title = '리스트 승인 거부'
         AND content LIKE ?
         AND content LIKE ?
         AND content LIKE ?`,
      [
        String(actorName || ''),
        `%현장명 : ${previousProduct.siteName || ''}%`,
        `%모델명 : ${previousProduct.productName || ''}%`,
        `%타입 : ${prevTypeLabel}%`,
      ]
    );

    await writeActionLog({
      userName: actorName,
      actionType: 'product_update',
      targetType: 'product',
      targetId: id,
      description: '제품 수정',
      metadata: { siteName, productName, type },
    });

    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ message: '수정에 실패했습니다.', error: error.message });
  }
});

app.delete('/api/products/:id', async (req, res) => {
  const id = Number(req.params.id);
  const actorName = String(req.query.actorName || '');

  if (!id || Number.isNaN(id)) {
    res.status(400).json({ message: '제품 ID가 올바르지 않습니다.' });
    return;
  }

  try {
    await ensureProductsApprovalColumns();
    const [rows] = await pool.query(
      'SELECT id, review_status, site_name, product_name FROM products WHERE id = ? LIMIT 1',
      [id]
    );
    if (rows.length === 0) {
      res.status(404).json({ message: '삭제할 제품을 찾지 못했습니다.' });
      return;
    }
    if (rows[0].review_status === 'pending') {
      res.status(409).json({ message: '이미 검토 승인중인 항목입니다.' });
      return;
    }

    await pool.query(
      `UPDATE products
       SET review_status = 'pending', review_event_type = 'delete',
           review_diff_json = ?, approved_at = NULL, pending_requester_name = ?
       WHERE id = ?`,
      [JSON.stringify([]), actorName || null, id]
    );

    await writeActionLog({
      userName: actorName || null,
      actionType: 'product_delete_request',
      targetType: 'product',
      targetId: id,
      description: '제품 삭제 요청',
      metadata: {
        siteName: rows[0].site_name || '',
        productName: rows[0].product_name || '',
      },
    });

    res.json({ ok: true, pendingApproval: true });
  } catch (error) {
    res.status(500).json({ message: '삭제에 실패했습니다.', error: error.message });
  }
});

app.get('/api/review/pending-products', async (req, res) => {
  const requesterName = String(req.query.requesterName || '');
  try {
    const canReview = await requesterCanReviewLists(requesterName);
    if (!canReview) {
      res.status(403).json({ message: '검토 권한이 없습니다.' });
      return;
    }

    await ensureProductsApprovalColumns();
    const [rows] = await pool.query(
      `SELECT id, site_name, product_name, type, specs_json, review_event_type, review_diff_json, created_at, pending_requester_name
       FROM products
       WHERE review_status = 'pending'
       ORDER BY id DESC`
    );

    const pendingProducts = rows.map((row) => ({
      id: row.id,
      siteName: row.site_name,
      name: row.product_name,
      type: row.type,
      specs: parseSpecsJson(row.specs_json),
      reviewEventType: row.review_event_type || 'update',
      reviewDiff: parseProductDiffJson(row.review_diff_json),
      createdAt: row.created_at,
      pendingRequesterName: row.pending_requester_name || '',
    }));
    res.json(pendingProducts);
  } catch (error) {
    res.status(500).json({ message: '승인 대기 목록 조회에 실패했습니다.', error: error.message });
  }
});

app.put('/api/review/products/:id/approve', async (req, res) => {
  const id = Number(req.params.id);
  const { requesterName } = req.body || {};
  if (!id || Number.isNaN(id)) {
    res.status(400).json({ message: '제품 ID가 올바르지 않습니다.' });
    return;
  }

  try {
    const canReview = await requesterCanReviewLists(String(requesterName || ''));
    if (!canReview) {
      res.status(403).json({ message: '검토 권한이 없습니다.' });
      return;
    }

    await ensureProductsApprovalColumns();
    const [targetRows] = await pool.query(
      'SELECT id, review_event_type, site_name, product_name, pending_requester_name FROM products WHERE id = ? LIMIT 1',
      [id]
    );
    if (targetRows.length === 0) {
      res.status(404).json({ message: '승인할 제품을 찾지 못했습니다.' });
      return;
    }

    const reviewEventType = targetRows[0].review_event_type || '';
    if (reviewEventType === 'delete') {
      const [deleteResult] = await pool.query('DELETE FROM products WHERE id = ?', [id]);
      if (deleteResult.affectedRows === 0) {
        res.status(404).json({ message: '삭제 승인할 제품을 찾지 못했습니다.' });
        return;
      }

      await writeActionLog({
        userName: requesterName,
        actionType: 'product_delete_approve',
        targetType: 'product',
        targetId: id,
        description: '제품 삭제 승인',
        metadata: {
          siteName: targetRows[0].site_name || '',
          productName: targetRows[0].product_name || '',
        },
      });
    } else {
      const [result] = await pool.query(
        `UPDATE products
         SET review_status = 'approved', review_event_type = NULL, review_diff_json = NULL, review_prev_snapshot_json = NULL, approved_at = NOW(), pending_requester_name = NULL
         WHERE id = ?`,
        [id]
      );
      if (result.affectedRows === 0) {
        res.status(404).json({ message: '승인할 제품을 찾지 못했습니다.' });
        return;
      }

      await writeActionLog({
        userName: requesterName,
        actionType: 'product_approve',
        targetType: 'product',
        targetId: id,
        description: '리스트 승인',
        metadata: {
          siteName: targetRows[0].site_name || '',
          productName: targetRows[0].product_name || '',
        },
      });
    }

    let recipientName = String(targetRows[0].pending_requester_name || '').trim();
    if (!recipientName) {
      const [logRows] = await pool.query(
        `SELECT user_name
         FROM action_logs
         WHERE target_type = 'product'
           AND target_id = ?
           AND action_type IN ('product_create', 'product_update', 'product_delete_request')
         ORDER BY id DESC
         LIMIT 1`,
        [String(id)]
      );
      recipientName = String(logRows?.[0]?.user_name || '').trim();
    }

    await writeMailboxMessage({
      recipientName,
      title: '리스트 승인 완료',
      content: `현장명: ${targetRows[0].site_name || '-'}, 모델명: ${targetRows[0].product_name || '-'} 승인 완료되었습니다.`,
    });

    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ message: '승인 처리에 실패했습니다.', error: error.message });
  }
});

app.put('/api/review/products/:id/reject', async (req, res) => {
  const id = Number(req.params.id);
  const { requesterName, reason } = req.body || {};
  if (!id || Number.isNaN(id)) {
    res.status(400).json({ message: '제품 ID가 올바르지 않습니다.' });
    return;
  }
  if (!String(reason || '').trim()) {
    res.status(400).json({ message: '승인 거부 내용을 입력해주세요.' });
    return;
  }

  try {
    const canReview = await requesterCanReviewLists(String(requesterName || ''));
    if (!canReview) {
      res.status(403).json({ message: '검토 권한이 없습니다.' });
      return;
    }

    await ensureProductsApprovalColumns();
    const [rows] = await pool.query(
      `SELECT site_name, product_name, type, pending_requester_name, review_event_type, review_prev_snapshot_json
       FROM products
       WHERE id = ? AND review_status = 'pending'
       LIMIT 1`,
      [id]
    );
    if (rows.length === 0) {
      res.status(404).json({ message: '승인 거부할 제품을 찾지 못했습니다.' });
      return;
    }

    if ((rows[0].review_event_type || '') === 'delete') {
      await pool.query(
        `UPDATE products
         SET review_status = 'approved', review_event_type = NULL, review_diff_json = NULL, review_prev_snapshot_json = NULL, approved_at = NOW(), pending_requester_name = NULL
         WHERE id = ?`,
        [id]
      );
    } else if ((rows[0].review_event_type || '') === 'update') {
      const previousSnapshot = parseReviewPrevSnapshotJson(rows[0].review_prev_snapshot_json);
      if (previousSnapshot) {
        await pool.query(
          `UPDATE products
           SET site_name = ?, product_name = ?, type = ?, specs_json = ?,
               review_status = 'approved', review_event_type = NULL, review_diff_json = NULL, review_prev_snapshot_json = NULL,
               approved_at = NOW(), pending_requester_name = NULL
           WHERE id = ?`,
          [
            previousSnapshot.siteName || '',
            previousSnapshot.productName || '',
            previousSnapshot.type || rows[0].type || 'adjuster',
            JSON.stringify(previousSnapshot.specs || []),
            id,
          ]
        );
      } else {
        await pool.query(
          `UPDATE products
           SET review_status = 'approved', review_event_type = NULL, review_diff_json = NULL, review_prev_snapshot_json = NULL, approved_at = NOW(), pending_requester_name = NULL
           WHERE id = ?`,
          [id]
        );
      }
    } else {
      await pool.query(
        `UPDATE products
         SET review_status = 'rejected', review_event_type = NULL, review_diff_json = NULL, review_prev_snapshot_json = NULL, approved_at = NULL
         WHERE id = ?`,
        [id]
      );
    }

    let notifySiteName = rows[0].site_name || '-';
    let notifyProductName = rows[0].product_name || '-';
    let notifyType = rows[0].type || 'adjuster';
    if ((rows[0].review_event_type || '') === 'update') {
      const previousSnapshot = parseReviewPrevSnapshotJson(rows[0].review_prev_snapshot_json);
      if (previousSnapshot) {
        notifySiteName = previousSnapshot.siteName || notifySiteName;
        notifyProductName = previousSnapshot.productName || notifyProductName;
        notifyType = previousSnapshot.type || notifyType;
      }
    }
    const typeLabel = notifyType === 'controller' ? '제어기' : '조절기';
    const recipient = rows[0].pending_requester_name || '';
    await writeMailboxMessage({
      recipientName: recipient,
      title: '리스트 승인 거부',
      content: `현장명 : ${notifySiteName} / 모델명 : ${notifyProductName} / 타입 : ${typeLabel} / 리스트ID : ${id} / 승인 거부내용 : ${String(reason || '').trim()}`,
    });

    await writeActionLog({
      userName: requesterName,
      actionType: 'product_reject',
      targetType: 'product',
      targetId: id,
      description: '리스트 승인 거부',
      metadata: {
        siteName: notifySiteName,
        productName: notifyProductName,
        reason: String(reason || '').trim(),
      },
    });

    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ message: '승인 거부 처리에 실패했습니다.', error: error.message });
  }
});

app.get('/api/mailbox', async (req, res) => {
  const requesterName = String(req.query.requesterName || '');
  if (!requesterName) {
    res.status(400).json({ message: 'requesterName이 필요합니다.' });
    return;
  }

  try {
    await ensureMailboxesTable();
    const [rows] = await pool.query(
      `SELECT id, title, content, is_read, created_at
       FROM user_mailboxes
       WHERE recipient_name = ?
       ORDER BY id DESC
       LIMIT 200`,
      [requesterName]
    );
    res.json(rows.map((row) => ({
      id: row.id,
      title: row.title,
      content: row.content,
      isRead: !!row.is_read,
      createdAt: row.created_at,
    })));
  } catch (error) {
    res.status(500).json({ message: '우편함 조회에 실패했습니다.', error: error.message });
  }
});

app.get('/api/mailbox/unread-count', async (req, res) => {
  const requesterName = String(req.query.requesterName || '');
  if (!requesterName) {
    res.status(400).json({ message: 'requesterName이 필요합니다.' });
    return;
  }

  try {
    await ensureMailboxesTable();
    const [rows] = await pool.query(
      'SELECT COUNT(*) AS cnt FROM user_mailboxes WHERE recipient_name = ? AND is_read = 0',
      [requesterName]
    );
    res.json({ unreadCount: Number(rows[0]?.cnt || 0) });
  } catch (error) {
    res.status(500).json({ message: '읽지 않은 우편 조회에 실패했습니다.', error: error.message });
  }
});

app.put('/api/mailbox/read-all', async (req, res) => {
  const { requesterName } = req.body || {};
  if (!requesterName) {
    res.status(400).json({ message: 'requesterName이 필요합니다.' });
    return;
  }

  try {
    await ensureMailboxesTable();
    await pool.query(
      'UPDATE user_mailboxes SET is_read = 1 WHERE recipient_name = ? AND is_read = 0',
      [String(requesterName)]
    );
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ message: '우편 읽음 처리에 실패했습니다.', error: error.message });
  }
});

app.delete('/api/mailbox', async (req, res) => {
  const requesterName = String(req.body?.requesterName || '');
  const itemIds = Array.isArray(req.body?.itemIds) ? req.body.itemIds : [];
  const safeIds = itemIds.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0);

  if (!requesterName) {
    res.status(400).json({ message: 'requesterName이 필요합니다.' });
    return;
  }
  if (safeIds.length === 0) {
    res.status(400).json({ message: '삭제할 알림 ID가 필요합니다.' });
    return;
  }

  try {
    await ensureMailboxesTable();
    const placeholders = safeIds.map(() => '?').join(', ');
    const [result] = await pool.query(
      `DELETE FROM user_mailboxes
       WHERE recipient_name = ?
         AND id IN (${placeholders})`,
      [requesterName, ...safeIds]
    );
    res.json({ ok: true, deletedCount: Number(result?.affectedRows || 0) });
  } catch (error) {
    res.status(500).json({ message: '알림 삭제에 실패했습니다.', error: error.message });
  }
});

app.post('/api/mailbox/delete-selected', async (req, res) => {
  const requesterName = String(req.body?.requesterName || '');
  const itemIds = Array.isArray(req.body?.itemIds) ? req.body.itemIds : [];
  const safeIds = itemIds.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0);

  if (!requesterName) {
    res.status(400).json({ message: 'requesterName이 필요합니다.' });
    return;
  }
  if (safeIds.length === 0) {
    res.status(400).json({ message: '삭제할 알림 ID가 필요합니다.' });
    return;
  }

  try {
    await ensureMailboxesTable();
    const placeholders = safeIds.map(() => '?').join(', ');
    const [result] = await pool.query(
      `DELETE FROM user_mailboxes
       WHERE recipient_name = ?
         AND id IN (${placeholders})`,
      [requesterName, ...safeIds]
    );
    res.json({ ok: true, deletedCount: Number(result?.affectedRows || 0) });
  } catch (error) {
    res.status(500).json({ message: '알림 삭제에 실패했습니다.', error: error.message });
  }
});

app.listen(port, () => {
  console.log(`API server listening on port ${port}`);
});
