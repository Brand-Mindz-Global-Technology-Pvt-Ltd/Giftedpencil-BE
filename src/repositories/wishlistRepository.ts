import pool from '../config/db';
import { WishlistItem, WishlistSummary } from '../types';
import { ProductRepository } from './productRepository';

export class WishlistRepository {
  /**
   * Find or create the wishlist ID for a given user in MySQL
   */
  public static async findOrCreateWishlist(userId: number): Promise<number> {
    const [rows] = await pool.query<any[]>(
      'SELECT id FROM wishlists WHERE user_id = ? LIMIT 1',
      [userId]
    );

    if (rows.length > 0) {
      return rows[0].id;
    }

    try {
      const [insertResult] = await pool.query<any>(
        'INSERT INTO wishlists (user_id) VALUES (?) ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)',
        [userId]
      );
      return insertResult.insertId;
    } catch {
      // Re-query in case of race condition
      const [retryRows] = await pool.query<any[]>(
        'SELECT id FROM wishlists WHERE user_id = ? LIMIT 1',
        [userId]
      );
      if (retryRows.length > 0) {
        return retryRows[0].id;
      }
      throw new Error(`Failed to initialize wishlist for user ${userId}`);
    }
  }

  /**
   * Get full wishlist summary for a given user from MySQL
   */
  public static async getWishlistSummary(userId: number): Promise<WishlistSummary> {
    const query = `
      SELECT 
        wi.id AS item_id,
        wi.product_id,
        wi.added_at,
        p.name AS product_name,
        p.price,
        p.original_price,
        p.discount,
        p.image,
        p.slug,
        p.stock_quantity,
        c.name AS category_name
      FROM wishlists w
      JOIN wishlist_items wi ON w.id = wi.wishlist_id
      JOIN products p ON wi.product_id = p.id
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE w.user_id = ? AND p.is_active = 1
      ORDER BY wi.added_at DESC
    `;

    const [rows] = await pool.query<any[]>(query, [userId]);

    const items: WishlistItem[] = rows.map(row => {
      const stock = Number(row.stock_quantity ?? 0);
      return {
        id: `WISH-${row.product_id}`,
        product_id: Number(row.product_id),
        product_name: String(row.product_name),
        name: String(row.product_name),
        title: String(row.product_name),
        price: Number(row.price),
        original_price: row.original_price != null ? Number(row.original_price) : undefined,
        discount: row.discount || undefined,
        image: row.image || 'product-1.png',
        slug: row.slug || '',
        category: row.category_name || 'Journals',
        in_stock: stock > 0,
        added_at: row.added_at instanceof Date
          ? row.added_at.toISOString()
          : String(row.added_at || new Date().toISOString())
      };
    });

    return {
      items,
      total_items: items.length
    };
  }

  /**
   * Check if a product is already in the user's wishlist
   */
  public static async hasItem(userId: number, productId: number): Promise<boolean> {
    const [rows] = await pool.query<any[]>(
      `SELECT 1 FROM wishlists w
       JOIN wishlist_items wi ON w.id = wi.wishlist_id
       WHERE w.user_id = ? AND wi.product_id = ?
       LIMIT 1`,
      [userId, productId]
    );
    return rows.length > 0;
  }

  /**
   * Add a product to the user's wishlist in MySQL
   */
  public static async addItem(userId: number, productId: number): Promise<{ item: WishlistItem; wishlist: WishlistSummary }> {
    const product = await ProductRepository.findProductById(productId);
    if (!product) {
      const err: any = new Error(`Product with ID ${productId} does not exist.`);
      err.statusCode = 404;
      throw err;
    }

    const alreadyHas = await this.hasItem(userId, productId);
    if (alreadyHas) {
      const err: any = new Error(`"${product.name}" is already in your wishlist.`);
      err.statusCode = 400;
      throw err;
    }

    const wishlistId = await this.findOrCreateWishlist(userId);

    try {
      await pool.query(
        'INSERT INTO wishlist_items (wishlist_id, product_id) VALUES (?, ?)',
        [wishlistId, productId]
      );
    } catch (dbErr: any) {
      if (dbErr.code === 'ER_DUP_ENTRY') {
        const err: any = new Error(`"${product.name}" is already in your wishlist.`);
        err.statusCode = 400;
        throw err;
      }
      throw dbErr;
    }

    const wishlist = await this.getWishlistSummary(userId);
    const item = wishlist.items.find(i => i.product_id === productId) || {
      id: `WISH-${product.id}`,
      product_id: product.id,
      product_name: product.name,
      name: product.name,
      title: product.name,
      price: product.price,
      original_price: product.original_price,
      discount: product.discount,
      image: product.image,
      slug: product.slug,
      category: product.category,
      in_stock: product.stock > 0,
      added_at: new Date().toISOString()
    };

    return { item, wishlist };
  }

  /**
   * Remove a product from the user's wishlist in MySQL
   */
  public static async removeItem(userId: number, productId: number): Promise<WishlistSummary> {
    const alreadyHas = await this.hasItem(userId, productId);
    if (!alreadyHas) {
      const err: any = new Error(`Product with ID ${productId} is not present in the wishlist.`);
      err.statusCode = 404;
      throw err;
    }

    await pool.query(
      `DELETE wi FROM wishlist_items wi
       JOIN wishlists w ON wi.wishlist_id = w.id
       WHERE w.user_id = ? AND wi.product_id = ?`,
      [userId, productId]
    );

    return this.getWishlistSummary(userId);
  }

  /**
   * Clear all items from the user's wishlist in MySQL
   */
  public static async clearWishlist(userId: number): Promise<WishlistSummary> {
    await pool.query(
      `DELETE wi FROM wishlist_items wi
       JOIN wishlists w ON wi.wishlist_id = w.id
       WHERE w.user_id = ?`,
      [userId]
    );

    return {
      items: [],
      total_items: 0
    };
  }
}
