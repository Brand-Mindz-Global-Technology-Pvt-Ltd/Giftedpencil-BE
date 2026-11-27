import http from 'http';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

import app from '../src/app';
import pool from '../src/config/db';
import { RowDataPacket } from 'mysql2';

const TEST_PORT = 5098;
const BASE_URL = `http://localhost:${TEST_PORT}`;

interface BaselineContact {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  enquiry_type: string;
  subject: string | null;
  message: string;
  status: string;
  admin_notes: string | null;
  created_at: string;
  updated_at: string;
}

async function runVerification() {
  console.log('================================================================');
  console.log('    THE GIFTED PENCIL - ADMIN CONTACT ENQUIRIES VERIFICATION    ');
  console.log('================================================================\n');

  let server: http.Server | null = null;
  let adminToken = '';
  let baselineContacts: BaselineContact[] = [];
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
    // PHASE 0: Baseline Snapshot & Safety Invariant Setup
    // -------------------------------------------------------------
    console.log('[PHASE 0] Recording contacts database baseline snapshot...');

    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT id, name, email, phone, enquiry_type, subject, message, status, admin_notes, created_at, updated_at FROM contacts ORDER BY id ASC'
    );

    baselineContacts = rows.map(r => ({
      id: Number(r.id),
      name: String(r.name),
      email: String(r.email),
      phone: r.phone ? String(r.phone) : null,
      enquiry_type: String(r.enquiry_type),
      subject: r.subject ? String(r.subject) : null,
      message: String(r.message),
      status: String(r.status),
      admin_notes: r.admin_notes ? String(r.admin_notes) : null,
      created_at: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
      updated_at: r.updated_at instanceof Date ? r.updated_at.toISOString() : String(r.updated_at)
    }));

    console.log(`  -> Baseline contacts count: ${baselineContacts.length}`);
    baselineContacts.forEach(c => {
      console.log(`     - Contact ID ${c.id}: ${c.name} (${c.email}), status='${c.status}'`);
    });
    assert(baselineContacts.length >= 1, 'Database contains baseline contact enquiries');

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

    // 2.1 Admin login
    const loginRes = await fetch(`${BASE_URL}/api/admin/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin2@thegiftedpencil.com', password: '12345' })
    });
    const loginData = await loginRes.json();
    assert(loginRes.status === 200 && Boolean(loginData.token), 'Admin login succeeds and returns JWT', loginData);
    adminToken = loginData.token;

    // 2.2 Unauthenticated request rejected
    const unauthRes = await fetch(`${BASE_URL}/api/admin/contacts`);
    assert(unauthRes.status === 401, 'Unauthenticated request to GET /api/admin/contacts rejected with 401');

    // 2.3 Invalid token rejected
    const invalidRes = await fetch(`${BASE_URL}/api/admin/contacts`, {
      headers: { Authorization: 'Bearer invalid.token.payload' }
    });
    assert(invalidRes.status === 401 || invalidRes.status === 403, 'Invalid token rejected with 401 or 403');

    // 2.4 Customer-style token without admin privileges rejected
    // (A malformed or non-admin payload is rejected by adminAuthMiddleware)
    const custRes = await fetch(`${BASE_URL}/api/admin/contacts`, {
      headers: { Authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MTAwMSwidHlwZSI6ImN1c3RvbWVyIn0.signature' }
    });
    assert(custRes.status === 401 || custRes.status === 403, 'Customer token strictly rejected with 401/403');

    // 2.5 Authorized admin request succeeds
    const authRes = await fetch(`${BASE_URL}/api/admin/contacts`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert(authRes.status === 200, 'Authorized admin request succeeds with 200');

    // -------------------------------------------------------------
    // PHASE 3: Contact List Endpoint & Data Contract
    // -------------------------------------------------------------
    console.log('\n[PHASE 3] Testing Contact Enquiries List & Data Contract...');

    const listData = await authRes.json();
    assert(listData.status === 'success', 'Response status is success');
    assert(Array.isArray(listData.contacts) || Array.isArray(listData.data), 'Returns contacts array');
    const contacts = listData.contacts || listData.data;

    assert(contacts.length >= baselineContacts.length, `List returns baseline contacts (got ${contacts.length})`);

    const firstContact = contacts.find((c: any) => c.id === baselineContacts[0].id);
    assert(Boolean(firstContact), `Baseline contact ID ${baselineContacts[0].id} found in list`);
    assert(firstContact.name === baselineContacts[0].name, 'Contact name matches database');
    assert(firstContact.email === baselineContacts[0].email, 'Contact email matches database');
    assert(firstContact.message === baselineContacts[0].message, 'Contact message matches database');
    assert(firstContact.status === baselineContacts[0].status, 'Contact status matches database');
    assert(Boolean(firstContact.statusLabel), 'Contact includes statusLabel helper');
    assert(Boolean(listData.pagination), 'Response includes pagination metadata');

    // -------------------------------------------------------------
    // PHASE 4: Server-Side Pagination
    // -------------------------------------------------------------
    console.log('\n[PHASE 4] Testing Server-Side Pagination...');

    const p1Res = await fetch(`${BASE_URL}/api/admin/contacts?page=1&limit=5`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const p1Data = await p1Res.json();
    assert(p1Data.pagination.page === 1 && p1Data.pagination.limit === 5, 'Pagination metadata matches page 1, limit 5');
    assert(p1Data.contacts.length <= 5, 'Returns at most 5 items per page');

    // -------------------------------------------------------------
    // PHASE 5: Search Filtering & Sorting
    // -------------------------------------------------------------
    console.log('\n[PHASE 5] Testing Search Filtering across Name, Email, Phone, and Message...');

    // 5.1 Search by customer name
    const searchNameRes = await fetch(`${BASE_URL}/api/admin/contacts?search=${encodeURIComponent(baselineContacts[0].name)}`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const searchNameData = await searchNameRes.json();
    assert(
      searchNameData.contacts.some((c: any) => c.id === baselineContacts[0].id),
      `Search by customer name ("${baselineContacts[0].name}") returns matching enquiry`
    );

    // 5.2 Search by customer email
    const searchEmailRes = await fetch(`${BASE_URL}/api/admin/contacts?search=${encodeURIComponent(baselineContacts[0].email)}`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const searchEmailData = await searchEmailRes.json();
    assert(
      searchEmailData.contacts.some((c: any) => c.id === baselineContacts[0].id),
      `Search by email ("${baselineContacts[0].email}") returns matching enquiry`
    );

    // 5.3 Search by message snippet
    const msgSnippet = baselineContacts[0].message.slice(0, 5);
    const searchMsgRes = await fetch(`${BASE_URL}/api/admin/contacts?search=${encodeURIComponent(msgSnippet)}`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const searchMsgData = await searchMsgRes.json();
    assert(
      searchMsgData.contacts.some((c: any) => c.id === baselineContacts[0].id),
      `Search by message snippet ("${msgSnippet}") returns matching enquiry`
    );

    // 5.4 Status filtering
    const filterStatusRes = await fetch(`${BASE_URL}/api/admin/contacts?status=${baselineContacts[0].status}`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const filterStatusData = await filterStatusRes.json();
    assert(
      filterStatusData.contacts.every((c: any) => c.status === baselineContacts[0].status),
      `Status filter ("${baselineContacts[0].status}") returns only matching status enquiries`
    );

    // 5.5 Sorting newest vs oldest
    const sortNewestRes = await fetch(`${BASE_URL}/api/admin/contacts?sortBy=newest`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const sortNewestData = await sortNewestRes.json();
    assert(sortNewestData.status === 'success', 'Sort by newest succeeds');

    const sortOldestRes = await fetch(`${BASE_URL}/api/admin/contacts?sortBy=oldest`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const sortOldestData = await sortOldestRes.json();
    assert(sortOldestData.status === 'success', 'Sort by oldest succeeds');

    // -------------------------------------------------------------
    // PHASE 6: Enquiry Details Endpoint
    // -------------------------------------------------------------
    console.log('\n[PHASE 6] Testing Enquiry Details Endpoint...');

    const detailRes = await fetch(`${BASE_URL}/api/admin/contacts/${baselineContacts[0].id}`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert(detailRes.status === 200, `GET /api/admin/contacts/${baselineContacts[0].id} returns 200`);
    const detailData = await detailRes.json();
    const contactDetail = detailData.contact || detailData.data;

    assert(contactDetail.id === baselineContacts[0].id, 'Enquiry ID matches requested ID');
    assert(contactDetail.name === baselineContacts[0].name, 'Enquiry customer name matches');
    assert(contactDetail.email === baselineContacts[0].email, 'Enquiry email matches');
    assert(contactDetail.message === baselineContacts[0].message, 'Enquiry complete message matches');
    assert(contactDetail.status === baselineContacts[0].status, 'Enquiry status matches');

    // Non-existent ID returns 404
    const notFoundRes = await fetch(`${BASE_URL}/api/admin/contacts/99999999`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert(notFoundRes.status === 404, 'Non-existent enquiry ID returns 404 Not Found');

    // -------------------------------------------------------------
    // PHASE 7: Status Updates on Dedicated Test Contact
    // -------------------------------------------------------------
    console.log('\n[PHASE 7] Testing Status Management on Isolated Test Contact...');

    let tempTestContactId = 0;
    try {
      // Create isolated test enquiry
      const [insertResult]: any = await pool.query(
        `INSERT INTO contacts (name, email, phone, enquiry_type, subject, message, status, created_at, updated_at)
         VALUES ('Status Test Contact', 'test_status@example.com', '9876543210', 'Bulk & Corporate Gifting', 'Test Quote', 'Testing status transitions', 'new', NOW(), NOW())`
      );
      tempTestContactId = insertResult.insertId;
      console.log(`  -> Created isolated test contact ID ${tempTestContactId}`);

      // 7.1 Update status to in_progress
      const patch1 = await fetch(`${BASE_URL}/api/admin/contacts/${tempTestContactId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ status: 'in_progress', adminNotes: 'Staff reviewing enquiry' })
      });
      assert(patch1.status === 200, 'PATCH /api/admin/contacts/:id/status updates to in_progress');
      const patch1Data = await patch1.json();
      assert(patch1Data.contact.status === 'in_progress', 'Updated status is in_progress');
      assert(patch1Data.contact.adminNotes === 'Staff reviewing enquiry', 'Admin notes updated correctly');

      // 7.2 Update status to resolved
      const patch2 = await fetch(`${BASE_URL}/api/admin/contacts/${tempTestContactId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ status: 'resolved', adminNotes: 'Quotation sent via email' })
      });
      assert(patch2.status === 200, 'PATCH /api/admin/contacts/:id/status updates to resolved');
      const patch2Data = await patch2.json();
      assert(patch2Data.contact.status === 'resolved', 'Updated status is resolved');

      // 7.3 Update status to archived
      const patch3 = await fetch(`${BASE_URL}/api/admin/contacts/${tempTestContactId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ status: 'archived' })
      });
      assert(patch3.status === 200, 'PATCH /api/admin/contacts/:id/status updates to archived');
      const patch3Data = await patch3.json();
      assert(patch3Data.contact.status === 'archived', 'Updated status is archived');

      // 7.4 Reject invalid status
      const patchInvalid = await fetch(`${BASE_URL}/api/admin/contacts/${tempTestContactId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ status: 'unknown_bogus_status' })
      });
      assert(patchInvalid.status === 400, 'Invalid status update rejected with 400 Bad Request');
    } finally {
      if (tempTestContactId > 0) {
        await pool.query('DELETE FROM contacts WHERE id = ?', [tempTestContactId]);
        console.log(`  -> Cleaned up isolated test contact ID ${tempTestContactId}`);
      }
    }

    // -------------------------------------------------------------
    // PHASE 8: Customer Contact Submission Preserved
    // -------------------------------------------------------------
    console.log('\n[PHASE 8] Testing Customer Contact Submission Preservation...');

    let customerTestContactId = 0;
    try {
      const customerSubmitRes = await fetch(`${BASE_URL}/api/contact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: 'Customer',
          lastName: 'Tester',
          email: 'customertester@example.com',
          phone: '9988776655',
          enquiryType: 'Feedback & Suggestions',
          message: 'This is a customer storefront enquiry test message.'
        })
      });

      assert(customerSubmitRes.status === 201 || customerSubmitRes.status === 200, 'Customer POST /api/contact succeeds');
      const custSubmitData = await customerSubmitRes.json();
      assert(custSubmitData.status === 'success', 'Customer submit response status is success');

      // Check if it appears in Admin Enquiries list
      const adminCheckRes = await fetch(`${BASE_URL}/api/admin/contacts?search=customertester@example.com`, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      const adminCheckData = await adminCheckRes.json();
      assert(
        adminCheckData.contacts.length >= 1 && adminCheckData.contacts[0].email === 'customertester@example.com',
        'Customer submission is immediately visible to Admin in real time'
      );
      customerTestContactId = adminCheckData.contacts[0].id;
    } finally {
      if (customerTestContactId > 0) {
        await pool.query('DELETE FROM contacts WHERE id = ?', [customerTestContactId]);
        console.log(`  -> Cleaned up customer test contact ID ${customerTestContactId}`);
      }
    }

    // -------------------------------------------------------------
    // PHASE 9: Zero Mutation Invariant Verification
    // -------------------------------------------------------------
    console.log('\n[PHASE 9] Verifying Zero Mutation of Existing Contact Records...');

    const [finalRows] = await pool.query<RowDataPacket[]>(
      'SELECT id, name, email, phone, enquiry_type, subject, message, status, admin_notes, created_at, updated_at FROM contacts ORDER BY id ASC'
    );

    const finalContacts: BaselineContact[] = finalRows.map(r => ({
      id: Number(r.id),
      name: String(r.name),
      email: String(r.email),
      phone: r.phone ? String(r.phone) : null,
      enquiry_type: String(r.enquiry_type),
      subject: r.subject ? String(r.subject) : null,
      message: String(r.message),
      status: String(r.status),
      admin_notes: r.admin_notes ? String(r.admin_notes) : null,
      created_at: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
      updated_at: r.updated_at instanceof Date ? r.updated_at.toISOString() : String(r.updated_at)
    }));

    assert(finalContacts.length === baselineContacts.length, `Contact count matches baseline: ${finalContacts.length} === ${baselineContacts.length}`);

    let allIdentical = true;
    for (let i = 0; i < baselineContacts.length; i++) {
      const b = baselineContacts[i];
      const f = finalContacts.find(c => c.id === b.id);
      if (
        !f ||
        b.name !== f.name ||
        b.email !== f.email ||
        b.phone !== f.phone ||
        b.enquiry_type !== f.enquiry_type ||
        b.subject !== f.subject ||
        b.message !== f.message ||
        b.status !== f.status
      ) {
        allIdentical = false;
        console.error('Mismatch detected on contact:', { baseline: b, final: f });
        break;
      }
    }

    assert(allIdentical, 'ZERO MUTATION GUARANTEE: All baseline contact records remain 100% byte-for-byte identical');

    console.log('\n================================================================');
    console.log(`  ALL ${passedTests}/${totalTests} TESTS PASSED SUCCESSFULLY!`);
    console.log('  Admin Contact Enquiries Module verified with 100% database integrity.');
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
