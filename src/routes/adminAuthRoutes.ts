import { Router } from 'express';
import { AdminController } from '../controllers/adminController';
import { adminAuthMiddleware, requireAdminRole } from '../middleware/adminAuthMiddleware';
import { avatarUpload, handleAvatarUpload } from '../middleware/avatarUploadMiddleware';
import { authRateLimiter } from '../middleware/rateLimitMiddleware';

const router = Router();

// Public Admin Auth Routes (Rate Limited)
router.post('/login', authRateLimiter, AdminController.login);
router.post('/forgot-password', authRateLimiter, AdminController.forgotPassword);

// Protected Admin Auth Routes (Only existing superadmins can register new admin staff)
router.post('/register', adminAuthMiddleware, requireAdminRole('superadmin'), AdminController.register);
router.post('/logout', adminAuthMiddleware, AdminController.logout);

// Profile & Password routes
router.get('/profile/:id', adminAuthMiddleware, AdminController.getProfile);
router.get('/:adminId/profile', adminAuthMiddleware, AdminController.getProfile);
router.put('/profile/:id', adminAuthMiddleware, handleAvatarUpload(avatarUpload.single('profileImage')), AdminController.updateProfile);
router.put('/:adminId/profile', adminAuthMiddleware, handleAvatarUpload(avatarUpload.single('profileImage')), AdminController.updateProfile);
router.put('/change-password', authRateLimiter, adminAuthMiddleware, AdminController.changePassword);
router.put('/:adminId/change-password', authRateLimiter, adminAuthMiddleware, AdminController.changePassword);

export default router;
