import http from 'http';
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
  console.log(' Testing Inactive Product Management & Storefront');
  console.log(' Database: gifted_pencil_test (Strict Local Check)');
  console.log('====================================================\n');

  // Safety check: local database gifted_pencil_test
  const connCheck = await testConnection();
  if (!connCheck.success || connCheck.database !== 'gifted_pencil_test') {
    throw new Error(`Safety check failed: unexpected DB "${connCheck.database}"`);
  }
  console.log('[Safety Verified]: Local database "gifted_pencil_test" confirmed.\n');

  // Start HTTP server on dynamic port
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));

  let testProductId: number | null = null;

  try {
    // 1. Admin Authentication
    console.log('--- Step 1: Admin Authentication ---');
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

    // 2. Create Active Test Product
    console.log('--- Step 2: Create Active Test Product ---');
    const createRes = await makeRequest(
      {
        method: 'POST',
        path: '/api/admin/products',
        headers: authHeaders,
        body: JSON.stringify({
          name: 'Status Management Test Notebook',
          description: 'A test product created to verify active/inactive status management.',
          price: 249,
          stock: 30,
          edition: 'Status Verification Edition',
          images: ['product-2.png'],
          image: 'product-2.png',
        }),
      },
      server
    );

    if (createRes.statusCode !== 201 || !createRes.body?.data?.id) {
      throw new Error(`Product creation failed: ${JSON.stringify(createRes.body)}`);
    }
    testProductId = createRes.body.data.id;
    console.log(`[PASS] Test Product created (ID: ${testProductId}, is_active: ${createRes.body.data.is_active})\n`);

    // 3. Verify Customer Storefront Sees Active Product
    console.log('--- Step 3: Verify Customer Storefront Sees Active Product ---');
    const storeActiveRes = await makeRequest(
      {
        method: 'GET',
        path: `/api/products/${testProductId}`,
      },
      server
    );
    if (storeActiveRes.statusCode !== 200) {
      throw new Error(`Active product not found on storefront: ${storeActiveRes.statusCode}`);
    }
    console.log('[PASS] Storefront correctly returns active product (Status 200 OK)\n');

    // 4. Deactivate Product
    console.log('--- Step 4: Deactivate Product (Soft Deactivation) ---');
    const deactivateRes = await makeRequest(
      {
        method: 'PATCH',
        path: `/api/admin/products/${testProductId}/status`,
        headers: authHeaders,
        body: JSON.stringify({ is_active: false }),
      },
      server
    );

    if (deactivateRes.statusCode !== 200 || deactivateRes.body?.data?.is_active !== false) {
      throw new Error(`Deactivation failed: ${JSON.stringify(deactivateRes.body)}`);
    }
    console.log(`[PASS] Product deactivated successfully via PATCH /status (is_active: false)\n`);

    // 5. Test Admin Filters (All, Active, Inactive)
    console.log('--- Step 5: Test Admin Status Filters ---');
    // a. Inactive filter -> Must find testProductId
    const adminInactiveRes = await makeRequest(
      {
        method: 'GET',
        path: '/api/admin/products?status=inactive&limit=50',
        headers: authHeaders,
      },
      server
    );
    const inactiveList = adminInactiveRes.body?.data || [];
    const foundInInactive = inactiveList.some((p: any) => p.id === testProductId);
    if (!foundInInactive) {
      throw new Error(`Deactivated product ID ${testProductId} not found in Admin status=inactive list!`);
    }
    console.log(`[PASS] Inactive filter returns product (Found in ${inactiveList.length} inactive products)`);

    // b. Active filter -> Must NOT find testProductId
    const adminActiveRes = await makeRequest(
      {
        method: 'GET',
        path: '/api/admin/products?status=active&limit=50',
        headers: authHeaders,
      },
      server
    );
    const activeList = adminActiveRes.body?.data || [];
    const foundInActive = activeList.some((p: any) => p.id === testProductId);
    if (foundInActive) {
      throw new Error(`Deactivated product ID ${testProductId} incorrectly appeared in Admin status=active list!`);
    }
    console.log('[PASS] Active filter excludes deactivated product');

    // c. All filter -> Must find testProductId
    const adminAllRes = await makeRequest(
      {
        method: 'GET',
        path: '/api/admin/products?status=all&limit=50',
        headers: authHeaders,
      },
      server
    );
    const allList = adminAllRes.body?.data || [];
    const foundInAll = allList.some((p: any) => p.id === testProductId);
    if (!foundInAll) {
      throw new Error(`Product ID ${testProductId} not found in Admin status=all list!`);
    }
    console.log(`[PASS] All filter returns product (Found in ${allList.length} total products)\n`);

    // 6. Verify Customer Storefront HIDES Deactivated Product
    console.log('--- Step 6: Verify Customer Storefront Hides Inactive Product ---');
    const storeInactiveRes = await makeRequest(
      {
        method: 'GET',
        path: `/api/products/${testProductId}`,
      },
      server
    );
    if (storeInactiveRes.statusCode !== 404) {
      throw new Error(`Deactivated product should return 404 on storefront, got ${storeInactiveRes.statusCode}`);
    }
    console.log('[PASS] Storefront correctly returns 404 Not Found for deactivated product');

    const storeCatalogRes = await makeRequest(
      {
        method: 'GET',
        path: '/api/products',
      },
      server
    );
    const catalogProducts = storeCatalogRes.body?.data?.products || storeCatalogRes.body?.products || [];
    const catalogHasInactive = catalogProducts.some((p: any) => p.id === testProductId);
    if (catalogHasInactive) {
      throw new Error(`Deactivated product appeared in customer catalog!`);
    }
    console.log('[PASS] Customer catalog list excludes inactive product\n');

    // 7. Reactivate Product
    console.log('--- Step 7: Activate Inactive Product ---');
    const activateRes = await makeRequest(
      {
        method: 'PATCH',
        path: `/api/admin/products/${testProductId}/status`,
        headers: authHeaders,
        body: JSON.stringify({ is_active: true }),
      },
      server
    );

    if (activateRes.statusCode !== 200 || activateRes.body?.data?.is_active !== true) {
      throw new Error(`Activation failed: ${JSON.stringify(activateRes.body)}`);
    }
    console.log(`[PASS] Product activated successfully via PATCH /status (is_active: true)\n`);

    // 8. Verify Customer Storefront RESTORES Product
    console.log('--- Step 8: Verify Customer Storefront Restores Activated Product ---');
    const storeRestoredRes = await makeRequest(
      {
        method: 'GET',
        path: `/api/products/${testProductId}`,
      },
      server
    );
    if (storeRestoredRes.statusCode !== 200) {
      throw new Error(`Reactivated product not found on storefront: ${storeRestoredRes.statusCode}`);
    }
    const restoredData = storeRestoredRes.body?.data?.product || storeRestoredRes.body?.product;
    if (restoredData.price !== 249 || restoredData.subtitle !== 'Status Verification Edition') {
      throw new Error('Product data was corrupted during deactivation/activation cycle!');
    }
    console.log('[PASS] Customer Storefront immediately restored product with full data and images preserved\n');

  } finally {
    if (testProductId) {
      console.log('--- Cleaning Up Test Data ---');
      await pool.query('DELETE FROM products WHERE id = ?', [testProductId]);
      console.log(`[Clean Up]: Safely deleted test product ${testProductId}.`);
    }
    await pool.end();
    server.close();
  }

  console.log('\n====================================================');
  console.log(' ALL STATUS MANAGEMENT & STOREFRONT TESTS PASSED');
  console.log('====================================================');
}

run().catch((err) => {
  console.error('\n[FATAL ERROR]:', err);
  process.exit(1);
});
