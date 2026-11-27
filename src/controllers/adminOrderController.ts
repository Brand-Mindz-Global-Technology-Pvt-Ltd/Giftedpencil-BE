import { Request, Response } from 'express';
import { AdminOrderService } from '../services/adminOrderService';
import { AdminOrderRepository } from '../repositories/adminOrderRepository';
import { AdminOrderQueryParams } from '../types/adminOrder';

export class AdminOrderController {
  /**
   * GET /api/admin/orders or /admin/orders
   * Retrieve paginated orders with search, status filters, and sorting
   */
  public static async listOrders(req: Request, res: Response): Promise<void> {
    try {
      const page = req.query.page ? Math.max(1, parseInt(String(req.query.page), 10) || 1) : 1;
      const limit = req.query.limit ? Math.max(1, Math.min(100, parseInt(String(req.query.limit), 10) || 10)) : 10;
      const status = typeof req.query.status === 'string' ? req.query.status : undefined;
      const search = typeof req.query.search === 'string' ? req.query.search : undefined;
      const sort = typeof req.query.sort === 'string' ? req.query.sort : undefined;

      const params: AdminOrderQueryParams = {
        page,
        limit,
        status,
        search,
        sort
      };

      const result = await AdminOrderService.getOrders(params);

      // Returns response structure directly consumed by OrderContext.jsx (data.orders, data.total, data.totalPages)
      res.status(200).json({
        success: true,
        orders: result.orders,
        total: result.total,
        totalPages: result.totalPages,
        page: result.page,
        limit: result.limit,
        data: {
          orders: result.orders,
          total: result.total,
          totalPages: result.totalPages,
          page: result.page,
          limit: result.limit
        }
      });
    } catch (error: any) {
      console.error('[AdminOrderController.listOrders] Error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve orders',
        error: error?.message || 'Internal server error'
      });
    }
  }

  /**
   * GET /api/admin/orders/:orderId or /admin/orders/:orderId
   * Retrieve complete order details including customer, shipping address, payment, and items
   */
  public static async getOrderById(req: Request, res: Response): Promise<void> {
    try {
      const orderId = req.params.orderId || (req.params as any).id;
      if (!orderId || !String(orderId).trim()) {
        res.status(400).json({
          success: false,
          message: 'Order identifier is required'
        });
        return;
      }

      const order = await AdminOrderService.getOrderById(String(orderId).trim());
      if (!order) {
        res.status(404).json({
          success: false,
          message: `Order "${orderId}" not found`
        });
        return;
      }

      // Returns response structure directly consumed by OrderContext.jsx (data.order)
      res.status(200).json({
        success: true,
        order,
        data: {
          order
        }
      });
    } catch (error: any) {
      console.error('[AdminOrderController.getOrderById] Error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve order details',
        error: error?.message || 'Internal server error'
      });
    }
  }

  /**
   * PATCH /api/admin/orders/:orderId/status or /admin/orders/:orderId/status
   * Update order status with validation and safety checks
   */
  public static async updateOrderStatus(req: Request, res: Response): Promise<void> {
    try {
      const orderId = req.params.orderId || (req.params as any).id;
      if (!orderId || !String(orderId).trim()) {
        res.status(400).json({
          success: false,
          message: 'Order identifier is required'
        });
        return;
      }

      const rawStatus = req.body?.orderStatus || req.body?.status || req.body?.order_status;
      if (!rawStatus || typeof rawStatus !== 'string' || !rawStatus.trim()) {
        res.status(400).json({
          success: false,
          message: 'Order status is required'
        });
        return;
      }

      if (!AdminOrderRepository.isValidStatus(rawStatus)) {
        res.status(400).json({
          success: false,
          message: 'Invalid order status. Allowed statuses: Pending, Confirmed, Processing, Shipped, Delivered, Cancelled'
        });
        return;
      }

      const updatedOrder = await AdminOrderService.updateOrderStatus(String(orderId).trim(), rawStatus);
      if (!updatedOrder) {
        res.status(404).json({
          success: false,
          message: `Order "${orderId}" not found`
        });
        return;
      }

      res.status(200).json({
        success: true,
        message: `Order status updated to ${updatedOrder.orderStatus}`,
        orderId: updatedOrder.orderId,
        orderStatus: updatedOrder.orderStatus,
        order: updatedOrder,
        data: {
          order: updatedOrder,
          orderStatus: updatedOrder.orderStatus
        }
      });
    } catch (error: any) {
      console.error('[AdminOrderController.updateOrderStatus] Error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update order status',
        error: error?.message || 'Internal server error'
      });
    }
  }

  /**
   * POST /api/admin/orders/:orderId/cancel or /admin/orders/:orderId/cancel
   * Cancel an order safely
   */
  public static async cancelOrder(req: Request, res: Response): Promise<void> {
    try {
      const orderId = req.params.orderId || (req.params as any).id;
      if (!orderId || !String(orderId).trim()) {
        res.status(400).json({
          success: false,
          message: 'Order identifier is required'
        });
        return;
      }

      const cancelReason = typeof req.body?.cancelReason === 'string' ? req.body.cancelReason.trim() : '';

      const result = await AdminOrderService.cancelOrder(String(orderId).trim(), cancelReason);
      if (!result.success) {
        res.status(result.statusCode || 400).json({
          success: false,
          message: result.message || 'Failed to cancel order'
        });
        return;
      }

      res.status(200).json({
        success: true,
        message: 'Order cancelled successfully',
        orderId: result.order!.orderId,
        orderStatus: result.order!.orderStatus,
        cancelReason: cancelReason || null,
        order: result.order,
        data: {
          order: result.order,
          orderStatus: result.order!.orderStatus,
          cancelReason: cancelReason || null
        }
      });
    } catch (error: any) {
      console.error('[AdminOrderController.cancelOrder] Error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to cancel order',
        error: error?.message || 'Internal server error'
      });
    }
  }

  /**
   * GET /api/admin/orders/export or /admin/orders/export
   * Export all matching orders as a downloadable CSV
   */
  public static async exportOrders(req: Request, res: Response): Promise<void> {
    try {
      const status = typeof req.query.status === 'string' ? req.query.status : undefined;
      const search = typeof req.query.search === 'string' ? req.query.search : undefined;
      const sort = typeof req.query.sort === 'string' ? req.query.sort : undefined;

      const params: AdminOrderQueryParams = { status, search, sort };
      const csv = await AdminOrderService.exportOrdersToCsv(params);

      const dateStr = new Date().toISOString().slice(0, 10);
      const filename = `gifted-pencil-orders-${dateStr}.csv`;

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.status(200).send(csv);
    } catch (error: any) {
      console.error('[AdminOrderController.exportOrders] Error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to export orders to CSV',
        error: error?.message || 'Internal server error'
      });
    }
  }
}
