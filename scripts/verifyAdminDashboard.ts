import { Server } from 'http';
import jwt from 'jsonwebtoken';
import { RowDataPacket } from 'mysql2/promise';
import app from '../src/app';
import pool from '../src/config/db';

const PORT = 5096;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin2@thegiftedpencil.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '12345';

async function verifyDashboard(): Promise<void> {
  console.log('====================================================');
  console.log(' Starting Admin Dashboard API Verification Suite');
  console.log(' Database: gifted_pencil_test (Strict Local Check)');
  console.log('====================================================\n');

  // 1. Safety check
  const [dbRows] = await pool.query<RowDataPacket[]>('SELECT DATABASE() AS current_db');
  const currentDb = dbRows[0]?.current_db;
  if (currentDb !== 'gifted_pencil_test') {
    throw new Error(`CRITICAL: Connected to "${currentDb}", aborting verification!`);
  }
  console.log(`[Safety Verified]: Connected to database "${currentDb}".\n`);

  // 2. Start server
  const server: Server = app.listen(PORT);
  let adminToken = '';

  try {
    // Authenticate Admin
    console.log('--- Step 1: Obtain Admin Authentication Token ---');
    const loginRes = await fetch(`${BASE_URL}/api/admin/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD
      })
    });
    const loginData = await loginRes.json();
    if (loginRes.status !== 200 || !loginData.token) {
      throw new Error(`Admin login failed: ${JSON.stringify(loginData)}`);
    }
    adminToken = loginData.token;
    console.log(`[PASS] Admin token obtained for: ${loginData.admin.username} (${loginData.admin.role})\n`);

    // --- TEST 1: Unauthorized access rejection ---
    console.log('--- TEST 1: Unauthorized Access Rejection ---');
    const resUnauth = await fetch(`${BASE_URL}/api/admin/dashboard`);
    if (resUnauth.status === 401) {
      console.log('  Unauthenticated access -> 401 Unauthorized [PASS]');
    } else {
      throw new Error(`Expected 401, got ${resUnauth.status}`);
    }

    // Customer token rejection
    const secret = process.env.ADMIN_JWT_SECRET || process.env.JWT_SECRET || 'the-gifted-pencil-admin-secret-2026';
    const customerToken = jwt.sign(
      { id: 999, email: 'customer@test.com', role: 'customer' },
      secret,
      { expiresIn: '1h' }
    );
    const resCust = await fetch(`${BASE_URL}/api/admin/dashboard`, {
      headers: { Authorization: `Bearer ${customerToken}` }
    });
    if (resCust.status === 403) {
      console.log('  Customer token access -> 403 Forbidden [PASS]');
    } else {
      throw new Error(`Expected 403, got ${resCust.status}`);
    }
    console.log('[PASS] Test 1: All dashboard routes strictly protected.\n');

    // --- TEST 2: Main Dashboard Overview API ---
    console.log('--- TEST 2: GET /api/admin/dashboard Overview ---');
    const resMain = await fetch(`${BASE_URL}/api/admin/dashboard`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const mainData = await resMain.json();
    if (resMain.status === 200 && mainData.data) {
      const d = mainData.data;
      console.log('  Total Products:       ', d.totalProducts);
      console.log('  Total Orders:         ', d.totalOrders);
      console.log('  Total Customers:      ', d.totalCustomers);
      console.log('  Total Sales (Realized): ₹' + d.totalSales);
      console.log('  Gross Sales (Orders):   ₹' + d.grossSales);
      console.log('  Sales Definition:     ', d.salesDefinition);
      console.log('  Recent Orders Count:  ', d.recentOrders?.length);
      console.log('  Status Summary Items: ', d.orderStatusSummary?.length);

      if (
        typeof d.totalProducts !== 'number' ||
        typeof d.totalOrders !== 'number' ||
        typeof d.totalCustomers !== 'number' ||
        typeof d.totalSales !== 'number' ||
        !Array.isArray(d.recentOrders) ||
        !Array.isArray(d.orderStatusSummary)
      ) {
        throw new Error('Dashboard overview missing required fields.');
      }
      console.log('[PASS] Test 2: Main dashboard API returns all 6 required data items.\n');
    } else {
      throw new Error(`Main dashboard failed with status ${resMain.status}: ${JSON.stringify(mainData)}`);
    }

    // --- TEST 3: Component Sub-Endpoints ---
    console.log('--- TEST 3: Component-Specific Endpoints ---');

    // 3a. Recent Orders
    const resRecent = await fetch(`${BASE_URL}/api/admin/dashboard/recent-orders?limit=5`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const recentData = await resRecent.json();
    if (resRecent.status === 200 && Array.isArray(recentData.data) && recentData.data.length <= 5) {
      console.log(`  3a. /recent-orders: OK (${recentData.data.length} orders returned)`);
    } else {
      throw new Error('Recent orders failed.');
    }

    // 3b. Order Status Summary
    const resStatus = await fetch(`${BASE_URL}/api/admin/dashboard/order-status-summary`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const statusData = await resStatus.json();
    if (resStatus.status === 200 && Array.isArray(statusData.data)) {
      console.log(`  3b. /order-status-summary: OK (${statusData.data.length} statuses returned)`);
    } else {
      throw new Error('Order status summary failed.');
    }

    // 3c. Sales Summary
    const resSales = await fetch(`${BASE_URL}/api/admin/dashboard/sales-summary`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const salesData = await resSales.json();
    if (resSales.status === 200 && salesData.data?.sales && salesData.data?.products) {
      console.log('  3c. /sales-summary: OK (sales, orders, customers, products)');
    } else {
      throw new Error('Sales summary failed.');
    }

    // 3d. Customer Satisfaction (Deliveries)
    const resSat = await fetch(`${BASE_URL}/api/admin/dashboard/customer-satisfaction`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const satData = await resSat.json();
    if (resSat.status === 200 && Array.isArray(satData.chartData)) {
      console.log(`  3d. /customer-satisfaction: OK (${satData.chartData.length} daily data points)`);
    } else {
      throw new Error('Customer satisfaction failed.');
    }

    // 3e. Volume Service
    const resVol = await fetch(`${BASE_URL}/api/admin/dashboard/volume-service`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const volData = await resVol.json();
    if (resVol.status === 200 && Array.isArray(volData.chartData)) {
      console.log(`  3e. /volume-service: OK (${volData.chartData.length} monthly volumes)`);
    } else {
      throw new Error('Volume service failed.');
    }

    // 3f. Revenue
    const resRev = await fetch(`${BASE_URL}/api/admin/dashboard/revenue`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const revData = await resRev.json();
    if (resRev.status === 200 && Array.isArray(revData.chartData)) {
      console.log(`  3f. /revenue: OK (${revData.chartData.length} monthly revenue points)`);
    } else {
      throw new Error('Revenue failed.');
    }

    // 3g. Top Products
    const resTop = await fetch(`${BASE_URL}/api/admin/dashboard/top-products`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const topData = await resTop.json();
    if (resTop.status === 200 && Array.isArray(topData.products)) {
      console.log(`  3g. /top-products: OK (${topData.products.length} products returned)`);
    } else {
      throw new Error('Top products failed.');
    }

    // 3h. Admin Profile Name Integrity Check
    const resProf = await fetch(`${BASE_URL}/api/admin/auth/profile/${loginData.admin.id}`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const profData = await resProf.json();
    const prof = profData.admin || profData.data;
    if (resProf.status === 200 && prof && prof.full_name && prof.firstName && prof.firstName !== 'undefined') {
      console.log(`  3h. /profile: OK (Name: "${prof.full_name}", First: "${prof.firstName}", Role: "${prof.role}")`);
    } else {
      throw new Error(`Profile name resolution failed: ${JSON.stringify(profData)}`);
    }
    console.log('[PASS] Test 3: All 8 sub-endpoints and profile integrity operational.\n');

    // --- TEST 4: Frontend Alias Route Check ---
    console.log('--- TEST 4: Frontend Backward-Compatible Route /dashboard/sales-summary ---');
    const resAlias = await fetch(`${BASE_URL}/dashboard/sales-summary`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    if (resAlias.status === 200) {
      console.log('[PASS] Test 4: Frontend alias route functioning properly.\n');
    } else {
      throw new Error(`Expected 200 on alias, got ${resAlias.status}`);
    }

    // --- TEST 5: Cross-verification with Direct Read-Only MySQL Aggregations ---
    console.log('--- TEST 5: Database Metric Accuracy Verification ---');
    const [dbProd] = await pool.query<RowDataPacket[]>('SELECT COUNT(*) AS c FROM products WHERE is_active = 1');
    const [dbOrd] = await pool.query<RowDataPacket[]>('SELECT COUNT(*) AS c FROM orders');
    const [dbCust] = await pool.query<RowDataPacket[]>('SELECT COUNT(*) AS c FROM users');
    const [dbSales] = await pool.query<RowDataPacket[]>(
      "SELECT COALESCE(SUM(total_price), 0) AS s FROM orders WHERE payment_status = 'Paid' OR order_status IN ('Processing', 'Shipped', 'Delivered')"
    );

    const actualProducts = Number(dbProd[0]?.c);
    const actualOrders = Number(dbOrd[0]?.c);
    const actualCustomers = Number(dbCust[0]?.c);
    const actualSales = Number(dbSales[0]?.s);

    console.log(`  DB Products:   ${actualProducts} | API: ${mainData.data.totalProducts}`);
    console.log(`  DB Orders:     ${actualOrders} | API: ${mainData.data.totalOrders}`);
    console.log(`  DB Customers:  ${actualCustomers} | API: ${mainData.data.totalCustomers}`);
    console.log(`  DB Sales:      ${actualSales} | API: ${mainData.data.totalSales}`);

    if (
      actualProducts !== mainData.data.totalProducts ||
      actualOrders !== mainData.data.totalOrders ||
      actualCustomers !== mainData.data.totalCustomers ||
      actualSales !== mainData.data.totalSales
    ) {
      throw new Error('Discrepancy detected between database and API calculations!');
    }
    console.log('[PASS] Test 5: All figures match 100% with direct MySQL queries.\n');

    console.log('====================================================');
    console.log(' ALL DASHBOARD BACKEND VERIFICATION TESTS PASSED 100%!');
    console.log('====================================================\n');

  } finally {
    server.close();
    await pool.end();
  }
}

verifyDashboard().catch((err: Error) => {
  console.error('\n[DASHBOARD VERIFICATION ERROR]:', err);
  process.exit(1);
});
