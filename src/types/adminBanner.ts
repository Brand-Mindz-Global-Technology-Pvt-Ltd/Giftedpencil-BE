export interface Banner {
  id: number;
  title: string | null;
  subtitle: string | null;
  image: string;
  cta_text: string | null;
  cta_link: string | null;
  sort_order: number;
  is_active: number | boolean;
  created_at: string;
  updated_at: string;
}

export interface BannerFilters {
  search?: string;
  is_active?: boolean | number;
  sort_by?: 'sort_order' | 'created_at' | 'id';
  sort_dir?: 'ASC' | 'DESC';
  page?: number;
  limit?: number;
}

export interface CreateBannerInput {
  title?: string;
  subtitle?: string;
  image: string;
  cta_text?: string;
  cta_link?: string;
  sort_order?: number;
  is_active?: boolean | number;
}

export interface UpdateBannerInput {
  title?: string;
  subtitle?: string;
  image?: string;
  cta_text?: string;
  cta_link?: string;
  sort_order?: number;
  is_active?: boolean | number;
}
