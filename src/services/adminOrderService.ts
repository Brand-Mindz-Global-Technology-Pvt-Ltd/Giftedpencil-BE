import { AdminOrderRepository } from '../repositories/adminOrderRepository';
import {
  AdminOrderQueryParams,
  AdminOrdersListResult,
  AdminOrderModel
} from '../types/adminOrder';

export class AdminOrderService {
  /**
   * Retrieve paginated order list for Admin
   */
  public static async getOrders(params: AdminOrderQueryParams): Promise<AdminOrdersListResult> {
    return AdminOrderRepository.findOrders(params);
  }

  /**
   * Retrieve detailed single order by numeric ID or order reference string
   */
  public static async getOrderById(orderId: string | number): Promise<AdminOrderModel | null> {
    return AdminOrderRepository.findOrderByIdOrReference(orderId);
  }

  /**
   * Update order status for a given order ID or reference
   */
  public static async updateOrderStatus(
    orderId: string | number,
    orderStatus: string
  ): Promise<AdminOrderModel | null> {
    return AdminOrderRepository.updateOrderStatus(orderId, orderStatus);
  }

  /**
   * Cancel an order safely
   */
  public static async cancelOrder(
    orderId: string | number,
    cancelReason: string = ''
  ): Promise<{ success: boolean; order?: AdminOrderModel; message?: string; statusCode?: number }> {
    return AdminOrderRepository.cancelOrder(orderId, cancelReason);
  }

  /**
   * Export all matching orders to CSV
   */
  public static async exportOrdersToCsv(params: AdminOrderQueryParams): Promise<string> {
    const orders = await AdminOrderRepository.findOrdersForExport(params);
    return AdminOrderRepository.generateOrdersCsv(orders);
  }
}
