import { Request, Response } from 'express';
import { ProductService, ProductQueryParams } from '../services/productService';
import { ProductValidator } from '../validators/productValidator';

export class ProductController {
  /**
   * GET /api/products
   * List products with search, category filtering, price range, sorting, and pagination
   */
  public static getProducts = async (req: Request, res: Response): Promise<void> => {
    try {
      const validation = ProductValidator.validateQueryParams(req.query);
      if (!validation.isValid) {
        res.status(400).json({
          status: 'error',
          message: 'Invalid query parameters',
          errors: validation.errors
        });
        return;
      }

      const query: ProductQueryParams = {
        search: typeof req.query.search === 'string' ? req.query.search : undefined,
        category: typeof req.query.category === 'string' ? req.query.category : undefined,
        minPrice: req.query.min_price ? Number(req.query.min_price) : undefined,
        maxPrice: req.query.max_price ? Number(req.query.max_price) : undefined,
        inStock: req.query.in_stock === 'true' ? true : req.query.in_stock === 'false' ? false : undefined,
        sortBy: req.query.sort_by as any,
        page: req.query.page ? Number(req.query.page) : 1,
        limit: req.query.limit ? Number(req.query.limit) : 10
      };

      const result = await ProductService.getProducts(query);

      res.status(200).json({
        status: 'success',
        data: {
          products: result.products,
          pagination: result.pagination
        }
      });
    } catch (error: any) {
      res.status(500).json({
        status: 'error',
        message: error.message || 'Failed to fetch products'
      });
    }
  };

  /**
   * GET /api/products/:idOrSlug
   * Fetch individual product details by numeric ID or slug (e.g., 'the-gifted-pencil')
   */
  public static getProductByIdOrSlug = async (req: Request, res: Response): Promise<void> => {
    try {
      const idOrSlug = req.params.idOrSlug || (req.params as any).id;

      const validation = ProductValidator.validateIdOrSlug(idOrSlug);
      if (!validation.isValid) {
        res.status(400).json({
          status: 'error',
          message: 'Invalid product identifier',
          errors: validation.errors
        });
        return;
      }

      const product = await ProductService.getProductByIdOrSlug(idOrSlug);

      if (!product) {
        res.status(404).json({
          status: 'error',
          message: `Product with identifier "${idOrSlug}" not found.`
        });
        return;
      }

      res.status(200).json({
        status: 'success',
        data: {
          product
        },
        product // Included for backward-compatibility with existing tests
      });
    } catch (error: any) {
      res.status(500).json({
        status: 'error',
        message: error.message || 'Failed to fetch product details'
      });
    }
  };

  /**
   * GET /api/categories (and /api/products/categories)
   * Fetch distinct categories derived dynamically from active products in MySQL
   */
  public static getCategories = async (_req: Request, res: Response): Promise<void> => {
    try {
      const categories = await ProductService.getCategories();

      res.status(200).json({
        status: 'success',
        data: {
          categories
        }
      });
    } catch (error: any) {
      res.status(500).json({
        status: 'error',
        message: error.message || 'Failed to fetch categories'
      });
    }
  };
}
