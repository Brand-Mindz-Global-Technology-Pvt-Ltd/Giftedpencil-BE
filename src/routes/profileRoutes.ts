import { Router } from 'express';
import { ProfileController } from '../controllers/profileController';
import { authMiddleware } from '../middleware/authMiddleware';
import { authRateLimiter } from '../middleware/rateLimitMiddleware';

const router = Router();

// All profile endpoints require valid JWT authentication
router.use(authMiddleware);

// GET /api/profile - View authenticated user profile
router.get('/', ProfileController.getProfile);

// PUT /api/profile - Update authenticated user profile
router.put('/', ProfileController.updateProfile);

// PUT /api/profile/password - Change authenticated user password (Rate Limited)
router.put('/password', authRateLimiter, ProfileController.changePassword);

export default router;
