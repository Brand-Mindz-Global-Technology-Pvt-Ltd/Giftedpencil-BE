import { Request, Response } from 'express';
import { ProfileService } from '../services/profileService';

export class ProfileController {
  /**
   * GET /api/profile
   * Return authenticated user's profile
   */
  public static getProfile = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({
          status: 'error',
          message: 'Authentication required. Please provide a valid Bearer token.'
        });
        return;
      }

      const profile = await ProfileService.getProfile(userId);
      res.status(200).json({
        status: 'success',
        data: {
          profile
        },
        profile
      });
    } catch (error: any) {
      const statusCode = error.statusCode || 500;
      res.status(statusCode).json({
        status: 'error',
        message: error.message || 'Failed to fetch user profile'
      });
    }
  };

  /**
   * PUT /api/profile
   * Update authenticated user's profile details
   */
  public static updateProfile = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({
          status: 'error',
          message: 'Authentication required. Please provide a valid Bearer token.'
        });
        return;
      }

      const result = await ProfileService.updateProfile(userId, req.body);
      res.status(200).json({
        status: 'success',
        message: 'Profile updated successfully.',
        data: {
          profile: result.profile
        },
        profile: result.profile
      });
    } catch (error: any) {
      const statusCode = error.statusCode || 400;
      res.status(statusCode).json({
        status: 'error',
        message: error.message || 'Failed to update profile',
        ...(error.errors ? { errors: error.errors } : {})
      });
    }
  };

  /**
   * PUT /api/profile/password
   * Change authenticated user's password
   */
  public static changePassword = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({
          status: 'error',
          message: 'Authentication required. Please provide a valid Bearer token.'
        });
        return;
      }

      const result = await ProfileService.changePassword(userId, req.body);
      res.status(200).json({
        status: 'success',
        message: result.message
      });
    } catch (error: any) {
      const statusCode = error.statusCode || 400;
      res.status(statusCode).json({
        status: 'error',
        message: error.message || 'Failed to change password',
        ...(error.errors ? { errors: error.errors } : {})
      });
    }
  };
}
