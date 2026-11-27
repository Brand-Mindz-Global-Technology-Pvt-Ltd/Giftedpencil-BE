import { AdminInventoryRepository } from '../repositories/adminInventoryRepository';
import {
  AdminInventoryQueryParams,
  AdminInventoryListResult,
  AdminInventoryItem
} from '../types/adminInventory';

export class AdminInventoryService {
  /**
   * Retrieve paginated inventory list
   */
  public static async listInventory(params: AdminInventoryQueryParams): Promise<AdminInventoryListResult> {
    return AdminInventoryRepository.findInventory(params);
  }

  /**
   * Retrieve stock details for single product
   */
  public static async getProductStock(productId: number): Promise<AdminInventoryItem | null> {
    if (isNaN(productId) || productId <= 0) {
      throw new Error('Valid positive product ID is required');
    }
    return AdminInventoryRepository.findById(productId);
  }

  /**
   * Update product stock quantity with strict validation
   */
  public static async updateStock(productId: number, rawStock: any): Promise<AdminInventoryItem | null> {
    if (isNaN(productId) || productId <= 0) {
      throw new Error('Valid positive product ID is required');
    }

    if (rawStock === null || rawStock === undefined || rawStock === '') {
      throw new Error('Stock quantity is required');
    }

    const num = Number(rawStock);

    if (isNaN(num)) {
      throw new Error('Stock quantity must be a valid number');
    }

    if (!Number.isInteger(num)) {
      throw new Error('Stock quantity must be a non-negative whole integer (decimals are not permitted)');
    }

    if (num < 0) {
      throw new Error('Stock quantity cannot be negative. Minimum allowed value is 0');
    }

    return AdminInventoryRepository.updateStock(productId, num);
  }
}
