import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AdminRepository } from '../repositories/adminRepository';
import { JwtAdminPayload, AdminRole, SafeAdminUser } from '../types/admin';

const ADMIN_JWT_SECRET: string = process.env.ADMIN_JWT_SECRET || process.env.JWT_SECRET || 'the-gifted-pencil-admin-secret-2026';

// Extend Express Request type to include authenticated admin
declare global {
  namespace Express {
    interface Request {
      admin?: SafeAdminUser;
    }
  }
}

/**
 * Admin Authentication Middleware
 * Enforces valid Bearer JWT explicitly issued for an admin account.
 * Rejects customer tokens, checks active status, and binds req.admin.
 */
export const adminAuthMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      status: 'error',
      message: 'Admin authorization required. Please provide a valid Bearer token.'
    });
    return;
  }

  const token = authHeader.split(' ')[1]?.trim();

  if (!token) {
    res.status(401).json({
      status: 'error',
      message: 'Admin token is missing.'
    });
    return;
  }

  try {
    const decoded = jwt.verify(token, ADMIN_JWT_SECRET) as JwtAdminPayload;

    // Strict validation: Reject customer tokens (type !== 'admin')
    if (!decoded || decoded.type !== 'admin' || !decoded.adminId) {
      res.status(403).json({
        status: 'error',
        message: 'Forbidden. Access restricted exclusively to administrative accounts.'
      });
      return;
    }

    const admin = await AdminRepository.findById(decoded.adminId);
    if (!admin) {
      res.status(401).json({
        status: 'error',
        message: 'Admin account not found or has been revoked.'
      });
      return;
    }

    if (!admin.is_active) {
      res.status(403).json({
        status: 'error',
        message: 'Admin account has been deactivated. Contact superadmin.'
      });
      return;
    }

    req.admin = {
      id: admin.id,
      admin_uuid: admin.admin_uuid,
      username: admin.username,
      email: admin.email,
      full_name: admin.full_name,
      role: admin.role,
      avatar_url: admin.avatar_url,
      is_active: Boolean(admin.is_active),
      last_login_at: admin.last_login_at
    };

    next();
  } catch (error: any) {
    res.status(401).json({
      status: 'error',
      message: error.name === 'TokenExpiredError'
        ? 'Admin session expired. Please log in again.'
        : 'Invalid admin token.'
    });
  }
};

/**
 * Role-Based Authorization Guard
 * Allows only specified administrative roles
 */
export const requireAdminRole = (...allowedRoles: AdminRole[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.admin) {
      res.status(401).json({
        status: 'error',
        message: 'Authentication required.'
      });
      return;
    }

    if (!allowedRoles.includes(req.admin.role as AdminRole)) {
      res.status(403).json({
        status: 'error',
        message: `Forbidden. Action requires one of: [${allowedRoles.join(', ')}].`
      });
      return;
    }

    next();
  };
};
