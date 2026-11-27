import pool from '../config/db';
import { CartItem } from '../types';

export interface CartIdentity {
  userId?: number;
  guestSessionId?: string;
}

export class CartRepository {
  /**
   * Find or create active cart for a user or guest session
   * Thread-safe with Option A unique constraint handling
   */
  public static async findOrCreateActiveCart(identity: CartIdentity): Promise<number> {
    const conn = await pool.getConnection();
    try {
      // 1. Authenticated User Cart
      if (identity.userId && identity.userId > 0) {
        // Verify user exists in users table to satisfy foreign key fk_carts_user
        const [userRows] = await conn.query<any[]>(
          'SELECT id FROM users WHERE id = ? LIMIT 1',
          [identity.userId]
        );

        if (userRows.length > 0) {
          // Look for active cart for this user
          const [existingCart] = await conn.query<any[]>(
            'SELECT id FROM carts WHERE user_id = ? AND status = "active" LIMIT 1',
            [identity.userId]
          );

          if (existingCart.length > 0) {
            return Number(existingCart[0].id);
          }

          // Create active user cart with duplicate-key race protection
          try {
            const [insertRes] = await conn.query<any>(
              'INSERT INTO carts (user_id, status) VALUES (?, "active")',
              [identity.userId]
            );
            return Number(insertRes.insertId);
          } catch (err: any) {
            if (err.code === 'ER_DUP_ENTRY') {
              const [raceCart] = await conn.query<any[]>(
                'SELECT id FROM carts WHERE user_id = ? AND status = "active" LIMIT 1',
                [identity.userId]
              );
              if (raceCart.length > 0) return Number(raceCart[0].id);
            }
            throw err;
          }
        }
      }

      // 2. Guest Session Cart (or fallback if userId not found in users table)
      const guestSession = identity.guestSessionId || (identity.userId ? `user-${identity.userId}` : 'guest-default');

      const [existingGuestCart] = await conn.query<any[]>(
        'SELECT id FROM carts WHERE guest_session_id = ? AND status = "active" LIMIT 1',
        [guestSession]
      );

      if (existingGuestCart.length > 0) {
        return Number(existingGuestCart[0].id);
      }

      // Create active guest cart with duplicate-key race protection
      try {
        const [insertGuestRes] = await conn.query<any>(
          'INSERT INTO carts (guest_session_id, status) VALUES (?, "active")',
          [guestSession]
        );
        return Number(insertGuestRes.insertId);
      } catch (err: any) {
        if (err.code === 'ER_DUP_ENTRY') {
          const [raceGuestCart] = await conn.query<any[]>(
            'SELECT id FROM carts WHERE guest_session_id = ? AND status = "active" LIMIT 1',
            [guestSession]
          );
          if (raceGuestCart.length > 0) return Number(raceGuestCart[0].id);
        }
        throw err;
      }
    } finally {
      conn.release();
    }
  }

  /**
   * Fetch all line items in a cart with live product prices, titles, images, and category
   */
  public static async getCartItems(cartId: number): Promise<CartItem[]> {
    const sql = `
      SELECT 
        ci.id AS cart_item_id,
        ci.product_id,
        ci.quantity,
        p.name AS product_name,
        p.price AS unit_price,
        p.image,
        p.stock_quantity,
        p.is_active,
        COALESCE(c.name, 'Journals') AS category
      FROM cart_items ci
      JOIN products p ON ci.product_id = p.id
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE ci.cart_id = ?
      ORDER BY ci.id ASC
    `;

    const [rows] = await pool.query<any[]>(sql, [cartId]);

    return rows.map(row => {
      const unitPrice = Number(row.unit_price);
      const quantity = Number(row.quantity);
      const itemTotal = parseFloat((unitPrice * quantity).toFixed(2));

      return {
        id: String(row.cart_item_id),
        product_id: Number(row.product_id),
        product_name: String(row.product_name),
        unit_price: unitPrice,
        quantity,
        item_total: itemTotal,
        image: row.image || 'product-1.png',
        category: String(row.category)
      };
    });
  }

  /**
   * Fetch a single item by cartId and productId
   */
  public static async getItem(cartId: number, productId: number): Promise<{ id: number; quantity: number } | null> {
    const sql = `
      SELECT id, quantity 
      FROM cart_items 
      WHERE cart_id = ? AND product_id = ? 
      LIMIT 1
    `;
    const [rows] = await pool.query<any[]>(sql, [cartId, productId]);
    if (rows.length === 0) return null;
    return {
      id: Number(rows[0].id),
      quantity: Number(rows[0].quantity)
    };
  }

  /**
   * Add item or increase quantity in cart using transactional upsert
   */
  public static async addItem(cartId: number, productId: number, quantity: number): Promise<void> {
    const sql = `
      INSERT INTO cart_items (cart_id, product_id, quantity)
      VALUES (?, ?, ?)
      ON DUPLICATE KEY UPDATE quantity = quantity + VALUES(quantity)
    `;
    await pool.query(sql, [cartId, productId, quantity]);
  }

  /**
   * Update item quantity explicitly
   */
  public static async updateItemQuantity(cartId: number, productId: number, quantity: number): Promise<boolean> {
    if (quantity <= 0) {
      return this.removeItem(cartId, productId);
    }

    const sql = `
      UPDATE cart_items 
      SET quantity = ? 
      WHERE cart_id = ? AND product_id = ?
    `;
    const [res] = await pool.query<any>(sql, [quantity, cartId, productId]);
    return res.affectedRows > 0;
  }

  /**
   * Remove a single item from the cart
   */
  public static async removeItem(cartId: number, productId: number): Promise<boolean> {
    const sql = `
      DELETE FROM cart_items 
      WHERE cart_id = ? AND product_id = ?
    `;
    const [res] = await pool.query<any>(sql, [cartId, productId]);
    return res.affectedRows > 0;
  }

  /**
   * Clear all items from a cart
   */
  public static async clearCart(cartId: number): Promise<void> {
    const sql = `
      DELETE FROM cart_items 
      WHERE cart_id = ?
    `;
    await pool.query(sql, [cartId]);
  }
}
