import { Request, Response } from 'express';
import { AdminSettingsRepository } from '../repositories/adminSettingsRepository';

export class AdminSettingsController {
  /**
   * GET /settings/getcompany/:adminId or GET /api/admin/settings/company/:adminId
   */
  public static getCompany = async (req: Request, res: Response): Promise<void> => {
    try {
      const adminId = String(req.params.adminId || req.params.id || 'default');
      const data = AdminSettingsRepository.getCompany(adminId);

      if (!data) {
        res.status(404).json({
          success: false,
          status: 'error',
          message: 'Company settings not found.'
        });
        return;
      }

      res.status(200).json({
        success: true,
        status: 'success',
        data
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        status: 'error',
        message: error.message || 'Failed to fetch company settings.'
      });
    }
  };

  /**
   * POST /settings/postcompany/:adminId or POST /api/admin/settings/company/:adminId
   */
  public static postCompany = async (req: Request, res: Response): Promise<void> => {
    try {
      const adminId = String(req.params.adminId || req.params.id || 'default');
      const { companyName, email, phone, address } = req.body;

      let logoUrl: string | undefined = undefined;
      if (req.file) {
        logoUrl = `/uploads/settings/${req.file.filename}`;
      }

      const updatePayload: any = {};
      if (companyName !== undefined) updatePayload.companyName = companyName;
      if (email !== undefined) updatePayload.email = email;
      if (phone !== undefined) updatePayload.phone = phone;
      if (address !== undefined) updatePayload.address = address;
      if (logoUrl !== undefined) updatePayload.logo = logoUrl;

      const saved = AdminSettingsRepository.saveCompany(adminId, updatePayload);

      res.status(200).json({
        success: true,
        status: 'success',
        message: 'Company information saved successfully!',
        data: saved
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        status: 'error',
        message: error.message || 'Failed to save company settings.'
      });
    }
  };

  /**
   * GET /settings/get-terms/:adminId
   */
  public static getTerms = async (req: Request, res: Response): Promise<void> => {
    try {
      const adminId = String(req.params.adminId || req.params.id || 'default');
      const data = AdminSettingsRepository.getTerms(adminId);

      if (!data) {
        res.status(404).json({
          success: false,
          status: 'error',
          message: 'Terms & conditions not found.'
        });
        return;
      }

      res.status(200).json({
        success: true,
        status: 'success',
        data
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        status: 'error',
        message: error.message || 'Failed to fetch terms.'
      });
    }
  };

  /**
   * POST /settings/post-terms/:adminId
   */
  public static postTerms = async (req: Request, res: Response): Promise<void> => {
    try {
      const adminId = String(req.params.adminId || req.params.id || 'default');
      const { title, content } = req.body;

      if (!content || !content.trim()) {
        res.status(400).json({
          success: false,
          status: 'error',
          message: 'Content is required.'
        });
        return;
      }

      const saved = AdminSettingsRepository.saveTerms(adminId, title, content);

      res.status(200).json({
        success: true,
        status: 'success',
        message: 'Terms & conditions saved successfully!',
        data: saved
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        status: 'error',
        message: error.message || 'Failed to save terms.'
      });
    }
  };

  /**
   * GET /settings/get-privacy/:adminId
   */
  public static getPrivacy = async (req: Request, res: Response): Promise<void> => {
    try {
      const adminId = String(req.params.adminId || req.params.id || 'default');
      const data = AdminSettingsRepository.getPrivacy(adminId);

      if (!data) {
        res.status(404).json({
          success: false,
          status: 'error',
          message: 'Privacy policy not found.'
        });
        return;
      }

      res.status(200).json({
        success: true,
        status: 'success',
        data
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        status: 'error',
        message: error.message || 'Failed to fetch privacy policy.'
      });
    }
  };

  /**
   * POST /settings/post-privacy/:adminId
   */
  public static postPrivacy = async (req: Request, res: Response): Promise<void> => {
    try {
      const adminId = String(req.params.adminId || req.params.id || 'default');
      const { title, content } = req.body;

      if (!content || !content.trim()) {
        res.status(400).json({
          success: false,
          status: 'error',
          message: 'Content is required.'
        });
        return;
      }

      const saved = AdminSettingsRepository.savePrivacy(adminId, title, content);

      res.status(200).json({
        success: true,
        status: 'success',
        message: 'Privacy policy saved successfully!',
        data: saved
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        status: 'error',
        message: error.message || 'Failed to save privacy policy.'
      });
    }
  };

  /**
   * GET /settings/get-cookie/:adminId
   */
  public static getCookie = async (req: Request, res: Response): Promise<void> => {
    try {
      const adminId = String(req.params.adminId || req.params.id || 'default');
      const data = AdminSettingsRepository.getCookie(adminId);

      if (!data) {
        res.status(404).json({
          success: false,
          status: 'error',
          message: 'Cookie policy not found.'
        });
        return;
      }

      res.status(200).json({
        success: true,
        status: 'success',
        data
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        status: 'error',
        message: error.message || 'Failed to fetch cookie policy.'
      });
    }
  };

  /**
   * POST /settings/post-cookie/:adminId
   */
  public static postCookie = async (req: Request, res: Response): Promise<void> => {
    try {
      const adminId = String(req.params.adminId || req.params.id || 'default');
      const { title, content } = req.body;

      if (!content || !content.trim()) {
        res.status(400).json({
          success: false,
          status: 'error',
          message: 'Content is required.'
        });
        return;
      }

      const saved = AdminSettingsRepository.saveCookie(adminId, title, content);

      res.status(200).json({
        success: true,
        status: 'success',
        message: 'Cookie policy saved successfully!',
        data: saved
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        status: 'error',
        message: error.message || 'Failed to save cookie policy.'
      });
    }
  };

  /**
   * GET /settings/get-shipping/:adminId
   */
  public static getShipping = async (req: Request, res: Response): Promise<void> => {
    try {
      const adminId = String(req.params.adminId || req.params.id || 'default');
      const data = AdminSettingsRepository.getShipping(adminId);

      if (!data) {
        res.status(404).json({
          success: false,
          status: 'error',
          message: 'Shipping policy not found.'
        });
        return;
      }

      res.status(200).json({
        success: true,
        status: 'success',
        data
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        status: 'error',
        message: error.message || 'Failed to fetch shipping policy.'
      });
    }
  };

  /**
   * POST /settings/post-shipping/:adminId
   */
  public static postShipping = async (req: Request, res: Response): Promise<void> => {
    try {
      const adminId = String(req.params.adminId || req.params.id || 'default');
      const { title, content } = req.body;

      if (!content || !content.trim()) {
        res.status(400).json({
          success: false,
          status: 'error',
          message: 'Content is required.'
        });
        return;
      }

      const saved = AdminSettingsRepository.saveShipping(adminId, title, content);

      res.status(200).json({
        success: true,
        status: 'success',
        message: 'Shipping policy saved successfully!',
        data: saved
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        status: 'error',
        message: error.message || 'Failed to save shipping policy.'
      });
    }
  };

  /**
   * GET /settings/get-return-refund/:adminId
   */
  public static getReturnRefund = async (req: Request, res: Response): Promise<void> => {
    try {
      const adminId = String(req.params.adminId || req.params.id || 'default');
      const data = AdminSettingsRepository.getReturnRefund(adminId);

      if (!data) {
        res.status(404).json({
          success: false,
          status: 'error',
          message: 'Return & refund policy not found.'
        });
        return;
      }

      res.status(200).json({
        success: true,
        status: 'success',
        data
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        status: 'error',
        message: error.message || 'Failed to fetch return & refund policy.'
      });
    }
  };

  /**
   * POST /settings/post-return-refund/:adminId
   */
  public static postReturnRefund = async (req: Request, res: Response): Promise<void> => {
    try {
      const adminId = String(req.params.adminId || req.params.id || 'default');
      const { title, content } = req.body;

      if (!content || !content.trim()) {
        res.status(400).json({
          success: false,
          status: 'error',
          message: 'Content is required.'
        });
        return;
      }

      const saved = AdminSettingsRepository.saveReturnRefund(adminId, title, content);

      res.status(200).json({
        success: true,
        status: 'success',
        message: 'Return & refund policy saved successfully!',
        data: saved
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        status: 'error',
        message: error.message || 'Failed to save return & refund policy.'
      });
    }
  };

  /**
   * Public GET /api/policies/:type
   * Accessible by public customer website without authentication.
   * Only returns sanitized policy title, content and updatedAt.
   */
  public static getPublicPolicy = async (req: Request, res: Response): Promise<void> => {
    try {
      const rawType = String(req.params.type || '').toLowerCase();
      const validTypes: Array<'privacy' | 'terms' | 'shipping' | 'return-refund'> = [
        'privacy',
        'terms',
        'shipping',
        'return-refund'
      ];

      // Normalize common variants
      let mappedType: 'privacy' | 'terms' | 'shipping' | 'return-refund' | null = null;
      if (rawType === 'privacy' || rawType === 'privacy-policy') mappedType = 'privacy';
      else if (rawType === 'terms' || rawType === 'terms-conditions' || rawType === 'terms-and-conditions') mappedType = 'terms';
      else if (rawType === 'shipping' || rawType === 'shipping-policy') mappedType = 'shipping';
      else if (rawType === 'return-refund' || rawType === 'return-refund-policy' || rawType === 'refund') mappedType = 'return-refund';

      if (!mappedType || !validTypes.includes(mappedType)) {
        res.status(400).json({
          success: false,
          status: 'error',
          message: 'Invalid policy type requested.'
        });
        return;
      }

      const policy = AdminSettingsRepository.getPublicPolicy(mappedType);
      if (!policy) {
        res.status(404).json({
          success: false,
          status: 'error',
          message: 'No custom policy published yet.'
        });
        return;
      }

      res.status(200).json({
        success: true,
        status: 'success',
        data: {
          title: policy.title,
          content: policy.content,
          updatedAt: policy.updatedAt
        }
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        status: 'error',
        message: error.message || 'Failed to fetch public policy.'
      });
    }
  };
}
