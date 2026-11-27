/**
 * Dedicated Automated Test Suite for Product Stock Deduction During Order Creation
 * Tests all 6 required scenarios:
 *
 * 1. Order for quantity 2 with stock 100 -> stock becomes 98.
 * 2. Order quantity equal to available stock -> succeeds and stock becomes 0.
 * 3. Order quantity greater than available stock -> rejected; no order created.
 * 4. Two concurrent orders competing for the last available stock -> only valid orders succeed.
 * 5. Order creation failure -> transaction rolls back and stock remains unchanged.
 * 6. Existing order status update -> stock is not deducted again.
 */

const http = require('http');
const app = require('../dist/app').default;
const { default: pool } = require('../dist/config/db');

let server;
let currentPort;

function apiRequest(method, path, body = null, token = null) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request({
      hostname: '127.0.0.1',
      port: currentPort,
      path,
      method,
      headers: {
        'Accept': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        ...(data ? {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data)
        } : {})
      }
    }, res => {
      let chunks = '';
      res.on('data', c => chunks += c);
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(chunks); } catch {}
        resolve({
          status: res.statusCode,
          data: json,
          raw: chunks
        });
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function runStockDeductionTests() {
  console.log('================================================================');
  console.log('   PRODUCT STOCK DEDUCTION ATOMICITY TEST SUITE (6 SCENARIOS)   ');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, message, details = '') {
    if (condition) {
      console.log(`[PASS] ${message}`);
      if (details) console.log(`       -> ${details}`);
      passed++;
    } else {
      console.error(`[FAIL] ${message}`);
      if (details) console.error(`       -> ${details}`);
      failed++;
    }
  }

  let createdProductIds = [];
  let createdOrderIds = [];

  try {
    server = await new Promise(resolve => {
      const s = app.listen(0, '127.0.0.1', () => {
        currentPort = s.address().port;
        console.log(`[TEST SERVER] In-process server running on port ${currentPort}\n`);
        resolve(s);
      });
    });

    // Helper to create an isolated test product
    async function createTestProduct(initialStock, name = 'Stock Test Product') {
      const uniqueSlug = `stock-test-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
      const [result] = await pool.query(
        `INSERT INTO products (
          name, slug, category_id, subtitle, price, original_price,
          stock_quantity, description, is_active
        ) VALUES (?, ?, 1, 'Stock Test', 199.00, 249.00, ?, 'Testing stock deduction', 1)`,
        [name, uniqueSlug, initialStock]
      );
      const pId = result.insertId;
      createdProductIds.push(pId);
      return pId;
    }

    // Helper to get fresh stock
    async function getStock(productId) {
      const [rows] = await pool.query('SELECT stock_quantity FROM products WHERE id = ?', [productId]);
      return rows.length > 0 ? Number(rows[0].stock_quantity) : null;
    }

    // -------------------------------------------------------------------------
    // Scenario 1: Order for quantity 2 with stock 100 -> stock becomes 98
    // -------------------------------------------------------------------------
    console.log('--- SCENARIO 1: Basic Stock Deduction ---');
    const pId1 = await createTestProduct(100, 'Scenario 1 Journal');
    const res1 = await apiRequest('POST', '/api/orders', {
      product_id: pId1,
      customer_name: 'Test Customer',
      phone: '9840123456',
      address: '12 Rose Lane, Chennai',
      quantity: 2
    });
    const order1 = res1.data?.order || res1.data?.data?.order;
    if (order1?.id) createdOrderIds.push(Number(order1.id));
    const stockAfter1 = await getStock(pId1);

    assert(
      res1.status === 201 && stockAfter1 === 98,
      '1. Order for quantity 2 with stock 100 -> stock becomes 98',
      `Order status: ${res1.status}, Initial: 100, Ordered: 2, Remaining Stock: ${stockAfter1}`
    );

    // -------------------------------------------------------------------------
    // Scenario 2: Order quantity equal to available stock -> succeeds and stock becomes 0
    // -------------------------------------------------------------------------
    console.log('\n--- SCENARIO 2: Order Exactly Available Stock ---');
    const pId2 = await createTestProduct(5, 'Scenario 2 Notebook');
    const res2 = await apiRequest('POST', '/api/orders', {
      product_id: pId2,
      customer_name: 'Test Customer',
      phone: '9840123456',
      address: '12 Rose Lane, Chennai',
      quantity: 5
    });
    const order2 = res2.data?.order || res2.data?.data?.order;
    if (order2?.id) createdOrderIds.push(Number(order2.id));
    const stockAfter2 = await getStock(pId2);

    assert(
      res2.status === 201 && stockAfter2 === 0,
      '2. Order quantity equal to available stock (5/5) -> succeeds and stock becomes 0',
      `Order status: ${res2.status}, Initial: 5, Ordered: 5, Remaining Stock: ${stockAfter2}`
    );

    // -------------------------------------------------------------------------
    // Scenario 3: Order quantity greater than available stock -> rejected; no order created
    // -------------------------------------------------------------------------
    console.log('\n--- SCENARIO 3: Excess Quantity Rejection ---');
    const pId3 = await createTestProduct(3, 'Scenario 3 Planner');
    const res3 = await apiRequest('POST', '/api/orders', {
      product_id: pId3,
      customer_name: 'Test Customer',
      phone: '9840123456',
      address: '12 Rose Lane, Chennai',
      quantity: 4
    });
    const order3 = res3.data?.order || res3.data?.data?.order;
    if (order3?.id) createdOrderIds.push(Number(order3.id));
    const stockAfter3 = await getStock(pId3);
    const [ordersCount3] = await pool.query('SELECT count(*) as count FROM order_items WHERE product_id = ?', [pId3]);

    assert(
      res3.status === 400 && stockAfter3 === 3 && ordersCount3[0].count === 0,
      '3. Order quantity (4) greater than available stock (3) -> rejected; stock unchanged (3) and no order created',
      `Status: ${res3.status}, Error: "${res3.data?.message}", Stock: ${stockAfter3}, Order items created: ${ordersCount3[0].count}`
    );

    // -------------------------------------------------------------------------
    // Scenario 4: Two concurrent orders competing for the last available stock -> only valid orders succeed
    // -------------------------------------------------------------------------
    console.log('\n--- SCENARIO 4: Concurrent Orders for Last Stock ---');
    const pId4 = await createTestProduct(1, 'Scenario 4 Rare Item');

    // Launch two simultaneous order requests for quantity 1
    const [concurrentRes1, concurrentRes2] = await Promise.all([
      apiRequest('POST', '/api/orders', {
        product_id: pId4,
        customer_name: 'Buyer One',
        phone: '9840111111',
        address: '10 Alpha Way, Chennai',
        quantity: 1
      }),
      apiRequest('POST', '/api/orders', {
        product_id: pId4,
        customer_name: 'Buyer Two',
        phone: '9840222222',
        address: '20 Beta Road, Chennai',
        quantity: 1
      })
    ]);

    const order4a = concurrentRes1.data?.order || concurrentRes1.data?.data?.order;
    const order4b = concurrentRes2.data?.order || concurrentRes2.data?.data?.order;
    if (order4a?.id) createdOrderIds.push(Number(order4a.id));
    if (order4b?.id) createdOrderIds.push(Number(order4b.id));

    const stockAfter4 = await getStock(pId4);
    const statuses4 = [concurrentRes1.status, concurrentRes2.status].sort();
    const successCount4 = [concurrentRes1.status, concurrentRes2.status].filter(s => s === 201).length;
    const failCount4 = [concurrentRes1.status, concurrentRes2.status].filter(s => s === 400).length;

    assert(
      successCount4 === 1 && failCount4 === 1 && stockAfter4 === 0,
      '4. Two concurrent orders competing for last item (stock: 1) -> exactly 1 succeeds, 1 rejected, stock ends at 0',
      `Statuses: [${statuses4.join(', ')}], Final stock: ${stockAfter4}, Success count: ${successCount4}, Rejected count: ${failCount4}`
    );

    // -------------------------------------------------------------------------
    // Scenario 5: Order creation failure -> transaction rolls back and stock remains unchanged
    // -------------------------------------------------------------------------
    console.log('\n--- SCENARIO 5: Transaction Rollback on Failure ---');
    const pId5Valid = await createTestProduct(10, 'Scenario 5 Valid Part');
    const pId5Low = await createTestProduct(1, 'Scenario 5 Low Stock Part');

    // Multi-item checkout where item 1 has stock but item 2 exceeds stock (qty: 2 > 1)
    const res5 = await apiRequest('POST', '/api/orders/checkout', {
      items: [
        { product_id: pId5Valid, quantity: 2 },
        { product_id: pId5Low, quantity: 2 } // exceeds available stock 1
      ],
      customer_name: 'Rollback Tester',
      phone: '9840123456',
      pincode: '600001',
      address: 'Fail Suite Road',
      city: 'Chennai',
      state: 'Tamil Nadu'
    });

    const order5 = res5.data?.order || res5.data?.data?.order;
    if (order5?.id) createdOrderIds.push(Number(order5.id));

    const stock5ValidAfter = await getStock(pId5Valid);
    const stock5LowAfter = await getStock(pId5Low);
    const [ordersCount5] = await pool.query('SELECT count(*) as count FROM order_items WHERE product_id IN (?, ?)', [pId5Valid, pId5Low]);

    assert(
      res5.status === 400 && stock5ValidAfter === 10 && stock5LowAfter === 1 && ordersCount5[0].count === 0,
      '5. Multi-item checkout failure rolls back entire transaction: first item stock restored (10), zero order items created',
      `Status: ${res5.status}, Error: "${res5.data?.message}", Stock 1: ${stock5ValidAfter} (was 10), Stock 2: ${stock5LowAfter} (was 1), Order items created: ${ordersCount5[0].count}`
    );

    // -------------------------------------------------------------------------
    // Scenario 6: Existing order status update -> stock is not deducted again
    // -------------------------------------------------------------------------
    console.log('\n--- SCENARIO 6: Status Update Immunity ---');
    const pId6 = await createTestProduct(20, 'Scenario 6 Item');
    const res6Order = await apiRequest('POST', '/api/orders', {
      product_id: pId6,
      customer_name: 'Status Tester',
      phone: '9840123456',
      address: '77 Status Road, Chennai',
      quantity: 3
    });
    const order6 = res6Order.data?.order || res6Order.data?.data?.order;
    if (order6?.id) createdOrderIds.push(Number(order6.id));
    const stockAfter6Order = await getStock(pId6);

    // Perform payment verification which transitions payment_status to 'Paid' and order_status to 'Processing'
    const payCreate6 = await apiRequest('POST', '/api/payment/create-order', {
      order_reference: order6.order_reference,
      payment_method: 'UPI',
      phone: '9840123456'
    });
    const txn6 = payCreate6.data?.payment_order?.transaction_id || payCreate6.data?.data?.payment_order?.transaction_id;

    const verify6 = await apiRequest('POST', '/api/payment/verify', {
      transaction_id: txn6,
      phone: '9840123456',
      simulate_status: 'SUCCESS'
    });

    const stockAfterStatusUpdate = await getStock(pId6);

    assert(
      res6Order.status === 201 &&
      stockAfter6Order === 17 &&
      verify6.status === 200 &&
      stockAfterStatusUpdate === 17,
      '6. Existing order status update (Pending -> Processing / Paid) does NOT deduct stock again',
      `Initial: 20, After Order: ${stockAfter6Order}, After Status Transition: ${stockAfterStatusUpdate}`
    );

  } catch (err) {
    console.error('Fatal test error:', err);
    failed++;
  } finally {
    console.log('\n--- SAFE CLEANUP OF ONLY TEST RECORDS ---');
    try {
      if (createdOrderIds.length > 0) {
        await pool.query('DELETE FROM order_items WHERE order_id IN (?)', [createdOrderIds]);
        await pool.query('DELETE FROM payments WHERE order_id IN (?)', [createdOrderIds]);
        await pool.query('DELETE FROM orders WHERE id IN (?)', [createdOrderIds]);
        console.log(`[CLEANUP] Deleted test orders: ${createdOrderIds.join(', ')}`);
      }
      if (createdProductIds.length > 0) {
        await pool.query('DELETE FROM products WHERE id IN (?)', [createdProductIds]);
        console.log(`[CLEANUP] Deleted test products: ${createdProductIds.join(', ')}`);
      }
    } catch (cleanupErr) {
      console.warn('[CLEANUP WARNING] Failed to clean up test records:', cleanupErr.message);
    }

    if (server) {
      server.close();
    }

    console.log('\n================================================================');
    console.log(`TOTAL TESTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
    console.log('================================================================\n');

    if (failed > 0) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  }
}

runStockDeductionTests().then(() => {
  pool.end();
}).catch(err => {
  console.error('Test execution failed:', err);
  pool.end();
  process.exit(1);
});
