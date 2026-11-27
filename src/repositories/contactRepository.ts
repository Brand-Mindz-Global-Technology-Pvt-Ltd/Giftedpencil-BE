import pool from '../config/db';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { ContactSubmission } from '../types';

export interface CreateContactParams {
  name: string;
  email: string;
  phone?: string | null;
  subject?: string | null;
  message: string;
  enquiry_type?: string;
}

export class ContactRepository {
  /**
   * Map row to ContactSubmission domain object
   */
  public static mapRowToSubmission(row: any): ContactSubmission {
    return {
      id: String(row.id),
      name: row.name,
      email: row.email,
      phone: row.phone || undefined,
      subject: row.subject || undefined,
      message: row.message,
      created_at: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString()
    };
  }

  /**
   * Insert contact enquiry into MySQL contacts table
   */
  public static async createSubmission(data: CreateContactParams): Promise<ContactSubmission> {
    const sql = `
      INSERT INTO contacts (
        name, email, phone, enquiry_type, subject, message, status
      ) VALUES (?, ?, ?, ?, ?, ?, 'new')
    `;

    const enquiryType = data.enquiry_type || 'General Enquiry';

    const [result] = await pool.query<ResultSetHeader>(sql, [
      data.name.trim(),
      data.email.trim(),
      data.phone ? data.phone.trim() : null,
      enquiryType,
      data.subject ? data.subject.trim() : null,
      data.message.trim()
    ]);

    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT * FROM contacts WHERE id = ? LIMIT 1',
      [result.insertId]
    );

    return this.mapRowToSubmission(rows[0]);
  }

  /**
   * Find contact submission by ID
   */
  public static async findById(id: string | number): Promise<ContactSubmission | null> {
    const numId = Number(id);
    if (isNaN(numId) || numId <= 0) return null;

    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT * FROM contacts WHERE id = ? LIMIT 1',
      [numId]
    );

    if (rows.length === 0) return null;

    return this.mapRowToSubmission(rows[0]);
  }

  /**
   * Retrieve all contact submissions
   */
  public static async findAll(): Promise<ContactSubmission[]> {
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT * FROM contacts ORDER BY created_at DESC'
    );

    return rows.map(r => this.mapRowToSubmission(r));
  }
}
