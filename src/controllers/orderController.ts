import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { OrderService } from '../services/orderService';
import { resolveCartIdentity } from './cartController';
import { JwtUserPayload } from '../types/auth';

const JWT_SECRET: string = process.env.JWT_SECRET || 'the-gifted-pencil-dev-secret-key-2026';

/**
 * Safely extract authenticated user ID from req.user or Authorization header
 */
function extractUserId(req: Request): string | undefined {
  if (req.user?.id) {
    return String(req.user.id);
  }
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1]?.trim();
    if (token) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET) as JwtUserPayload;
        return decoded.userId ? String(decoded.userId) : undefined;
      } catch {
        // invalid token
      }
    }
  }
  return undefined;
}

export class OrderController {
  /**
   * POST /api/orders
   * Quick single-item order placement (backward compatible with existing frontend & tests)
   */
  public static placeOrder = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = extractUserId(req);
      const result = await OrderService.placeQuickOrder(req.body, userId);
      const o = result.order;

      res.status(201).json({
        status: 'success',
        message: 'Order placed successfully',
        data: {
          order: o
        },
        order: {
          id: o.id,
          order_reference: o.order_reference,
          product_id: o.items[0]?.product_id,
          customer_name: o.customer_name,
          phone: o.phone,
          address: o.address,
          quantity: o.items[0]?.quantity,
          total_price: o.total_price,
          order_status: o.order_status,
          created_at: o.created_at
        }
      });
    } catch (error: any) {
      if (error.errors) {
        res.status(400).json({
          status: 'error',
          message: error.errors[0]?.message || 'Quick order validation failed',
          errors: error.errors
        });
        return;
      }
      const statusCode = error.statusCode || 400;
      res.status(statusCode).json({
        status: 'error',
        message: error.message || 'Failed to place order'
      });
    }
  };

  /**
   * POST /api/orders/checkout
   * Checkout order from cart or multi-item payload
   */
  public static checkoutOrder = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = extractUserId(req);
      const cartIdentity = resolveCartIdentity(req, res);
      const result = await OrderService.checkoutOrder(req.body, userId, cartIdentity);
      const o = result.order;

      res.status(201).json({
        status: 'success',
        message: 'Order placed successfully via checkout.',
        data: {
          order: o
        },
        order: o
      });
    } catch (error: any) {
      if (error.errors) {
        res.status(400).json({
          status: 'error',
          message: error.errors[0]?.message || 'Checkout validation failed',
          errors: error.errors
        });
        return;
      }
      const statusCode = error.statusCode || 400;
      res.status(statusCode).json({
        status: 'error',
        message: error.message || 'Failed to checkout order'
      });
    }
  };

  /**
   * GET /api/orders/my-orders
   * Retrieve order history for authenticated user
   */
  public static getMyOrders = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({
          status: 'error',
          message: 'Authentication required. Please provide a valid Bearer token.'
        });
        return;
      }

      const orders = await OrderService.getUserOrders(String(userId));
      res.status(200).json({
        status: 'success',
        count: orders.length,
        data: {
          orders
        },
        orders
      });
    } catch (error: any) {
      res.status(500).json({
        status: 'error',
        message: error.message || 'Failed to retrieve user orders'
      });
    }
  };

  /**
   * GET /api/orders/:id
   * Retrieve details of a specific order
   */
  public static getOrderDetails = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      const orderId = Array.isArray(req.params.id) ? req.params.id[0] : String(req.params.id);

      const order = await OrderService.getOrderDetails(orderId, userId ? String(userId) : undefined);
      res.status(200).json({
        status: 'success',
        data: {
          order
        },
        order
      });
    } catch (error: any) {
      const statusCode = error.statusCode || 400;
      res.status(statusCode).json({
        status: 'error',
        message: error.message || 'Failed to retrieve order details'
      });
    }
  };

  /**
   * GET /api/orders/track/:orderRef
   * Public order tracking endpoint with mandatory phone verification
   * Sanitizes response to strictly protect customer private information
   */
  public static trackOrder = async (req: Request, res: Response): Promise<void> => {
    try {
      const orderRef = Array.isArray(req.params.orderRef) ? req.params.orderRef[0] : String(req.params.orderRef);
      const rawPhone = typeof req.query.phone === 'string' ? req.query.phone : (req.body?.phone ? String(req.body.phone) : undefined);

      if (!rawPhone || !rawPhone.trim()) {
        res.status(400).json({
          status: 'error',
          message: 'Phone number is required for order tracking verification.'
        });
        return;
      }

      const order = await OrderService.trackOrder(orderRef, rawPhone.trim());

      // Safe public tracking response: Strictly mask/strip customer private details
      const safeTrackingInfo = {
        order_reference: order.order_reference,
        order_status: order.order_status,
        payment_status: order.payment_status,
        payment_method: order.payment_method,
        destination_city: order.delivery_address?.city,
        destination_state: order.delivery_address?.state,
        delivery_city: order.delivery_address?.city,
        delivery_state: order.delivery_address?.state,
        created_at: order.created_at,
        dispatched_at: order.dispatched_at,
        delivered_at: order.delivered_at,
        courier_name: order.courier_name,
        tracking_number: order.tracking_number,
        items: order.items.map(it => ({
          product_name: it.product_name,
          quantity: it.quantity
        }))
      };

      res.status(200).json({
        status: 'success',
        data: {
          tracking: safeTrackingInfo
        },
        order: safeTrackingInfo
      });
    } catch (error: any) {
      const statusCode = error.statusCode || 400;
      res.status(statusCode).json({
        status: 'error',
        message: error.message || 'Failed to retrieve tracking information'
      });
    }
  };

  /**
   * POST /api/orders/verify-payment
   * Verifies online payment transaction with ownership and replay protection
   */
  public static verifyPayment = async (req: Request, res: Response): Promise<void> => {
    try {
      const { order_reference, payment_id, phone } = req.body;
      const userId = extractUserId(req);

      if (!order_reference) {
        res.status(400).json({
          status: 'error',
          message: 'order_reference is required.'
        });
        return;
      }

      if (!payment_id) {
        res.status(400).json({
          status: 'error',
          message: 'Missing payment transaction identifier.'
        });
        return;
      }

      const order = await OrderService.getOrderDetails(order_reference);

      // Replay prevention
      if (order.payment_status === 'Paid') {
        res.status(400).json({
          status: 'error',
          message: 'Order has already been paid. Replay is not permitted.'
        });
        return;
      }

      // Ownership enforcement
      if (order.user_id) {
        if (!userId) {
          res.status(401).json({
            status: 'error',
            message: 'Authentication required to verify payment for this order.'
          });
          return;
        }
        const cleanOrderUser = String(order.user_id).replace(/\D/g, '');
        const cleanReqUser = String(userId).replace(/\D/g, '');
        if (cleanOrderUser !== cleanReqUser) {
          res.status(403).json({
            status: 'error',
            message: 'Access denied. You cannot verify payment for another user\'s order.'
          });
          return;
        }
      } else if (phone) {
        // Guest order phone verification
        const inputClean = String(phone).replace(/[\s-]/g, '').slice(-10);
        const orderClean = order.phone.replace(/[\s-]/g, '').slice(-10);
        if (inputClean !== orderClean) {
          res.status(403).json({
            status: 'error',
            message: 'Access denied. Provided phone number does not match guest order.'
          });
          return;
        }
      }

      const updated = await OrderService.updateOrderPayment(order_reference, 'Paid', payment_id);

      res.status(200).json({
        status: 'success',
        message: 'Payment verified successfully.',
        order_reference: updated?.order_reference || order_reference
      });
    } catch (error: any) {
      const statusCode = error.statusCode || 400;
      res.status(statusCode).json({
        status: 'error',
        message: error.message || 'Payment verification failed.'
      });
    }
  };
}

// Named exports for backward compatibility with existing imports
export const placeOrder = OrderController.placeOrder;
export const checkoutOrder = OrderController.checkoutOrder;
export const trackOrder = OrderController.trackOrder;
export const verifyPayment = OrderController.verifyPayment;
