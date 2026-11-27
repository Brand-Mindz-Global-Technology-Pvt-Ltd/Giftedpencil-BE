import { ValidationError, ValidationResult } from './addressValidator';

const ALLOWED_SORT_OPTIONS = [
  'popular',
  'price-asc',
  'price_asc',
  'price-desc',
  'price_desc',
  'newest'
];

export class ProductValidator {
  /**
   * Validate query parameters for product listing
   */
  public static validateQueryParams(query: any): ValidationResult {
    const errors: ValidationError[] = [];

    // Validate page
    if (query.page !== undefined && query.page !== null && query.page !== '') {
      const pageNum = Number(query.page);
      if (isNaN(pageNum) || !Number.isInteger(pageNum) || pageNum < 1) {
        errors.push({
          field: 'page',
          message: 'Page parameter must be a positive integer starting at 1.'
        });
      }
    }

    // Validate limit
    if (query.limit !== undefined && query.limit !== null && query.limit !== '') {
      const limitNum = Number(query.limit);
      if (isNaN(limitNum) || !Number.isInteger(limitNum) || limitNum < 1 || limitNum > 100) {
        errors.push({
          field: 'limit',
          message: 'Limit parameter must be an integer between 1 and 100.'
        });
      }
    }

    // Validate min_price
    let minPrice: number | undefined;
    if (query.min_price !== undefined && query.min_price !== null && query.min_price !== '') {
      minPrice = Number(query.min_price);
      if (isNaN(minPrice) || minPrice < 0) {
        errors.push({
          field: 'min_price',
          message: 'min_price must be a non-negative number.'
        });
      }
    }

    // Validate max_price
    let maxPrice: number | undefined;
    if (query.max_price !== undefined && query.max_price !== null && query.max_price !== '') {
      maxPrice = Number(query.max_price);
      if (isNaN(maxPrice) || maxPrice < 0) {
        errors.push({
          field: 'max_price',
          message: 'max_price must be a non-negative number.'
        });
      }
    }

    // Validate min_price <= max_price
    if (minPrice !== undefined && maxPrice !== undefined && !isNaN(minPrice) && !isNaN(maxPrice)) {
      if (minPrice > maxPrice) {
        errors.push({
          field: 'price_range',
          message: 'min_price cannot be greater than max_price.'
        });
      }
    }

    // Validate sort_by
    if (query.sort_by !== undefined && query.sort_by !== null && query.sort_by !== '') {
      const sortValue = String(query.sort_by).trim().toLowerCase();
      if (!ALLOWED_SORT_OPTIONS.includes(sortValue)) {
        errors.push({
          field: 'sort_by',
          message: `Invalid sort_by option "${query.sort_by}". Allowed values: ${ALLOWED_SORT_OPTIONS.join(', ')}.`
        });
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate idOrSlug parameter
   */
  public static validateIdOrSlug(param: any): ValidationResult {
    const errors: ValidationError[] = [];

    if (!param || typeof param !== 'string' || !param.trim()) {
      errors.push({
        field: 'idOrSlug',
        message: 'Product identifier (ID or slug) is required.'
      });
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }
}
