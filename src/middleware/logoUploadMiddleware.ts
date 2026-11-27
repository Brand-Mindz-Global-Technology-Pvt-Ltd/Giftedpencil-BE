import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { Request, Response, NextFunction, RequestHandler } from 'express';

// Ensure uploads/settings directory exists
const SETTINGS_DIR = path.resolve(__dirname, '../../uploads/settings');
if (!fs.existsSync(SETTINGS_DIR)) {
  fs.mkdirSync(SETTINGS_DIR, { recursive: true });
}

// Allowed image MIME types
const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/svg+xml'
];

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, SETTINGS_DIR);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname).toLowerCase() || '.png';
    cb(null, `company-logo-${uniqueSuffix}${ext}`);
  }
});

const fileFilter = (_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  if (ALLOWED_MIME_TYPES.includes(file.mimetype.toLowerCase())) {
    cb(null, true);
  } else {
    cb(new Error('Only image files (JPG, PNG, GIF, SVG, WEBP) are allowed.'));
  }
};

export const logoUpload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter
});

export const handleLogoUpload = (middleware: RequestHandler): RequestHandler => {
  return (req: Request, res: Response, next: NextFunction): void => {
    middleware(req, res, (err: any) => {
      if (!err) {
        return next();
      }

      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          res.status(400).json({
            success: false,
            status: 'error',
            message: 'Logo exceeds the maximum allowed size of 5MB.'
          });
          return;
        }
        res.status(400).json({
          success: false,
          status: 'error',
          message: `Upload error: ${err.message}`
        });
        return;
      }

      res.status(400).json({
        success: false,
        status: 'error',
        message: err.message || 'Logo upload failed.'
      });
    });
  };
};
