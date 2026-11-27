import { Router } from 'express';
import { AdminBannerController } from '../controllers/adminBannerController';
import { adminAuthMiddleware } from '../middleware/adminAuthMiddleware';
import { uploadBanner, handleBannerUploadErrors } from '../middleware/bannerUploadMiddleware';

const router = Router();

// All admin banner management routes require admin authentication
router.use(adminAuthMiddleware);

// GET /api/admin/banners - List banners
router.get('/', AdminBannerController.list);

// GET /api/admin/banners/:id - Get banner details
router.get('/:id', AdminBannerController.getById);

// POST /api/admin/banners - Create banner (with optional file upload)
router.post(
  '/',
  handleBannerUploadErrors(uploadBanner.single('image')),
  AdminBannerController.create
);

// PUT /api/admin/banners/:id - Update banner (with optional new file upload)
router.put(
  '/:id',
  handleBannerUploadErrors(uploadBanner.single('image')),
  AdminBannerController.update
);

// PATCH /api/admin/banners/:id/status - Activate / Deactivate banner
router.patch('/:id/status', AdminBannerController.updateStatus);

export default router;
