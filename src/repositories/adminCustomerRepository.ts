import pool from '../config/db';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import {
  AdminCustomerQueryParams,
  AdminCustomerListItem,
  AdminCustomerDetails,
  AdminCustomerAddress,
  AdminCustomerOrderSummary,
  AdminCustomersListResult,
  CustomerAccountStatus
} from '../types/adminCustomer';

export class AdminCustomerRepository {
  /**
   * Normalize database account_status to frontend display label
   */
  public static normalizeStatus(raw?: string | null): string {
    const s = String(raw || 'active').trim().toLowerCase();
    if (s === 'active') return 'Active';
    if (s === 'inactive') return 'Inactive';
    if (s === 'suspended' || s === 'blocked') return 'Blocked';
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  /**
   * Denormalize frontend status label to database enum value
   */
  public static denormalizeStatus(status?: string | null): CustomerAccountStatus {
    const s = String(status || 'active').trim().toLowerCase();
    if (s === 'inactive') return 'inactive';
    if (s === 'blocked' || s === 'suspended') return 'suspended';
    return 'active';
  }

  /**
   * Safe mapping from DB user row to AdminCustomerListItem
   */
  public static mapRowToCustomerListItem(row: any): AdminCustomerListItem {
    const numericId = Number(row.id);
    const rawStatus = (row.account_status || 'active').toLowerCase() as CustomerAccountStatus;
    const formattedId = `CUST-${numericId}`;

    return {
      id: numericId,
      _id: numericId,
      customerId: formattedId,
      userUuid: String(row.user_uuid || ''),
      name: String(row.name || 'Anonymous'),
      email: String(row.email || ''),
      phone: String(row.phone || ''),
      gender: row.gender ? String(row.gender) : null,
      avatarUrl: row.avatar_url ? String(row.avatar_url) : null,
      status: AdminCustomerRepository.normalizeStatus(rawStatus),
      rawStatus,
      totalOrders: Number(row.total_orders || 0),
      totalSpent: Number(Number(row.total_spent || 0).toFixed(2)),
      latestOrderDate: row.latest_order_date
        ? (row.latest_order_date instanceof Date ? row.latest_order_date.toISOString() : String(row.latest_order_date))
        : null,
      createdAt: row.created_at instanceof Date
        ? row.created_at.toISOString()
        : String(row.created_at || new Date().toISOString()),
      updatedAt: row.updated_at instanceof Date
        ? row.updated_at.toISOString()
        : String(row.updated_at || new Date().toISOString())
    };
  }

  /**
   * Find customers with filters, search, sorting, and pagination
   */
  public static async findCustomers(params: AdminCustomerQueryParams): Promise<AdminCustomersListResult> {
    const whereConditions: string[] = [];
    const queryParams: any[] = [];

    // Filter by status
    if (params.status && params.status.trim() && params.status.trim().toLowerCase() !== 'all') {
      const dbStatus = AdminCustomerRepository.denormalizeStatus(params.status);
      whereConditions.push('LOWER(u.account_status) = ?');
      queryParams.push(dbStatus);
    }

    // Specific field searches
    if (params.name && params.name.trim()) {
      whereConditions.push('LOWER(u.name) LIKE ?');
      queryParams.push(`%${params.name.trim().toLowerCase()}%`);
    }

    if (params.email && params.email.trim()) {
      whereConditions.push('LOWER(u.email) LIKE ?');
      queryParams.push(`%${params.email.trim().toLowerCase()}%`);
    }

    if (params.phone && params.phone.trim()) {
      whereConditions.push('LOWER(u.phone) LIKE ?');
      queryParams.push(`%${params.phone.trim().toLowerCase()}%`);
    }

    if (params.customerId && params.customerId.trim()) {
      const cleanId = params.customerId.trim().replace(/^CUST-/i, '');
      whereConditions.push('(CAST(u.id AS CHAR) = ? OR LOWER(u.user_uuid) = ?)');
      queryParams.push(cleanId, params.customerId.trim().toLowerCase());
    }

    // Generic search across name, email, phone, id, user_uuid
    if (params.search && params.search.trim()) {
      const term = params.search.trim().toLowerCase();
      const cleanTerm = term.replace(/^cust-/i, '');
      const q = `%${term}%`;
      whereConditions.push(
        '(LOWER(u.name) LIKE ? OR LOWER(u.email) LIKE ? OR LOWER(COALESCE(u.phone, \'\')) LIKE ? OR CAST(u.id AS CHAR) = ? OR LOWER(u.user_uuid) LIKE ?)'
      );
      queryParams.push(q, q, q, cleanTerm, q);
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    // Total count query
    const countSql = `SELECT COUNT(*) AS total FROM users u ${whereClause}`;
    const [countRows] = await pool.query<RowDataPacket[]>(countSql, queryParams);
    const total = Number(countRows[0]?.total || 0);

    // Sorting
    const sortBy = String(params.sortBy || 'newest').trim().toLowerCase();
    const sortOrder = String(params.sortOrder || 'desc').trim().toLowerCase() === 'asc' ? 'ASC' : 'DESC';

    let orderClause = 'ORDER BY u.id DESC';
    if (sortBy === 'oldest') {
      orderClause = 'ORDER BY u.id ASC';
    } else if (sortBy === 'newest') {
      orderClause = 'ORDER BY u.id DESC';
    } else if (sortBy === 'name') {
      orderClause = `ORDER BY u.name ${sortOrder}, u.id DESC`;
    } else if (sortBy === 'email') {
      orderClause = `ORDER BY u.email ${sortOrder}, u.id DESC`;
    } else if (sortBy === 'id' || sortBy === 'customerid') {
      orderClause = `ORDER BY u.id ${sortOrder}`;
    } else if (sortBy === 'total_orders' || sortBy === 'orders') {
      orderClause = `ORDER BY total_orders ${sortOrder}, u.id DESC`;
    } else if (sortBy === 'total_spent' || sortBy === 'spending') {
      orderClause = `ORDER BY total_spent ${sortOrder}, u.id DESC`;
    }

    // Pagination
    const page = Math.max(1, Number(params.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(params.limit) || 10));
    const offset = (page - 1) * limit;
    const totalPages = Math.ceil(total / limit) || 1;

    // Fetch customer rows with aggregation
    // NEVER select password_hash!
    const fetchSql = `
      SELECT 
        u.id,
        u.user_uuid,
        u.name,
        u.email,
        u.phone,
        u.gender,
        u.avatar_url,
        u.account_status,
        u.created_at,
        u.updated_at,
        COUNT(DISTINCT o.id) AS total_orders,
        COALESCE(SUM(
          CASE 
            WHEN LOWER(o.payment_status) = 'paid' 
                 OR LOWER(o.order_status) IN ('processing', 'shipped', 'delivered') 
            THEN o.total_price 
            ELSE 0 
          END
        ), 0) AS total_spent,
        MAX(o.created_at) AS latest_order_date
      FROM users u
      LEFT JOIN orders o ON o.user_id = u.id
      ${whereClause}
      GROUP BY u.id
      ${orderClause}
      LIMIT ? OFFSET ?
    `;

    const [rows] = await pool.query<RowDataPacket[]>(fetchSql, [...queryParams, limit, offset]);
    const customers = rows.map((r) => AdminCustomerRepository.mapRowToCustomerListItem(r));

    return {
      customers,
      pagination: {
        page,
        limit,
        total,
        totalPages
      }
    };
  }

  /**
   * Find single customer by numeric id or user_uuid with addresses and order summary
   */
  public static async findCustomerById(idOrUuid: string | number): Promise<AdminCustomerDetails | null> {
    const isNumeric = !isNaN(Number(idOrUuid));
    let query = `
      SELECT 
        u.id,
        u.user_uuid,
        u.name,
        u.email,
        u.phone,
        u.gender,
        u.avatar_url,
        u.preferences,
        u.newsletter_subscribed,
        u.sms_updates,
        u.account_status,
        u.created_at,
        u.updated_at
      FROM users u
      WHERE ${isNumeric ? 'u.id = ?' : 'u.user_uuid = ? OR u.id = ?'}
      LIMIT 1
    `;

    const params = isNumeric ? [Number(idOrUuid)] : [String(idOrUuid), Number(String(idOrUuid).replace(/^CUST-/i, '')) || 0];
    const [rows] = await pool.query<RowDataPacket[]>(query, params);

    if (rows.length === 0) {
      return null;
    }

    const row = rows[0];
    const userId = Number(row.id);
    const rawStatus = (row.account_status || 'active').toLowerCase() as CustomerAccountStatus;

    // Fetch addresses for this customer
    const [addressRows] = await pool.query<RowDataPacket[]>(
      `SELECT * FROM addresses WHERE user_id = ? ORDER BY is_default DESC, id DESC`,
      [userId]
    );

    const addresses: AdminCustomerAddress[] = addressRows.map((a: any) => ({
      id: Number(a.id),
      userId: Number(a.user_id),
      customerName: String(a.customer_name || row.name),
      phone: String(a.phone || row.phone || ''),
      email: a.email ? String(a.email) : null,
      tag: String(a.tag || 'Home'),
      houseDetails: String(a.house_details || ''),
      streetArea: String(a.street_area || ''),
      landmark: a.landmark ? String(a.landmark) : null,
      city: String(a.city || ''),
      state: String(a.state || ''),
      pincode: String(a.pincode || ''),
      country: String(a.country || 'India'),
      isDefault: Boolean(a.is_default),
      createdAt: a.created_at instanceof Date ? a.created_at.toISOString() : String(a.created_at),
      updatedAt: a.updated_at instanceof Date ? a.updated_at.toISOString() : String(a.updated_at)
    }));

    // Fetch order statistics
    const [orderStatsRows] = await pool.query<RowDataPacket[]>(
      `
      SELECT 
        COUNT(id) AS total_orders,
        SUM(CASE WHEN LOWER(order_status) = 'delivered' THEN 1 ELSE 0 END) AS completed_orders,
        SUM(CASE WHEN LOWER(order_status) IN ('pending', 'confirmed', 'processing', 'shipped') THEN 1 ELSE 0 END) AS pending_orders,
        SUM(CASE WHEN LOWER(order_status) = 'cancelled' THEN 1 ELSE 0 END) AS cancelled_orders,
        COALESCE(SUM(
          CASE 
            WHEN LOWER(payment_status) = 'paid' 
                 OR LOWER(order_status) IN ('processing', 'shipped', 'delivered') 
            THEN total_price 
            ELSE 0 
          END
        ), 0) AS total_spent,
        MAX(created_at) AS latest_order_date
      FROM orders
      WHERE user_id = ?
      `,
      [userId]
    );

    const statsRow = orderStatsRows[0] || {};
    const stats: AdminCustomerOrderSummary = {
      totalOrders: Number(statsRow.total_orders || 0),
      completedOrders: Number(statsRow.completed_orders || 0),
      pendingOrders: Number(statsRow.pending_orders || 0),
      cancelledOrders: Number(statsRow.cancelled_orders || 0),
      totalSpent: Number(Number(statsRow.total_spent || 0).toFixed(2)),
      latestOrderDate: statsRow.latest_order_date
        ? (statsRow.latest_order_date instanceof Date ? statsRow.latest_order_date.toISOString() : String(statsRow.latest_order_date))
        : null
    };

    // Fetch up to 10 recent orders
    const [recentOrderRows] = await pool.query<RowDataPacket[]>(
      `SELECT id, order_reference, total_price, order_status, payment_status, payment_method, created_at
       FROM orders
       WHERE user_id = ?
       ORDER BY id DESC
       LIMIT 10`,
      [userId]
    );

    const recentOrders = recentOrderRows.map((o: any) => ({
      id: Number(o.id),
      orderReference: String(o.order_reference || `ORD-${o.id}`),
      totalPrice: Number(o.total_price || 0),
      orderStatus: String(o.order_status || 'Pending'),
      paymentStatus: String(o.payment_status || 'Pending'),
      paymentMethod: String(o.payment_method || 'COD'),
      createdAt: o.created_at instanceof Date ? o.created_at.toISOString() : String(o.created_at)
    }));

    return {
      id: userId,
      _id: userId,
      customerId: `CUST-${userId}`,
      userUuid: String(row.user_uuid || ''),
      name: String(row.name || 'Anonymous'),
      email: String(row.email || ''),
      phone: String(row.phone || ''),
      gender: row.gender ? String(row.gender) : null,
      avatarUrl: row.avatar_url ? String(row.avatar_url) : null,
      preferences: row.preferences ? (typeof row.preferences === 'string' ? row.preferences : JSON.stringify(row.preferences)) : null,
      newsletterSubscribed: Boolean(row.newsletter_subscribed),
      smsUpdates: Boolean(row.sms_updates),
      status: AdminCustomerRepository.normalizeStatus(rawStatus),
      rawStatus,
      createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
      updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
      addresses,
      stats,
      recentOrders
    };
  }

  /**
   * Find orders for a customer with pagination
   */
  public static async findCustomerOrders(
    userId: number,
    page: number = 1,
    limit: number = 10
  ): Promise<{ orders: any[]; pagination: { page: number; limit: number; total: number; totalPages: number } }> {
    const countSql = `SELECT COUNT(*) AS total FROM orders WHERE user_id = ?`;
    const [countRows] = await pool.query<RowDataPacket[]>(countSql, [userId]);
    const total = Number(countRows[0]?.total || 0);

    const safePage = Math.max(1, page);
    const safeLimit = Math.max(1, Math.min(100, limit));
    const offset = (safePage - 1) * safeLimit;
    const totalPages = Math.ceil(total / safeLimit) || 1;

    const fetchSql = `
      SELECT id, order_reference, customer_name, phone, email, address, city, state, pincode,
             subtotal, shipping_fee, discount_amount, total_price, order_status, payment_status,
             payment_method, courier_name, tracking_number, created_at, updated_at
      FROM orders
      WHERE user_id = ?
      ORDER BY id DESC
      LIMIT ? OFFSET ?
    `;

    const [rows] = await pool.query<RowDataPacket[]>(fetchSql, [userId, safeLimit, offset]);

    const orders = rows.map((o: any) => ({
      id: Number(o.id),
      orderId: String(o.order_reference || `ORD-${o.id}`),
      orderReference: String(o.order_reference || `ORD-${o.id}`),
      totalPrice: Number(o.total_price || 0),
      orderStatus: String(o.order_status || 'Pending'),
      paymentStatus: String(o.payment_status || 'Pending'),
      paymentMethod: String(o.payment_method || 'COD'),
      itemsCount: 1,
      createdAt: o.created_at instanceof Date ? o.created_at.toISOString() : String(o.created_at)
    }));

    return {
      orders,
      pagination: {
        page: safePage,
        limit: safeLimit,
        total,
        totalPages
      }
    };
  }

  /**
   * Update customer status
   */
  public static async updateCustomerStatus(
    idOrUuid: string | number,
    status: CustomerAccountStatus
  ): Promise<AdminCustomerDetails | null> {
    const isNumeric = !isNaN(Number(idOrUuid));
    const whereSql = isNumeric ? 'id = ?' : 'user_uuid = ? OR id = ?';
    const params = isNumeric ? [status, Number(idOrUuid)] : [status, String(idOrUuid), Number(String(idOrUuid).replace(/^CUST-/i, '')) || 0];

    const updateSql = `UPDATE users SET account_status = ?, updated_at = NOW() WHERE ${whereSql}`;
    const [result] = await pool.query<ResultSetHeader>(updateSql, params);

    if (result.affectedRows === 0) {
      return null;
    }

    return AdminCustomerRepository.findCustomerById(idOrUuid);
  }

  /**
   * Export customers list without pagination
   */
  public static async exportCustomers(params: AdminCustomerQueryParams): Promise<AdminCustomerListItem[]> {
    const exportResult = await AdminCustomerRepository.findCustomers({
      ...params,
      page: 1,
      limit: 10000
    });
    return exportResult.customers;
  }
}
