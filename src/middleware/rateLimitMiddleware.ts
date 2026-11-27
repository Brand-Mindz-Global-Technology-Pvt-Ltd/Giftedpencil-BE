import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';

/**
 * Standard Auth Rate Limiter
 * Applied to sensitive endpoints: login, register, password reset, change-password
 * Limits: 30 requests per 15 minutes per IP
 */
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // Limit each IP to 30 auth requests per windowMs
  standardHeaders: true, // Return standard `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  handler: (_req: Request, res: Response) => {
    res.status(429).json({
      status: 'error',
      message: 'Too many requests from this IP. Please try again after 15 minutes.'
    });
  }
});

/**
 * General API Rate Limiter
 * Applied globally to /api to prevent excessive volumetric abuse
 * Limits: 600 requests per 15 minutes per IP
 */
export const apiRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req: Request, res: Response) => {
    res.status(429).json({
      status: 'error',
      message: 'Too many requests. Please try again later.'
    });
  }
});
