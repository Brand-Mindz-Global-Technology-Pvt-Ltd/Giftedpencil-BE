import { PaymentOrder, PaymentVerificationResult } from '../types';
import { CartService } from './cartService';
import { PaymentValidator } from '../validators/paymentValidator';
import { OrderRepository } from '../repositories/orderRepository';
import { PaymentRepository } from '../repositories/paymentRepository';

export class PaymentService {
  /**
   * Returns supported payment methods
   * Supports: Cards, UPI, Net Banking, Wallets (COD is strictly disabled)
   */
  public static getPaymentMethods() {
    return {
      cod_supported: false,
      online_payment_supported: true,
      available_methods: [
        {
          id: 'cards',
          name: 'Credit & Debit Cards (Visa, MasterCard, RuPay)',
          type: 'ONLINE',
          processing_fee: 0,
          description: '256-bit encrypted online card processing.'
        },
        {
          id: 'upi',
          name: 'Instant UPI (Google Pay, PhonePe, Paytm, BHIM)',
          type: 'ONLINE',
          processing_fee: 0,
          description: 'Instant zero-fee payment directly from your bank account.'
        },
        {
          id: 'netbanking',
          name: 'Net Banking (50+ Major Indian Banks)',
          type: 'ONLINE',
          processing_fee: 0,
          description: 'Secure direct net banking gateway.'
        },
        {
          id: 'wallets',
          name: 'Digital Wallets (Paytm, Mobikwik, Amazon Pay)',
          type: 'ONLINE',
          processing_fee: 0,
          description: 'Quick one-tap checkout using digital wallet balance.'
        }
      ],
      disclaimer: 'Cash on Delivery (COD) is disabled. All orders require secure online prepayment.'
    };
  }

  /**
   * Create a simulated payment order with strict ownership and replay validation
   */
  public static async createPaymentOrder(
    payload: {
      payment_method?: string;
      amount?: number;
      order_id?: string;
      order_reference?: string;
      address_id?: string;
      phone?: string;
    },
    userId?: string
  ): Promise<{ success: boolean; payment_order: PaymentOrder }> {
    // 1. Validate COD rejection
    const validation = PaymentValidator.validatePaymentCreation(payload);
    if (!validation.isValid) {
      const err: any = new Error('Payment creation validation failed');
      err.errors = validation.errors;
      throw err;
    }

    let resolvedAmount: number;
    let targetOrderRef: string | undefined = undefined;
    let targetOrderId: string | undefined = undefined;
    let orderOwnerId: string | undefined = userId;

    const orderIdentifier = payload.order_id || payload.order_reference;
    if (orderIdentifier) {
      // Look up order in MySQL
      const existingOrder = await OrderRepository.findByIdOrReference(orderIdentifier);

      if (!existingOrder) {
        const err: any = new Error(`Order with identifier "${orderIdentifier}" not found.`);
        err.statusCode = 404;
        throw err;
      }

      // Check if order is already paid - prevent duplicate payment creation
      if (existingOrder.payment_status === 'Paid') {
        const err: any = new Error('This order has already been paid for. Duplicate payment creation is not allowed.');
        err.statusCode = 400;
        throw err;
      }

      // Ownership enforcement:
      if (existingOrder.user_id) {
        // Authenticated user order: must match the authenticated user
        if (!userId) {
          const err: any = new Error('Authentication required to pay for this order.');
          err.statusCode = 401;
          throw err;
        }
        const cleanOrderUserId = String(existingOrder.user_id).replace(/\D/g, '');
        const cleanReqUserId = String(userId).replace(/\D/g, '');
        if (cleanOrderUserId && cleanReqUserId ? cleanOrderUserId !== cleanReqUserId : existingOrder.user_id !== userId) {
          const err: any = new Error('Access denied. You cannot initiate payment for another user\'s order.');
          err.statusCode = 403;
          throw err;
        }
        orderOwnerId = String(existingOrder.user_id);
      } else {
        // Guest order: verify guest ownership via phone if provided
        if (payload.phone) {
          const inputClean = payload.phone.replace(/[\s-]/g, '').slice(-10);
          const orderClean = existingOrder.phone.replace(/[\s-]/g, '').slice(-10);
          if (inputClean !== orderClean) {
            const err: any = new Error('Access denied. Provided phone number does not match guest order.');
            err.statusCode = 403;
            throw err;
          }
        }
      }

      // Server-side amount validation against order total
      if (payload.amount !== undefined) {
        const clientAmount = Number(payload.amount);
        if (clientAmount !== existingOrder.total_price) {
          const err: any = new Error(
            `Payment amount (₹${clientAmount}) does not match server-side order total (₹${existingOrder.total_price}).`
          );
          err.statusCode = 400;
          throw err;
        }
      }

      resolvedAmount = existingOrder.total_price;
      targetOrderRef = existingOrder.order_reference;
      targetOrderId = existingOrder.id;
    } else {
      // Ad-hoc payment (e.g. direct amount or cart checkout)
      if (payload.amount !== undefined) {
        resolvedAmount = Number(payload.amount);
      } else {
        const cart = await CartService.getCartSummaryAsync(userId ? { userId: Number(userId) } : undefined);
        resolvedAmount = cart.grand_total;
      }
    }

    if (resolvedAmount <= 0) {
      const err: any = new Error('Order amount must be greater than zero to initiate payment.');
      err.statusCode = 400;
      throw err;
    }

    const orderId = targetOrderId || `SIM-ORD-${Date.now().toString().slice(-6)}`;
    const txnId = `SIM-TXN-${Date.now().toString().slice(-8)}`;

    const numUserId = orderOwnerId ? Number(String(orderOwnerId).replace(/\D/g, '')) : null;
    const numOrderId = targetOrderId ? Number(String(targetOrderId).replace(/\D/g, '')) : null;

    // Persist payment in MySQL
    const paymentOrder: PaymentOrder = await PaymentRepository.createPayment({
      transaction_id: txnId,
      order_id: numOrderId && numOrderId > 0 ? numOrderId : null,
      order_reference: targetOrderRef || orderId,
      user_id: numUserId && numUserId > 0 ? numUserId : null,
      payment_method: payload.payment_method || 'ONLINE_UPI',
      amount: resolvedAmount,
      currency: 'INR',
      payment_status: 'PENDING',
      is_simulation: true,
      simulation_note: 'TEST / SIMULATED ENVIRONMENT ONLY: No real bank account will be charged and no real money will be transferred.'
    });

    return {
      success: true,
      payment_order: paymentOrder
    };
  }

  /**
   * Verify a simulated payment response with replay and ownership checks
   */
  public static async verifyPayment(
    payload: {
      transaction_id: string;
      simulate_status?: 'SUCCESS' | 'FAILED';
      phone?: string;
    },
    userId?: string
  ): Promise<{ success: boolean; verification: PaymentVerificationResult }> {
    const validation = PaymentValidator.validatePaymentVerification(payload);
    if (!validation.isValid) {
      const err: any = new Error('Payment verification validation failed');
      err.errors = validation.errors;
      throw err;
    }

    // Look up in MySQL
    const dbPaymentRecord = await PaymentRepository.findByTransactionId(payload.transaction_id);
    const existingPayment = dbPaymentRecord?.order;

    if (!existingPayment) {
      const err: any = new Error(`Payment order with transaction ID "${payload.transaction_id}" not found.`);
      err.statusCode = 404;
      throw err;
    }

    // Replay prevention: do not allow re-verifying an already successful transaction
    if (existingPayment.payment_status === 'SIMULATED_SUCCESS' || (dbPaymentRecord && dbPaymentRecord.raw.payment_status === 'SUCCESS')) {
      const err: any = new Error(
        `Payment transaction "${payload.transaction_id}" has already been verified and processed. Replay is not permitted.`
      );
      err.statusCode = 400;
      throw err;
    }

    // Ownership check on payment:
    if (existingPayment.user_id) {
      if (!userId) {
        const err: any = new Error('Authentication required to verify this payment.');
        err.statusCode = 401;
        throw err;
      }
      const cleanPayUser = String(existingPayment.user_id).replace(/\D/g, '');
      const cleanReqUser = String(userId).replace(/\D/g, '');
      if (cleanPayUser && cleanReqUser ? cleanPayUser !== cleanReqUser : existingPayment.user_id !== userId) {
        const err: any = new Error('Access denied. You cannot verify payment for another user\'s order.');
        err.statusCode = 403;
        throw err;
      }
    }

    const orderIdentifier = existingPayment.order_reference || existingPayment.order_id;
    const targetOrder = orderIdentifier ? await OrderRepository.findByIdOrReference(orderIdentifier) : null;

    if (targetOrder) {
      // Replay check on target order
      if (targetOrder.payment_status === 'Paid') {
        const err: any = new Error('Order is already marked as Paid. Replay verification rejected.');
        err.statusCode = 400;
        throw err;
      }

      if (targetOrder.user_id) {
        if (!userId) {
          const err: any = new Error('Authentication required to verify payment for this order.');
          err.statusCode = 401;
          throw err;
        }
        const cleanOrderUser = String(targetOrder.user_id).replace(/\D/g, '');
        const cleanReqUser = String(userId).replace(/\D/g, '');
        if (cleanOrderUser && cleanReqUser ? cleanOrderUser !== cleanReqUser : targetOrder.user_id !== userId) {
          const err: any = new Error('Access denied. You cannot verify payment for another user\'s order.');
          err.statusCode = 403;
          throw err;
        }
      } else if (payload.phone) {
        // Guest order phone check
        const inputClean = payload.phone.replace(/[\s-]/g, '').slice(-10);
        const orderClean = targetOrder.phone.replace(/[\s-]/g, '').slice(-10);
        if (inputClean !== orderClean) {
          const err: any = new Error('Access denied. Provided phone number does not match guest order.');
          err.statusCode = 403;
          throw err;
        }
      }
    }

    const isSuccess = payload.simulate_status !== 'FAILED';
    const newStatus = isSuccess ? 'SIMULATED_SUCCESS' : 'SIMULATED_FAILED';
    const dbStatus = isSuccess ? 'SUCCESS' : 'FAILED';

    // Atomically update Payment status and Order status in MySQL transaction
    try {
      await PaymentRepository.updateStatusWithOrder(
        payload.transaction_id,
        dbStatus,
        targetOrder ? (targetOrder.id || targetOrder.order_reference) : undefined
      );
    } catch (dbErr: any) {
      console.warn('[PaymentService] MySQL updateStatusWithOrder failed, maintaining fallback:', dbErr.message);
      if (dbErr.message?.includes('already been verified')) {
        const err: any = new Error(dbErr.message);
        err.statusCode = 400;
        throw err;
      }
    }

    const result: PaymentVerificationResult = {
      transaction_id: existingPayment.transaction_id,
      order_id: existingPayment.order_id,
      payment_status: newStatus,
      amount_received: isSuccess ? existingPayment.amount : 0,
      currency: existingPayment.currency,
      is_simulation: true,
      verified_at: new Date().toISOString(),
      note:
        'TEST / SIMULATED RESULT: This response is strictly for local integration testing. Real payment gateway credentials have not been configured yet.'
    };

    return {
      success: isSuccess,
      verification: result
    };
  }
}
