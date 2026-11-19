import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import pool, { testConnection } from './config/db';
import productRoutes from './routes/productRoutes';
import orderRoutes from './routes/orderRoutes';

dotenv.config();

const app: Application = express();

// CORS configuration for frontend origin
const allowedOrigin = process.env.FRONTEND_URL || 'http://localhost:5173';
app.use(
  cors({
    origin: allowedOrigin,
    credentials: true
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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

// Resource routes
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);

export default app;
