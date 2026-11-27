import { Router } from 'express';
import { AdminContactController } from '../controllers/adminContactController';
import { adminAuthMiddleware } from '../middleware/adminAuthMiddleware';

const router = Router();

// Protect all admin contact endpoints with admin JWT authentication
router.use(adminAuthMiddleware);

// 1. List enquiries (with pagination, search, status filtering, and sorting)
router.get('/', AdminContactController.listContacts);

// 2. Update enquiry status
router.patch('/:id/status', AdminContactController.updateContactStatus);

// 3. Get single enquiry details
router.get('/:id', AdminContactController.getContactById);

export default router;
