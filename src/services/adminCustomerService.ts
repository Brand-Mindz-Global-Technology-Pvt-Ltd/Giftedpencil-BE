import { AdminCustomerRepository } from '../repositories/adminCustomerRepository';
import {
  AdminCustomerQueryParams,
  AdminCustomersListResult,
  AdminCustomerDetails,
  CustomerAccountStatus
} from '../types/adminCustomer';

export class AdminCustomerService {
  /**
   * Escape fields for CSV export to protect against spreadsheet formula injection
   */
  public static sanitizeCsvCell(value: any): string {
    if (value === null || value === undefined) return '';
    let str = String(value).trim();

    // Prevent CSV formula injection
    if (/^[=+\-@\t\r]/.test(str)) {
      str = `'${str}`;
    }

    // Escape quotes and wrap in quotes if contains comma, quote, or newline
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  }

  /**
   * Retrieve paginated list of customers
   */
  public static async listCustomers(params: AdminCustomerQueryParams): Promise<AdminCustomersListResult> {
    return AdminCustomerRepository.findCustomers(params);
  }

  /**
   * Retrieve full details of single customer
   */
  public static async getCustomerById(idOrUuid: string | number): Promise<AdminCustomerDetails | null> {
    return AdminCustomerRepository.findCustomerById(idOrUuid);
  }

  /**
   * Retrieve order history of single customer
   */
  public static async getCustomerOrders(
    userId: number,
    page: number = 1,
    limit: number = 10
  ): Promise<{ orders: any[]; pagination: { page: number; limit: number; total: number; totalPages: number } }> {
    return AdminCustomerRepository.findCustomerOrders(userId, page, limit);
  }

  /**
   * Update customer account status
   */
  public static async updateCustomerStatus(
    idOrUuid: string | number,
    newStatus: string
  ): Promise<AdminCustomerDetails | null> {
    const validStatus = AdminCustomerRepository.denormalizeStatus(newStatus);
    return AdminCustomerRepository.updateCustomerStatus(idOrUuid, validStatus);
  }

  /**
   * Export customers as CSV string
   */
  public static async generateCustomersCsv(params: AdminCustomerQueryParams): Promise<string> {
    const customers = await AdminCustomerRepository.exportCustomers(params);

    const headers = [
      'Customer ID',
      'Name',
      'Email',
      'Phone',
      'Status',
      'Total Orders',
      'Total Spent (INR)',
      'Latest Order Date',
      'Registered Date'
    ];

    const lines = [headers.join(',')];

    for (const c of customers) {
      const row = [
        AdminCustomerService.sanitizeCsvCell(c.customerId),
        AdminCustomerService.sanitizeCsvCell(c.name),
        AdminCustomerService.sanitizeCsvCell(c.email),
        AdminCustomerService.sanitizeCsvCell(c.phone),
        AdminCustomerService.sanitizeCsvCell(c.status),
        AdminCustomerService.sanitizeCsvCell(c.totalOrders),
        AdminCustomerService.sanitizeCsvCell(c.totalSpent.toFixed(2)),
        AdminCustomerService.sanitizeCsvCell(c.latestOrderDate ? new Date(c.latestOrderDate).toLocaleString() : 'N/A'),
        AdminCustomerService.sanitizeCsvCell(new Date(c.createdAt).toLocaleString())
      ];
      lines.push(row.join(','));
    }

    return lines.join('\r\n');
  }
}
