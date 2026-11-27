/**
 * Admin Domain Types & Interfaces
 */

export type AdminRole = 'superadmin' | 'admin' | 'manager' | 'support';

export interface AdminUser {
  id: number;
  admin_uuid: string;
  username: string;
  email: string;
  password_hash: string;
  full_name: string;
  role: AdminRole;
  avatar_url?: string | null;
  is_active: boolean | number;
  last_login_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface SafeAdminUser {
  id: number | string;
  admin_uuid: string;
  username: string;
  email: string;
  full_name: string;
  role: AdminRole | string;
  avatar_url?: string | null;
  is_active: boolean;
  last_login_at?: string | null;
  created_at?: string;
}

export interface AdminLoginInput {
  email: string;
  password: string;
}

export interface AdminRegisterInput {
  username: string;
  email: string;
  password: string;
  full_name: string;
  role?: AdminRole;
  avatar_url?: string;
}

export interface JwtAdminPayload {
  adminId: number;
  adminUuid: string;
  email: string;
  username: string;
  role: AdminRole;
  type: 'admin';
  iat?: number;
  exp?: number;
}
