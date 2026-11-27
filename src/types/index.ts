/**
 * Common Domain Interfaces for The Gifted Pencil Backend
 */

export interface Product {
  id: number;
  slug: string;
  name: string;
  subtitle?: string;
  price: number;
  original_price?: number;
  discount?: string;
  description: string;
  image: string;
  images?: string[];
  stock: number;
  in_stock: boolean;
  category: string;
  features?: string[];
  specifications?: Record<string, string>;
  is_active: boolean;
  created_at: string;
}

export interface AdminProductInput {
  name: string;
  slug?: string;
  subtitle?: string;
  price: number;
  original_price?: number;
  oldPrice?: number;
  discount?: string;
  stock_quantity?: number;
  stock?: number;
  description?: string;
  image?: string;
  images?: string[];
  category?: string;
  category_id?: number | null;
  subCategory?: string;
  features?: string[];
  specifications?: Record<string, string>;
  is_active?: boolean;
}

export interface AdminProductUpdateInput extends Partial<AdminProductInput> {}

export interface AdminProductQueryParams {
  search?: string;
  category?: string;
  subCategory?: string;
  status?: 'all' | 'active' | 'inactive';
  page?: number;
  limit?: number;
  sortBy?: string;
}

export interface CartItem {
  id: string; // Cart line item ID
  product_id: number;
  product_name: string;
  unit_price: number;
  quantity: number;
  item_total: number;
  image: string;
  category: string;
}

export interface CartSummary {
  items: CartItem[];
  total_items: number;
  subtotal: number;
  shipping_fee: number;
  free_shipping_threshold: number;
  grand_total: number;
  currency: string;
}

export interface WishlistItem {
  id: string; // unique wishlist entry ID e.g. WISH-1
  product_id: number;
  product_name: string;
  name: string;
  title: string;
  price: number;
  original_price?: number;
  discount?: string;
  image: string;
  slug: string;
  category: string;
  in_stock: boolean;
  added_at: string;
}

export interface WishlistSummary {
  items: WishlistItem[];
  total_items: number;
}

export interface Address {
  id: string;
  user_id: string;
  userId?: string;
  customer_name: string;
  name?: string;
  phone: string;
  email?: string;
  pincode: string;
  house_details: string;
  street_area: string;
  landmark?: string;
  city: string;
  state: string;
  tag: 'Home' | 'Work' | 'Other' | string;
  is_default: boolean;
  isDefault?: boolean;
  addressLine?: string;
  created_at: string;
  updated_at: string;
}

export interface AddressInput {
  customer_name?: string;
  name?: string;
  phone: string;
  email?: string;
  pincode: string;
  house_details?: string;
  street?: string;
  street_area?: string;
  colony?: string;
  landmark?: string;
  city: string;
  state: string;
  tag?: 'Home' | 'Work' | 'Other' | string;
  is_default?: boolean;
  isDefault?: boolean;
}

export interface OrderItem {
  product_id: number;
  product_name: string;
  price: number;
  quantity: number;
  total_price: number;
  image?: string;
}

export interface DeliveryAddressSnapshot {
  customer_name: string;
  phone: string;
  email?: string;
  house_details: string;
  street_area: string;
  landmark?: string;
  city: string;
  state: string;
  pincode: string;
  addressLine?: string;
}

export interface Order {
  id: string;
  order_reference: string;
  user_id?: string;
  customer_name: string;
  email?: string;
  phone: string;
  address: string;
  delivery_address: DeliveryAddressSnapshot;
  items: OrderItem[];
  total_quantity: number;
  subtotal: number;
  shipping_fee: number;
  total_price: number;
  order_status: 'Pending' | 'Processing' | 'Dispatched' | 'Delivered' | 'Cancelled' | string;
  payment_status: 'Pending' | 'Paid' | 'Failed' | string;
  payment_method: string;
  payment_id?: string;
  courier_name?: string;
  tracking_number?: string;
  dispatched_at?: string;
  delivered_at?: string;
  created_at: string;
  updated_at: string;
}

export interface PaymentOrder {
  order_id: string;
  transaction_id: string;
  user_id?: string;
  order_reference?: string;
  amount: number;
  currency: string;
  payment_method: string;
  payment_status: 'PENDING_SIMULATION' | 'SIMULATED_SUCCESS' | 'SIMULATED_FAILED';
  is_simulation: boolean;
  simulation_note: string;
  created_at: string;
}

export interface PaymentVerificationResult {
  transaction_id: string;
  order_id: string;
  payment_status: 'SIMULATED_SUCCESS' | 'SIMULATED_FAILED';
  amount_received: number;
  currency: string;
  is_simulation: boolean;
  verified_at: string;
  note: string;
}

export interface UserProfile {
  id: string;
  name?: string;
  full_name: string;
  email: string;
  phone: string;
  gender?: string;
  avatar_url?: string;
  joined_date: string;
  created_at?: string;
  updated_at?: string;
  preferences: {
    newsletter_subscribed: boolean;
    sms_updates: boolean;
    favorite_categories: string[];
  };
}

export interface ContactSubmission {
  id: string;
  name: string;
  email: string;
  phone?: string;
  subject?: string;
  message: string;
  created_at: string;
}

export interface ContactInput {
  name?: string;
  firstName?: string;
  lastName?: string;
  email: string;
  phone?: string;
  subject?: string;
  enquiryType?: string;
  enquiry_type?: string;
  message: string;
}

export * from './auth';
