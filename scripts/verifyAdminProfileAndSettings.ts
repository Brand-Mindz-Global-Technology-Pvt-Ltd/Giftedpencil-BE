import pool from '../src/config/db';
import { AdminService } from '../src/services/adminService';
import { AdminRepository } from '../src/repositories/adminRepository';
import { AdminSettingsRepository } from '../src/repositories/adminSettingsRepository';
import bcrypt from 'bcryptjs';

async function main() {
  console.log('--- Starting Admin Profile & Settings Verification ---');

  // 1. Verify DB connection and ensure customer data safety
  const [usersBefore] = await pool.query('SELECT COUNT(*) as count FROM users');
  const [ordersBefore] = await pool.query('SELECT COUNT(*) as count FROM orders');
  console.log(`Initial checks: users=${(usersBefore as any)[0].count}, orders=${(ordersBefore as any)[0].count}`);

  // 2. Fetch or create a test admin user
  let admin = await AdminRepository.findByEmail('testadmin@thegiftedpencil.com');
  if (!admin) {
    const hash = await bcrypt.hash('TestAdmin@123', 10);
    admin = await AdminRepository.createAdmin({
      username: 'testadmin',
      email: 'testadmin@thegiftedpencil.com',
      full_name: 'Test Administrator',
      role: 'admin',
      password: 'TestAdmin@123',
      passwordHash: hash
    });
    console.log('Created test admin:', admin.id, admin.email);
  } else {
    console.log('Using existing test admin:', admin.id, admin.email);
  }

  // 3. Test getProfile
  const profile = await AdminService.getProfile(admin.id);
  console.log('AdminService.getProfile SUCCESS:', profile.email, profile.full_name);

  // 4. Test updateProfile
  const updatedProfile = await AdminService.updateProfile(admin.id, {
    full_name: 'Test Administrator Updated',
    avatar_url: '/uploads/avatars/test-avatar.png'
  });
  console.log('AdminService.updateProfile SUCCESS:', updatedProfile.full_name, updatedProfile.avatar_url);

  // 5. Test changePassword with wrong password (should fail)
  try {
    await AdminService.changePassword(admin.id, 'WrongPassword', 'NewSecret@123');
    console.error('FAILED: changePassword should have thrown on wrong password');
    process.exit(1);
  } catch (err: any) {
    console.log('AdminService.changePassword wrong password rejected correctly:', err.message);
  }

  // 6. Test changePassword with correct password
  const pwResult = await AdminService.changePassword(admin.id, 'TestAdmin@123', 'TestAdmin@456');
  console.log('AdminService.changePassword SUCCESS:', pwResult.message);

  // Verify login with new password
  const loginRes = await AdminService.login({
    email: 'testadmin@thegiftedpencil.com',
    password: 'TestAdmin@456'
  });
  console.log('AdminService.login with new password SUCCESS, token length:', loginRes.token.length);

  // Restore original password
  await AdminService.changePassword(admin.id, 'TestAdmin@456', 'TestAdmin@123');
  console.log('Password restored back to TestAdmin@123');

  // 7. Test AdminSettingsRepository
  const testAdminId = String(admin.id);
  const company = AdminSettingsRepository.saveCompany(testAdminId, {
    companyName: 'The Gifted Pencil HQ',
    email: 'contact@giftedpencil.com',
    phone: '+91 99999 88888',
    address: '456 Artisans Lane, Chennai'
  });
  console.log('AdminSettingsRepository.saveCompany SUCCESS:', company.companyName);

  const fetchedCompany = AdminSettingsRepository.getCompany(testAdminId);
  console.log('AdminSettingsRepository.getCompany SUCCESS:', fetchedCompany?.companyName, fetchedCompany?.phone);

  const terms = AdminSettingsRepository.saveTerms(testAdminId, 'Terms & Conditions', '<p>Updated legal agreement</p>');
  console.log('AdminSettingsRepository.saveTerms SUCCESS:', terms.title);

  const privacy = AdminSettingsRepository.savePrivacy(testAdminId, 'Privacy Policy', '<p>Updated privacy notice</p>');
  console.log('AdminSettingsRepository.savePrivacy SUCCESS:', privacy.title);

  const cookie = AdminSettingsRepository.saveCookie(testAdminId, 'Cookie Policy', '<p>Updated cookie notice</p>');
  console.log('AdminSettingsRepository.saveCookie SUCCESS:', cookie.title);

  // 8. Confirm ZERO changes to customer tables
  const [usersAfter] = await pool.query('SELECT COUNT(*) as count FROM users');
  const [ordersAfter] = await pool.query('SELECT COUNT(*) as count FROM orders');
  if ((usersBefore as any)[0].count !== (usersAfter as any)[0].count || (ordersBefore as any)[0].count !== (ordersAfter as any)[0].count) {
    console.error('FATAL: Customer or order counts changed unexpectedly!');
    process.exit(1);
  }
  console.log(`Safety check PASSED: customer users=${(usersAfter as any)[0].count}, orders=${(ordersAfter as any)[0].count} unchanged.`);

  await pool.end();
  console.log('--- ALL VERIFICATIONS PASSED SUCCESSFULLY ---');
}

main().catch((err) => {
  console.error('Verification failed:', err);
  process.exit(1);
});
