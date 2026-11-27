import { ValidationError, ValidationResult } from './addressValidator';

const INDIAN_MOBILE_REGEX = /^(\+91|91|0)?[6-9]\d{9}$/;
const INDIAN_PINCODE_REGEX = /^[1-9][0-9]{5}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class OrderValidator {
  /**
   * Validate quick single-item order input
   * Payload: { product_id, customer_name, phone, address, quantity }
   */
  public static validateQuickOrder(input: any): ValidationResult {
    const errors: ValidationError[] = [];

    if (!input || typeof input !== 'object') {
      return {
        isValid: false,
        errors: [{ field: 'body', message: 'Order payload must be provided as a JSON object.' }]
      };
    }

    // 1. Product ID
    const rawId = input.product_id !== undefined ? input.product_id : input.productId;
    const productId = Number(rawId);
    if (rawId === undefined || rawId === null || rawId === '') {
      errors.push({ field: 'product_id', message: 'product_id is required' });
    } else if (isNaN(productId) || !Number.isInteger(productId) || productId <= 0) {
      errors.push({ field: 'product_id', message: 'product_id must be a positive integer' });
    }

    // 2. Quantity
    const rawQty = input.quantity !== undefined ? input.quantity : 1;
    const qty = Number(rawQty);
    if (rawQty === undefined || rawQty === null || rawQty === '') {
      errors.push({ field: 'quantity', message: 'quantity is required' });
    } else if (isNaN(qty) || !Number.isInteger(qty) || qty <= 0) {
      errors.push({ field: 'quantity', message: 'quantity must be a positive integer greater than 0' });
    }

    // 3. Customer Name
    const name = input.customer_name || input.name;
    if (!name || typeof name !== 'string' || !name.trim()) {
      errors.push({ field: 'customer_name', message: 'customer_name is required' });
    } else if (name.trim().length < 2) {
      errors.push({ field: 'customer_name', message: 'customer_name must be at least 2 characters long' });
    }

    // 4. Phone
    if (!input.phone || typeof input.phone !== 'string' || !input.phone.trim()) {
      errors.push({ field: 'phone', message: 'phone is required' });
    } else {
      const cleanPhone = input.phone.trim().replace(/[\s-]/g, '');
      if (!INDIAN_MOBILE_REGEX.test(cleanPhone)) {
        errors.push({
          field: 'phone',
          message: 'Invalid phone number. Please provide a valid 10-digit Indian mobile number'
        });
      }
    }

    // 5. Address
    if (!input.address || typeof input.address !== 'string' || !input.address.trim()) {
      errors.push({ field: 'address', message: 'address is required' });
    }

    // 6. Email (optional)
    if (input.email !== undefined && input.email !== null && String(input.email).trim() !== '') {
      if (typeof input.email !== 'string' || !EMAIL_REGEX.test(input.email.trim())) {
        errors.push({ field: 'email', message: 'Invalid email address format' });
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate cart checkout order input
   */
  public static validateCheckoutOrder(input: any): ValidationResult {
    const errors: ValidationError[] = [];

    if (!input || typeof input !== 'object') {
      return {
        isValid: false,
        errors: [{ field: 'body', message: 'Checkout payload must be provided as a JSON object.' }]
      };
    }

    const hasAddressId = input.address_id !== undefined && input.address_id !== null && String(input.address_id).trim() !== '';

    if (!hasAddressId) {
      // Name
      const name = input.customer_name || input.name;
      if (!name || typeof name !== 'string' || !name.trim()) {
        errors.push({ field: 'customer_name', message: 'customer_name is required' });
      }

      // Phone
      if (!input.phone || typeof input.phone !== 'string' || !input.phone.trim()) {
        errors.push({ field: 'phone', message: 'phone is required' });
      } else {
        const cleanPhone = input.phone.trim().replace(/[\s-]/g, '');
        if (!INDIAN_MOBILE_REGEX.test(cleanPhone)) {
          errors.push({
            field: 'phone',
            message: 'Invalid phone number. Please provide a valid 10-digit Indian mobile number.'
          });
        }
      }

      // Pincode
      if (!input.pincode || typeof input.pincode !== 'string' || !input.pincode.trim()) {
        errors.push({ field: 'pincode', message: 'pincode is required' });
      } else if (!INDIAN_PINCODE_REGEX.test(input.pincode.trim())) {
        errors.push({
          field: 'pincode',
          message: 'Invalid PIN code. Please enter a valid 6-digit Indian postal PIN code.'
        });
      }

      // Address
      const address = input.address || input.house_details || input.street;
      if (!address || typeof address !== 'string' || !address.trim()) {
        errors.push({ field: 'address', message: 'address is required' });
      }

      // City
      if (!input.city || typeof input.city !== 'string' || !input.city.trim()) {
        errors.push({ field: 'city', message: 'city is required' });
      }

      // State
      if (!input.state || typeof input.state !== 'string' || !input.state.trim()) {
        errors.push({ field: 'state', message: 'state is required' });
      }
    } else {
      const numAddrId = Number(String(input.address_id).replace(/\D/g, ''));
      if (isNaN(numAddrId) || numAddrId <= 0) {
        errors.push({ field: 'address_id', message: 'Valid address_id is required' });
      }
    }

    // Items array (if provided, must be valid array of items)
    if (input.items !== undefined) {
      if (!Array.isArray(input.items) || input.items.length === 0) {
        errors.push({ field: 'items', message: 'items must contain at least 1 product' });
      } else {
        for (let i = 0; i < input.items.length; i++) {
          const it = input.items[i];
          const pId = Number(it.product_id !== undefined ? it.product_id : it.productId);
          const qty = Number(it.quantity);

          if (!Number.isInteger(pId) || pId <= 0) {
            errors.push({ field: `items[${i}].product_id`, message: `Invalid product_id at item position ${i + 1}` });
          }
          if (!Number.isInteger(qty) || qty <= 0) {
            errors.push({ field: `items[${i}].quantity`, message: `Quantity must be at least 1 at item position ${i + 1}` });
          }
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }
}
