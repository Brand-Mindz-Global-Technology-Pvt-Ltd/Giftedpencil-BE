import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { AdminRepository } from '../repositories/adminRepository';
import {
  AdminUser,
  SafeAdminUser,
  AdminLoginInput,
  AdminRegisterInput,
  JwtAdminPayload
} from '../types/admin';

const ADMIN_JWT_SECRET: string = process.env.ADMIN_JWT_SECRET || process.env.JWT_SECRET || 'the-gifted-pencil-admin-secret-2026';
const ADMIN_JWT_EXPIRY: string = process.env.ADMIN_JWT_EXPIRY || '12h';
const BCRYPT_SALT_ROUNDS = 10;

export class AdminService {
  /**
   * Convert AdminUser to client-safe representation
   */
  public static toSafeAdmin(admin: AdminUser): SafeAdminUser {
    return {
      id: admin.id,
      admin_uuid: admin.admin_uuid,
      username: admin.username,
      email: admin.email,
      full_name: admin.full_name,
      role: admin.role,
      avatar_url: admin.avatar_url,
      is_active: Boolean(admin.is_active),
      last_login_at: admin.last_login_at,
      created_at: admin.created_at
    };
  }

  /**
   * Generate dedicated Admin JWT token
   */
  public static generateAdminToken(admin: AdminUser): string {
    const payload: JwtAdminPayload = {
      adminId: admin.id,
      adminUuid: admin.admin_uuid,
      email: admin.email,
      username: admin.username,
      role: admin.role,
      type: 'admin'
    };

    return jwt.sign(payload, ADMIN_JWT_SECRET, {
      expiresIn: ADMIN_JWT_EXPIRY as any
    });
  }

  /**
   * Authenticate admin with email and password
   */
  public static async login(
    input: AdminLoginInput
  ): Promise<{ admin: SafeAdminUser; token: string }> {
    const cleanEmail = (input.email || '').trim().toLowerCase();
    const cleanPassword = input.password || '';

    if (!cleanEmail || !cleanPassword) {
      const err: any = new Error('Email and password are required.');
      err.statusCode = 400;
      throw err;
    }

    const admin = await AdminRepository.findByEmail(cleanEmail);
    if (!admin) {
      const err: any = new Error('Invalid email or password.');
      err.statusCode = 401;
      throw err;
    }

    if (!admin.is_active) {
      const err: any = new Error('Admin account is inactive. Please contact superadmin.');
      err.statusCode = 403;
      throw err;
    }

    const isMatch = await bcrypt.compare(cleanPassword, admin.password_hash);
    if (!isMatch) {
      const err: any = new Error('Invalid email or password.');
      err.statusCode = 401;
      throw err;
    }

    // Record login timestamp
    await AdminRepository.updateLastLogin(admin.id);

    const safeAdmin = this.toSafeAdmin(admin);
    const token = this.generateAdminToken(admin);

    return { admin: safeAdmin, token };
  }

  /**
   * Register a new admin account (secure internal creation)
   */
  public static async register(
    input: AdminRegisterInput
  ): Promise<{ admin: SafeAdminUser; message: string }> {
    const cleanEmail = (input.email || '').trim().toLowerCase();
    const cleanUsername = (input.username || '').trim().toLowerCase();

    if (!cleanEmail || !input.password || !cleanUsername || !input.full_name) {
      const err: any = new Error('All registration fields (username, email, password, full_name) are required.');
      err.statusCode = 400;
      throw err;
    }

    const existingEmail = await AdminRepository.findByEmail(cleanEmail);
    if (existingEmail) {
      const err: any = new Error('An admin account with this email already exists.');
      err.statusCode = 409;
      throw err;
    }

    const existingUser = await AdminRepository.findByUsername(cleanUsername);
    if (existingUser) {
      const err: any = new Error('An admin account with this username already exists.');
      err.statusCode = 409;
      throw err;
    }

    const passwordHash = await bcrypt.hash(input.password, BCRYPT_SALT_ROUNDS);

    const created = await AdminRepository.createAdmin({
      ...input,
      passwordHash
    });

    return {
      admin: this.toSafeAdmin(created),
      message: 'Admin account created successfully.'
    };
  }

  /**
   * Get admin profile by ID
   */
  public static async getProfile(id: number | string): Promise<SafeAdminUser> {
    const admin = await AdminRepository.findById(id);
    if (!admin) {
      const err: any = new Error('Admin account not found.');
      err.statusCode = 404;
      throw err;
    }
    return this.toSafeAdmin(admin);
  }

  /**
   * Update admin profile
   */
  public static async updateProfile(
    id: number | string,
    input: {
      full_name?: string;
      email?: string;
      username?: string;
      avatar_url?: string;
    }
  ): Promise<SafeAdminUser> {
    const admin = await AdminRepository.findById(id);
    if (!admin) {
      const err: any = new Error('Admin account not found.');
      err.statusCode = 404;
      throw err;
    }

    if (input.email) {
      const cleanEmail = input.email.trim().toLowerCase();
      const existingEmail = await AdminRepository.findByEmail(cleanEmail);
      if (existingEmail && String(existingEmail.id) !== String(admin.id)) {
        const err: any = new Error('An admin account with this email already exists.');
        err.statusCode = 409;
        throw err;
      }
    }

    if (input.username) {
      const cleanUsername = input.username.trim().toLowerCase();
      const existingUser = await AdminRepository.findByUsername(cleanUsername);
      if (existingUser && String(existingUser.id) !== String(admin.id)) {
        const err: any = new Error('An admin account with this username already exists.');
        err.statusCode = 409;
        throw err;
      }
    }

    const updated = await AdminRepository.updateProfile(admin.id, input);
    if (!updated) {
      const err: any = new Error('Failed to update admin profile.');
      err.statusCode = 500;
      throw err;
    }

    return this.toSafeAdmin(updated);
  }

  /**
   * Change admin password with current password verification
   */
  public static async changePassword(
    id: number | string,
    currentPassword?: string,
    newPassword?: string
  ): Promise<{ message: string }> {
    if (!newPassword || newPassword.trim().length < 6) {
      const err: any = new Error('New password must be at least 6 characters long.');
      err.statusCode = 400;
      throw err;
    }

    const admin = await AdminRepository.findById(id);
    if (!admin) {
      const err: any = new Error('Admin account not found.');
      err.statusCode = 404;
      throw err;
    }

    // Verify current password if provided
    if (currentPassword) {
      const isMatch = await bcrypt.compare(currentPassword, admin.password_hash);
      if (!isMatch) {
        const err: any = new Error('Current password is incorrect.');
        err.statusCode = 400;
        throw err;
      }
    }

    const newHash = await bcrypt.hash(newPassword, BCRYPT_SALT_ROUNDS);
    await AdminRepository.updatePassword(admin.id, newHash);

    return { message: 'Password updated successfully.' };
  }
}
