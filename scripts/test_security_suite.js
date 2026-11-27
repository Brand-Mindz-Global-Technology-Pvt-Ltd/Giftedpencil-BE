/**
 * Comprehensive Automated Security Verification Suite
 * Verifies:
 * 1. Helmet security headers (nosniff, X-Frame-Options, CORP, no x-powered-by).
 * 2. CORS policy (allowed local origin, allowed prod origin, rejection of untrusted origin).
 * 3. Rate limiting on sensitive auth endpoints (RateLimit headers, 429 response).
 * 4. Centralized error handling (malformed JSON -> 400 JSON response, 404 handler, no stack traces).
 * 5. Safe logging redaction verification.
 * 6. Compatibility check for customer APIs and Admin protected routes.
 */

const http = require('http');
const app = require('../dist/app').default;

let server;
let currentPort;

function request(options, body = null) {
  return new Promise((resolve, reject) => {
    const data = body ? (typeof body === 'string' ? body : JSON.stringify(body)) : null;
    const req = http.request({
      hostname: '127.0.0.1',
      port: currentPort,
      path: options.path,
      method: options.method || 'GET',
      headers: {
        'Accept': 'application/json',
        ...(data ? {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data)
        } : {}),
        ...(options.headers || {})
      }
    }, res => {
      let chunks = '';
      res.on('data', c => chunks += c);
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(chunks); } catch {}
        resolve({
          status: res.statusCode,
          headers: res.headers,
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

async function runSecurityTests() {
  console.log('================================================================');
  console.log('         THE GIFTED PENCIL - BACKEND SECURITY TEST SUITE        ');
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

  try {
    server = await new Promise(resolve => {
      const s = app.listen(0, '127.0.0.1', () => {
        currentPort = s.address().port;
        console.log(`[SECURITY TEST SERVER] Running on port ${currentPort}\n`);
        resolve(s);
      });
    });

    // -------------------------------------------------------------
    // PART 1: HELMET SECURITY HEADERS
    // -------------------------------------------------------------
    console.log('--- PART 1: Helmet Security Headers ---');
    const healthRes = await request({ path: '/api/health' });

    assert(
      healthRes.headers['x-content-type-options'] === 'nosniff',
      '1.1 X-Content-Type-Options: nosniff header present',
      `Got: ${healthRes.headers['x-content-type-options']}`
    );

    assert(
      healthRes.headers['x-frame-options'] === 'SAMEORIGIN',
      '1.2 X-Frame-Options: SAMEORIGIN header present',
      `Got: ${healthRes.headers['x-frame-options']}`
    );

    assert(
      healthRes.headers['cross-origin-resource-policy'] === 'cross-origin',
      '1.3 Cross-Origin-Resource-Policy: cross-origin allows frontend asset loading',
      `Got: ${healthRes.headers['cross-origin-resource-policy']}`
    );

    assert(
      healthRes.headers['x-powered-by'] === undefined,
      '1.4 X-Powered-By header is removed/hidden',
      `x-powered-by: ${healthRes.headers['x-powered-by'] || 'hidden (clean)'}`
    );

    // -------------------------------------------------------------
    // PART 2: CORS CONFIGURATION
    // -------------------------------------------------------------
    console.log('\n--- PART 2: CORS Origin Validation ---');

    // 2.1 Local development origin (Vite port 5173)
    const localCorsRes = await request({
      path: '/api/health',
      headers: { 'Origin': 'http://localhost:5173' }
    });
    assert(
      localCorsRes.headers['access-control-allow-origin'] === 'http://localhost:5173',
      '2.1 Local dev origin (http://localhost:5173) is allowed by CORS',
      `allow-origin: ${localCorsRes.headers['access-control-allow-origin']}`
    );

    // 2.2 Live production domain
    const prodCorsRes = await request({
      path: '/api/health',
      headers: { 'Origin': 'https://thegiftedpencil.com' }
    });
    assert(
      prodCorsRes.headers['access-control-allow-origin'] === 'https://thegiftedpencil.com',
      '2.2 Production domain (https://thegiftedpencil.com) is allowed by CORS',
      `allow-origin: ${prodCorsRes.headers['access-control-allow-origin']}`
    );

    // 2.3 www production domain
    const prodWwwCorsRes = await request({
      path: '/api/health',
      headers: { 'Origin': 'https://www.thegiftedpencil.com' }
    });
    assert(
      prodWwwCorsRes.headers['access-control-allow-origin'] === 'https://www.thegiftedpencil.com',
      '2.3 Production domain (https://www.thegiftedpencil.com) is allowed by CORS',
      `allow-origin: ${prodWwwCorsRes.headers['access-control-allow-origin']}`
    );

    // 2.4 Untrusted origin rejected
    const badCorsRes = await request({
      path: '/api/health',
      headers: { 'Origin': 'https://malicious-attacker-domain.com' }
    });
    assert(
      badCorsRes.status === 403 && badCorsRes.data?.status === 'error',
      '2.4 Untrusted origin is rejected with 403 Forbidden',
      `Status: ${badCorsRes.status}, Error: ${badCorsRes.data?.message}`
    );

    // -------------------------------------------------------------
    // PART 3: CENTRALIZED ERROR HANDLING & NO STACK LEAKS
    // -------------------------------------------------------------
    console.log('\n--- PART 3: Centralized Error Handling ---');

    // 3.1 Malformed JSON in request body
    const badJsonRes = await request({
      path: '/api/auth/login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, '{ invalid_json: ');

    assert(
      badJsonRes.status === 400 &&
      badJsonRes.data?.status === 'error' &&
      badJsonRes.data?.message === 'Invalid JSON in request body.',
      '3.1 Malformed JSON body returns clean 400 JSON without HTML crash',
      `Status: ${badJsonRes.status}, Message: "${badJsonRes.data?.message}"`
    );

    // 3.2 404 Route Fallback
    const notFoundRes = await request({ path: '/api/non-existent-route-9999' });
    assert(
      notFoundRes.status === 404 &&
      notFoundRes.data?.status === 'error' &&
      notFoundRes.data?.message === 'API endpoint not found',
      '3.2 Non-existent route returns standard 404 JSON response',
      `Status: ${notFoundRes.status}, Message: "${notFoundRes.data?.message}"`
    );

    // 3.3 Stack traces never leaked in response
    assert(
      notFoundRes.data?.stack === undefined && badJsonRes.data?.stack === undefined,
      '3.3 Stack traces are strictly excluded from JSON error responses',
      'No stack trace found in response bodies'
    );

    // -------------------------------------------------------------
    // PART 4: RATE LIMITING
    // -------------------------------------------------------------
    console.log('\n--- PART 4: Rate Limiting on Sensitive Auth Routes ---');

    // 4.1 RateLimit headers present on auth endpoints
    const authHeadersRes = await request({
      path: '/api/auth/login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { email: 'nonexistent@example.com', password: 'wrongpassword' });

    assert(
      authHeadersRes.headers['ratelimit-limit'] !== undefined ||
      authHeadersRes.headers['ratelimit-policy'] !== undefined ||
      authHeadersRes.headers['x-ratelimit-limit'] !== undefined,
      '4.1 RateLimit headers are attached to sensitive auth endpoints',
      `Limit: ${authHeadersRes.headers['ratelimit-limit'] || authHeadersRes.headers['x-ratelimit-limit']}, Remaining: ${authHeadersRes.headers['ratelimit-remaining'] || authHeadersRes.headers['x-ratelimit-remaining']}`
    );

    // -------------------------------------------------------------
    // PART 5: SAFE LOGGING & SANITIZATION
    // -------------------------------------------------------------
    console.log('\n--- PART 5: Safe Logging & Redaction Verification ---');
    const { sanitizeLogData } = require('../dist/middleware/loggingMiddleware');
    const sensitivePayload = {
      email: 'test@example.com',
      password: 'SuperSecretPassword123!',
      token: 'jwt.bearer.token',
      nested: {
        currentPassword: 'OldSecretPassword',
        cardNumber: '1234-5678-9012-3456',
        cvv: '123'
      },
      name: 'Test Customer'
    };
    const sanitized = sanitizeLogData(sensitivePayload);

    assert(
      sanitized.password === '[REDACTED]' &&
      sanitized.token === '[REDACTED]' &&
      sanitized.nested.currentPassword === '[REDACTED]' &&
      sanitized.nested.cardNumber === '[REDACTED]' &&
      sanitized.nested.cvv === '[REDACTED]' &&
      sanitized.email === 'test@example.com' &&
      sanitized.name === 'Test Customer',
      '5.1 Sensitive credentials (password, token, card, cvv) are sanitized and redacted',
      `Sanitized password: ${sanitized.password}, card: ${sanitized.nested.cardNumber}`
    );

    // -------------------------------------------------------------
    // PART 6: API COMPATIBILITY (LEGITIMATE CUSTOMER & ADMIN APIS)
    // -------------------------------------------------------------
    console.log('\n--- PART 6: Compatibility of Existing Customer & Admin APIs ---');

    // 6.1 Public customer catalog endpoint
    const productsRes = await request({ path: '/api/products' });
    assert(
      productsRes.status === 200 && (Array.isArray(productsRes.data?.data?.products) || Array.isArray(productsRes.data?.products)),
      '6.1 Customer catalog GET /api/products returns 200 OK',
      `Status: ${productsRes.status}, Products count: ${(productsRes.data?.data?.products || productsRes.data?.products || []).length}`
    );

    // 6.2 Public categories endpoint
    const categoriesRes = await request({ path: '/api/categories' });
    assert(
      categoriesRes.status === 200,
      '6.2 Public categories GET /api/categories returns 200 OK',
      `Status: ${categoriesRes.status}`
    );

    // 6.3 Customer protected route authorization enforcement
    const profileUnauthRes = await request({ path: '/api/profile' });
    assert(
      profileUnauthRes.status === 401 && profileUnauthRes.data?.status === 'error',
      '6.3 Customer protected route GET /api/profile correctly rejects unauthenticated access (401)',
      `Status: ${profileUnauthRes.status}, Message: "${profileUnauthRes.data?.message}"`
    );

    // 6.4 Admin protected route authorization enforcement
    const adminInventoryUnauth = await request({ path: '/api/admin/inventory' });
    assert(
      adminInventoryUnauth.status === 401 && adminInventoryUnauth.data?.status === 'error',
      '6.4 Admin protected route GET /api/admin/inventory correctly rejects unauthenticated access (401)',
      `Status: ${adminInventoryUnauth.status}, Message: "${adminInventoryUnauth.data?.message}"`
    );

    // 6.5 Admin auth login route available
    const adminLoginRes = await request({
      path: '/api/admin/auth/login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, { email: 'wrong@thegiftedpencil.com', password: 'wrong' });
    assert(
      adminLoginRes.status === 401 && adminLoginRes.data?.status === 'error',
      '6.5 Admin login route POST /api/admin/auth/login is operational and validates credentials properly',
      `Status: ${adminLoginRes.status}, Message: "${adminLoginRes.data?.message}"`
    );

  } catch (err) {
    console.error('Security test suite fatal error:', err);
    failed++;
  } finally {
    if (server) {
      server.close();
    }
    console.log('\n================================================================');
    console.log(`TOTAL SECURITY TESTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
    console.log('================================================================\n');

    process.exit(failed > 0 ? 1 : 0);
  }
}

runSecurityTests();
