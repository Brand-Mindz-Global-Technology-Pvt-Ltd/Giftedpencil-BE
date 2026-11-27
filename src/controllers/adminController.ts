import { Request, Response } from 'express';
import { AdminService } from '../services/adminService';

export class AdminController {
  /**
   * POST /api/admin/auth/login or POST /auth/login
   * Authenticate admin user
   * Response matches frontend expected structure: { success: true, token, admin: { id, username, email, role } }
   */
  public static login = async (req: Request, res: Response): Promise<void> => {
    try {
      const { email, password } = req.body;
      const result = await AdminService.login({ email, password });

      res.status(200).json({
        success: true,
        status: 'success',
        message: 'Login successful.',
        token: result.token,
        admin: result.admin,
        data: {
          token: result.token,
          admin: result.admin
        }
      });
    } catch (error: any) {
      const statusCode = error.statusCode || 500;
      res.status(statusCode).json({
        success: false,
        status: 'error',
        message: error.message || 'Login failed.'
      });
    }
  };

  /**
   * POST /api/admin/auth/register or POST /auth/register
   * Create admin account
   */
  public static register = async (req: Request, res: Response): Promise<void> => {
    try {
      const { username, email, password, full_name, name, role } = req.body;
      const result = await AdminService.register({
        username: username || email?.split('@')[0],
        email,
        password,
        full_name: full_name || name || username,
        role: role || 'admin'
      });

      res.status(201).json({
        success: true,
        status: 'success',
        message: result.message,
        admin: result.admin,
        data: {
          admin: result.admin
        }
      });
    } catch (error: any) {
      const statusCode = error.statusCode || 500;
      res.status(statusCode).json({
        success: false,
        status: 'error',
        message: error.message || 'Registration failed.'
      });
    }
  };

  /**
   * POST /api/admin/auth/logout
   */
  public static logout = async (_req: Request, res: Response): Promise<void> => {
    res.status(200).json({
      success: true,
      status: 'success',
      message: 'Logged out successfully.'
    });
  };

  /**
   * GET /api/admin/profile/:id or GET /admin/:adminId/profile
   * Return authenticated admin profile
   */
  public static getProfile = async (req: Request, res: Response): Promise<void> => {
    try {
      const rawId = req.params.id || req.params.adminId;
      const adminId = Array.isArray(rawId) ? rawId[0] : rawId;
      const profile = await AdminService.getProfile(adminId);
      const nameParts = (profile.full_name || '').trim().split(' ');
      const firstName = nameParts[0] || profile.username;
      const lastName = nameParts.slice(1).join(' ');

      const enrichedProfile = {
        ...profile,
        firstName,
        lastName,
        profile: {
          firstName,
          lastName,
          email: profile.email,
          phone: '',
          gender: ''
        }
      };

      res.status(200).json({
        success: true,
        status: 'success',
        admin: enrichedProfile,
        profile: enrichedProfile.profile,
        data: enrichedProfile
      });
    } catch (error: any) {
      const statusCode = error.statusCode || 500;
      res.status(statusCode).json({
        success: false,
        status: 'error',
        message: error.message || 'Failed to retrieve profile.'
      });
    }
  };

  /**
   * PUT /api/admin/auth/profile/:id or PUT /admin/:adminId/profile
   * Update admin profile
   */
  public static updateProfile = async (req: Request, res: Response): Promise<void> => {
    try {
      const rawId = req.params.id || req.params.adminId || (req as any).admin?.adminId;
      const adminId = Array.isArray(rawId) ? rawId[0] : rawId;

      if (!adminId) {
        res.status(400).json({
          success: false,
          status: 'error',
          message: 'Admin ID is required.'
        });
        return;
      }

      const { firstName, lastName, full_name, name, email, username } = req.body;
      let finalFullName: string | undefined = undefined;
      if (full_name !== undefined) {
        finalFullName = full_name;
      } else if (firstName !== undefined || lastName !== undefined) {
        finalFullName = `${firstName || ''} ${lastName || ''}`.trim();
      } else if (name !== undefined) {
        finalFullName = name;
      }

      let avatarUrl: string | undefined = undefined;
      if (req.file) {
        avatarUrl = `/uploads/avatars/${req.file.filename}`;
      } else if (req.body.avatar_url) {
        avatarUrl = req.body.avatar_url;
      }

      const updated = await AdminService.updateProfile(adminId, {
        full_name: finalFullName,
        email,
        username,
        avatar_url: avatarUrl
      });

      const nameParts = (updated.full_name || '').trim().split(' ');
      const resFirstName = nameParts[0] || updated.username;
      const resLastName = nameParts.slice(1).join(' ');

      const enrichedProfile = {
        ...updated,
        firstName: resFirstName,
        lastName: resLastName,
        profile: {
          firstName: resFirstName,
          lastName: resLastName,
          email: updated.email,
          phone: req.body.phone || '',
          socialLinks: req.body.socialLinks ? (typeof req.body.socialLinks === 'string' ? JSON.parse(req.body.socialLinks) : req.body.socialLinks) : {}
        }
      };

      res.status(200).json({
        success: true,
        status: 'success',
        message: 'Profile updated successfully.',
        admin: enrichedProfile,
        profile: enrichedProfile.profile,
        data: enrichedProfile
      });
    } catch (error: any) {
      const statusCode = error.statusCode || 500;
      res.status(statusCode).json({
        success: false,
        status: 'error',
        message: error.message || 'Failed to update profile.'
      });
    }
  };

  /**
   * PUT /api/admin/auth/change-password or PUT /admin/:adminId/change-password
   */
  public static changePassword = async (req: Request, res: Response): Promise<void> => {
    try {
      const rawId = req.params.id || req.params.adminId || (req as any).admin?.adminId;
      const adminId = Array.isArray(rawId) ? rawId[0] : rawId;

      if (!adminId) {
        res.status(400).json({
          success: false,
          status: 'error',
          message: 'Admin ID is required.'
        });
        return;
      }

      const currentPassword = req.body.currentPassword || req.body.oldPassword;
      const newPassword = req.body.newPassword || req.body.password;

      if (!newPassword) {
        res.status(400).json({
          success: false,
          status: 'error',
          message: 'New password is required.'
        });
        return;
      }

      const result = await AdminService.changePassword(adminId, currentPassword, newPassword);

      res.status(200).json({
        success: true,
        status: 'success',
        message: result.message
      });
    } catch (error: any) {
      const statusCode = error.statusCode || 500;
      res.status(statusCode).json({
        success: false,
        status: 'error',
        message: error.message || 'Failed to change password.'
      });
    }
  };

  /**
   * POST /api/admin/auth/forgot-password
   */
  public static forgotPassword = async (req: Request, res: Response): Promise<void> => {
    const { email } = req.body;
    if (!email) {
      res.status(400).json({
        success: false,
        status: 'error',
        message: 'Email address is required.'
      });
      return;
    }

    res.status(200).json({
      success: true,
      status: 'success',
      message: 'If that email exists in our system, a password reset link has been dispatched.'
    });
  };
}
