import { Request, Response } from 'express';
import { AdminInventoryService } from '../services/adminInventoryService';

export class AdminInventoryController {
  /**
   * GET /api/admin/inventory
   * Paginated inventory list with search, status filtering, category filtering, and sorting
   */
  public static async listInventory(req: Request, res: Response): Promise<void> {
    try {
      const {
        page = 1,
        limit = 10,
        search,
        category,
        status,
        sortBy,
        sortOrder
      } = req.query;

      const result = await AdminInventoryService.listInventory({
        page: Number(page) || 1,
        limit: Number(limit) || 10,
        search: typeof search === 'string' ? search : undefined,
        category: typeof category === 'string' ? category : undefined,
        status: typeof status === 'string' ? status : undefined,
        sortBy: typeof sortBy === 'string' ? sortBy : undefined,
        sortOrder: typeof sortOrder === 'string' && sortOrder.toLowerCase() === 'asc' ? 'asc' : 'desc'
      });

      res.status(200).json({
        status: 'success',
        success: true,
        data: result.inventory,
        inventory: result.inventory,
        pagination: result.pagination,
        metrics: result.metrics
      });
    } catch (error: any) {
      console.error('[AdminInventoryController.listInventory] Error:', error);
      res.status(500).json({
        status: 'error',
        success: false,
        message: 'Failed to retrieve inventory items',
        error: error?.message || 'Internal server error'
      });
    }
  }

  /**
   * GET /api/admin/inventory/:productId
   * Individual product stock details
   */
  public static async getProductStock(req: Request, res: Response): Promise<void> {
    try {
      const productId = parseInt(String(req.params.productId), 10);
      if (isNaN(productId) || productId <= 0) {
        res.status(400).json({
          status: 'error',
          success: false,
          message: 'Valid numeric product ID is required'
        });
        return;
      }

      const item = await AdminInventoryService.getProductStock(productId);
      if (!item) {
        res.status(404).json({
          status: 'error',
          success: false,
          message: `Product with ID ${productId} was not found`
        });
        return;
      }

      res.status(200).json({
        status: 'success',
        success: true,
        data: item,
        product: item
      });
    } catch (error: any) {
      console.error('[AdminInventoryController.getProductStock] Error:', error);
      res.status(500).json({
        status: 'error',
        success: false,
        message: 'Failed to retrieve product stock details',
        error: error?.message || 'Internal server error'
      });
    }
  }

  /**
   * PATCH /api/admin/inventory/:productId/stock
   * Update product stock quantity
   */
  public static async updateStock(req: Request, res: Response): Promise<void> {
    try {
      const productId = parseInt(String(req.params.productId), 10);
      if (isNaN(productId) || productId <= 0) {
        res.status(400).json({
          status: 'error',
          success: false,
          message: 'Valid numeric product ID is required'
        });
        return;
      }

      const rawStock = req.body?.stock ?? req.body?.stockQuantity ?? req.body?.stock_quantity;

      const updated = await AdminInventoryService.updateStock(productId, rawStock);
      if (!updated) {
        res.status(404).json({
          status: 'error',
          success: false,
          message: `Product with ID ${productId} was not found`
        });
        return;
      }

      res.status(200).json({
        status: 'success',
        success: true,
        message: 'Stock quantity updated successfully',
        data: updated,
        product: updated,
        stock: updated.stock,
        stockQuantity: updated.stockQuantity
      });
    } catch (error: any) {
      console.error('[AdminInventoryController.updateStock] Error:', error);
      const isClientError = error?.message?.includes('Stock quantity') || error?.message?.includes('Valid positive');
      res.status(isClientError ? 400 : 500).json({
        status: 'error',
        success: false,
        message: error?.message || 'Failed to update stock quantity'
      });
    }
  }
}
