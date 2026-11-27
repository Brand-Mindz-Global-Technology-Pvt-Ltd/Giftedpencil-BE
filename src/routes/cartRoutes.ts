import { Router } from 'express';
import { CartController } from '../controllers/cartController';

const router = Router();

// GET /api/cart - Fetch cart summary with server-calculated totals
router.get('/', CartController.getCart);

// POST /api/cart/items - Add product to cart with price & stock verification
router.post('/items', CartController.addToCart);

// PUT /api/cart/items/:id - Update product quantity
router.put('/items/:id', CartController.updateQuantity);

// DELETE /api/cart/items/:id - Remove product from cart
router.delete('/items/:id', CartController.removeFromCart);

// DELETE /api/cart - Clear all items
router.delete('/', CartController.clearCart);

export default router;
