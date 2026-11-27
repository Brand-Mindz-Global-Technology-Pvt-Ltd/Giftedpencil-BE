import { Router } from 'express';
import { AdminInventoryController } from '../controllers/adminInventoryController';
import { adminAuthMiddleware } from '../middleware/adminAuthMiddleware';

const router = Router();

// Protect all admin inventory endpoints with admin JWT authentication
router.use(adminAuthMiddleware);

// 1. List inventory with search, status filtering, category filtering, and sorting
router.get('/', AdminInventoryController.listInventory);
router.get('/products', AdminInventoryController.listInventory); // alias for frontend compatibility

// 2. Update stock quantity
router.patch('/:productId/stock', AdminInventoryController.updateStock);

// 3. Get single product stock details
router.get('/:productId', AdminInventoryController.getProductStock);

export default router;
