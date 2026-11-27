/**
 * Authentication and User Domain Interfaces
 */

export interface UserPreferences {
  newsletter_subscribed?: boolean;
  sms_updates?: boolean;
  favorite_categories?: string[];
}

export interface User {
  id: string;
  user_uuid?: string;
  name: string;
  email: string;
  phone: string;
  gender: 'female' | 'male' | 'prefer_not_to_say' | string;
  password_hash: string;
  avatar_url?: string;
  preferences?: UserPreferences;
  account_status?: 'active' | 'inactive' | 'suspended';
  created_at: string;
  updated_at: string;
}

export type SafeUser = Omit<User, 'password_hash'>;

export interface RegisterInput {
  name: string;
  email: string;
  phone: string;
  gender?: 'female' | 'male' | 'prefer_not_to_say' | string;
  password: string;
  confirmPassword: string;
}

export interface LoginInput {
  email: string;
  password: string;
  rememberMe?: boolean;
}

export interface ForgotPasswordInput {
  email: string;
}

export interface ResetPasswordInput {
  token: string;
  password: string;
  confirmPassword: string;
}

export interface JwtUserPayload {
  userId: string;
  email: string;
  name: string;
  iat?: number;
  exp?: number;
}

export interface PasswordResetRecord {
  email: string;
  token: string;
  expires_at: number; // Unix timestamp in ms
  created_at: string;
  used: boolean;
}

declare global {
  namespace Express {
    interface Request {
      user?: SafeUser;
      token?: string;
    }
  }
}
