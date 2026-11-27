import { AdminBannerRepository } from '../repositories/adminBannerRepository';
import { Banner, BannerFilters, CreateBannerInput, UpdateBannerInput } from '../types/adminBanner';

export class AdminBannerService {
  static async listBanners(filters: BannerFilters): Promise<{ banners: Banner[]; total: number; page: number; limit: number; totalPages: number }> {
    const page = Math.max(1, Number(filters.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(filters.limit) || 20));

    const { banners, total } = await AdminBannerRepository.findAll({
      ...filters,
      page,
      limit
    });

    const totalPages = Math.ceil(total / limit) || 1;

    return {
      banners,
      total,
      page,
      limit,
      totalPages
    };
  }

  static async getBannerById(id: number): Promise<Banner> {
    if (!id || isNaN(id) || id <= 0) {
      throw new Error('Invalid banner ID provided');
    }
    const banner = await AdminBannerRepository.findById(id);
    if (!banner) {
      throw new Error('Banner not found');
    }
    return banner;
  }

  static async createBanner(data: CreateBannerInput): Promise<Banner> {
    if (!data.image || typeof data.image !== 'string' || data.image.trim() === '') {
      throw new Error('Banner image is required');
    }

    const sortOrder = data.sort_order !== undefined ? Number(data.sort_order) : 0;
    const isActive = data.is_active !== undefined ? (Boolean(data.is_active) ? 1 : 0) : 1;

    return await AdminBannerRepository.create({
      title: data.title ? data.title.trim() : undefined,
      subtitle: data.subtitle ? data.subtitle.trim() : undefined,
      image: data.image.trim(),
      cta_text: data.cta_text ? data.cta_text.trim() : undefined,
      cta_link: data.cta_link ? data.cta_link.trim() : undefined,
      sort_order: isNaN(sortOrder) ? 0 : sortOrder,
      is_active: isActive
    });
  }

  static async updateBanner(id: number, data: UpdateBannerInput): Promise<Banner> {
    if (!id || isNaN(id) || id <= 0) {
      throw new Error('Invalid banner ID provided');
    }

    const existing = await AdminBannerRepository.findById(id);
    if (!existing) {
      throw new Error('Banner not found');
    }

    const sortOrder = data.sort_order !== undefined ? Number(data.sort_order) : undefined;
    const isActive = data.is_active !== undefined ? (Boolean(data.is_active) ? 1 : 0) : undefined;

    const updated = await AdminBannerRepository.update(id, {
      title: data.title !== undefined ? (data.title ? data.title.trim() : '') : undefined,
      subtitle: data.subtitle !== undefined ? (data.subtitle ? data.subtitle.trim() : '') : undefined,
      image: data.image !== undefined && data.image.trim() !== '' ? data.image.trim() : undefined,
      cta_text: data.cta_text !== undefined ? (data.cta_text ? data.cta_text.trim() : '') : undefined,
      cta_link: data.cta_link !== undefined ? (data.cta_link ? data.cta_link.trim() : '') : undefined,
      sort_order: sortOrder !== undefined && !isNaN(sortOrder) ? sortOrder : undefined,
      is_active: isActive
    });

    if (!updated) {
      throw new Error('Failed to update banner');
    }

    return updated;
  }

  static async toggleStatus(id: number, isActive: boolean): Promise<Banner> {
    if (!id || isNaN(id) || id <= 0) {
      throw new Error('Invalid banner ID provided');
    }

    const existing = await AdminBannerRepository.findById(id);
    if (!existing) {
      throw new Error('Banner not found');
    }

    const updated = await AdminBannerRepository.updateStatus(id, isActive);
    if (!updated) {
      throw new Error('Failed to update banner status');
    }

    return updated;
  }
}
