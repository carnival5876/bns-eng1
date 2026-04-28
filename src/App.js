import React, { useEffect, useMemo, useState } from 'react';
import SpecList from './components/SpecList';
import AddSpecPopup from './components/AddSpecPopup';
import './styles.css';

const API_BASE = process.env.REACT_APP_API_BASE_URL
    || `${window.location.protocol}//${window.location.hostname}:4000/api`;
const JSON_HEADERS = {
    'Content-Type': 'application/json'
};
const createInitialSpecFilters = () => ([
    { title: '', query: '' },
    { title: '', query: '' },
    { title: '', query: '' }
]);
const EXCLUDED_FILTER_TITLES = new Set(['조절기 이미지', '제어기 이미지', '펌웨어 파일', '비고']);
const COMPANY_LOGO_LIGHT_URL = '/company-logo.png';
const COMPANY_LOGO_DARK_URL = '/company-logo-dark.png';

function App() {
    const [isAuthenticated, setIsAuthenticated] = useState(() => localStorage.getItem('bns-auth') === 'true');
    const [currentUser, setCurrentUser] = useState(() => {
        const raw = localStorage.getItem('bns-user');
        if (!raw) {
            return null;
        }

        try {
            return JSON.parse(raw);
        } catch (error) {
            return null;
        }
    });
    const [authMode, setAuthMode] = useState('login');
    const [loginForm, setLoginForm] = useState({ name: '', password: '' });
    const [signupForm, setSignupForm] = useState({ name: '', phoneNumber: '', password: '', confirmPassword: '' });
    const [loginError, setLoginError] = useState('');
    const [signupError, setSignupError] = useState('');
    const [signupSuccess, setSignupSuccess] = useState('');
    const [isLoggingIn, setIsLoggingIn] = useState(false);
    const [isSigningUp, setIsSigningUp] = useState(false);
    const [activeFormType, setActiveFormType] = useState(null);
    const [activePage, setActivePage] = useState('list');
    const [models, setModels] = useState([]);
    const [loadError, setLoadError] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [specFilters, setSpecFilters] = useState(createInitialSpecFilters);
    const [listTypeFilters, setListTypeFilters] = useState({
        adjuster: true,
        controller: true,
    });
    const [permissionUsers, setPermissionUsers] = useState([]);
    const [initialPermissionUsers, setInitialPermissionUsers] = useState([]);
    const [permissionError, setPermissionError] = useState('');
    const [isPermissionLoading, setIsPermissionLoading] = useState(false);
    const [isSavingPermissions, setIsSavingPermissions] = useState(false);
    const [pendingReviewProducts, setPendingReviewProducts] = useState([]);
    const [isPendingReviewLoading, setIsPendingReviewLoading] = useState(false);
    const [pendingReviewError, setPendingReviewError] = useState('');
    const [rejectTargetId, setRejectTargetId] = useState(null);
    const [rejectReason, setRejectReason] = useState('');
    const [isRejecting, setIsRejecting] = useState(false);
    const [mailboxItems, setMailboxItems] = useState([]);
    const [mailboxUnreadCount, setMailboxUnreadCount] = useState(0);
    const [isMailboxLoading, setIsMailboxLoading] = useState(false);
    const [mailboxError, setMailboxError] = useState('');
    const [selectedMailboxIds, setSelectedMailboxIds] = useState([]);
    const [isDeletingMailboxItems, setIsDeletingMailboxItems] = useState(false);
    const [retryEditRequest, setRetryEditRequest] = useState(null);
    const [logs, setLogs] = useState([]);
    const [logError, setLogError] = useState('');
    const [isLogLoading, setIsLogLoading] = useState(false);
    const [logFilters, setLogFilters] = useState({ time: '', name: '', target: '', description: '' });
    const [logPage, setLogPage] = useState(1);
    const LOG_PAGE_SIZE = 100;
    const [darkMode, setDarkMode] = useState(() => localStorage.getItem('bns-dark-mode') === 'true');
    const [appToastMessage, setAppToastMessage] = useState('');
    const [appToastVisible, setAppToastVisible] = useState(false);
    const [appToastType, setAppToastType] = useState('success');

    const toggleDarkMode = (checked) => {
        setDarkMode(checked);
        localStorage.setItem('bns-dark-mode', String(checked));
        if (checked) {
            document.body.classList.add('dark-mode');
        } else {
            document.body.classList.remove('dark-mode');
        }
    };

    useEffect(() => {
        if (darkMode) {
            document.body.classList.add('dark-mode');
        } else {
            document.body.classList.remove('dark-mode');
        }
    }, [darkMode]);

    const canReviewList = !!currentUser?.permissions?.canReviewList;
    const canEditProduct = !!currentUser?.permissions?.canEditProduct;
    const canViewDetail = !!currentUser?.permissions?.canViewDetail;
    const canDownloadFirmware = !!currentUser?.permissions?.canDownloadFirmware;
    const canManagePermissions = !!currentUser?.permissions?.canManagePermissions;
    const canViewLogs = !!currentUser?.permissions?.canViewLogs || canManagePermissions;
    const showAppToast = (message, type = 'success') => {
        setAppToastType(type);
        setAppToastMessage(message);
        setAppToastVisible(true);
        window.setTimeout(() => {
            setAppToastVisible(false);
            window.setTimeout(() => setAppToastMessage(''), 250);
        }, 1600);
    };


    const loadProducts = async () => {
        try {
            setLoadError('');
            const response = await fetch(`${API_BASE}/products`);

            if (!response.ok) {
                throw new Error('제품 목록을 불러오지 못했습니다.');
            }

            const data = await response.json();
            setModels(Array.isArray(data) ? data : []);
        } catch (error) {
            setLoadError('DB 연결 또는 목록 조회에 실패했습니다.');
        }
    };

    useEffect(() => {
        if (isAuthenticated) {
            loadProducts();
        }
    }, [isAuthenticated]);

    useEffect(() => {
        if (isAuthenticated) {
            loadProducts();
        }
    }, [isAuthenticated, activePage]);

    const handleLogin = async (e) => {
        e.preventDefault();
        setLoginError('');
        setSignupSuccess('');
        setIsLoggingIn(true);

        try {
            const response = await fetch(`${API_BASE}/login`, {
                method: 'POST',
                headers: JSON_HEADERS,
                body: JSON.stringify(loginForm)
            });

            if (!response.ok) {
                throw new Error('로그인 실패');
            }

            const data = await response.json();
            const loggedInUser = data?.user || null;

            setIsAuthenticated(true);
            localStorage.setItem('bns-auth', 'true');
            setCurrentUser(loggedInUser);
            localStorage.setItem('bns-user', JSON.stringify(loggedInUser));
            setLoginForm({ name: '', password: '' });
        } catch (error) {
            setLoginError('아이디 또는 비밀번호를 확인해주세요.');
        } finally {
            setIsLoggingIn(false);
        }
    };

    const handleSignup = async (e) => {
        e.preventDefault();
        setSignupError('');
        setSignupSuccess('');

        if (!signupForm.name.trim() || !signupForm.phoneNumber.trim() || !signupForm.password.trim()) {
            setSignupError('이름, 전화번호, 비밀번호를 입력해주세요.');
            return;
        }

        if (signupForm.password !== signupForm.confirmPassword) {
            setSignupError('비밀번호 확인이 일치하지 않습니다.');
            return;
        }

        setIsSigningUp(true);
        try {
            const response = await fetch(`${API_BASE}/signup`, {
                method: 'POST',
                headers: JSON_HEADERS,
                body: JSON.stringify({
                    name: signupForm.name,
                    phoneNumber: signupForm.phoneNumber,
                    password: signupForm.password
                })
            });

            if (!response.ok) {
                throw new Error('회원가입 실패');
            }

            setSignupForm({ name: '', phoneNumber: '', password: '', confirmPassword: '' });
            setSignupSuccess('회원가입이 완료되었습니다. 로그인 해주세요.');
            setAuthMode('login');
        } catch (error) {
            setSignupError('이미 사용 중인 아이디이거나 가입에 실패했습니다.');
        } finally {
            setIsSigningUp(false);
        }
    };

    const handleLogout = async () => {
        if (currentUser?.name) {
            try {
                await fetch(`${API_BASE}/logs/event`, {
                    method: 'POST',
                    headers: JSON_HEADERS,
                    body: JSON.stringify({
                        requesterName: currentUser.name,
                        actionType: 'logout',
                        targetType: 'auth',
                        description: '로그아웃',
                    })
                });
            } catch (error) {
                // Ignore logging failure on logout.
            }
        }

        setIsAuthenticated(false);
        setCurrentUser(null);
        setActiveFormType(null);
        setActivePage('list');
        setSearchQuery('');
        setSpecFilters(createInitialSpecFilters());
        setListTypeFilters({ adjuster: true, controller: true });
        localStorage.removeItem('bns-auth');
        localStorage.removeItem('bns-user');
    };

    const openAddPage = (type) => {
        if (!canEditProduct) {
            setLoadError('제품 등록 권한이 없습니다. 관리자에게 문의해주세요.');
            return;
        }

        setActiveFormType(type);
    };

    const closeAddPage = () => {
        setActiveFormType(null);
    };

    const handleAddModel = async (model, type) => {
        try {
            const response = await fetch(`${API_BASE}/products`, {
                method: 'POST',
                headers: JSON_HEADERS,
                body: JSON.stringify({
                    siteName: model.siteName,
                    productName: model.name,
                    type,
                    specs: model.specs,
                    actorName: currentUser?.name || null,
                })
            });

            if (!response.ok) {
                throw new Error('저장에 실패했습니다.');
            }

            await loadProducts();
            closeAddPage();
            return true;
        } catch (error) {
            return false;
        }
    };

    const loadPermissionUsers = async () => {
        if (!canManagePermissions || !currentUser?.name) {
            return;
        }

        setPermissionError('');
        setIsPermissionLoading(true);

        try {
            const response = await fetch(`${API_BASE}/users?requesterName=${encodeURIComponent(currentUser.name)}`);
            if (!response.ok) {
                throw new Error('권한 사용자 목록 조회 실패');
            }

            const data = await response.json();
            const users = Array.isArray(data) ? data : [];
            setPermissionUsers(users);
            setInitialPermissionUsers(users);
        } catch (error) {
            setPermissionError('권한 사용자 목록을 불러오지 못했습니다.');
        } finally {
            setIsPermissionLoading(false);
        }
    };

    const loadPendingReviewProducts = async () => {
        if (!canReviewList || !currentUser?.name) {
            return;
        }

        setPendingReviewError('');
        setIsPendingReviewLoading(true);
        try {
            const response = await fetch(`${API_BASE}/review/pending-products?requesterName=${encodeURIComponent(currentUser.name)}`);
            if (!response.ok) {
                throw new Error('승인 대기 목록 조회 실패');
            }
            const data = await response.json();
            setPendingReviewProducts(Array.isArray(data) ? data : []);
        } catch (error) {
            setPendingReviewError('승인 대기 목록을 불러오지 못했습니다.');
        } finally {
            setIsPendingReviewLoading(false);
        }
    };

    const loadMailboxUnreadCount = async () => {
        if (!currentUser?.name) {
            return;
        }
        try {
            const response = await fetch(`${API_BASE}/mailbox/unread-count?requesterName=${encodeURIComponent(currentUser.name)}`);
            if (!response.ok) {
                throw new Error('읽지 않은 우편 조회 실패');
            }
            const data = await response.json();
            setMailboxUnreadCount(Number(data?.unreadCount || 0));
        } catch (error) {
            // Ignore badge load failure to avoid blocking UI.
        }
    };

    const loadMailboxItems = async () => {
        if (!currentUser?.name) {
            return;
        }
        setMailboxError('');
        setIsMailboxLoading(true);
        try {
            const response = await fetch(`${API_BASE}/mailbox?requesterName=${encodeURIComponent(currentUser.name)}`);
            if (!response.ok) {
                throw new Error('우편함 조회 실패');
            }
            const data = await response.json();
            setMailboxItems(Array.isArray(data) ? data : []);
            setSelectedMailboxIds([]);
        } catch (error) {
            setMailboxError('우편함을 불러오지 못했습니다.');
        } finally {
            setIsMailboxLoading(false);
        }
    };

    const markAllMailboxAsRead = async () => {
        if (!currentUser?.name) {
            return;
        }
        try {
            await fetch(`${API_BASE}/mailbox/read-all`, {
                method: 'PUT',
                headers: JSON_HEADERS,
                body: JSON.stringify({ requesterName: currentUser.name }),
            });
            setMailboxUnreadCount(0);
            setMailboxItems((prev) => prev.map((item) => ({ ...item, isRead: true })));
        } catch (error) {
            // ignore
        }
    };

    const toggleMailboxItemSelection = (itemId, checked) => {
        setSelectedMailboxIds((prev) => {
            if (checked) {
                return prev.includes(itemId) ? prev : [...prev, itemId];
            }
            return prev.filter((id) => id !== itemId);
        });
    };

    const handleDeleteSelectedMailboxItems = async () => {
        if (!currentUser?.name || selectedMailboxIds.length === 0) {
            window.alert('삭제할 알림을 선택해주세요.');
            return;
        }
        const ok = window.confirm(`선택한 알림 ${selectedMailboxIds.length}개를 삭제하시겠습니까?`);
        if (!ok) {
            return;
        }
        setIsDeletingMailboxItems(true);
        setMailboxError('');
        try {
            const response = await fetch(`${API_BASE}/mailbox/delete-selected`, {
                method: 'POST',
                headers: JSON_HEADERS,
                body: JSON.stringify({
                    requesterName: currentUser.name,
                    itemIds: selectedMailboxIds,
                }),
            });
            if (!response.ok) {
                throw new Error('알림 삭제 실패');
            }
            await Promise.all([loadMailboxItems(), loadMailboxUnreadCount()]);
        } catch (error) {
            setMailboxError('선택한 알림 삭제에 실패했습니다.');
        } finally {
            setIsDeletingMailboxItems(false);
        }
    };

    const handleMailboxRetryEdit = (item) => {
        if (!canEditProduct) {
            window.alert('리스트 수정 권한이 없습니다. 관리자에게 문의해주세요.');
            return;
        }

        const content = String(item?.content || '');
        const siteMatch = content.match(/현장명\s*:\s*([^/]+)/);
        const modelMatch = content.match(/모델명\s*:\s*([^/]+)/);
        const typeMatch = content.match(/타입\s*:\s*(조절기|제어기)/);
        const idMatch = content.match(/리스트ID\s*:\s*(\d+)/);
        const type = typeMatch?.[1] === '제어기' ? 'controller' : typeMatch?.[1] === '조절기' ? 'adjuster' : '';
        setActivePage('list');
        if (type === 'adjuster') {
            setListTypeFilters({ adjuster: true, controller: false });
        } else if (type === 'controller') {
            setListTypeFilters({ adjuster: false, controller: true });
        } else {
            setListTypeFilters({ adjuster: true, controller: true });
        }
        setRetryEditRequest({
            key: Date.now(),
            id: idMatch ? Number(idMatch[1]) : null,
            siteName: String(siteMatch?.[1] || '').trim(),
            productName: String(modelMatch?.[1] || '').trim(),
            type,
        });
    };

    const updateUserPermission = (userId, key, checked) => {
        const target = permissionUsers.find((user) => user.id === userId);
        if (!target) {
            return;
        }

        const nextPermissions = {
            ...target.permissions,
            [key]: checked,
        };

        setPermissionUsers((prev) => prev.map((user) => (
            user.id === userId ? { ...user, permissions: nextPermissions } : user
        )));
        setPermissionError('');
    };

    const saveUserPermissions = async (userId, permissions) => {
        const response = await fetch(`${API_BASE}/users/${userId}/permissions`, {
            method: 'PUT',
            headers: JSON_HEADERS,
            body: JSON.stringify({
                requesterName: currentUser.name,
                permissions
            })
        });
        if (!response.ok) {
            throw new Error('권한 저장 실패');
        }
    };

    const handleSavePermissions = async () => {
        if (!currentUser?.name) {
            return;
        }
        const toKey = (permissions = {}) => JSON.stringify({
            canRegisterProduct: !!permissions.canRegisterProduct,
            canReviewList: !!permissions.canReviewList,
            canEditProduct: !!permissions.canEditProduct,
            canViewDetail: !!permissions.canViewDetail,
            canDownloadFirmware: !!permissions.canDownloadFirmware,
            canManagePermissions: !!permissions.canManagePermissions,
            canViewLogs: !!permissions.canViewLogs,
        });

        const baseMap = new Map(initialPermissionUsers.map((u) => [u.id, toKey(u.permissions)]));
        const changedUsers = permissionUsers.filter((u) => baseMap.get(u.id) !== toKey(u.permissions));

        if (changedUsers.length === 0) {
            window.alert('변경된 권한이 없습니다.');
            setPermissionError('');
            return;
        }

        setIsSavingPermissions(true);
        setPermissionError('');
        try {
            await Promise.all(changedUsers.map((user) => saveUserPermissions(user.id, user.permissions)));
            setInitialPermissionUsers(permissionUsers);
            const currentUserUpdated = changedUsers.find((user) => user.id === currentUser?.id);
            if (currentUserUpdated) {
                const nextCurrentUser = {
                    ...currentUser,
                    permissions: { ...currentUserUpdated.permissions },
                };
                setCurrentUser(nextCurrentUser);
                localStorage.setItem('bns-user', JSON.stringify(nextCurrentUser));
            }
            window.alert('권한이 저장되었습니다.');
        } catch (error) {
            setPermissionError('권한 저장에 실패했습니다. 잠시 후 다시 시도해주세요.');
        } finally {
            setIsSavingPermissions(false);
        }
    };

    const handleUpdateModel = async (model) => {
        try {
            const response = await fetch(`${API_BASE}/products/${model.id}`, {
                method: 'PUT',
                headers: JSON_HEADERS,
                body: JSON.stringify({
                    siteName: model.siteName,
                    productName: model.name,
                    type: model.type,
                    specs: model.specs,
                    actorName: currentUser?.name || null,
                })
            });

            if (!response.ok) {
                throw new Error('수정에 실패했습니다.');
            }

            await loadProducts();
            return true;
        } catch (error) {
            setLoadError('수정 저장에 실패했습니다. 잠시 후 다시 시도해주세요.');
            return false;
        }
    };

    const handleDeleteModel = async (modelId) => {
        try {
            const response = await fetch(`${API_BASE}/products/${modelId}?actorName=${encodeURIComponent(currentUser?.name || '')}`, {
                method: 'DELETE'
            });

            if (!response.ok) {
                throw new Error('삭제에 실패했습니다.');
            }

            await loadProducts();
            return true;
        } catch (error) {
            setLoadError('삭제 요청에 실패했습니다. 잠시 후 다시 시도해주세요.');
            return false;
        }
    };

    const handleApproveProduct = async (productId) => {
        if (!currentUser?.name) {
            return;
        }

        try {
            const response = await fetch(`${API_BASE}/review/products/${productId}/approve`, {
                method: 'PUT',
                headers: JSON_HEADERS,
                body: JSON.stringify({ requesterName: currentUser.name }),
            });
            if (!response.ok) {
                throw new Error('승인 실패');
            }

            await Promise.all([loadProducts(), loadPendingReviewProducts(), loadMailboxUnreadCount()]);
            showAppToast('승인 완료되었습니다.', 'success');
        } catch (error) {
            setPendingReviewError('승인 처리에 실패했습니다. 잠시 후 다시 시도해주세요.');
        }
    };

    const requestRejectProduct = (productId) => {
        setRejectTargetId(productId);
        setRejectReason('');
        setPendingReviewError('');
    };

    const closeRejectModal = () => {
        setRejectTargetId(null);
        setRejectReason('');
        setIsRejecting(false);
    };

    const handleRejectProduct = async () => {
        if (!rejectTargetId || !currentUser?.name || !rejectReason.trim()) {
            return;
        }
        setIsRejecting(true);
        try {
            const response = await fetch(`${API_BASE}/review/products/${rejectTargetId}/reject`, {
                method: 'PUT',
                headers: JSON_HEADERS,
                body: JSON.stringify({
                    requesterName: currentUser.name,
                    reason: rejectReason.trim(),
                }),
            });
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData?.message || '승인 거부 실패');
            }
            closeRejectModal();
            await Promise.all([loadProducts(), loadPendingReviewProducts(), loadMailboxUnreadCount()]);
        } catch (error) {
            setPendingReviewError(error.message || '승인 거부 처리에 실패했습니다. 잠시 후 다시 시도해주세요.');
            setIsRejecting(false);
        }
    };

    const loadLogs = async () => {
        if (!canViewLogs || !currentUser?.name) {
            return;
        }

        setLogError('');
        setIsLogLoading(true);

        try {
            const response = await fetch(`${API_BASE}/logs?requesterName=${encodeURIComponent(currentUser.name)}&limit=200`);
            if (!response.ok) {
                throw new Error('로그 조회 실패');
            }

            const data = await response.json();
            setLogs(Array.isArray(data) ? data : []);
        } catch (error) {
            setLogError('로그를 불러오지 못했습니다.');
        } finally {
            setIsLogLoading(false);
        }
    };

    const refreshCurrentPage = async () => {
        setLoadError('');
        setPendingReviewError('');
        setMailboxError('');
        setPermissionError('');
        setLogError('');

        if (activePage === 'list') {
            await loadProducts();
            return;
        }
        if (activePage === 'review' && canReviewList) {
            await Promise.all([loadPendingReviewProducts(), loadProducts()]);
            return;
        }
        if (activePage === 'message') {
            await Promise.all([loadMailboxItems(), loadMailboxUnreadCount()]);
            return;
        }
        if (activePage === 'permissions' && canManagePermissions) {
            await loadPermissionUsers();
            return;
        }
        if (activePage === 'logs' && canViewLogs) {
            await loadLogs();
            return;
        }

        // Fallback refresh for other pages.
        await loadProducts();
    };

    const updateSpecFilter = (index, field, value) => {
        setSpecFilters((prev) => prev.map((filter, filterIndex) => (
            filterIndex === index ? { ...filter, [field]: value } : filter
        )));
    };

    const toggleListTypeFilter = (type) => {
        setListTypeFilters((prev) => {
            const bothSelected = prev.adjuster && prev.controller;

            if (bothSelected) {
                return type === 'adjuster'
                    ? { adjuster: true, controller: false }
                    : { adjuster: false, controller: true };
            }

            if (type === 'adjuster') {
                return prev.adjuster
                    ? { adjuster: true, controller: true }
                    : { adjuster: true, controller: false };
            }

            return prev.controller
                ? { adjuster: true, controller: true }
                : { adjuster: false, controller: true };
        });
    };

    const specTitleOptions = useMemo(() => [
        '현장명',
        '모델명',
        ...Array.from(new Set(
            models
                .flatMap((model) => (model.specs || []).map((spec) => spec.title))
                .filter((title) => title && !EXCLUDED_FILTER_TITLES.has(title))
        ))
    ], [models]);

    const filteredModels = useMemo(() => {
        const normalizedQuery = searchQuery.trim().toLowerCase();
        if (!normalizedQuery) {
            return models;
        }

        return models.filter((model) => {
            const target = [
                model.siteName,
                model.name,
                model.type === 'adjuster' ? '조절기' : '제어기',
                ...(model.specs || []).map((spec) => spec.details)
            ]
                .filter(Boolean)
                .join(' ')
                .toLowerCase();

            return target.includes(normalizedQuery);
        });
    }, [models, searchQuery]);

    const specFilteredModels = useMemo(() => filteredModels.filter((model) => (
        specFilters.every((filter) => {
            const title = filter.title.trim();
            const query = filter.query.trim().toLowerCase();

            if (!title || !query) {
                return true;
            }

            if (title === '현장명') {
                return String(model.siteName || '').toLowerCase().includes(query);
            }

            if (title === '모델명') {
                return String(model.name || '').toLowerCase().includes(query);
            }

            const matchedSpec = (model.specs || []).find((spec) => spec.title === title);
            return matchedSpec ? String(matchedSpec.details || '').toLowerCase().includes(query) : false;
        })
    )), [filteredModels, specFilters]);

    const typeFilteredModels = useMemo(() => (
        specFilteredModels.filter((model) => listTypeFilters[model.type] !== false)
    ), [specFilteredModels, listTypeFilters]);

    const formatLogTarget = (log) => {
        if (!log) {
            return '-';
        }

        const actionTargetMap = {
            login: '로그인',
            logout: '로그아웃',
            login_failed: '로그인 실패',
            signup: '회원가입',
            signup_failed: '회원가입 실패',
            list_detail_view: '세부사항 열람',
            list_page_move: '리스트 페이지 이동',
            product_create: '제품 등록',
            product_update: '제품 수정',
            product_delete_request: '제품 삭제 요청',
            product_delete_approve: '제품 삭제 승인',
            product_approve: '리스트 승인',
            product_reject: '리스트 승인 거부',
            permission_update: '권한 변경',
        };

        if (actionTargetMap[log.actionType]) {
            return actionTargetMap[log.actionType];
        }
        if (!log.targetType) {
            return '-';
        }
        return `${log.targetType}${log.targetId ? `#${log.targetId}` : ''}`;
    };

    const permissionKeyLabels = {
        canManagePermissions: '권한 관리 권한',
        canReviewList: '검토 권한',
        canViewLogs: '로그 관리 권한',
        canEditProduct: '리스트 수정 권한',
        canViewDetail: '세부사항 열람 권한',
        canDownloadFirmware: '펌웨어 다운로드 권한',
        canRegisterProduct: '제품 등록 권한',
    };

    const formatLogDescription = (log) => {
        const siteName = log?.metadata?.siteName || '';
        const productName = log?.metadata?.productName || '';
        const hasProductMeta = !!siteName || !!productName;
        const toProductSummary = () => `현장명:${siteName || '-'} 모델명:${productName || '-'}`;
        const forceProductSummaryActions = new Set([
            'product_approve',
            'product_reject',
            'product_delete_request',
            'product_delete_approve',
        ]);

        if (forceProductSummaryActions.has(log?.actionType)) {
            return toProductSummary();
        }

        if (['list_detail_view', 'product_create', 'product_update', 'product_delete_request', 'product_delete_approve', 'product_approve', 'product_reject'].includes(log?.actionType) && hasProductMeta) {
            return toProductSummary();
        }

        if (log?.actionType === 'permission_update') {
            const targetUserName = String(log?.metadata?.targetUserName || '').trim();
            const changedKeys = Array.isArray(log?.metadata?.changedPermissionKeys)
                ? log.metadata.changedPermissionKeys
                : [];

            if (changedKeys.length > 0) {
                const changedLabel = changedKeys.map((key) => permissionKeyLabels[key] || key).join(', ');
                return `${targetUserName || '-'}: ${changedLabel}`;
            }
        }

        return log?.description || '-';
    };

    const formatLogUser = (log) => {
        if (!log?.userName) {
            return '-';
        }

        return `${log.userName}(${log.userPhoneNumber || '-'})`;
    };

    const formatKoreanDateTime = (value) => {
        if (!value) {
            return '-';
        }
        const raw = String(value).trim();
        const date = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(raw)
            ? new Date(raw.replace(' ', 'T'))
            : new Date(raw);

        if (Number.isNaN(date.getTime())) {
            return raw;
        }

        const plusNineHours = new Date(date.getTime() + (9 * 60 * 60 * 1000));
        return new Intl.DateTimeFormat('ko-KR', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false,
        }).format(plusNineHours);
    };

    useEffect(() => {
        if (isAuthenticated && canManagePermissions && activePage === 'permissions') {
            loadPermissionUsers();
        }
    }, [isAuthenticated, canManagePermissions, activePage]);

    useEffect(() => {
        if (isAuthenticated && canViewLogs && activePage === 'logs') {
            loadLogs();
        }
    }, [isAuthenticated, canViewLogs, activePage]);

    useEffect(() => {
        if (isAuthenticated && canReviewList && activePage === 'review') {
            loadPendingReviewProducts();
        }
    }, [isAuthenticated, canReviewList, activePage]);

    useEffect(() => {
        if (isAuthenticated && currentUser?.name) {
            loadMailboxUnreadCount();
        }
    }, [isAuthenticated, currentUser?.name]);

    useEffect(() => {
        if (isAuthenticated && activePage === 'message') {
            loadMailboxItems();
            markAllMailboxAsRead();
        }
    }, [isAuthenticated, activePage]);

    if (!isAuthenticated) {
        return (
            <div className="login-page">
                {authMode === 'login' ? (
                    <form className="login-card" onSubmit={handleLogin}>
                        <h2>로그인</h2>
                        <input
                            className="login-input"
                            type="text"
                            placeholder="이름"
                            value={loginForm.name}
                            onChange={(e) => setLoginForm((prev) => ({ ...prev, name: e.target.value }))}
                        />
                        <input
                            className="login-input"
                            type="password"
                            placeholder="비밀번호"
                            value={loginForm.password}
                            onChange={(e) => setLoginForm((prev) => ({ ...prev, password: e.target.value }))}
                        />
                        {loginError && <div className="login-error">{loginError}</div>}
                        {signupSuccess && <div className="login-success">{signupSuccess}</div>}
                        <button type="submit" className="button login-button" disabled={isLoggingIn}>
                            {isLoggingIn ? '로그인 중...' : '로그인'}
                        </button>
                        <div className="auth-link-row">
                            <span className="auth-help-text">비밀번호 분실시 관리자에게 문의바랍니다</span>
                            <button type="button" className="auth-link-button" onClick={() => setAuthMode('signup')}>회원가입</button>
                        </div>
                    </form>
                ) : (
                    <form className="login-card" onSubmit={handleSignup}>
                        <h2>회원가입</h2>
                        <input
                            className="login-input"
                            type="text"
                            placeholder="이름"
                            value={signupForm.name}
                            onChange={(e) => setSignupForm((prev) => ({ ...prev, name: e.target.value }))}
                        />
                        <input
                            className="login-input"
                            type="text"
                            placeholder="전화번호"
                            value={signupForm.phoneNumber}
                            onChange={(e) => setSignupForm((prev) => ({ ...prev, phoneNumber: e.target.value }))}
                        />
                        <input
                            className="login-input"
                            type="password"
                            placeholder="비밀번호"
                            value={signupForm.password}
                            onChange={(e) => setSignupForm((prev) => ({ ...prev, password: e.target.value }))}
                        />
                        <input
                            className="login-input"
                            type="password"
                            placeholder="비밀번호 확인"
                            value={signupForm.confirmPassword}
                            onChange={(e) => setSignupForm((prev) => ({ ...prev, confirmPassword: e.target.value }))}
                        />
                        {signupError && <div className="login-error">{signupError}</div>}
                        <button type="submit" className="button login-button" disabled={isSigningUp}>
                            {isSigningUp ? '가입 중...' : '회원가입'}
                        </button>
                        <div className="auth-link-row">
                            <button type="button" className="auth-link-button" onClick={() => setAuthMode('login')}>로그인으로 돌아가기</button>
                        </div>
                    </form>
                )}
            </div>
        );
    }

    return (
        <div className={`App${darkMode ? ' dark-mode' : ''}`}>
            <div className="app-topbar">
                <h1>Boiler Specification Management</h1>
                <button className="button top-refresh-button" onClick={refreshCurrentPage}>새로고침</button>
            </div>
            {!activeFormType && (
                <div className="workspace-layout">
                    <aside className="sidebar">
                        {currentUser?.name && (
                            <div className="sidebar-greeting">안녕하세요 {currentUser.name}님</div>
                        )}
                        <h3>메뉴</h3>
                        <button className={`sidebar-menu-button ${activePage === 'list' ? 'active' : ''}`} onClick={() => setActivePage('list')}>리스트</button>
                        <button className={`sidebar-menu-button ${activePage === 'message' ? 'active' : ''}`} onClick={() => setActivePage('message')}>
                            알림
                            {mailboxUnreadCount > 0 && <span className="sidebar-mail-unread-dot" />}
                        </button>
                        {canReviewList && (
                            <button className={`sidebar-menu-button ${activePage === 'review' ? 'active' : ''}`} onClick={() => setActivePage('review')}>리스트 승인 관리</button>
                        )}
                        <button className={`sidebar-menu-button ${activePage === 'settings' ? 'active' : ''}`} onClick={() => setActivePage('settings')}>설정</button>
                        {canViewLogs && (
                            <button className={`sidebar-menu-button ${activePage === 'logs' ? 'active' : ''}`} onClick={() => setActivePage('logs')}>로그 관리</button>
                        )}
                        {canManagePermissions && (
                            <button className={`sidebar-menu-button ${activePage === 'permissions' ? 'active' : ''}`} onClick={() => setActivePage('permissions')}>권한 관리</button>
                        )}
                        <button className="sidebar-menu-button sidebar-logout-button" onClick={handleLogout}>로그아웃</button>
                    </aside>

                    <section className="page-content">
                        {activePage === 'list' && (
                            <>
                                <div className="list-logo-wrap">
                                    <img
                                        className="list-company-logo"
                                        src={darkMode ? COMPANY_LOGO_DARK_URL : COMPANY_LOGO_LIGHT_URL}
                                        alt="B&S Engineering"
                                    />
                                </div>
                                <div className="search-bar-wrap">
                                    <div className="search-filters-left">
                                        {specFilters.map((filter, index) => (
                                            <div key={index} className="spec-filter-group">
                                                <select
                                                    className="spec-filter-select"
                                                    value={filter.title}
                                                    onChange={(e) => updateSpecFilter(index, 'title', e.target.value)}
                                                >
                                                    <option value="">사양 선택</option>
                                                    {specTitleOptions.map((title) => (
                                                        <option key={title} value={title}>{title}</option>
                                                    ))}
                                                </select>
                                                <input
                                                    className="spec-filter-input"
                                                    type="text"
                                                    value={filter.query}
                                                    onChange={(e) => updateSpecFilter(index, 'query', e.target.value)}
                                                    placeholder="사양 값 검색"
                                                />
                                            </div>
                                        ))}
                                    </div>
                                    <div className="search-main-right">
                                        <input
                                            className="search-input"
                                            type="text"
                                            value={searchQuery}
                                            onChange={(e) => setSearchQuery(e.target.value)}
                                            placeholder="현장명, 제품명, 타입, 사양 값 검색"
                                        />
                                    </div>
                                </div>

                                <div className="top-buttons">
                                    {canEditProduct && (
                                        <button className="button" onClick={() => openAddPage('adjuster')}>제품 등록</button>
                                    )}
                                </div>

                                {loadError && (
                                    <div className="error-box">{loadError}</div>
                                )}

                                <SpecList
                                    models={typeFilteredModels}
                                    onUpdateModel={handleUpdateModel}
                                    onDeleteModel={handleDeleteModel}
                                    canEditProduct={canEditProduct}
                                    canViewDetail={canViewDetail}
                                    canDownloadFirmware={canDownloadFirmware}
                                    showTypeFilter
                                    typeFilters={listTypeFilters}
                                    onToggleTypeFilter={toggleListTypeFilter}
                                    editRequest={retryEditRequest}
                                    onEditRequestHandled={(key) => {
                                        setRetryEditRequest((prev) => (prev?.key === key ? null : prev));
                                    }}
                                    currentUserName={currentUser?.name || ''}
                                />
                            </>
                        )}

                        {activePage === 'review' && canReviewList && (
                            <div className="placeholder-page">
                                <h3>리스트 승인 관리</h3>
                                {pendingReviewError && <div className="error-box">{pendingReviewError}</div>}
                                {isPendingReviewLoading ? (
                                    <p>불러오는 중...</p>
                                ) : pendingReviewProducts.length === 0 ? (
                                    <p>승인 대기 중인 리스트가 없습니다.</p>
                                ) : (
                                    <SpecList
                                        models={pendingReviewProducts}
                                        onApproveModel={handleApproveProduct}
                                        onRejectModel={requestRejectProduct}
                                        canEditProduct={false}
                                        canViewDetail={canViewDetail}
                                        canDownloadFirmware={canDownloadFirmware}
                                        currentUserName={currentUser?.name || ''}
                                        allowPendingExpand
                                        showReviewMeta
                                    />
                                )}
                            </div>
                        )}

                        {activePage === 'message' && (
                            <div className="placeholder-page mailbox-page">
                                <div className="mailbox-page-header">
                                    <h3>알림</h3>
                                    <button className="button button-cancel" onClick={handleDeleteSelectedMailboxItems} disabled={isDeletingMailboxItems}>
                                        {isDeletingMailboxItems ? '삭제중...' : '삭제'}
                                    </button>
                                </div>
                                {mailboxError && <div className="error-box">{mailboxError}</div>}
                                {isMailboxLoading ? (
                                    <p>불러오는 중...</p>
                                ) : mailboxItems.length === 0 ? (
                                    <p>알림이 없습니다.</p>
                                ) : (
                                    <div className="mailbox-list">
                                        {mailboxItems.map((item) => (
                                            <div key={item.id} className={`mailbox-item${item.isRead ? '' : ' unread'}`}>
                                                <div className="mailbox-item-head">
                                                    <div className="mailbox-item-title">{item.title}</div>
                                                    <div className="mailbox-item-actions">
                                                        {item.title === '리스트 승인 거부' ? (
                                                            <button className="button model-edit-button" onClick={() => handleMailboxRetryEdit(item)}>
                                                                재수정
                                                            </button>
                                                        ) : (
                                                            <input
                                                                type="checkbox"
                                                                checked={selectedMailboxIds.includes(item.id)}
                                                                onChange={(e) => toggleMailboxItemSelection(item.id, e.target.checked)}
                                                            />
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="mailbox-item-content">{item.content}</div>
                                                <div className="mailbox-item-time">{new Date(item.createdAt).toLocaleString()}</div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}


                        {activePage === 'settings' && (
                            <div className="placeholder-page settings-page">
                                <h3>설정</h3>
                                <div className="settings-row">
                                    <label className="settings-label" htmlFor="dark-mode-toggle">다크 모드</label>
                                    <input
                                        id="dark-mode-toggle"
                                        type="checkbox"
                                        className="settings-checkbox"
                                        checked={darkMode}
                                        onChange={(e) => toggleDarkMode(e.target.checked)}
                                    />
                                </div>
                            </div>
                        )}

                        {activePage === 'permissions' && canManagePermissions && (
                            <div className="placeholder-page permission-page">
                                <h3>권한 관리</h3>
                                {permissionError && <div className="error-box">{permissionError}</div>}
                                {isPermissionLoading ? (
                                    <p>불러오는 중...</p>
                                ) : (
                                    <>
                                        <div className="top-buttons" style={{ width: '100%', margin: '0 0 12px 0' }}>
                                            <button className="button" onClick={handleSavePermissions} disabled={isSavingPermissions}>
                                                {isSavingPermissions ? '저장중...' : '저장'}
                                            </button>
                                        </div>
                                        <div className="permission-table-wrap">
                                            <table className="permission-table">
                                                <thead>
                                                    <tr>
                                                        <th>이름</th>
                                                        <th>전화번호</th>
                                                        <th>권한 관리</th>
                                                        <th>검토 권한</th>
                                                        <th>로그 관리</th>
                                                        <th>리스트 수정</th>
                                                        <th>세부사항 열람</th>
                                                        <th>펌웨어 다운로드</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {permissionUsers.map((user) => (
                                                        <tr key={user.id}>
                                                            <td>{user.name}</td>
                                                            <td>{user.phoneNumber || '-'}</td>
                                                            <td>
                                                                <input
                                                                    type="checkbox"
                                                                    checked={!!user.permissions?.canManagePermissions}
                                                                    onChange={(e) => updateUserPermission(user.id, 'canManagePermissions', e.target.checked)}
                                                                />
                                                            </td>
                                                            <td>
                                                                <input
                                                                    type="checkbox"
                                                                    checked={!!user.permissions?.canReviewList}
                                                                    onChange={(e) => updateUserPermission(user.id, 'canReviewList', e.target.checked)}
                                                                />
                                                            </td>
                                                            <td>
                                                                <input
                                                                    type="checkbox"
                                                                    checked={!!user.permissions?.canViewLogs}
                                                                    onChange={(e) => updateUserPermission(user.id, 'canViewLogs', e.target.checked)}
                                                                />
                                                            </td>
                                                            <td>
                                                                <input
                                                                    type="checkbox"
                                                                    checked={!!user.permissions?.canEditProduct}
                                                                    onChange={(e) => updateUserPermission(user.id, 'canEditProduct', e.target.checked)}
                                                                />
                                                            </td>
                                                            <td>
                                                                <input
                                                                    type="checkbox"
                                                                    checked={!!user.permissions?.canViewDetail}
                                                                    onChange={(e) => updateUserPermission(user.id, 'canViewDetail', e.target.checked)}
                                                                />
                                                            </td>
                                                            <td>
                                                                <input
                                                                    type="checkbox"
                                                                    checked={!!user.permissions?.canDownloadFirmware}
                                                                    onChange={(e) => updateUserPermission(user.id, 'canDownloadFirmware', e.target.checked)}
                                                                />
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </>
                                )}
                            </div>
                        )}

                        {activePage === 'logs' && canViewLogs && (() => {
                            const filteredLogs = logs.filter((log) => {
                                const timeStr = formatKoreanDateTime(log.createdAt);
                                const nameStr = formatLogUser(log);
                                const targetStr = formatLogTarget(log);
                                const descStr = formatLogDescription(log);
                                const f = logFilters;
                                return (
                                    (!f.time || timeStr.includes(f.time)) &&
                                    (!f.name || nameStr.toLowerCase().includes(f.name.toLowerCase())) &&
                                    (!f.target || targetStr.toLowerCase().includes(f.target.toLowerCase())) &&
                                    (!f.description || descStr.toLowerCase().includes(f.description.toLowerCase()))
                                );
                            });
                            const logTotalPages = Math.max(1, Math.ceil(filteredLogs.length / LOG_PAGE_SIZE));
                            const safeLogPage = Math.min(logPage, logTotalPages);
                            const pagedLogs = filteredLogs.slice((safeLogPage - 1) * LOG_PAGE_SIZE, safeLogPage * LOG_PAGE_SIZE);
                            return (
                                <div className="placeholder-page permission-page">
                                    <h3>로그 관리</h3>
                                    {logError && <div className="error-box">{logError}</div>}
                                    {isLogLoading ? (
                                        <p>불러오는 중...</p>
                                    ) : (
                                        <>
                                            <div className="permission-table-wrap">
                                                <table className="permission-table">
                                                    <thead>
                                                        <tr>
                                                            <th>시간</th>
                                                            <th>이름</th>
                                                            <th>대상</th>
                                                            <th>설명</th>
                                                        </tr>
                                                        <tr className="log-filter-row">
                                                            <th><input className="log-filter-input" type="text" placeholder="시간 필터" value={logFilters.time} onChange={(e) => { setLogFilters((p) => ({ ...p, time: e.target.value })); setLogPage(1); }} /></th>
                                                            <th><input className="log-filter-input" type="text" placeholder="이름 필터" value={logFilters.name} onChange={(e) => { setLogFilters((p) => ({ ...p, name: e.target.value })); setLogPage(1); }} /></th>
                                                            <th><input className="log-filter-input" type="text" placeholder="대상 필터" value={logFilters.target} onChange={(e) => { setLogFilters((p) => ({ ...p, target: e.target.value })); setLogPage(1); }} /></th>
                                                            <th><input className="log-filter-input" type="text" placeholder="설명 필터" value={logFilters.description} onChange={(e) => { setLogFilters((p) => ({ ...p, description: e.target.value })); setLogPage(1); }} /></th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {pagedLogs.map((log) => (
                                                            <tr key={log.id}>
                                                                <td>{formatKoreanDateTime(log.createdAt)}</td>
                                                                <td>{formatLogUser(log)}</td>
                                                                <td>{formatLogTarget(log)}</td>
                                                                <td>{formatLogDescription(log)}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                            {logTotalPages > 1 && (
                                                <div className="pagination-wrap">
                                                    <button className="pagination-button" onClick={() => setLogPage((p) => Math.max(1, p - 1))} disabled={safeLogPage === 1}>이전</button>
                                                    {Array.from({ length: logTotalPages }, (_, i) => i + 1).map((page) => (
                                                        <button key={page} className={`pagination-button ${page === safeLogPage ? 'active' : ''}`} onClick={() => setLogPage(page)}>{page}</button>
                                                    ))}
                                                    <button className="pagination-button" onClick={() => setLogPage((p) => Math.min(logTotalPages, p + 1))} disabled={safeLogPage === logTotalPages}>다음</button>
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>
                            );
                        })()}
                    </section>
                </div>
            )}

            <div className="container">
                {activeFormType && (
                    <AddSpecPopup 
                        onAddModel={(model) => handleAddModel(model, activeFormType)} 
                        onClose={closeAddPage} 
                        activeType={activeFormType}
                        onSwitchType={openAddPage}
                        type={activeFormType === 'adjuster' ? '조절기' : '제어기'} 
                    />
                )}
            </div>
            {rejectTargetId && (
                <div className="modal-backdrop" onClick={closeRejectModal}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>승인 거부</h3>
                            <button className="modal-close" onClick={closeRejectModal}>×</button>
                        </div>
                        <textarea
                            className="field-input reject-reason-input"
                            value={rejectReason}
                            onChange={(e) => setRejectReason(e.target.value)}
                            placeholder="승인 거부 내용을 입력해주세요."
                        />
                        <div className="modal-actions">
                            <button className="button" onClick={handleRejectProduct} disabled={isRejecting || !rejectReason.trim()}>
                                {isRejecting ? '처리중...' : '승인 거부 확정'}
                            </button>
                            <button className="button button-cancel" onClick={closeRejectModal} disabled={isRejecting}>취소</button>
                        </div>
                    </div>
                </div>
            )}
            {appToastMessage && (
                <div className={`toast-popup ${appToastVisible ? 'show' : ''} ${appToastType === 'success' ? 'toast-success' : 'toast-error'}`}>
                    {appToastMessage}
                </div>
            )}
        </div>
    );
}

export default App;