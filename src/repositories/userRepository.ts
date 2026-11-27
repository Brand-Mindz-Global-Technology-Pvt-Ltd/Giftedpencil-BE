import pool from '../config/db';
import crypto from 'crypto';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { User, SafeUser, UserPreferences } from '../types/auth';

export interface CreateUserData {
  name: string;
  email: string;
  phone: string;
  gender?: string;
  password_hash: string;
  avatar_url?: string;
  preferences?: UserPreferences;
  newsletter_subscribed?: boolean;
  sms_updates?: boolean;
  account_status?: 'active' | 'inactive' | 'suspended';
}

export interface UpdateProfileData {
  name?: string;
  email?: string;
  phone?: string;
  gender?: string;
  avatar_url?: string;
  preferences?: UserPreferences;
}

export interface PasswordResetTokenRecord {
  id: number;
  user_id: number;
  token_hash: string;
  expires_at: Date;
  is_used: boolean;
  created_at: Date;
  email?: string;
  account_status?: 'active' | 'inactive' | 'suspended';
}

export class UserRepository {
  /**
   * Helper to strip password hashes and return client-safe user objects
   */
  public static toSafeUser(user: User): SafeUser {
    const { password_hash: _hash, ...safe } = user;
    return safe;
  }

  /**
   * Map raw MySQL user row to domain User interface
   */
  private static mapRowToUser(row: any): User {
    let preferences: UserPreferences | undefined;
    if (row.preferences) {
      if (typeof row.preferences === 'object') {
        preferences = row.preferences;
      } else if (typeof row.preferences === 'string') {
        try {
          preferences = JSON.parse(row.preferences);
        } catch {
          preferences = undefined;
        }
      }
    }

    return {
      id: `USR-${row.id}`,
      user_uuid: row.user_uuid,
      name: row.name,
      email: row.email,
      phone: row.phone,
      gender: row.gender || 'prefer_not_to_say',
      password_hash: row.password_hash,
      avatar_url: row.avatar_url || undefined,
      preferences: preferences || {
        newsletter_subscribed: Boolean(row.newsletter_subscribed),
        sms_updates: Boolean(row.sms_updates)
      },
      account_status: row.account_status,
      created_at: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
      updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at)
    };
  }

  /**
   * Find user by numeric ID or USR-xxx formatted string
   */
  public static async findUserById(id: number | string): Promise<User | null> {
    const numId = typeof id === 'number' ? id : Number(String(id).replace(/\D/g, ''));
    if (!numId || isNaN(numId) || numId <= 0) {
      return null;
    }

    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT * FROM users WHERE id = ? LIMIT 1`,
      [numId]
    );

    if (rows.length === 0) {
      return null;
    }

    return this.mapRowToUser(rows[0]);
  }

  /**
   * Find user by email (case-insensitive)
   */
  public static async findUserByEmail(email: string): Promise<User | null> {
    const cleanEmail = email.trim().toLowerCase();
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT * FROM users WHERE LOWER(email) = LOWER(?) LIMIT 1`,
      [cleanEmail]
    );

    if (rows.length === 0) {
      return null;
    }

    return this.mapRowToUser(rows[0]);
  }

  /**
   * Find user by phone number (handling variations like +91 / dashes / spaces)
   */
  public static async findUserByPhone(phone: string): Promise<User | null> {
    const rawClean = phone.trim().replace(/[\s-]/g, '');
    const tenDigits = rawClean.replace(/\+/g, '').slice(-10);

    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT * FROM users WHERE phone = ? OR phone = ? OR phone LIKE ? LIMIT 1`,
      [rawClean, tenDigits, `%${tenDigits}`]
    );

    if (rows.length === 0) {
      return null;
    }

    return this.mapRowToUser(rows[0]);
  }

  /**
   * Create a new user in the MySQL database
   */
  public static async createUser(data: CreateUserData): Promise<User> {
    const userUuid = crypto.randomUUID();
    const cleanEmail = data.email.trim().toLowerCase();
    const cleanPhone = data.phone.trim().replace(/[\s-]/g, '');
    const gender = data.gender || 'prefer_not_to_say';
    const avatarUrl = data.avatar_url || `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(data.name.trim())}`;
    const accountStatus = data.account_status || 'active';
    const newsletterSubscribed = data.newsletter_subscribed !== false ? 1 : 0;
    const smsUpdates = data.sms_updates !== false ? 1 : 0;
    const preferencesJson = data.preferences ? JSON.stringify(data.preferences) : JSON.stringify({
      newsletter_subscribed: Boolean(newsletterSubscribed),
      sms_updates: Boolean(smsUpdates)
    });

    const [result] = await pool.query<ResultSetHeader>(
      `INSERT INTO users (
        user_uuid,
        name,
        email,
        phone,
        gender,
        password_hash,
        avatar_url,
        newsletter_subscribed,
        sms_updates,
        preferences,
        account_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userUuid,
        data.name.trim(),
        cleanEmail,
        cleanPhone,
        gender,
        data.password_hash,
        avatarUrl,
        newsletterSubscribed,
        smsUpdates,
        preferencesJson,
        accountStatus
      ]
    );

    const insertedId = result.insertId;
    const createdUser = await this.findUserById(insertedId);
    if (!createdUser) {
      throw new Error('Failed to retrieve newly created user record from database.');
    }

    return createdUser;
  }

  /**
   * Find user by email excluding a given user ID (for duplicate checks during profile update)
   */
  public static async findUserByEmailExcluding(
    email: string,
    excludeUserId: number | string
  ): Promise<User | null> {
    const numId = typeof excludeUserId === 'number' ? excludeUserId : Number(String(excludeUserId).replace(/\D/g, ''));
    const cleanEmail = email.trim().toLowerCase();

    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT * FROM users WHERE LOWER(email) = LOWER(?) AND id != ? LIMIT 1`,
      [cleanEmail, numId || 0]
    );

    if (rows.length === 0) {
      return null;
    }

    return this.mapRowToUser(rows[0]);
  }

  /**
   * Find user by phone excluding a given user ID (for duplicate checks during profile update)
   */
  public static async findUserByPhoneExcluding(
    phone: string,
    excludeUserId: number | string
  ): Promise<User | null> {
    const numId = typeof excludeUserId === 'number' ? excludeUserId : Number(String(excludeUserId).replace(/\D/g, ''));
    const rawClean = phone.trim().replace(/[\s-]/g, '');
    const tenDigits = rawClean.replace(/\+/g, '').slice(-10);

    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT * FROM users WHERE (phone = ? OR phone = ? OR phone LIKE ?) AND id != ? LIMIT 1`,
      [rawClean, tenDigits, `%${tenDigits}`, numId || 0]
    );

    if (rows.length === 0) {
      return null;
    }

    return this.mapRowToUser(rows[0]);
  }

  /**
   * Update profile fields in MySQL
   */
  public static async updateProfile(
    userId: number | string,
    data: UpdateProfileData
  ): Promise<User | null> {
    const numId = typeof userId === 'number' ? userId : Number(String(userId).replace(/\D/g, ''));
    if (!numId || isNaN(numId) || numId <= 0) {
      return null;
    }

    const existing = await this.findUserById(numId);
    if (!existing) {
      return null;
    }

    const updates: string[] = [];
    const values: any[] = [];

    if (data.name !== undefined) {
      updates.push('name = ?');
      values.push(data.name.trim());
    }

    if (data.email !== undefined) {
      updates.push('email = ?');
      values.push(data.email.trim().toLowerCase());
    }

    if (data.phone !== undefined) {
      const rawClean = data.phone.trim().replace(/[\s-]/g, '');
      const cleanPhone = rawClean.length === 10 ? rawClean : rawClean.slice(-10);
      updates.push('phone = ?');
      values.push(cleanPhone);
    }

    if (data.gender !== undefined) {
      updates.push('gender = ?');
      values.push(data.gender);
    }

    if (data.avatar_url !== undefined) {
      updates.push('avatar_url = ?');
      values.push(data.avatar_url);
    }

    if (data.preferences !== undefined) {
      const mergedPrefs = {
        ...(existing.preferences || {}),
        ...data.preferences
      };
      updates.push('preferences = ?');
      values.push(JSON.stringify(mergedPrefs));

      if (data.preferences.newsletter_subscribed !== undefined) {
        updates.push('newsletter_subscribed = ?');
        values.push(data.preferences.newsletter_subscribed ? 1 : 0);
      }
      if (data.preferences.sms_updates !== undefined) {
        updates.push('sms_updates = ?');
        values.push(data.preferences.sms_updates ? 1 : 0);
      }
    }

    if (updates.length === 0) {
      return existing;
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    values.push(numId);

    await pool.query(
      `UPDATE users SET ${updates.join(', ')} WHERE id = ?`,
      values
    );

    return this.findUserById(numId);
  }

  /**
   * Update user password hash
   */
  public static async updatePassword(userId: number | string, passwordHash: string): Promise<boolean> {
    const numId = typeof userId === 'number' ? userId : Number(String(userId).replace(/\D/g, ''));
    if (!numId || isNaN(numId)) {
      return false;
    }

    const [result] = await pool.query<ResultSetHeader>(
      `UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [passwordHash, numId]
    );

    return result.affectedRows > 0;
  }

  /**
   * Create a password reset token record.
   * Invalidates any previous unused tokens for the user first.
   */
  public static async createPasswordResetToken(
    userId: number | string,
    tokenHash: string,
    expiresAt: Date
  ): Promise<void> {
    const numId = typeof userId === 'number' ? userId : Number(String(userId).replace(/\D/g, ''));
    if (!numId || isNaN(numId)) {
      throw new Error('Invalid user ID for password reset token creation.');
    }

    // Mark previous unused reset tokens for this user as used
    await pool.query(
      `UPDATE password_reset_tokens SET is_used = 1 WHERE user_id = ? AND is_used = 0`,
      [numId]
    );

    // Insert new token hash
    await pool.query(
      `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at, is_used)
       VALUES (?, ?, ?, 0)`,
      [numId, tokenHash, expiresAt]
    );
  }

  /**
   * Find password reset token by its SHA-256 hash, joining user details
   */
  public static async findPasswordResetToken(tokenHash: string): Promise<PasswordResetTokenRecord | null> {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT prt.id, prt.user_id, prt.token_hash, prt.expires_at, prt.is_used, prt.created_at,
              u.email, u.account_status
       FROM password_reset_tokens prt
       JOIN users u ON prt.user_id = u.id
       WHERE prt.token_hash = ?
       LIMIT 1`,
      [tokenHash]
    );

    if (rows.length === 0) {
      return null;
    }

    const row = rows[0];
    return {
      id: row.id,
      user_id: row.user_id,
      token_hash: row.token_hash,
      expires_at: new Date(row.expires_at),
      is_used: Boolean(row.is_used),
      created_at: new Date(row.created_at),
      email: row.email,
      account_status: row.account_status
    };
  }

  /**
   * Mark a reset token as used
   */
  public static async markResetTokenUsed(tokenId: number): Promise<boolean> {
    const [result] = await pool.query<ResultSetHeader>(
      `UPDATE password_reset_tokens SET is_used = 1 WHERE id = ?`,
      [tokenId]
    );
    return result.affectedRows > 0;
  }

  /**
   * Transactionally consume reset token and update user password
   */
  public static async consumePasswordResetToken(
    tokenId: number,
    userId: number | string,
    newPasswordHash: string
  ): Promise<boolean> {
    const numId = typeof userId === 'number' ? userId : Number(String(userId).replace(/\D/g, ''));
    if (!numId || isNaN(numId)) {
      return false;
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // Update password
      const [updateResult] = await connection.query<ResultSetHeader>(
        `UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [newPasswordHash, numId]
      );

      // Invalidate reset token
      const [tokenResult] = await connection.query<ResultSetHeader>(
        `UPDATE password_reset_tokens SET is_used = 1 WHERE id = ?`,
        [tokenId]
      );

      await connection.commit();
      return updateResult.affectedRows > 0 && tokenResult.affectedRows > 0;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }
}
