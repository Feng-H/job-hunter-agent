import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * 统一存储适配器：
 * - 本地模式：读写 data/ 目录下的 JSON 文件（原有行为）
 * - 云端模式：读写 Vercel KV（Upstash REST），凭 KV_REST_API_URL / KV_REST_API_TOKEN 环境变量自动启用
 * 键名与本地文件相对路径保持一致（如 data/db/jobs_pipeline.json），实现无缝迁移。
 */
export interface StorageAdapter {
  readonly kind: 'local-fs' | 'vercel-kv';
  read(key: string): Promise<string | null>;
  write(key: string, content: string): Promise<void>;
}

/** 兼容多套环境变量命名：精确名（KV_REST_API_* / UPSTASH_REDIS_REST_*）与任意前缀变体（如创建存储时用名称做前缀的 XXX_KV_REST_API_*） */
export function getKvEnvConfig(): { url: string; token: string; source: string } | null {
  const env = process.env as Record<string, string | undefined>;

  const tryPair = (urlKey: string, tokenKey: string, source: string) => {
    if (env[urlKey] && env[tokenKey]) {
      return { url: env[urlKey]!, token: env[tokenKey]!, source };
    }
    return null;
  };

  // 1. 精确名优先
  const exact =
    tryPair('KV_REST_API_URL', 'KV_REST_API_TOKEN', 'KV_REST_API_*') ||
    tryPair('UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'UPSTASH_REDIS_REST_*');
  if (exact) return exact;

  // 2. 带前缀扫描：XXX_KV_REST_API_URL / XXX_UPSTASH_REDIS_REST_URL（排除只读令牌）
  //    按 key 排序保证确定性：即使误连了多个库，所有实例/部署也始终选中同一个
  for (const key of Object.keys(env).sort()) {
    const m = key.match(/^(.+_)KV_REST_API_URL$/) || key.match(/^(.+_)UPSTASH_REDIS_REST_URL$/);
    if (!m) continue;
    const prefix = m[1];
    const candidate =
      tryPair(`${prefix}KV_REST_API_URL`, `${prefix}KV_REST_API_TOKEN`, `prefixed:${prefix}`) ||
      tryPair(`${prefix}UPSTASH_REDIS_REST_URL`, `${prefix}UPSTASH_REDIS_REST_TOKEN`, `prefixed:${prefix}`);
    if (candidate) return candidate;
  }
  return null;
}

/** Upstash REST 带重试：429 限流 / 5xx / 网络错误自动重试 2 次（300ms/900ms 退避），避免瞬时故障导致静默丢数据 */
async function fetchWithRetry(url: string, init: RequestInit, retries = 2): Promise<Response> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const resp = await fetch(url, init);
      if (resp.status === 429 || resp.status >= 500) {
        lastErr = new Error(`HTTP ${resp.status}`);
        if (attempt < retries) {
          await new Promise(r => setTimeout(r, 300 * (attempt + 1) * (attempt + 1)));
          continue;
        }
        return resp;
      }
      return resp;
    } catch (e) {
      lastErr = e;
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, 300 * (attempt + 1) * (attempt + 1)));
        continue;
      }
      throw e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

export function isCloudRuntime(): boolean {
  return getKvEnvConfig() !== null;
}

class LocalFileStorage implements StorageAdapter {
  readonly kind = 'local-fs' as const;

  async read(key: string): Promise<string | null> {
    const abs = path.resolve(process.cwd(), key);
    try {
      return fs.readFileSync(abs, 'utf-8');
    } catch (e: any) {
      if (e.code === 'ENOENT') return null;
      throw e;
    }
  }

  async write(key: string, content: string): Promise<void> {
    const abs = path.resolve(process.cwd(), key);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content, 'utf-8');
  }
}

class VercelKVStorage implements StorageAdapter {
  readonly kind = 'vercel-kv' as const;
  private baseUrl: string;
  private token: string;

  constructor() {
    const cfg = getKvEnvConfig();
    if (!cfg) throw new Error('KV env vars missing');
    this.baseUrl = cfg.url.replace(/\/+$/, '');
    this.token = cfg.token;
  }

  async read(key: string): Promise<string | null> {
    const resp = await fetchWithRetry(`${this.baseUrl}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${this.token}` }
    });
    if (!resp.ok) throw new Error(`KV read failed: HTTP ${resp.status}`);
    const data = await resp.json() as any;
    if (data?.result === null || data?.result === undefined) return null;
    return String(data.result);
  }

  async write(key: string, content: string): Promise<void> {
    const resp = await fetchWithRetry(`${this.baseUrl}/set/${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'text/plain'
      },
      body: content
    });
    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      throw new Error(`KV write failed: HTTP ${resp.status} ${errText.slice(0, 100)}`);
    }
  }
}

let singleton: StorageAdapter | null = null;

export function getStorage(): StorageAdapter {
  if (!singleton) {
    singleton = isCloudRuntime() ? new VercelKVStorage() : new LocalFileStorage();
  }
  return singleton;
}

export async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await getStorage().read(key);
    if (raw === null || raw === '') return fallback;
    return JSON.parse(raw) as T;
  } catch (e) {
    console.warn(`[Storage] 读取 ${key} 异常，使用兜底值:`, (e as Error).message);
    return fallback;
  }
}

/**
 * 严格读取：仅当键确实不存在时返回兜底值；读取失败或数据损坏时抛错。
 * 用于账号等关键状态——读失败绝不能假装"空库"，否则会诱发误初始化覆盖真实数据。
 */
export async function readJsonStrict<T>(key: string, fallback: T): Promise<T> {
  const raw = await getStorage().read(key);
  if (raw === null || raw === '') return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch (e) {
    throw new Error(`${key} 数据损坏（JSON 解析失败）: ${(e as Error).message}`);
  }
}

export async function writeJson(key: string, value: unknown): Promise<void> {
  await getStorage().write(key, JSON.stringify(value, null, 2));
}
