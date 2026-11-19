import { Request, Response } from 'express';
import pool from '../config/db';
import { RowDataPacket, ResultSetHeader } from 'mysql2';

interface ProductRow extends RowDataPacket {
  id: number;
  name: string;
  price: string | number;
}

interface OrderRow extends RowDataPacket {
  id: number;
  product_id: number;
  customer_name: string;
  phone: string;
  address: string;
  quantity: number;
  total_price: string | number;
  order_status: string;
  created_at: string;
}

/**
 * POST /api/orders
 * Validates order, verifies product, calculates total_price, and inserts new order
 */
export const placeOrder = async (req: Request, res: Response): Promise<void> => {
  try {
    const { product_id, customer_name, phone, address, quantity } = req.body;

    // 1. Validate required fields
    const missingFields: string[] = [];
    if (product_id === undefined || product_id === null || product_id === '') missingFields.push('product_id');
    if (!customer_name || typeof customer_name !== 'string' || !customer_name.trim()) missingFields.push('customer_name');
    if (!phone || typeof phone !== 'string' || !phone.trim()) missingFields.push('phone');
    if (!address || typeof address !== 'string' || !address.trim()) missingFields.push('address');
    if (quantity === undefined || quantity === null || quantity === '') missingFields.push('quantity');

    if (missingFields.length > 0) {
      res.status(400).json({
        status: 'error',
        message: `Missing or invalid required fields: ${missingFields.join(', ')}`
      });
      return;
    }

    const productIdNum = Number(product_id);
    if (!Number.isInteger(productIdNum) || productIdNum <= 0) {
      res.status(400).json({
        status: 'error',
        message: 'product_id must be a positive integer'
      });
      return;
    }

    const quantityNum = Number(quantity);
    if (!Number.isInteger(quantityNum) || quantityNum <= 0) {
      res.status(400).json({
        status: 'error',
        message: 'quantity must be a positive integer greater than 0'
      });
      return;
    }

    // 2. Check that the product exists in the products table
    const [productRows] = await pool.query<ProductRow[]>(
      'SELECT id, name, price FROM products WHERE id = ?',
      [productIdNum]
    );

    if (productRows.length === 0) {
      res.status(404).json({
        status: 'error',
        message: `Product with ID ${productIdNum} not found`
      });
      return;
    }

    const product = productRows[0];

    // 3. Fetch the actual product price from MySQL
    const unitPrice = typeof product.price === 'string' ? parseFloat(product.price) : Number(product.price);
    if (isNaN(unitPrice) || unitPrice < 0) {
      res.status(500).json({
        status: 'error',
        message: 'Invalid product price configured in database'
      });
      return;
    }

    // 4. Calculate total_price in the backend (price × quantity)
    const totalPrice = parseFloat((unitPrice * quantityNum).toFixed(2));

    // 5. Insert the order into the orders table with order_status set to 'Pending'
    const trimmedCustomerName = customer_name.trim();
    const trimmedPhone = phone.trim();
    const trimmedAddress = address.trim();
    const orderStatus = 'Pending';

    const [insertResult] = await pool.query<ResultSetHeader>(
      `INSERT INTO orders 
        (product_id, customer_name, phone, address, quantity, total_price, order_status) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        productIdNum,
        trimmedCustomerName,
        trimmedPhone,
        trimmedAddress,
        quantityNum,
        totalPrice,
        orderStatus
      ]
    );

    // Fetch the newly created order record to return full saved order details
    const [savedOrderRows] = await pool.query<OrderRow[]>(
      'SELECT id, product_id, customer_name, phone, address, quantity, total_price, order_status, created_at FROM orders WHERE id = ?',
      [insertResult.insertId]
    );

    const savedOrder = savedOrderRows[0] || {
      id: insertResult.insertId,
      product_id: productIdNum,
      customer_name: trimmedCustomerName,
      phone: trimmedPhone,
      address: trimmedAddress,
      quantity: quantityNum,
      total_price: totalPrice,
      order_status: orderStatus,
      created_at: new Date().toISOString()
    };

    // 7. Return the saved order details and a success message
    res.status(201).json({
      status: 'success',
      message: 'Order placed successfully',
      order: {
        id: savedOrder.id,
        product_id: savedOrder.product_id,
        customer_name: savedOrder.customer_name,
        phone: savedOrder.phone,
        address: savedOrder.address,
        quantity: savedOrder.quantity,
        total_price: typeof savedOrder.total_price === 'string' ? parseFloat(savedOrder.total_price) : savedOrder.total_price,
        order_status: savedOrder.order_status,
        created_at: savedOrder.created_at
      }
    });
  } catch (error: any) {
    console.error('[placeOrder Error]:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to place order due to server/database error',
      details: error?.message || 'Internal database error'
    });
  }
};
