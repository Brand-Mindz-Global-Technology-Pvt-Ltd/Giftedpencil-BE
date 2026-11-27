import { Router } from 'express';
import { AdminSettingsController } from '../controllers/adminSettingsController';

const router = Router();

// Public customer-facing policy read-only route
router.get('/:type', AdminSettingsController.getPublicPolicy);

export default router;
