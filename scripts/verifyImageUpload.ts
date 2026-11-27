import http from 'http';
import fs from 'fs';
import path from 'path';
import pool, { testConnection } from '../src/config/db';
import app from '../src/app';

// Helper to make HTTP requests against the Express app in-memory
function makeRequest(
  options: {
    method: string;
    path: string;
    headers?: Record<string, string>;
    body?: Buffer | string;
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

// Helper to build multipart/form-data payload manually without external libraries
function buildMultipartFormData(
  boundary: string,
  files: Array<{ fieldname: string; filename: string; contentType: string; buffer: Buffer }>
): Buffer {
  const parts: Buffer[] = [];

  for (const file of files) {
    let header = `--${boundary}\r\n`;
    header += `Content-Disposition: form-data; name="${file.fieldname}"; filename="${file.filename}"\r\n`;
    header += `Content-Type: ${file.contentType}\r\n\r\n`;
    parts.push(Buffer.from(header, 'utf-8'));
    parts.push(file.buffer);
    parts.push(Buffer.from('\r\n', 'utf-8'));
  }

  parts.push(Buffer.from(`--${boundary}--\r\n`, 'utf-8'));
  return Buffer.concat(parts);
}

// 1x1 transparent PNG buffer
const TINY_PNG_BUFFER = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64'
);

async function run() {
  console.log('====================================================');
  console.log(' Testing Multer Image Upload & Storefront Display');
  console.log(' Database: gifted_pencil_test (Strict Local Check)');
  console.log('====================================================\n');

  // Verify local DB
  const connCheck = await testConnection();
  if (!connCheck.success || connCheck.database !== 'gifted_pencil_test') {
    throw new Error(`Safety check failed: unexpected DB "${connCheck.database}"`);
  }
  console.log('[Safety Verified]: Local database "gifted_pencil_test" confirmed.\n');

  // Start HTTP server on dynamic port
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));

  const createdProductIds: number[] = [];
  const createdUploadPaths: string[] = [];

  try {
    // 1. Admin Login
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
    };
    console.log('[PASS] Logged in as admin2\n');

    // 2. Upload Single Image
    console.log('--- Step 2: Upload Single Image (multipart/form-data) ---');
    const boundarySingle = `----WebKitFormBoundary${Date.now()}`;
    const singlePayload = buildMultipartFormData(boundarySingle, [
      {
        fieldname: 'image',
        filename: 'test-single.png',
        contentType: 'image/png',
        buffer: TINY_PNG_BUFFER,
      },
    ]);

    const uploadSingleRes = await makeRequest(
      {
        method: 'POST',
        path: '/api/admin/products/upload-image',
        headers: {
          ...authHeaders,
          'Content-Type': `multipart/form-data; boundary=${boundarySingle}`,
          'Content-Length': String(singlePayload.length),
        },
        body: singlePayload,
      },
      server
    );

    if (uploadSingleRes.statusCode !== 200 || !uploadSingleRes.body?.data?.url) {
      throw new Error(`Single image upload failed: ${JSON.stringify(uploadSingleRes.body)}`);
    }
    const singleImageUrl = uploadSingleRes.body.data.url;
    createdUploadPaths.push(singleImageUrl);
    console.log(`[PASS] Uploaded single image -> URL: "${singleImageUrl}"`);

    // Verify static serving of uploaded image
    const staticRes = await makeRequest({ method: 'GET', path: singleImageUrl }, server);
    if (staticRes.statusCode !== 200 || !staticRes.headers['content-type']?.includes('image')) {
      throw new Error(`Static file serving failed for ${singleImageUrl}: status ${staticRes.statusCode}`);
    }
    console.log(`[PASS] Static image accessible via HTTP GET: status 200 OK (${staticRes.headers['content-type']})\n`);

    // 3. Upload Multiple Images
    console.log('--- Step 3: Upload Multiple Images (multipart/form-data) ---');
    const boundaryMulti = `----WebKitFormBoundaryMulti${Date.now()}`;
    const multiPayload = buildMultipartFormData(boundaryMulti, [
      {
        fieldname: 'images',
        filename: 'multi-1.png',
        contentType: 'image/png',
        buffer: TINY_PNG_BUFFER,
      },
      {
        fieldname: 'images',
        filename: 'multi-2.png',
        contentType: 'image/png',
        buffer: TINY_PNG_BUFFER,
      },
      {
        fieldname: 'images',
        filename: 'multi-3.png',
        contentType: 'image/png',
        buffer: TINY_PNG_BUFFER,
      },
    ]);

    const uploadMultiRes = await makeRequest(
      {
        method: 'POST',
        path: '/api/admin/products/upload-images',
        headers: {
          ...authHeaders,
          'Content-Type': `multipart/form-data; boundary=${boundaryMulti}`,
          'Content-Length': String(multiPayload.length),
        },
        body: multiPayload,
      },
      server
    );

    if (uploadMultiRes.statusCode !== 200 || !Array.isArray(uploadMultiRes.body?.data?.urls) || uploadMultiRes.body.data.urls.length !== 3) {
      throw new Error(`Multiple images upload failed: ${JSON.stringify(uploadMultiRes.body)}`);
    }
    const multiImageUrls = uploadMultiRes.body.data.urls;
    createdUploadPaths.push(...multiImageUrls);
    console.log(`[PASS] Uploaded 3 images -> URLs: ${JSON.stringify(multiImageUrls)}\n`);

    // 4. Create Product using Uploaded Image URLs
    console.log('--- Step 4: Create Product with Uploaded Images (Lightweight JSON) ---');
    const createRes = await makeRequest(
      {
        method: 'POST',
        path: '/api/admin/products',
        headers: {
          ...authHeaders,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Multer Upload Verified Notebook',
          description: 'A notebook created with uploaded images via Multer multipart.',
          price: 349,
          stock: 25,
          edition: 'Artisan Upload Edition',
          images: multiImageUrls,
          image: multiImageUrls[0],
        }),
      },
      server
    );

    if (createRes.statusCode !== 201 || !createRes.body?.data?.id) {
      throw new Error(`Product creation failed: ${JSON.stringify(createRes.body)}`);
    }
    const createdId = createRes.body.data.id;
    createdProductIds.push(createdId);
    console.log(`[PASS] Product created with ID: ${createdId}`);
    console.log(`[PASS] Images saved in database: ${JSON.stringify(createRes.body.data.images)}\n`);

    // 5. Verify Customer Storefront API
    console.log('--- Step 5: Verify Customer Storefront API Image Retrieval ---');
    const customerRes = await makeRequest(
      {
        method: 'GET',
        path: `/api/products/${createdId}`,
      },
      server
    );

    if (customerRes.statusCode !== 200) {
      throw new Error(`Customer product fetch failed: ${JSON.stringify(customerRes.body)}`);
    }
    const custProduct = customerRes.body.data?.product || customerRes.body.product || customerRes.body.data;
    if (!custProduct.images || custProduct.images.length !== 3 || custProduct.images[0] !== multiImageUrls[0]) {
      throw new Error(`Storefront images do not match uploaded URLs: ${JSON.stringify(custProduct.images)}`);
    }
    console.log(`[PASS] Storefront correctly returns all 3 uploaded images: ${JSON.stringify(custProduct.images)}\n`);

    // 6. Edit Product & Verify Image Preservation
    console.log('--- Step 6: Edit Product and Verify Image Preservation ---');
    // We add singleImageUrl to the existing multiImageUrls
    const updatedImages = [singleImageUrl, ...multiImageUrls];
    const updateRes = await makeRequest(
      {
        method: 'PUT',
        path: `/api/admin/products/${createdId}`,
        headers: {
          ...authHeaders,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Multer Upload Verified Notebook (Updated)',
          price: 399,
          stock: 20,
          images: updatedImages,
        }),
      },
      server
    );

    if (updateRes.statusCode !== 200) {
      throw new Error(`Product update failed: ${JSON.stringify(updateRes.body)}`);
    }

    const verifyUpdateRes = await makeRequest(
      {
        method: 'GET',
        path: `/api/products/${createdId}`,
      },
      server
    );
    const updatedCustProduct = verifyUpdateRes.body.data?.product || verifyUpdateRes.body.product || verifyUpdateRes.body.data;
    if (updatedCustProduct.images.length !== 4 || updatedCustProduct.images[0] !== singleImageUrl) {
      throw new Error(`Updated storefront images mismatch: ${JSON.stringify(updatedCustProduct.images)}`);
    }
    console.log(`[PASS] Edit preserved existing images and appended new image (Total: ${updatedCustProduct.images.length})\n`);

    // 7. Validation: Reject Unsupported File Type
    console.log('--- Step 7: Validation Test - Unsupported File Type ---');
    const boundaryInvalid = `----WebKitFormBoundaryInvalid${Date.now()}`;
    const invalidTypePayload = buildMultipartFormData(boundaryInvalid, [
      {
        fieldname: 'images',
        filename: 'malicious.pdf',
        contentType: 'application/pdf',
        buffer: Buffer.from('%PDF-1.4 mock pdf content', 'utf-8'),
      },
    ]);

    const invalidTypeRes = await makeRequest(
      {
        method: 'POST',
        path: '/api/admin/products/upload-images',
        headers: {
          ...authHeaders,
          'Content-Type': `multipart/form-data; boundary=${boundaryInvalid}`,
          'Content-Length': String(invalidTypePayload.length),
        },
        body: invalidTypePayload,
      },
      server
    );

    if (invalidTypeRes.statusCode !== 400 || !invalidTypeRes.body?.message?.includes('Only image files')) {
      throw new Error(`Invalid file type was not rejected properly: ${JSON.stringify(invalidTypeRes.body)}`);
    }
    console.log(`[PASS] Non-image file correctly rejected with 400 Bad Request: "${invalidTypeRes.body.message}"\n`);

    // 8. Validation: Reject Oversized File (> 5MB)
    console.log('--- Step 8: Validation Test - File Size Exceeding 5MB ---');
    const boundaryOversized = `----WebKitFormBoundaryOversized${Date.now()}`;
    const oversizedBuffer = Buffer.alloc(5.5 * 1024 * 1024, 0); // 5.5 MB
    const oversizedPayload = buildMultipartFormData(boundaryOversized, [
      {
        fieldname: 'images',
        filename: 'huge-image.png',
        contentType: 'image/png',
        buffer: oversizedBuffer,
      },
    ]);

    const oversizedRes = await makeRequest(
      {
        method: 'POST',
        path: '/api/admin/products/upload-images',
        headers: {
          ...authHeaders,
          'Content-Type': `multipart/form-data; boundary=${boundaryOversized}`,
          'Content-Length': String(oversizedPayload.length),
        },
        body: oversizedPayload,
      },
      server
    );

    if (oversizedRes.statusCode !== 400 || !oversizedRes.body?.message?.includes('5MB')) {
      throw new Error(`Oversized file was not rejected properly: ${JSON.stringify(oversizedRes.body)}`);
    }
    console.log(`[PASS] Oversized file correctly rejected with 400 Bad Request: "${oversizedRes.body.message}"\n`);

  } finally {
    // Clean up created products from database
    if (createdProductIds.length > 0) {
      console.log('--- Cleaning Up Test Data ---');
      await pool.query('DELETE FROM products WHERE id IN (?)', [createdProductIds]);
      console.log(`[Clean Up]: Deleted ${createdProductIds.length} test products from database.`);
    }

    // Clean up created physical files
    for (const url of createdUploadPaths) {
      try {
        const filePath = path.resolve(__dirname, '../../backend', url.replace(/^\//, ''));
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      } catch {}
    }
    console.log(`[Clean Up]: Cleaned up ${createdUploadPaths.length} temporary upload files.`);

    await pool.end();
    server.close();
  }

  console.log('\n====================================================');
  console.log(' ALL MULTER IMAGE UPLOAD & VERIFICATION TESTS PASSED');
  console.log('====================================================');
}

run().catch((err) => {
  console.error('\n[FATAL ERROR]:', err);
  process.exit(1);
});
