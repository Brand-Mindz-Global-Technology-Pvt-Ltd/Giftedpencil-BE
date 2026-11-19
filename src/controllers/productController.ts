import { Request, Response } from 'express';
import pool from '../config/db';
import { RowDataPacket } from 'mysql2';

interface ProductRow extends RowDataPacket {
  id: number;
  name: string;
  price: string | number;
  description: string | null;
  image: string | null;
}

/**
 * GET /api/products
 * Fetches all products from MySQL products table
 */
export const getProducts = async (_req: Request, res: Response): Promise<void> => {
  try {
    const [rows] = await pool.query<ProductRow[]>(
      'SELECT id, name, price, description, image FROM products ORDER BY id ASC'
    );

    // Format products and return empty array if table is empty
    const products = rows.map((item) => ({
      id: item.id,
      name: item.name,
      price: typeof item.price === 'string' ? parseFloat(item.price) : item.price,
      description: item.description,
      image: item.image
    }));

    res.status(200).json(products);
  } catch (error: any) {
    console.error('[getProducts Error]:', error);
    res.status(500).json({
      status: 'error',
      message: '',
      details: error?.message || 'Internal database error'
    });
  }
};
