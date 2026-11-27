import { Router } from 'express';
import { OrderController } from '../controllers/orderController';
import { authMiddleware } from '../middleware/authMiddleware';

const router = Router();

// 1. My Orders (Authenticated user order history)
router.get('/my-orders', authMiddleware, OrderController.getMyOrders);

// 2. Track Order (Public tracking with optional phone verification)
router.get('/track/:orderRef', OrderController.trackOrder);

// 3. Multi-item cart checkout (Supports authenticated user or guest checkout)
router.post('/checkout', OrderController.checkoutOrder);

// 4. Legacy quick-order single product placement
router.post('/', OrderController.placeOrder);

// 5. Payment verification for an order
router.post('/verify-payment', OrderController.verifyPayment);

// 6. Order details by ID (authenticated)
router.get('/:id', authMiddleware, OrderController.getOrderDetails);

export default router;
