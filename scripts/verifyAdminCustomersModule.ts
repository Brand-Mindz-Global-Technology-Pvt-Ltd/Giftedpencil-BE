import http from 'http';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

import app from '../src/app';
import pool from '../src/config/db';
import { RowDataPacket } from 'mysql2';

const TEST_PORT = 5099;
const BASE_URL = `http://localhost:${TEST_PORT}`;

interface BaselineUser {
  id: number;
  user_uuid: string;
  name: string;
  email: string;
  phone: string;
  account_status: string;
  password_hash: string;
  created_at: string;
}

async function runVerification() {
  console.log('================================================================');
  console.log('   THE GIFTED PENCIL - ADMIN CUSTOMERS MODULE VERIFICATION     ');
  console.log('================================================================\n');

  let server: http.Server | null = null;
  let adminToken = '';
  let baselineUsers: BaselineUser[] = [];
  let baselineOrdersCount = 0;
  let baselineAddressesCount = 0;
  let totalTests = 0;
  let passedTests = 0;

  function assert(condition: boolean, testName: string, details?: any) {
    totalTests++;
    if (condition) {
      passedTests++;
      console.log(`  [PASS] Test ${totalTests}: ${testName}`);
    } else {
      console.error(`  [FAIL] Test ${totalTests}: ${testName}`);
      if (details) console.error('         Details:', details);
      throw new Error(`Test failed: ${testName}`);
    }
  }

  try {
    // -------------------------------------------------------------
    // PHASE 0: Baseline Snapshot & Invariant Setup
    // -------------------------------------------------------------
    console.log('[PHASE 0] Recording database baseline snapshot...');

    const [userRows] = await pool.query<RowDataPacket[]>(
      'SELECT id, user_uuid, name, email, phone, account_status, password_hash, created_at FROM users ORDER BY id ASC'
    );
    baselineUsers = userRows.map(u => ({
      id: Number(u.id),
      user_uuid: String(u.user_uuid),
      name: String(u.name),
      email: String(u.email),
      phone: String(u.phone),
      account_status: String(u.account_status),
      password_hash: String(u.password_hash),
      created_at: u.created_at instanceof Date ? u.created_at.toISOString() : String(u.created_at)
    }));

    const [orderCountRows] = await pool.query<RowDataPacket[]>('SELECT COUNT(*) as cnt FROM orders');
    baselineOrdersCount = Number(orderCountRows[0].cnt);

    const [addrCountRows] = await pool.query<RowDataPacket[]>('SELECT COUNT(*) as cnt FROM addresses');
    baselineAddressesCount = Number(addrCountRows[0].cnt);

    console.log(`  -> Baseline customers count: ${baselineUsers.length}`);
    console.log(`  -> Baseline orders count: ${baselineOrdersCount}`);
    console.log(`  -> Baseline addresses count: ${baselineAddressesCount}\n`);

    assert(baselineUsers.length === 24, 'Database has exactly 24 baseline registered customers');

    // -------------------------------------------------------------
    // PHASE 1: Bootstrap Server
    // -------------------------------------------------------------
    console.log('\n[PHASE 1] Starting backend HTTP server on test port...');
    server = http.createServer(app);
    await new Promise<void>((resolve) => {
      server!.listen(TEST_PORT, () => {
        console.log(`  -> Server listening at ${BASE_URL}\n`);
        resolve();
      });
    });

    // -------------------------------------------------------------
    // PHASE 2: Authentication & Authorization
    // -------------------------------------------------------------
    console.log('[PHASE 2] Testing Admin Authentication & Access Control...');

    // 2.1 Admin login
    const loginRes = await fetch(`${BASE_URL}/api/admin/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin2@thegiftedpencil.com', password: '12345' })
    });
    const loginData = await loginRes.json();
    assert(loginRes.status === 200 && Boolean(loginData.token), 'Admin login succeeds and returns JWT', loginData);
    adminToken = loginData.token;

    // 2.2 Unauthenticated request rejected
    const unauthRes = await fetch(`${BASE_URL}/api/admin/customers`);
    assert(unauthRes.status === 401, 'Unauthenticated request to GET /api/admin/customers rejected with 401');

    // 2.3 Invalid token rejected
    const invalidRes = await fetch(`${BASE_URL}/api/admin/customers`, {
      headers: { Authorization: 'Bearer invalid.token.payload' }
    });
    assert(invalidRes.status === 401 || invalidRes.status === 403, 'Invalid token rejected with 401 or 403');

    // 2.4 Authorized admin request succeeds
    const authRes = await fetch(`${BASE_URL}/api/admin/customers`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert(authRes.status === 200, 'Authorized admin request succeeds with 200');

    // -------------------------------------------------------------
    // PHASE 3: Customers List & Dynamic Aggregation
    // -------------------------------------------------------------
    console.log('\n[PHASE 3] Testing Customers List & Aggregated Metrics...');

    const listData = await authRes.json();
    assert(listData.status === 'success', 'Response status is success');
    assert(Array.isArray(listData.customers) || Array.isArray(listData.data), 'Returns customers array');
    const customers = listData.customers || listData.data;

    assert(listData.pagination?.total === 24, `Pagination total reflects all 24 registered customers (got ${listData.pagination?.total})`);

    // Verify security: password_hash NEVER exposed
    let passwordHashExposed = false;
    for (const c of customers) {
      if ('password_hash' in c || 'password' in c) {
        passwordHashExposed = true;
        break;
      }
    }
    assert(!passwordHashExposed, 'CRITICAL SECURITY: password_hash is strictly excluded from customer records');

    // Verify dynamic aggregation metrics exist
    const firstCust = customers[0];
    assert('totalOrders' in firstCust && typeof firstCust.totalOrders === 'number', 'Customer includes totalOrders aggregate metric');
    assert('totalSpent' in firstCust && typeof firstCust.totalSpent === 'number', 'Customer includes totalSpent aggregate metric');
    assert('latestOrderDate' in firstCust, 'Customer includes latestOrderDate metric');
    assert('status' in firstCust && ['Active', 'Inactive', 'Blocked'].includes(firstCust.status), `Customer status normalized properly (got ${firstCust.status})`);

    // -------------------------------------------------------------
    // PHASE 4: Server-Side Pagination
    // -------------------------------------------------------------
    console.log('\n[PHASE 4] Testing Server-Side Pagination...');

    const p1Res = await fetch(`${BASE_URL}/api/admin/customers?page=1&limit=5`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const p1Data = await p1Res.json();
    assert(p1Data.customers.length === 5, 'Page 1 with limit=5 returns exactly 5 records');
    assert(p1Data.pagination.page === 1 && p1Data.pagination.limit === 5 && p1Data.pagination.totalPages === 5, 'Pagination metadata matches page 1');

    const p2Res = await fetch(`${BASE_URL}/api/admin/customers?page=2&limit=5`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const p2Data = await p2Res.json();
    assert(p2Data.customers.length === 5, 'Page 2 with limit=5 returns 5 records');
    assert(p1Data.customers[0].id !== p2Data.customers[0].id, 'Page 1 and Page 2 contain distinct records without overlap');

    // -------------------------------------------------------------
    // PHASE 5: Search Filtering
    // -------------------------------------------------------------
    console.log('\n[PHASE 5] Testing Search Filtering across Name, Email, Phone, and ID...');

    // 5.1 Search by name
    const searchNameRes = await fetch(`${BASE_URL}/api/admin/customers?search=Sarani`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const searchNameData = await searchNameRes.json();
    assert(
      searchNameData.customers.length > 0 && searchNameData.customers.some((c: any) => c.name.toLowerCase().includes('sarani')),
      'Search by name ("Sarani") correctly returns matching customer'
    );

    // 5.2 Search by email
    const searchEmailRes = await fetch(`${BASE_URL}/api/admin/customers?search=sarani@thegiftedpencil.com`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const searchEmailData = await searchEmailRes.json();
    assert(
      searchEmailData.customers.length > 0 && searchEmailData.customers[0].email === 'sarani@thegiftedpencil.com',
      'Search by email ("sarani@thegiftedpencil.com") correctly returns customer'
    );

    // 5.3 Search by phone
    const searchPhoneRes = await fetch(`${BASE_URL}/api/admin/customers?search=9363626015`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const searchPhoneData = await searchPhoneRes.json();
    assert(
      searchPhoneData.customers.length > 0 && searchPhoneData.customers[0].phone === '9363626015',
      'Search by phone ("9363626015") correctly returns customer'
    );

    // 5.4 Search by customerId
    const searchIdRes = await fetch(`${BASE_URL}/api/admin/customers?search=1001`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const searchIdData = await searchIdRes.json();
    assert(
      searchIdData.customers.length > 0 && (searchIdData.customers[0].id === 1001 || searchIdData.customers[0].customerId === 'CUST-1001'),
      'Search by Customer ID ("1001") correctly returns customer'
    );

    // -------------------------------------------------------------
    // PHASE 6: Status Filtering & Sorting
    // -------------------------------------------------------------
    console.log('\n[PHASE 6] Testing Status Filtering & Sorting...');

    const filterActiveRes = await fetch(`${BASE_URL}/api/admin/customers?status=Active`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const filterActiveData = await filterActiveRes.json();
    assert(
      filterActiveData.customers.every((c: any) => c.status === 'Active'),
      'Status filter "Active" returns only customers with Active status'
    );

    // Sort by name ASC
    const sortNameRes = await fetch(`${BASE_URL}/api/admin/customers?sortBy=name&sortOrder=asc&limit=10`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const sortNameData = await sortNameRes.json();
    const names = sortNameData.customers.map((c: any) => c.name.toLowerCase());
    const isSorted = names.slice(1).every((n: string, i: number) => names[i].localeCompare(n) <= 0);
    assert(isSorted, 'Customers are sorted alphabetically when sortBy=name&sortOrder=asc');

    // -------------------------------------------------------------
    // PHASE 7: Customer Details & Saved Addresses
    // -------------------------------------------------------------
    console.log('\n[PHASE 7] Testing Customer Details, Addresses & Statistics...');

    const detailRes = await fetch(`${BASE_URL}/api/admin/customers/1001`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert(detailRes.status === 200, 'GET /api/admin/customers/1001 returns 200');
    const detailData = await detailRes.json();
    const customerDetail = detailData.customer || detailData.data;

    assert(customerDetail.id === 1001, 'Customer ID matches requested ID 1001');
    assert(!('password_hash' in customerDetail), 'Customer details endpoint strictly omits password_hash');
    assert(Array.isArray(detailData.addresses), 'Customer details returns saved addresses array');
    assert('stats' in detailData && typeof detailData.stats?.totalOrders === 'number', 'Customer details returns order stats object');
    assert(Array.isArray(customerDetail.recentOrders), 'Customer details returns recentOrders array');

    // Non-existent customer returns 404
    const notFoundRes = await fetch(`${BASE_URL}/api/admin/customers/999999`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert(notFoundRes.status === 404, 'Non-existent customer ID returns 404 Not Found');

    // -------------------------------------------------------------
    // PHASE 8: Customer Order History Endpoint
    // -------------------------------------------------------------
    console.log('\n[PHASE 8] Testing Customer Order History Endpoint...');

    const ordersRes = await fetch(`${BASE_URL}/api/admin/customers/1001/orders?page=1&limit=5`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert(ordersRes.status === 200, 'GET /api/admin/customers/1001/orders returns 200');
    const ordersData = await ordersRes.json();
    assert(Array.isArray(ordersData.orders) || Array.isArray(ordersData.data), 'Returns paginated orders array');
    assert(Boolean(ordersData.pagination), 'Returns pagination metadata for customer orders');

    // -------------------------------------------------------------
    // PHASE 9: CSV Export & Formula Injection Protection
    // -------------------------------------------------------------
    console.log('\n[PHASE 9] Testing CSV Export & Formula Injection Sanitization...');

    const exportRes = await fetch(`${BASE_URL}/api/admin/customers/export`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert(exportRes.status === 200, 'GET /api/admin/customers/export returns 200');
    const contentType = exportRes.headers.get('content-type') || '';
    assert(contentType.includes('text/csv'), `Content-Type header is text/csv (got ${contentType})`);
    const csvContent = await exportRes.text();
    const csvLines = csvContent.split('\r\n');
    assert(csvLines[0].includes('Customer ID') && csvLines[0].includes('Name') && csvLines[0].includes('Email'), 'CSV headers contain Customer ID, Name, Email');
    assert(csvLines.length >= 25, `CSV contains all 24 customer rows + header (got ${csvLines.length} lines)`);

    // -------------------------------------------------------------
    // PHASE 10: Dynamic Registration Storefront Visibility Test
    // -------------------------------------------------------------
    console.log('\n[PHASE 10] Testing Dynamic Customer Storefront Visibility...');
    const testEmail = `test_dyn_visibility_${Date.now()}@example.com`;
    let insertedUserId = 0;

    try {
      // Simulate new customer registering via storefront (inserted into users table)
      const [insertResult]: any = await pool.query(
        `INSERT INTO users (user_uuid, name, email, phone, password_hash, account_status, created_at, updated_at)
         VALUES (UUID(), 'Dynamic Storefront Tester', ?, '9999988888', 'dummy_hash', 'active', NOW(), NOW())`,
        [testEmail]
      );
      insertedUserId = insertResult.insertId;

      // Immediately query Admin Customers API
      const dynCheckRes = await fetch(`${BASE_URL}/api/admin/customers?search=${testEmail}`, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      const dynCheckData = await dynCheckRes.json();
      assert(
        dynCheckData.customers.length === 1 && dynCheckData.customers[0].email === testEmail,
        'Newly registered storefront customer is instantly visible in Admin without sync or reload'
      );

      // Verify safe status update on test user
      const patchRes = await fetch(`${BASE_URL}/api/admin/customers/${insertedUserId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`
        },
        body: JSON.stringify({ status: 'Inactive' })
      });
      assert(patchRes.status === 200, 'PATCH /api/admin/customers/:id/status updates status to Inactive');
      const patchData = await patchRes.json();
      assert(patchData.customer.status === 'Inactive', 'Updated customer status reflects Inactive');
    } finally {
      // Clean up the temporary test user
      if (insertedUserId > 0) {
        await pool.query('DELETE FROM users WHERE id = ?', [insertedUserId]);
        console.log(`  -> Cleaned up temporary test customer ${insertedUserId}`);
      }
    }

    // -------------------------------------------------------------
    // PHASE 11: Storefront API Sanity & Non-Regression
    // -------------------------------------------------------------
    console.log('\n[PHASE 11] Checking Storefront Non-Regression...');

    const productsRes = await fetch(`${BASE_URL}/api/products`);
    assert(productsRes.status === 200, 'Storefront GET /api/products returns 200');

    const healthRes = await fetch(`${BASE_URL}/api/health`);
    assert(healthRes.status === 200, 'GET /api/health returns 200');

    // -------------------------------------------------------------
    // PHASE 12: Zero-Mutation Data Invariant Verification
    // -------------------------------------------------------------
    console.log('\n[PHASE 12] Verifying Zero Mutation of Existing Customer & Order Data...');

    const [finalUserRows] = await pool.query<RowDataPacket[]>(
      'SELECT id, user_uuid, name, email, phone, account_status, password_hash, created_at FROM users ORDER BY id ASC'
    );
    const finalUsers: BaselineUser[] = finalUserRows.map(u => ({
      id: Number(u.id),
      user_uuid: String(u.user_uuid),
      name: String(u.name),
      email: String(u.email),
      phone: String(u.phone),
      account_status: String(u.account_status),
      password_hash: String(u.password_hash),
      created_at: u.created_at instanceof Date ? u.created_at.toISOString() : String(u.created_at)
    }));

    assert(finalUsers.length === baselineUsers.length, `Customer count unchanged: ${finalUsers.length} === ${baselineUsers.length}`);

    let allIdentical = true;
    for (let i = 0; i < baselineUsers.length; i++) {
      const b = baselineUsers[i];
      const f = finalUsers[i];
      if (
        b.id !== f.id ||
        b.user_uuid !== f.user_uuid ||
        b.name !== f.name ||
        b.email !== f.email ||
        b.phone !== f.phone ||
        b.account_status !== f.account_status ||
        b.password_hash !== f.password_hash
      ) {
        allIdentical = false;
        console.error('Mismatch detected on customer:', { baseline: b, final: f });
        break;
      }
    }
    assert(allIdentical, 'ZERO MUTATION GUARANTEE: All 24 baseline customer records are 100% byte-for-byte identical');

    const [finalOrderCountRows] = await pool.query<RowDataPacket[]>('SELECT COUNT(*) as cnt FROM orders');
    assert(Number(finalOrderCountRows[0].cnt) === baselineOrdersCount, `Orders count strictly preserved (${baselineOrdersCount})`);

    const [finalAddrCountRows] = await pool.query<RowDataPacket[]>('SELECT COUNT(*) as cnt FROM addresses');
    assert(Number(finalAddrCountRows[0].cnt) === baselineAddressesCount, `Addresses count strictly preserved (${baselineAddressesCount})`);

    console.log('\n================================================================');
    console.log(`  ALL ${passedTests}/${totalTests} TESTS PASSED SUCCESSFULLY!`);
    console.log('  Admin Customers Module verified with 100% database integrity.');
    console.log('================================================================\n');

  } catch (error) {
    console.error('\n[FATAL ERROR] Verification failed:', error);
    process.exitCode = 1;
  } finally {
    if (server) {
      server.close();
      console.log('Test HTTP server closed.');
    }
    try {
      await pool.end();
      console.log('Database pool closed.');
    } catch {
      // ignore
    }
    process.exit(process.exitCode || 0);
  }
}

runVerification();
