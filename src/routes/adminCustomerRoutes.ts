import { Router } from 'express';
import { AdminCustomerController } from '../controllers/adminCustomerController';
import { adminAuthMiddleware } from '../middleware/adminAuthMiddleware';

const router = Router();

// Protect all admin customer endpoints with admin JWT authentication
router.use(adminAuthMiddleware);

// 1. List customers (with pagination, search, status filtering, and sorting)
router.get('/', AdminCustomerController.listCustomers);
router.get('/get-all', AdminCustomerController.listCustomers);

// 2. Export customers to CSV (must come before /:customerId)
router.get('/export', AdminCustomerController.exportCustomers);

// 3. Customer order history
router.get('/:customerId/orders', AdminCustomerController.getCustomerOrders);

// 4. Update customer status
router.patch('/:customerId/status', AdminCustomerController.updateCustomerStatus);

// 5. Get customer details by ID or UUID
router.get('/:customerId', AdminCustomerController.getCustomerById);

export default router;
