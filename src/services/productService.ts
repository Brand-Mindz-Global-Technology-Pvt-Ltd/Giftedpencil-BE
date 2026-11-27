import { Product, AdminProductInput, AdminProductUpdateInput, AdminProductQueryParams } from '../types';
import { ProductRepository } from '../repositories/productRepository';

export interface ProductQueryParams {
  search?: string;
  category?: string;
  minPrice?: number;
  maxPrice?: number;
  inStock?: boolean;
  sortBy?: 'popular' | 'price-asc' | 'price_asc' | 'price-desc' | 'price_desc' | 'newest';
  page?: number;
  limit?: number;
}

export interface PaginatedProductsResult {
  products: Product[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    total_pages: number;
    has_next: boolean;
    has_prev: boolean;
  };
  filters_applied: {
    search?: string;
    category?: string;
    min_price?: number;
    max_price?: number;
    in_stock?: boolean;
    sort_by?: string;
  };
}

export class ProductService {
  /**
   * Query products from MySQL database with full search, filtering, sorting, and pagination.
   */
  public static async getProducts(params: ProductQueryParams = {}): Promise<PaginatedProductsResult> {
    return await ProductRepository.findProducts(params);
  }

  /**
   * Fetch single product details from MySQL by numeric ID or slug (case-insensitive)
   */
  public static async getProductByIdOrSlug(idOrSlug: string | number): Promise<Product | null> {
    return await ProductRepository.findProductByIdOrSlug(idOrSlug);
  }

  /**
   * Async helper for MySQL product lookup by ID
   */
  public static async getProductByIdAsync(id: number): Promise<Product | null> {
    if (isNaN(id) || id <= 0) return null;
    return this.getProductByIdOrSlug(id);
  }

  /**
   * Get unique categories derived from active products in MySQL
   */
  public static async getCategories(): Promise<string[]> {
    return await ProductRepository.getDistinctCategories();
  }

  // --- Admin Methods ---

  public static slugify(text: string): string {
    return text
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  }

  public static async generateUniqueSlug(name: string, excludeId?: number): Promise<string> {
    const baseSlug = this.slugify(name) || 'product';
    let candidate = baseSlug;
    let counter = 1;

    while (await ProductRepository.isSlugTaken(candidate, excludeId)) {
      candidate = `${baseSlug}-${counter}`;
      counter++;
    }

    return candidate;
  }

  public static async getAdminProducts(params: AdminProductQueryParams = {}) {
    return await ProductRepository.findAdminProducts(params);
  }

  public static async getAdminProductById(id: number) {
    return await ProductRepository.findAdminProductById(id);
  }

  public static async createProduct(input: AdminProductInput) {
    if (!input.name || !input.name.trim()) {
      throw new Error('Product name is required');
    }
    if (!input.description || !input.description.trim()) {
      throw new Error('Product description is required');
    }
    const price = Number(input.price);
    if (isNaN(price) || price <= 0) {
      throw new Error('A valid positive product price is required');
    }
    const stock = Number(input.stock_quantity ?? input.stock ?? 0);
    if (isNaN(stock) || stock < 0) {
      throw new Error('A valid non-negative stock quantity is required');
    }

    let slug = input.slug ? this.slugify(input.slug) : '';
    if (!slug) {
      slug = await this.generateUniqueSlug(input.name);
    } else {
      if (await ProductRepository.isSlugTaken(slug)) {
        slug = await this.generateUniqueSlug(slug);
      }
    }

    return await ProductRepository.createProduct({
      ...input,
      slug
    });
  }

  public static async updateProduct(id: number, input: AdminProductUpdateInput) {
    const existing = await ProductRepository.findAdminProductById(id);
    if (!existing) {
      throw new Error(`Product with ID ${id} not found`);
    }

    if (input.name !== undefined && (!input.name || !input.name.trim())) {
      throw new Error('Product name cannot be empty');
    }

    if (input.description !== undefined && (!input.description || !input.description.trim())) {
      throw new Error('Product description cannot be empty');
    }

    if (input.price !== undefined) {
      const price = Number(input.price);
      if (isNaN(price) || price <= 0) {
        throw new Error('A valid positive product price is required');
      }
    }

    if (input.stock_quantity !== undefined || input.stock !== undefined) {
      const stock = Number(input.stock_quantity ?? input.stock);
      if (isNaN(stock) || stock < 0) {
        throw new Error('A valid non-negative stock quantity is required');
      }
    }

    let slug = input.slug !== undefined ? this.slugify(input.slug) : undefined;
    if (slug) {
      if (await ProductRepository.isSlugTaken(slug, id)) {
        throw new Error(`Product slug "${slug}" is already in use by another product`);
      }
    }

    return await ProductRepository.updateProduct(id, {
      ...input,
      ...(slug ? { slug } : {})
    });
  }

  public static async deactivateProduct(id: number) {
    const existing = await ProductRepository.findAdminProductById(id);
    if (!existing) {
      throw new Error(`Product with ID ${id} not found`);
    }
    return await ProductRepository.deactivateProduct(id);
  }

  public static async activateProduct(id: number) {
    const existing = await ProductRepository.findAdminProductById(id);
    if (!existing) {
      throw new Error(`Product with ID ${id} not found`);
    }
    return await ProductRepository.activateProduct(id);
  }

  public static async getAdminCategories() {
    const categories = await ProductRepository.getDistinctCategories();
    const productId = await ProductRepository.getNextProductId();
    return {
      categories: categories.map(cat => ({
        name: cat,
        slug: this.slugify(cat)
      })),
      productId
    };
  }
}
