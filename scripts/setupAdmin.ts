import readline from 'readline';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import pool from '../src/config/db';

const args: string[] = process.argv.slice(2);
const getArg = (name: string): string | null => {
  const prefix = `--${name}=`;
  const found = args.find((a) => a.startsWith(prefix));
  return found ? found.slice(prefix.length) : null;
};

let rl: readline.Interface | null = null;
function getReadline(): readline.Interface {
  if (!rl) {
    rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
  }
  return rl;
}

function prompt(question: string): Promise<string> {
  return new Promise((resolve) => getReadline().question(question, resolve));
}

async function createAdminCli(): Promise<void> {
  const connection = await pool.getConnection();
  try {
    const [dbRows] = await connection.query<RowDataPacket[]>('SELECT DATABASE() AS current_db');
    const currentDb = dbRows[0]?.current_db;
    if (currentDb !== 'gifted_pencil_test') {
      throw new Error(`Safety Abort: Connected to "${currentDb}", expected strictly "gifted_pencil_test"`);
    }

    console.log('====================================================');
    console.log(' The Gifted Pencil - SuperAdmin Initial Account Setup');
    console.log(' Database: gifted_pencil_test (Local MySQL)');
    console.log('====================================================\n');

    // Check if superadmin already exists
    const [superadminRows] = await connection.query<RowDataPacket[]>(
      "SELECT COUNT(*) AS count FROM admin_users WHERE role = 'superadmin'"
    );
    const existingSuperAdminCount = Number(superadminRows[0]?.count || 0);

    if (existingSuperAdminCount > 0) {
      console.warn(`[Warning]: Database already has ${existingSuperAdminCount} superadmin account(s).`);
      const forceFlag = args.includes('--force');
      if (!forceFlag && process.stdin.isTTY) {
        const proceed = await prompt('Do you want to create an additional superadmin? (y/N): ');
        if (proceed.trim().toLowerCase() !== 'y') {
          console.log('Aborting setup.');
          return;
        }
      } else if (!forceFlag) {
        console.log('[Notice]: SuperAdmin already exists. Setup aborted to prevent duplicate initial superadmin.');
        return;
      }
    }

    let username = getArg('username') || process.env.ADMIN_USERNAME || '';
    while (!username) {
      username = (await prompt('Enter Admin Username: ')).trim();
      if (!username) console.log('Username cannot be empty.');
    }

    let email = getArg('email') || process.env.ADMIN_EMAIL || '';
    while (!email || !email.includes('@')) {
      email = (await prompt('Enter Admin Email: ')).trim().toLowerCase();
      if (!email || !email.includes('@')) console.log('Please enter a valid email address.');
    }

    let fullName = getArg('fullName') || getArg('name') || process.env.ADMIN_FULLNAME || '';
    while (!fullName) {
      fullName = (await prompt('Enter Admin Full Name: ')).trim();
      if (!fullName) console.log('Full name cannot be empty.');
    }

    let password = getArg('password') || process.env.ADMIN_PASSWORD || '';
    while (!password || password.length < 8) {
      password = (await prompt('Enter Admin Password (min 8 characters): ')).trim();
      if (!password || password.length < 8) console.log('Password must be at least 8 characters.');
    }

    // Check for existing username or email
    const [existingRows] = await connection.query<RowDataPacket[]>(
      'SELECT id, username, email FROM admin_users WHERE LOWER(username) = ? OR LOWER(email) = ?',
      [username.toLowerCase(), email.toLowerCase()]
    );

    if (existingRows.length > 0) {
      console.log('\n[Error]: An admin account with this username or email already exists. Aborting.');
      return;
    }

    // Securely hash password with bcrypt (10 rounds)
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    const adminUuid = crypto.randomUUID();
    const role = 'superadmin';

    const [insertResult] = await connection.query<ResultSetHeader>(
      `INSERT INTO admin_users (admin_uuid, username, email, password_hash, full_name, role, is_active)
       VALUES (?, ?, ?, ?, ?, ?, 1)`,
      [adminUuid, username, email, passwordHash, fullName, role]
    );

    console.log('\n====================================================');
    console.log(' [SUCCESS]: SuperAdmin account successfully created!');
    console.log(` Admin ID:    ${insertResult.insertId}`);
    console.log(` UUID:        ${adminUuid}`);
    console.log(` Username:    ${username}`);
    console.log(` Email:       ${email}`);
    console.log(` Full Name:   ${fullName}`);
    console.log(` Role:        ${role}`);
    console.log(' Status:      active (is_active = 1)');
    console.log(' Password:    [PROTECTED - BCRYPT 10 ROUNDS]');
    console.log('====================================================\n');

  } catch (error: any) {
    console.error('\n[Error during setup]:', error.message);
  } finally {
    if (rl) rl.close();
    connection.release();
    await pool.end();
  }
}

createAdminCli().catch((err: Error) => {
  console.error('[Setup Fatal Error]:', err.message);
  process.exit(1);
});
