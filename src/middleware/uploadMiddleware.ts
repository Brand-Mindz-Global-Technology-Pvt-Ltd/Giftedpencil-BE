import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { Request, Response, NextFunction, RequestHandler } from 'express';

// Ensure uploads/products directory exists
const UPLOADS_DIR = path.resolve(__dirname, '../../uploads/products');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Allowed image MIME types
const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif'
];

// Configure disk storage
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname).toLowerCase() || '.png';
    cb(null, `product-${uniqueSuffix}${ext}`);
  }
});

// Configure file filter
const fileFilter = (_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  if (ALLOWED_MIME_TYPES.includes(file.mimetype.toLowerCase())) {
    cb(null, true);
  } else {
    cb(new Error('Only image files (JPEG, PNG, WEBP, GIF, AVIF) are allowed.'));
  }
};

// Multer instance with 5MB file size limit and up to 8 files
export const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB per file
    files: 8
  },
  fileFilter
});

// Error handling wrapper middleware
export const handleUploadErrors = (middleware: RequestHandler): RequestHandler => {
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
            message: 'Maximum 8 images allowed per product.'
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
        message: err.message || 'Image upload failed'
      });
    });
  };
};
