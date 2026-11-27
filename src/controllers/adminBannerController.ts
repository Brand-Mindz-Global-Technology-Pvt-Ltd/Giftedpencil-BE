import { Request, Response } from 'express';
import { AdminBannerService } from '../services/adminBannerService';

export class AdminBannerController {
  static async list(req: Request, res: Response): Promise<void> {
    try {
      const { search, is_active, sort_by, sort_dir, page, limit } = req.query;

      let activeFilter: boolean | undefined = undefined;
      if (is_active !== undefined) {
        if (is_active === 'true' || is_active === '1') {
          activeFilter = true;
        } else if (is_active === 'false' || is_active === '0') {
          activeFilter = false;
        }
      }

      const result = await AdminBannerService.listBanners({
        search: typeof search === 'string' ? search : undefined,
        is_active: activeFilter,
        sort_by: sort_by === 'created_at' || sort_by === 'id' ? sort_by : 'sort_order',
        sort_dir: sort_dir === 'DESC' ? 'DESC' : 'ASC',
        page: page ? Number(page) : undefined,
        limit: limit ? Number(limit) : undefined
      });

      res.status(200).json({
        success: true,
        data: result.banners,
        pagination: {
          total: result.total,
          page: result.page,
          limit: result.limit,
          totalPages: result.totalPages
        }
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to fetch banners'
      });
    }
  }

  static async getById(req: Request, res: Response): Promise<void> {
    try {
      const id = Number(req.params.id);
      if (isNaN(id) || id <= 0) {
        res.status(400).json({
          success: false,
          message: 'Invalid banner ID'
        });
        return;
      }

      const banner = await AdminBannerService.getBannerById(id);
      res.status(200).json({
        success: true,
        data: banner
      });
    } catch (error: any) {
      const status = error.message === 'Banner not found' ? 404 : 500;
      res.status(status).json({
        success: false,
        message: error.message || 'Failed to fetch banner'
      });
    }
  }

  static async create(req: Request, res: Response): Promise<void> {
    try {
      let imagePath = '';
      if (req.file) {
        imagePath = `/uploads/banners/${req.file.filename}`;
      } else if (req.body.image) {
        imagePath = String(req.body.image).trim();
      }

      if (!imagePath) {
        res.status(400).json({
          success: false,
          message: 'Banner image is required (either file upload or image URL)'
        });
        return;
      }

      const { title, subtitle, cta_text, cta_link, sort_order, is_active } = req.body;

      const created = await AdminBannerService.createBanner({
        title,
        subtitle,
        image: imagePath,
        cta_text,
        cta_link,
        sort_order: sort_order !== undefined ? Number(sort_order) : 0,
        is_active: is_active !== undefined ? (is_active === 'true' || is_active === true || is_active === 1 || is_active === '1') : true
      });

      res.status(201).json({
        success: true,
        message: 'Banner created successfully',
        data: created
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to create banner'
      });
    }
  }

  static async update(req: Request, res: Response): Promise<void> {
    try {
      const id = Number(req.params.id);
      if (isNaN(id) || id <= 0) {
        res.status(400).json({
          success: false,
          message: 'Invalid banner ID'
        });
        return;
      }

      let imagePath: string | undefined = undefined;
      if (req.file) {
        imagePath = `/uploads/banners/${req.file.filename}`;
      } else if (req.body.image !== undefined && String(req.body.image).trim() !== '') {
        imagePath = String(req.body.image).trim();
      }

      const { title, subtitle, cta_text, cta_link, sort_order, is_active } = req.body;

      let isActiveVal: boolean | undefined = undefined;
      if (is_active !== undefined) {
        isActiveVal = is_active === 'true' || is_active === true || is_active === 1 || is_active === '1';
      }

      const updated = await AdminBannerService.updateBanner(id, {
        title,
        subtitle,
        image: imagePath,
        cta_text,
        cta_link,
        sort_order: sort_order !== undefined ? Number(sort_order) : undefined,
        is_active: isActiveVal
      });

      res.status(200).json({
        success: true,
        message: 'Banner updated successfully',
        data: updated
      });
    } catch (error: any) {
      const status = error.message === 'Banner not found' ? 404 : 400;
      res.status(status).json({
        success: false,
        message: error.message || 'Failed to update banner'
      });
    }
  }

  static async updateStatus(req: Request, res: Response): Promise<void> {
    try {
      const id = Number(req.params.id);
      if (isNaN(id) || id <= 0) {
        res.status(400).json({
          success: false,
          message: 'Invalid banner ID'
        });
        return;
      }

      const { is_active } = req.body;
      if (is_active === undefined) {
        res.status(400).json({
          success: false,
          message: 'is_active field is required'
        });
        return;
      }

      const activeBool = is_active === true || is_active === 'true' || is_active === 1 || is_active === '1';
      const updated = await AdminBannerService.toggleStatus(id, activeBool);

      res.status(200).json({
        success: true,
        message: `Banner ${activeBool ? 'activated' : 'deactivated'} successfully`,
        data: updated
      });
    } catch (error: any) {
      const status = error.message === 'Banner not found' ? 404 : 400;
      res.status(status).json({
        success: false,
        message: error.message || 'Failed to update banner status'
      });
    }
  }
}
