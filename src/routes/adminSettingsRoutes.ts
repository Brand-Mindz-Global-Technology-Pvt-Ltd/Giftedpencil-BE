import { Router } from 'express';
import { AdminSettingsController } from '../controllers/adminSettingsController';
import { adminAuthMiddleware } from '../middleware/adminAuthMiddleware';
import { logoUpload, handleLogoUpload } from '../middleware/logoUploadMiddleware';

const router = Router();

// Company Settings
router.get('/getcompany/:adminId', adminAuthMiddleware, AdminSettingsController.getCompany);
router.post(
  '/postcompany/:adminId',
  adminAuthMiddleware,
  handleLogoUpload(logoUpload.single('logo')),
  AdminSettingsController.postCompany
);

// Terms & Conditions
router.get('/get-terms/:adminId', adminAuthMiddleware, AdminSettingsController.getTerms);
router.post('/post-terms/:adminId', adminAuthMiddleware, AdminSettingsController.postTerms);

// Privacy Policy
router.get('/get-privacy/:adminId', adminAuthMiddleware, AdminSettingsController.getPrivacy);
router.post('/post-privacy/:adminId', adminAuthMiddleware, AdminSettingsController.postPrivacy);

// Cookie Policy
router.get('/get-cookie/:adminId', adminAuthMiddleware, AdminSettingsController.getCookie);
router.post('/post-cookie/:adminId', adminAuthMiddleware, AdminSettingsController.postCookie);

// Shipping Policy
router.get('/get-shipping/:adminId', adminAuthMiddleware, AdminSettingsController.getShipping);
router.post('/post-shipping/:adminId', adminAuthMiddleware, AdminSettingsController.postShipping);

// Return & Refund Policy
router.get('/get-return-refund/:adminId', adminAuthMiddleware, AdminSettingsController.getReturnRefund);
router.post('/post-return-refund/:adminId', adminAuthMiddleware, AdminSettingsController.postReturnRefund);

export default router;
