import { Request, Response } from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { CartService } from '../services/cartService';
import { CartValidator } from '../validators/cartValidator';
import { CartIdentity } from '../repositories/cartRepository';
import { JwtUserPayload } from '../types/auth';
import { isTokenBlocked } from '../utils/tokenBlocklist';

const JWT_SECRET: string = process.env.JWT_SECRET || 'the-gifted-pencil-dev-secret-key-2026';

/**
 * Parse raw Cookie header string into key-value pairs
 */
function parseCookies(cookieHeader?: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!cookieHeader) return cookies;
  const pairs = cookieHeader.split(';');
  for (const pair of pairs) {
    const idx = pair.indexOf('=');
    if (idx > 0) {
      const key = pair.substring(0, idx).trim();
      const val = pair.substring(idx + 1).trim();
      try {
        cookies[key] = decodeURIComponent(val);
      } catch {
        cookies[key] = val;
      }
    }
  }
  return cookies;
}

/**
 * Resolve user identity from Authorization Bearer JWT or stable guest session ID
 */
export function resolveCartIdentity(req: Request, res?: Response): CartIdentity {
  // 1. Check if authenticated via existing JWT authentication logic
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1]?.trim();
    if (token && !isTokenBlocked(token)) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET) as JwtUserPayload;
        if (decoded && decoded.userId) {
          const numId = Number(String(decoded.userId).replace(/\D/g, ''));
          if (!isNaN(numId) && numId > 0) {
            return { userId: numId };
          }
        }
      } catch {
        // Token expired or invalid: fall through to guest session
      }
    }
  }

  // 2. Check for guest session cookie (tgp_cart_session)
  const cookies = parseCookies(req.headers.cookie);
  const cookieSessionId = cookies['tgp_cart_session'];

  // 3. Fallback to guest session headers or query parameters
  const headerSessionId = (
    req.headers['x-session-id'] ||
    req.headers['x-guest-session-id'] ||
    req.headers['x-guest-id'] ||
    req.headers['x-cart-session-id'] ||
    req.query.session_id
  );

  let guestSessionId: string;
  let isNewSession = false;

  if (typeof cookieSessionId === 'string' && cookieSessionId.trim()) {
    guestSessionId = cookieSessionId.trim();
  } else if (typeof headerSessionId === 'string' && headerSessionId.trim()) {
    guestSessionId = headerSessionId.trim();
  } else {
    // 4. Generate cryptographically secure random session ID (UUIDv4)
    // Completely eliminates IP+UA collisions; every new visitor receives a unique session
    guestSessionId = `gst_${crypto.randomUUID()}`;
    isNewSession = true;
  }

  // 5. Persist guest session via Set-Cookie and response header
  if (res && !res.headersSent) {
    const isProduction = process.env.NODE_ENV === 'production';
    res.cookie('tgp_cart_session', guestSessionId, {
      httpOnly: true,
      sameSite: isProduction ? 'none' : 'lax',
      secure: isProduction,
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      path: '/'
    });
    res.setHeader('x-session-id', guestSessionId);
  }

  return { guestSessionId };
}

export class CartController {
  /**
   * GET /api/cart
   * Return full cart summary with server-calculated prices from MySQL
   */
  public static getCart = async (req: Request, res: Response): Promise<void> => {
    try {
      const identity = resolveCartIdentity(req, res);
      const cart = await CartService.getCartSummaryAsync(identity);
      res.status(200).json({
        status: 'success',
        cart
      });
    } catch (error: any) {
      res.status(500).json({
        status: 'error',
        message: error.message || 'Failed to retrieve cart'
      });
    }
  };

  /**
   * POST /api/cart/items
   * Add a product to cart with server-side price & stock verification in MySQL
   */
  public static addToCart = async (req: Request, res: Response): Promise<void> => {
    try {
      const validation = CartValidator.validateAddItem(req.body);
      if (!validation.isValid) {
        res.status(400).json({
          status: 'error',
          message: 'Invalid cart payload',
          errors: validation.errors
        });
        return;
      }

      const identity = resolveCartIdentity(req, res);
      const productId = Number(req.body.product_id);
      const quantity = req.body.quantity !== undefined ? Number(req.body.quantity) : 1;

      const result = await CartService.addToCartAsync(productId, quantity, identity);

      res.status(201).json({
        status: 'success',
        message: result.message,
        cart: result.cart
      });
    } catch (error: any) {
      res.status(400).json({
        status: 'error',
        message: error.message || 'Failed to add item to cart'
      });
    }
  };

  /**
   * PUT /api/cart/items/:id
   * Update item quantity in the cart via MySQL
   */
  public static updateQuantity = async (req: Request, res: Response): Promise<void> => {
    try {
      const productId = Number(req.params.id);
      if (isNaN(productId) || productId <= 0) {
        res.status(400).json({
          status: 'error',
          message: 'Invalid product ID in URL parameter'
        });
        return;
      }

      const validation = CartValidator.validateUpdateQuantity(req.body);
      if (!validation.isValid) {
        res.status(400).json({
          status: 'error',
          message: 'Invalid quantity payload',
          errors: validation.errors
        });
        return;
      }

      const identity = resolveCartIdentity(req, res);
      const quantity = Number(req.body.quantity);
      const result = await CartService.updateQuantityAsync(productId, quantity, identity);

      res.status(200).json({
        status: 'success',
        message: result.message,
        cart: result.cart
      });
    } catch (error: any) {
      res.status(400).json({
        status: 'error',
        message: error.message || 'Failed to update item quantity'
      });
    }
  };

  /**
   * DELETE /api/cart/items/:id
   * Remove a product from the cart via MySQL
   */
  public static removeFromCart = async (req: Request, res: Response): Promise<void> => {
    try {
      const productId = Number(req.params.id);
      if (isNaN(productId) || productId <= 0) {
        res.status(400).json({
          status: 'error',
          message: 'Invalid product ID'
        });
        return;
      }

      const identity = resolveCartIdentity(req, res);
      const result = await CartService.removeFromCartAsync(productId, identity);

      res.status(200).json({
        status: 'success',
        message: result.message,
        cart: result.cart
      });
    } catch (error: any) {
      res.status(500).json({
        status: 'error',
        message: error.message || 'Failed to remove item from cart'
      });
    }
  };

  /**
   * DELETE /api/cart
   * Clear all items from the cart via MySQL
   */
  public static clearCart = async (req: Request, res: Response): Promise<void> => {
    try {
      const identity = resolveCartIdentity(req, res);
      const result = await CartService.clearCartAsync(identity);
      res.status(200).json({
        status: 'success',
        message: result.message,
        cart: result.cart
      });
    } catch (error: any) {
      res.status(500).json({
        status: 'error',
        message: error.message || 'Failed to clear cart'
      });
    }
  };
}
