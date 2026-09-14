export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';

export type DatabaseRequest = {
  path: string;
  method?: HttpMethod;
  body?: unknown;
  headers?: Record<string, string>;
};

export interface DatabaseClient {
  request<T>(request: DatabaseRequest): Promise<T>;
}

export type SupabaseClientConfig = {
  url: string;
  publishableKey: string;
  accessToken?: string;
};

/** Minimal REST client contract; repositories own table paths and payloads. */
export function createSupabaseRestClient(config: SupabaseClientConfig, fetcher: typeof fetch = fetch): DatabaseClient {
  const baseUrl = config.url.replace(/\/$/, '');
  return {
    async request<T>({ path, method = 'GET', body, headers = {} }: DatabaseRequest): Promise<T> {
      const response = await fetcher(`${baseUrl}/rest/v1/${path}`, {
        method,
        headers: {
          apikey: config.publishableKey,
          Authorization: `Bearer ${config.accessToken || config.publishableKey}`,
          'Content-Type': 'application/json',
          ...headers
        },
        body: body === undefined ? undefined : JSON.stringify(body)
      });
      if (!response.ok) throw new Error(`Database request failed (${response.status})`);
      const text = await response.text();
      return (text ? JSON.parse(text) : null) as T;
    }
  };
}
