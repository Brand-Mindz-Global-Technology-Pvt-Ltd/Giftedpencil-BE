import { Address, AddressInput } from '../types';
import { AddressValidator } from '../validators/addressValidator';
import { AddressRepository } from '../repositories/addressRepository';

export class AddressService {
  /**
   * Build complete addressLine string from address components
   */
  public static formatAddressLine(components: {
    house_details: string;
    street_area: string;
    landmark?: string | null;
    city: string;
    state: string;
    pincode: string;
  }): string {
    return AddressRepository.formatAddressLine(components);
  }

  /**
   * List all saved addresses for a specific authenticated user
   */
  public static async getUserAddresses(userId: string): Promise<Address[]> {
    return AddressRepository.findByUserId(userId);
  }

  /**
   * Get single address by ID for a specific authenticated user
   */
  public static async getUserAddressById(id: string, userId: string): Promise<Address | null> {
    return AddressRepository.findByIdAndUserId(id, userId);
  }

  /**
   * Create a new validated address for a specific authenticated user
   */
  public static async createAddress(
    userId: string,
    input: AddressInput
  ): Promise<{ success: boolean; address: Address }> {
    const validation = AddressValidator.validate(input);
    if (!validation.isValid || !validation.sanitized) {
      const err: any = new Error(validation.errors[0]?.message || 'Validation failed');
      err.errors = validation.errors;
      throw err;
    }

    const s = validation.sanitized;
    const created = await AddressRepository.create(userId, s);

    return {
      success: true,
      address: created
    };
  }

  /**
   * Update an existing address for a specific authenticated user
   */
  public static async updateAddress(
    id: string,
    userId: string,
    updates: Partial<AddressInput>
  ): Promise<{ success: boolean; address: Address }> {
    const existing = await AddressRepository.findByIdAndUserId(id, userId);

    if (!existing) {
      const err: any = new Error(`Address with ID "${id}" not found.`);
      err.statusCode = 404;
      throw err;
    }

    const merged = {
      customer_name: updates.customer_name !== undefined ? updates.customer_name : (updates.name !== undefined ? updates.name : existing.customer_name),
      phone: updates.phone !== undefined ? updates.phone : existing.phone,
      email: updates.email !== undefined ? updates.email : existing.email,
      pincode: updates.pincode !== undefined ? updates.pincode : existing.pincode,
      house_details: updates.house_details !== undefined ? updates.house_details : (updates.street !== undefined ? updates.street : existing.house_details),
      street_area: updates.street_area !== undefined ? updates.street_area : (updates.colony !== undefined ? updates.colony : existing.street_area),
      landmark: updates.landmark !== undefined ? updates.landmark : existing.landmark,
      city: updates.city !== undefined ? updates.city : existing.city,
      state: updates.state !== undefined ? updates.state : existing.state,
      tag: updates.tag !== undefined ? updates.tag : existing.tag,
      is_default: updates.is_default !== undefined ? updates.is_default : (updates.isDefault !== undefined ? updates.isDefault : existing.is_default)
    };

    const validation = AddressValidator.validate(merged);
    if (!validation.isValid || !validation.sanitized) {
      const err: any = new Error(validation.errors[0]?.message || 'Validation failed');
      err.errors = validation.errors;
      throw err;
    }

    const s = validation.sanitized;
    const updated = await AddressRepository.update(id, userId, s);

    if (!updated) {
      const err: any = new Error(`Address with ID "${id}" not found.`);
      err.statusCode = 404;
      throw err;
    }

    return {
      success: true,
      address: updated
    };
  }

  /**
   * Set an address as default for a specific authenticated user
   */
  public static async setDefaultAddress(
    id: string,
    userId: string
  ): Promise<{ success: boolean; address: Address }> {
    const updated = await AddressRepository.setDefault(id, userId);

    if (!updated) {
      const err: any = new Error(`Address with ID "${id}" not found.`);
      err.statusCode = 404;
      throw err;
    }

    return {
      success: true,
      address: updated
    };
  }

  /**
   * Delete an address for a specific authenticated user
   */
  public static async deleteAddress(
    id: string,
    userId: string
  ): Promise<{ success: boolean; message: string }> {
    const result = await AddressRepository.delete(id, userId);

    if (!result) {
      const err: any = new Error(`Address with ID "${id}" not found.`);
      err.statusCode = 404;
      throw err;
    }

    return {
      success: true,
      message: 'Address deleted successfully.'
    };
  }
}
