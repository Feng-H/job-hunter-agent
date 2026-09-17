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

export function isCloudRuntime(): boolean {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
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
    this.baseUrl = (process.env.KV_REST_API_URL || '').replace(/\/+$/, '');
    this.token = process.env.KV_REST_API_TOKEN || '';
  }

  async read(key: string): Promise<string | null> {
    const resp = await fetch(`${this.baseUrl}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${this.token}` }
    });
    if (!resp.ok) throw new Error(`KV read failed: HTTP ${resp.status}`);
    const data = await resp.json() as any;
    if (data?.result === null || data?.result === undefined) return null;
    return String(data.result);
  }

  async write(key: string, content: string): Promise<void> {
    const resp = await fetch(`${this.baseUrl}/set/${encodeURIComponent(key)}`, {
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

export async function writeJson(key: string, value: unknown): Promise<void> {
  await getStorage().write(key, JSON.stringify(value, null, 2));
}
