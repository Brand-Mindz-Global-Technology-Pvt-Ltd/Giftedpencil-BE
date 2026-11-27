import pool from '../config/db';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { PaymentOrder, PaymentVerificationResult } from '../types';

export interface CreatePaymentParams {
  transaction_id: string;
  order_id?: number | null;
  order_reference?: string;
  user_id?: number | null;
  gateway_name?: string;
  gateway_order_id?: string | null;
  gateway_payment_id?: string | null;
  payment_method: string;
  amount: number;
  currency?: string;
  payment_status?: 'PENDING' | 'SUCCESS' | 'FAILED' | 'REFUNDED';
  is_simulation?: boolean;
  simulation_note?: string | null;
  raw_response?: any;
}

export class PaymentRepository {
  /**
   * Parse numeric ID
   */
  public static parseNumericId(val: number | string | undefined | null): number {
    if (val === undefined || val === null) return 0;
    if (typeof val === 'number') return val;
    const num = Number(String(val).replace(/\D/g, ''));
    return isNaN(num) ? 0 : num;
  }

  /**
   * Map MySQL row to PaymentOrder domain object
   */
  public static mapRowToPaymentOrder(row: any): PaymentOrder {
    return {
      order_id: row.order_id ? String(row.order_id) : (row.gateway_order_id || `SIM-ORD-${row.id}`),
      transaction_id: row.transaction_id,
      user_id: row.user_id ? String(row.user_id) : undefined,
      order_reference: row.order_reference || undefined,
      amount: Number(row.amount),
      currency: row.currency || 'INR',
      payment_method: row.payment_method,
      payment_status: row.payment_status === 'SUCCESS' ? 'SIMULATED_SUCCESS' :
                     row.payment_status === 'FAILED' ? 'SIMULATED_FAILED' : 'PENDING_SIMULATION',
      is_simulation: Boolean(row.is_simulation),
      simulation_note: row.simulation_note || undefined,
      created_at: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString()
    };
  }

  /**
   * Create and persist a payment record
   */
  public static async createPayment(params: CreatePaymentParams): Promise<PaymentOrder> {
    const sql = `
      INSERT INTO payments (
        transaction_id, order_id, order_reference, user_id,
        gateway_name, gateway_order_id, gateway_payment_id,
        payment_method, amount, currency, payment_status,
        is_simulation, simulation_note, raw_response
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const gatewayName = params.gateway_name || 'SIMULATED';
    const currency = params.currency || 'INR';
    const paymentStatus = params.payment_status || 'PENDING';
    const isSimulation = params.is_simulation !== undefined ? (params.is_simulation ? 1 : 0) : 1;
    const rawResponseJson = params.raw_response ? JSON.stringify(params.raw_response) : null;

    const [result] = await pool.query<ResultSetHeader>(sql, [
      params.transaction_id,
      params.order_id || null,
      params.order_reference || (params.order_id ? `ORD-${params.order_id}` : 'UNKNOWN'),
      params.user_id || null,
      gatewayName,
      params.gateway_order_id || null,
      params.gateway_payment_id || null,
      params.payment_method,
      params.amount,
      currency,
      paymentStatus,
      isSimulation,
      params.simulation_note || null,
      rawResponseJson
    ]);

    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT * FROM payments WHERE id = ? LIMIT 1',
      [result.insertId]
    );

    return this.mapRowToPaymentOrder(rows[0]);
  }

  /**
   * Find payment by transaction ID
   */
  public static async findByTransactionId(transactionId: string): Promise<{ raw: any; order: PaymentOrder } | null> {
    if (!transactionId || !transactionId.trim()) return null;

    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT * FROM payments WHERE transaction_id = ? LIMIT 1',
      [transactionId.trim()]
    );

    if (rows.length === 0) return null;

    return {
      raw: rows[0],
      order: this.mapRowToPaymentOrder(rows[0])
    };
  }

  /**
   * Find payment by order reference or ID
   */
  public static async findByOrderReference(orderReference: string): Promise<PaymentOrder[]> {
    if (!orderReference || !orderReference.trim()) return [];

    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT * FROM payments WHERE order_reference = ? ORDER BY id DESC',
      [orderReference.trim()]
    );

    return rows.map(r => this.mapRowToPaymentOrder(r));
  }

  /**
   * Update payment status and atomically update order status within a transaction
   */
  public static async updateStatusWithOrder(
    transactionId: string,
    status: 'SUCCESS' | 'FAILED',
    orderIdOrRef?: string | number
  ): Promise<PaymentOrder> {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // Check payment exists and lock it
      const [payRows] = await connection.query<RowDataPacket[]>(
        'SELECT * FROM payments WHERE transaction_id = ? FOR UPDATE',
        [transactionId]
      );

      if (payRows.length === 0) {
        throw new Error(`Payment with transaction ID "${transactionId}" not found in database.`);
      }

      const paymentRow = payRows[0];

      if (paymentRow.payment_status === 'SUCCESS') {
        throw new Error(`Payment transaction "${transactionId}" has already been verified and processed. Replay is not permitted.`);
      }

      // Update payment record
      await connection.query(
        `UPDATE payments 
         SET payment_status = ?,
             verified_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE transaction_id = ?`,
        [status, transactionId]
      );

      // If tied to an order, update the order in the exact same transaction
      const targetOrderRef = orderIdOrRef || paymentRow.order_reference || paymentRow.order_id;
      if (targetOrderRef) {
        const orderStatus = status === 'SUCCESS' ? 'Processing' : 'Pending';
        const orderPaymentStatus = status === 'SUCCESS' ? 'Paid' : 'Failed';

        const clean = String(targetOrderRef).trim();
        const numId = Number(clean);

        if (!isNaN(numId) && Number.isInteger(numId) && numId > 0) {
          await connection.query(
            `UPDATE orders 
             SET payment_status = ?,
                 payment_id = COALESCE(?, payment_id),
                 order_status = CASE WHEN ? = 'Paid' THEN 'Processing' ELSE order_status END,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = ? OR order_reference = ?`,
            [orderPaymentStatus, transactionId, orderPaymentStatus, numId, clean]
          );
        } else {
          await connection.query(
            `UPDATE orders 
             SET payment_status = ?,
                 payment_id = COALESCE(?, payment_id),
                 order_status = CASE WHEN ? = 'Paid' THEN 'Processing' ELSE order_status END,
                 updated_at = CURRENT_TIMESTAMP
             WHERE order_reference = ?`,
            [orderPaymentStatus, transactionId, orderPaymentStatus, clean]
          );
        }
      }

      await connection.commit();

      const [updatedRows] = await pool.query<RowDataPacket[]>(
        'SELECT * FROM payments WHERE transaction_id = ? LIMIT 1',
        [transactionId]
      );

      return this.mapRowToPaymentOrder(updatedRows[0]);
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }
}
