import { Server } from 'http';
import jwt from 'jsonwebtoken';
import { RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import app from '../src/app';
import pool from '../src/config/db';

const PORT = 5098;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin2@thegiftedpencil.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '12345';

async function verifyProductsIntegration(): Promise<void> {
  console.log('====================================================');
  console.log(' Starting Admin Products & Storefront Sync Test');
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
  let createdProductId: number | null = null;
  const testSlug = 'the-gifted-pencil-signature-brass-rollerball';

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
    const resUnauth = await fetch(`${BASE_URL}/api/admin/products`);
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
    const resCustomer = await fetch(`${BASE_URL}/api/admin/products`, {
      headers: { Authorization: `Bearer ${customerToken}` }
    });
    if (resCustomer.status === 403) {
      console.log('  Customer token access -> 403 Forbidden [PASS]\n');
    } else {
      throw new Error(`Expected 403 for customer token, got ${resCustomer.status}`);
    }

    // --- TEST 2: List products via Admin endpoint and legacy alias ---
    console.log('--- TEST 2: List Products (Admin Endpoint & Legacy Alias) ---');
    const resList = await fetch(`${BASE_URL}/api/admin/products?limit=5`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const listData = await resList.json();
    if (resList.status !== 200 || !listData.success || !Array.isArray(listData.data)) {
      throw new Error(`List products failed: ${JSON.stringify(listData)}`);
    }
    console.log(`  GET /api/admin/products -> 200 OK (returned ${listData.data.length} products, total ${listData.pagination?.total}) [PASS]`);

    const resLegacyList = await fetch(`${BASE_URL}/products/product-list?limit=5`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const legacyListData = await resLegacyList.json();
    if (resLegacyList.status !== 200 || !legacyListData.success) {
      throw new Error(`Legacy list products failed: ${JSON.stringify(legacyListData)}`);
    }
    console.log(`  GET /products/product-list (legacy alias) -> 200 OK [PASS]\n`);

    // --- TEST 3: Categories & Next Product ID ---
    console.log('--- TEST 3: Admin Categories & Next Product ID ---');
    const resCat = await fetch(`${BASE_URL}/api/admin/products/categories`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const catData = await resCat.json();
    if (resCat.status !== 200 || !catData.success || !Array.isArray(catData.data)) {
      throw new Error(`Categories failed: ${JSON.stringify(catData)}`);
    }
    console.log(`  GET /api/admin/products/categories -> 200 OK (Categories: ${catData.data.map((c: any) => c.name).join(', ')}, Next ID: ${catData.productId}) [PASS]\n`);

    // Clean up any lingering test product with this slug
    await pool.query('DELETE FROM products WHERE slug = ?', [testSlug]);

    // --- TEST 4: Create Product via Admin API ---
    console.log('--- TEST 4: Create Product via Admin API ---');
    const createPayload = {
      name: 'The Gifted Pencil - Signature Brass Rollerball',
      slug: testSlug,
      subtitle: 'Precision Writing with Solid Brass Elegance',
      price: 499.00,
      oldPrice: 699.00,
      discount: '28% OFF',
      stock: 40,
      category: 'Accessories',
      description: 'Handcrafted solid brass rollerball pen with balanced weight and smooth black gel refill.',
      image: 'product-1.png',
      images: ['product-1.png', 'product-2.png']
    };

    const resCreate = await fetch(`${BASE_URL}/api/admin/products`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify(createPayload)
    });
    const createData = await resCreate.json();
    if (resCreate.status !== 201 || !createData.success || !createData.data?.id) {
      throw new Error(`Create product failed: ${JSON.stringify(createData)}`);
    }
    createdProductId = createData.data.id;
    console.log(`  POST /api/admin/products -> 201 Created (ID: ${createdProductId}, Name: "${createData.data.name}") [PASS]\n`);

    // --- TEST 5: Verify MySQL persistence directly ---
    console.log('--- TEST 5: Verify MySQL Persistence ---');
    const [dbProductRows] = await pool.query<RowDataPacket[]>(
      'SELECT id, name, slug, price, original_price, stock_quantity, is_active FROM products WHERE id = ?',
      [createdProductId]
    );
    if (dbProductRows.length === 0) {
      throw new Error(`Product ID ${createdProductId} was NOT found in MySQL products table!`);
    }
    const dbRow = dbProductRows[0];
    console.log(`  Database record confirmed: ID=${dbRow.id}, slug="${dbRow.slug}", price=${dbRow.price}, stock=${dbRow.stock_quantity}, is_active=${dbRow.is_active} [PASS]\n`);

    // --- TEST 6: Customer Storefront Sync (Product List & Details) ---
    console.log('--- TEST 6: Customer Storefront Sync (Shop & Details) ---');
    // Customer shop search
    const resCustomerShop = await fetch(`${BASE_URL}/api/products?search=Brass+Rollerball`);
    const shopData = await resCustomerShop.json();
    const productsList = shopData.data?.products || shopData.products || [];
    const foundInShop = productsList.find((p: any) => p.id === createdProductId);
    if (!foundInShop) {
      throw new Error(`Newly created product was NOT found in Customer Storefront Shop API: ${JSON.stringify(shopData)}`);
    }
    console.log(`  GET /api/products?search=Brass+Rollerball -> Found active product "${foundInShop.name}" at ₹${foundInShop.price} [PASS]`);

    // Customer product details by slug
    const resCustomerDetails = await fetch(`${BASE_URL}/api/products/${testSlug}`);
    const detailsData = await resCustomerDetails.json();
    const customerProduct = detailsData.data?.product || detailsData.product;
    if (resCustomerDetails.status !== 200 || !customerProduct || customerProduct.id !== createdProductId) {
      throw new Error(`Customer details API failed to resolve by slug: ${JSON.stringify(detailsData)}`);
    }
    console.log(`  GET /api/products/${testSlug} -> Resolved product details by slug [PASS]\n`);

    // --- TEST 7: Update Product via Admin API & Check Storefront Sync ---
    console.log('--- TEST 7: Update Product via Admin API & Sync Verification ---');
    const updatePayload = {
      price: 459.00,
      stock: 35,
      subtitle: 'Updated Subtitle - Now with Premium Velvet Pouch'
    };
    const resUpdate = await fetch(`${BASE_URL}/api/admin/products/${createdProductId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify(updatePayload)
    });
    const updateData = await resUpdate.json();
    if (resUpdate.status !== 200 || !updateData.success || updateData.data.price !== 459) {
      throw new Error(`Update product failed: ${JSON.stringify(updateData)}`);
    }
    console.log(`  PUT /api/admin/products/${createdProductId} -> Updated price to ₹459.00 and stock to 35 [PASS]`);

    // Check customer storefront immediately
    const resStorefrontCheck = await fetch(`${BASE_URL}/api/products/${testSlug}`);
    const storefrontCheckData = await resStorefrontCheck.json();
    const updatedCustomerProduct = storefrontCheckData.data?.product || storefrontCheckData.product;
    if (!updatedCustomerProduct || updatedCustomerProduct.price !== 459 || updatedCustomerProduct.stock !== 35) {
      throw new Error(`Customer storefront did not reflect updated price/stock: ${JSON.stringify(storefrontCheckData)}`);
    }
    console.log(`  Customer Storefront verified updated price: ₹${updatedCustomerProduct.price}, stock: ${updatedCustomerProduct.stock} [PASS]\n`);

    // --- TEST 8: Safe Deactivation (Soft Delete) & Storefront Exclusion ---
    console.log('--- TEST 8: Safe Deactivation (Soft Delete) & Exclusion ---');
    const resDelete = await fetch(`${BASE_URL}/api/admin/products/${createdProductId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const deleteData = await resDelete.json();
    if (resDelete.status !== 200 || !deleteData.success) {
      throw new Error(`Deactivate failed: ${JSON.stringify(deleteData)}`);
    }
    console.log(`  DELETE /api/admin/products/${createdProductId} -> 200 OK (Safe Deactivation is_active=0) [PASS]`);

    // Verify Admin API STILL lists the deactivated product
    const resAdminSingle = await fetch(`${BASE_URL}/api/admin/products/${createdProductId}`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const adminSingleData = await resAdminSingle.json();
    if (resAdminSingle.status !== 200 || adminSingleData.data.is_active !== false) {
      throw new Error(`Admin single fetch should return deactivated product with is_active=false`);
    }
    console.log(`  Admin API still can access deactivated product (is_active: false) [PASS]`);

    // Verify Customer Storefront Shop NO LONGER returns the deactivated product
    const resShopAfterDeactivate = await fetch(`${BASE_URL}/api/products?search=Brass+Rollerball`);
    const shopAfterData = await resShopAfterDeactivate.json();
    const shopAfterList = shopAfterData.data?.products || shopAfterData.products || [];
    const stillInShop = shopAfterList.find((p: any) => p.id === createdProductId);
    if (stillInShop) {
      throw new Error(`Deactivated product should NOT appear in Customer Storefront Shop!`);
    }
    console.log(`  Customer Storefront Shop does NOT return deactivated product [PASS]`);

    // Verify Customer Storefront Details returns 404 for deactivated product
    const resDetailsAfterDeactivate = await fetch(`${BASE_URL}/api/products/${testSlug}`);
    if (resDetailsAfterDeactivate.status === 404) {
      console.log(`  GET /api/products/${testSlug} -> 404 Not Found (inactive product hidden from customer) [PASS]\n`);
    } else {
      throw new Error(`Expected 404 for deactivated product, got ${resDetailsAfterDeactivate.status}`);
    }

    // Clean up test product from database
    if (createdProductId) {
      await pool.query('DELETE FROM products WHERE id = ?', [createdProductId]);
      console.log(`[Clean Up]: Test product ID ${createdProductId} removed from database.\n`);
    }

    console.log('====================================================');
    console.log(' ALL ADMIN PRODUCTS & STOREFRONT SYNC TESTS PASSED! ');
    console.log('====================================================');

  } finally {
    server.close();
    await pool.end();
  }
}

verifyProductsIntegration()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\nVerification FAILED:', err);
    process.exit(1);
  });
