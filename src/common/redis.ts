export interface RedisConnectionSettings {
  host: string;
  port: number;
  db: number;
  username?: string;
  password?: string;
  tls?: Record<string, never>;
  maxRetriesPerRequest: null;
}

export function redisOptionsFromUrl(rawUrl: string): RedisConnectionSettings {
  const url = new URL(rawUrl);
  const db = Number(url.pathname.replace('/', '') || '0');
  return {
    host: url.hostname,
    port: Number(url.port || '6379'),
    db: Number.isInteger(db) ? db : 0,
    username: url.username ? decodeURIComponent(url.username) : undefined,
    password: url.password ? decodeURIComponent(url.password) : undefined,
    tls: url.protocol === 'rediss:' ? {} : undefined,
    maxRetriesPerRequest: null,
  };
}
