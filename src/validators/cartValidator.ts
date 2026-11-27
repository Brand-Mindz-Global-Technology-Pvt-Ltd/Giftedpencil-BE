import { ValidationError, ValidationResult } from './addressValidator';

export class CartValidator {
  public static validateAddItem(input: any): ValidationResult {
    const errors: ValidationError[] = [];

    if (!input || typeof input !== 'object') {
      return {
        isValid: false,
        errors: [{ field: 'body', message: 'Cart item payload must be provided.' }]
      };
    }

    const productId = Number(input.product_id);
    if (!Number.isInteger(productId) || productId <= 0) {
      errors.push({
        field: 'product_id',
        message: 'product_id is required and must be a positive integer.'
      });
    }

    if (input.quantity !== undefined && input.quantity !== null) {
      const qty = Number(input.quantity);
      if (!Number.isInteger(qty) || qty <= 0) {
        errors.push({
          field: 'quantity',
          message: 'quantity must be a positive integer greater than 0.'
        });
      } else if (qty > 10) {
        errors.push({
          field: 'quantity',
          message: 'Maximum limit of 10 items per product reached.'
        });
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  public static validateUpdateQuantity(input: any): ValidationResult {
    const errors: ValidationError[] = [];

    if (!input || typeof input !== 'object') {
      return {
        isValid: false,
        errors: [{ field: 'body', message: 'Update quantity payload must be provided.' }]
      };
    }

    const qty = Number(input.quantity);
    if (!Number.isInteger(qty) || qty < 0) {
      errors.push({
        field: 'quantity',
        message: 'quantity must be a non-negative integer (set 0 to remove item).'
      });
    } else if (qty > 10) {
      errors.push({
        field: 'quantity',
        message: 'Maximum limit of 10 items per product reached.'
      });
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }
}
