import { Server } from 'http';
import { RowDataPacket } from 'mysql2/promise';
import app from '../src/app';
import pool from '../src/config/db';

const PORT = 5097;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin2@thegiftedpencil.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '12345';

async function verifyFinalizedProductWorkflow(): Promise<void> {
  console.log('====================================================');
  console.log(' Testing Finalized Product Add/Edit & Storefront');
  console.log(' Database: gifted_pencil_test (Strict Local Check)');
  console.log('====================================================\n');

  // Safety check
  const [dbRows] = await pool.query<RowDataPacket[]>('SELECT DATABASE() AS current_db');
  const currentDb = dbRows[0]?.current_db;
  if (currentDb !== 'gifted_pencil_test') {
    throw new Error(`CRITICAL: Connected to "${currentDb}", aborting!`);
  }
  console.log(`[Safety Verified]: Database "${currentDb}".\n`);

  const server: Server = app.listen(PORT);
  let adminToken = '';
  const createdIds: number[] = [];

  try {
    // Authenticate Admin
    console.log('--- Step 1: Admin Authentication ---');
    const loginRes = await fetch(`${BASE_URL}/api/admin/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD })
    });
    const loginData = await loginRes.json();
    if (loginRes.status !== 200 || !loginData.token) {
      throw new Error(`Admin login failed: ${JSON.stringify(loginData)}`);
    }
    adminToken = loginData.token;
    console.log(`[PASS] Logged in as ${loginData.admin.username}\n`);

    // --- TEST CASE 1: Adding a product with ONLY the 4 required fields ---
    console.log('--- TEST 1: Add product with ONLY 4 Required Fields ---');
    const reqOnlyPayload = {
      name: 'Minimal Journal Required Only',
      description: 'A pure journal crafted with simplicity in mind.',
      price: 199.00,
      stock: 25
      // Optional fields: oldPrice, edition, features, images all omitted
    };

    const res1 = await fetch(`${BASE_URL}/api/admin/products`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify(reqOnlyPayload)
    });
    const data1 = await res1.json();
    if (res1.status !== 201 || !data1.success || !data1.data?.id) {
      throw new Error(`Failed to create required-only product: ${JSON.stringify(data1)}`);
    }
    const p1Id = data1.data.id;
    const p1Slug = data1.data.slug;
    createdIds.push(p1Id);
    console.log(`  POST /api/admin/products -> 201 Created (ID: ${p1Id}, Slug: "${p1Slug}") [PASS]`);

    // Verify in customer storefront API
    const resCust1 = await fetch(`${BASE_URL}/api/products/${p1Slug}`);
    const cust1 = await resCust1.json();
    const product1 = cust1.data?.product || cust1.product;
    if (resCust1.status !== 200 || !product1) {
      throw new Error(`Customer API failed to resolve product: ${JSON.stringify(cust1)}`);
    }
    if (product1.original_price != null) {
      throw new Error(`Expected original_price to be null/undefined, got: ${product1.original_price}`);
    }
    if (product1.subtitle != null && product1.subtitle !== '') {
      throw new Error(`Expected subtitle to be null/empty, got: ${product1.subtitle}`);
    }
    if (Array.isArray(product1.features) && product1.features.length > 0) {
      throw new Error(`Expected features to be empty, got: ${JSON.stringify(product1.features)}`);
    }
    console.log(`  Customer Storefront verified: No old price, no edition, no features mock text [PASS]\n`);

    // --- TEST CASE 2: Adding a product with ALL optional fields filled ---
    console.log('--- TEST 2: Add product with ALL Optional Fields Filled ---');
    const allFieldsPayload = {
      name: 'Complete Deluxe Executive Journal',
      description: 'Full grain leatherbound journal with gold gilded edges.',
      price: 399.00,
      stock: 15,
      oldPrice: 499.00,
      edition: 'Collector Edition • Gold Foil Finish',
      features: [
        '180 GSM acid-free ivory archival paper',
        'Hand-bound lay-flat Smyth sewn binding',
        'Dual silk bookmark ribbons and expandable rear pocket'
      ],
      images: ['product-1.png', 'product-2.png']
    };

    const res2 = await fetch(`${BASE_URL}/api/admin/products`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify(allFieldsPayload)
    });
    const data2 = await res2.json();
    if (res2.status !== 201 || !data2.success || !data2.data?.id) {
      throw new Error(`Failed to create all-fields product: ${JSON.stringify(data2)}`);
    }
    const p2Id = data2.data.id;
    const p2Slug = data2.data.slug;
    createdIds.push(p2Id);
    console.log(`  POST /api/admin/products -> 201 Created (ID: ${p2Id}, Slug: "${p2Slug}") [PASS]`);

    // Verify in customer storefront API
    const resCust2 = await fetch(`${BASE_URL}/api/products/${p2Slug}`);
    const cust2 = await resCust2.json();
    const product2 = cust2.data?.product || cust2.product;
    if (resCust2.status !== 200 || !product2) {
      throw new Error(`Customer API failed to resolve product: ${JSON.stringify(cust2)}`);
    }
    if (Number(product2.original_price) !== 499) {
      throw new Error(`Expected original_price 499, got: ${product2.original_price}`);
    }
    if (product2.subtitle !== 'Collector Edition • Gold Foil Finish') {
      throw new Error(`Expected subtitle "Collector Edition • Gold Foil Finish", got: "${product2.subtitle}"`);
    }
    if (!Array.isArray(product2.features) || product2.features.length !== 3) {
      throw new Error(`Expected 3 features, got: ${JSON.stringify(product2.features)}`);
    }
    if (!Array.isArray(product2.images) || product2.images.length !== 2) {
      throw new Error(`Expected 2 images, got: ${JSON.stringify(product2.images)}`);
    }
    console.log(`  Customer Storefront verified: Old price (₹499), Edition, 3 features, 2 images [PASS]\n`);

    // --- TEST CASE 3: Adding a product with SOME optional fields left empty ---
    console.log('--- TEST 3: Add product with Partial Optional Fields ---');
    const partialPayload = {
      name: 'Partial Pocket Notebook',
      description: 'Compact pocket notebook for quick sketches and notes.',
      price: 149.00,
      stock: 45,
      edition: 'Pocket Edition • 64 Pages',
      features: ['Compact A6 pocket size']
      // oldPrice omitted, images omitted
    };

    const res3 = await fetch(`${BASE_URL}/api/admin/products`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify(partialPayload)
    });
    const data3 = await res3.json();
    if (res3.status !== 201 || !data3.success || !data3.data?.id) {
      throw new Error(`Failed to create partial product: ${JSON.stringify(data3)}`);
    }
    const p3Id = data3.data.id;
    const p3Slug = data3.data.slug;
    createdIds.push(p3Id);
    console.log(`  POST /api/admin/products -> 201 Created (ID: ${p3Id}, Slug: "${p3Slug}") [PASS]`);

    const resCust3 = await fetch(`${BASE_URL}/api/products/${p3Slug}`);
    const cust3 = await resCust3.json();
    const product3 = cust3.data?.product || cust3.product;
    if (product3.original_price != null) {
      throw new Error(`Expected no original_price, got: ${product3.original_price}`);
    }
    if (product3.subtitle !== 'Pocket Edition • 64 Pages') {
      throw new Error(`Expected edition "Pocket Edition • 64 Pages", got: "${product3.subtitle}"`);
    }
    if (!Array.isArray(product3.features) || product3.features.length !== 1) {
      throw new Error(`Expected 1 feature, got: ${JSON.stringify(product3.features)}`);
    }
    console.log(`  Customer Storefront verified: Has Edition & 1 feature, NO old price [PASS]\n`);

    // --- TEST CASE 4: Editing an existing product ---
    console.log('--- TEST 4: Edit Product via Admin API & Check Storefront Sync ---');
    const updatePayload = {
      price: 129.00,
      stock: 40,
      edition: 'Pocket Edition (Updated) • 80 Pages',
      features: [
        'Compact A6 pocket size',
        'New: Elastic band closure'
      ],
      oldPrice: 169.00
    };

    const resEdit = await fetch(`${BASE_URL}/api/admin/products/${p3Id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify(updatePayload)
    });
    const editData = await resEdit.json();
    if (resEdit.status !== 200 || !editData.success) {
      throw new Error(`Failed to update product: ${JSON.stringify(editData)}`);
    }
    console.log(`  PUT /api/admin/products/${p3Id} -> 200 OK (Price: ₹129, Stock: 40, 2 features, oldPrice: ₹169) [PASS]`);

    // Customer storefront sync verification
    const resCustEdit = await fetch(`${BASE_URL}/api/products/${p3Slug}`);
    const custEdit = await resCustEdit.json();
    const productEdit = custEdit.data?.product || custEdit.product;
    if (Number(productEdit.price) !== 129 || Number(productEdit.stock) !== 40) {
      throw new Error(`Price or stock mismatch in storefront: ${JSON.stringify(productEdit)}`);
    }
    if (Number(productEdit.original_price) !== 169) {
      throw new Error(`Old price mismatch in storefront: ${productEdit.original_price}`);
    }
    if (!Array.isArray(productEdit.features) || productEdit.features.length !== 2) {
      throw new Error(`Features count mismatch: ${JSON.stringify(productEdit.features)}`);
    }
    console.log(`  Customer storefront immediately reflected all edited fields [PASS]\n`);

    // --- TEST CASE 5: Validation errors on missing required fields ---
    console.log('--- TEST 5: Strict Validation on Required Fields Only ---');
    const missingName = await fetch(`${BASE_URL}/api/admin/products`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ description: 'A product with no name', price: 99, stock: 10 })
    });
    if (missingName.status === 400) {
      console.log('  Missing name rejected (400 Bad Request) [PASS]');
    } else {
      throw new Error(`Expected 400 for missing name, got ${missingName.status}`);
    }

    const missingDesc = await fetch(`${BASE_URL}/api/admin/products`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ name: 'No Description Product', price: 99, stock: 10 })
    });
    if (missingDesc.status === 400) {
      console.log('  Missing description rejected (400 Bad Request) [PASS]');
    } else {
      throw new Error(`Expected 400 for missing description, got ${missingDesc.status}`);
    }

    const invalidPrice = await fetch(`${BASE_URL}/api/admin/products`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ name: 'Bad Price Product', description: 'Desc', price: 0, stock: 10 })
    });
    if (invalidPrice.status === 400) {
      console.log('  Price <= 0 rejected (400 Bad Request) [PASS]');
    } else {
      throw new Error(`Expected 400 for invalid price, got ${invalidPrice.status}`);
    }

    console.log('\n[PASS] All validation rules verified correctly.');

  } finally {
    // Clean up created test products
    if (createdIds.length > 0) {
      for (const id of createdIds) {
        await pool.query('DELETE FROM products WHERE id = ?', [id]);
      }
      console.log(`\n[Clean Up]: Safely removed ${createdIds.length} test products from database.`);
    }
    server.close();
    await pool.end();
  }

  console.log('\n====================================================');
  console.log(' ALL PRODUCT ADD/EDIT & STOREFRONT TESTS PASSED! ');
  console.log('====================================================');
}

verifyFinalizedProductWorkflow()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\nVerification FAILED:', err);
    process.exit(1);
  });
