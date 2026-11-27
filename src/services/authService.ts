import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { addToBlocklist } from '../utils/tokenBlocklist';
import { UserRepository } from '../repositories/userRepository';
import {
  User,
  SafeUser,
  RegisterInput,
  LoginInput,
  ResetPasswordInput,
  JwtUserPayload,
  PasswordResetRecord
} from '../types/auth';
import { AuthValidator } from '../validators/authValidator';

const JWT_SECRET: string = process.env.JWT_SECRET || 'the-gifted-pencil-dev-secret-key-2026';
const BCRYPT_SALT_ROUNDS = 10;
const RESET_TOKEN_EXPIRY_MS = 60 * 60 * 1000; // 1 hour

export class AuthService {
  /**
   * Helper to strip password hashes and return client-safe user objects
   */
  public static toSafeUser(user: User): SafeUser {
    const { password_hash: _hash, ...safe } = user;
    return safe;
  }

  /**
   * Register a new user in MySQL
   */
  public static async register(input: RegisterInput): Promise<{ user: SafeUser; message: string }> {
    const validation = AuthValidator.validateRegister(input);
    if (!validation.isValid) {
      const err: any = new Error('Registration validation failed');
      err.statusCode = 400;
      err.errors = validation.errors;
      throw err;
    }

    const cleanEmail = input.email.trim().toLowerCase();
    const cleanPhone = input.phone.trim().replace(/[\s-]/g, '');

    // Check duplicate email in MySQL
    const existingByEmail = await UserRepository.findUserByEmail(cleanEmail);
    if (existingByEmail) {
      const err: any = new Error('An account with this email address already exists.');
      err.statusCode = 400;
      err.field = 'email';
      throw err;
    }

    // Check duplicate phone in MySQL
    const existingByPhone = await UserRepository.findUserByPhone(cleanPhone);
    if (existingByPhone) {
      const err: any = new Error('An account with this phone number already exists.');
      err.statusCode = 400;
      err.field = 'phone';
      throw err;
    }

    // Securely hash password with bcrypt (10 salt rounds)
    const salt = await bcrypt.genSalt(BCRYPT_SALT_ROUNDS);
    const password_hash = await bcrypt.hash(input.password, salt);

    // Create user in MySQL
    const newUser = await UserRepository.createUser({
      name: input.name.trim(),
      email: cleanEmail,
      phone: cleanPhone,
      gender: input.gender || 'prefer_not_to_say',
      password_hash,
      avatar_url: `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(input.name.trim())}`,
      account_status: 'active'
    });

    return {
      user: this.toSafeUser(newUser),
      message: 'Account registered successfully.'
    };
  }

  /**
   * User login with credential verification against MySQL and JWT generation
   */
  public static async login(input: LoginInput): Promise<{
    user: SafeUser;
    token: string;
    token_type: string;
    expires_in: string;
  }> {
    const validation = AuthValidator.validateLogin(input);
    if (!validation.isValid) {
      const err: any = new Error('Login validation failed');
      err.statusCode = 400;
      err.errors = validation.errors;
      throw err;
    }

    const cleanEmail = input.email.trim().toLowerCase();
    // Lookup user in MySQL
    const user = await UserRepository.findUserByEmail(cleanEmail);

    if (!user) {
      const err: any = new Error('Invalid email or password.');
      err.statusCode = 401;
      throw err;
    }

    // Check account status: reject inactive or suspended users
    if (user.account_status && user.account_status !== 'active') {
      const err: any = new Error('Account is inactive or suspended. Please contact customer support.');
      err.statusCode = 401;
      throw err;
    }

    // Securely compare password hash using bcrypt
    const isPasswordValid = await bcrypt.compare(input.password, user.password_hash);
    if (!isPasswordValid) {
      const err: any = new Error('Invalid email or password.');
      err.statusCode = 401;
      throw err;
    }

    // Generate JWT access token with expiry based on rememberMe (24h default, 7d rememberMe)
    const expiresIn: string = input.rememberMe ? '7d' : '24h';
    const payload: JwtUserPayload = {
      userId: user.id,
      email: user.email,
      name: user.name
    };

    const token = jwt.sign(payload, JWT_SECRET, {
      expiresIn: expiresIn as any
    });

    return {
      user: this.toSafeUser(user),
      token,
      token_type: 'Bearer',
      expires_in: expiresIn
    };
  }

  /**
   * Logout user by revoking token in blocklist
   */
  public static logout(token: string): { success: boolean; message: string } {
    if (!token) {
      const err: any = new Error('Token is required for logout.');
      err.statusCode = 400;
      throw err;
    }

    addToBlocklist(token);

    return {
      success: true,
      message: 'Logged out successfully.'
    };
  }

  /**
   * Request password reset token.
   * Constant generic message prevents account enumeration attacks.
   * Reset token hash (SHA-256) is stored in MySQL password_reset_tokens table.
   */
  public static async forgotPassword(email: string): Promise<{
    success: boolean;
    message: string;
    dev_reset_token?: string;
  }> {
    const validation = AuthValidator.validateForgotPassword({ email });
    if (!validation.isValid) {
      const err: any = new Error('Email validation failed');
      err.statusCode = 400;
      err.errors = validation.errors;
      throw err;
    }

    const cleanEmail = email.trim().toLowerCase();
    const user = await UserRepository.findUserByEmail(cleanEmail);

    const genericMessage =
      'If an account exists with this email address, password reset instructions have been sent.';

    if (!user) {
      // Do not reveal email absence
      return {
        success: true,
        message: genericMessage
      };
    }

    // Generate cryptographically secure reset token (64-char hex)
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + RESET_TOKEN_EXPIRY_MS);

    // If user has a numeric MySQL ID, store token in MySQL password_reset_tokens
    const numId = Number(String(user.id).replace(/\D/g, ''));
    if (!isNaN(numId) && numId > 0) {
      await UserRepository.createPasswordResetToken(numId, tokenHash, expiresAt);
    }

    const response: { success: boolean; message: string; dev_reset_token?: string } = {
      success: true,
      message: genericMessage
    };

    // In development or test mode, provide dev_reset_token for automated testing
    if (process.env.NODE_ENV !== 'production') {
      response.dev_reset_token = rawToken;
    }

    return response;
  }

  /**
   * Reset user password with token.
   * Verifies SHA-256 token hash from MySQL, updates password, and marks token consumed.
   */
  public static async resetPassword(input: ResetPasswordInput): Promise<{ success: boolean; message: string }> {
    const validation = AuthValidator.validateResetPassword(input);
    if (!validation.isValid) {
      const err: any = new Error('Password reset validation failed');
      err.statusCode = 400;
      err.errors = validation.errors;
      throw err;
    }

    const rawToken = input.token.trim();
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    // 1. Try finding token in MySQL password_reset_tokens table
    const mysqlToken = await UserRepository.findPasswordResetToken(tokenHash);

    if (mysqlToken) {
      if (mysqlToken.is_used) {
        const err: any = new Error('Invalid or already used password reset token.');
        err.statusCode = 400;
        throw err;
      }

      if (new Date() > mysqlToken.expires_at) {
        const err: any = new Error('Password reset token has expired. Please request a new one.');
        err.statusCode = 400;
        throw err;
      }

      if (mysqlToken.account_status && mysqlToken.account_status !== 'active') {
        const err: any = new Error('Account associated with this token is not active.');
        err.statusCode = 400;
        throw err;
      }

      // Securely hash new password with bcrypt
      const salt = await bcrypt.genSalt(BCRYPT_SALT_ROUNDS);
      const newHash = await bcrypt.hash(input.password, salt);

      // Atomically update password and mark token used in MySQL
      await UserRepository.consumePasswordResetToken(mysqlToken.id, mysqlToken.user_id, newHash);

      return {
        success: true,
        message: 'Password has been reset successfully. You can now log in with your new password.'
      };
    }

    const err: any = new Error('Invalid or already used password reset token.');
    err.statusCode = 400;
    throw err;
  }

  /**
   * Retrieve current authenticated user from MySQL
   */
  public static async getCurrentUser(userId: string): Promise<SafeUser> {
    const numId = Number(String(userId).replace(/\D/g, ''));
    let user: User | null = null;
    if (!isNaN(numId) && numId > 0) {
      user = await UserRepository.findUserById(numId);
    }

    if (!user) {
      const err: any = new Error('User not found.');
      err.statusCode = 404;
      throw err;
    }

    if (user.account_status && user.account_status !== 'active') {
      const err: any = new Error('User account is deactivated or suspended.');
      err.statusCode = 401;
      throw err;
    }

    return this.toSafeUser(user);
  }
}
