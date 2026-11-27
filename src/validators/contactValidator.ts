import { ValidationError } from './addressValidator';

export interface ContactValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  sanitized?: {
    name: string;
    email: string;
    phone?: string;
    subject?: string;
    message: string;
  };
}

const INDIAN_MOBILE_REGEX = /^(\+91|91|0)?[6-9]\d{9}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class ContactValidator {
  /**
   * Validates and sanitizes contact submission input
   */
  public static validate(input: any): ContactValidationResult {
    const errors: ValidationError[] = [];

    if (!input || typeof input !== 'object') {
      return {
        isValid: false,
        errors: [{ field: 'body', message: 'Payload must be provided as a JSON object.' }]
      };
    }

    // 1. Name validation (supports `name` or `firstName` + optional `lastName`)
    let resolvedName = '';
    if (typeof input.name === 'string') {
      resolvedName = input.name.trim();
    } else if (typeof input.firstName === 'string') {
      const first = input.firstName.trim();
      const last = typeof input.lastName === 'string' ? input.lastName.trim() : '';
      resolvedName = last ? `${first} ${last}` : first;
    }

    if (!resolvedName) {
      errors.push({ field: 'name', message: 'Name is required and cannot be empty.' });
    } else if (resolvedName.length < 2) {
      errors.push({ field: 'name', message: 'Name must be at least 2 characters long.' });
    }

    // 2. Email validation
    let resolvedEmail = '';
    if (typeof input.email !== 'string' || !input.email.trim()) {
      errors.push({ field: 'email', message: 'Email address is required and cannot be empty.' });
    } else {
      resolvedEmail = input.email.trim();
      if (!EMAIL_REGEX.test(resolvedEmail)) {
        errors.push({ field: 'email', message: 'Please provide a valid email address.' });
      }
    }

    // 3. Message validation
    let resolvedMessage = '';
    if (typeof input.message !== 'string' || !input.message.trim()) {
      errors.push({ field: 'message', message: 'Message is required and cannot be empty.' });
    } else {
      resolvedMessage = input.message.trim();
      if (resolvedMessage.length < 5) {
        errors.push({ field: 'message', message: 'Message must be at least 5 characters long.' });
      }
    }

    // 4. Phone validation (optional, but if provided must be valid)
    let resolvedPhone: string | undefined = undefined;
    if (input.phone !== undefined && input.phone !== null && String(input.phone).trim() !== '') {
      const cleaned = String(input.phone).trim().replace(/[\s-]/g, '');
      if (!INDIAN_MOBILE_REGEX.test(cleaned)) {
        errors.push({
          field: 'phone',
          message: 'Invalid phone number. Must be a valid 10-digit Indian mobile number.'
        });
      } else {
        resolvedPhone = cleaned.length === 10 ? cleaned : cleaned.slice(-10);
      }
    }

    // 5. Subject validation (optional, supports `subject` or `enquiryType` or `enquiry_type`)
    let resolvedSubject: string | undefined = undefined;
    const rawSubject = input.subject || input.enquiryType || input.enquiry_type;
    if (typeof rawSubject === 'string' && rawSubject.trim() !== '') {
      resolvedSubject = rawSubject.trim();
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
      sanitized: {
        name: resolvedName,
        email: resolvedEmail,
        phone: resolvedPhone,
        subject: resolvedSubject || 'General Enquiry',
        message: resolvedMessage
      }
    };
  }
}
