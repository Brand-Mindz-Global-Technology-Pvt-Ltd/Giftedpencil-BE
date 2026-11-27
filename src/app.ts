import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import pool, { testConnection } from './config/db';
import productRoutes from './routes/productRoutes';
import cartRoutes from './routes/cartRoutes';
import addressRoutes from './routes/addressRoutes';
import paymentRoutes from './routes/paymentRoutes';
import profileRoutes from './routes/profileRoutes';
import orderRoutes from './routes/orderRoutes';
import shippingRoutes from './routes/shippingRoutes';
import authRoutes from './routes/authRoutes';
import wishlistRoutes from './routes/wishlistRoutes';
import contactRoutes from './routes/contactRoutes';
import adminAuthRoutes from './routes/adminAuthRoutes';
import adminDashboardRoutes from './routes/adminDashboardRoutes';
import adminProductRoutes from './routes/adminProductRoutes';
import adminOrderRoutes from './routes/adminOrderRoutes';
import adminCustomerRoutes from './routes/adminCustomerRoutes';
import adminContactRoutes from './routes/adminContactRoutes';
import adminInventoryRoutes from './routes/adminInventoryRoutes';
import adminBannerRoutes from './routes/adminBannerRoutes';
import adminSettingsRoutes from './routes/adminSettingsRoutes';
import publicPolicyRoutes from './routes/publicPolicyRoutes';
import { ProductController } from './controllers/productController';
import helmet from 'helmet';
import { safeRequestLogger } from './middleware/loggingMiddleware';
import { centralizedErrorHandler } from './middleware/errorHandlerMiddleware';
import { apiRateLimiter } from './middleware/rateLimitMiddleware';
import path from 'path';

dotenv.config();

const app: Application = express();

// Helmet security headers (with cross-origin resource policy for frontend assets)
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
    contentSecurityPolicy: false // Content-Security-Policy is managed by frontend host
  })
);

// Safe request logger (sanitizes credentials, tokens, cookies)
app.use(safeRequestLogger);

// CORS configuration supporting local dev and live production domains
const configuredOrigins = process.env.FRONTEND_URL
  ? process.env.FRONTEND_URL.split(',').map(o => o.trim()).filter(Boolean)
  : [];

const defaultAllowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:3000',
  'https://thegiftedpencil.com',
  'https://www.thegiftedpencil.com'
];

const allowedOrigins = Array.from(new Set([...defaultAllowedOrigins, ...configuredOrigins]));

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow non-browser requests or same-origin requests without Origin header
      if (!origin) {
        return callback(null, true);
      }
      if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
        return callback(null, true);
      }
      return callback(new Error(`Origin ${origin} not allowed by CORS`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept']
  })
);

// General API rate limiting (protects /api endpoints from volumetric scraping/abuse)
app.use('/api', apiRateLimiter);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve uploaded assets statically (uploads/products)
const uploadsDir = path.resolve(__dirname, '../uploads');
app.use('/uploads', express.static(uploadsDir));

// Root info endpoint - Documents core API modules & health checks
app.get('/', (_req: Request, res: Response) => {
  res.status(200).json({
    name: 'The Gifted Pencil Modular Backend API',
    status: 'active',
    mode: 'production_ready',
    version: '2.0.0',
    modules: {
      auth: {
        register: 'POST /api/auth/register',
        login: 'POST /api/auth/login',
        logout: 'POST /api/auth/logout',
        forgot_password: 'POST /api/auth/forgot-password',
        reset_password: 'POST /api/auth/reset-password',
        me: 'GET /api/auth/me'
      },
      products: {
        list: 'GET /api/products?search=&category=&in_stock=&min_price=&max_price=&sort_by=&page=&limit=',
        details: 'GET /api/products/:idOrSlug'
      },
      categories: {
        list: 'GET /api/categories'
      },
      cart: {
        get: 'GET /api/cart',
        add: 'POST /api/cart/items',
        update: 'PUT /api/cart/items/:id',
        remove: 'DELETE /api/cart/items/:id',
        clear: 'DELETE /api/cart'
      },
      wishlist: {
        get: 'GET /api/wishlist',
        add: 'POST /api/wishlist',
        remove: 'DELETE /api/wishlist/:productId',
        clear: 'DELETE /api/wishlist',
        move_to_cart: 'POST /api/wishlist/move-to-cart/:productId'
      },
      address: {
        list: 'GET /api/addresses',
        get_by_id: 'GET /api/addresses/:id',
        create: 'POST /api/addresses',
        update: 'PUT /api/addresses/:id',
        delete: 'DELETE /api/addresses/:id',
        set_default: 'PUT /api/addresses/:id/default',
        validate: 'POST /api/addresses/validate'
      },
      payment: {
        methods: 'GET /api/payment/methods',
        create_order: 'POST /api/payment/create-order',
        verify: 'POST /api/payment/verify'
      },
      profile: {
        get: 'GET /api/profile',
        update: 'PUT /api/profile',
        change_password: 'PUT /api/profile/password'
      },
      contact: {
        submit: 'POST /api/contact',
        list: 'GET /api/contact'
      },
      orders: {
        place_quick: 'POST /api/orders',
        checkout: 'POST /api/orders/checkout',
        my_orders: 'GET /api/orders/my-orders',
        details: 'GET /api/orders/:id',
        track: 'GET /api/orders/track/:orderRef',
        verify_payment: 'POST /api/orders/verify-payment'
      },
      shipping: {
        pincode_check: 'POST /api/shipping/check-pincode'
      },
      system: {
        health: 'GET /api/health',
        db_test: 'GET /api/db-test'
      }
    }
  });
});

// Health check endpoint
app.get('/api/health', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    message: 'Server is running',
    timestamp: new Date().toISOString()
  });
});

// Database connection verification endpoint
app.get('/api/db-test', async (_req: Request, res: Response) => {
  try {
    const connectionResult = await testConnection();
    if (!connectionResult.success) {
      res.status(500).json({
        status: 'error',
        message: 'Database connection failed',
        details: connectionResult.message
      });
      return;
    }

    const [tables] = await pool.query('SHOW TABLES');

    res.status(200).json({
      status: 'success',
      message: 'Database connection verified successfully',
      database: connectionResult.database,
      tables
    });
  } catch (error: any) {
    res.status(500).json({
      status: 'error',
      message: 'Database query failed',
      details: error?.message || 'Unknown database error'
    });
  }
});

// Resource routes (Explicit resource endpoints mounted BEFORE parameterized routes)
app.use('/api/auth', authRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/wishlist', wishlistRoutes);
app.use('/api/addresses', addressRoutes);
app.use('/api/address', addressRoutes); // alias for singular /api/address
app.use('/api/payment', paymentRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/contact', contactRoutes);

// Product catalog routes
app.get('/api/categories', ProductController.getCategories);
app.use('/api/products', productRoutes);
app.use('/api/product', productRoutes); // alias for singular /api/product

// Existing backward-compatibility routes
app.use('/api/orders', orderRoutes);
app.use('/api/shipping', shippingRoutes);

// Admin Authentication routes
app.use('/api/admin/auth', adminAuthRoutes);
app.use('/auth', adminAuthRoutes); // Direct alias for frontend admin /auth/login calls
app.use('/admin', adminAuthRoutes); // Alias for /admin/:adminId/profile calls

// Admin Dashboard routes
app.use('/api/admin/dashboard', adminDashboardRoutes);
app.use('/dashboard', adminDashboardRoutes); // Direct alias for frontend admin /dashboard/* calls

// Admin Products routes
app.use('/api/admin/products', adminProductRoutes);
app.use('/products', adminProductRoutes); // Direct alias for frontend admin /products/* calls

// Admin Orders routes
app.use('/api/admin/orders', adminOrderRoutes);
app.use('/admin/orders', adminOrderRoutes); // Direct alias for frontend admin /admin/orders calls

// Admin Customers routes
app.use('/api/admin/customers', adminCustomerRoutes);
app.use('/admin/customers', adminCustomerRoutes); // Direct alias for frontend admin /admin/customers calls
app.use('/customers', adminCustomerRoutes); // Direct alias for frontend admin /customers calls

// Admin Contact Enquiries routes
app.use('/api/admin/contacts', adminContactRoutes);
app.use('/admin/contacts', adminContactRoutes); // Direct alias for frontend admin /admin/contacts calls
app.use('/contacts', adminContactRoutes); // Direct alias for frontend admin /contacts calls

// Admin Inventory routes
app.use('/api/admin/inventory', adminInventoryRoutes);
app.use('/admin/inventory', adminInventoryRoutes); // Direct alias for frontend admin /admin/inventory calls
app.use('/inventory', adminInventoryRoutes); // Direct alias for frontend admin /inventory calls

// Admin Banners routes
app.use('/api/admin/banners', adminBannerRoutes);
app.use('/admin/banners', adminBannerRoutes); // Direct alias for frontend admin /admin/banners calls
app.use('/banners', adminBannerRoutes); // Direct alias for frontend admin /banners calls
app.use('/banner', adminBannerRoutes); // Direct alias for legacy frontend /banner calls

// Admin Settings routes
app.use('/api/admin/settings', adminSettingsRoutes);
app.use('/settings', adminSettingsRoutes); // Direct alias for frontend /settings/* calls

// Public Policies route for customer storefront
app.use('/api/policies', publicPolicyRoutes);
app.use('/policies', publicPolicyRoutes); // Alias

// Fallback for undefined routes
app.use((_req: Request, res: Response) => {
  res.status(404).json({
    status: 'error',
    message: 'API endpoint not found'
  });
});

// Centralized Express error handler (consistent JSON, no leaked internals)
app.use(centralizedErrorHandler);

export default app;
