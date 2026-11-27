import { ValidationError, ValidationResult } from './addressValidator';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const INDIAN_MOBILE_REGEX = /^(\+91|91|0)?[6-9]\d{9}$/;

export class AuthValidator {
  /**
   * Validate user registration input
   */
  public static validateRegister(input: any): ValidationResult {
    const errors: ValidationError[] = [];

    if (!input || typeof input !== 'object') {
      return {
        isValid: false,
        errors: [{ field: 'body', message: 'Registration payload must be provided as a JSON object.' }]
      };
    }

    // Name validation
    if (!input.name || typeof input.name !== 'string' || !input.name.trim()) {
      errors.push({ field: 'name', message: 'Full name is required.' });
    } else if (input.name.trim().length < 2) {
      errors.push({ field: 'name', message: 'Full name must be at least 2 characters long.' });
    }

    // Email validation
    if (!input.email || typeof input.email !== 'string' || !input.email.trim()) {
      errors.push({ field: 'email', message: 'Email address is required.' });
    } else if (!EMAIL_REGEX.test(input.email.trim())) {
      errors.push({ field: 'email', message: 'Please provide a valid email address.' });
    }

    // Phone validation (Indian 10-digit mobile)
    if (!input.phone || typeof input.phone !== 'string' || !input.phone.trim()) {
      errors.push({ field: 'phone', message: 'Mobile number is required.' });
    } else {
      const cleaned = input.phone.trim().replace(/[\s-]/g, '');
      if (!INDIAN_MOBILE_REGEX.test(cleaned)) {
        errors.push({
          field: 'phone',
          message: 'Invalid phone number. Must be a valid 10-digit Indian mobile number starting with 6, 7, 8, or 9.'
        });
      }
    }

    // Gender validation (optional, but if provided must be valid)
    if (input.gender !== undefined && input.gender !== null && input.gender !== '') {
      const allowedGenders = ['female', 'male', 'prefer_not_to_say'];
      if (!allowedGenders.includes(String(input.gender).toLowerCase())) {
        errors.push({
          field: 'gender',
          message: 'Gender must be "female", "male", or "prefer_not_to_say".'
        });
      }
    }

    // Password strength validation
    if (!input.password || typeof input.password !== 'string') {
      errors.push({ field: 'password', message: 'Password is required.' });
    } else {
      const pwd = input.password;
      if (pwd.length < 8) {
        errors.push({ field: 'password', message: 'Password must be at least 8 characters long.' });
      } else if (!/[A-Za-z]/.test(pwd) || !/[0-9]/.test(pwd)) {
        errors.push({
          field: 'password',
          message: 'Password must contain at least one letter and at least one number.'
        });
      }
    }

    // Confirm password validation
    if (!input.confirmPassword || typeof input.confirmPassword !== 'string') {
      errors.push({ field: 'confirmPassword', message: 'Please confirm your password.' });
    } else if (input.password !== input.confirmPassword) {
      errors.push({ field: 'confirmPassword', message: 'Passwords do not match.' });
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate user login input
   */
  public static validateLogin(input: any): ValidationResult {
    const errors: ValidationError[] = [];

    if (!input || typeof input !== 'object') {
      return {
        isValid: false,
        errors: [{ field: 'body', message: 'Login credentials must be provided as a JSON object.' }]
      };
    }

    if (!input.email || typeof input.email !== 'string' || !input.email.trim()) {
      errors.push({ field: 'email', message: 'Email address is required.' });
    } else if (!EMAIL_REGEX.test(input.email.trim())) {
      errors.push({ field: 'email', message: 'Please provide a valid email address.' });
    }

    if (!input.password || typeof input.password !== 'string') {
      errors.push({ field: 'password', message: 'Password is required.' });
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate forgot-password input
   */
  public static validateForgotPassword(input: any): ValidationResult {
    const errors: ValidationError[] = [];

    if (!input || typeof input !== 'object') {
      return {
        isValid: false,
        errors: [{ field: 'body', message: 'Request payload must be provided.' }]
      };
    }

    if (!input.email || typeof input.email !== 'string' || !input.email.trim()) {
      errors.push({ field: 'email', message: 'Registered email address is required.' });
    } else if (!EMAIL_REGEX.test(input.email.trim())) {
      errors.push({ field: 'email', message: 'Please provide a valid email address.' });
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate reset-password input
   */
  public static validateResetPassword(input: any): ValidationResult {
    const errors: ValidationError[] = [];

    if (!input || typeof input !== 'object') {
      return {
        isValid: false,
        errors: [{ field: 'body', message: 'Request payload must be provided.' }]
      };
    }

    if (!input.token || typeof input.token !== 'string' || !input.token.trim()) {
      errors.push({ field: 'token', message: 'Password reset token is required.' });
    }

    if (!input.password || typeof input.password !== 'string') {
      errors.push({ field: 'password', message: 'New password is required.' });
    } else {
      const pwd = input.password;
      if (pwd.length < 8) {
        errors.push({ field: 'password', message: 'Password must be at least 8 characters long.' });
      } else if (!/[A-Za-z]/.test(pwd) || !/[0-9]/.test(pwd)) {
        errors.push({
          field: 'password',
          message: 'Password must contain at least one letter and at least one number.'
        });
      }
    }

    if (!input.confirmPassword || typeof input.confirmPassword !== 'string') {
      errors.push({ field: 'confirmPassword', message: 'Please confirm your new password.' });
    } else if (input.password !== input.confirmPassword) {
      errors.push({ field: 'confirmPassword', message: 'Passwords do not match.' });
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }
}
