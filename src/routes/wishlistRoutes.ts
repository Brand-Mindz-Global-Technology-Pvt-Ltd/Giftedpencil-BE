import { Router } from 'express';
import { WishlistController } from '../controllers/wishlistController';
import { authMiddleware } from '../middleware/authMiddleware';

const router = Router();

// Every Wishlist route strictly requires valid JWT authentication
router.use(authMiddleware);

// GET /api/wishlist - Return all saved wishlist items for authenticated user
router.get('/', WishlistController.getWishlist);

// POST /api/wishlist - Add product to wishlist
router.post('/', WishlistController.addToWishlist);

// POST /api/wishlist/move-to-cart/:productId - Move item to shopping cart
router.post('/move-to-cart/:productId', WishlistController.moveToCart);

// DELETE /api/wishlist/:productId - Remove single product from wishlist
router.delete('/:productId', WishlistController.removeFromWishlist);

// DELETE /api/wishlist - Clear entire wishlist
router.delete('/', WishlistController.clearWishlist);

export default router;
