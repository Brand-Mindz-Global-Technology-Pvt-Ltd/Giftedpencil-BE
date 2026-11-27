import { ValidationError } from './addressValidator';
import { UserRepository } from '../repositories/userRepository';

export interface ProfileUpdateValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  sanitized?: {
    name?: string;
    email?: string;
    phone?: string;
    gender?: string;
    avatar_url?: string;
    preferences?: {
      newsletter_subscribed?: boolean;
      sms_updates?: boolean;
      favorite_categories?: string[];
    };
  };
}

export interface ChangePasswordValidationResult {
  isValid: boolean;
  errors: ValidationError[];
}

const INDIAN_MOBILE_REGEX = /^(\+91|91|0)?[6-9]\d{9}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class ProfileValidator {
  /**
   * Validate and sanitize profile update payload
   */
  public static async validateUpdate(input: any, currentUserId: string): Promise<ProfileUpdateValidationResult> {
    const errors: ValidationError[] = [];

    if (!input || typeof input !== 'object') {
      return {
        isValid: false,
        errors: [{ field: 'body', message: 'Payload must be provided as a JSON object.' }]
      };
    }

    const sanitized: any = {};

    // 1. Name / Full Name
    const rawName = input.name !== undefined ? input.name : (input.full_name !== undefined ? input.full_name : input.fullName);
    if (rawName !== undefined) {
      if (typeof rawName !== 'string' || !rawName.trim()) {
        errors.push({ field: 'name', message: 'Name cannot be empty.' });
      } else if (rawName.trim().length < 2) {
        errors.push({ field: 'name', message: 'Name must be at least 2 characters long.' });
      } else {
        sanitized.name = rawName.trim();
      }
    }

    // 2. Email (with duplicate check against other users in MySQL and store)
    if (input.email !== undefined) {
      if (typeof input.email !== 'string' || !input.email.trim()) {
        errors.push({ field: 'email', message: 'Email address cannot be empty.' });
      } else {
        const cleanEmail = input.email.trim().toLowerCase();
        if (!EMAIL_REGEX.test(cleanEmail)) {
          errors.push({ field: 'email', message: 'Please provide a valid email address.' });
        } else {
          const existingInDb = await UserRepository.findUserByEmailExcluding(cleanEmail, currentUserId);
          if (existingInDb) {
            errors.push({ field: 'email', message: 'An account with this email address already exists.' });
          } else {
            sanitized.email = cleanEmail;
          }
        }
      }
    }

    // 3. Phone (with Indian mobile regex and duplicate check against other users in MySQL and store)
    if (input.phone !== undefined) {
      const rawPhone = String(input.phone).trim();
      if (!rawPhone) {
        errors.push({ field: 'phone', message: 'Phone number cannot be empty.' });
      } else {
        const cleanPhone = rawPhone.replace(/[\s-]/g, '');
        if (!INDIAN_MOBILE_REGEX.test(cleanPhone)) {
          errors.push({
            field: 'phone',
            message: 'Please provide a valid 10-digit Indian mobile number.'
          });
        } else {
          const normalizedPhone = cleanPhone.length === 10 ? cleanPhone : cleanPhone.slice(-10);
          const existingInDb = await UserRepository.findUserByPhoneExcluding(normalizedPhone, currentUserId);
          if (existingInDb) {
            errors.push({ field: 'phone', message: 'An account with this phone number already exists.' });
          } else {
            sanitized.phone = normalizedPhone;
          }
        }
      }
    }

    // 4. Gender
    if (input.gender !== undefined) {
      if (typeof input.gender === 'string') {
        sanitized.gender = input.gender.trim();
      }
    }

    // 5. Avatar / Photo URL
    const rawAvatar = input.avatar_url !== undefined ? input.avatar_url : input.photoUrl;
    if (rawAvatar !== undefined) {
      if (typeof rawAvatar === 'string') {
        sanitized.avatar_url = rawAvatar.trim();
      }
    }

    // 6. Preferences
    if (input.preferences !== undefined) {
      if (typeof input.preferences === 'object' && input.preferences !== null) {
        sanitized.preferences = {
          ...(input.preferences.newsletter_subscribed !== undefined && {
            newsletter_subscribed: Boolean(input.preferences.newsletter_subscribed)
          }),
          ...(input.preferences.sms_updates !== undefined && {
            sms_updates: Boolean(input.preferences.sms_updates)
          }),
          ...(Array.isArray(input.preferences.favorite_categories) && {
            favorite_categories: input.preferences.favorite_categories
          })
        };
      }
    }

    if (errors.length > 0) {
      return {
        isValid: false,
        errors
      };
    }

    return {
      isValid: true,
      errors: [],
      sanitized
    };
  }

  /**
   * Validate password change payload
   */
  public static validateChangePassword(input: any): ChangePasswordValidationResult {
    const errors: ValidationError[] = [];

    if (!input || typeof input !== 'object') {
      return {
        isValid: false,
        errors: [{ field: 'body', message: 'Payload must be provided as a JSON object.' }]
      };
    }

    // 1. Current Password
    if (!input.currentPassword || typeof input.currentPassword !== 'string' || !input.currentPassword.trim()) {
      errors.push({ field: 'currentPassword', message: 'Current password is required.' });
    }

    // 2. New Password
    if (!input.newPassword || typeof input.newPassword !== 'string') {
      errors.push({ field: 'newPassword', message: 'New password is required.' });
    } else if (input.newPassword.length < 8) {
      errors.push({ field: 'newPassword', message: 'New password must be at least 8 characters long.' });
    }

    // 3. Confirm Password (if supplied, must match newPassword)
    if (input.confirmPassword !== undefined && input.confirmPassword !== null) {
      if (input.newPassword !== input.confirmPassword) {
        errors.push({
          field: 'confirmPassword',
          message: 'New password and confirmation password do not match.'
        });
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }
}
