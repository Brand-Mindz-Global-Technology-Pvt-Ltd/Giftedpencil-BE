import { Request, Response } from 'express';
import { DashboardService } from '../services/dashboardService';

export class DashboardController {
  /**
   * GET /api/admin/dashboard or GET /api/admin/dashboard/summary
   * Returns unified dashboard metrics, total counts, recent orders, and order status summary
   */
  public static getDashboardOverview = async (_req: Request, res: Response): Promise<void> => {
    try {
      const [summary, recentOrders, orderStatusSummary] = await Promise.all([
        DashboardService.getSummary(),
        DashboardService.getRecentOrders(10),
        DashboardService.getOrderStatusSummary()
      ]);

      res.status(200).json({
        success: true,
        status: 'success',
        data: {
          totalProducts: summary.totalProducts,
          totalOrders: summary.totalOrders,
          totalCustomers: summary.totalCustomers,
          totalSales: summary.totalSales,
          grossSales: summary.grossSales,
          salesDefinition: summary.salesDefinition,
          recentOrders,
          orderStatusSummary,
          summary
        }
      });
    } catch (error: any) {
      console.error('[DashboardController.getDashboardOverview Error]:', error);
      res.status(500).json({
        success: false,
        status: 'error',
        message: error.message || 'Failed to retrieve dashboard overview.'
      });
    }
  };

  /**
   * GET /api/admin/dashboard/recent-orders
   */
  public static getRecentOrders = async (req: Request, res: Response): Promise<void> => {
    try {
      const limit = Number(req.query.limit) || 10;
      const recentOrders = await DashboardService.getRecentOrders(limit);

      res.status(200).json({
        success: true,
        status: 'success',
        count: recentOrders.length,
        data: recentOrders
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        status: 'error',
        message: error.message || 'Failed to retrieve recent orders.'
      });
    }
  };

  /**
   * GET /api/admin/dashboard/order-status-summary
   */
  public static getOrderStatusSummary = async (_req: Request, res: Response): Promise<void> => {
    try {
      const orderStatusSummary = await DashboardService.getOrderStatusSummary();

      res.status(200).json({
        success: true,
        status: 'success',
        data: orderStatusSummary
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        status: 'error',
        message: error.message || 'Failed to retrieve order status summary.'
      });
    }
  };

  /**
   * GET /api/admin/dashboard/sales-summary
   */
  public static getSalesSummary = async (_req: Request, res: Response): Promise<void> => {
    try {
      const salesData = await DashboardService.getSalesSummary();

      res.status(200).json({
        success: true,
        status: 'success',
        data: salesData
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        status: 'error',
        message: error.message || 'Failed to retrieve sales summary.'
      });
    }
  };

  /**
   * GET /api/admin/dashboard/customer-satisfaction
   */
  public static getCustomerSatisfaction = async (_req: Request, res: Response): Promise<void> => {
    try {
      const satisfactionData = await DashboardService.getCustomerSatisfaction();

      res.status(200).json({
        success: true,
        status: 'success',
        chartData: satisfactionData.chartData,
        summary: satisfactionData.summary
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        status: 'error',
        message: error.message || 'Failed to retrieve delivery statistics.'
      });
    }
  };

  /**
   * GET /api/admin/dashboard/volume-service
   */
  public static getVolumeService = async (_req: Request, res: Response): Promise<void> => {
    try {
      const volumeData = await DashboardService.getVolumeService();

      res.status(200).json({
        success: true,
        status: 'success',
        chartData: volumeData.chartData,
        totals: volumeData.totals
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        status: 'error',
        message: error.message || 'Failed to retrieve volume metrics.'
      });
    }
  };

  /**
   * GET /api/admin/dashboard/revenue
   */
  public static getRevenue = async (_req: Request, res: Response): Promise<void> => {
    try {
      const revenueData = await DashboardService.getRevenue();

      res.status(200).json({
        success: true,
        status: 'success',
        chartData: revenueData.chartData,
        weeklyChartData: revenueData.weeklyChartData,
        yearlyChartData: revenueData.yearlyChartData,
        summary: revenueData.summary
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        status: 'error',
        message: error.message || 'Failed to retrieve revenue metrics.'
      });
    }
  };

  /**
   * GET /api/admin/dashboard/top-products
   */
  public static getTopProducts = async (req: Request, res: Response): Promise<void> => {
    try {
      const limit = Number(req.query.limit) || 5;
      const topProducts = await DashboardService.getTopProducts(limit);

      res.status(200).json({
        success: true,
        status: 'success',
        products: topProducts.products
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        status: 'error',
        message: error.message || 'Failed to retrieve top products.'
      });
    }
  };
}
