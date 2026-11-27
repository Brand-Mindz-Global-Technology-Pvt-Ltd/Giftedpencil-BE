import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { Request, Response, NextFunction, RequestHandler } from 'express';

// Ensure uploads/banners directory exists
const BANNER_UPLOADS_DIR = path.resolve(__dirname, '../../uploads/banners');
if (!fs.existsSync(BANNER_UPLOADS_DIR)) {
  fs.mkdirSync(BANNER_UPLOADS_DIR, { recursive: true });
}

// Allowed image MIME types and extensions
const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif'
];

const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif'];

// Configure disk storage for banners
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, BANNER_UPLOADS_DIR);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname).toLowerCase() || '.png';
    cb(null, `banner-${uniqueSuffix}${ext}`);
  }
});

// Configure file filter
const fileFilter = (_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const mime = file.mimetype.toLowerCase();
  const ext = path.extname(file.originalname).toLowerCase();

  if (ALLOWED_MIME_TYPES.includes(mime) && ALLOWED_EXTENSIONS.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error('Only image files (JPEG, PNG, WEBP, GIF, AVIF) are allowed.'));
  }
};

// Multer instance for single banner upload with 5MB limit
export const uploadBanner = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
    files: 1
  },
  fileFilter
});

// Error handling wrapper middleware for banner upload
export const handleBannerUploadErrors = (middleware: RequestHandler): RequestHandler => {
  return (req: Request, res: Response, next: NextFunction): void => {
    middleware(req, res, (err: any) => {
      if (!err) {
        return next();
      }

      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          res.status(400).json({
            success: false,
            message: 'File size exceeds 5MB limit. Please upload a smaller image.'
          });
          return;
        }
        if (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE') {
          res.status(400).json({
            success: false,
            message: 'Only 1 image file is allowed per banner upload.'
          });
          return;
        }
        res.status(400).json({
          success: false,
          message: `Upload error: ${err.message}`
        });
        return;
      }

      res.status(400).json({
        success: false,
        message: err.message || 'Banner image upload failed'
      });
    });
  };
};
