import { Router } from 'express';
import { AdminOrderController } from '../controllers/adminOrderController';
import { adminAuthMiddleware } from '../middleware/adminAuthMiddleware';

const router = Router();

// Apply admin authentication to all Admin order routes
router.use(adminAuthMiddleware);

// 1. List orders with pagination, search, status filter, and sorting
router.get('/', AdminOrderController.listOrders);

// 2. Export orders to CSV (placed before /:orderId to prevent parameter match)
router.get('/export', AdminOrderController.exportOrders);

// 3. Cancel order
router.post('/:orderId/cancel', AdminOrderController.cancelOrder);

// 4. Update order status (Pending, Confirmed, Processing, Shipped, Delivered, Cancelled)
router.patch('/:orderId/status', AdminOrderController.updateOrderStatus);

// 5. Retrieve single order details by numeric ID or order reference string
router.get('/:orderId', AdminOrderController.getOrderById);

export default router;
