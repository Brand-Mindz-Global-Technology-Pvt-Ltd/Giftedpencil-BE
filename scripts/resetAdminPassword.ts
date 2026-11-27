import readline from 'readline';
import bcrypt from 'bcryptjs';
import { RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import { Server } from 'http';
import pool from '../src/config/db';
import app from '../src/app';
import { AdminService } from '../src/services/adminService';

const args: string[] = process.argv.slice(2);
const getArg = (name: string): string | null => {
  const prefix = `--${name}=`;
  const found = args.find((a) => a.startsWith(prefix));
  return found ? found.slice(prefix.length) : null;
};

function prompt(query: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(query, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function resetAdminPassword(): Promise<void> {
  const targetEmail = (getArg('email') || 'admin@thegiftedpencil.com').trim().toLowerCase();

  console.log('====================================================');
  console.log(' The Gifted Pencil - Admin Password Reset');
  console.log(` Target Account: ${targetEmail}`);
  console.log('====================================================\n');

  const connection = await pool.getConnection();

  try {
    // 1. Safety verification: Verify database is strictly gifted_pencil_test
    const [dbRows] = await connection.query<RowDataPacket[]>('SELECT DATABASE() AS current_db');
    const currentDb = dbRows[0]?.current_db;
    if (currentDb !== 'gifted_pencil_test') {
      throw new Error(`Safety Abort: Active DB is "${currentDb}", expected strictly "gifted_pencil_test"`);
    }
    console.log(`[Safety Verified]: Connected to database "${currentDb}".`);

    // 2. Find existing account by email only
    const [accountRows] = await connection.query<RowDataPacket[]>(
      'SELECT id, admin_uuid, username, email, role, is_active FROM admin_users WHERE LOWER(email) = ?',
      [targetEmail]
    );

    if (accountRows.length === 0) {
      throw new Error(`Account Error: No admin account found with email "${targetEmail}". Aborting without changes.`);
    }

    if (accountRows.length > 1) {
      throw new Error(`Account Error: Multiple accounts (${accountRows.length}) found with email "${targetEmail}". Aborting without changes.`);
    }

    const admin = accountRows[0];
    console.log(`[Account Found]: ID=${admin.id}, Username="${admin.username}", Role="${admin.role}", Status=${admin.is_active ? 'Active' : 'Inactive'}\n`);

    // 3. Interactive prompt for password and confirmation
    let newPassword = getArg('password') || '';
    let confirmPassword = getArg('confirmPassword') || '';

    if (!newPassword) {
      while (true) {
        newPassword = await prompt('Enter new Admin Password (min 8 characters): ');
        if (!newPassword || newPassword.length < 8) {
          console.log('[Error]: Password must be at least 8 characters long.\n');
          continue;
        }

        confirmPassword = await prompt('Confirm new Admin Password: ');
        if (newPassword !== confirmPassword) {
          console.log('[Error]: Passwords do not match. Please try again.\n');
          newPassword = '';
          confirmPassword = '';
          continue;
        }

        break;
      }
    } else {
      if (confirmPassword && newPassword !== confirmPassword) {
        throw new Error('Validation Error: Provided password and confirmPassword do not match.');
      }
      if (newPassword.length < 8) {
        throw new Error('Validation Error: Password must be at least 8 characters long.');
      }
    }

    // 4. Hash password with bcrypt (10 rounds)
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(newPassword, saltRounds);

    // 5. Update only password_hash for this account
    const [updateResult] = await connection.query<ResultSetHeader>(
      'UPDATE admin_users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [passwordHash, admin.id]
    );

    if (updateResult.affectedRows !== 1) {
      throw new Error(`Update Error: Unexpected affectedRows (${updateResult.affectedRows}). Aborting.`);
    }

    console.log('\n[SUCCESS]: Admin password_hash updated successfully in database.');
    console.log(`[Target ID]: ${admin.id} (${admin.email})`);
    console.log('[Security]: Password and hash are securely protected (never logged).\n');

    // 6. Verify login using existing Admin login API (both Service and HTTP endpoint)
    console.log('--- Verifying Login via AdminService.login() ---');
    const serviceResult = await AdminService.login({
      email: admin.email,
      password: newPassword
    });

    if (serviceResult && serviceResult.token && serviceResult.admin?.id === admin.id) {
      console.log('  AdminService verification: PASS (Token generated successfully)');
    } else {
      throw new Error('AdminService verification failed.');
    }

    // HTTP Endpoint verification
    console.log('--- Verifying Login via HTTP POST /api/admin/auth/login ---');
    const PORT = 5098;
    const server: Server = app.listen(PORT);
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/api/admin/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: admin.email,
          password: newPassword
        })
      });
      const data = await res.json();
      if (res.status === 200 && data.token && data.admin?.id === admin.id) {
        console.log(`  HTTP Endpoint verification: PASS (Status 200, Role: ${data.admin.role})`);
      } else {
        throw new Error(`HTTP login verification failed with status ${res.status}: ${JSON.stringify(data)}`);
      }
    } finally {
      server.close();
    }

    console.log('\n====================================================');
    console.log(' PASSWORD RESET & API LOGIN VERIFICATION SUCCESSFUL!');
    console.log('====================================================\n');

  } finally {
    connection.release();
    await pool.end();
  }
}

resetAdminPassword().catch((err: Error) => {
  console.error('\n[RESET ERROR]:', err.message);
  process.exit(1);
});
