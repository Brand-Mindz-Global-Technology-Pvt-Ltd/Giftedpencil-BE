import pool from '../src/config/db';
import fs from 'fs';
import path from 'path';

async function runMigration() {
  const connection = await pool.getConnection();
  try {
    const [dbRows] = await connection.query('SELECT DATABASE() AS current_db');
    const currentDb = (dbRows as any[])[0]?.current_db;
    
    if (currentDb !== 'gifted_pencil_test') {
      throw new Error(`Safety Abort: Active DB is "${currentDb}", expected "gifted_pencil_test"`);
    }

    console.log(`[Safety Verified]: Target database is strictly "${currentDb}".`);

    // Check if table already exists
    const [tables] = await connection.query("SHOW TABLES LIKE 'admin_users'");
    if ((tables as any[]).length > 0) {
      console.log('[Notice]: Table "admin_users" already exists. Skipping creation.');
    } else {
      const sqlPath = path.join(__dirname, '../migrations/01_create_admin_users.sql');
      const sqlContent = fs.readFileSync(sqlPath, 'utf8');
      console.log('[Executing]: Creating table "admin_users"...');
      await connection.query(sqlContent);
      console.log('[Success]: "admin_users" table created successfully.');
    }

    // Verify schema
    const [describeRows] = await connection.query('DESCRIBE admin_users');
    console.log('[Verification]: admin_users schema structure:');
    console.table(describeRows);

  } finally {
    connection.release();
    await pool.end();
  }
}

runMigration().catch(err => {
  console.error('[Migration Error]:', err.message);
  process.exit(1);
});

