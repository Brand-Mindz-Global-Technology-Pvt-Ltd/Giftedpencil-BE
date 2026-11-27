import pool from '../config/db';
import { AdminUser, AdminRegisterInput } from '../types/admin';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import crypto from 'crypto';

export class AdminRepository {
  /**
   * Find admin by email address
   */
  public static async findByEmail(email: string): Promise<AdminUser | null> {
    try {
      const cleanEmail = email.trim().toLowerCase();
      const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT * FROM admin_users WHERE LOWER(email) = ? LIMIT 1`,
        [cleanEmail]
      );
      if (rows.length === 0) return null;
      return rows[0] as AdminUser;
    } catch (error: any) {
      console.warn('[AdminRepository.findByEmail] Query failed:', error.message);
      return null;
    }
  }

  /**
   * Find admin by integer ID or UUID
   */
  public static async findById(id: number | string): Promise<AdminUser | null> {
    try {
      const numId = Number(id);
      let query = `SELECT * FROM admin_users WHERE `;
      let params: any[];

      if (!isNaN(numId) && numId > 0) {
        query += `id = ? LIMIT 1`;
        params = [numId];
      } else {
        query += `admin_uuid = ? LIMIT 1`;
        params = [String(id)];
      }

      const [rows] = await pool.query<RowDataPacket[]>(query, params);
      if (rows.length === 0) return null;
      return rows[0] as AdminUser;
    } catch (error: any) {
      console.warn('[AdminRepository.findById] Query failed:', error.message);
      return null;
    }
  }

  /**
   * Find admin by username
   */
  public static async findByUsername(username: string): Promise<AdminUser | null> {
    try {
      const cleanUsername = username.trim().toLowerCase();
      const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT * FROM admin_users WHERE LOWER(username) = ? LIMIT 1`,
        [cleanUsername]
      );
      if (rows.length === 0) return null;
      return rows[0] as AdminUser;
    } catch (error: any) {
      console.warn('[AdminRepository.findByUsername] Query failed:', error.message);
      return null;
    }
  }

  /**
   * Create a new administrative user
   */
  public static async createAdmin(input: AdminRegisterInput & { passwordHash: string }): Promise<AdminUser> {
    const adminUuid = crypto.randomUUID();
    const role = input.role || 'admin';
    const avatarUrl = input.avatar_url || null;

    const [result] = await pool.query<ResultSetHeader>(
      `INSERT INTO admin_users (admin_uuid, username, email, password_hash, full_name, role, avatar_url, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
      [
        adminUuid,
        input.username.trim(),
        input.email.trim().toLowerCase(),
        input.passwordHash,
        input.full_name.trim(),
        role,
        avatarUrl
      ]
    );

    const created = await this.findById(result.insertId);
    if (!created) {
      throw new Error('Failed to retrieve newly created admin record.');
    }
    return created;
  }

  /**
   * Update last login timestamp
   */
  public static async updateLastLogin(id: number): Promise<void> {
    try {
      await pool.query(
        `UPDATE admin_users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [id]
      );
    } catch (error: any) {
      console.warn('[AdminRepository.updateLastLogin] Query failed:', error.message);
    }
  }

  /**
   * Update admin profile fields (full_name, email, username, avatar_url)
   */
  public static async updateProfile(
    id: number | string,
    data: {
      full_name?: string;
      email?: string;
      username?: string;
      avatar_url?: string;
    }
  ): Promise<AdminUser | null> {
    const fields: string[] = [];
    const values: any[] = [];

    if (data.full_name !== undefined) {
      fields.push('full_name = ?');
      values.push(data.full_name.trim());
    }
    if (data.email !== undefined) {
      fields.push('email = ?');
      values.push(data.email.trim().toLowerCase());
    }
    if (data.username !== undefined) {
      fields.push('username = ?');
      values.push(data.username.trim().toLowerCase());
    }
    if (data.avatar_url !== undefined) {
      fields.push('avatar_url = ?');
      values.push(data.avatar_url);
    }

    if (fields.length === 0) {
      return this.findById(id);
    }

    const numId = Number(id);
    let whereClause = '';
    if (!isNaN(numId) && numId > 0) {
      whereClause = 'id = ?';
      values.push(numId);
    } else {
      whereClause = 'admin_uuid = ?';
      values.push(String(id));
    }

    await pool.query(
      `UPDATE admin_users SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE ${whereClause}`,
      values
    );

    return this.findById(id);
  }

  /**
   * Update admin password hash
   */
  public static async updatePassword(
    id: number | string,
    passwordHash: string
  ): Promise<void> {
    const numId = Number(id);
    let whereClause = '';
    let param: any;

    if (!isNaN(numId) && numId > 0) {
      whereClause = 'id = ?';
      param = numId;
    } else {
      whereClause = 'admin_uuid = ?';
      param = String(id);
    }

    await pool.query(
      `UPDATE admin_users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE ${whereClause}`,
      [passwordHash, param]
    );
  }
}
