export type CustomerAccountStatus = 'active' | 'inactive' | 'suspended';

export interface AdminCustomerQueryParams {
  page?: number | string;
  limit?: number | string;
  search?: string;
  name?: string;
  email?: string;
  phone?: string;
  customerId?: string;
  status?: string;
  sortBy?: 'id' | 'customerId' | 'name' | 'email' | 'created_at' | 'total_orders' | 'total_spent' | 'newest' | 'oldest' | string;
  sortOrder?: 'asc' | 'desc';
}

export interface AdminCustomerListItem {
  id: number;
  _id: number;
  customerId: string;
  userUuid: string;
  name: string;
  email: string;
  phone: string;
  gender: string | null;
  avatarUrl: string | null;
  status: string; // 'Active' | 'Inactive' | 'Blocked'
  rawStatus: CustomerAccountStatus;
  totalOrders: number;
  totalSpent: number;
  latestOrderDate: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminCustomerAddress {
  id: number;
  userId: number;
  customerName: string;
  phone: string;
  email: string | null;
  tag: string;
  houseDetails: string;
  streetArea: string;
  landmark: string | null;
  city: string;
  state: string;
  pincode: string;
  country: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AdminCustomerOrderSummary {
  totalOrders: number;
  completedOrders: number;
  pendingOrders: number;
  cancelledOrders: number;
  totalSpent: number;
  latestOrderDate: string | null;
}

export interface AdminCustomerDetails {
  id: number;
  _id: number;
  customerId: string;
  userUuid: string;
  name: string;
  email: string;
  phone: string;
  gender: string | null;
  avatarUrl: string | null;
  preferences: string | null;
  newsletterSubscribed: boolean;
  smsUpdates: boolean;
  status: string;
  rawStatus: CustomerAccountStatus;
  createdAt: string;
  updatedAt: string;
  addresses: AdminCustomerAddress[];
  stats: AdminCustomerOrderSummary;
  recentOrders?: any[];
}

export interface AdminCustomersListResult {
  customers: AdminCustomerListItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
