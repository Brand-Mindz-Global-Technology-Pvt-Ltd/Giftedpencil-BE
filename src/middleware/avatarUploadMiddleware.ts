import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { Request, Response, NextFunction, RequestHandler } from 'express';

// Ensure uploads/avatars directory exists
const AVATARS_DIR = path.resolve(__dirname, '../../uploads/avatars');
if (!fs.existsSync(AVATARS_DIR)) {
  fs.mkdirSync(AVATARS_DIR, { recursive: true });
}

// Allowed image MIME types
const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/svg+xml'
];

// Configure disk storage
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, AVATARS_DIR);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname).toLowerCase() || '.png';
    cb(null, `avatar-${uniqueSuffix}${ext}`);
  }
});

// Configure file filter
const fileFilter = (_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  if (ALLOWED_MIME_TYPES.includes(file.mimetype.toLowerCase())) {
    cb(null, true);
  } else {
    cb(new Error('Only image files (JPEG, PNG, WEBP, GIF, SVG) are allowed.'));
  }
};

export const avatarUpload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter
});

export const handleAvatarUpload = (middleware: RequestHandler): RequestHandler => {
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
            message: 'Image exceeds the maximum allowed size of 5MB.'
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
        message: err.message || 'File upload failed.'
      });
    });
  };
};
