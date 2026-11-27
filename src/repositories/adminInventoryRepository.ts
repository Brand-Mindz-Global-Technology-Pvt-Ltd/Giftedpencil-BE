import pool from '../config/db';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import {
  AdminInventoryQueryParams,
  AdminInventoryItem,
  AdminInventoryListResult,
  StockStatus,
  DEFAULT_LOW_STOCK_THRESHOLD
} from '../types/adminInventory';

export class AdminInventoryRepository {
  /**
   * Helper to derive stock status and display label based on documented threshold (5)
   */
  public static calculateStockStatus(stock: number): { status: StockStatus; label: string } {
    if (stock <= 0) {
      return { status: 'out_of_stock', label: 'Out of Stock' };
    }
    if (stock <= DEFAULT_LOW_STOCK_THRESHOLD) {
      return { status: 'low_stock', label: 'Low Stock' };
    }
    return { status: 'in_stock', label: 'In Stock' };
  }

  /**
   * Safe mapping from DB row to AdminInventoryItem
   */
  public static mapRowToInventoryItem(row: any): AdminInventoryItem {
    const numId = Number(row.id);
    const stock = Number(row.stock_quantity ?? 0);
    const { status, label } = AdminInventoryRepository.calculateStockStatus(stock);

    let images: string[] = [];
    if (row.images) {
      try {
        images = typeof row.images === 'string'
          ? JSON.parse(row.images)
          : (Array.isArray(row.images) ? row.images : []);
      } catch {
        images = [];
      }
    }
    if (images.length === 0 && row.image) {
      images = [row.image];
    }

    return {
      id: numId,
      _id: numId,
      productId: `PROD-${String(numId).padStart(4, '0')}`,
      name: String(row.name || ''),
      slug: String(row.slug || ''),
      price: Number(row.price || 0),
      originalPrice: row.original_price != null ? Number(row.original_price) : undefined,
      image: row.image || (images[0] || 'product-1.png'),
      images,
      stock,
      stockQuantity: stock,
      stockStatus: status,
      stockStatusLabel: label,
      lowStockThreshold: DEFAULT_LOW_STOCK_THRESHOLD,
      category: String(row.category_name || row.category || 'General'),
      categoryId: row.category_id != null ? Number(row.category_id) : null,
      isActive: Boolean(row.is_active),
      createdAt: row.created_at instanceof Date
        ? row.created_at.toISOString()
        : String(row.created_at || new Date().toISOString()),
      updatedAt: row.updated_at instanceof Date
        ? row.updated_at.toISOString()
        : String(row.updated_at || new Date().toISOString())
    };
  }

  /**
   * Find paginated inventory with search, status filtering, and sorting
   */
  public static async findInventory(params: AdminInventoryQueryParams): Promise<AdminInventoryListResult> {
    const whereConditions: string[] = [];
    const queryParams: any[] = [];

    // Search filter across product name, slug, ID, or formatted ID
    if (params.search && params.search.trim()) {
      const q = `%${params.search.trim().toLowerCase()}%`;
      const numericId = parseInt(params.search.trim().replace(/^prod-/i, ''), 10);
      if (!isNaN(numericId) && numericId > 0) {
        whereConditions.push('(LOWER(p.name) LIKE ? OR LOWER(p.slug) LIKE ? OR p.id = ?)');
        queryParams.push(q, q, numericId);
      } else {
        whereConditions.push('(LOWER(p.name) LIKE ? OR LOWER(p.slug) LIKE ?)');
        queryParams.push(q, q);
      }
    }

    // Category filter
    if (params.category && params.category.trim() && params.category.trim().toLowerCase() !== 'all') {
      const cat = params.category.trim().toLowerCase();
      whereConditions.push('(LOWER(c.slug) = ? OR LOWER(c.name) = ? OR CAST(p.category_id AS CHAR) = ?)');
      queryParams.push(cat, cat, cat);
    }

    // Stock Status filter
    if (params.status && params.status.trim() && params.status.trim().toLowerCase() !== 'all') {
      const s = params.status.trim().toLowerCase().replace(/[\s-]+/g, '_');
      if (s === 'out_of_stock' || s === 'out') {
        whereConditions.push('p.stock_quantity = 0');
      } else if (s === 'low_stock' || s === 'low') {
        whereConditions.push(`p.stock_quantity > 0 AND p.stock_quantity <= ${DEFAULT_LOW_STOCK_THRESHOLD}`);
      } else if (s === 'in_stock' || s === 'in') {
        whereConditions.push(`p.stock_quantity > ${DEFAULT_LOW_STOCK_THRESHOLD}`);
      }
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    // Total count for current filter
    const countSql = `
      SELECT COUNT(*) AS total
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      ${whereClause}
    `;
    const [countRows] = await pool.query<RowDataPacket[]>(countSql, queryParams);
    const total = Number(countRows[0]?.total || 0);

    // Sorting
    const sortBy = String(params.sortBy || 'recently_updated').trim().toLowerCase();
    const sortOrder = String(params.sortOrder || 'desc').trim().toLowerCase() === 'asc' ? 'ASC' : 'DESC';

    let orderClause = 'ORDER BY p.updated_at DESC, p.id DESC';
    if (sortBy === 'name') {
      orderClause = `ORDER BY p.name ${sortOrder}, p.id DESC`;
    } else if (sortBy === 'stock' || sortBy === 'stock_quantity') {
      orderClause = `ORDER BY p.stock_quantity ${sortOrder}, p.id DESC`;
    } else if (sortBy === 'recently_updated' || sortBy === 'updated_at') {
      orderClause = `ORDER BY p.updated_at ${sortOrder}, p.id DESC`;
    } else if (sortBy === 'price') {
      orderClause = `ORDER BY p.price ${sortOrder}, p.id DESC`;
    }

    // Pagination
    const page = Math.max(1, Number(params.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(params.limit) || 10));
    const offset = (page - 1) * limit;
    const totalPages = Math.ceil(total / limit) || 1;

    // Fetch master products
    const fetchSql = `
      SELECT 
        p.*,
        c.name AS category_name,
        c.slug AS category_slug
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      ${whereClause}
      ${orderClause}
      LIMIT ? OFFSET ?
    `;

    const [rows] = await pool.query<RowDataPacket[]>(fetchSql, [...queryParams, limit, offset]);
    const inventory = rows.map(r => AdminInventoryRepository.mapRowToInventoryItem(r));

    // Calculate global stock metrics
    const [metricRows] = await pool.query<RowDataPacket[]>(`
      SELECT 
        COUNT(*) AS total_products,
        SUM(CASE WHEN stock_quantity > ${DEFAULT_LOW_STOCK_THRESHOLD} THEN 1 ELSE 0 END) AS in_stock_count,
        SUM(CASE WHEN stock_quantity > 0 AND stock_quantity <= ${DEFAULT_LOW_STOCK_THRESHOLD} THEN 1 ELSE 0 END) AS low_stock_count,
        SUM(CASE WHEN stock_quantity = 0 THEN 1 ELSE 0 END) AS out_of_stock_count
      FROM products
    `);

    const metricsData = metricRows[0] || {};
    const metrics = {
      totalProducts: Number(metricsData.total_products || 0),
      inStockCount: Number(metricsData.in_stock_count || 0),
      lowStockCount: Number(metricsData.low_stock_count || 0),
      outOfStockCount: Number(metricsData.out_of_stock_count || 0),
      lowStockThreshold: DEFAULT_LOW_STOCK_THRESHOLD
    };

    return {
      inventory,
      pagination: {
        page,
        limit,
        total,
        totalPages
      },
      metrics
    };
  }

  /**
   * Find single product stock details by numeric ID
   */
  public static async findById(productId: number): Promise<AdminInventoryItem | null> {
    const [rows] = await pool.query<RowDataPacket[]>(
      `
      SELECT 
        p.*,
        c.name AS category_name,
        c.slug AS category_slug
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE p.id = ?
      LIMIT 1
      `,
      [productId]
    );

    if (rows.length === 0) return null;
    return AdminInventoryRepository.mapRowToInventoryItem(rows[0]);
  }

  /**
   * Update product stock quantity in MySQL
   */
  public static async updateStock(productId: number, stock: number): Promise<AdminInventoryItem | null> {
    const updateSql = 'UPDATE products SET stock_quantity = ?, updated_at = NOW() WHERE id = ?';
    const [result] = await pool.query<ResultSetHeader>(updateSql, [stock, productId]);

    if (result.affectedRows === 0) {
      return null;
    }

    return AdminInventoryRepository.findById(productId);
  }
}
