import fs from 'fs';
import path from 'path';

export interface CompanySettingData {
  companyName: string;
  email: string;
  phone: string;
  address: string;
  logo: string | null;
  updatedAt?: string;
}

export interface PolicySettingData {
  title: string;
  content: string;
  updatedAt: string;
}

export interface AdminSettingsStore {
  company: Record<string, CompanySettingData>;
  terms: Record<string, PolicySettingData>;
  privacy: Record<string, PolicySettingData>;
  cookie: Record<string, PolicySettingData>;
  shipping?: Record<string, PolicySettingData>;
  returnRefund?: Record<string, PolicySettingData>;
}

const STORAGE_FILE = path.resolve(__dirname, '../../uploads/settings/store.json');

export class AdminSettingsRepository {
  private static ensureStorage(): AdminSettingsStore {
    const dir = path.dirname(STORAGE_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    if (!fs.existsSync(STORAGE_FILE)) {
      const initial: AdminSettingsStore = {
        company: {
          default: {
            companyName: 'The Gifted Pencil',
            email: 'support@thegiftedpencil.com',
            phone: '+91 98765 43210',
            address: 'No. 123, Craft Avenue, Chennai, India',
            logo: null,
            updatedAt: new Date().toISOString()
          }
        },
        terms: {
          default: {
            title: 'Terms & Conditions',
            content: '<p>Welcome to The Gifted Pencil. By accessing our website, you agree to these terms.</p>',
            updatedAt: new Date().toISOString()
          }
        },
        privacy: {
          default: {
            title: 'Privacy Policy',
            content: '<p>Your privacy is important to us. We protect your personal data in accordance with our policy.</p>',
            updatedAt: new Date().toISOString()
          }
        },
        cookie: {
          default: {
            title: 'Cookie Policy',
            content: '<p>We use essential cookies to ensure our website functions correctly.</p>',
            updatedAt: new Date().toISOString()
          }
        }
      };
      fs.writeFileSync(STORAGE_FILE, JSON.stringify(initial, null, 2), 'utf-8');
      return initial;
    }

    try {
      const data = fs.readFileSync(STORAGE_FILE, 'utf-8');
      return JSON.parse(data) as AdminSettingsStore;
    } catch {
      return {
        company: {},
        terms: {},
        privacy: {},
        cookie: {}
      };
    }
  }

  private static saveStorage(store: AdminSettingsStore): void {
    fs.writeFileSync(STORAGE_FILE, JSON.stringify(store, null, 2), 'utf-8');
  }

  public static getCompany(adminId: string): CompanySettingData | null {
    const store = this.ensureStorage();
    return store.company[adminId] || store.company['default'] || null;
  }

  public static saveCompany(adminId: string, data: Partial<CompanySettingData>): CompanySettingData {
    const store = this.ensureStorage();
    const existing = store.company[adminId] || store.company['default'] || {
      companyName: '',
      email: '',
      phone: '',
      address: '',
      logo: null
    };

    const updated: CompanySettingData = {
      ...existing,
      ...data,
      updatedAt: new Date().toISOString()
    };

    store.company[adminId] = updated;
    store.company['default'] = updated;
    this.saveStorage(store);
    return updated;
  }

  public static getTerms(adminId: string): PolicySettingData | null {
    const store = this.ensureStorage();
    return store.terms[adminId] || store.terms['default'] || null;
  }

  public static saveTerms(adminId: string, title: string, content: string): PolicySettingData {
    const store = this.ensureStorage();
    const updated: PolicySettingData = {
      title: title || 'Terms & Conditions',
      content,
      updatedAt: new Date().toISOString()
    };
    store.terms[adminId] = updated;
    store.terms['default'] = updated;
    this.saveStorage(store);
    return updated;
  }

  public static getPrivacy(adminId: string): PolicySettingData | null {
    const store = this.ensureStorage();
    return store.privacy[adminId] || store.privacy['default'] || null;
  }

  public static savePrivacy(adminId: string, title: string, content: string): PolicySettingData {
    const store = this.ensureStorage();
    const updated: PolicySettingData = {
      title: title || 'Privacy Policy',
      content,
      updatedAt: new Date().toISOString()
    };
    store.privacy[adminId] = updated;
    store.privacy['default'] = updated;
    this.saveStorage(store);
    return updated;
  }

  public static getCookie(adminId: string): PolicySettingData | null {
    const store = this.ensureStorage();
    return store.cookie[adminId] || store.cookie['default'] || null;
  }

  public static saveCookie(adminId: string, title: string, content: string): PolicySettingData {
    const store = this.ensureStorage();
    const updated: PolicySettingData = {
      title: title || 'Cookie Policy',
      content,
      updatedAt: new Date().toISOString()
    };
    store.cookie[adminId] = updated;
    store.cookie['default'] = updated;
    this.saveStorage(store);
    return updated;
  }

  public static getShipping(adminId: string): PolicySettingData | null {
    const store = this.ensureStorage();
    if (!store.shipping) store.shipping = {};
    return store.shipping[adminId] || store.shipping['default'] || null;
  }

  public static saveShipping(adminId: string, title: string, content: string): PolicySettingData {
    const store = this.ensureStorage();
    if (!store.shipping) store.shipping = {};
    const updated: PolicySettingData = {
      title: title || 'Shipping & Delivery Policy',
      content,
      updatedAt: new Date().toISOString()
    };
    store.shipping[adminId] = updated;
    store.shipping['default'] = updated;
    this.saveStorage(store);
    return updated;
  }

  public static getReturnRefund(adminId: string): PolicySettingData | null {
    const store = this.ensureStorage();
    if (!store.returnRefund) store.returnRefund = {};
    return store.returnRefund[adminId] || store.returnRefund['default'] || null;
  }

  public static saveReturnRefund(adminId: string, title: string, content: string): PolicySettingData {
    const store = this.ensureStorage();
    if (!store.returnRefund) store.returnRefund = {};
    const updated: PolicySettingData = {
      title: title || 'Return, Refund, Replacement & Cancellation Policy',
      content,
      updatedAt: new Date().toISOString()
    };
    store.returnRefund[adminId] = updated;
    store.returnRefund['default'] = updated;
    this.saveStorage(store);
    return updated;
  }

  /**
   * Public retrieval for customer-facing policies
   * Only returns title, content, updatedAt for the 4 sanctioned customer policies.
   */
  public static getPublicPolicy(type: 'privacy' | 'terms' | 'shipping' | 'return-refund'): { title: string; content: string; updatedAt: string } | null {
    const store = this.ensureStorage();
    let policy: PolicySettingData | undefined;

    switch (type) {
      case 'privacy':
        policy = store.privacy?.['default'] || Object.values(store.privacy || {})[0];
        break;
      case 'terms':
        policy = store.terms?.['default'] || Object.values(store.terms || {})[0];
        break;
      case 'shipping':
        policy = store.shipping?.['default'] || Object.values(store.shipping || {})[0];
        break;
      case 'return-refund':
        policy = store.returnRefund?.['default'] || Object.values(store.returnRefund || {})[0];
        break;
      default:
        return null;
    }

    if (!policy || !policy.content) {
      return null;
    }

    return {
      title: policy.title,
      content: policy.content,
      updatedAt: policy.updatedAt
    };
  }
}
