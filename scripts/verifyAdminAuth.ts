import { Server } from 'http';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { RowDataPacket } from 'mysql2/promise';
import app from '../src/app';
import pool from '../src/config/db';

const PORT = 5099;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const TEST_ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Admin@GiftedPencil2026#';

interface ApiResponse<T = any> {
  success?: boolean;
  status: string;
  message?: string;
  token?: string;
  admin?: {
    id: number;
    admin_uuid: string;
    username: string;
    email: string;
    full_name: string;
    role: string;
    is_active: boolean;
    password_hash?: string;
  };
  data?: T;
}

async function runVerification(): Promise<void> {
  console.log('====================================================');
  console.log(' Starting Admin Authentication TypeScript Suite');
  console.log(' Target DB: gifted_pencil_test (Strict Local Check)');
  console.log('====================================================\n');

  // 1. Safety DB verification
  const [dbRows] = await pool.query<RowDataPacket[]>('SELECT DATABASE() AS current_db');
  const currentDb = dbRows[0]?.current_db;
  if (currentDb !== 'gifted_pencil_test') {
    throw new Error(`CRITICAL: Connected to "${currentDb}", aborting verification!`);
  }
  console.log(`[PASS] Confirmed connected database: ${currentDb}\n`);

  // 2. Start temporary server
  const server: Server = app.listen(PORT);
  let superadminToken = '';
  let superadminId: number | null = null;

  try {
    // --- TEST 1: Login with valid SuperAdmin credentials ---
    console.log('--- TEST 1: Admin Login with Valid Credentials ---');
    const res1 = await fetch(`${BASE_URL}/api/admin/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'admin@thegiftedpencil.com',
        password: TEST_ADMIN_PASSWORD
      })
    });
    const data1 = (await res1.json()) as ApiResponse;
    if (res1.status === 200 && data1.token && data1.admin?.role === 'superadmin') {
      console.log('  Status: 200 OK');
      console.log('  Token received: Yes');
      console.log('  Admin Username:', data1.admin.username);
      console.log('  Admin Role:', data1.admin.role);
      console.log('  Password Hash in response:', data1.admin.password_hash === undefined ? 'NO (Safe)' : 'LEAK DETECTED!');
      superadminToken = data1.token;
      superadminId = data1.admin.id;
      console.log('[PASS] Test 1: Valid Login Succeeded\n');
    } else {
      throw new Error(`Test 1 Failed: Status ${res1.status}, Data: ${JSON.stringify(data1)}`);
    }

    // --- TEST 2: Login with incorrect password ---
    console.log('--- TEST 2: Admin Login with Invalid Password ---');
    const res2 = await fetch(`${BASE_URL}/api/admin/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'admin@thegiftedpencil.com',
        password: 'WrongPassword123!'
      })
    });
    const data2 = (await res2.json()) as ApiResponse;
    if (res2.status === 401) {
      console.log('  Status: 401 Unauthorized');
      console.log('  Message:', data2.message);
      console.log('[PASS] Test 2: Invalid password properly rejected\n');
    } else {
      throw new Error(`Test 2 Failed: Expected 401, got ${res2.status}`);
    }

    // --- TEST 3: Inactive Admin Account Rejection ---
    console.log('--- TEST 3: Inactive Admin Login Rejection ---');
    const testInactiveUuid = crypto.randomUUID();
    const testInactiveHash = await bcrypt.hash('InactivePass123', 10);
    await pool.query(
      `INSERT INTO admin_users (admin_uuid, username, email, password_hash, full_name, role, is_active)
       VALUES (?, 'inactive_admin_ts', 'inactive_ts@test.com', ?, 'Inactive Admin TS', 'admin', 0)`,
      [testInactiveUuid, testInactiveHash]
    );

    const res3 = await fetch(`${BASE_URL}/api/admin/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'inactive_ts@test.com',
        password: 'InactivePass123'
      })
    });
    const data3 = (await res3.json()) as ApiResponse;

    // Clean up temporary inactive admin
    await pool.query('DELETE FROM admin_users WHERE username = ?', ['inactive_admin_ts']);

    if (res3.status === 401 || res3.status === 403) {
      console.log(`  Status: ${res3.status}`);
      console.log('  Message:', data3.message);
      console.log('[PASS] Test 3: Inactive account properly rejected\n');
    } else {
      throw new Error(`Test 3 Failed: Expected 401 or 403, got ${res3.status}`);
    }

    // --- TEST 4: Protected Profile with Valid Admin Token ---
    console.log('--- TEST 4: Access Protected Profile with Admin JWT ---');
    const res4 = await fetch(`${BASE_URL}/api/admin/auth/profile/${superadminId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${superadminToken}`
      }
    });
    const data4 = (await res4.json()) as ApiResponse;
    if (res4.status === 200 && data4.admin?.id === superadminId) {
      console.log('  Status: 200 OK');
      console.log('  Profile ID:', data4.admin.id);
      console.log('  Profile Role:', data4.admin.role);
      console.log('[PASS] Test 4: Protected route authorized with Admin JWT\n');
    } else {
      throw new Error(`Test 4 Failed: Expected 200, got ${res4.status}`);
    }

    // --- TEST 5: Rejection of Customer Token on Admin Endpoints ---
    console.log('--- TEST 5: Customer Token Rejection on Admin Endpoints ---');
    const secret = process.env.ADMIN_JWT_SECRET || process.env.JWT_SECRET || 'the-gifted-pencil-admin-secret-2026';
    // Create valid customer token (without type: 'admin' or adminId)
    const customerToken = jwt.sign(
      { id: 999, email: 'customer@test.com', role: 'customer' },
      secret,
      { expiresIn: '1h' }
    );

    const res5 = await fetch(`${BASE_URL}/api/admin/auth/profile/${superadminId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${customerToken}`
      }
    });
    const data5 = (await res5.json()) as ApiResponse;
    if (res5.status === 403) {
      console.log('  Status: 403 Forbidden');
      console.log('  Message:', data5.message);
      console.log('[PASS] Test 5: Customer token strictly rejected on Admin endpoints\n');
    } else {
      throw new Error(`Test 5 Failed: Expected 403 Forbidden, got ${res5.status}`);
    }

    // --- TEST 6: Rejection of Missing Token on Protected Endpoints ---
    console.log('--- TEST 6: Unauthenticated Request Rejection ---');
    const res6 = await fetch(`${BASE_URL}/api/admin/auth/profile/${superadminId}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });
    const data6 = (await res6.json()) as ApiResponse;
    if (res6.status === 401) {
      console.log('  Status: 401 Unauthorized');
      console.log('  Message:', data6.message);
      console.log('[PASS] Test 6: Missing token properly rejected\n');
    } else {
      throw new Error(`Test 6 Failed: Expected 401 Unauthorized, got ${res6.status}`);
    }

    // --- TEST 7: SuperAdmin-Only Admin Registration Protection ---
    console.log('--- TEST 7: Registration Route Protection ---');
    // 7a. Without token
    const res7a = await fetch(`${BASE_URL}/api/admin/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'staff1',
        email: 'staff1@thegiftedpencil.com',
        password: 'StaffPassword123!',
        role: 'admin'
      })
    });
    if (res7a.status === 401) {
      console.log('  7a. Unauthenticated registration rejected: 401 Unauthorized');
    } else {
      throw new Error(`Test 7a Failed: Expected 401, got ${res7a.status}`);
    }

    // 7b. With customer token
    const res7b = await fetch(`${BASE_URL}/api/admin/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${customerToken}`
      },
      body: JSON.stringify({
        username: 'staff2',
        email: 'staff2@thegiftedpencil.com',
        password: 'StaffPassword123!',
        role: 'admin'
      })
    });
    if (res7b.status === 403) {
      console.log('  7b. Customer registration attempt rejected: 403 Forbidden');
    } else {
      throw new Error(`Test 7b Failed: Expected 403, got ${res7b.status}`);
    }

    // 7c. With SuperAdmin token
    const res7c = await fetch(`${BASE_URL}/api/admin/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${superadminToken}`
      },
      body: JSON.stringify({
        username: 'test_staff_ts',
        email: 'test_staff_ts@thegiftedpencil.com',
        password: 'StaffPassword123!',
        role: 'admin'
      })
    });
    const data7c = (await res7c.json()) as ApiResponse;
    if (res7c.status === 201 && data7c.admin?.username === 'test_staff_ts') {
      console.log('  7c. SuperAdmin authorized staff creation: 201 Created');
      // Clean up test staff
      await pool.query('DELETE FROM admin_users WHERE username = ?', ['test_staff_ts']);
      console.log('  Test staff account cleaned up.');
      console.log('[PASS] Test 7: Registration route strictly protected (SuperAdmin only)\n');
    } else {
      throw new Error(`Test 7c Failed: Expected 201, got ${res7c.status}`);
    }

    // --- TEST 8: Frontend Backward-Compatible Route POST /auth/login ---
    console.log('--- TEST 8: Frontend Backward-Compatible Route POST /auth/login ---');
    const res8 = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'admin@thegiftedpencil.com',
        password: TEST_ADMIN_PASSWORD
      })
    });
    const data8 = (await res8.json()) as ApiResponse;
    if (res8.status === 200 && data8.token && data8.admin) {
      console.log('  Status: 200 OK');
      console.log('  Admin Username:', data8.admin.username);
      console.log('[PASS] Test 8: /auth/login route alias working properly\n');
    } else {
      throw new Error(`Test 8 Failed: Expected 200, got ${res8.status}`);
    }

    console.log('====================================================');
    console.log(' ALL 8 ADMIN AUTHENTICATION TESTS PASSED 100% (TS)!');
    console.log('====================================================');

  } finally {
    server.close();
    await pool.end();
  }
}

runVerification().catch((err: Error) => {
  console.error('\n[VERIFICATION SUITE ERROR]:', err);
  process.exit(1);
});
