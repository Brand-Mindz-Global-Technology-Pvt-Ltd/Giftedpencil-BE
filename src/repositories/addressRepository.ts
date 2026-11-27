import pool from '../config/db';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { Address, AddressInput } from '../types';

export class AddressRepository {
  /**
   * Helper to format a unified address line string from individual components
   */
  public static formatAddressLine(components: {
    house_details: string;
    street_area: string;
    landmark?: string | null;
    city: string;
    state: string;
    pincode: string;
  }): string {
    const landmarkPart = components.landmark ? `, Near ${components.landmark}` : '';
    return `${components.house_details}, ${components.street_area}${landmarkPart}, ${components.city}, ${components.state} – ${components.pincode}`;
  }

  /**
   * Helper to parse numeric ID from number or string (handles ADDR-123 and USR-1001)
   */
  public static parseNumericId(val: number | string): number {
    if (typeof val === 'number') return val;
    const num = Number(String(val).replace(/\D/g, ''));
    return isNaN(num) ? 0 : num;
  }

  /**
   * Map raw MySQL address row to domain Address model
   */
  public static mapRowToAddress(row: any): Address {
    const addressLine = this.formatAddressLine({
      house_details: row.house_details,
      street_area: row.street_area,
      landmark: row.landmark,
      city: row.city,
      state: row.state,
      pincode: row.pincode
    });

    const isDefault = Boolean(row.is_default);
    const idStr = `ADDR-${row.id}`;
    const userIdStr = `USR-${row.user_id}`;

    return {
      id: idStr,
      user_id: userIdStr,
      userId: userIdStr,
      customer_name: row.customer_name,
      name: row.customer_name,
      phone: row.phone,
      email: row.email || undefined,
      pincode: row.pincode,
      house_details: row.house_details,
      street_area: row.street_area,
      landmark: row.landmark || undefined,
      city: row.city,
      state: row.state,
      tag: row.tag || 'Home',
      is_default: isDefault,
      isDefault: isDefault,
      addressLine,
      created_at: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
      updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at)
    };
  }

  /**
   * List all addresses for a specific authenticated user
   */
  public static async findByUserId(userId: number | string): Promise<Address[]> {
    const numUserId = this.parseNumericId(userId);
    if (!numUserId) return [];

    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT * FROM addresses WHERE user_id = ? ORDER BY is_default DESC, id ASC`,
      [numUserId]
    );

    return rows.map(r => this.mapRowToAddress(r));
  }

  /**
   * Find single address by ID scoped strictly to the authenticated user
   */
  public static async findByIdAndUserId(
    addressId: number | string,
    userId: number | string
  ): Promise<Address | null> {
    const numAddressId = this.parseNumericId(addressId);
    const numUserId = this.parseNumericId(userId);
    if (!numAddressId || !numUserId) return null;

    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT * FROM addresses WHERE id = ? AND user_id = ? LIMIT 1`,
      [numAddressId, numUserId]
    );

    if (rows.length === 0) return null;
    return this.mapRowToAddress(rows[0]);
  }

  /**
   * Create a new address with transaction-safe default handling
   */
  public static async create(userId: number | string, data: AddressInput): Promise<Address> {
    const numUserId = this.parseNumericId(userId);
    if (!numUserId) {
      throw new Error('Valid user ID is required to create an address.');
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // Check current address count for this user
      const [countRows] = await connection.query<RowDataPacket[]>(
        `SELECT COUNT(*) as count FROM addresses WHERE user_id = ? FOR UPDATE`,
        [numUserId]
      );
      const existingCount = Number(countRows[0]?.count || 0);

      const requestedDefault = Boolean(data.is_default !== undefined ? data.is_default : data.isDefault);
      // First address must automatically become default.
      // Or if requested as default, clear any previous default.
      let makeDefault = false;
      if (existingCount === 0 || requestedDefault) {
        makeDefault = true;
        if (existingCount > 0) {
          await connection.query(
            `UPDATE addresses SET is_default = 0 WHERE user_id = ?`,
            [numUserId]
          );
        }
      }

      const customerName = (data.customer_name || data.name || '').trim();
      const phone = String(data.phone || '').trim().replace(/[\s-]/g, '').slice(-10);
      const email = data.email ? String(data.email).trim() : null;
      const houseDetails = (data.house_details || data.street || '').trim();
      const streetArea = (data.street_area || data.colony || '').trim();
      const landmark = data.landmark ? String(data.landmark).trim() : null;
      const city = String(data.city || '').trim();
      const state = String(data.state || '').trim();
      const pincode = String(data.pincode || '').trim();
      let tag = 'Home';
      if (data.tag && typeof data.tag === 'string') {
        const lower = data.tag.trim().toLowerCase();
        if (lower === 'work' || lower === 'office') tag = 'Work';
        else if (lower === 'other') tag = 'Other';
        else tag = 'Home';
      }

      const [result] = await connection.query<ResultSetHeader>(
        `INSERT INTO addresses (
          user_id, customer_name, phone, email, tag,
          house_details, street_area, landmark, city, state, pincode, country, is_default
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'India', ?)`,
        [
          numUserId,
          customerName,
          phone,
          email,
          tag,
          houseDetails,
          streetArea,
          landmark,
          city,
          state,
          pincode,
          makeDefault ? 1 : 0
        ]
      );

      const [newRows] = await connection.query<RowDataPacket[]>(
        `SELECT * FROM addresses WHERE id = ? LIMIT 1`,
        [result.insertId]
      );

      await connection.commit();
      return this.mapRowToAddress(newRows[0]);
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * Update an address with transaction-safe default handling
   */
  public static async update(
    addressId: number | string,
    userId: number | string,
    updates: Partial<AddressInput>
  ): Promise<Address | null> {
    const numAddressId = this.parseNumericId(addressId);
    const numUserId = this.parseNumericId(userId);
    if (!numAddressId || !numUserId) return null;

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // Check if address exists and belongs to user
      const [existingRows] = await connection.query<RowDataPacket[]>(
        `SELECT * FROM addresses WHERE id = ? AND user_id = ? FOR UPDATE`,
        [numAddressId, numUserId]
      );

      if (existingRows.length === 0) {
        await connection.rollback();
        return null;
      }

      const existing = existingRows[0];
      const hasDefaultUpdate = updates.is_default !== undefined || updates.isDefault !== undefined;
      const requestedDefault = hasDefaultUpdate
        ? Boolean(updates.is_default !== undefined ? updates.is_default : updates.isDefault)
        : Boolean(existing.is_default);

      if (requestedDefault && !Boolean(existing.is_default)) {
        // Clear previous default for this user
        await connection.query(
          `UPDATE addresses SET is_default = 0 WHERE user_id = ?`,
          [numUserId]
        );
      }

      const updateClauses: string[] = [];
      const values: any[] = [];

      if (updates.customer_name !== undefined || updates.name !== undefined) {
        updateClauses.push('customer_name = ?');
        values.push((updates.customer_name || updates.name || '').trim());
      }

      if (updates.phone !== undefined) {
        updateClauses.push('phone = ?');
        values.push(String(updates.phone).trim().replace(/[\s-]/g, '').slice(-10));
      }

      if (updates.email !== undefined) {
        updateClauses.push('email = ?');
        values.push(updates.email ? String(updates.email).trim() : null);
      }

      if (updates.house_details !== undefined || updates.street !== undefined) {
        updateClauses.push('house_details = ?');
        values.push((updates.house_details || updates.street || '').trim());
      }

      if (updates.street_area !== undefined || updates.colony !== undefined) {
        updateClauses.push('street_area = ?');
        values.push((updates.street_area || updates.colony || '').trim());
      }

      if (updates.landmark !== undefined) {
        updateClauses.push('landmark = ?');
        values.push(updates.landmark ? String(updates.landmark).trim() : null);
      }

      if (updates.city !== undefined) {
        updateClauses.push('city = ?');
        values.push(String(updates.city).trim());
      }

      if (updates.state !== undefined) {
        updateClauses.push('state = ?');
        values.push(String(updates.state).trim());
      }

      if (updates.pincode !== undefined) {
        updateClauses.push('pincode = ?');
        values.push(String(updates.pincode).trim());
      }

      if (updates.tag !== undefined) {
        let tag = 'Home';
        if (updates.tag && typeof updates.tag === 'string') {
          const lower = updates.tag.trim().toLowerCase();
          if (lower === 'work' || lower === 'office') tag = 'Work';
          else if (lower === 'other') tag = 'Other';
          else tag = 'Home';
        }
        updateClauses.push('tag = ?');
        values.push(tag);
      }

      if (hasDefaultUpdate) {
        updateClauses.push('is_default = ?');
        values.push(requestedDefault ? 1 : 0);
      }

      if (updateClauses.length > 0) {
        updateClauses.push('updated_at = CURRENT_TIMESTAMP');
        values.push(numAddressId, numUserId);

        await connection.query(
          `UPDATE addresses SET ${updateClauses.join(', ')} WHERE id = ? AND user_id = ?`,
          values
        );
      }

      const [updatedRows] = await connection.query<RowDataPacket[]>(
        `SELECT * FROM addresses WHERE id = ? AND user_id = ? LIMIT 1`,
        [numAddressId, numUserId]
      );

      await connection.commit();
      return this.mapRowToAddress(updatedRows[0]);
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * Set an address as default, clearing any previous default in a transaction
   */
  public static async setDefault(
    addressId: number | string,
    userId: number | string
  ): Promise<Address | null> {
    const numAddressId = this.parseNumericId(addressId);
    const numUserId = this.parseNumericId(userId);
    if (!numAddressId || !numUserId) return null;

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const [existingRows] = await connection.query<RowDataPacket[]>(
        `SELECT * FROM addresses WHERE id = ? AND user_id = ? FOR UPDATE`,
        [numAddressId, numUserId]
      );

      if (existingRows.length === 0) {
        await connection.rollback();
        return null;
      }

      // Clear previous default flags for this user
      await connection.query(
        `UPDATE addresses SET is_default = 0 WHERE user_id = ?`,
        [numUserId]
      );

      // Set target address as default
      await connection.query(
        `UPDATE addresses SET is_default = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?`,
        [numAddressId, numUserId]
      );

      const [updatedRows] = await connection.query<RowDataPacket[]>(
        `SELECT * FROM addresses WHERE id = ? AND user_id = ? LIMIT 1`,
        [numAddressId, numUserId]
      );

      await connection.commit();
      return this.mapRowToAddress(updatedRows[0]);
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * Delete address and promote the earliest remaining address if the deleted address was default
   */
  public static async delete(
    addressId: number | string,
    userId: number | string
  ): Promise<{ success: boolean; wasDefault: boolean } | null> {
    const numAddressId = this.parseNumericId(addressId);
    const numUserId = this.parseNumericId(userId);
    if (!numAddressId || !numUserId) return null;

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const [existingRows] = await connection.query<RowDataPacket[]>(
        `SELECT * FROM addresses WHERE id = ? AND user_id = ? FOR UPDATE`,
        [numAddressId, numUserId]
      );

      if (existingRows.length === 0) {
        await connection.rollback();
        return null;
      }

      const wasDefault = Boolean(existingRows[0].is_default);

      // Delete target address
      await connection.query(
        `DELETE FROM addresses WHERE id = ? AND user_id = ?`,
        [numAddressId, numUserId]
      );

      // If the deleted address was default, promote the earliest remaining address to default
      if (wasDefault) {
        const [remainingRows] = await connection.query<RowDataPacket[]>(
          `SELECT id FROM addresses WHERE user_id = ? ORDER BY id ASC LIMIT 1 FOR UPDATE`,
          [numUserId]
        );

        if (remainingRows.length > 0) {
          await connection.query(
            `UPDATE addresses SET is_default = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
            [remainingRows[0].id]
          );
        }
      }

      await connection.commit();
      return { success: true, wasDefault };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }
}
