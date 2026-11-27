import http from 'http';
import jwt from 'jsonwebtoken';
import pool, { testConnection } from '../src/config/db';
import app from '../src/app';
import { RowDataPacket } from 'mysql2';

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

async function runTests() {
  console.log('========================================================');
  console.log(' PHASE 2: ADMIN ORDER STATUS MANAGEMENT VERIFICATION');
  console.log('========================================================');

  const connected = await testConnection();
  if (!connected) {
    console.error('Cannot connect to database.');
    process.exit(1);
  }

  // 1. Pre-test baseline invariant check
  const [baselineRows] = await pool.query<RowDataPacket[]>(
    'SELECT id, order_reference, order_status FROM orders ORDER BY id ASC'
  );
  console.log(`[Baseline]: Total existing orders in DB: ${baselineRows.length}`);
  const baselineMap = new Map(baselineRows.map((r) => [r.id, { ref: r.order_reference, status: r.order_status }]));

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));

  // Log in as real admin to obtain a genuine admin token
  const loginRes = await makeRequest(
    {
      method: 'POST',
      path: '/api/admin/auth/login',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin2@thegiftedpencil.com', password: '12345' }),
    },
    server
  );

  const adminToken = loginRes.body?.data?.token || loginRes.body?.token;
  if (!adminToken) {
    throw new Error(`Admin login failed: ${JSON.stringify(loginRes.body)}`);
  }
  console.log('[Auth]: Logged in as admin2, obtained valid Admin JWT token.');

  const testFixtureRef = `__TGP_TEST_${Date.now()}__`;
  let fixtureId: number | null = null;

  try {
    // 2. Unauthorized request test
    console.log('\n--- Test 1: Unauthenticated PATCH request rejection ---');
    const unauthRes = await makeRequest(
      {
        method: 'PATCH',
        path: '/api/admin/orders/1/status',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderStatus: 'Shipped' })
      },
      server
    );
    console.log(`Status: ${unauthRes.statusCode} (Expected: 401)`);
    if (unauthRes.statusCode !== 401) throw new Error(`Expected 401 but got ${unauthRes.statusCode}`);
    console.log('PASS: Unauthorized request successfully blocked.');

    // 3. Invalid token test
    console.log('\n--- Test 2: Invalid JWT token rejection ---');
    const invalidTokenRes = await makeRequest(
      {
        method: 'PATCH',
        path: '/api/admin/orders/1/status',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer invalid.token.here'
        },
        body: JSON.stringify({ orderStatus: 'Shipped' })
      },
      server
    );
    console.log(`Status: ${invalidTokenRes.statusCode} (Expected: 401)`);
    if (invalidTokenRes.statusCode !== 401) throw new Error(`Expected 401 but got ${invalidTokenRes.statusCode}`);
    console.log('PASS: Invalid token rejected.');

    // 4. Invalid status validation test
    console.log('\n--- Test 3: Invalid status string validation ---');
    const invalidStatusRes = await makeRequest(
      {
        method: 'PATCH',
        path: '/api/admin/orders/1/status',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        },
        body: JSON.stringify({ orderStatus: 'bogus_status' })
      },
      server
    );
    console.log(`Status: ${invalidStatusRes.statusCode} (Expected: 400)`);
    console.log(`Message: ${invalidStatusRes.body?.message}`);
    if (invalidStatusRes.statusCode !== 400) throw new Error(`Expected 400 but got ${invalidStatusRes.statusCode}`);
    console.log('PASS: Invalid status rejected with HTTP 400.');

    // 5. Empty status validation test
    console.log('\n--- Test 4: Empty status validation ---');
    const emptyStatusRes = await makeRequest(
      {
        method: 'PATCH',
        path: '/api/admin/orders/1/status',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        },
        body: JSON.stringify({})
      },
      server
    );
    console.log(`Status: ${emptyStatusRes.statusCode} (Expected: 400)`);
    if (emptyStatusRes.statusCode !== 400) throw new Error(`Expected 400 but got ${emptyStatusRes.statusCode}`);
    console.log('PASS: Missing status rejected with HTTP 400.');

    // 6. Non-existent order test
    console.log('\n--- Test 5: Non-existent order 404 handling ---');
    const notFoundRes = await makeRequest(
      {
        method: 'PATCH',
        path: '/api/admin/orders/NON_EXISTENT_ORDER_999999/status',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`
        },
        body: JSON.stringify({ orderStatus: 'Shipped' })
      },
      server
    );
    console.log(`Status: ${notFoundRes.statusCode} (Expected: 404)`);
    if (notFoundRes.statusCode !== 404) throw new Error(`Expected 404 but got ${notFoundRes.statusCode}`);
    console.log('PASS: Non-existent order returns HTTP 404.');

    // 7. Dedicated Isolated Test Order Execution & Persistence
    console.log(`\n--- Test 6: Dedicated test fixture order lifecycle ---`);
    console.log(`Creating isolated test order with ref "${testFixtureRef}"...`);
    const [insertResult]: any = await pool.query(
      `INSERT INTO orders (
        order_reference, customer_name, phone, email, address, total_price, order_status, payment_status, payment_method
      ) VALUES (?, 'Phase2 Test Customer', '9876543210', 'test@example.com', '123 Test St', 150.00, 'Pending', 'Pending', 'COD')`,
      [testFixtureRef]
    );
    fixtureId = insertResult.insertId;
    console.log(`Created test fixture order id=${fixtureId}`);

    const statusesToTest = [
      { clientStatus: 'Confirmed', expectedDb: 'Confirmed', expectedClient: 'confirmed' },
      { clientStatus: 'processing', expectedDb: 'Processing', expectedClient: 'processing' },
      { clientStatus: 'Shipped', expectedDb: 'Shipped', expectedClient: 'shipped' },
      { clientStatus: 'delivered', expectedDb: 'Delivered', expectedClient: 'delivered' },
      { clientStatus: 'Cancelled', expectedDb: 'Cancelled', expectedClient: 'cancelled' },
      { clientStatus: 'Pending', expectedDb: 'Pending', expectedClient: 'pending' },
    ];

    for (const testCase of statusesToTest) {
      console.log(`Testing transition to "${testCase.clientStatus}"...`);

      // Test updating via order_reference
      const updateRes = await makeRequest(
        {
          method: 'PATCH',
          path: `/api/admin/orders/${testFixtureRef}/status`,
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${adminToken}`
          },
          body: JSON.stringify({ orderStatus: testCase.clientStatus })
        },
        server
      );

      if (updateRes.statusCode !== 200) {
        throw new Error(`Failed to update status to ${testCase.clientStatus}: status ${updateRes.statusCode}, body: ${updateRes.rawBody}`);
      }

      // Check response structure expected by OrderContext.jsx
      if (updateRes.body.orderStatus !== testCase.expectedClient) {
        throw new Error(`Response orderStatus expected "${testCase.expectedClient}" but got "${updateRes.body.orderStatus}"`);
      }
      if (!updateRes.body.order || updateRes.body.order.orderStatus !== testCase.expectedClient) {
        throw new Error(`Response order object not matching expected status`);
      }

      // Verify direct MySQL persistence
      const [dbRows]: any = await pool.query(
        'SELECT order_status FROM orders WHERE id = ?',
        [fixtureId]
      );
      if (dbRows[0].order_status !== testCase.expectedDb) {
        throw new Error(`MySQL DB order_status expected "${testCase.expectedDb}" but got "${dbRows[0].order_status}"`);
      }
      console.log(`  -> MySQL persisted "${dbRows[0].order_status}" correctly.`);

      // Also test route alias /admin/orders/:orderId/status
      const aliasRes = await makeRequest(
        {
          method: 'PATCH',
          path: `/admin/orders/${fixtureId}/status`,
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${adminToken}`
          },
          body: JSON.stringify({ orderStatus: testCase.clientStatus })
        },
        server
      );
      if (aliasRes.statusCode !== 200) {
        throw new Error(`Direct alias /admin/orders/:orderId/status failed with ${aliasRes.statusCode}`);
      }
    }
    console.log('PASS: All 6 order statuses successfully updated and verified in MySQL.');

    // 8. Regression test: Customer order APIs still work
    console.log('\n--- Test 7: Customer Order API regression check ---');
    const [custRow]: any = await pool.query('SELECT order_reference, phone FROM orders WHERE id != ? LIMIT 1', [fixtureId]);
    if (custRow.length > 0) {
      const custRef = custRow[0].order_reference;
      const custPhone = custRow[0].phone || '9876543210';
      const custRes = await makeRequest(
        {
          method: 'GET',
          path: `/api/orders/track/${custRef}?phone=${encodeURIComponent(custPhone)}`
        },
        server
      );
      console.log(`Customer GET /api/orders/track/${custRef}?phone=${custPhone} status: ${custRes.statusCode}`);
      if (custRes.statusCode !== 200) {
        throw new Error(`Customer orders API broken: status=${custRes.statusCode}, body=${custRes.rawBody}`);
      }
      console.log('PASS: Customer order tracking API remains fully functional.');
    }

  } finally {
    // 9. Guarantee test fixture cleanup
    if (fixtureId) {
      console.log(`\n[Cleanup]: Deleting test fixture order id=${fixtureId}...`);
      await pool.query('DELETE FROM orders WHERE id = ?', [fixtureId]);
      console.log('[Cleanup]: Test fixture deleted.');
    }

    server.close();

    // 10. Existing orders invariant check (post-test)
    const [finalRows] = await pool.query<RowDataPacket[]>(
      'SELECT id, order_reference, order_status FROM orders ORDER BY id ASC'
    );
    console.log(`\n[Invariant Check]: Post-test orders in DB: ${finalRows.length} (Pre-test was ${baselineRows.length})`);
    if (finalRows.length !== baselineRows.length) {
      console.error('FATAL: Database order count modified!');
      process.exit(1);
    }

    for (const row of finalRows) {
      const base = baselineMap.get(row.id);
      if (!base) {
        console.error(`FATAL: Unexpected order ID ${row.id} found in DB!`);
        process.exit(1);
      }
      if (base.ref !== row.order_reference || base.status !== row.order_status) {
        console.error(`FATAL: Existing order ID ${row.id} (${row.order_reference}) was mutated! Was: ${base.status}, Now: ${row.order_status}`);
        process.exit(1);
      }
    }
    console.log('PASS: 100% of existing user customer orders remained untouched with zero mutations!');
    console.log('\n========================================================');
    console.log(' ALL PHASE 2 TESTS PASSED SUCCESSFULLY');
    console.log('========================================================');
    process.exit(0);
  }
}

runTests().catch((err) => {
  console.error('Test Suite Failed:', err);
  process.exit(1);
});
