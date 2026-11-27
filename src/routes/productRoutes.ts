import { Router } from 'express';
import { ProductController } from '../controllers/productController';

const router = Router();

// GET /api/products/categories - Distinct categories list
router.get('/categories', ProductController.getCategories);

// GET /api/products - Query catalog with search, category, price range, sorting, pagination
router.get('/', ProductController.getProducts);

// GET /api/products/:idOrSlug - Single product details by numeric ID or slug (e.g., '1', 'the-gifted-pencil')
router.get('/:idOrSlug', ProductController.getProductByIdOrSlug);

export default router;
