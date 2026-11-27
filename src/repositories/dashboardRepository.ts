import { RowDataPacket } from 'mysql2/promise';
import pool from '../config/db';
import {
  ProductStockItem,
  RecentOrder,
  OrderStatusSummaryItem,
  TopProductItem,
  DailyDeliveryItem,
  MonthlyVolumeItem,
  MonthlyRevenueItem,
  RevenueResponseData
} from '../types/dashboard';

export class DashboardRepository {
  /**
   * Get basic product counts and stock breakdown
   */
  public static async getProductStockStats(): Promise<{
    total: number;
    lowStockCount: number;
    highStockCount: number;
    lowStockTop5: ProductStockItem[];
    highStockTop5: ProductStockItem[];
  }> {
    const [counts] = await pool.query<RowDataPacket[]>(`
      SELECT 
        COUNT(*) AS total,
        COALESCE(SUM(CASE WHEN stock_quantity <= 10 THEN 1 ELSE 0 END), 0) AS lowStockCount,
        COALESCE(SUM(CASE WHEN stock_quantity > 10 THEN 1 ELSE 0 END), 0) AS highStockCount
      FROM products
      WHERE is_active = 1
    `);

    const total = Number(counts[0]?.total || 0);
    const lowStockCount = Number(counts[0]?.lowStockCount || 0);
    const highStockCount = Number(counts[0]?.highStockCount || 0);

    const [lowRows] = await pool.query<RowDataPacket[]>(`
      SELECT id, name, stock_quantity, CAST(price AS DECIMAL(10,2)) AS price, image
      FROM products
      WHERE is_active = 1
      ORDER BY stock_quantity ASC, id ASC
      LIMIT 5
    `);

    const [highRows] = await pool.query<RowDataPacket[]>(`
      SELECT id, name, stock_quantity, CAST(price AS DECIMAL(10,2)) AS price, image
      FROM products
      WHERE is_active = 1
      ORDER BY stock_quantity DESC, id ASC
      LIMIT 5
    `);

    return {
      total,
      lowStockCount,
      highStockCount,
      lowStockTop5: lowRows.map((r) => ({
        id: Number(r.id),
        name: String(r.name),
        stock: Number(r.stock_quantity),
        stock_quantity: Number(r.stock_quantity),
        price: Number(r.price),
        image: r.image ? String(r.image) : null
      })),
      highStockTop5: highRows.map((r) => ({
        id: Number(r.id),
        name: String(r.name),
        stock: Number(r.stock_quantity),
        stock_quantity: Number(r.stock_quantity),
        price: Number(r.price),
        image: r.image ? String(r.image) : null
      }))
    };
  }

  /**
   * Get customer count breakdown
   */
  public static async getCustomerStats(): Promise<{
    total: number;
    newToday: number;
    thisMonth: number;
    lastMonth: number;
  }> {
    const [rows] = await pool.query<RowDataPacket[]>(`
      SELECT 
        COUNT(*) AS total,
        COALESCE(SUM(CASE WHEN DATE(created_at) = CURDATE() THEN 1 ELSE 0 END), 0) AS newToday,
        COALESCE(SUM(CASE WHEN YEAR(created_at) = YEAR(CURDATE()) AND MONTH(created_at) = MONTH(CURDATE()) THEN 1 ELSE 0 END), 0) AS thisMonth,
        COALESCE(SUM(CASE WHEN YEAR(created_at) = YEAR(CURDATE() - INTERVAL 1 MONTH) AND MONTH(created_at) = MONTH(CURDATE() - INTERVAL 1 MONTH) THEN 1 ELSE 0 END), 0) AS lastMonth
      FROM users
    `);

    return {
      total: Number(rows[0]?.total || 0),
      newToday: Number(rows[0]?.newToday || 0),
      thisMonth: Number(rows[0]?.thisMonth || 0),
      lastMonth: Number(rows[0]?.lastMonth || 0)
    };
  }

  /**
   * Get order counts breakdown
   */
  public static async getOrderStats(): Promise<{
    total: number;
    today: number;
    thisMonth: number;
    lastMonth: number;
  }> {
    const [rows] = await pool.query<RowDataPacket[]>(`
      SELECT 
        COUNT(*) AS total,
        COALESCE(SUM(CASE WHEN DATE(created_at) = CURDATE() THEN 1 ELSE 0 END), 0) AS today,
        COALESCE(SUM(CASE WHEN YEAR(created_at) = YEAR(CURDATE()) AND MONTH(created_at) = MONTH(CURDATE()) THEN 1 ELSE 0 END), 0) AS thisMonth,
        COALESCE(SUM(CASE WHEN YEAR(created_at) = YEAR(CURDATE() - INTERVAL 1 MONTH) AND MONTH(created_at) = MONTH(CURDATE() - INTERVAL 1 MONTH) THEN 1 ELSE 0 END), 0) AS lastMonth
      FROM orders
    `);

    return {
      total: Number(rows[0]?.total || 0),
      today: Number(rows[0]?.today || 0),
      thisMonth: Number(rows[0]?.thisMonth || 0),
      lastMonth: Number(rows[0]?.lastMonth || 0)
    };
  }

  /**
   * Get sales calculation
   * Sales criteria: Realized/paid orders (payment_status = 'Paid' OR order_status IN ('Processing', 'Shipped', 'Delivered'))
   * Excludes cancelled orders and failed payments.
   */
  public static async getSalesStats(): Promise<{
    total: number;
    grossSales: number;
    today: number;
    thisMonth: number;
    lastMonth: number;
  }> {
    const [rows] = await pool.query<RowDataPacket[]>(`
      SELECT 
        COALESCE(SUM(CASE WHEN payment_status = 'Paid' OR order_status IN ('Processing', 'Shipped', 'Delivered') THEN total_price ELSE 0 END), 0) AS totalSales,
        COALESCE(SUM(CASE WHEN order_status != 'Cancelled' AND payment_status != 'Failed' THEN total_price ELSE 0 END), 0) AS grossSales,
        COALESCE(SUM(CASE WHEN (payment_status = 'Paid' OR order_status IN ('Processing', 'Shipped', 'Delivered')) AND DATE(created_at) = CURDATE() THEN total_price ELSE 0 END), 0) AS today,
        COALESCE(SUM(CASE WHEN (payment_status = 'Paid' OR order_status IN ('Processing', 'Shipped', 'Delivered')) AND YEAR(created_at) = YEAR(CURDATE()) AND MONTH(created_at) = MONTH(CURDATE()) THEN total_price ELSE 0 END), 0) AS thisMonth,
        COALESCE(SUM(CASE WHEN (payment_status = 'Paid' OR order_status IN ('Processing', 'Shipped', 'Delivered')) AND YEAR(created_at) = YEAR(CURDATE() - INTERVAL 1 MONTH) AND MONTH(created_at) = MONTH(CURDATE() - INTERVAL 1 MONTH) THEN total_price ELSE 0 END), 0) AS lastMonth
      FROM orders
    `);

    return {
      total: Number(rows[0]?.totalSales || 0),
      grossSales: Number(rows[0]?.grossSales || 0),
      today: Number(rows[0]?.today || 0),
      thisMonth: Number(rows[0]?.thisMonth || 0),
      lastMonth: Number(rows[0]?.lastMonth || 0)
    };
  }

  /**
   * Get order status summary
   */
  public static async getOrderStatusSummary(): Promise<OrderStatusSummaryItem[]> {
    const [rows] = await pool.query<RowDataPacket[]>(`
      SELECT 
        order_status AS status,
        COUNT(*) AS count,
        COALESCE(SUM(total_price), 0) AS totalAmount
      FROM orders
      GROUP BY order_status
      ORDER BY count DESC
    `);

    return rows.map((r) => ({
      status: String(r.status || 'Unknown'),
      count: Number(r.count || 0),
      totalAmount: Number(r.totalAmount || 0)
    }));
  }

  /**
   * Get recent orders
   */
  public static async getRecentOrders(limit = 10): Promise<RecentOrder[]> {
    const safeLimit = Math.max(1, Math.min(100, Number(limit) || 10));
    const [rows] = await pool.query<RowDataPacket[]>(`
      SELECT 
        id,
        order_reference,
        customer_name,
        email,
        phone,
        total_price,
        order_status,
        payment_status,
        payment_method,
        courier_name,
        tracking_number,
        created_at
      FROM orders
      ORDER BY id DESC
      LIMIT ?
    `, [safeLimit]);

    return rows.map((r) => ({
      id: Number(r.id),
      order_reference: String(r.order_reference),
      customer_name: String(r.customer_name || 'Customer'),
      email: String(r.email || ''),
      phone: String(r.phone || ''),
      total_price: Number(r.total_price || 0),
      order_status: String(r.order_status || 'Pending'),
      payment_status: String(r.payment_status || 'Pending'),
      payment_method: String(r.payment_method || 'Online'),
      courier_name: r.courier_name ? String(r.courier_name) : null,
      tracking_number: r.tracking_number ? String(r.tracking_number) : null,
      created_at: new Date(r.created_at).toISOString()
    }));
  }

  /**
   * Get top selling products aggregated from order_items
   */
  public static async getTopProducts(limit = 5): Promise<TopProductItem[]> {
    const safeLimit = Math.max(1, Math.min(50, Number(limit) || 5));
    const [rows] = await pool.query<RowDataPacket[]>(`
      SELECT 
        oi.product_id,
        COALESCE(p.name, oi.product_name) AS name,
        COALESCE(c.name, 'Stationery') AS category,
        COALESCE(SUM(oi.quantity), 0) AS totalSold,
        COALESCE(SUM(oi.total_price), 0) AS totalSales
      FROM order_items oi
      LEFT JOIN products p ON oi.product_id = p.id
      LEFT JOIN categories c ON p.category_id = c.id
      GROUP BY oi.product_id, name, category
      ORDER BY totalSold DESC, totalSales DESC
      LIMIT ?
    `, [safeLimit]);

    const totalSoldAll = rows.reduce((acc, curr) => acc + Number(curr.totalSold || 0), 0);

    return rows.map((r) => {
      const sold = Number(r.totalSold || 0);
      const percentage = totalSoldAll > 0 ? Math.round((sold / totalSoldAll) * 100) : 0;
      return {
        productId: Number(r.product_id),
        name: String(r.name),
        category: String(r.category),
        totalSold: sold,
        totalSales: Number(r.totalSales || 0),
        percentage
      };
    });
  }

  /**
   * Get daily deliveries for current week vs last week
   */
  public static async getWeeklyDeliveries(): Promise<DailyDeliveryItem[]> {
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    const [rows] = await pool.query<RowDataPacket[]>(`
      SELECT 
        DAYOFWEEK(created_at) AS day_num,
        COALESCE(SUM(CASE WHEN YEARWEEK(created_at, 1) = YEARWEEK(CURDATE(), 1) THEN 1 ELSE 0 END), 0) AS this_week,
        COALESCE(SUM(CASE WHEN YEARWEEK(created_at, 1) = YEARWEEK(CURDATE() - INTERVAL 1 WEEK, 1) THEN 1 ELSE 0 END), 0) AS last_week
      FROM orders
      GROUP BY day_num
    `);

    // Map MySQL DAYOFWEEK (1 = Sunday, 2 = Monday, ..., 7 = Saturday) to Mon-Sun
    const lookup: Record<string, { today: number; lastWeek: number }> = {};
    rows.forEach((r) => {
      const dNum = Number(r.day_num);
      // 2 -> Mon (idx 0), 3 -> Tue (idx 1), ..., 7 -> Sat (idx 5), 1 -> Sun (idx 6)
      const dayName = dNum === 1 ? 'Sun' : days[dNum - 2];
      lookup[dayName] = {
        today: Number(r.this_week || 0),
        lastWeek: Number(r.last_week || 0)
      };
    });

    return days.map((day) => ({
      name: day,
      today: lookup[day]?.today || 0,
      lastWeek: lookup[day]?.lastWeek || 0
    }));
  }

  /**
   * Get monthly orders and delivered orders for last 6 months
   */
  public static async getMonthlyVolume(): Promise<MonthlyVolumeItem[]> {
    const [rows] = await pool.query<RowDataPacket[]>(`
      SELECT 
        DATE_FORMAT(created_at, '%b') AS month_name,
        YEAR(created_at) AS order_year,
        MONTH(created_at) AS order_month,
        COUNT(*) AS total_orders,
        COALESCE(SUM(CASE WHEN order_status IN ('Delivered', 'Processing') THEN 1 ELSE 0 END), 0) AS delivered_orders
      FROM orders
      WHERE created_at >= CURDATE() - INTERVAL 6 MONTH
      GROUP BY order_year, order_month, month_name
      ORDER BY order_year ASC, order_month ASC
    `);

    return rows.map((r) => ({
      name: String(r.month_name),
      totalOrders: Number(r.total_orders || 0),
      deliveredOrders: Number(r.delivered_orders || 0)
    }));
  }

  /**
   * Get revenue breakdown (Online vs COD) for monthly, weekly, yearly with summary
   */
  public static async getRevenueBreakdown(): Promise<RevenueResponseData> {
    const [monthlyRows] = await pool.query<RowDataPacket[]>(`
      SELECT 
        DATE_FORMAT(created_at, '%b') AS month_name,
        YEAR(created_at) AS order_year,
        MONTH(created_at) AS order_month,
        COALESCE(SUM(CASE WHEN payment_method != 'COD' AND (payment_status = 'Paid' OR order_status IN ('Processing', 'Shipped', 'Delivered')) THEN total_price ELSE 0 END), 0) AS online_revenue,
        COALESCE(SUM(CASE WHEN payment_method = 'COD' AND order_status IN ('Processing', 'Shipped', 'Delivered') THEN total_price ELSE 0 END), 0) AS cod_revenue
      FROM orders
      WHERE created_at >= CURDATE() - INTERVAL 6 MONTH
      GROUP BY order_year, order_month, month_name
      ORDER BY order_year ASC, order_month ASC
    `);

    const chartData = monthlyRows.map((r) => ({
      name: String(r.month_name),
      onlineRevenue: Number(r.online_revenue || 0),
      codRevenue: Number(r.cod_revenue || 0)
    }));

    // Weekly chart data (last 6-7 days)
    const [weeklyRows] = await pool.query<RowDataPacket[]>(`
      SELECT 
        DATE_FORMAT(created_at, '%a') AS day_name,
        DATE(created_at) AS order_date,
        COALESCE(SUM(CASE WHEN payment_method != 'COD' AND (payment_status = 'Paid' OR order_status IN ('Processing', 'Shipped', 'Delivered')) THEN total_price ELSE 0 END), 0) AS online_revenue,
        COALESCE(SUM(CASE WHEN payment_method = 'COD' AND order_status IN ('Processing', 'Shipped', 'Delivered') THEN total_price ELSE 0 END), 0) AS cod_revenue
      FROM orders
      WHERE created_at >= CURDATE() - INTERVAL 6 DAY
      GROUP BY order_date, day_name
      ORDER BY order_date ASC
    `);

    const weeklyChartData = weeklyRows.map((r) => ({
      name: String(r.day_name),
      onlineRevenue: Number(r.online_revenue || 0),
      codRevenue: Number(r.cod_revenue || 0)
    }));

    // Yearly chart data
    const [yearlyRows] = await pool.query<RowDataPacket[]>(`
      SELECT 
        CAST(YEAR(created_at) AS CHAR) AS year_name,
        COALESCE(SUM(CASE WHEN payment_method != 'COD' AND (payment_status = 'Paid' OR order_status IN ('Processing', 'Shipped', 'Delivered')) THEN total_price ELSE 0 END), 0) AS online_revenue,
        COALESCE(SUM(CASE WHEN payment_method = 'COD' AND order_status IN ('Processing', 'Shipped', 'Delivered') THEN total_price ELSE 0 END), 0) AS cod_revenue
      FROM orders
      WHERE created_at >= CURDATE() - INTERVAL 5 YEAR
      GROUP BY year_name
      ORDER BY year_name ASC
    `);

    const yearlyChartData = yearlyRows.map((r) => ({
      name: String(r.year_name),
      onlineRevenue: Number(r.online_revenue || 0),
      codRevenue: Number(r.cod_revenue || 0)
    }));

    // Summary calculations (last week vs last month)
    const [summaryRows] = await pool.query<RowDataPacket[]>(`
      SELECT 
        COALESCE(SUM(CASE WHEN YEARWEEK(created_at, 1) = YEARWEEK(CURDATE() - INTERVAL 1 WEEK, 1) AND payment_method != 'COD' AND (payment_status = 'Paid' OR order_status IN ('Processing', 'Shipped', 'Delivered')) THEN total_price ELSE 0 END), 0) AS last_week_online,
        COALESCE(SUM(CASE WHEN YEARWEEK(created_at, 1) = YEARWEEK(CURDATE() - INTERVAL 1 WEEK, 1) AND payment_method = 'COD' AND order_status IN ('Processing', 'Shipped', 'Delivered') THEN total_price ELSE 0 END), 0) AS last_week_cod,
        COALESCE(SUM(CASE WHEN YEAR(created_at) = YEAR(CURDATE() - INTERVAL 1 MONTH) AND MONTH(created_at) = MONTH(CURDATE() - INTERVAL 1 MONTH) AND payment_method != 'COD' AND (payment_status = 'Paid' OR order_status IN ('Processing', 'Shipped', 'Delivered')) THEN total_price ELSE 0 END), 0) AS last_month_online,
        COALESCE(SUM(CASE WHEN YEAR(created_at) = YEAR(CURDATE() - INTERVAL 1 MONTH) AND MONTH(created_at) = MONTH(CURDATE() - INTERVAL 1 MONTH) AND payment_method = 'COD' AND order_status IN ('Processing', 'Shipped', 'Delivered') THEN total_price ELSE 0 END), 0) AS last_month_cod
      FROM orders
    `);

    const s = summaryRows[0] || {};
    const lastWeekOnline = Number(s.last_week_online || 0);
    const lastWeekCod = Number(s.last_week_cod || 0);
    const lastMonthOnline = Number(s.last_month_online || 0);
    const lastMonthCod = Number(s.last_month_cod || 0);

    return {
      chartData,
      weeklyChartData,
      yearlyChartData,
      summary: {
        lastWeek: {
          onlineRevenue: lastWeekOnline,
          codRevenue: lastWeekCod,
          total: lastWeekOnline + lastWeekCod
        },
        lastMonth: {
          onlineRevenue: lastMonthOnline,
          codRevenue: lastMonthCod,
          total: lastMonthOnline + lastMonthCod
        }
      }
    };
  }
}
