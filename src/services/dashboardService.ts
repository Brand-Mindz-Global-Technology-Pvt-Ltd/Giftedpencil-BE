import { DashboardRepository } from '../repositories/dashboardRepository';
import {
  DashboardSummary,
  RecentOrder,
  OrderStatusSummaryItem,
  TopProductItem,
  DailyDeliveryItem,
  MonthlyVolumeItem,
  MonthlyRevenueItem,
  RevenueResponseData
} from '../types/dashboard';

export class DashboardService {
  /**
   * Helper to calculate percentage growth
   */
  private static calculateGrowth(current: number, previous: number): number {
    if (previous <= 0) return current > 0 ? 100 : 0;
    return Number((((current - previous) / previous) * 100).toFixed(1));
  }

  /**
   * Get complete dashboard summary combining all core metrics
   */
  public static async getSummary(): Promise<DashboardSummary> {
    const [productStats, customerStats, orderStats, salesStats] = await Promise.all([
      DashboardRepository.getProductStockStats(),
      DashboardRepository.getCustomerStats(),
      DashboardRepository.getOrderStats(),
      DashboardRepository.getSalesStats()
    ]);

    const salesPercentage = this.calculateGrowth(salesStats.thisMonth, salesStats.lastMonth);
    const ordersPercentage = this.calculateGrowth(orderStats.thisMonth, orderStats.lastMonth);
    const customersPercentage = this.calculateGrowth(customerStats.thisMonth, customerStats.lastMonth);

    return {
      totalProducts: productStats.total,
      totalOrders: orderStats.total,
      totalCustomers: customerStats.total,
      totalSales: salesStats.total,
      grossSales: salesStats.grossSales,
      salesDefinition: "Orders where payment_status = 'Paid' or order_status IN ('Processing', 'Shipped', 'Delivered')",
      sales: {
        total: salesStats.total,
        today: salesStats.today,
        thisMonth: salesStats.thisMonth,
        lastMonth: salesStats.lastMonth,
        percentage: salesPercentage
      },
      orders: {
        total: orderStats.total,
        today: orderStats.today,
        thisMonth: orderStats.thisMonth,
        lastMonth: orderStats.lastMonth,
        percentage: ordersPercentage
      },
      customers: {
        total: customerStats.total,
        newToday: customerStats.newToday,
        thisMonth: customerStats.thisMonth,
        lastMonth: customerStats.lastMonth,
        percentage: customersPercentage
      },
      products: productStats
    };
  }

  /**
   * Get recent orders
   */
  public static async getRecentOrders(limit = 10): Promise<RecentOrder[]> {
    return DashboardRepository.getRecentOrders(limit);
  }

  /**
   * Get order status summary
   */
  public static async getOrderStatusSummary(): Promise<OrderStatusSummaryItem[]> {
    return DashboardRepository.getOrderStatusSummary();
  }

  /**
   * Section 1: Sales summary payload (matches frontend Salessummary & Stockoverview)
   */
  public static async getSalesSummary(): Promise<{
    sales: any;
    orders: any;
    customers: any;
    products: any;
  }> {
    const summary = await this.getSummary();
    return {
      sales: summary.sales,
      orders: summary.orders,
      customers: summary.customers,
      products: summary.products
    };
  }

  /**
   * Section 2: Weekly delivery report (matches frontend WeeklyDeliveryReport)
   */
  public static async getCustomerSatisfaction(): Promise<{
    chartData: DailyDeliveryItem[];
    summary: {
      currentMonthRevenue: number;
      lastMonthRevenue: number;
    };
  }> {
    const [chartData, salesStats] = await Promise.all([
      DashboardRepository.getWeeklyDeliveries(),
      DashboardRepository.getSalesStats()
    ]);

    return {
      chartData,
      summary: {
        currentMonthRevenue: salesStats.thisMonth,
        lastMonthRevenue: salesStats.lastMonth
      }
    };
  }

  /**
   * Section 3: Monthly volume service (matches frontend MonthlyDeliveryDetails)
   */
  public static async getVolumeService(): Promise<{
    chartData: MonthlyVolumeItem[];
    totals: {
      totalOrders: number;
      deliveredOrders: number;
    };
  }> {
    const chartData = await DashboardRepository.getMonthlyVolume();
    const totals = chartData.reduce(
      (acc, curr) => ({
        totalOrders: acc.totalOrders + curr.totalOrders,
        deliveredOrders: acc.deliveredOrders + curr.deliveredOrders
      }),
      { totalOrders: 0, deliveredOrders: 0 }
    );

    return { chartData, totals };
  }

  /**
   * Section 4: Revenue breakdown (matches frontend Totalrevenue)
   */
  public static async getRevenue(): Promise<RevenueResponseData> {
    return DashboardRepository.getRevenueBreakdown();
  }

  /**
   * Section 5: Top products (matches frontend Topproducts)
   */
  public static async getTopProducts(limit = 5): Promise<{
    products: TopProductItem[];
  }> {
    const products = await DashboardRepository.getTopProducts(limit);
    return { products };
  }
}
