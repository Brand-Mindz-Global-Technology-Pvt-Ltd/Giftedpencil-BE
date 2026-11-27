import app from './app';
import { testConnection } from './config/db';

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    // Verify database connection at startup
    const dbStatus = await testConnection();
    if (dbStatus.success) {
      console.log(`[Database]: Connected to MySQL database "${dbStatus.database}" successfully.`);
    } else {
      console.error(`[Database Error]: Failed to connect to MySQL database: ${dbStatus.message}`);
      throw new Error(`Database connection failed: ${dbStatus.message}`);
    }

    app.listen(PORT, () => {
      console.log(`[Server]: Server is running at http://localhost:${PORT}`);
      console.log(`[Server]: API endpoints documentation at http://localhost:${PORT}/`);
      console.log(`[Server]: Health check available at http://localhost:${PORT}/api/health`);
    });
  } catch (error) {
    console.error('[Server Error]: Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
