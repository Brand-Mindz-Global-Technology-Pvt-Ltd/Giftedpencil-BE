export type ContactStatus = 'new' | 'in_progress' | 'resolved' | 'archived';

export interface AdminContactQueryParams {
  page?: number | string;
  limit?: number | string;
  search?: string;
  status?: string;
  sortBy?: 'newest' | 'oldest' | 'name' | 'email' | string;
  sortOrder?: 'asc' | 'desc';
}

export interface AdminContactItem {
  id: number;
  _id: number;
  name: string;
  email: string;
  phone: string | null;
  enquiryType: string;
  subject: string | null;
  message: string;
  status: ContactStatus;
  statusLabel: string;
  adminNotes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminContactsListResult {
  contacts: AdminContactItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface UpdateContactStatusPayload {
  status: ContactStatus;
  adminNotes?: string | null;
}
