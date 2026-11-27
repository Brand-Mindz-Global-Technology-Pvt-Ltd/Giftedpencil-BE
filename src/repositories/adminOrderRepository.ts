import pool from '../config/db';
import { RowDataPacket } from 'mysql2';
import {
  AdminOrderQueryParams,
  AdminOrderModel,
  AdminOrdersListResult,
  AdminOrderItem
} from '../types/adminOrder';

export class AdminOrderRepository {
  /**
   * Helper to map database order_status to lowercase string expected by Admin frontend
   */
  public static mapOrderStatus(rawStatus?: string | null): string {
    return String(rawStatus || 'Pending').trim().toLowerCase();
  }

  /**
   * Helper to map database payment_status to frontend expected format
   */
  public static mapPaymentStatus(rawStatus?: string | null): string {
    const s = String(rawStatus || 'Pending').trim().toLowerCase();
    if (s === 'paid') return 'captured';
    return s;
  }

  /**
   * Helper to map database row and associated items to AdminOrderModel
   */
  public static mapRowToAdminOrder(row: any, itemRows: any[] = []): AdminOrderModel {
    let line1 = row.address || '';
    let city = row.city || '';
    let state = row.state || '';
    let pincode = row.pincode || '';
    let street_area = '';
    let landmark = '';
    let cancelReason: string | null = null;

    if (row.delivery_address_snapshot) {
      try {
        const snap = typeof row.delivery_address_snapshot === 'string'
          ? JSON.parse(row.delivery_address_snapshot)
          : row.delivery_address_snapshot;

        if (snap && typeof snap === 'object') {
          line1 = snap.house_details || snap.addressLine || line1;
          city = snap.city || city;
          state = snap.state || state;
          pincode = snap.pincode || pincode;
          street_area = snap.street_area || '';
          landmark = snap.landmark || '';
          if (snap.cancel_reason) {
            cancelReason = String(snap.cancel_reason);
          }
        }
      } catch {
        // Fallback to row fields if JSON parsing fails
      }
    }

    const items: AdminOrderItem[] = itemRows.length > 0
      ? itemRows.map((it: any) => ({
          id: Number(it.product_id || it.id),
          name: String(it.product_name || 'Product'),
          price: Number(it.unit_price || 0),
          qty: Number(it.quantity || 1),
          total: Number(it.total_price || (Number(it.unit_price || 0) * Number(it.quantity || 1))),
          image: it.product_image || 'product-1.png',
          color: null,
          size: null
        }))
      : [
          {
            id: row.product_id ? Number(row.product_id) : 1,
            name: row.customer_name ? `${row.customer_name}'s Order Item` : 'Order Item',
            price: Number(row.subtotal || row.total_price || 0),
            qty: row.quantity ? Number(row.quantity) : 1,
            total: Number(row.total_price || 0),
            image: 'product-1.png',
            color: null,
            size: null
          }
        ];

    const orderIdNum = Number(row.id);
    const orderRefStr = String(row.order_reference || `ORD-${orderIdNum}`);

    return {
      orderId: orderRefStr,
      id: orderIdNum,
      _id: orderIdNum,
      customerId: {
        id: row.user_id ? Number(row.user_id) : undefined,
        name: String(row.customer_name || 'Customer'),
        email: String(row.email || ''),
        phone: String(row.phone || '')
      },
      createdAt: row.created_at instanceof Date
        ? row.created_at.toISOString()
        : String(row.created_at || new Date().toISOString()),
      orderStatus: this.mapOrderStatus(row.order_status),
      payment: {
        method: String(row.payment_method || 'Online').toLowerCase(),
        status: this.mapPaymentStatus(row.payment_status),
        paidAt: String(row.payment_status || '').toLowerCase() === 'paid' && row.updated_at
          ? (row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at))
          : null
      },
      shippingAddress: {
        line1,
        city,
        state,
        pincode,
        street_area,
        landmark
      },
      items,
      subtotal: Number(row.subtotal || row.total_price || 0),
      shipping: Number(row.shipping_fee || 0),
      totalAmount: Number(row.total_price || 0),
      cancelReason
    };
  }

  /**
   * Find paginated orders for Admin with status, search, and sorting
   */
  public static async findOrders(params: AdminOrderQueryParams = {}): Promise<AdminOrdersListResult> {
    const whereConditions: string[] = [];
    const queryParams: any[] = [];

    // Status filter
    if (params.status && params.status.trim() && params.status.trim().toLowerCase() !== 'all') {
      const s = params.status.trim().toLowerCase();
      whereConditions.push('LOWER(o.order_status) = ?');
      queryParams.push(s);
    }

    // Search filter across reference, customer name, email, phone, and numeric ID
    if (params.search && params.search.trim()) {
      const q = `%${params.search.trim().toLowerCase()}%`;
      whereConditions.push(
        '(LOWER(o.order_reference) LIKE ? OR LOWER(o.customer_name) LIKE ? OR LOWER(COALESCE(o.email, \'\')) LIKE ? OR LOWER(COALESCE(o.phone, \'\')) LIKE ? OR CAST(o.id AS CHAR) LIKE ?)'
      );
      queryParams.push(q, q, q, q, q);
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    // Count total matching orders
    const countSql = `SELECT COUNT(*) AS total FROM orders o ${whereClause}`;
    const [countRows] = await pool.query<RowDataPacket[]>(countSql, queryParams);
    const total = Number(countRows[0]?.total || 0);

    // Sorting
    const sort = (params.sort || 'newest').trim().toLowerCase();
    let orderBy = 'ORDER BY o.id DESC';
    if (sort === 'oldest') {
      orderBy = 'ORDER BY o.id ASC';
    } else if (sort === 'amount_high') {
      orderBy = 'ORDER BY o.total_price DESC, o.id DESC';
    } else if (sort === 'amount_low') {
      orderBy = 'ORDER BY o.total_price ASC, o.id DESC';
    }

    // Pagination
    const page = Math.max(1, Number(params.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(params.limit) || 10));
    const offset = (page - 1) * limit;
    const totalPages = Math.ceil(total / limit) || 1;

    // Fetch master orders
    const fetchSql = `
      SELECT o.* 
      FROM orders o 
      ${whereClause} 
      ${orderBy} 
      LIMIT ? OFFSET ?
    `;
    const [orderRows] = await pool.query<RowDataPacket[]>(fetchSql, [...queryParams, limit, offset]);

    if (orderRows.length === 0) {
      return {
        orders: [],
        total,
        totalPages,
        page,
        limit
      };
    }

    // Fetch line items for all retrieved orders in a single query
    const orderIds = orderRows.map((r: any) => r.id);
    const [itemRows] = await pool.query<RowDataPacket[]>(
      'SELECT * FROM order_items WHERE order_id IN (?) ORDER BY id ASC',
      [orderIds]
    );

    const itemsByOrderId: Record<number, any[]> = {};
    for (const it of itemRows) {
      const oId = Number(it.order_id);
      if (!itemsByOrderId[oId]) itemsByOrderId[oId] = [];
      itemsByOrderId[oId].push(it);
    }

    const orders = orderRows.map((r: any) => this.mapRowToAdminOrder(r, itemsByOrderId[r.id] || []));

    return {
      orders,
      total,
      totalPages,
      page,
      limit
    };
  }

  /**
   * Find single order by ID or order reference string
   */
  public static async findOrderByIdOrReference(idOrRef: string | number): Promise<AdminOrderModel | null> {
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

    return this.mapRowToAdminOrder(row, itemRows);
  }

  /**
   * Validate if the provided status string is one of the supported Admin order statuses
   */
  public static isValidStatus(status: any): boolean {
    if (!status || typeof status !== 'string') return false;
    const lower = status.trim().toLowerCase();
    return ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'].includes(lower);
  }

  /**
   * Convert client status to TitleCase database string (e.g. 'shipped' -> 'Shipped')
   */
  public static normalizeDbStatus(status: string): string {
    const lower = status.trim().toLowerCase();
    const map: Record<string, string> = {
      pending: 'Pending',
      confirmed: 'Confirmed',
      processing: 'Processing',
      shipped: 'Shipped',
      delivered: 'Delivered',
      cancelled: 'Cancelled'
    };
    return map[lower] || status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
  }

  /**
   * Update order_status column for an order in MySQL and return the fresh AdminOrderModel
   */
  public static async updateOrderStatus(
    idOrRef: string | number,
    rawStatus: string
  ): Promise<AdminOrderModel | null> {
    const existing = await this.findOrderByIdOrReference(idOrRef);
    if (!existing) return null;

    const normalizedStatus = this.normalizeDbStatus(rawStatus);

    await pool.query(
      `UPDATE orders 
       SET order_status = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [normalizedStatus, existing.id]
    );

    return this.findOrderByIdOrReference(existing.id);
  }

  /**
   * Cancel an order safely:
   * - Validates existence
   * - Rejects already-cancelled orders
   * - Rejects delivered orders
   * - Updates ONLY order_status = 'Cancelled' and updated_at = CURRENT_TIMESTAMP
   * - Leaves items, payment, pricing, addresses untouched
   */
  public static async cancelOrder(
    idOrRef: string | number,
    _cancelReason: string = ''
  ): Promise<{ success: boolean; order?: AdminOrderModel; message?: string; statusCode?: number }> {
    const existing = await this.findOrderByIdOrReference(idOrRef);
    if (!existing) {
      return { success: false, statusCode: 404, message: `Order "${idOrRef}" not found` };
    }

    const currentStatus = String(existing.orderStatus).toLowerCase();
    if (currentStatus === 'cancelled') {
      return { success: false, statusCode: 400, message: `Order #${existing.orderId} is already cancelled` };
    }

    if (currentStatus === 'delivered') {
      return { success: false, statusCode: 400, message: `Delivered orders cannot be cancelled` };
    }

    await pool.query(
      `UPDATE orders 
       SET order_status = 'Cancelled',
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [existing.id]
    );

    const updated = await this.findOrderByIdOrReference(existing.id);
    if (!updated) {
      return { success: false, statusCode: 500, message: 'Failed to retrieve updated order' };
    }

    return {
      success: true,
      order: updated
    };
  }

  /**
   * Retrieve all matching orders for CSV export without pagination limit
   * Applies the exact same status filter, search, and sorting logic
   */
  public static async findOrdersForExport(params: AdminOrderQueryParams = {}): Promise<AdminOrderModel[]> {
    const whereConditions: string[] = [];
    const queryParams: any[] = [];

    // Status filter
    if (params.status && params.status.trim() && params.status.trim().toLowerCase() !== 'all') {
      const s = params.status.trim().toLowerCase();
      whereConditions.push('LOWER(o.order_status) = ?');
      queryParams.push(s);
    }

    // Search filter across reference, customer name, email, phone, and numeric ID
    if (params.search && params.search.trim()) {
      const q = `%${params.search.trim().toLowerCase()}%`;
      whereConditions.push(
        '(LOWER(o.order_reference) LIKE ? OR LOWER(o.customer_name) LIKE ? OR LOWER(COALESCE(o.email, \'\')) LIKE ? OR LOWER(COALESCE(o.phone, \'\')) LIKE ? OR CAST(o.id AS CHAR) LIKE ?)'
      );
      queryParams.push(q, q, q, q, q);
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    // Sorting
    const sort = (params.sort || 'newest').trim().toLowerCase();
    let orderBy = 'ORDER BY o.id DESC';
    if (sort === 'oldest') {
      orderBy = 'ORDER BY o.id ASC';
    } else if (sort === 'amount_high') {
      orderBy = 'ORDER BY o.total_price DESC, o.id DESC';
    } else if (sort === 'amount_low') {
      orderBy = 'ORDER BY o.total_price ASC, o.id DESC';
    }

    // Fetch all matching master orders up to safety limit (10,000)
    const fetchSql = `
      SELECT o.* 
      FROM orders o 
      ${whereClause} 
      ${orderBy} 
      LIMIT 10000
    `;
    const [orderRows] = await pool.query<RowDataPacket[]>(fetchSql, queryParams);

    if (orderRows.length === 0) {
      return [];
    }

    const orderIds = orderRows.map((r: any) => r.id);
    const [itemRows] = await pool.query<RowDataPacket[]>(
      'SELECT * FROM order_items WHERE order_id IN (?) ORDER BY id ASC',
      [orderIds]
    );

    const itemsByOrderId: Record<number, any[]> = {};
    for (const it of itemRows) {
      const oId = Number(it.order_id);
      if (!itemsByOrderId[oId]) itemsByOrderId[oId] = [];
      itemsByOrderId[oId].push(it);
    }

    return orderRows.map((r: any) => this.mapRowToAdminOrder(r, itemsByOrderId[r.id] || []));
  }

  /**
   * Helper to sanitize CSV field:
   * 1. Protects against CSV formula injection (=, +, -, @) by prepending a single quote
   * 2. Properly escapes quotes, commas, and newlines
   */
  public static sanitizeCsvValue(val: any): string {
    if (val === null || val === undefined) return '';
    let str = String(val).trim();

    // Prevent spreadsheet formula injection for values beginning with =, +, -, @
    if (/^[=+\-@]/.test(str)) {
      str = `'${str}`;
    }

    // Escape quotes and wrap in quotes if contains comma, quote, or newline
    if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
      str = `"${str.replace(/"/g, '""')}"`;
    }

    return str;
  }

  /**
   * Generate RFC-4180 compliant CSV string from list of AdminOrderModel
   */
  public static generateOrdersCsv(orders: AdminOrderModel[]): string {
    const headers = [
      'Order ID / Order Reference',
      'Customer Name',
      'Customer Email',
      'Customer Phone',
      'Order Date',
      'Item Names',
      'Item Quantities',
      'Subtotal',
      'Shipping Fee',
      'Discount',
      'Total Amount',
      'Payment Method',
      'Payment Status',
      'Order Status',
      'City',
      'State',
      'PIN Code',
      'Tracking Number'
    ];

    const rows = orders.map((order) => {
      const itemNames = (order.items || []).map((it) => it.name).join('; ');
      const itemQtys = (order.items || []).map((it) => `${it.name} (x${it.qty})`).join('; ');
      const subtotal = order.subtotal != null ? Number(order.subtotal).toFixed(2) : '0.00';
      const shipping = order.shipping != null ? Number(order.shipping).toFixed(2) : '0.00';
      const discount = '0.00';
      const totalAmount = order.totalAmount != null ? Number(order.totalAmount).toFixed(2) : '0.00';
      const orderDate = order.createdAt ? new Date(order.createdAt).toISOString().slice(0, 19).replace('T', ' ') : '';
      const trackingNumber = (order as any).tracking_number || '';

      return [
        this.sanitizeCsvValue(order.orderId),
        this.sanitizeCsvValue(order.customerId?.name || ''),
        this.sanitizeCsvValue(order.customerId?.email || ''),
        this.sanitizeCsvValue(order.customerId?.phone || ''),
        this.sanitizeCsvValue(orderDate),
        this.sanitizeCsvValue(itemNames),
        this.sanitizeCsvValue(itemQtys),
        this.sanitizeCsvValue(subtotal),
        this.sanitizeCsvValue(shipping),
        this.sanitizeCsvValue(discount),
        this.sanitizeCsvValue(totalAmount),
        this.sanitizeCsvValue(order.payment?.method || ''),
        this.sanitizeCsvValue(order.payment?.status || ''),
        this.sanitizeCsvValue(order.orderStatus || ''),
        this.sanitizeCsvValue(order.shippingAddress?.city || ''),
        this.sanitizeCsvValue(order.shippingAddress?.state || ''),
        this.sanitizeCsvValue(order.shippingAddress?.pincode || ''),
        this.sanitizeCsvValue(trackingNumber)
      ].join(',');
    });

    // Add UTF-8 BOM so Excel opens with proper character encoding
    return '\uFEFF' + [headers.join(','), ...rows].join('\r\n');
  }
}
