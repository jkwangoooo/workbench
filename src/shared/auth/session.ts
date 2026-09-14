export type AuthSession = {
  access_token: string;
  refresh_token?: string;
  expires_at?: number;
};

export interface SessionStore {
  read(): AuthSession | null;
  write(session: AuthSession): void;
  clear(): void;
}

/** In-memory by default so sensitive session material is not persisted by this layer. */
export function createMemorySessionStore(): SessionStore {
  let current: AuthSession | null = null;
  return {
    read: () => current,
    write: (session) => { current = session; },
    clear: () => { current = null; }
  };
}
