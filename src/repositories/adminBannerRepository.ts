import { RowDataPacket, ResultSetHeader } from 'mysql2';
import pool from '../config/db';
import { Banner, BannerFilters, CreateBannerInput, UpdateBannerInput } from '../types/adminBanner';

export class AdminBannerRepository {
  static async findAll(filters: BannerFilters): Promise<{ banners: Banner[]; total: number }> {
    const page = Math.max(1, Number(filters.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(filters.limit) || 20));
    const offset = (page - 1) * limit;

    const whereClauses: string[] = [];
    const params: any[] = [];

    if (filters.is_active !== undefined) {
      whereClauses.push('is_active = ?');
      params.push(filters.is_active ? 1 : 0);
    }

    if (filters.search && filters.search.trim()) {
      whereClauses.push('(title LIKE ? OR subtitle LIKE ? OR cta_text LIKE ?)');
      const term = `%${filters.search.trim()}%`;
      params.push(term, term, term);
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const countSql = `SELECT COUNT(*) AS total FROM banners ${whereSql}`;
    const [countRows] = await pool.query<RowDataPacket[]>(countSql, params);
    const total = Number(countRows[0]?.total || 0);

    const sortField = filters.sort_by === 'created_at'
      ? 'created_at'
      : filters.sort_by === 'id'
      ? 'id'
      : 'sort_order';
    const sortDir = filters.sort_dir === 'DESC' ? 'DESC' : 'ASC';

    // Order by primary sort field, then secondary created_at DESC
    const orderBySql = `ORDER BY ${sortField} ${sortDir}, created_at DESC`;
    const dataSql = `SELECT * FROM banners ${whereSql} ${orderBySql} LIMIT ? OFFSET ?`;

    const [rows] = await pool.query<RowDataPacket[]>(dataSql, [...params, limit, offset]);

    return {
      banners: rows as Banner[],
      total
    };
  }

  static async findById(id: number): Promise<Banner | null> {
    const sql = `SELECT * FROM banners WHERE id = ? LIMIT 1`;
    const [rows] = await pool.query<RowDataPacket[]>(sql, [id]);
    if (!rows || rows.length === 0) {
      return null;
    }
    return rows[0] as Banner;
  }

  static async create(data: CreateBannerInput): Promise<Banner> {
    const sql = `
      INSERT INTO banners (title, subtitle, image, cta_text, cta_link, sort_order, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;
    const params = [
      data.title || null,
      data.subtitle || null,
      data.image,
      data.cta_text || null,
      data.cta_link || null,
      data.sort_order !== undefined ? Number(data.sort_order) : 0,
      data.is_active !== undefined ? (data.is_active ? 1 : 0) : 1
    ];

    const [result] = await pool.query<ResultSetHeader>(sql, params);
    const newId = result.insertId;
    const created = await this.findById(newId);
    if (!created) {
      throw new Error('Failed to retrieve newly created banner');
    }
    return created;
  }

  static async update(id: number, data: UpdateBannerInput): Promise<Banner | null> {
    const existing = await this.findById(id);
    if (!existing) {
      return null;
    }

    const updates: string[] = [];
    const params: any[] = [];

    if (data.title !== undefined) {
      updates.push('title = ?');
      params.push(data.title || null);
    }
    if (data.subtitle !== undefined) {
      updates.push('subtitle = ?');
      params.push(data.subtitle || null);
    }
    if (data.image !== undefined && data.image.trim() !== '') {
      updates.push('image = ?');
      params.push(data.image);
    }
    if (data.cta_text !== undefined) {
      updates.push('cta_text = ?');
      params.push(data.cta_text || null);
    }
    if (data.cta_link !== undefined) {
      updates.push('cta_link = ?');
      params.push(data.cta_link || null);
    }
    if (data.sort_order !== undefined) {
      updates.push('sort_order = ?');
      params.push(Number(data.sort_order) || 0);
    }
    if (data.is_active !== undefined) {
      updates.push('is_active = ?');
      params.push(data.is_active ? 1 : 0);
    }

    if (updates.length > 0) {
      const sql = `UPDATE banners SET ${updates.join(', ')} WHERE id = ?`;
      params.push(id);
      await pool.query(sql, params);
    }

    return await this.findById(id);
  }

  static async updateStatus(id: number, isActive: boolean): Promise<Banner | null> {
    const existing = await this.findById(id);
    if (!existing) {
      return null;
    }

    const sql = `UPDATE banners SET is_active = ? WHERE id = ?`;
    await pool.query(sql, [isActive ? 1 : 0, id]);
    return await this.findById(id);
  }
}
