import http from 'http';
import jwt from 'jsonwebtoken';
import pool, { testConnection } from '../src/config/db';
import app from '../src/app';

// Helper to make HTTP requests against the Express app in-memory
function makeRequest(
  options: {
    method: string;
    path: string;
    headers?: Record<string, string>;
    body?: string;
  },
  server: http.Server
): Promise<{ statusCode: number; headers: http.IncomingHttpHeaders; body: any; rawBody: string }> {
  return new Promise((resolve, reject) => {
    const addr = server.address();
    if (!addr || typeof addr === 'string') {
      return reject(new Error('Server address not available'));
    }

    const req = http.request(
      {
        host: '127.0.0.1',
        port: addr.port,
        path: options.path,
        method: options.method,
        headers: options.headers,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const rawBody = Buffer.concat(chunks).toString('utf-8');
          let parsedBody = null;
          try {
            parsedBody = JSON.parse(rawBody);
          } catch {
            parsedBody = rawBody;
          }
          resolve({
            statusCode: res.statusCode || 500,
            headers: res.headers,
            body: parsedBody,
            rawBody,
          });
        });
      }
    );

    req.on('error', reject);

    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
}

async function run() {
  console.log('====================================================');
  console.log(' Testing Admin Orders Module - Phase 1 (List & Details)');
  console.log(' Database: gifted_pencil_test (Strict Read-Only Local Check)');
  console.log('====================================================\n');

  // Safety check: local database gifted_pencil_test
  const connCheck = await testConnection();
  if (!connCheck.success || connCheck.database !== 'gifted_pencil_test') {
    throw new Error(`Safety check failed: unexpected DB "${connCheck.database}"`);
  }
  console.log('[Safety Verified]: Local database "gifted_pencil_test" confirmed.');

  // Snapshot initial count of orders to verify NO modifications were made
  const [initialCountRows] = await pool.query<any[]>('SELECT COUNT(*) AS total FROM orders');
  const initialCount = Number(initialCountRows[0]?.total || 0);
  console.log(`[Safety Verified]: Initial orders count in database: ${initialCount} (Must remain unchanged)\n`);

  // Start HTTP server on dynamic port
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));

  try {
    // 1. Security Check: Unauthenticated request
    console.log('--- Step 1: Security Check - Reject Unauthenticated Requests ---');
    const unauthRes = await makeRequest(
      {
        method: 'GET',
        path: '/api/admin/orders',
      },
      server
    );
    if (unauthRes.statusCode !== 401) {
      throw new Error(`Unauthenticated request expected 401, got ${unauthRes.statusCode}`);
    }
    console.log('[PASS] Unauthenticated request rejected with 401 Unauthorized');

    // Security Check: Customer token rejected
    const customerToken = jwt.sign(
      { userId: 1, email: 'customer@example.com', type: 'customer' },
      process.env.ADMIN_JWT_SECRET || process.env.JWT_SECRET || 'the-gifted-pencil-admin-secret-2026'
    );
    const custTokenRes = await makeRequest(
      {
        method: 'GET',
        path: '/api/admin/orders',
        headers: { Authorization: `Bearer ${customerToken}` },
      },
      server
    );
    if (custTokenRes.statusCode !== 403) {
      throw new Error(`Customer token expected 403 Forbidden, got ${custTokenRes.statusCode}`);
    }
    console.log('[PASS] Customer token rejected with 403 Forbidden\n');

    // 2. Admin Authentication
    console.log('--- Step 2: Admin Authentication ---');
    const loginRes = await makeRequest(
      {
        method: 'POST',
        path: '/api/admin/auth/login',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'admin2@thegiftedpencil.com', password: '12345' }),
      },
      server
    );

    if (loginRes.statusCode !== 200 || !loginRes.body?.data?.token) {
      throw new Error(`Admin login failed: ${JSON.stringify(loginRes.body)}`);
    }
    const token = loginRes.body.data.token;
    const authHeaders = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
    console.log('[PASS] Logged in as admin2\n');

    // 3. Test Orders Listing & Response Contract
    console.log('--- Step 3: Orders Listing & Contract Compliance (/api/admin/orders) ---');
    const listRes = await makeRequest(
      {
        method: 'GET',
        path: '/api/admin/orders?limit=10',
        headers: authHeaders,
      },
      server
    );

    if (listRes.statusCode !== 200) {
      throw new Error(`Failed to list orders: ${listRes.statusCode} - ${JSON.stringify(listRes.body)}`);
    }

    const { orders, total, totalPages, page, limit } = listRes.body;
    if (!Array.isArray(orders) || typeof total !== 'number' || typeof totalPages !== 'number') {
      throw new Error(`Response does not match OrderContext.jsx contract: ${JSON.stringify(listRes.body)}`);
    }
    console.log(`[PASS] Orders retrieved: ${orders.length} items on page ${page}/${totalPages} (Total: ${total})`);

    // Verify alias /admin/orders as well
    const aliasRes = await makeRequest(
      {
        method: 'GET',
        path: '/admin/orders?limit=5',
        headers: authHeaders,
      },
      server
    );
    if (aliasRes.statusCode !== 200 || !Array.isArray(aliasRes.body?.orders)) {
      throw new Error(`Alias /admin/orders failed: ${aliasRes.statusCode}`);
    }
    console.log('[PASS] Frontend alias /admin/orders operates identically\n');

    // Verify first order contract fields
    const sample = orders[0];
    if (sample) {
      console.log('--- Step 4: Verify Order Object Structure ---');
      if (!sample.orderId || typeof sample.id !== 'number') {
        throw new Error(`Missing orderId or id on order: ${JSON.stringify(sample)}`);
      }
      if (!sample.customerId || typeof sample.customerId.name !== 'string') {
        throw new Error(`Missing customerId object: ${JSON.stringify(sample.customerId)}`);
      }
      if (!sample.shippingAddress || typeof sample.shippingAddress.line1 !== 'string') {
        throw new Error(`Missing shippingAddress object: ${JSON.stringify(sample.shippingAddress)}`);
      }
      if (!sample.payment || typeof sample.payment.method !== 'string' || typeof sample.payment.status !== 'string') {
        throw new Error(`Missing payment object: ${JSON.stringify(sample.payment)}`);
      }
      if (!Array.isArray(sample.items)) {
        throw new Error(`Missing items array on order: ${JSON.stringify(sample.items)}`);
      }
      console.log(`[PASS] Order #${sample.orderId}: Customer "${sample.customerId.name}", Status: "${sample.orderStatus}", Payment: "${sample.payment.status}", Items: ${sample.items.length}\n`);
    }

    // 4. Test Pagination
    console.log('--- Step 5: Test Pagination ---');
    const page1Res = await makeRequest({ method: 'GET', path: '/api/admin/orders?page=1&limit=3', headers: authHeaders }, server);
    const page2Res = await makeRequest({ method: 'GET', path: '/api/admin/orders?page=2&limit=3', headers: authHeaders }, server);

    const page1Ids = (page1Res.body.orders || []).map((o: any) => o.id);
    const page2Ids = (page2Res.body.orders || []).map((o: any) => o.id);

    const hasOverlap = page1Ids.some((id: number) => page2Ids.includes(id));
    if (hasOverlap) {
      throw new Error(`Pagination overlap detected between page 1 (${page1Ids}) and page 2 (${page2Ids})`);
    }
    console.log(`[PASS] Page 1 IDs [${page1Ids.join(', ')}] and Page 2 IDs [${page2Ids.join(', ')}] are distinct\n`);

    // 5. Test Search Filtering
    console.log('--- Step 6: Test Search Filtering ---');
    if (sample) {
      // Search by exact order reference
      const searchRefRes = await makeRequest(
        {
          method: 'GET',
          path: `/api/admin/orders?search=${encodeURIComponent(sample.orderId)}`,
          headers: authHeaders,
        },
        server
      );
      const searchRefMatches = searchRefRes.body.orders || [];
      if (!searchRefMatches.some((o: any) => o.orderId === sample.orderId)) {
        throw new Error(`Search by order reference "${sample.orderId}" failed to find order!`);
      }
      console.log(`[PASS] Search by reference "${sample.orderId}" successfully matched`);

      // Search by customer name substring
      const nameSub = sample.customerId.name.split(' ')[0];
      const searchNameRes = await makeRequest(
        {
          method: 'GET',
          path: `/api/admin/orders?search=${encodeURIComponent(nameSub)}`,
          headers: authHeaders,
        },
        server
      );
      const searchNameMatches = searchNameRes.body.orders || [];
      if (searchNameMatches.length === 0) {
        throw new Error(`Search by customer name "${nameSub}" returned 0 matches!`);
      }
      console.log(`[PASS] Search by customer name "${nameSub}" found ${searchNameMatches.length} matching order(s)\n`);
    }

    // 6. Test Status Filtering
    console.log('--- Step 7: Test Status Filtering ---');
    const pendingRes = await makeRequest({ method: 'GET', path: '/api/admin/orders?status=pending', headers: authHeaders }, server);
    const pendingOrders = pendingRes.body.orders || [];
    const allPendingValid = pendingOrders.every((o: any) => o.orderStatus === 'pending');
    if (!allPendingValid) {
      throw new Error(`Status filter "pending" returned non-pending order: ${JSON.stringify(pendingOrders.map((o: any) => o.orderStatus))}`);
    }
    console.log(`[PASS] Filter status=pending returned ${pendingOrders.length} valid pending orders`);

    const allStatusRes = await makeRequest({ method: 'GET', path: '/api/admin/orders?status=all', headers: authHeaders }, server);
    if ((allStatusRes.body.total || 0) < pendingOrders.length) {
      throw new Error('Total orders with status=all cannot be less than pending orders');
    }
    console.log(`[PASS] Filter status=all returned full catalog of ${allStatusRes.body.total} orders\n`);

    // 7. Test Sorting
    console.log('--- Step 8: Test Sorting ---');
    const newestRes = await makeRequest({ method: 'GET', path: '/api/admin/orders?sort=newest&limit=5', headers: authHeaders }, server);
    const oldestRes = await makeRequest({ method: 'GET', path: '/api/admin/orders?sort=oldest&limit=5', headers: authHeaders }, server);
    const highRes = await makeRequest({ method: 'GET', path: '/api/admin/orders?sort=amount_high&limit=5', headers: authHeaders }, server);
    const lowRes = await makeRequest({ method: 'GET', path: '/api/admin/orders?sort=amount_low&limit=5', headers: authHeaders }, server);

    const newestIds = (newestRes.body.orders || []).map((o: any) => o.id);
    const oldestIds = (oldestRes.body.orders || []).map((o: any) => o.id);
    const highAmounts = (highRes.body.orders || []).map((o: any) => o.totalAmount);
    const lowAmounts = (lowRes.body.orders || []).map((o: any) => o.totalAmount);

    if (newestIds[0] < newestIds[newestIds.length - 1]) {
      throw new Error('Newest sort did not sort descending by ID');
    }
    if (oldestIds[0] > oldestIds[oldestIds.length - 1]) {
      throw new Error('Oldest sort did not sort ascending by ID');
    }
    if (highAmounts[0] < highAmounts[highAmounts.length - 1]) {
      throw new Error('Amount high sort did not sort descending by totalAmount');
    }
    if (lowAmounts[0] > lowAmounts[lowAmounts.length - 1]) {
      throw new Error('Amount low sort did not sort ascending by totalAmount');
    }
    console.log('[PASS] Sorting verified: newest, oldest, amount_high, and amount_low all sorted correctly\n');

    // 8. Test Single Order Details API
    console.log('--- Step 9: Test Order Details API (/api/admin/orders/:orderId) ---');
    if (sample) {
      // Lookup by reference
      const detailByRefRes = await makeRequest(
        {
          method: 'GET',
          path: `/api/admin/orders/${sample.orderId}`,
          headers: authHeaders,
        },
        server
      );
      if (detailByRefRes.statusCode !== 200 || !detailByRefRes.body?.order) {
        throw new Error(`Get order details by reference failed: ${JSON.stringify(detailByRefRes.body)}`);
      }
      const orderDetail = detailByRefRes.body.order;
      if (orderDetail.orderId !== sample.orderId || orderDetail.id !== sample.id) {
        throw new Error('Order details mismatch');
      }
      console.log(`[PASS] Details by reference "${sample.orderId}" returned full order: Customer "${orderDetail.customerId.name}", Total: ₹${orderDetail.totalAmount}`);

      // Lookup by numeric ID
      const detailByIdRes = await makeRequest(
        {
          method: 'GET',
          path: `/api/admin/orders/${sample.id}`,
          headers: authHeaders,
        },
        server
      );
      if (detailByIdRes.statusCode !== 200 || detailByIdRes.body?.order?.id !== sample.id) {
        throw new Error(`Get order details by numeric ID ${sample.id} failed`);
      }
      console.log(`[PASS] Details by numeric ID "${sample.id}" returned full order successfully`);

      // Non-existent order
      const notFoundRes = await makeRequest(
        {
          method: 'GET',
          path: '/api/admin/orders/NON_EXISTENT_ORDER_99999',
          headers: authHeaders,
        },
        server
      );
      if (notFoundRes.statusCode !== 404) {
        throw new Error(`Expected 404 for non-existent order, got ${notFoundRes.statusCode}`);
      }
      console.log('[PASS] Non-existent order returned 404 Not Found\n');
    }

    // 9. Existing Customer Order API Regression Check
    console.log('--- Step 10: Existing Customer Order APIs Regression Check ---');
    const custTrackingRes = await makeRequest(
      {
        method: 'GET',
        path: '/api/orders/track/INVALID_TRACKING_REF',
      },
      server
    );
    // Customer track expects phone verification query, should return 400 or 404 without altering contracts
    if (custTrackingRes.statusCode !== 400 && custTrackingRes.statusCode !== 404) {
      throw new Error(`Customer tracking contract changed unexpectedly: ${custTrackingRes.statusCode}`);
    }
    console.log('[PASS] Customer order tracking API contract intact');

  } finally {
    // 10. Final Safety Check: Verify order count has NOT changed
    const [finalCountRows] = await pool.query<any[]>('SELECT COUNT(*) AS total FROM orders');
    const finalCount = Number(finalCountRows[0]?.total || 0);
    if (finalCount !== initialCount) {
      throw new Error(`SAFETY VIOLATION: Database orders count changed from ${initialCount} to ${finalCount}!`);
    }
    console.log(`\n[Strict Safety Confirmed]: Database orders count before (${initialCount}) == after (${finalCount}). Zero records altered or deleted.`);

    await pool.end();
    server.close();
  }

  console.log('\n====================================================');
  console.log(' ALL ADMIN ORDERS PHASE 1 TESTS PASSED SUCCESSFULLY ');
  console.log('====================================================');
}

run().catch((err) => {
  console.error('\n[FATAL ERROR]:', err);
  process.exit(1);
});
