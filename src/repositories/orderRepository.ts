import pool from '../config/db';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { Order, OrderItem, DeliveryAddressSnapshot } from '../types';

export interface CreateOrderParams {
  order_reference: string;
  user_id?: number | null;
  customer_name: string;
  phone: string;
  email?: string | null;
  address: string;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  delivery_address_snapshot: DeliveryAddressSnapshot;
  subtotal: number;
  shipping_fee: number;
  discount_amount?: number;
  total_price: number;
  order_status?: string;
  payment_status?: string;
  payment_method?: string;
  product_id?: number | null;
  quantity?: number | null;
}

export class OrderRepository {
  /**
   * Parse numeric ID from string or number
   */
  public static parseNumericId(val: number | string | undefined | null): number {
    if (val === undefined || val === null) return 0;
    if (typeof val === 'number') return val;
    const num = Number(String(val).replace(/\D/g, ''));
    return isNaN(num) ? 0 : num;
  }

  /**
   * Map raw MySQL order row and items to domain Order model
   */
  public static mapRowToOrder(row: any, items: OrderItem[] = []): Order {
    let deliveryAddress: DeliveryAddressSnapshot;
    if (row.delivery_address_snapshot) {
      try {
        deliveryAddress = typeof row.delivery_address_snapshot === 'string'
          ? JSON.parse(row.delivery_address_snapshot)
          : row.delivery_address_snapshot;
      } catch {
        deliveryAddress = {
          customer_name: row.customer_name,
          phone: row.phone,
          email: row.email || undefined,
          house_details: row.address,
          street_area: '',
          city: row.city || '',
          state: row.state || '',
          pincode: row.pincode || '',
          addressLine: row.address
        };
      }
    } else {
      deliveryAddress = {
        customer_name: row.customer_name,
        phone: row.phone,
        email: row.email || undefined,
        house_details: row.address,
        street_area: '',
        city: row.city || '',
        state: row.state || '',
        pincode: row.pincode || '',
        addressLine: row.address
      };
    }

    const totalQuantity = items.length > 0
      ? items.reduce((acc, it) => acc + (it.quantity || 1), 0)
      : (row.quantity ? Number(row.quantity) : 1);

    return {
      id: String(row.id),
      order_reference: row.order_reference,
      user_id: row.user_id ? String(row.user_id) : undefined,
      customer_name: row.customer_name,
      email: row.email || undefined,
      phone: row.phone,
      address: row.address,
      delivery_address: deliveryAddress,
      items,
      total_quantity: totalQuantity,
      subtotal: Number(row.subtotal),
      shipping_fee: Number(row.shipping_fee),
      total_price: Number(row.total_price),
      order_status: row.order_status,
      payment_status: row.payment_status,
      payment_method: row.payment_method,
      payment_id: row.payment_id || undefined,
      courier_name: row.courier_name || undefined,
      tracking_number: row.tracking_number || undefined,
      dispatched_at: row.dispatched_at instanceof Date
        ? row.dispatched_at.toISOString()
        : (row.dispatched_at || undefined),
      delivered_at: row.delivered_at instanceof Date
        ? row.delivered_at.toISOString()
        : (row.delivered_at || undefined),
      created_at: row.created_at instanceof Date
        ? row.created_at.toISOString()
        : String(row.created_at),
      updated_at: row.updated_at instanceof Date
        ? row.updated_at.toISOString()
        : String(row.updated_at)
    };
  }

  /**
   * Map raw order_items row to OrderItem
   */
  public static mapRowToOrderItem(row: any): OrderItem {
    return {
      product_id: Number(row.product_id),
      product_name: String(row.product_name),
      price: Number(row.unit_price),
      quantity: Number(row.quantity),
      total_price: Number(row.total_price),
      image: row.product_image || undefined
    };
  }

  /**
   * Create an order and its line items inside a single MySQL transaction.
   * If cartIdToClear is provided, clears the active cart in the exact same transaction.
   */
  public static async createOrderWithItems(
    orderData: CreateOrderParams,
    items: OrderItem[],
    cartIdToClear?: number
  ): Promise<Order> {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // Validate and deduct stock atomically for all ordered items
      if (items && items.length > 0) {
        for (const item of items) {
          const reqQty = item.quantity || 1;
          const pId = Number(item.product_id);

          if (!Number.isInteger(pId) || pId <= 0) {
            const err: any = new Error(`Invalid product ID ${item.product_id} for stock deduction.`);
            err.statusCode = 400;
            throw err;
          }

          // Lock row to prevent race conditions during concurrent orders
          const [productRows] = await connection.query<RowDataPacket[]>(
            'SELECT id, name, stock_quantity FROM products WHERE id = ? FOR UPDATE',
            [pId]
          );

          if (productRows.length === 0) {
            const err: any = new Error(`Product with ID ${pId} not found in catalog.`);
            err.statusCode = 404;
            throw err;
          }

          const currentStock = Number(productRows[0].stock_quantity);
          const productName = productRows[0].name || `Product #${pId}`;

          if (currentStock < reqQty) {
            const err: any = new Error(
              `Insufficient stock for "${productName}". Requested: ${reqQty}, Available: ${currentStock}.`
            );
            err.statusCode = 400;
            throw err;
          }

          // Deduct stock atomically with conditional non-negative check
          const [deductResult] = await connection.query<ResultSetHeader>(
            'UPDATE products SET stock_quantity = stock_quantity - ? WHERE id = ? AND stock_quantity >= ?',
            [reqQty, pId, reqQty]
          );

          if (deductResult.affectedRows === 0) {
            const err: any = new Error(
              `Stock deduction failed for "${productName}". Insufficient stock.`
            );
            err.statusCode = 400;
            throw err;
          }
        }
      }

      const insertOrderSql = `
        INSERT INTO orders (
          order_reference, user_id, customer_name, phone, email,
          address, city, state, pincode, delivery_address_snapshot,
          subtotal, shipping_fee, discount_amount, total_price,
          order_status, payment_status, payment_method,
          product_id, quantity
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      const [orderResult] = await connection.query<ResultSetHeader>(insertOrderSql, [
        orderData.order_reference,
        orderData.user_id || null,
        orderData.customer_name,
        orderData.phone,
        orderData.email || null,
        orderData.address,
        orderData.city || null,
        orderData.state || null,
        orderData.pincode || null,
        JSON.stringify(orderData.delivery_address_snapshot),
        orderData.subtotal,
        orderData.shipping_fee,
        orderData.discount_amount || 0,
        orderData.total_price,
        orderData.order_status || 'Pending',
        orderData.payment_status || 'Pending',
        orderData.payment_method || 'Online',
        orderData.product_id || null,
        orderData.quantity || null
      ]);

      const orderId = orderResult.insertId;

      // Insert order items
      if (items && items.length > 0) {
        const itemSql = `
          INSERT INTO order_items (
            order_id, product_id, product_name, product_slug,
            product_image, unit_price, quantity, total_price
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `;

        for (const item of items) {
          await connection.query(itemSql, [
            orderId,
            item.product_id,
            item.product_name,
            null,
            item.image || null,
            item.price,
            item.quantity,
            item.total_price
          ]);
        }
      }

      // If cart clearance is requested, clear items in the exact same transaction
      if (cartIdToClear && cartIdToClear > 0) {
        await connection.query('DELETE FROM cart_items WHERE cart_id = ?', [cartIdToClear]);
      }

      await connection.commit();

      // Retrieve newly created order
      const [orderRows] = await pool.query<RowDataPacket[]>(
        'SELECT * FROM orders WHERE id = ? LIMIT 1',
        [orderId]
      );

      const [itemRows] = await pool.query<RowDataPacket[]>(
        'SELECT * FROM order_items WHERE order_id = ? ORDER BY id ASC',
        [orderId]
      );

      const verifiedItems: OrderItem[] = itemRows.map(this.mapRowToOrderItem);
      return this.mapRowToOrder(orderRows[0], verifiedItems);
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * Retrieve all orders for a specific user ID
   */
  public static async findByUserId(userId: number | string): Promise<Order[]> {
    const numUserId = this.parseNumericId(userId);
    if (!numUserId) return [];

    const [orderRows] = await pool.query<RowDataPacket[]>(
      'SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC',
      [numUserId]
    );

    if (orderRows.length === 0) return [];

    const orderIds = orderRows.map(r => r.id);
    const [itemRows] = await pool.query<RowDataPacket[]>(
      `SELECT * FROM order_items WHERE order_id IN (?) ORDER BY id ASC`,
      [orderIds]
    );

    const itemsByOrderId: Record<number, OrderItem[]> = {};
    for (const itemRow of itemRows) {
      const oId = Number(itemRow.order_id);
      if (!itemsByOrderId[oId]) itemsByOrderId[oId] = [];
      itemsByOrderId[oId].push(this.mapRowToOrderItem(itemRow));
    }

    return orderRows.map(r => this.mapRowToOrder(r, itemsByOrderId[r.id] || []));
  }

  /**
   * Find order by numeric ID or order reference string
   */
  public static async findByIdOrReference(idOrRef: string | number): Promise<Order | null> {
    if (idOrRef === undefined || idOrRef === null) return null;
    const clean = String(idOrRef).trim();
    if (!clean) return null;

    const numericId = Number(clean);
    let orderRows: RowDataPacket[];

    if (!isNaN(numericId) && Number.isInteger(numericId) && numericId > 0) {
      [orderRows] = await pool.query<RowDataPacket[]>(
        'SELECT * FROM orders WHERE id = ? OR order_reference = ? LIMIT 1',
        [numericId, clean]
      );
    } else {
      [orderRows] = await pool.query<RowDataPacket[]>(
        'SELECT * FROM orders WHERE order_reference = ? LIMIT 1',
        [clean]
      );
    }

    if (orderRows.length === 0) return null;

    const row = orderRows[0];
    const [itemRows] = await pool.query<RowDataPacket[]>(
      'SELECT * FROM order_items WHERE order_id = ? ORDER BY id ASC',
      [row.id]
    );

    const items: OrderItem[] = itemRows.map(this.mapRowToOrderItem);
    return this.mapRowToOrder(row, items);
  }

  /**
   * Find order strictly by order reference
   */
  public static async findByReference(orderRef: string): Promise<Order | null> {
    if (!orderRef || !orderRef.trim()) return null;
    const cleanRef = orderRef.trim();

    const [orderRows] = await pool.query<RowDataPacket[]>(
      'SELECT * FROM orders WHERE order_reference = ? LIMIT 1',
      [cleanRef]
    );

    if (orderRows.length === 0) return null;

    const row = orderRows[0];
    const [itemRows] = await pool.query<RowDataPacket[]>(
      'SELECT * FROM order_items WHERE order_id = ? ORDER BY id ASC',
      [row.id]
    );

    const items: OrderItem[] = itemRows.map(this.mapRowToOrderItem);
    return this.mapRowToOrder(row, items);
  }

  /**
   * Update payment status and payment transaction ID on order
   */
  public static async updatePaymentStatus(
    idOrRef: string | number,
    paymentStatus: string,
    paymentId?: string,
    orderStatus?: string
  ): Promise<Order | null> {
    const existing = await this.findByIdOrReference(idOrRef);
    if (!existing) return null;

    const finalOrderStatus = orderStatus || (paymentStatus === 'Paid' ? 'Processing' : existing.order_status);

    await pool.query(
      `UPDATE orders 
       SET payment_status = ?,
           payment_id = COALESCE(?, payment_id),
           order_status = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [paymentStatus, paymentId || null, finalOrderStatus, Number(existing.id)]
    );

    return this.findByIdOrReference(existing.id);
  }

  /**
   * Update order status (e.g. Processing, Dispatched, Delivered, Cancelled)
   */
  public static async updateOrderStatus(
    idOrRef: string | number,
    orderStatus: string
  ): Promise<Order | null> {
    const existing = await this.findByIdOrReference(idOrRef);
    if (!existing) return null;

    await pool.query(
      `UPDATE orders 
       SET order_status = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [orderStatus, Number(existing.id)]
    );

    return this.findByIdOrReference(existing.id);
  }

  /**
   * Retrieve order tracking details
   */
  public static async getTrackingInfo(orderRef: string): Promise<Order | null> {
    return this.findByReference(orderRef);
  }
}
