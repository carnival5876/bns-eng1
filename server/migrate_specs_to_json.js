const dotenv = require('dotenv');
const mysql = require('mysql2/promise');

dotenv.config();

async function run() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'bnsDB',
  });

  try {
    const [columnRows] = await connection.query(
      `SELECT COUNT(*) AS cnt
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = ?
         AND TABLE_NAME = 'products'
         AND COLUMN_NAME = 'specs_json'`,
      [process.env.DB_NAME || 'bnsDB']
    );

    if (!columnRows[0].cnt) {
      await connection.query('ALTER TABLE products ADD COLUMN specs_json LONGTEXT NULL AFTER type');
      console.log('Added products.specs_json column');
    }

    const [productRows] = await connection.query('SELECT id, specs_json FROM products');

    for (const product of productRows) {
      if (product.specs_json && product.specs_json.trim() !== '') {
        continue;
      }

      const [specRows] = await connection.query(
        `SELECT spec_key, spec_value, full_width
         FROM product_specs
         WHERE product_id = ?
         ORDER BY id ASC`,
        [product.id]
      );

      const specs = specRows.map((row) => ({
        title: row.spec_key,
        details: row.spec_value || '',
        fullWidth: !!row.full_width,
      }));

      await connection.query('UPDATE products SET specs_json = ? WHERE id = ?', [JSON.stringify(specs), product.id]);
    }

    console.log('Migration completed');
  } finally {
    await connection.end();
  }
}

run().catch((error) => {
  console.error('Migration failed:', error.message);
  process.exit(1);
});
