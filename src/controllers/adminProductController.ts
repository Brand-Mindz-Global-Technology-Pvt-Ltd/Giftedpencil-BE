import { Request, Response } from 'express';
import { ProductService } from '../services/productService';
import { AdminProductInput, AdminProductUpdateInput, AdminProductQueryParams } from '../types';

export class AdminProductController {
  /**
   * GET /api/admin/products or /products/product-list
   * Query catalog for Admin with search, category filter, status filter, and pagination
   */
  public static async listProducts(req: Request, res: Response): Promise<void> {
    try {
      const page = req.query.page ? Math.max(1, parseInt(String(req.query.page), 10) || 1) : 1;
      const limit = req.query.limit ? Math.max(1, Math.min(100, parseInt(String(req.query.limit), 10) || 8)) : 8;
      const search = typeof req.query.search === 'string' ? req.query.search : undefined;
      const category = typeof req.query.category === 'string' ? req.query.category : undefined;
      const subCategory = typeof req.query.subCategory === 'string' ? req.query.subCategory : undefined;
      const status = typeof req.query.status === 'string'
        ? (req.query.status.trim().toLowerCase() as ('all' | 'active' | 'inactive'))
        : 'all';
      const sortBy = typeof req.query.sortBy === 'string' ? req.query.sortBy : undefined;

      const params: AdminProductQueryParams = {
        page,
        limit,
        search,
        category,
        subCategory,
        status,
        sortBy
      };

      const result = await ProductService.getAdminProducts(params);

      res.status(200).json({
        success: true,
        data: result.products,
        pagination: result.pagination
      });
    } catch (error: any) {
      console.error('[AdminProductController.listProducts] Error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve products',
        error: error?.message || 'Internal server error'
      });
    }
  }

  /**
   * GET /api/admin/products/:id or /products/:id
   * Fetch single product details by numeric ID
   */
  public static async getProductById(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(String(req.params.id), 10);
      if (isNaN(id) || id <= 0) {
        res.status(400).json({
          success: false,
          message: 'Invalid product ID'
        });
        return;
      }

      const product = await ProductService.getAdminProductById(id);
      if (!product) {
        res.status(404).json({
          success: false,
          message: `Product with ID ${id} not found`
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: product
      });
    } catch (error: any) {
      console.error('[AdminProductController.getProductById] Error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve product',
        error: error?.message || 'Internal server error'
      });
    }
  }

  /**
   * POST /api/admin/products or /products
   * Create a new product in MySQL
   */
  public static async createProduct(req: Request, res: Response): Promise<void> {
    try {
      const body = req.body || {};

      // Handle images from body or multipart fields
      let images: string[] = [];
      if (Array.isArray(body.images)) {
        images = body.images;
      } else if (typeof body.images === 'string') {
        try {
          images = JSON.parse(body.images);
        } catch {
          images = [body.images];
        }
      }

      if (body.existingImages) {
        try {
          const parsed = typeof body.existingImages === 'string' ? JSON.parse(body.existingImages) : body.existingImages;
          if (Array.isArray(parsed)) {
            images = [...images, ...parsed];
          }
        } catch {}
      }

      // Handle features & specifications
      let features: string[] = [];
      if (body.features) {
        features = typeof body.features === 'string' ? JSON.parse(body.features) : body.features;
      }

      let specifications: Record<string, string> = {};
      if (body.specifications) {
        specifications = typeof body.specifications === 'string' ? JSON.parse(body.specifications) : body.specifications;
      }

      const input: AdminProductInput = {
        name: body.name || body.productName || '',
        slug: body.slug || undefined,
        subtitle: body.edition !== undefined ? (body.edition ? String(body.edition).trim() : undefined) : (body.subtitle ? String(body.subtitle).trim() : undefined),
        price: Number(body.price),
        original_price: body.original_price != null && body.original_price !== '' && Number(body.original_price) > 0 
          ? Number(body.original_price) 
          : (body.oldPrice != null && body.oldPrice !== '' && Number(body.oldPrice) > 0 ? Number(body.oldPrice) : undefined),
        oldPrice: body.oldPrice != null && body.oldPrice !== '' && Number(body.oldPrice) > 0 ? Number(body.oldPrice) : undefined,
        discount: body.discount || undefined,
        stock_quantity: Number(body.stock_quantity ?? body.stock ?? 0),
        stock: Number(body.stock ?? body.stock_quantity ?? 0),
        description: body.description ? String(body.description).trim() : '',
        image: body.image || images[0] || (images.length > 0 ? images[0] : null as any),
        images,
        category: body.category || undefined,
        category_id: body.category_id != null ? Number(body.category_id) : undefined,
        subCategory: body.subCategory || undefined,
        features: Array.isArray(features) ? features.map(f => String(f).trim()).filter(Boolean) : [],
        specifications: typeof specifications === 'object' ? specifications : undefined,
        is_active: body.is_active !== undefined ? Boolean(body.is_active) : true
      };

      if (!input.name || !input.name.trim()) {
        res.status(400).json({
          success: false,
          message: 'Product name is required'
        });
        return;
      }

      if (!input.description || !input.description.trim()) {
        res.status(400).json({
          success: false,
          message: 'Product description is required'
        });
        return;
      }

      if (isNaN(input.price) || input.price <= 0) {
        res.status(400).json({
          success: false,
          message: 'A valid positive product price is required'
        });
        return;
      }

      if (input.stock_quantity === undefined || isNaN(input.stock_quantity) || input.stock_quantity < 0) {
        res.status(400).json({
          success: false,
          message: 'A valid non-negative stock quantity is required'
        });
        return;
      }

      const product = await ProductService.createProduct(input);

      res.status(201).json({
        success: true,
        message: 'Product created successfully',
        data: product
      });
    } catch (error: any) {
      console.error('[AdminProductController.createProduct] Error:', error);
      res.status(400).json({
        success: false,
        message: error?.message || 'Failed to create product'
      });
    }
  }

  /**
   * PUT /api/admin/products/:id or /products/:id
   * Update an existing product in MySQL
   */
  public static async updateProduct(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(String(req.params.id), 10);
      if (isNaN(id) || id <= 0) {
        res.status(400).json({
          success: false,
          message: 'Invalid product ID'
        });
        return;
      }

      const body = req.body || {};

      let images: string[] | undefined = undefined;
      if (body.images !== undefined) {
        if (Array.isArray(body.images)) {
          images = body.images;
        } else if (typeof body.images === 'string') {
          try {
            images = JSON.parse(body.images);
          } catch {
            images = [body.images];
          }
        }
      }

      if (body.existingImages) {
        try {
          const parsed = typeof body.existingImages === 'string' ? JSON.parse(body.existingImages) : body.existingImages;
          if (Array.isArray(parsed)) {
            images = [...(images || []), ...parsed];
          }
        } catch {}
      }

      const subtitleVal = body.edition !== undefined 
        ? (body.edition ? String(body.edition).trim() : null) 
        : (body.subtitle !== undefined ? (body.subtitle ? String(body.subtitle).trim() : null) : undefined);

      let origPriceVal: number | null | undefined = undefined;
      if (body.original_price !== undefined || body.oldPrice !== undefined) {
        const raw = body.original_price !== undefined ? body.original_price : body.oldPrice;
        origPriceVal = raw != null && raw !== '' && Number(raw) > 0 ? Number(raw) : null;
      }

      let featuresVal: string[] | undefined = undefined;
      if (body.features !== undefined) {
        featuresVal = Array.isArray(body.features)
          ? body.features.map((f: any) => String(f).trim()).filter(Boolean)
          : [];
      }

      const input: AdminProductUpdateInput = {
        name: body.name || body.productName,
        slug: body.slug,
        subtitle: subtitleVal as any,
        price: body.price !== undefined ? Number(body.price) : undefined,
        original_price: origPriceVal as any,
        oldPrice: origPriceVal as any,
        discount: body.discount,
        stock_quantity: body.stock_quantity !== undefined ? Number(body.stock_quantity) : (body.stock !== undefined ? Number(body.stock) : undefined),
        stock: body.stock !== undefined ? Number(body.stock) : undefined,
        description: body.description !== undefined ? String(body.description).trim() : undefined,
        image: body.image,
        images,
        features: featuresVal,
        category: body.category,
        category_id: body.category_id !== undefined ? (body.category_id ? Number(body.category_id) : null) : undefined,
        subCategory: body.subCategory,
        is_active: body.is_active !== undefined ? Boolean(body.is_active) : undefined
      };

      const updated = await ProductService.updateProduct(id, input);

      res.status(200).json({
        success: true,
        message: 'Product updated successfully',
        data: updated
      });
    } catch (error: any) {
      console.error('[AdminProductController.updateProduct] Error:', error);
      res.status(400).json({
        success: false,
        message: error?.message || 'Failed to update product'
      });
    }
  }

  /**
   * DELETE /api/admin/products/:id or /products/:id
   * Safe deactivation (is_active = 0) to protect historical orders
   */
  public static async deleteProduct(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(String(req.params.id), 10);
      if (isNaN(id) || id <= 0) {
        res.status(400).json({
          success: false,
          message: 'Invalid product ID'
        });
        return;
      }

      await ProductService.deactivateProduct(id);

      res.status(200).json({
        success: true,
        message: 'Product deactivated successfully'
      });
    } catch (error: any) {
      console.error('[AdminProductController.deleteProduct] Error:', error);
      res.status(400).json({
        success: false,
        message: error?.message || 'Failed to deactivate product'
      });
    }
  }

  /**
   * PATCH /api/admin/products/:id/status
   * Toggle product active status (activate / deactivate)
   */
  public static async toggleStatus(req: Request, res: Response): Promise<void> {
    try {
      const id = parseInt(String(req.params.id), 10);
      if (isNaN(id) || id <= 0) {
        res.status(400).json({
          success: false,
          message: 'Invalid product ID'
        });
        return;
      }

      const product = await ProductService.getAdminProductById(id);
      if (!product) {
        res.status(404).json({
          success: false,
          message: `Product with ID ${id} not found`
        });
        return;
      }

      // Explicit target status if specified in payload, otherwise toggle
      let targetActive: boolean;
      if (req.body?.is_active !== undefined) {
        targetActive = Boolean(req.body.is_active);
      } else if (req.body?.status !== undefined) {
        targetActive = req.body.status === 'active' || req.body.status === true;
      } else {
        targetActive = !product.is_active;
      }

      if (targetActive) {
        await ProductService.activateProduct(id);
      } else {
        await ProductService.deactivateProduct(id);
      }

      const updated = await ProductService.getAdminProductById(id);

      res.status(200).json({
        success: true,
        message: `Product ${updated.is_active ? 'activated' : 'deactivated'} successfully`,
        data: updated
      });
    } catch (error: any) {
      console.error('[AdminProductController.toggleStatus] Error:', error);
      res.status(400).json({
        success: false,
        message: error?.message || 'Failed to toggle product status'
      });
    }
  }

  /**
   * GET /api/admin/products/categories or /products/categories
   * Return category list and next product ID for the admin form
   */
  public static async getCategories(_req: Request, res: Response): Promise<void> {
    try {
      const result = await ProductService.getAdminCategories();
      res.status(200).json({
        success: true,
        data: result.categories,
        productId: result.productId
      });
    } catch (error: any) {
      console.error('[AdminProductController.getCategories] Error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve categories',
        error: error?.message || 'Internal server error'
      });
    }
  }

  /**
   * GET /api/admin/products/categories/:slug/subcategories or /products/categories/:slug/subcategories
   * Return empty list for subcategories safely
   */
  public static async getSubCategories(_req: Request, res: Response): Promise<void> {
    res.status(200).json({
      success: true,
      data: []
    });
  }

  /**
   * POST /api/admin/products/upload-images or /products/upload-images
   * Upload multiple product images using Multer multipart/form-data
   */
  public static async uploadImages(req: Request, res: Response): Promise<void> {
    try {
      const files = req.files as Express.Multer.File[];
      if (!files || !Array.isArray(files) || files.length === 0) {
        res.status(400).json({
          success: false,
          message: 'No image files provided for upload.'
        });
        return;
      }

      const urls = files.map(file => `/uploads/products/${file.filename}`);

      res.status(200).json({
        success: true,
        message: `${urls.length} image(s) uploaded successfully`,
        data: {
          urls,
          url: urls[0]
        }
      });
    } catch (error: any) {
      console.error('[AdminProductController.uploadImages] Error:', error);
      res.status(500).json({
        success: false,
        message: error?.message || 'Failed to upload images'
      });
    }
  }

  /**
   * POST /api/admin/products/upload-image or /products/upload-image
   * Upload a single product image using Multer multipart/form-data
   */
  public static async uploadSingleImage(req: Request, res: Response): Promise<void> {
    try {
      const file = req.file as Express.Multer.File;
      if (!file) {
        res.status(400).json({
          success: false,
          message: 'No image file provided for upload.'
        });
        return;
      }

      const url = `/uploads/products/${file.filename}`;

      res.status(200).json({
        success: true,
        message: 'Image uploaded successfully',
        data: {
          url,
          urls: [url]
        }
      });
    } catch (error: any) {
      console.error('[AdminProductController.uploadSingleImage] Error:', error);
      res.status(500).json({
        success: false,
        message: error?.message || 'Failed to upload image'
      });
    }
  }
}

