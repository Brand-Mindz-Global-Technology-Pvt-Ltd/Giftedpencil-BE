/**
 * Documented default low-stock threshold used for filtering and display.
 * No database schema modification or columns added.
 */
export const DEFAULT_LOW_STOCK_THRESHOLD = 5;

export type StockStatus = 'in_stock' | 'low_stock' | 'out_of_stock';

export interface AdminInventoryQueryParams {
  page?: number | string;
  limit?: number | string;
  search?: string;
  category?: string;
  status?: string; // 'all' | 'in_stock' | 'low_stock' | 'out_of_stock' | 'In Stock' | 'Low Stock' | 'Out of Stock'
  sortBy?: 'name' | 'stock' | 'recently_updated' | 'price' | string;
  sortOrder?: 'asc' | 'desc';
}

export interface AdminInventoryItem {
  id: number;
  _id: number;
  productId: string; // e.g. PROD-0001
  name: string;
  slug: string;
  price: number;
  originalPrice?: number;
  image: string;
  images: string[];
  stock: number;
  stockQuantity: number;
  stockStatus: StockStatus;
  stockStatusLabel: string; // 'In Stock' | 'Low Stock' | 'Out of Stock'
  lowStockThreshold: number; // 5
  category: string;
  categoryId: number | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AdminInventoryListResult {
  inventory: AdminInventoryItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  metrics: {
    totalProducts: number;
    inStockCount: number;
    lowStockCount: number;
    outOfStockCount: number;
    lowStockThreshold: number;
  };
}

export interface UpdateStockPayload {
  stock: number;
}
