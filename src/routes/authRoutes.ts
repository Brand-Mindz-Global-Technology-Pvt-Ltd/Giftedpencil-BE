import { Router } from 'express';
import { AuthController } from '../controllers/authController';
import { authMiddleware } from '../middleware/authMiddleware';
import { authRateLimiter } from '../middleware/rateLimitMiddleware';

const router = Router();

// POST /api/auth/register - Register new account (Rate Limited)
router.post('/register', authRateLimiter, AuthController.register);

// POST /api/auth/login - Log in with email & password (Rate Limited)
router.post('/login', authRateLimiter, AuthController.login);

// POST /api/auth/logout - Revoke active JWT
router.post('/logout', authMiddleware, AuthController.logout);

// POST /api/auth/forgot-password - Generate password reset token (Rate Limited)
router.post('/forgot-password', authRateLimiter, AuthController.forgotPassword);

// POST /api/auth/reset-password - Reset password using token (Rate Limited)
router.post('/reset-password', authRateLimiter, AuthController.resetPassword);

// GET /api/auth/me - Get current authenticated user details
router.get('/me', authMiddleware, AuthController.getMe);

export default router;
