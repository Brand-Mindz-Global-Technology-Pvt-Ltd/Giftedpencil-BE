import http from 'http';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import mysql from 'mysql2/promise';
import app from '../src/app';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const TEST_PORT = 5066;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;

async function runVerification() {
  console.log('================================================================');
  console.log('       THE GIFTED PENCIL - ADMIN BANNERS VERIFICATION           ');
  console.log('================================================================\n');

  let server: http.Server | null = null;
  let adminToken = '';
  let createdBannerId: number | null = null;
  const createdTestFiles: string[] = [];

  // Database Safety Check
  const host = process.env.DB_HOST || '127.0.0.1';
  const dbName = process.env.DB_NAME;
  const user = process.env.DB_USER || 'root';
  const port = Number(process.env.DB_PORT || 3306);

  if ((host !== '127.0.0.1' && host !== 'localhost') || dbName !== 'gifted_pencil_test') {
    throw new Error(`SAFETY FAILED: Untrusted DB config Host=${host}, DB=${dbName}`);
  }

  const conn = await mysql.createConnection({
    host: '127.0.0.1',
    user,
    password: process.env.DB_PASSWORD || '',
    database: 'gifted_pencil_test',
    port
  });

  console.log('1. Database connection verified on local MySQL: gifted_pencil_test.');

  // Baseline counts for existing customer tables
  const customerTables = ['users', 'products', 'orders', 'contacts'];
  const baselineCounts: Record<string, number> = {};
  for (const table of customerTables) {
    const [rows]: any = await conn.query(`SELECT COUNT(*) as cnt FROM ${table}`);
    baselineCounts[table] = Number(rows[0].cnt);
  }
  console.log('Baseline counts on customer tables:', baselineCounts);

  // Start HTTP Test Server
  server = http.createServer(app);
  await new Promise<void>((resolve) => server!.listen(TEST_PORT, '127.0.0.1', resolve));
  console.log(`2. Backend server running at ${BASE_URL}\n`);

  try {
    // 3. Admin Authentication
    console.log('3. Testing Admin Login...');
    const loginRes = await fetch(`${BASE_URL}/api/admin/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin2@thegiftedpencil.com', password: '12345' })
    });
    const loginData = await loginRes.json();
    if (!loginRes.ok || !loginData.token) {
      throw new Error('Admin login failed: ' + JSON.stringify(loginData));
    }
    adminToken = loginData.token;
    const authHeaders = { Authorization: `Bearer ${adminToken}` };
    console.log('✓ Admin authenticated successfully.');

    // 4. Test Route Protection (401 without token)
    console.log('\n4. Testing Route Protection (Unauthorized access)...');
    const unauthRes = await fetch(`${BASE_URL}/api/admin/banners`);
    if (unauthRes.status !== 401) {
      throw new Error(`Expected 401 Unauthorized but got ${unauthRes.status}`);
    }
    console.log('✓ Route properly protected (returned 401 without token).');

    // 5. Test Empty List (Initial)
    console.log('\n5. Testing GET /api/admin/banners (Initial listing)...');
    const initialListRes = await fetch(`${BASE_URL}/api/admin/banners`, { headers: authHeaders });
    const initialData = await initialListRes.json();
    if (!initialListRes.ok || !initialData.success || !Array.isArray(initialData.data)) {
      throw new Error('Invalid banner listing response: ' + JSON.stringify(initialData));
    }
    console.log(`✓ GET /api/admin/banners returned ${initialData.data.length} banners.`);

    // 6. Test File Upload & Create Banner using native FormData and Blob
    console.log('\n6. Testing POST /api/admin/banners with banner image upload...');
    const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
    const pngBuffer = Buffer.from(pngBase64, 'base64');
    const pngBlob = new Blob([pngBuffer], { type: 'image/png' });

    const formData = new FormData();
    formData.append('title', 'Summer Calligraphy Collection');
    formData.append('subtitle', 'Handmade wooden fountain pens');
    formData.append('cta_text', 'Explore Collection');
    formData.append('cta_link', '/shop/category/calligraphy');
    formData.append('sort_order', '1');
    formData.append('is_active', '1');
    formData.append('image', pngBlob, 'banner-test.png');

    const createRes = await fetch(`${BASE_URL}/api/admin/banners`, {
      method: 'POST',
      headers: authHeaders,
      body: formData
    });
    const createData = await createRes.json();

    if (!createRes.ok || !createData.success || !createData.data?.id) {
      throw new Error('Banner creation failed: ' + JSON.stringify(createData));
    }

    const createdBanner = createData.data;
    createdBannerId = createdBanner.id;
    console.log(`✓ Banner created with ID ${createdBannerId}, image path: ${createdBanner.image}`);

    if (!createdBanner.image.startsWith('/uploads/banners/')) {
      throw new Error(`Expected image path to start with /uploads/banners/ but got ${createdBanner.image}`);
    }

    // Check static file availability
    const staticCheck = await fetch(`${BASE_URL}${createdBanner.image}`);
    if (staticCheck.status !== 200) {
      throw new Error(`Static banner image not accessible at ${createdBanner.image}`);
    }
    console.log('✓ Uploaded banner image served statically via Express.');

    // 7. Test GET /api/admin/banners/:id
    console.log('\n7. Testing GET /api/admin/banners/:id...');
    const detailsRes = await fetch(`${BASE_URL}/api/admin/banners/${createdBannerId}`, { headers: authHeaders });
    const detailsData = await detailsRes.json();
    if (!detailsRes.ok || !detailsData.success || detailsData.data.title !== 'Summer Calligraphy Collection') {
      throw new Error('Banner details response does not match: ' + JSON.stringify(detailsData));
    }
    console.log('✓ GET /api/admin/banners/:id retrieved matching record.');

    // 8. Test PUT /api/admin/banners/:id (Update text & order)
    console.log('\n8. Testing PUT /api/admin/banners/:id (Update)...');
    const updateFormData = new FormData();
    updateFormData.append('title', 'Updated Summer Calligraphy Collection');
    updateFormData.append('sort_order', '5');

    const updateRes = await fetch(`${BASE_URL}/api/admin/banners/${createdBannerId}`, {
      method: 'PUT',
      headers: authHeaders,
      body: updateFormData
    });
    const updateData = await updateRes.json();

    if (!updateRes.ok || !updateData.success || updateData.data.title !== 'Updated Summer Calligraphy Collection' || Number(updateData.data.sort_order) !== 5) {
      throw new Error('Banner update failed: ' + JSON.stringify(updateData));
    }
    console.log('✓ Banner updated successfully.');

    // 9. Test PATCH /api/admin/banners/:id/status (Deactivate)
    console.log('\n9. Testing PATCH /api/admin/banners/:id/status (Deactivate)...');
    const deactRes = await fetch(`${BASE_URL}/api/admin/banners/${createdBannerId}/status`, {
      method: 'PATCH',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: false })
    });
    const deactData = await deactRes.json();
    if (!deactRes.ok || !deactData.success || Number(deactData.data.is_active) !== 0) {
      throw new Error('Banner deactivation failed: ' + JSON.stringify(deactData));
    }
    console.log('✓ Banner deactivated successfully (is_active = 0).');

    // Test Reactivate
    const reactRes = await fetch(`${BASE_URL}/api/admin/banners/${createdBannerId}/status`, {
      method: 'PATCH',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: true })
    });
    const reactData = await reactRes.json();
    if (!reactRes.ok || !reactData.success || Number(reactData.data.is_active) !== 1) {
      throw new Error('Banner reactivation failed: ' + JSON.stringify(reactData));
    }
    console.log('✓ Banner reactivated successfully (is_active = 1).');

    // 10. Test Filtering & Search
    console.log('\n10. Testing Banners Search & Filter Query Params...');
    const searchRes = await fetch(`${BASE_URL}/api/admin/banners?search=Calligraphy`, { headers: authHeaders });
    const searchData = await searchRes.json();
    if (!searchRes.ok || !searchData.success || searchData.data.length === 0) {
      throw new Error('Search query failed to find banner: ' + JSON.stringify(searchData));
    }
    console.log('✓ Banner search returned matched banner.');

    // 11. Test Invalid Uploads (Reject non-image files)
    console.log('\n11. Testing Rejection of Invalid File Type (.txt)...');
    const txtBlob = new Blob(['Not an image content'], { type: 'text/plain' });
    const invalidForm = new FormData();
    invalidForm.append('title', 'Invalid Banner');
    invalidForm.append('image', txtBlob, 'fake.txt');

    const invalidRes = await fetch(`${BASE_URL}/api/admin/banners`, {
      method: 'POST',
      headers: authHeaders,
      body: invalidForm
    });

    if (invalidRes.status === 400) {
      console.log('✓ Non-image file correctly rejected with 400 Bad Request.');
    } else {
      throw new Error(`Expected 400 rejection for .txt file, but got status ${invalidRes.status}`);
    }

    // 12. Backward Compatibility Route Alias Checks
    console.log('\n12. Testing route aliases (/admin/banners and /banner)...');
    const alias1 = await fetch(`${BASE_URL}/admin/banners`, { headers: authHeaders });
    const alias1Data = await alias1.json();
    if (!alias1.ok || !alias1Data.success) throw new Error('/admin/banners alias failed');

    const alias2 = await fetch(`${BASE_URL}/banner`, { headers: authHeaders });
    const alias2Data = await alias2.json();
    if (!alias2.ok || !alias2Data.success) throw new Error('/banner alias failed');
    console.log('✓ Route aliases (/admin/banners and /banner) functional.');

    // 13. Customer Homepage Isolation Check
    console.log('\n13. Checking Customer Homepage Hero Banner Isolation...');
    const heroFilePath = path.resolve(__dirname, '../../frontend/src/components/home/Hero.tsx');
    const heroContent = fs.readFileSync(heroFilePath, 'utf8');
    if (!heroContent.includes('Hero-banner.png')) {
      throw new Error('Customer Hero.tsx was unexpectedly altered');
    }
    console.log('✓ Customer storefront homepage Hero banner remains static and isolated.');

    // 14. Customer Database Zero-Mutation Verification
    console.log('\n14. Checking Zero-Mutation on Customer Tables...');
    for (const table of customerTables) {
      const [rows]: any = await conn.query(`SELECT COUNT(*) as cnt FROM ${table}`);
      const currentCnt = Number(rows[0].cnt);
      if (currentCnt !== baselineCounts[table]) {
        throw new Error(`MUTATION DETECTED on customer table ${table}: baseline=${baselineCounts[table]}, current=${currentCnt}`);
      }
    }
    console.log('✓ All customer tables (users, products, orders, contacts) zero mutations confirmed.');

    console.log('\n======================================================');
    console.log('>>> ALL ADMIN BANNERS VERIFICATION TESTS PASSED (14/14) <<<');
    console.log('======================================================\n');
  } finally {
    // Clean up created banner from local banners table to keep clean
    if (createdBannerId) {
      try {
        const [b]: any = await conn.query('SELECT image FROM banners WHERE id = ?', [createdBannerId]);
        if (b && b[0]?.image) {
          const diskPath = path.resolve(__dirname, '../..', b[0].image.replace(/^\//, ''));
          if (fs.existsSync(diskPath)) {
            try { fs.unlinkSync(diskPath); } catch {}
          }
        }
        await conn.query('DELETE FROM banners WHERE id = ?', [createdBannerId]);
        console.log(`Cleaned up test banner ID ${createdBannerId}.`);
      } catch (err) {
        console.warn('Cleanup warning:', err);
      }
    }
    await conn.end();
    if (server) {
      server.close(() => {
        process.exit(0);
      });
    } else {
      process.exit(0);
    }
  }
}

runVerification().catch((err) => {
  console.error('\n❌ Verification Failed:', err.message || err);
  process.exit(1);
});
