import { Request, Response } from 'express';
import { WishlistService } from '../services/wishlistService';
import { WishlistValidator } from '../validators/wishlistValidator';

/**
 * Helper to safely extract integer user ID from authenticated request
 */
function getAuthenticatedUserId(req: Request): number {
  if (!req.user || !req.user.id) {
    const err: any = new Error('Authentication required. Please provide a valid Bearer token.');
    err.statusCode = 401;
    throw err;
  }
  const numId = Number(String(req.user.id).replace(/\D/g, ''));
  if (isNaN(numId) || numId <= 0) {
    const err: any = new Error('Invalid authenticated user identification.');
    err.statusCode = 401;
    throw err;
  }
  return numId;
}

export class WishlistController {
  /**
   * GET /api/wishlist
   * Return full wishlist summary for authenticated user
   */
  public static getWishlist = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = getAuthenticatedUserId(req);
      const wishlist = await WishlistService.getWishlistSummary(userId);
      res.status(200).json({
        status: 'success',
        data: {
          wishlist
        },
        wishlist
      });
    } catch (error: any) {
      const statusCode = error.statusCode || 500;
      res.status(statusCode).json({
        status: 'error',
        message: error.message || 'Failed to retrieve wishlist'
      });
    }
  };

  /**
   * POST /api/wishlist
   * Add a product to the authenticated user's wishlist
   */
  public static addToWishlist = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = getAuthenticatedUserId(req);
      const validation = WishlistValidator.validateAddItem(req.body);
      if (!validation.isValid) {
        res.status(400).json({
          status: 'error',
          message: 'Invalid wishlist payload',
          errors: validation.errors
        });
        return;
      }

      const rawId = req.body.product_id !== undefined ? req.body.product_id : req.body.productId;
      const productId = Number(rawId);

      const result = await WishlistService.addToWishlist(userId, productId);

      res.status(201).json({
        status: 'success',
        message: result.message,
        data: {
          item: result.item,
          wishlist: result.wishlist
        },
        item: result.item,
        wishlist: result.wishlist
      });
    } catch (error: any) {
      const statusCode = error.statusCode || 400;
      res.status(statusCode).json({
        status: 'error',
        message: error.message || 'Failed to add item to wishlist'
      });
    }
  };

  /**
   * DELETE /api/wishlist/:productId
   * Remove a single item from the authenticated user's wishlist
   */
  public static removeFromWishlist = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = getAuthenticatedUserId(req);
      const validation = WishlistValidator.validateProductId(req.params.productId);
      if (!validation.isValid) {
        res.status(400).json({
          status: 'error',
          message: 'Invalid product ID parameter',
          errors: validation.errors
        });
        return;
      }

      const productId = Number(req.params.productId);
      const result = await WishlistService.removeFromWishlist(userId, productId);

      res.status(200).json({
        status: 'success',
        message: result.message,
        data: {
          wishlist: result.wishlist
        },
        wishlist: result.wishlist
      });
    } catch (error: any) {
      const statusCode = error.statusCode || 400;
      res.status(statusCode).json({
        status: 'error',
        message: error.message || 'Failed to remove item from wishlist'
      });
    }
  };

  /**
   * DELETE /api/wishlist
   * Clear all items from the authenticated user's wishlist
   */
  public static clearWishlist = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = getAuthenticatedUserId(req);
      const result = await WishlistService.clearWishlist(userId);

      res.status(200).json({
        status: 'success',
        message: result.message,
        data: {
          wishlist: result.wishlist
        },
        wishlist: result.wishlist
      });
    } catch (error: any) {
      const statusCode = error.statusCode || 500;
      res.status(statusCode).json({
        status: 'error',
        message: error.message || 'Failed to clear wishlist'
      });
    }
  };

  /**
   * POST /api/wishlist/move-to-cart/:productId
   * Move item from wishlist to cart for authenticated user
   */
  public static moveToCart = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = getAuthenticatedUserId(req);
      const validation = WishlistValidator.validateProductId(req.params.productId);
      if (!validation.isValid) {
        res.status(400).json({
          status: 'error',
          message: 'Invalid product ID parameter',
          errors: validation.errors
        });
        return;
      }

      const productId = Number(req.params.productId);
      const quantity = req.body?.quantity !== undefined ? Number(req.body.quantity) : 1;

      const result = await WishlistService.moveToCart(userId, productId, quantity);

      res.status(200).json({
        status: 'success',
        message: result.message,
        data: {
          cart: result.cart,
          wishlist: result.wishlist
        },
        cart: result.cart,
        wishlist: result.wishlist
      });
    } catch (error: any) {
      const statusCode = error.statusCode || 400;
      res.status(statusCode).json({
        status: 'error',
        message: error.message || 'Failed to move item to cart'
      });
    }
  };
}
