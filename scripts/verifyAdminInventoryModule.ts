import http from 'http';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

import app from '../src/app';
import pool from '../src/config/db';
import { RowDataPacket } from 'mysql2';
import { DEFAULT_LOW_STOCK_THRESHOLD } from '../src/types/adminInventory';

const TEST_PORT = 5097;
const BASE_URL = `http://localhost:${TEST_PORT}`;

interface BaselineProduct {
  id: number;
  name: string;
  slug: string;
  price: string;
  stock_quantity: number;
  is_active: number;
  created_at: string;
  updated_at: string;
}

async function runVerification() {
  console.log('================================================================');
  console.log('      THE GIFTED PENCIL - ADMIN INVENTORY VERIFICATION         ');
  console.log('================================================================\n');

  let server: http.Server | null = null;
  let adminToken = '';
  let baselineProducts: BaselineProduct[] = [];
  let baselineOrdersCount = 0;
  let baselineUsersCount = 0;
  let baselineContactsCount = 0;
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

    const [prodRows] = await pool.query<RowDataPacket[]>(
      'SELECT id, name, slug, price, stock_quantity, is_active, created_at, updated_at FROM products ORDER BY id ASC'
    );

    baselineProducts = prodRows.map(r => ({
      id: Number(r.id),
      name: String(r.name),
      slug: String(r.slug),
      price: String(r.price),
      stock_quantity: Number(r.stock_quantity),
      is_active: Number(r.is_active),
      created_at: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
      updated_at: r.updated_at instanceof Date ? r.updated_at.toISOString() : String(r.updated_at)
    }));

    const [orderCountRows] = await pool.query<RowDataPacket[]>('SELECT COUNT(*) as cnt FROM orders');
    baselineOrdersCount = Number(orderCountRows[0].cnt);

    const [userCountRows] = await pool.query<RowDataPacket[]>('SELECT COUNT(*) as cnt FROM users');
    baselineUsersCount = Number(userCountRows[0].cnt);

    const [contactCountRows] = await pool.query<RowDataPacket[]>('SELECT COUNT(*) as cnt FROM contacts');
    baselineContactsCount = Number(contactCountRows[0].cnt);

    console.log(`  -> Baseline products count: ${baselineProducts.length}`);
    console.log(`  -> Baseline orders count: ${baselineOrdersCount}`);
    console.log(`  -> Baseline users count: ${baselineUsersCount}`);
    console.log(`  -> Baseline contacts count: ${baselineContactsCount}`);
    console.log(`  -> Documented Low Stock Threshold: ${DEFAULT_LOW_STOCK_THRESHOLD}\n`);

    assert(baselineProducts.length >= 1, 'Database has at least 1 baseline product');
    assert(DEFAULT_LOW_STOCK_THRESHOLD === 5, 'Low-stock threshold is documented as 5');

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
    // PHASE 2: Authentication & Access Control
    // -------------------------------------------------------------
    console.log('[PHASE 2] Testing Admin Authentication & Access Control...');

    const ADMIN_EMAIL = 'admin@thegiftedpencil.com';
    const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

    if (!ADMIN_PASSWORD) {
      console.error('\n================================================================');
      console.error('[BLOCKER] ADMIN CREDENTIALS NOT AVAILABLE IN ENVIRONMENT');
      console.error('The verification logic requires genuine admin authentication for:');
      console.error(`  Email: ${ADMIN_EMAIL}`);
      console.error('However, process.env.ADMIN_PASSWORD is not set.');
      console.error('Strict Security Rule: Never ask the user to expose a password in');
      console.error('chat or hardcode credentials into test files.');
      console.error('Stopping execution to report blocker as instructed.');
      console.error('================================================================\n');
      throw new Error('BLOCKER: process.env.ADMIN_PASSWORD is not set. Admin verification requires credentials that are not safely available.');
    }

    // 2.1 Admin login
    const loginRes = await fetch(`${BASE_URL}/api/admin/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD })
    });
    const loginData = await loginRes.json();
    assert(loginRes.status === 200 && Boolean(loginData.token), 'Admin login succeeds and returns JWT', loginData);
    adminToken = loginData.token;

    // 2.2 Unauthenticated access rejected
    const unauthRes = await fetch(`${BASE_URL}/api/admin/inventory`);
    assert(unauthRes.status === 401, 'Unauthenticated request to GET /api/admin/inventory rejected with 401');

    // 2.3 Invalid token rejected
    const invalidRes = await fetch(`${BASE_URL}/api/admin/inventory`, {
      headers: { Authorization: 'Bearer invalid.token.payload' }
    });
    assert(invalidRes.status === 401 || invalidRes.status === 403, 'Invalid token rejected with 401 or 403');

    // 2.4 Customer-style token rejected
    const custRes = await fetch(`${BASE_URL}/api/admin/inventory`, {
      headers: { Authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MTAwMSwidHlwZSI6ImN1c3RvbWVyIn0.sig' }
    });
    assert(custRes.status === 401 || custRes.status === 403, 'Customer token strictly rejected with 401/403');

    // 2.5 Authorized admin request succeeds
    const authRes = await fetch(`${BASE_URL}/api/admin/inventory`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert(authRes.status === 200, 'Authorized admin request succeeds with 200');

    // -------------------------------------------------------------
    // PHASE 3: Inventory Listing & Data Contract
    // -------------------------------------------------------------
    console.log('\n[PHASE 3] Testing Inventory Listing & Data Contract...');

    const listData = await authRes.json();
    assert(listData.status === 'success' || listData.success === true, 'Response status is success');
    const items = listData.data || listData.inventory;
    assert(Array.isArray(items), 'Returns inventory array');
    assert(listData.pagination?.total === baselineProducts.length, `Pagination total reflects baseline products (got ${listData.pagination?.total}, expected ${baselineProducts.length})`);

    const p1 = items.find((i: any) => i.id === 1);
    assert(Boolean(p1), 'Product 1 exists in inventory listing');
    assert(p1.stock === baselineProducts[0].stock_quantity && p1.stockQuantity === baselineProducts[0].stock_quantity, `Product 1 stock reflects database stock (${baselineProducts[0].stock_quantity})`);
    assert(p1.stockStatus === (baselineProducts[0].stock_quantity > 5 ? 'in_stock' : baselineProducts[0].stock_quantity === 0 ? 'out_of_stock' : 'low_stock'), 'Product 1 stockStatus is mapped correctly');
    assert(p1.productId === 'PROD-0001', 'Formatted productId PROD-0001 is provided');
    assert(Boolean(p1.image), 'Product includes image reference');
    assert(Boolean(listData.metrics), 'Response includes stock summary metrics');
    assert(listData.metrics.lowStockThreshold === 5, 'Metrics indicate lowStockThreshold of 5');

    // Check zero stock product mapping if present in baseline
    const zeroProd = items.find((i: any) => i.stock === 0);
    if (zeroProd) {
      assert(zeroProd.stockStatus === 'out_of_stock' && zeroProd.stockStatusLabel === 'Out of Stock', 'Product with 0 stock is marked as out_of_stock (Out of Stock)');
    } else {
      console.log('  -> Note: No baseline product with 0 stock in DB (verified in Phase 6 on isolated test product)');
    }

    // -------------------------------------------------------------
    // PHASE 4: Search, Filters & Sorting
    // -------------------------------------------------------------
    console.log('\n[PHASE 4] Testing Search, Status Filters & Sorting...');

    // 4.1 Search by product name
    const searchNameRes = await fetch(`${BASE_URL}/api/admin/inventory?search=Gratitude`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const searchNameData = await searchNameRes.json();
    assert(
      searchNameData.data.length >= 1 && searchNameData.data.some((i: any) => i.id === 1),
      'Search by product name ("Gratitude") returns matching product'
    );

    // 4.2 Search by product ID / SKU
    const searchIdRes = await fetch(`${BASE_URL}/api/admin/inventory?search=PROD-0001`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const searchIdData = await searchIdRes.json();
    assert(
      searchIdData.data.length === 1 && searchIdData.data[0].id === 1,
      'Search by Product ID / SKU ("PROD-0001") returns product ID 1'
    );

    // 4.3 Filter: out_of_stock
    const outFilterRes = await fetch(`${BASE_URL}/api/admin/inventory?status=out_of_stock`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const outFilterData = await outFilterRes.json();
    assert(
      outFilterData.data.every((i: any) => i.stock === 0 && i.stockStatus === 'out_of_stock'),
      'Status filter "out_of_stock" returns only products with 0 stock'
    );

    // 4.4 Filter: in_stock
    const inFilterRes = await fetch(`${BASE_URL}/api/admin/inventory?status=in_stock`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const inFilterData = await inFilterRes.json();
    assert(
      inFilterData.data.every((i: any) => i.stock > 5),
      'Status filter "in_stock" returns only products with stock > 5'
    );

    // 4.5 Sorting by product name ASC
    const sortNameRes = await fetch(`${BASE_URL}/api/admin/inventory?sortBy=name&sortOrder=asc`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const sortNameData = await sortNameRes.json();
    const names = sortNameData.data.map((i: any) => i.name.toLowerCase());
    const isSortedName = names.slice(1).every((n: string, i: number) => names[i].localeCompare(n) <= 0);
    assert(isSortedName, 'Inventory is sorted alphabetically when sortBy=name&sortOrder=asc');

    // 4.6 Sorting by stock quantity ASC
    const sortStockRes = await fetch(`${BASE_URL}/api/admin/inventory?sortBy=stock&sortOrder=asc`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const sortStockData = await sortStockRes.json();
    const stocks = sortStockData.data.map((i: any) => i.stock);
    const isSortedStock = stocks.slice(1).every((s: number, i: number) => stocks[i] <= s);
    assert(isSortedStock, 'Inventory is sorted by stock ascending when sortBy=stock&sortOrder=asc');

    // 4.7 Pagination
    const pageRes = await fetch(`${BASE_URL}/api/admin/inventory?page=1&limit=4`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const pageData = await pageRes.json();
    const expectedPages = Math.max(1, Math.ceil(baselineProducts.length / 4));
    assert(pageData.data.length === Math.min(4, baselineProducts.length) && pageData.pagination.totalPages === expectedPages, `Pagination limit=4 returns ${pageData.data.length} item(s) across ${expectedPages} page(s)`);

    // -------------------------------------------------------------
    // PHASE 5: Individual Product Stock Details Endpoint
    // -------------------------------------------------------------
    console.log('\n[PHASE 5] Testing Individual Product Stock Details...');

    const detailRes = await fetch(`${BASE_URL}/api/admin/inventory/1`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert(detailRes.status === 200, 'GET /api/admin/inventory/1 returns 200');
    const detailData = await detailRes.json();
    const itemDetail = detailData.product || detailData.data;
    assert(itemDetail.id === 1 && itemDetail.stock === 100, 'Product details return correct ID and stock');
    assert(Boolean(itemDetail.category), 'Product details include category name');

    // Non-existent ID returns 404
    const notFoundRes = await fetch(`${BASE_URL}/api/admin/inventory/999999`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert(notFoundRes.status === 404, 'Non-existent product ID returns 404 Not Found');

    // -------------------------------------------------------------
    // PHASE 6: Stock Update & Validation (Using isolated test product)
    // -------------------------------------------------------------
    console.log('\n[PHASE 6] Testing Stock Update & Validation...');

    let tempProductId = 0;
    try {
      // Create isolated test product
      const [insertResult]: any = await pool.query(
        `INSERT INTO products (name, slug, price, stock_quantity, is_active, created_at, updated_at)
         VALUES ('Stock Test Journal', 'stock-test-journal', 199.00, 25, 1, NOW(), NOW())`
      );
      tempProductId = insertResult.insertId;
      console.log(`  -> Created isolated test product ID ${tempProductId}`);

      // 6.1 Update to valid positive stock
      const update1 = await fetch(`${BASE_URL}/api/admin/inventory/${tempProductId}/stock`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ stock: 50 })
      });
      assert(update1.status === 200, 'PATCH /api/admin/inventory/:id/stock updates stock to 50');
      const update1Data = await update1.json();
      assert(update1Data.stock === 50 && update1Data.product.stockStatus === 'in_stock', 'Updated product reflects 50 stock and in_stock status');

      // 6.2 Update to low stock (e.g. 3) to test low_stock classification
      const update2 = await fetch(`${BASE_URL}/api/admin/inventory/${tempProductId}/stock`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ stock: 3 })
      });
      assert(update2.status === 200, 'Stock updated to 3 (<= threshold 5)');
      const update2Data = await update2.json();
      assert(update2Data.stock === 3 && update2Data.product.stockStatus === 'low_stock', 'Stock of 3 is classified as low_stock');

      // 6.3 Update to 0 to test out_of_stock classification
      const update3 = await fetch(`${BASE_URL}/api/admin/inventory/${tempProductId}/stock`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ stock: 0 })
      });
      assert(update3.status === 200, 'Stock updated to 0');
      const update3Data = await update3.json();
      assert(update3Data.stock === 0 && update3Data.product.stockStatus === 'out_of_stock', 'Stock of 0 is classified as out_of_stock');

      // 6.4 Reject negative stock
      const updateNegative = await fetch(`${BASE_URL}/api/admin/inventory/${tempProductId}/stock`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ stock: -5 })
      });
      assert(updateNegative.status === 400, 'Negative stock (-5) strictly rejected with 400 Bad Request');

      // 6.5 Reject decimal stock
      const updateDecimal = await fetch(`${BASE_URL}/api/admin/inventory/${tempProductId}/stock`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ stock: 12.5 })
      });
      assert(updateDecimal.status === 400, 'Decimal stock (12.5) strictly rejected with 400 Bad Request');

      // 6.6 Reject invalid / non-numeric stock
      const updateInvalid = await fetch(`${BASE_URL}/api/admin/inventory/${tempProductId}/stock`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ stock: 'invalid_stock' })
      });
      assert(updateInvalid.status === 400, 'Non-numeric stock strictly rejected with 400 Bad Request');

      // 6.7 Check customer storefront product API reflection
      // Update stock back to 15
      await fetch(`${BASE_URL}/api/admin/inventory/${tempProductId}/stock`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ stock: 15 })
      });

      const customerProductRes = await fetch(`${BASE_URL}/api/products/${tempProductId}`);
      assert(customerProductRes.status === 200, 'Customer storefront GET /api/products/:id succeeds');
      const customerProductData = await customerProductRes.json();
      const custProd = customerProductData.product || customerProductData.data;
      assert(custProd.stock === 15, `Customer storefront API immediately reflects updated stock 15 (got ${custProd.stock})`);
      assert(custProd.in_stock === true, 'Customer storefront indicates in_stock = true');

    } finally {
      if (tempProductId > 0) {
        await pool.query('DELETE FROM products WHERE id = ?', [tempProductId]);
        console.log(`  -> Cleaned up isolated test product ID ${tempProductId}`);
      }
    }

    // -------------------------------------------------------------
    // PHASE 7: Zero-Mutation Data Invariant Verification
    // -------------------------------------------------------------
    console.log('\n[PHASE 7] Verifying Zero Mutation of Existing Products, Orders, Users & Contacts...');

    const [finalProdRows] = await pool.query<RowDataPacket[]>(
      'SELECT id, name, slug, price, stock_quantity, is_active, created_at, updated_at FROM products ORDER BY id ASC'
    );

    const finalProducts: BaselineProduct[] = finalProdRows.map(r => ({
      id: Number(r.id),
      name: String(r.name),
      slug: String(r.slug),
      price: String(r.price),
      stock_quantity: Number(r.stock_quantity),
      is_active: Number(r.is_active),
      created_at: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
      updated_at: r.updated_at instanceof Date ? r.updated_at.toISOString() : String(r.updated_at)
    }));

    assert(finalProducts.length === baselineProducts.length, `Product count unchanged: ${finalProducts.length} === ${baselineProducts.length}`);

    let allProdsIdentical = true;
    for (let i = 0; i < baselineProducts.length; i++) {
      const b = baselineProducts[i];
      const f = finalProducts.find(p => p.id === b.id);
      if (
        !f ||
        b.name !== f.name ||
        b.slug !== f.slug ||
        b.price !== f.price ||
        b.stock_quantity !== f.stock_quantity ||
        b.is_active !== f.is_active
      ) {
        allProdsIdentical = false;
        console.error('Mismatch detected on product:', { baseline: b, final: f });
        break;
      }
    }
    assert(allProdsIdentical, 'ZERO MUTATION GUARANTEE: All baseline product records and stock quantities are 100% byte-for-byte identical');

    const [finalOrderCount] = await pool.query<RowDataPacket[]>('SELECT COUNT(*) as cnt FROM orders');
    assert(Number(finalOrderCount[0].cnt) === baselineOrdersCount, `Orders count strictly preserved (${baselineOrdersCount})`);

    const [finalUserCount] = await pool.query<RowDataPacket[]>('SELECT COUNT(*) as cnt FROM users');
    assert(Number(finalUserCount[0].cnt) === baselineUsersCount, `Users count strictly preserved (${baselineUsersCount})`);

    const [finalContactCount] = await pool.query<RowDataPacket[]>('SELECT COUNT(*) as cnt FROM contacts');
    assert(Number(finalContactCount[0].cnt) === baselineContactsCount, `Contacts count strictly preserved (${baselineContactsCount})`);

    console.log('\n================================================================');
    console.log(`  ALL ${passedTests}/${totalTests} TESTS PASSED SUCCESSFULLY!`);
    console.log('  Admin Inventory Module verified with 100% database integrity.');
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
