import pool from '../config/db';
import { Product, AdminProductInput, AdminProductUpdateInput, AdminProductQueryParams } from '../types';
import { ProductQueryParams, PaginatedProductsResult } from '../services/productService';

export function mapProductRow(row: any): Product {
  let images: string[] = [];
  try {
    images = typeof row.images === 'string' ? JSON.parse(row.images) : (Array.isArray(row.images) ? row.images : []);
  } catch {
    images = [];
  }
  if (images.length === 0 && row.image) {
    images = [row.image];
  }

  let features: string[] = [];
  try {
    features = typeof row.features === 'string' ? JSON.parse(row.features) : (Array.isArray(row.features) ? row.features : []);
  } catch {
    features = [];
  }

  let specifications: Record<string, string> = {};
  try {
    specifications = typeof row.specifications === 'string' 
      ? JSON.parse(row.specifications) 
      : (row.specifications && typeof row.specifications === 'object' ? row.specifications : {});
  } catch {
    specifications = {};
  }

  const stock = Number(row.stock_quantity ?? row.stock ?? 0);

  return {
    id: Number(row.id),
    slug: row.slug || '',
    name: row.name || '',
    subtitle: row.subtitle || undefined,
    price: Number(row.price),
    original_price: row.original_price != null ? Number(row.original_price) : undefined,
    discount: row.discount || undefined,
    description: row.description || '',
    image: row.image || (images[0] || 'product-1.png'),
    images,
    stock,
    in_stock: stock > 0,
    category: row.category || 'Journals',
    features,
    specifications,
    is_active: Boolean(row.is_active),
    created_at: row.created_at instanceof Date 
      ? row.created_at.toISOString() 
      : String(row.created_at || new Date().toISOString())
  };
}

export function mapAdminProductRow(row: any): any {
  let images: string[] = [];
  try {
    images = typeof row.images === 'string' ? JSON.parse(row.images) : (Array.isArray(row.images) ? row.images : []);
  } catch {
    images = [];
  }
  if (images.length === 0 && row.image) {
    images = [row.image];
  }

  let features: string[] = [];
  try {
    features = typeof row.features === 'string' ? JSON.parse(row.features) : (Array.isArray(row.features) ? row.features : []);
  } catch {
    features = [];
  }

  let specifications: Record<string, string> = {};
  try {
    specifications = typeof row.specifications === 'string' 
      ? JSON.parse(row.specifications) 
      : (row.specifications && typeof row.specifications === 'object' ? row.specifications : {});
  } catch {
    specifications = {};
  }

  const stock = Number(row.stock_quantity ?? row.stock ?? 0);
  const idNum = Number(row.id);

  return {
    id: idNum,
    _id: idNum,
    productId: `PROD-${String(idNum).padStart(4, '0')}`,
    name: row.name || '',
    slug: row.slug || '',
    subtitle: row.subtitle || '',
    price: Number(row.price),
    oldPrice: row.original_price != null ? Number(row.original_price) : undefined,
    original_price: row.original_price != null ? Number(row.original_price) : undefined,
    discount: row.discount || '',
    description: row.description || '',
    image: row.image || (images[0] || 'product-1.png'),
    images,
    stock,
    stock_quantity: stock,
    in_stock: stock > 0,
    category: row.category || 'Journals',
    category_id: row.category_id != null ? Number(row.category_id) : null,
    subCategory: '',
    brand: 'The Gifted Pencil',
    rating: 5,
    sales: Number(row.sales ?? row.total_sold ?? 0),
    features,
    specifications,
    is_active: Boolean(row.is_active),
    created_at: row.created_at instanceof Date 
      ? row.created_at.toISOString() 
      : String(row.created_at || new Date().toISOString()),
    updated_at: row.updated_at instanceof Date 
      ? row.updated_at.toISOString() 
      : String(row.updated_at || new Date().toISOString())
  };
}

export class ProductRepository {
  /**
   * Find products matching search, category, price range, in-stock, and sorting with pagination
   */
  public static async findProducts(params: ProductQueryParams = {}): Promise<PaginatedProductsResult> {
    const whereConditions: string[] = ['p.is_active = 1'];
    const queryParams: any[] = [];

    // Search filter: matches name, description, subtitle or category name
    if (params.search && params.search.trim()) {
      const q = `%${params.search.trim().toLowerCase()}%`;
      whereConditions.push(
        '(LOWER(p.name) LIKE ? OR LOWER(COALESCE(p.description, \'\')) LIKE ? OR LOWER(COALESCE(p.subtitle, \'\')) LIKE ? OR LOWER(COALESCE(c.name, \'\')) LIKE ?)'
      );
      queryParams.push(q, q, q, q);
    }

    // Category filter (case-insensitive)
    if (params.category && params.category.trim() && params.category.toLowerCase() !== 'all') {
      whereConditions.push('LOWER(c.name) = ?');
      queryParams.push(params.category.trim().toLowerCase());
    }

    // Price range filters
    if (params.minPrice !== undefined && !isNaN(params.minPrice)) {
      whereConditions.push('p.price >= ?');
      queryParams.push(params.minPrice);
    }
    if (params.maxPrice !== undefined && !isNaN(params.maxPrice)) {
      whereConditions.push('p.price <= ?');
      queryParams.push(params.maxPrice);
    }

    // In-stock filter
    if (params.inStock === true) {
      whereConditions.push('p.stock_quantity > 0');
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    // Count total matching records
    const countSql = `
      SELECT COUNT(*) AS total
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      ${whereClause}
    `;
    const [countRows] = await pool.query<any[]>(countSql, queryParams);
    const total = Number(countRows[0]?.total || 0);

    // Sorting
    const sort = params.sortBy ? params.sortBy.toLowerCase() : 'popular';
    let orderBy = 'ORDER BY p.stock_quantity DESC, p.id ASC';
    switch (sort) {
      case 'price-asc':
      case 'price_asc':
        orderBy = 'ORDER BY p.price ASC, p.id ASC';
        break;
      case 'price-desc':
      case 'price_desc':
        orderBy = 'ORDER BY p.price DESC, p.id ASC';
        break;
      case 'newest':
        orderBy = 'ORDER BY p.created_at DESC, p.id DESC';
        break;
      case 'popular':
      default:
        orderBy = 'ORDER BY p.stock_quantity DESC, p.id ASC';
        break;
    }

    // Pagination
    const page = Math.max(1, Number(params.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(params.limit) || 10));
    const offset = (page - 1) * limit;
    const totalPages = Math.ceil(total / limit) || 0;

    const dataSql = `
      SELECT p.*, c.name AS category
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      ${whereClause}
      ${orderBy}
      LIMIT ? OFFSET ?
    `;

    const [rows] = await pool.query<any[]>(dataSql, [...queryParams, limit, offset]);
    const products: Product[] = rows.map(mapProductRow);

    return {
      products,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        total_pages: totalPages,
        has_next: page < totalPages,
        has_prev: page > 1
      },
      filters_applied: {
        search: params.search,
        category: params.category,
        min_price: params.minPrice,
        max_price: params.maxPrice,
        in_stock: params.inStock,
        sort_by: params.sortBy || 'popular'
      }
    };
  }

  /**
   * Find product by numeric ID or slug (case-insensitive) with frontend alias support
   */
  public static async findProductByIdOrSlug(idOrSlug: string | number): Promise<Product | null> {
    if (idOrSlug === undefined || idOrSlug === null) return null;
    const term = String(idOrSlug).trim().toLowerCase();
    if (!term) return null;

    // 1. Check numeric ID
    const numericId = Number(term);
    if (!isNaN(numericId) && Number.isInteger(numericId) && numericId > 0) {
      const sql = `
        SELECT p.*, c.name AS category
        FROM products p
        LEFT JOIN categories c ON p.category_id = c.id
        WHERE p.id = ? AND p.is_active = 1
        LIMIT 1
      `;
      const [rows] = await pool.query<any[]>(sql, [numericId]);
      if (rows.length > 0) return mapProductRow(rows[0]);
    }

    // 2. Check exact slug (case-insensitive)
    const slugSql = `
      SELECT p.*, c.name AS category
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE LOWER(p.slug) = ? AND p.is_active = 1
      LIMIT 1
    `;
    const [slugRows] = await pool.query<any[]>(slugSql, [term]);
    if (slugRows.length > 0) return mapProductRow(slugRows[0]);

    // 3. Frontend alias support: 'dream-big-journal' maps to Product ID 1
    if (term === 'dream-big-journal') {
      const aliasSql = `
        SELECT p.*, c.name AS category
        FROM products p
        LEFT JOIN categories c ON p.category_id = c.id
        WHERE p.id = 1 AND p.is_active = 1
        LIMIT 1
      `;
      const [aliasRows] = await pool.query<any[]>(aliasSql);
      if (aliasRows.length > 0) return mapProductRow(aliasRows[0]);
    }

    return null;
  }

  /**
   * Find product by numeric ID
   */
  public static async findProductById(id: number): Promise<Product | null> {
    if (isNaN(id) || id <= 0) return null;
    return this.findProductByIdOrSlug(id);
  }

  /**
   * Get distinct categories from active products
   */
  public static async getDistinctCategories(): Promise<string[]> {
    const sql = `
      SELECT c.name
      FROM products p
      JOIN categories c ON p.category_id = c.id
      WHERE p.is_active = 1
      GROUP BY c.id, c.name, c.sort_order
      ORDER BY c.sort_order ASC, c.name ASC
    `;
    const [rows] = await pool.query<any[]>(sql);
    const categories = rows.map(r => r.name).filter(Boolean);
    return categories.length > 0 ? categories : ['Journals', 'Kids', 'Planners', 'Accessories'];
  }

  /**
   * Resolve category_id from category name, slug or numeric ID
   */
  public static async resolveCategoryId(categoryNameOrId?: string | number | null): Promise<number | null> {
    if (categoryNameOrId === undefined || categoryNameOrId === null) return null;
    if (typeof categoryNameOrId === 'number') {
      if (categoryNameOrId <= 0) return null;
      return categoryNameOrId;
    }
    const term = String(categoryNameOrId).trim().toLowerCase();
    if (!term) return null;

    // Check if numeric string
    const num = Number(term);
    if (!isNaN(num) && num > 0) return num;

    const [rows] = await pool.query<any[]>(
      'SELECT id FROM categories WHERE LOWER(name) = ? OR LOWER(slug) = ? LIMIT 1',
      [term, term]
    );
    if (rows.length > 0) {
      return Number(rows[0].id);
    }
    return null;
  }

  /**
   * Check if a slug is taken by another product
   */
  public static async isSlugTaken(slug: string, excludeId?: number): Promise<boolean> {
    const term = slug.trim().toLowerCase();
    if (!term) return false;

    let sql = 'SELECT id FROM products WHERE LOWER(slug) = ?';
    const params: any[] = [term];

    if (excludeId && !isNaN(excludeId)) {
      sql += ' AND id != ?';
      params.push(excludeId);
    }
    sql += ' LIMIT 1';

    const [rows] = await pool.query<any[]>(sql, params);
    return rows.length > 0;
  }

  /**
   * Admin: List products with search, category, status filter and pagination
   */
  public static async findAdminProducts(params: AdminProductQueryParams = {}): Promise<{
    products: any[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  }> {
    const whereConditions: string[] = [];
    const queryParams: any[] = [];

    // Status filter
    const statusParam = typeof params.status === 'string' ? params.status.trim().toLowerCase() : '';
    if (statusParam === 'active') {
      whereConditions.push('p.is_active = 1');
    } else if (statusParam === 'inactive') {
      whereConditions.push('p.is_active = 0');
    }

    // Search filter
    if (params.search && params.search.trim()) {
      const q = `%${params.search.trim().toLowerCase()}%`;
      whereConditions.push(
        '(LOWER(p.name) LIKE ? OR LOWER(COALESCE(p.description, \'\')) LIKE ? OR LOWER(COALESCE(p.subtitle, \'\')) LIKE ? OR LOWER(COALESCE(c.name, \'\')) LIKE ?)'
      );
      queryParams.push(q, q, q, q);
    }

    // Category filter
    if (params.category && params.category.trim() && params.category.toLowerCase() !== 'all') {
      whereConditions.push('(LOWER(c.name) = ? OR LOWER(c.slug) = ?)');
      const cat = params.category.trim().toLowerCase();
      queryParams.push(cat, cat);
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    // Count
    const countSql = `
      SELECT COUNT(*) AS total
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      ${whereClause}
    `;
    const [countRows] = await pool.query<any[]>(countSql, queryParams);
    const total = Number(countRows[0]?.total || 0);

    // Sorting
    const sort = params.sortBy ? params.sortBy.toLowerCase() : 'newest';
    let orderBy = 'ORDER BY p.id DESC';
    switch (sort) {
      case 'price-asc':
      case 'price_asc':
        orderBy = 'ORDER BY p.price ASC, p.id DESC';
        break;
      case 'price-desc':
      case 'price_desc':
        orderBy = 'ORDER BY p.price DESC, p.id DESC';
        break;
      case 'name-asc':
        orderBy = 'ORDER BY p.name ASC, p.id DESC';
        break;
      case 'newest':
      default:
        orderBy = 'ORDER BY p.id DESC';
        break;
    }

    // Pagination
    const page = Math.max(1, Number(params.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(params.limit) || 8));
    const offset = (page - 1) * limit;
    const totalPages = Math.ceil(total / limit) || 1;

    const dataSql = `
      SELECT p.*, c.name AS category, COALESCE(oi.total_sold, 0) AS sales
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN (
        SELECT product_id, SUM(quantity) AS total_sold
        FROM order_items
        GROUP BY product_id
      ) oi ON oi.product_id = p.id
      ${whereClause}
      ${orderBy}
      LIMIT ? OFFSET ?
    `;

    const [rows] = await pool.query<any[]>(dataSql, [...queryParams, limit, offset]);
    const products = rows.map(mapAdminProductRow);

    return {
      products,
      pagination: {
        page,
        limit,
        total,
        totalPages
      }
    };
  }

  /**
   * Admin: Find single product by ID regardless of is_active
   */
  public static async findAdminProductById(id: number): Promise<any | null> {
    if (isNaN(id) || id <= 0) return null;

    const sql = `
      SELECT p.*, c.name AS category, COALESCE(oi.total_sold, 0) AS sales
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN (
        SELECT product_id, SUM(quantity) AS total_sold
        FROM order_items
        GROUP BY product_id
      ) oi ON oi.product_id = p.id
      WHERE p.id = ?
      LIMIT 1
    `;
    const [rows] = await pool.query<any[]>(sql, [id]);
    if (rows.length === 0) return null;
    return mapAdminProductRow(rows[0]);
  }

  /**
   * Admin: Create a new product in MySQL
   */
  public static async createProduct(input: AdminProductInput): Promise<any> {
    const categoryId = await this.resolveCategoryId(input.category_id ?? input.category);

    // Parse / format images
    let imagesArr: string[] = [];
    if (Array.isArray(input.images)) {
      imagesArr = input.images.filter(Boolean);
    } else if (typeof input.images === 'string') {
      try {
        const parsed = JSON.parse(input.images);
        imagesArr = Array.isArray(parsed) ? parsed.filter(Boolean) : [input.images];
      } catch {
        imagesArr = [input.images];
      }
    }
    const mainImage = input.image || (imagesArr.length > 0 ? imagesArr[0] : null);
    if (imagesArr.length === 0 && mainImage) {
      imagesArr = [mainImage];
    }

    // Format features & specifications
    const featuresJson = input.features && input.features.length > 0 ? JSON.stringify(input.features) : null;
    const specificationsJson = input.specifications && Object.keys(input.specifications).length > 0 ? JSON.stringify(input.specifications) : null;
    const imagesJson = imagesArr.length > 0 ? JSON.stringify(imagesArr) : null;

    const price = Number(input.price);
    const originalPrice = input.original_price != null && !isNaN(Number(input.original_price))
      ? Number(input.original_price) 
      : (input.oldPrice != null && !isNaN(Number(input.oldPrice)) ? Number(input.oldPrice) : null);
    const stockQuantity = Number(input.stock_quantity ?? input.stock ?? 0);
    const isActive = input.is_active !== undefined ? (input.is_active ? 1 : 0) : 1;

    const sql = `
      INSERT INTO products (
        name, slug, category_id, subtitle, price, original_price, discount,
        stock_quantity, description, image, images, features, specifications, is_active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const [result] = await pool.query<any>(sql, [
      input.name.trim(),
      input.slug ? input.slug.trim().toLowerCase() : '',
      categoryId,
      input.subtitle || null,
      price,
      originalPrice,
      input.discount || null,
      stockQuantity,
      input.description || null,
      mainImage,
      imagesJson,
      featuresJson,
      specificationsJson,
      isActive
    ]);

    const newId = Number(result.insertId);
    return await this.findAdminProductById(newId);
  }

  /**
   * Admin: Update an existing product in MySQL
   */
  public static async updateProduct(id: number, input: AdminProductUpdateInput): Promise<any | null> {
    const existing = await this.findAdminProductById(id);
    if (!existing) return null;

    const updates: string[] = [];
    const values: any[] = [];

    if (input.name !== undefined) {
      updates.push('name = ?');
      values.push(input.name.trim());
    }

    if (input.slug !== undefined) {
      updates.push('slug = ?');
      values.push(input.slug.trim().toLowerCase());
    }

    if (input.category_id !== undefined || input.category !== undefined) {
      const categoryId = await this.resolveCategoryId(input.category_id ?? input.category);
      updates.push('category_id = ?');
      values.push(categoryId);
    }

    if (input.subtitle !== undefined) {
      updates.push('subtitle = ?');
      values.push(input.subtitle || null);
    }

    if (input.price !== undefined) {
      updates.push('price = ?');
      values.push(Number(input.price));
    }

    if (input.original_price !== undefined || input.oldPrice !== undefined) {
      const op = input.original_price !== undefined ? input.original_price : input.oldPrice;
      updates.push('original_price = ?');
      values.push(op != null && !isNaN(Number(op)) && Number(op) > 0 ? Number(op) : null);
    }

    if (input.discount !== undefined) {
      updates.push('discount = ?');
      values.push(input.discount || null);
    }

    if (input.stock_quantity !== undefined || input.stock !== undefined) {
      const stock = input.stock_quantity !== undefined ? input.stock_quantity : input.stock;
      updates.push('stock_quantity = ?');
      values.push(Number(stock ?? 0));
    }

    if (input.description !== undefined) {
      updates.push('description = ?');
      values.push(input.description ? String(input.description).trim() : null);
    }

    if (input.image !== undefined) {
      updates.push('image = ?');
      values.push(input.image || null);
    }

    if (input.images !== undefined) {
      let imagesArr: string[] = [];
      if (Array.isArray(input.images)) {
        imagesArr = input.images.filter(Boolean);
      } else if (typeof input.images === 'string') {
        try {
          const parsed = JSON.parse(input.images);
          imagesArr = Array.isArray(parsed) ? parsed.filter(Boolean) : [input.images];
        } catch {
          imagesArr = [input.images];
        }
      }
      updates.push('images = ?');
      values.push(imagesArr.length > 0 ? JSON.stringify(imagesArr) : null);

      if (input.image === undefined) {
        updates.push('image = ?');
        values.push(imagesArr.length > 0 ? imagesArr[0] : null);
      }
    }

    if (input.features !== undefined) {
      updates.push('features = ?');
      values.push(Array.isArray(input.features) && input.features.length > 0 ? JSON.stringify(input.features) : null);
    }

    if (input.specifications !== undefined) {
      updates.push('specifications = ?');
      values.push(input.specifications ? JSON.stringify(input.specifications) : null);
    }

    if (input.is_active !== undefined) {
      updates.push('is_active = ?');
      values.push(input.is_active ? 1 : 0);
    }

    if (updates.length === 0) {
      return existing;
    }

    const sql = `UPDATE products SET ${updates.join(', ')} WHERE id = ?`;
    values.push(id);

    await pool.query(sql, values);
    return await this.findAdminProductById(id);
  }

  /**
   * Admin: Safe deactivation of product (is_active = 0)
   */
  public static async deactivateProduct(id: number): Promise<boolean> {
    const [result] = await pool.query<any>('UPDATE products SET is_active = 0 WHERE id = ?', [id]);
    return result.affectedRows > 0;
  }

  /**
   * Admin: Reactivation of product (is_active = 1)
   */
  public static async activateProduct(id: number): Promise<boolean> {
    const [result] = await pool.query<any>('UPDATE products SET is_active = 1 WHERE id = ?', [id]);
    return result.affectedRows > 0;
  }

  /**
   * Admin: Get next available product ID formatted string
   */
  public static async getNextProductId(): Promise<string> {
    const [rows] = await pool.query<any[]>('SELECT MAX(id) AS max_id FROM products');
    const maxId = Number(rows[0]?.max_id || 0);
    return `PROD-${String(maxId + 1).padStart(4, '0')}`;
  }
}
