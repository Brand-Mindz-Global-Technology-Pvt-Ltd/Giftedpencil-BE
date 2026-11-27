import { Request, Response, NextFunction } from 'express';

// List of sensitive body keys that should NEVER be logged
const SENSITIVE_KEYS = new Set([
  'password',
  'newpassword',
  'currentpassword',
  'confirmpassword',
  'token',
  'refreshtoken',
  'cardnumber',
  'cvv',
  'otp',
  'secret'
]);

/**
 * Sanitize request payload for safe logging
 */
export function sanitizeLogData(obj: any): any {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(sanitizeLogData);

  const clean: Record<string, any> = {};
  for (const [key, val] of Object.entries(obj)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) {
      clean[key] = '[REDACTED]';
    } else if (typeof val === 'object' && val !== null) {
      clean[key] = sanitizeLogData(val);
    } else {
      clean[key] = val;
    }
  }
  return clean;
}

/**
 * Safe Request Logger Middleware
 * Logs incoming HTTP method, URL path, IP, response status, and duration
 * NEVER logs passwords, tokens, cookies, or Authorization headers
 */
export const safeRequestLogger = (req: Request, res: Response, next: NextFunction): void => {
  const start = Date.now();
  const clientIp = req.ip || req.socket.remoteAddress || 'unknown';

  res.on('finish', () => {
    const duration = Date.now() - start;
    const status = res.statusCode;
    const method = req.method;
    const url = req.originalUrl || req.url;

    // Redacted safe log line
    const logPrefix = status >= 500 ? '[ERR]' : status >= 400 ? '[WARN]' : '[REQ]';
    console.log(`${logPrefix} ${new Date().toISOString()} | ${method} ${url} | ${status} | ${duration}ms | IP: ${clientIp}`);
  });

  next();
};
