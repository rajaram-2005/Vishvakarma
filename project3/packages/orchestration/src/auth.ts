// §69 / §32 — Authentication & Role-Based Access Control. A self-contained auth
// service backed by the Storage abstraction: user registration, sessions, scoped
// API keys and role permissions. Uses Web Crypto (available in Node and browser)
// so it stays dependency-free and unit-testable.

import type { Storage } from './storage';

export type Role = 'owner' | 'admin' | 'editor' | 'contributor' | 'viewer';
export type Permission = 'read' | 'create' | 'edit' | 'delete' | 'deploy' | 'manage-users' | 'billing';

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  owner: ['read', 'create', 'edit', 'delete', 'deploy', 'manage-users', 'billing'],
  admin: ['read', 'create', 'edit', 'delete', 'deploy', 'manage-users'],
  editor: ['read', 'create', 'edit', 'deploy'],
  contributor: ['read', 'create'],
  viewer: ['read'],
};

export interface User {
  id: string;
  email: string;
  salt: string;
  pwHash: string;
  role: Role;
}

export interface Session {
  token: string;
  userId: string;
  createdAt: string;
}

export interface ApiKey {
  id: string;
  userId: string;
  scopes: string[];
  plaintext: string;
}

function bufToHex(b: ArrayBuffer): string {
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
}
function hex(n: number, bytes: number): string {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return [...a].map((x) => x.toString(16).padStart(2, '0')).join('');
}

export class AuthService {
  constructor(private readonly storage: Storage) {}

  private async derive(password: string, salt: string): Promise<string> {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: enc.encode(salt), iterations: 100_000, hash: 'SHA-256' }, keyMaterial, 256);
    return bufToHex(bits);
  }

  async register(email: string, password: string, role: Role = 'contributor'): Promise<User> {
    const users = this.storage.list<User>('users');
    if (users.some((u) => u.email === email)) throw new Error('email already registered');
    const salt = hex(0, 16);
    const user: User = { id: `usr_${hex(0, 6)}`, email, salt, pwHash: await this.derive(password, salt), role };
    this.storage.set('users', user.id, user);
    return user;
  }

  async login(email: string, password: string): Promise<Session> {
    const user = this.storage.list<User>('users').find((u) => u.email === email);
    if (!user) throw new Error('invalid credentials');
    if ((await this.derive(password, user.salt)) !== user.pwHash) throw new Error('invalid credentials');
    const session: Session = { token: `tok_${hex(0, 24)}`, userId: user.id, createdAt: new Date().toISOString() };
    this.storage.set('sessions', session.token, session);
    return session;
  }

  verifyToken(token: string): User | null {
    const session = this.storage.get<Session>('sessions', token);
    if (!session) return null;
    return this.storage.get<User>('users', session.userId) ?? null;
  }

  async createApiKey(userId: string, scopes: string[] = ['*']): Promise<ApiKey> {
    const key: ApiKey = { id: `key_${hex(0, 6)}`, userId, scopes, plaintext: `sk_${hex(0, 24)}` };
    this.storage.set('apikeys', key.id, key);
    return key;
  }

  hasScope(key: ApiKey, scope: string): boolean {
    return key.scopes.includes('*') || key.scopes.includes(scope);
  }

  /** §32 — role-based permission check. */
  can(role: Role, action: Permission): boolean {
    return ROLE_PERMISSIONS[role].includes(action);
  }
}
