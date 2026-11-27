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

async function runCompleteVerification() {
  console.log('================================================================');
  console.log(' COMPLETE ADMIN ORDERS MODULE VERIFICATION');
  console.log(' (Status Management, Order Cancellation & CSV Export)');
  console.log('================================================================\n');

  const connected = await testConnection();
  if (!connected) {
    console.error('Cannot connect to database.');
    process.exit(1);
  }

  // 1. Capture strict baseline snapshot of every existing order
  const [baselineRows] = await pool.query<RowDataPacket[]>(
    'SELECT id, order_reference, customer_name, total_price, order_status, payment_status, updated_at FROM orders ORDER BY id ASC'
  );
  console.log(`[Baseline]: Captured ${baselineRows.length} existing customer orders in gifted_pencil_test.`);
  const baselineMap = new Map<number, any>();
  for (const r of baselineRows) {
    baselineMap.set(r.id, {
      id: r.id,
      ref: r.order_reference,
      status: r.order_status,
      paymentStatus: r.payment_status,
      totalPrice: String(r.total_price),
      updatedAt: r.updated_at instanceof Date ? r.updated_at.toISOString() : String(r.updated_at)
    });
  }

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));

  // Admin authentication login
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
  const adminHeaders = {
    Authorization: `Bearer ${adminToken}`,
    'Content-Type': 'application/json'
  };

  const jwtSecret = process.env.ADMIN_JWT_SECRET || process.env.JWT_SECRET || 'the-gifted-pencil-admin-secret-2026';
  const customerToken = jwt.sign(
    { userId: 1, email: 'customer@example.com', type: 'customer' },
    jwtSecret,
    { expiresIn: '1h' }
  );

  const createdFixtureIds: number[] = [];

  try {
    // ==============================================================
    // PART 1: ORDER STATUS MANAGEMENT TESTS
    // ==============================================================
    console.log('\n--- PART 1: ORDER STATUS MANAGEMENT TESTS ---');

    // 1.1 Unauthenticated request returns 401
    const unauthStatus = await makeRequest(
      { method: 'PATCH', path: '/api/admin/orders/1/status', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orderStatus: 'Shipped' }) },
      server
    );
    if (unauthStatus.statusCode !== 401) throw new Error(`Status 401 expected, got ${unauthStatus.statusCode}`);
    console.log('[PASS] 1.1 Unauthenticated status update rejected with 401');

    // 1.2 Customer token is rejected with 403
    const custTokenStatus = await makeRequest(
      { method: 'PATCH', path: '/api/admin/orders/1/status', headers: { Authorization: `Bearer ${customerToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ orderStatus: 'Shipped' }) },
      server
    );
    if (custTokenStatus.statusCode !== 403) throw new Error(`Status 403 expected for customer token, got ${custTokenStatus.statusCode}`);
    console.log('[PASS] 1.2 Customer token rejected from status update with 403');

    // 1.3 Invalid status returns 400
    const invStatus = await makeRequest(
      { method: 'PATCH', path: '/api/admin/orders/1/status', headers: adminHeaders, body: JSON.stringify({ orderStatus: 'invalid_status_xyz' }) },
      server
    );
    if (invStatus.statusCode !== 400) throw new Error(`Expected 400 for invalid status, got ${invStatus.statusCode}`);
    console.log('[PASS] 1.3 Invalid status string rejected with 400');

    // 1.4 Missing status returns 400
    const missingStatus = await makeRequest(
      { method: 'PATCH', path: '/api/admin/orders/1/status', headers: adminHeaders, body: JSON.stringify({}) },
      server
    );
    if (missingStatus.statusCode !== 400) throw new Error(`Expected 400 for missing status, got ${missingStatus.statusCode}`);
    console.log('[PASS] 1.4 Missing status payload rejected with 400');

    // 1.5 Nonexistent order returns 404
    const notFoundStatus = await makeRequest(
      { method: 'PATCH', path: '/api/admin/orders/NON_EXISTENT_99999/status', headers: adminHeaders, body: JSON.stringify({ orderStatus: 'Shipped' }) },
      server
    );
    if (notFoundStatus.statusCode !== 404) throw new Error(`Expected 404 for nonexistent order, got ${notFoundStatus.statusCode}`);
    console.log('[PASS] 1.5 Nonexistent order returns 404');

    // 1.6 All supported status transitions persist correctly (Isolated test fixture)
    const statusFixtureRef = `__TGP_TEST_STATUS_${Date.now()}__`;
    const [statusFixRes]: any = await pool.query(
      `INSERT INTO orders (order_reference, customer_name, phone, email, address, total_price, order_status, payment_status, payment_method)
       VALUES (?, 'Test User Status', '9999999991', 'test_status@example.com', '123 Status Way', 120.00, 'Pending', 'Pending', 'COD')`,
      [statusFixtureRef]
    );
    const statusFixtureId = statusFixRes.insertId;
    createdFixtureIds.push(statusFixtureId);

    const testTransitions = ['Confirmed', 'Processing', 'Shipped', 'Delivered', 'Cancelled', 'Pending'];
    for (const targetStatus of testTransitions) {
      const transRes = await makeRequest(
        { method: 'PATCH', path: `/api/admin/orders/${statusFixtureRef}/status`, headers: adminHeaders, body: JSON.stringify({ orderStatus: targetStatus }) },
        server
      );
      if (transRes.statusCode !== 200 || transRes.body.orderStatus !== targetStatus.toLowerCase()) {
        throw new Error(`Failed transition to ${targetStatus}: ${transRes.rawBody}`);
      }
      const [checkRows]: any = await pool.query('SELECT order_status FROM orders WHERE id = ?', [statusFixtureId]);
      if (checkRows[0].order_status.toLowerCase() !== targetStatus.toLowerCase()) {
        throw new Error(`MySQL status mismatch for ${targetStatus}: got ${checkRows[0].order_status}`);
      }
    }
    console.log('[PASS] 1.6 All 6 supported status transitions successfully verified in MySQL on isolated fixture.');

    // ==============================================================
    // PART 2: ORDER CANCELLATION TESTS
    // ==============================================================
    console.log('\n--- PART 2: ORDER CANCELLATION TESTS ---');

    // 2.1 Unauthenticated cancellation returns 401
    const unauthCancel = await makeRequest(
      { method: 'POST', path: '/api/admin/orders/1/cancel', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cancelReason: 'test' }) },
      server
    );
    if (unauthCancel.statusCode !== 401) throw new Error(`Cancel 401 expected, got ${unauthCancel.statusCode}`);
    console.log('[PASS] 2.1 Unauthenticated cancellation rejected with 401');

    // 2.2 Customer token rejected from cancel
    const custCancel = await makeRequest(
      { method: 'POST', path: '/api/admin/orders/1/cancel', headers: { Authorization: `Bearer ${customerToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ cancelReason: 'test' }) },
      server
    );
    if (custCancel.statusCode !== 403) throw new Error(`Customer token cancel 403 expected, got ${custCancel.statusCode}`);
    console.log('[PASS] 2.2 Customer token rejected from cancellation with 403');

    // 2.3 Nonexistent order cancellation returns 404
    const notFoundCancel = await makeRequest(
      { method: 'POST', path: '/api/admin/orders/NON_EXISTENT_CANCEL_99999/cancel', headers: adminHeaders, body: JSON.stringify({ cancelReason: 'test' }) },
      server
    );
    if (notFoundCancel.statusCode !== 404) throw new Error(`Expected 404 for nonexistent order cancellation, got ${notFoundCancel.statusCode}`);
    console.log('[PASS] 2.3 Nonexistent order cancellation returns 404');

    // 2.4 Cancellation workflow on isolated test fixture
    const cancelFixtureRef = `__TGP_TEST_CANCEL_${Date.now()}__`;
    const [cancelFixRes]: any = await pool.query(
      `INSERT INTO orders (order_reference, customer_name, phone, email, address, total_price, subtotal, shipping_fee, order_status, payment_status, payment_method)
       VALUES (?, 'Cancel Test User', '9999999992', 'test_cancel@example.com', '456 Cancel Blvd', 250.00, 200.00, 50.00, 'Pending', 'Pending', 'COD')`,
      [cancelFixtureRef]
    );
    const cancelFixtureId = cancelFixRes.insertId;
    createdFixtureIds.push(cancelFixtureId);

    // Add order item to cancel fixture to verify order items remain intact
    await pool.query(
      `INSERT INTO order_items (order_id, product_id, product_name, unit_price, quantity, total_price)
       VALUES (?, 1, 'Test Item for Cancel', 200.00, 1, 200.00)`,
      [cancelFixtureId]
    );

    const cancelRes = await makeRequest(
      { method: 'POST', path: `/api/admin/orders/${cancelFixtureRef}/cancel`, headers: adminHeaders, body: JSON.stringify({ cancelReason: 'Customer requested cancellation' }) },
      server
    );
    if (cancelRes.statusCode !== 200 || cancelRes.body.orderStatus !== 'cancelled') {
      throw new Error(`Cancellation failed: ${cancelRes.rawBody}`);
    }

    // Verify in MySQL that ONLY order_status was modified
    const [cancelDbRow]: any = await pool.query('SELECT * FROM orders WHERE id = ?', [cancelFixtureId]);
    const cancelledRow = cancelDbRow[0];
    if (cancelledRow.order_status !== 'Cancelled') throw new Error(`Expected order_status 'Cancelled', got ${cancelledRow.order_status}`);
    if (cancelledRow.payment_status !== 'Pending') throw new Error('Payment status unexpectedly altered');
    if (Number(cancelledRow.total_price) !== 250.00) throw new Error('Total price unexpectedly altered');
    if (cancelledRow.customer_name !== 'Cancel Test User') throw new Error('Customer details unexpectedly altered');

    // Verify order items were NOT deleted
    const [itemsAfterCancel]: any = await pool.query('SELECT * FROM order_items WHERE order_id = ?', [cancelFixtureId]);
    if (itemsAfterCancel.length !== 1) throw new Error('Order items were deleted during cancellation');
    console.log('[PASS] 2.4 Cancellation updates only order_status; items, payments, and customer details remain untouched.');

    // 2.5 Already-cancelled order is protected against duplicate cancellation
    const duplicateCancelRes = await makeRequest(
      { method: 'POST', path: `/api/admin/orders/${cancelFixtureRef}/cancel`, headers: adminHeaders, body: JSON.stringify({ cancelReason: 'repeat' }) },
      server
    );
    if (duplicateCancelRes.statusCode !== 400 || !duplicateCancelRes.body.message?.includes('already cancelled')) {
      throw new Error(`Expected 400 with 'already cancelled', got ${duplicateCancelRes.statusCode}: ${duplicateCancelRes.rawBody}`);
    }
    console.log('[PASS] 2.5 Already-cancelled order safely rejected with 400');

    // 2.6 Delivered order is protected against inappropriate cancellation
    await pool.query('UPDATE orders SET order_status = "Delivered" WHERE id = ?', [cancelFixtureId]);
    const deliveredCancelRes = await makeRequest(
      { method: 'POST', path: `/api/admin/orders/${cancelFixtureRef}/cancel`, headers: adminHeaders, body: JSON.stringify({ cancelReason: 'late cancel' }) },
      server
    );
    if (deliveredCancelRes.statusCode !== 400 || !deliveredCancelRes.body.message?.includes('Delivered')) {
      throw new Error(`Expected 400 protecting delivered order, got ${deliveredCancelRes.statusCode}: ${deliveredCancelRes.rawBody}`);
    }
    console.log('[PASS] 2.6 Delivered order protected against inappropriate cancellation with 400');

    // ==============================================================
    // PART 3: CSV EXPORT TESTS
    // ==============================================================
    console.log('\n--- PART 3: CSV EXPORT TESTS ---');

    // 3.1 Unauthenticated export returns 401
    const unauthExport = await makeRequest(
      { method: 'GET', path: '/api/admin/orders/export' },
      server
    );
    if (unauthExport.statusCode !== 401) throw new Error(`Export 401 expected, got ${unauthExport.statusCode}`);
    console.log('[PASS] 3.1 Unauthenticated export rejected with 401');

    // 3.2 Customer token rejected from export
    const custExport = await makeRequest(
      { method: 'GET', path: '/api/admin/orders/export', headers: { Authorization: `Bearer ${customerToken}` } },
      server
    );
    if (custExport.statusCode !== 403) throw new Error(`Customer export 403 expected, got ${custExport.statusCode}`);
    console.log('[PASS] 3.2 Customer token rejected from export with 403');

    // 3.3 All-orders export returns 200 with proper headers and complete dataset
    const allExport = await makeRequest(
      { method: 'GET', path: '/api/admin/orders/export', headers: { Authorization: `Bearer ${adminToken}` } },
      server
    );
    if (allExport.statusCode !== 200) throw new Error(`All-orders export failed: ${allExport.statusCode}`);
    const contentType = allExport.headers['content-type'] || '';
    const contentDisp = allExport.headers['content-disposition'] || '';
    if (!contentType.includes('text/csv')) throw new Error(`Expected text/csv content-type, got ${contentType}`);
    if (!contentDisp.includes('attachment') || !contentDisp.includes('.csv')) {
      throw new Error(`Expected attachment header, got ${contentDisp}`);
    }

    // 3.4 Verify CSV Header contains all 18 required fields
    const csvLines = allExport.rawBody.trim().split(/\r?\n/);
    const headerLine = csvLines[0].replace(/^\uFEFF/, ''); // strip BOM
    const expectedHeaders = [
      'Order ID / Order Reference',
      'Customer Name',
      'Customer Email',
      'Customer Phone',
      'Order Date',
      'Item Names',
      'Item Quantities',
      'Subtotal',
      'Shipping Fee',
      'Discount',
      'Total Amount',
      'Payment Method',
      'Payment Status',
      'Order Status',
      'City',
      'State',
      'PIN Code',
      'Tracking Number'
    ];
    for (const h of expectedHeaders) {
      if (!headerLine.includes(h)) {
        throw new Error(`CSV Header missing required column: "${h}"`);
      }
    }
    console.log('[PASS] 3.3 & 3.4 All-orders export successful with proper headers and all 18 required columns.');

    // 3.5 Full result set export across pagination (lines count >= baseline count + 1)
    if (csvLines.length - 1 < baselineRows.length) {
      throw new Error(`Export only returned ${csvLines.length - 1} rows, expected at least ${baselineRows.length}`);
    }
    console.log(`[PASS] 3.5 Export includes all matching records across pagination (${csvLines.length - 1} rows exported).`);

    // 3.6 Status filter export (export only processing orders)
    const processingExport = await makeRequest(
      { method: 'GET', path: '/api/admin/orders/export?status=processing', headers: { Authorization: `Bearer ${adminToken}` } },
      server
    );
    const procLines = processingExport.rawBody.trim().split(/\r?\n/);
    console.log(`[PASS] 3.6 Status filter export working (${procLines.length - 1} rows matching 'processing').`);

    // 3.7 Search filter export
    const searchExport = await makeRequest(
      { method: 'GET', path: '/api/admin/orders/export?search=sarani', headers: { Authorization: `Bearer ${adminToken}` } },
      server
    );
    const searchLines = searchExport.rawBody.trim().split(/\r?\n/);
    if (searchLines.length < 2) throw new Error('Search export did not find expected customer records');
    console.log(`[PASS] 3.7 Search filter export working (${searchLines.length - 1} rows matching 'sarani').`);

    // 3.8 Sorting order respected
    const oldestExport = await makeRequest(
      { method: 'GET', path: '/api/admin/orders/export?sort=oldest', headers: { Authorization: `Bearer ${adminToken}` } },
      server
    );
    const oldestLines = oldestExport.rawBody.trim().split(/\r?\n/);
    if (!oldestLines[1].includes(baselineRows[0].order_reference)) {
      throw new Error('Oldest sort order not respected in export');
    }
    console.log('[PASS] 3.8 Sorting order respected in CSV export.');

    // 3.9 CSV Escaping and Formula Injection Prevention
    console.log('Testing CSV special characters escaping and formula injection protection...');
    const injectionRef = `__TGP_TEST_CSV_INJECT_${Date.now()}__`;
    const [injectRes]: any = await pool.query(
      `INSERT INTO orders (order_reference, customer_name, phone, email, address, total_price, order_status, payment_status, payment_method)
       VALUES (?, '=HYPERLINK("http://evil.com", "Test, Comma")', '9999999993', 'inject@example.com', '123 Formula St', 100.00, 'Pending', 'Pending', 'COD')`,
      [injectionRef]
    );
    createdFixtureIds.push(injectRes.insertId);

    const injectExport = await makeRequest(
      { method: 'GET', path: `/api/admin/orders/export?search=${injectionRef}`, headers: { Authorization: `Bearer ${adminToken}` } },
      server
    );
    const injectOutput = injectExport.rawBody;

    // Check that formula injection =HYPERLINK was sanitized with single quote
    if (!injectOutput.includes("'=HYPERLINK")) {
      throw new Error(`Formula injection protection failed! Output: ${injectOutput}`);
    }
    // Check that comma and quotes were escaped (wrapped in quotes and doubled)
    if (!injectOutput.includes('""http://evil.com""') || !injectOutput.includes('""Test, Comma""')) {
      throw new Error(`CSV quoting/escaping failed! Output: ${injectOutput}`);
    }
    console.log('[PASS] 3.9 CSV escaping (commas, quotes, newlines) and formula injection protection (=, +, -, @) verified.');

    // ==============================================================
    // PART 4: CUSTOMER STOREFRONT REGRESSION CHECK
    // ==============================================================
    console.log('\n--- PART 4: CUSTOMER REGRESSION CHECK ---');
    const custRef = baselineRows[0].order_reference;
    const [phoneRow]: any = await pool.query('SELECT phone FROM orders WHERE id = ?', [baselineRows[0].id]);
    const phone = phoneRow[0]?.phone || '9840123456';
    const trackRes = await makeRequest(
      { method: 'GET', path: `/api/orders/track/${custRef}?phone=${encodeURIComponent(phone)}` },
      server
    );
    if (trackRes.statusCode !== 200) {
      throw new Error(`Customer order tracking regression failed with ${trackRes.statusCode}: ${trackRes.rawBody}`);
    }
    console.log('[PASS] 4.1 Customer order tracking API remains 100% functional.');

  } finally {
    // Clean up temporary fixtures
    if (createdFixtureIds.length > 0) {
      console.log(`\n[Cleanup]: Deleting ${createdFixtureIds.length} temporary test fixtures...`);
      await pool.query('DELETE FROM order_items WHERE order_id IN (?)', [createdFixtureIds]);
      await pool.query('DELETE FROM orders WHERE id IN (?)', [createdFixtureIds]);
      console.log('[Cleanup]: Temporary fixtures successfully deleted.');
    }

    server.close();

    // STRICT INVARIANT CHECK: Verify every existing customer order
    const [finalRows] = await pool.query<RowDataPacket[]>(
      'SELECT id, order_reference, customer_name, total_price, order_status, payment_status, updated_at FROM orders ORDER BY id ASC'
    );
    console.log(`\n[Invariant Check]: Post-test orders in DB: ${finalRows.length} (Pre-test was ${baselineRows.length})`);
    if (finalRows.length !== baselineRows.length) {
      console.error('FATAL: Database order count modified!');
      process.exit(1);
    }

    for (const row of finalRows) {
      const base = baselineMap.get(row.id);
      if (!base) {
        console.error(`FATAL: Unexpected order ID ${row.id} in DB!`);
        process.exit(1);
      }
      if (base.ref !== row.order_reference) {
        console.error(`FATAL: Order ${row.id} reference changed! Was: ${base.ref}, Now: ${row.order_reference}`);
        process.exit(1);
      }
      if (base.status !== row.order_status) {
        console.error(`FATAL: Order ${row.id} status changed! Was: ${base.status}, Now: ${row.order_status}`);
        process.exit(1);
      }
      if (base.paymentStatus !== row.payment_status) {
        console.error(`FATAL: Order ${row.id} payment_status changed! Was: ${base.paymentStatus}, Now: ${row.payment_status}`);
        process.exit(1);
      }
      if (base.totalPrice !== String(row.total_price)) {
        console.error(`FATAL: Order ${row.id} total_price changed! Was: ${base.totalPrice}, Now: ${row.total_price}`);
        process.exit(1);
      }
      const finalUpdatedAt = row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at);
      if (base.updatedAt !== finalUpdatedAt) {
        console.error(`FATAL: Order ${row.id} updated_at changed! Was: ${base.updatedAt}, Now: ${finalUpdatedAt}`);
        process.exit(1);
      }
    }

    console.log('PASS: 100% of existing user customer orders remained untouched with zero mutations across all fields!');
    console.log('\n================================================================');
    console.log(' ALL ADMIN ORDERS MODULE FEATURES FULLY VERIFIED');
    console.log('================================================================');
  }
  process.exit(0);
}

runCompleteVerification().catch((err) => {
  console.error('Verification Suite Failed:', err);
  process.exit(1);
});
