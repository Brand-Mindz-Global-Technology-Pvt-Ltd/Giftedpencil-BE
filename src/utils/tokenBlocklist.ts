/**
 * In-Memory Token Blocklist for Revoked JWTs on Logout
 */
export const tokenBlocklist = new Set<string>();

export function isTokenBlocked(token: string): boolean {
  return tokenBlocklist.has(token);
}

export function addToBlocklist(token: string): void {
  tokenBlocklist.add(token);
}
