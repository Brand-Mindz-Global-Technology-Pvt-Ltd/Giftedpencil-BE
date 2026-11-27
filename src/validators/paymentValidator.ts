import { ValidationError, ValidationResult } from './addressValidator';

export class PaymentValidator {
  public static validatePaymentCreation(input: any): ValidationResult {
    const errors: ValidationError[] = [];

    if (!input || typeof input !== 'object') {
      return {
        isValid: false,
        errors: [{ field: 'body', message: 'Payment initiation payload is required.' }]
      };
    }

    // Cash on Delivery Strict Rejection Rule
    const method = String(input.payment_method || '').toUpperCase();
    if (method === 'COD' || method === 'CASH_ON_DELIVERY') {
      errors.push({
        field: 'payment_method',
        message: 'Cash on Delivery (COD) is not supported. Only 100% secure Online Payments (Cards/UPI/NetBanking) are accepted.'
      });
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  public static validatePaymentVerification(input: any): ValidationResult {
    const errors: ValidationError[] = [];

    if (!input || typeof input !== 'object') {
      return {
        isValid: false,
        errors: [{ field: 'body', message: 'Payment verification payload is required.' }]
      };
    }

    if (!input.transaction_id || typeof input.transaction_id !== 'string' || !input.transaction_id.trim()) {
      errors.push({
        field: 'transaction_id',
        message: 'transaction_id is required for payment verification.'
      });
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }
}
