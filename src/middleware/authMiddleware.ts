import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { isTokenBlocked } from '../utils/tokenBlocklist';
import { UserRepository } from '../repositories/userRepository';
import { AuthService } from '../services/authService';
import { JwtUserPayload, User } from '../types/auth';

const JWT_SECRET: string = process.env.JWT_SECRET || 'the-gifted-pencil-dev-secret-key-2026';

/**
 * Authentication Middleware
 * Validates JWT access token, checks token blocklist, queries MySQL user account,
 * enforces active account status, and attaches safe user info to req.user
 */
export const authMiddleware = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      status: 'error',
      message: 'Authentication required. Please provide a valid Bearer token.'
    });
    return;
  }

  const token = authHeader.split(' ')[1]?.trim();

  if (!token) {
    res.status(401).json({
      status: 'error',
      message: 'Authentication token is missing.'
    });
    return;
  }

  // Check if token was revoked via logout blocklist
  if (isTokenBlocked(token)) {
    res.status(401).json({
      status: 'error',
      message: 'Token has been revoked. Please log in again.'
    });
    return;
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JwtUserPayload;

    if (!decoded || !decoded.userId) {
      res.status(401).json({
        status: 'error',
        message: 'Invalid authentication token payload.'
      });
      return;
    }

    const numId = Number(String(decoded.userId).replace(/\D/g, ''));
    let user: User | null = null;
    if (!isNaN(numId) && numId > 0) {
      user = await UserRepository.findUserById(numId);
    }

    if (!user) {
      res.status(401).json({
        status: 'error',
        message: 'User account not found or deactivated.'
      });
      return;
    }

    // Reject inactive or suspended accounts
    if (user.account_status && user.account_status !== 'active') {
      res.status(401).json({
        status: 'error',
        message: 'User account not found or deactivated.'
      });
      return;
    }

    // Attach safe user details and active token to Request object
    req.user = AuthService.toSafeUser(user);
    req.token = token;

    next();
  } catch (error: any) {
    if (error.name === 'TokenExpiredError') {
      res.status(401).json({
        status: 'error',
        message: 'Authentication token has expired. Please log in again.'
      });
      return;
    }

    res.status(401).json({
      status: 'error',
      message: 'Invalid authentication token.'
    });
  }
};
