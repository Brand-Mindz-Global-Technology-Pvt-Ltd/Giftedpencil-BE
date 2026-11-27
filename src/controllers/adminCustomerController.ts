import { Request, Response } from 'express';
import { AdminCustomerService } from '../services/adminCustomerService';

export class AdminCustomerController {
  /**
   * GET /api/admin/customers
   * Also supports /get-all alias
   */
  public static async listCustomers(req: Request, res: Response): Promise<void> {
    try {
      const {
        page = 1,
        limit = 10,
        search,
        name,
        email,
        phone,
        customerId,
        status,
        sortBy,
        sortOrder
      } = req.query;

      const result = await AdminCustomerService.listCustomers({
        page: Number(page) || 1,
        limit: Number(limit) || 10,
        search: typeof search === 'string' ? search : undefined,
        name: typeof name === 'string' ? name : undefined,
        email: typeof email === 'string' ? email : undefined,
        phone: typeof phone === 'string' ? phone : undefined,
        customerId: typeof customerId === 'string' ? customerId : undefined,
        status: typeof status === 'string' ? status : undefined,
        sortBy: typeof sortBy === 'string' ? sortBy : undefined,
        sortOrder: typeof sortOrder === 'string' && sortOrder.toLowerCase() === 'asc' ? 'asc' : 'desc'
      });

      res.status(200).json({
        status: 'success',
        data: result.customers,
        customers: result.customers,
        pagination: result.pagination
      });
    } catch (error: any) {
      console.error('[AdminCustomerController.listCustomers] Error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Failed to retrieve customers',
        details: error?.message || 'Internal server error'
      });
    }
  }

  /**
   * GET /api/admin/customers/export
   */
  public static async exportCustomers(req: Request, res: Response): Promise<void> {
    try {
      const { search, name, email, phone, customerId, status, sortBy, sortOrder } = req.query;

      const csvContent = await AdminCustomerService.generateCustomersCsv({
        search: typeof search === 'string' ? search : undefined,
        name: typeof name === 'string' ? name : undefined,
        email: typeof email === 'string' ? email : undefined,
        phone: typeof phone === 'string' ? phone : undefined,
        customerId: typeof customerId === 'string' ? customerId : undefined,
        status: typeof status === 'string' ? status : undefined,
        sortBy: typeof sortBy === 'string' ? sortBy : undefined,
        sortOrder: typeof sortOrder === 'string' && sortOrder.toLowerCase() === 'asc' ? 'asc' : 'desc'
      });

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="customers.csv"');
      res.status(200).send(csvContent);
    } catch (error: any) {
      console.error('[AdminCustomerController.exportCustomers] Error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Failed to export customers',
        details: error?.message || 'Internal server error'
      });
    }
  }

  /**
   * GET /api/admin/customers/:customerId
   */
  public static async getCustomerById(req: Request, res: Response): Promise<void> {
    try {
      const customerId = String(req.params.customerId || '');
      if (!customerId) {
        res.status(400).json({
          status: 'error',
          message: 'Customer identifier is required'
        });
        return;
      }

      const customer = await AdminCustomerService.getCustomerById(customerId);
      if (!customer) {
        res.status(404).json({
          status: 'error',
          message: `Customer with identifier '${customerId}' was not found`
        });
        return;
      }

      res.status(200).json({
        status: 'success',
        data: customer,
        customer,
        addresses: customer.addresses,
        stats: customer.stats
      });
    } catch (error: any) {
      console.error('[AdminCustomerController.getCustomerById] Error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Failed to retrieve customer details',
        details: error?.message || 'Internal server error'
      });
    }
  }

  /**
   * GET /api/admin/customers/:customerId/orders
   */
  public static async getCustomerOrders(req: Request, res: Response): Promise<void> {
    try {
      const customerId = String(req.params.customerId || '');
      const { page = 1, limit = 10 } = req.query;

      if (!customerId) {
        res.status(400).json({
          status: 'error',
          message: 'Customer identifier is required'
        });
        return;
      }

      const customer = await AdminCustomerService.getCustomerById(customerId);
      if (!customer) {
        res.status(404).json({
          status: 'error',
          message: `Customer with identifier '${customerId}' was not found`
        });
        return;
      }

      const result = await AdminCustomerService.getCustomerOrders(
        customer.id,
        Number(page) || 1,
        Number(limit) || 10
      );

      res.status(200).json({
        status: 'success',
        data: result.orders,
        orders: result.orders,
        pagination: result.pagination
      });
    } catch (error: any) {
      console.error('[AdminCustomerController.getCustomerOrders] Error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Failed to retrieve customer orders',
        details: error?.message || 'Internal server error'
      });
    }
  }

  /**
   * PATCH /api/admin/customers/:customerId/status
   */
  public static async updateCustomerStatus(req: Request, res: Response): Promise<void> {
    try {
      const customerId = String(req.params.customerId || '');
      const { status } = req.body;

      if (!customerId) {
        res.status(400).json({
          status: 'error',
          message: 'Customer identifier is required'
        });
        return;
      }

      if (!status || typeof status !== 'string') {
        res.status(400).json({
          status: 'error',
          message: 'Valid status string is required (Active, Inactive, Blocked)'
        });
        return;
      }

      const updated = await AdminCustomerService.updateCustomerStatus(customerId, status);
      if (!updated) {
        res.status(404).json({
          status: 'error',
          message: `Customer with identifier '${customerId}' was not found`
        });
        return;
      }

      res.status(200).json({
        status: 'success',
        message: 'Customer status updated successfully',
        data: updated,
        customer: updated
      });
    } catch (error: any) {
      console.error('[AdminCustomerController.updateCustomerStatus] Error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Failed to update customer status',
        details: error?.message || 'Internal server error'
      });
    }
  }
}
