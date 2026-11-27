import { Router } from 'express';
import { AdminProductController } from '../controllers/adminProductController';
import { adminAuthMiddleware } from '../middleware/adminAuthMiddleware';
import { upload, handleUploadErrors } from '../middleware/uploadMiddleware';

const router = Router();

// Apply admin authentication to all product operations
router.use(adminAuthMiddleware);

// Multipart image upload endpoints (must be defined before parameterized /:id routes)
router.post('/upload-images', handleUploadErrors(upload.array('images', 8)), AdminProductController.uploadImages);
router.post('/upload-image', handleUploadErrors(upload.single('image')), AdminProductController.uploadSingleImage);
router.post('/upload', handleUploadErrors(upload.array('images', 8)), AdminProductController.uploadImages);

// Category & Subcategory metadata routes (Must be mounted before parameterized /:id)
router.get('/categories', AdminProductController.getCategories);
router.get('/categories/:slug/subcategories', AdminProductController.getSubCategories);

// Product list endpoints (standard and legacy alias)
router.get('/product-list', AdminProductController.listProducts);
router.get('/', AdminProductController.listProducts);

// Single product management
router.get('/:id', AdminProductController.getProductById);
router.post('/', AdminProductController.createProduct);
router.put('/:id', AdminProductController.updateProduct);
router.patch('/:id/status', AdminProductController.toggleStatus);
router.patch('/:id/activate', (req, res) => {
  req.body = { ...req.body, is_active: true };
  AdminProductController.toggleStatus(req, res);
});
router.patch('/:id/deactivate', (req, res) => {
  req.body = { ...req.body, is_active: false };
  AdminProductController.toggleStatus(req, res);
});
router.delete('/:id', AdminProductController.deleteProduct);

export default router;
