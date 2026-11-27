import { Request, Response, NextFunction } from 'express';

export interface AppError extends Error {
  statusCode?: number;
  status?: string;
  errors?: any;
}

/**
 * Centralized Error Handling Middleware
 * - Returns consistent JSON responses
 * - Never exposes stack traces in production
 * - Normalizes JSON syntax errors, CORS errors, and database errors
 */
export const centralizedErrorHandler = (
  err: any,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  const isProduction = process.env.NODE_ENV === 'production';
  let statusCode = err.statusCode || err.status || 500;
  let message = err.message || 'Internal server error';

  // Handle body-parser JSON SyntaxError
  if (err instanceof SyntaxError && 'body' in err) {
    statusCode = 400;
    message = 'Invalid JSON in request body.';
  }

  // Handle CORS origin denial
  if (err.message && err.message.includes('not allowed by CORS')) {
    statusCode = 403;
    message = 'Access forbidden: Origin not permitted by CORS policy.';
  }

  // For 500 internal errors in production, hide internal database/runtime messages
  if (statusCode >= 500 && isProduction) {
    message = 'Internal server error. Please try again later.';
  }

  // Safe error logging (without sensitive data)
  console.error(`[EXPRESS ERROR] ${req.method} ${req.originalUrl || req.url} | Status: ${statusCode} | ${message}`);
  if (!isProduction && err.stack) {
    console.error(err.stack);
  }

  res.status(statusCode).json({
    status: 'error',
    message,
    ...(err.errors && { errors: err.errors })
  });
};
