import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'gifted_pencil',
  port: Number(process.env.DB_PORT) || 3306,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
  connectTimeout: Number(process.env.DB_CONNECT_TIMEOUT) || 10000,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

export const testConnection = async (): Promise<{ success: boolean; database?: string; message: string }> => {
  try {
    const connection = await pool.getConnection();
    try {
      const [rows] = await connection.query('SELECT DATABASE() AS current_database');
      const currentDb = (rows as any[])[0]?.current_database;
      return {
        success: true,
        database: currentDb,
        message: `Connected successfully to database "${currentDb}"`
      };
    } finally {
      connection.release();
    }
  } catch (error: any) {
    return {
      success: false,
      message: error?.message || 'Database connection error'
    };
  }
};

export default pool;
