import pool from '../config/db';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import {
  AdminContactQueryParams,
  AdminContactItem,
  AdminContactsListResult,
  ContactStatus
} from '../types/adminContact';

export const VALID_CONTACT_STATUSES: ContactStatus[] = ['new', 'in_progress', 'resolved', 'archived'];

export class AdminContactRepository {
  /**
   * Helper to format database status enum into human-readable label
   */
  public static normalizeStatusLabel(status: string): string {
    const s = String(status || 'new').trim().toLowerCase();
    switch (s) {
      case 'in_progress':
        return 'In Progress';
      case 'resolved':
        return 'Resolved';
      case 'archived':
        return 'Archived';
      case 'new':
      default:
        return 'New';
    }
  }

  /**
   * Helper to parse input status into valid DB enum value
   */
  public static parseStatus(input?: string | null): ContactStatus | null {
    if (!input) return null;
    const s = input.trim().toLowerCase().replace(/[\s-]+/g, '_');
    if (VALID_CONTACT_STATUSES.includes(s as ContactStatus)) {
      return s as ContactStatus;
    }
    return null;
  }

  /**
   * Map database row to AdminContactItem domain object
   */
  public static mapRowToContact(row: any): AdminContactItem {
    const rawStatus = (row.status || 'new').toLowerCase() as ContactStatus;
    const numId = Number(row.id);

    return {
      id: numId,
      _id: numId,
      name: String(row.name || ''),
      email: String(row.email || ''),
      phone: row.phone ? String(row.phone) : null,
      enquiryType: String(row.enquiry_type || 'General Enquiry'),
      subject: row.subject ? String(row.subject) : null,
      message: String(row.message || ''),
      status: rawStatus,
      statusLabel: AdminContactRepository.normalizeStatusLabel(rawStatus),
      adminNotes: row.admin_notes ? String(row.admin_notes) : null,
      createdAt: row.created_at instanceof Date
        ? row.created_at.toISOString()
        : String(row.created_at || new Date().toISOString()),
      updatedAt: row.updated_at instanceof Date
        ? row.updated_at.toISOString()
        : String(row.updated_at || new Date().toISOString())
    };
  }

  /**
   * Find enquiries with search, status filtering, sorting, and pagination
   */
  public static async findContacts(params: AdminContactQueryParams): Promise<AdminContactsListResult> {
    const whereConditions: string[] = [];
    const queryParams: any[] = [];

    // Status filter
    if (params.status && params.status.trim() && params.status.trim().toLowerCase() !== 'all') {
      const parsed = AdminContactRepository.parseStatus(params.status);
      if (parsed) {
        whereConditions.push('status = ?');
        queryParams.push(parsed);
      }
    }

    // Search filter across customer name, email, phone, message, and subject
    if (params.search && params.search.trim()) {
      const q = `%${params.search.trim().toLowerCase()}%`;
      whereConditions.push(
        '(LOWER(name) LIKE ? OR LOWER(email) LIKE ? OR LOWER(COALESCE(phone, \'\')) LIKE ? OR LOWER(message) LIKE ? OR LOWER(COALESCE(subject, \'\')) LIKE ?)'
      );
      queryParams.push(q, q, q, q, q);
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    // Total count query
    const countSql = `SELECT COUNT(*) AS total FROM contacts ${whereClause}`;
    const [countRows] = await pool.query<RowDataPacket[]>(countSql, queryParams);
    const total = Number(countRows[0]?.total || 0);

    // Sorting
    const sortBy = String(params.sortBy || 'newest').trim().toLowerCase();
    const sortOrder = String(params.sortOrder || 'desc').trim().toLowerCase() === 'asc' ? 'ASC' : 'DESC';

    let orderClause = 'ORDER BY created_at DESC, id DESC';
    if (sortBy === 'oldest') {
      orderClause = 'ORDER BY created_at ASC, id ASC';
    } else if (sortBy === 'newest') {
      orderClause = 'ORDER BY created_at DESC, id DESC';
    } else if (sortBy === 'name') {
      orderClause = `ORDER BY name ${sortOrder}, id DESC`;
    } else if (sortBy === 'email') {
      orderClause = `ORDER BY email ${sortOrder}, id DESC`;
    }

    // Pagination
    const page = Math.max(1, Number(params.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(params.limit) || 10));
    const offset = (page - 1) * limit;
    const totalPages = Math.ceil(total / limit) || 1;

    // Fetch master rows
    const fetchSql = `
      SELECT * 
      FROM contacts 
      ${whereClause} 
      ${orderClause} 
      LIMIT ? OFFSET ?
    `;

    const [rows] = await pool.query<RowDataPacket[]>(fetchSql, [...queryParams, limit, offset]);
    const contacts = rows.map(r => AdminContactRepository.mapRowToContact(r));

    return {
      contacts,
      pagination: {
        page,
        limit,
        total,
        totalPages
      }
    };
  }

  /**
   * Find single contact submission by numeric ID
   */
  public static async findById(id: number | string): Promise<AdminContactItem | null> {
    const numId = Number(id);
    if (isNaN(numId) || numId <= 0) return null;

    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT * FROM contacts WHERE id = ? LIMIT 1',
      [numId]
    );

    if (rows.length === 0) return null;
    return AdminContactRepository.mapRowToContact(rows[0]);
  }

  /**
   * Update enquiry status and optional admin notes
   */
  public static async updateStatus(
    id: number | string,
    status: ContactStatus,
    adminNotes?: string | null
  ): Promise<AdminContactItem | null> {
    const numId = Number(id);
    if (isNaN(numId) || numId <= 0) return null;

    let updateSql = 'UPDATE contacts SET status = ?, updated_at = NOW() WHERE id = ?';
    let params: any[] = [status, numId];

    if (adminNotes !== undefined) {
      updateSql = 'UPDATE contacts SET status = ?, admin_notes = ?, updated_at = NOW() WHERE id = ?';
      params = [status, adminNotes ? adminNotes.trim() : null, numId];
    }

    const [result] = await pool.query<ResultSetHeader>(updateSql, params);
    if (result.affectedRows === 0) {
      return null;
    }

    return AdminContactRepository.findById(numId);
  }
}
