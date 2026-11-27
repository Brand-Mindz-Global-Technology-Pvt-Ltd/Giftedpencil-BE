import { Request, Response } from 'express';
import { AdminContactService } from '../services/adminContactService';

export class AdminContactController {
  /**
   * GET /api/admin/contacts
   * Paginated list with search, status filtering, and sorting
   */
  public static async listContacts(req: Request, res: Response): Promise<void> {
    try {
      const {
        page = 1,
        limit = 10,
        search,
        status,
        sortBy,
        sortOrder
      } = req.query;

      const result = await AdminContactService.listContacts({
        page: Number(page) || 1,
        limit: Number(limit) || 10,
        search: typeof search === 'string' ? search : undefined,
        status: typeof status === 'string' ? status : undefined,
        sortBy: typeof sortBy === 'string' ? sortBy : undefined,
        sortOrder: typeof sortOrder === 'string' && sortOrder.toLowerCase() === 'asc' ? 'asc' : 'desc'
      });

      res.status(200).json({
        status: 'success',
        data: result.contacts,
        contacts: result.contacts,
        pagination: result.pagination
      });
    } catch (error: any) {
      console.error('[AdminContactController.listContacts] Error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Failed to retrieve contact enquiries',
        details: error?.message || 'Internal server error'
      });
    }
  }

  /**
   * GET /api/admin/contacts/:id
   * Single enquiry details
   */
  public static async getContactById(req: Request, res: Response): Promise<void> {
    try {
      const id = String(req.params.id || '');
      const numId = Number(id);

      if (!id || isNaN(numId) || numId <= 0) {
        res.status(400).json({
          status: 'error',
          message: 'Valid numeric enquiry ID is required'
        });
        return;
      }

      const contact = await AdminContactService.getContactById(numId);
      if (!contact) {
        res.status(404).json({
          status: 'error',
          message: `Contact enquiry with ID '${id}' was not found`
        });
        return;
      }

      res.status(200).json({
        status: 'success',
        data: contact,
        contact
      });
    } catch (error: any) {
      console.error('[AdminContactController.getContactById] Error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Failed to retrieve enquiry details',
        details: error?.message || 'Internal server error'
      });
    }
  }

  /**
   * PATCH /api/admin/contacts/:id/status
   * Update enquiry status and optional admin notes
   */
  public static async updateContactStatus(req: Request, res: Response): Promise<void> {
    try {
      const id = String(req.params.id || '');
      const numId = Number(id);
      const { status, adminNotes } = req.body;

      if (!id || isNaN(numId) || numId <= 0) {
        res.status(400).json({
          status: 'error',
          message: 'Valid numeric enquiry ID is required'
        });
        return;
      }

      if (!status || typeof status !== 'string') {
        res.status(400).json({
          status: 'error',
          message: 'Status string is required (allowed: new, in_progress, resolved, archived)'
        });
        return;
      }

      const updated = await AdminContactService.updateContactStatus(
        numId,
        status,
        typeof adminNotes === 'string' ? adminNotes : undefined
      );

      if (!updated) {
        res.status(404).json({
          status: 'error',
          message: `Contact enquiry with ID '${id}' was not found`
        });
        return;
      }

      res.status(200).json({
        status: 'success',
        message: 'Enquiry status updated successfully',
        data: updated,
        contact: updated
      });
    } catch (error: any) {
      console.error('[AdminContactController.updateContactStatus] Error:', error);
      const isClientError = error?.message?.includes('Invalid status');
      res.status(isClientError ? 400 : 500).json({
        status: 'error',
        message: error?.message || 'Failed to update enquiry status'
      });
    }
  }
}
