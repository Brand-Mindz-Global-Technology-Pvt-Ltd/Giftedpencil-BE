import { ValidationError, ValidationResult } from './addressValidator';

export class WishlistValidator {
  /**
   * Validate add-to-wishlist input payload
   */
  public static validateAddItem(input: any): ValidationResult {
    const errors: ValidationError[] = [];

    if (!input || typeof input !== 'object') {
      return {
        isValid: false,
        errors: [{ field: 'body', message: 'Payload must be provided as a JSON object.' }]
      };
    }

    const rawId = input.product_id !== undefined ? input.product_id : input.productId;
    const productId = Number(rawId);

    if (rawId === undefined || rawId === null || rawId === '') {
      errors.push({
        field: 'product_id',
        message: 'product_id is required.'
      });
    } else if (isNaN(productId) || !Number.isInteger(productId) || productId <= 0) {
      errors.push({
        field: 'product_id',
        message: 'product_id must be a positive integer.'
      });
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate URL productId parameter
   */
  public static validateProductId(param: any): ValidationResult {
    const errors: ValidationError[] = [];
    const productId = Number(param);

    if (param === undefined || param === null || param === '') {
      errors.push({
        field: 'productId',
        message: 'productId parameter is required.'
      });
    } else if (isNaN(productId) || !Number.isInteger(productId) || productId <= 0) {
      errors.push({
        field: 'productId',
        message: 'productId must be a positive integer.'
      });
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }
}
