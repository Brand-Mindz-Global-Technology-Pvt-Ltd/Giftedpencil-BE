import { RowDataPacket } from 'mysql2/promise';
import { Server } from 'http';
import pool from '../src/config/db';
import app from '../src/app';
import { AdminService } from '../src/services/adminService';

const TARGET_EMAIL = 'admin2@thegiftedpencil.com';
const TARGET_USERNAME = 'admin2';
const TARGET_FULL_NAME = 'Admin Two';
const TARGET_PASSWORD = process.env.NEW_ADMIN_PASSWORD || '12345';
const TARGET_ROLE = 'admin'; // Regular admin role; NOT superadmin

async function createAdminUser(): Promise<void> {
  console.log('====================================================');
  console.log(' The Gifted Pencil - Create New Admin Account');
  console.log(` Target Email:    ${TARGET_EMAIL}`);
  console.log(` Target Username: ${TARGET_USERNAME}`);
  console.log(` Target Role:     ${TARGET_ROLE}`);
  console.log('====================================================\n');

  const connection = await pool.getConnection();

  try {
    // 1. Safety check: Verify connected database is strictly gifted_pencil_test
    const [dbRows] = await connection.query<RowDataPacket[]>('SELECT DATABASE() AS current_db');
    const currentDb = dbRows[0]?.current_db;
    if (currentDb !== 'gifted_pencil_test') {
      throw new Error(`Safety Abort: Active DB is "${currentDb}", expected strictly "gifted_pencil_test"`);
    }
    console.log(`[Safety Verified]: Connected to database "${currentDb}".`);

    // 2. Check whether email or username already exists
    const [existingRows] = await connection.query<RowDataPacket[]>(
      'SELECT id, username, email, role FROM admin_users WHERE LOWER(email) = ? OR LOWER(username) = ?',
      [TARGET_EMAIL.toLowerCase(), TARGET_USERNAME.toLowerCase()]
    );

    if (existingRows.length > 0) {
      const match = existingRows[0];
      console.warn(`[Duplicate Check]: Account already exists with ID=${match.id}, username="${match.username}", email="${match.email}".`);
      console.log('[Notice]: Aborting creation to prevent duplicate account.');
      return;
    }
    console.log('[Duplicate Check]: Neither email nor username exists. Proceeding with creation.\n');

    // 3. Create account using existing AdminService.register (hashes password with bcrypt 10 rounds)
    const registerResult = await AdminService.register({
      username: TARGET_USERNAME,
      email: TARGET_EMAIL,
      full_name: TARGET_FULL_NAME,
      password: TARGET_PASSWORD,
      role: TARGET_ROLE
    });

    console.log('[SUCCESS]: New Admin account created successfully in MySQL:');
    console.log(`  ID:        ${registerResult.admin.id}`);
    console.log(`  UUID:      ${registerResult.admin.admin_uuid}`);
    console.log(`  Username:  ${registerResult.admin.username}`);
    console.log(`  Email:     ${registerResult.admin.email}`);
    console.log(`  Full Name: ${registerResult.admin.full_name}`);
    console.log(`  Role:      ${registerResult.admin.role}`);
    console.log(`  Active:    ${registerResult.admin.is_active}`);
    console.log('  Password:  [PROTECTED - BCRYPT 10 ROUNDS - NEVER LOGGED]\n');

    // 4. Verify login using existing Admin login API
    console.log('--- Verifying Login via AdminService.login() ---');
    const serviceLogin = await AdminService.login({
      email: TARGET_EMAIL,
      password: TARGET_PASSWORD
    });

    if (serviceLogin.token && serviceLogin.admin?.id === registerResult.admin.id) {
      console.log('  AdminService verification: PASS (Token generated successfully)');
      console.log(`  Authenticated Role:       ${serviceLogin.admin.role}`);
    } else {
      throw new Error('AdminService login verification failed.');
    }

    // 5. Verify login via HTTP POST /api/admin/auth/login
    console.log('--- Verifying Login via HTTP POST /api/admin/auth/login ---');
    const PORT = 5097;
    const server: Server = app.listen(PORT);
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/api/admin/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: TARGET_EMAIL,
          password: TARGET_PASSWORD
        })
      });
      const data = await res.json();
      if (res.status === 200 && data.token && data.admin?.id === registerResult.admin.id) {
        console.log(`  HTTP Endpoint verification: PASS (Status 200, Role: ${data.admin.role})`);
      } else {
        throw new Error(`HTTP login verification failed with status ${res.status}: ${JSON.stringify(data)}`);
      }
    } finally {
      server.close();
    }

    console.log('\n====================================================');
    console.log(' NEW ADMIN ACCOUNT CREATED & VERIFIED SUCCESSFULLY!');
    console.log('====================================================\n');

  } finally {
    connection.release();
    await pool.end();
  }
}

createAdminUser().catch((err: Error) => {
  console.error('\n[CREATION ERROR]:', err.message);
  process.exit(1);
});
