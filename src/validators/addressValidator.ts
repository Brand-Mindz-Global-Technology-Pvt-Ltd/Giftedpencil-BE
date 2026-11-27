export interface ValidationError {
  field: string;
  message: string;
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  sanitized?: {
    customer_name: string;
    phone: string;
    email?: string;
    pincode: string;
    house_details: string;
    street_area: string;
    landmark?: string;
    city: string;
    state: string;
    tag: string;
    is_default: boolean;
  };
}

const INDIAN_MOBILE_REGEX = /^(\+91|91|0)?[6-9]\d{9}$/;
const INDIAN_PINCODE_REGEX = /^[1-9][0-9]{5}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class AddressValidator {
  public static validate(input: any): ValidationResult {
    const errors: ValidationError[] = [];

    if (!input || typeof input !== 'object') {
      return {
        isValid: false,
        errors: [{ field: 'body', message: 'Address data must be provided as a JSON object.' }]
      };
    }

    // Customer Name (supports customer_name or name)
    const rawName = input.customer_name !== undefined ? input.customer_name : input.name;
    let customer_name = '';
    if (!rawName || typeof rawName !== 'string' || !rawName.trim()) {
      errors.push({ field: 'customer_name', message: 'Customer name is required and cannot be empty.' });
    } else if (rawName.trim().length < 2) {
      errors.push({ field: 'customer_name', message: 'Customer name must be at least 2 characters long.' });
    } else {
      customer_name = rawName.trim();
    }

    // Phone / Mobile (Strict Indian 10-digit)
    let phone = '';
    if (!input.phone || typeof input.phone !== 'string' || !input.phone.trim()) {
      errors.push({ field: 'phone', message: 'Phone number is required.' });
    } else {
      const cleaned = input.phone.trim().replace(/[\s-]/g, '');
      if (!INDIAN_MOBILE_REGEX.test(cleaned)) {
        errors.push({
          field: 'phone',
          message: 'Invalid phone number. Must be a valid 10-digit Indian mobile number starting with 6, 7, 8, or 9.'
        });
      } else {
        phone = cleaned.length === 10 ? cleaned : cleaned.slice(-10);
      }
    }

    // Email (optional)
    let email: string | undefined = undefined;
    if (input.email !== undefined && input.email !== null && input.email !== '') {
      if (typeof input.email !== 'string' || !EMAIL_REGEX.test(input.email.trim())) {
        errors.push({ field: 'email', message: 'Please provide a valid email address.' });
      } else {
        email = input.email.trim();
      }
    }

    // PIN Code (6-digit Indian PIN without leading 0)
    let pincode = '';
    if (!input.pincode || typeof input.pincode !== 'string' || !input.pincode.trim()) {
      errors.push({ field: 'pincode', message: 'Postal PIN code is required.' });
    } else {
      const pinClean = input.pincode.trim();
      if (!INDIAN_PINCODE_REGEX.test(pinClean)) {
        errors.push({
          field: 'pincode',
          message: 'Invalid PIN code. Must be a valid 6-digit Indian postal PIN code without leading zero.'
        });
      } else {
        pincode = pinClean;
      }
    }

    // House / Flat details (supports house_details or street)
    const rawHouse = input.house_details !== undefined ? input.house_details : input.street;
    let house_details = '';
    if (!rawHouse || typeof rawHouse !== 'string' || !rawHouse.trim()) {
      errors.push({ field: 'house_details', message: 'House/flat/building details are required.' });
    } else {
      house_details = rawHouse.trim();
    }

    // Street / Area (supports street_area or colony)
    const rawStreet = input.street_area !== undefined ? input.street_area : input.colony;
    let street_area = '';
    if (!rawStreet || typeof rawStreet !== 'string' || !rawStreet.trim()) {
      errors.push({ field: 'street_area', message: 'Street, area, or locality is required.' });
    } else {
      street_area = rawStreet.trim();
    }

    // Landmark (optional)
    let landmark: string | undefined = undefined;
    if (input.landmark !== undefined && input.landmark !== null && typeof input.landmark === 'string') {
      landmark = input.landmark.trim() || undefined;
    }

    // City
    let city = '';
    if (!input.city || typeof input.city !== 'string' || !input.city.trim()) {
      errors.push({ field: 'city', message: 'City is required.' });
    } else {
      city = input.city.trim();
    }

    // State
    let state = '';
    if (!input.state || typeof input.state !== 'string' || !input.state.trim()) {
      errors.push({ field: 'state', message: 'State is required.' });
    } else {
      state = input.state.trim();
    }

    // Tag (optional, defaults to 'Home')
    let tag = 'Home';
    if (input.tag && typeof input.tag === 'string' && input.tag.trim()) {
      const trimmedTag = input.tag.trim();
      const lower = trimmedTag.toLowerCase();
      if (lower === 'work' || lower === 'office') tag = 'Work';
      else if (lower === 'other') tag = 'Other';
      else if (lower === 'home') tag = 'Home';
      else tag = trimmedTag;
    }

    // Default flag (supports is_default or isDefault)
    const rawDefault = input.is_default !== undefined ? input.is_default : input.isDefault;
    const is_default = Boolean(rawDefault);

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
        customer_name,
        phone,
        email,
        pincode,
        house_details,
        street_area,
        landmark,
        city,
        state,
        tag,
        is_default
      }
    };
  }
}
