export interface DashboardSummary {
  totalProducts: number;
  totalOrders: number;
  totalCustomers: number;
  totalSales: number;
  grossSales: number;
  salesDefinition: string;
  sales: {
    total: number;
    today: number;
    thisMonth: number;
    lastMonth: number;
    percentage: number;
  };
  orders: {
    total: number;
    today: number;
    thisMonth: number;
    lastMonth: number;
    percentage: number;
  };
  customers: {
    total: number;
    newToday: number;
    thisMonth: number;
    lastMonth: number;
    percentage: number;
  };
  products: {
    total: number;
    lowStockCount: number;
    highStockCount: number;
    lowStockTop5: ProductStockItem[];
    highStockTop5: ProductStockItem[];
  };
}

export interface ProductStockItem {
  id: number;
  name: string;
  stock: number;
  stock_quantity: number;
  price: number;
  image: string | null;
}

export interface RecentOrder {
  id: number;
  order_reference: string;
  customer_name: string;
  email: string;
  phone: string;
  total_price: number;
  order_status: string;
  payment_status: string;
  payment_method: string;
  courier_name?: string | null;
  tracking_number?: string | null;
  created_at: string;
}

export interface OrderStatusSummaryItem {
  status: string;
  count: number;
  totalAmount: number;
}

export interface TopProductItem {
  productId: number;
  name: string;
  category: string;
  totalSold: number;
  totalSales: number;
  percentage: number;
}

export interface DailyDeliveryItem {
  name: string;
  today: number;
  lastWeek: number;
}

export interface MonthlyVolumeItem {
  name: string;
  totalOrders: number;
  deliveredOrders: number;
}

export interface MonthlyRevenueItem {
  name: string;
  onlineRevenue: number;
  codRevenue: number;
}

export interface RevenueResponseData {
  chartData: MonthlyRevenueItem[];
  weeklyChartData: MonthlyRevenueItem[];
  yearlyChartData: MonthlyRevenueItem[];
  summary: {
    lastWeek: { onlineRevenue: number; codRevenue: number; total: number };
    lastMonth: { onlineRevenue: number; codRevenue: number; total: number };
  };
}
