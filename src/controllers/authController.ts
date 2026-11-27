import { Request, Response } from 'express';
import { AuthService } from '../services/authService';

export class AuthController {
  /**
   * POST /api/auth/register
   * Register a new customer account
   */
  public static register = async (req: Request, res: Response): Promise<void> => {
    try {
      const result = await AuthService.register(req.body);
      res.status(201).json({
        status: 'success',
        message: result.message,
        user: result.user
      });
    } catch (error: any) {
      if (error.errors) {
        res.status(error.statusCode || 400).json({
          status: 'error',
          message: 'Validation failed',
          errors: error.errors
        });
        return;
      }

      res.status(error.statusCode || 400).json({
        status: 'error',
        message: error.message || 'Registration failed'
      });
    }
  };

  /**
   * POST /api/auth/login
   * Authenticate customer credentials and return JWT
   */
  public static login = async (req: Request, res: Response): Promise<void> => {
    try {
      const result = await AuthService.login(req.body);
      res.status(200).json({
        status: 'success',
        message: 'Login successful.',
        token: result.token,
        token_type: result.token_type,
        expires_in: result.expires_in,
        user: result.user
      });
    } catch (error: any) {
      if (error.errors) {
        res.status(error.statusCode || 400).json({
          status: 'error',
          message: 'Validation failed',
          errors: error.errors
        });
        return;
      }

      res.status(error.statusCode || 401).json({
        status: 'error',
        message: error.message || 'Authentication failed'
      });
    }
  };

  /**
   * POST /api/auth/logout
   * Revoke current JWT token
   */
  public static logout = (req: Request, res: Response): void => {
    try {
      const token = req.token || req.headers.authorization?.split(' ')[1] || '';
      const result = AuthService.logout(token);
      res.status(200).json({
        status: 'success',
        message: result.message
      });
    } catch (error: any) {
      res.status(error.statusCode || 400).json({
        status: 'error',
        message: error.message || 'Logout failed'
      });
    }
  };

  /**
   * POST /api/auth/forgot-password
   * Request password reset token
   */
  public static forgotPassword = async (req: Request, res: Response): Promise<void> => {
    try {
      const result = await AuthService.forgotPassword(req.body?.email);
      res.status(200).json({
        status: 'success',
        ...result
      });
    } catch (error: any) {
      if (error.errors) {
        res.status(error.statusCode || 400).json({
          status: 'error',
          message: 'Validation failed',
          errors: error.errors
        });
        return;
      }

      res.status(error.statusCode || 400).json({
        status: 'error',
        message: error.message || 'Failed to process password reset request'
      });
    }
  };

  /**
   * POST /api/auth/reset-password
   * Reset password using valid token
   */
  public static resetPassword = async (req: Request, res: Response): Promise<void> => {
    try {
      const result = await AuthService.resetPassword(req.body);
      res.status(200).json({
        status: 'success',
        message: result.message
      });
    } catch (error: any) {
      if (error.errors) {
        res.status(error.statusCode || 400).json({
          status: 'error',
          message: 'Validation failed',
          errors: error.errors
        });
        return;
      }

      res.status(error.statusCode || 400).json({
        status: 'error',
        message: error.message || 'Failed to reset password'
      });
    }
  };

  /**
   * GET /api/auth/me
   * Return currently authenticated user profile
   */
  public static getMe = (req: Request, res: Response): void => {
    if (!req.user) {
      res.status(401).json({
        status: 'error',
        message: 'Not authenticated'
      });
      return;
    }

    res.status(200).json({
      status: 'success',
      user: req.user
    });
  };
}
