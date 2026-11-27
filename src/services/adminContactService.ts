import { AdminContactRepository } from '../repositories/adminContactRepository';
import {
  AdminContactQueryParams,
  AdminContactsListResult,
  AdminContactItem,
  ContactStatus
} from '../types/adminContact';

export class AdminContactService {
  /**
   * Retrieve paginated list of enquiries
   */
  public static async listContacts(params: AdminContactQueryParams): Promise<AdminContactsListResult> {
    return AdminContactRepository.findContacts(params);
  }

  /**
   * Retrieve single enquiry by ID
   */
  public static async getContactById(id: number | string): Promise<AdminContactItem | null> {
    return AdminContactRepository.findById(id);
  }

  /**
   * Update enquiry status and optional admin notes
   */
  public static async updateContactStatus(
    id: number | string,
    rawStatus: string,
    adminNotes?: string | null
  ): Promise<AdminContactItem | null> {
    const parsedStatus = AdminContactRepository.parseStatus(rawStatus);
    if (!parsedStatus) {
      throw new Error(`Invalid status: '${rawStatus}'. Allowed statuses are: new, in_progress, resolved, archived`);
    }

    return AdminContactRepository.updateStatus(id, parsedStatus, adminNotes);
  }
}
