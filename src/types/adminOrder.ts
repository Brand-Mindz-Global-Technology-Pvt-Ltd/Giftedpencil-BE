/**
 * Admin Order Types & Response Interfaces
 */

export interface AdminOrderQueryParams {
  status?: string;
  search?: string;
  sort?: string;
  page?: number;
  limit?: number;
}

export interface AdminCustomerInfo {
  id?: number;
  name: string;
  email: string;
  phone: string;
}

export interface AdminShippingAddress {
  line1: string;
  city: string;
  state: string;
  pincode: string;
  street_area?: string;
  landmark?: string;
}

export interface AdminPaymentInfo {
  method: string;
  status: string;
  paidAt?: string | null;
}

export interface AdminOrderItem {
  id?: number;
  name: string;
  price: number;
  qty: number;
  total: number;
  image: string;
  color?: string | null;
  size?: string | null;
}

export interface AdminOrderModel {
  orderId: string;
  id: number;
  _id: number;
  customerId: AdminCustomerInfo;
  createdAt: string;
  orderStatus: string;
  payment: AdminPaymentInfo;
  shippingAddress: AdminShippingAddress;
  items: AdminOrderItem[];
  subtotal: number;
  shipping: number;
  totalAmount: number;
  cancelReason?: string | null;
}

export interface AdminOrdersListResult {
  orders: AdminOrderModel[];
  total: number;
  totalPages: number;
  page: number;
  limit: number;
}
