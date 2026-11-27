import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { PaymentService } from '../services/paymentService';
import { JwtUserPayload } from '../types/auth';

const JWT_SECRET: string = process.env.JWT_SECRET || 'the-gifted-pencil-dev-secret-key-2026';

function extractUserId(req: Request): string | undefined {
  if (req.user?.id) {
    return req.user.id;
  }
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1]?.trim();
    if (token) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET) as JwtUserPayload;
        return decoded.userId;
      } catch {
        // invalid token
      }
    }
  }
  return undefined;
}

export class PaymentController {
  /**
   * GET /api/payment/methods
   * Return supported online payment methods
   */
  public static getMethods = (_req: Request, res: Response): void => {
    const methods = PaymentService.getPaymentMethods();
    res.status(200).json({
      status: 'success',
      data: methods
    });
  };

  /**
   * POST /api/payment/create-order
   * Create simulated payment order
   */
  public static createOrder = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = extractUserId(req);
      const result = await PaymentService.createPaymentOrder(req.body, userId);
      res.status(201).json({
        status: 'success',
        message: 'Simulated payment order created.',
        data: {
          payment_order: result.payment_order
        },
        payment_order: result.payment_order
      });
    } catch (error: any) {
      if (error.errors) {
        res.status(400).json({
          status: 'error',
          message: error.errors[0]?.message || 'Payment order validation failed.',
          errors: error.errors
        });
        return;
      }
      const statusCode = error.statusCode || 400;
      res.status(statusCode).json({
        status: 'error',
        message: error.message || 'Failed to create payment order'
      });
    }
  };

  /**
   * POST /api/payment/verify
   * Verify simulated payment
   */
  public static verifyPayment = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = extractUserId(req);
      const result = await PaymentService.verifyPayment(req.body, userId);
      res.status(200).json({
        status: 'success',
        message: 'Payment verification completed (SIMULATION).',
        data: {
          verification: result.verification
        },
        verification: result.verification
      });
    } catch (error: any) {
      if (error.errors) {
        res.status(400).json({
          status: 'error',
          message: error.errors[0]?.message || 'Payment verification validation failed.',
          errors: error.errors
        });
        return;
      }
      const statusCode = error.statusCode || 400;
      res.status(statusCode).json({
        status: 'error',
        message: error.message || 'Payment verification failed'
      });
    }
  };
}
