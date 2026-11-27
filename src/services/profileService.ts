import bcrypt from 'bcryptjs';
import { UserRepository } from '../repositories/userRepository';
import { UserProfile } from '../types';
import { ProfileValidator } from '../validators/profileValidator';

const BCRYPT_SALT_ROUNDS = 10;

export class ProfileService {
  /**
   * Helper to format a safe UserProfile from a stored user record
   */
  public static toSafeProfile(user: any): UserProfile {
    const preferences = user.preferences || {
      newsletter_subscribed: true,
      sms_updates: true,
      favorite_categories: ['Journals', 'Planners']
    };

    return {
      id: user.id,
      name: user.name,
      full_name: user.name,
      email: user.email,
      phone: user.phone,
      gender: user.gender || 'prefer_not_to_say',
      avatar_url: user.avatar_url || `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(user.name)}`,
      joined_date: user.created_at instanceof Date ? user.created_at.toISOString() : String(user.created_at),
      created_at: user.created_at instanceof Date ? user.created_at.toISOString() : String(user.created_at),
      updated_at: user.updated_at instanceof Date ? user.updated_at.toISOString() : String(user.updated_at),
      preferences: {
        newsletter_subscribed: preferences.newsletter_subscribed ?? true,
        sms_updates: preferences.sms_updates ?? true,
        favorite_categories: preferences.favorite_categories ?? ['Journals', 'Planners']
      }
    };
  }

  /**
   * Retrieve profile of the currently authenticated user
   */
  public static async getProfile(userId: string): Promise<UserProfile> {
    const user = await UserRepository.findUserById(userId);
    if (!user) {
      const err: any = new Error('User account not found.');
      err.statusCode = 404;
      throw err;
    }

    if (user.account_status && user.account_status !== 'active') {
      const err: any = new Error('Account is inactive or suspended.');
      err.statusCode = 401;
      throw err;
    }

    return this.toSafeProfile(user);
  }

  /**
   * Update profile fields of the currently authenticated user in MySQL
   */
  public static async updateProfile(
    userId: string,
    input: any
  ): Promise<{ success: boolean; profile: UserProfile }> {
    const user = await UserRepository.findUserById(userId);
    if (!user) {
      const err: any = new Error('User account not found.');
      err.statusCode = 404;
      throw err;
    }

    if (user.account_status && user.account_status !== 'active') {
      const err: any = new Error('Account is inactive or suspended.');
      err.statusCode = 401;
      throw err;
    }

    const validation = await ProfileValidator.validateUpdate(input, userId);
    if (!validation.isValid || !validation.sanitized) {
      const err: any = new Error(validation.errors[0]?.message || 'Profile update validation failed');
      err.statusCode = 400;
      err.errors = validation.errors;
      throw err;
    }

    const s = validation.sanitized;

    // Persist in MySQL via UserRepository
    const updatedUser = await UserRepository.updateProfile(userId, s);
    const finalUser = updatedUser || user;

    return {
      success: true,
      profile: this.toSafeProfile(finalUser)
    };
  }

  /**
   * Change password for the currently authenticated user in MySQL
   */
  public static async changePassword(
    userId: string,
    input: any
  ): Promise<{ success: boolean; message: string }> {
    const validation = ProfileValidator.validateChangePassword(input);
    if (!validation.isValid) {
      const err: any = new Error(validation.errors[0]?.message || 'Password change validation failed');
      err.statusCode = 400;
      err.errors = validation.errors;
      throw err;
    }

    const user = await UserRepository.findUserById(userId);
    if (!user) {
      const err: any = new Error('User account not found.');
      err.statusCode = 404;
      throw err;
    }

    if (user.account_status && user.account_status !== 'active') {
      const err: any = new Error('Account is inactive or suspended.');
      err.statusCode = 401;
      throw err;
    }

    // Verify current password against stored hash using bcrypt
    const isCurrentValid = await bcrypt.compare(input.currentPassword, user.password_hash);
    if (!isCurrentValid) {
      const err: any = new Error('Incorrect current password.');
      err.statusCode = 400;
      throw err;
    }

    // Hash new password using bcrypt (10 salt rounds)
    const salt = await bcrypt.genSalt(BCRYPT_SALT_ROUNDS);
    const newHash = await bcrypt.hash(input.newPassword, salt);

    // Update password in MySQL
    await UserRepository.updatePassword(userId, newHash);

    return {
      success: true,
      message: 'Password changed successfully.'
    };
  }
}
