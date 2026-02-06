type RunningHubEnv = Record<string, string | undefined>;

export type ImageNodeMapping = {
  nodeId: number;
  fieldName: string;
  fieldType?: 'file' | 'text';
};

export type RunCandidate = {
  url: string;
  mode: 'openapi' | 'call-api';
  workflowInPath?: boolean;
};


export function json(data: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...(init?.headers ?? {}),
    },
  });
}

export function getEnv(env: RunningHubEnv, key: string, required = true): string | undefined {
  const v = env[key];
  if (required && (!v || !v.trim())) {
    throw new Error(`missing-env:${key}`);
  }
  return v?.trim();
}

export function safeUrlForLog(input: string): string {
  try {
    const u = new URL(input);
    return `${u.origin}${u.pathname}`;
  } catch {
    // best-effort: strip query part if present
    const idx = input.indexOf('?');
    return idx >= 0 ? input.slice(0, idx) : input;
  }
}

export function safeHostPath(input: string): { host: string | null; path: string | null } {
  try {
    const u = new URL(input);
    return { host: u.host, path: u.pathname };
  } catch {
    return { host: null, path: null };
  }
}

export function hasRhQuery(input: string): boolean {
  try {
    const u = new URL(input);
    for (const k of u.searchParams.keys()) {
      if (/^Rh-/i.test(k)) return true;
    }
    return false;
  } catch {
    return false;
  }
}


export function buildAuthHeaders(apiKey: string): Headers {
  const h = new Headers();
  const trimmed = apiKey.trim();
  // Try to be compatible with multiple gateways without leaking key
  if (/^bearer\s+/i.test(trimmed)) {
    h.set('authorization', trimmed);
  } else {
    h.set('authorization', `Bearer ${trimmed}`);
  }
  h.set('x-api-key', trimmed);
  return h;
}

function parseCsv(input: string | undefined): string[] {
  if (!input) return [];
  return input
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
}

export function readImageNodeMappings(env: RunningHubEnv): ImageNodeMapping[] {
  const mapRaw = env['RUNNINGHUB_IMAGE_NODE_MAP'];
  if (mapRaw && mapRaw.trim()) {
    try {
      const parsed = JSON.parse(mapRaw) as unknown;
      if (!Array.isArray(parsed)) return [];
      const out: ImageNodeMapping[] = [];
      for (const item of parsed) {
        const nodeId = typeof (item as any)?.nodeId === 'number' ? (item as any).nodeId : Number((item as any)?.nodeId);
        const fieldName = String((item as any)?.fieldName ?? (item as any)?.field ?? 'image');
        const fieldType = (item as any)?.fieldType === 'text' ? 'text' : 'file';
        if (Number.isFinite(nodeId) && nodeId > 0 && fieldName) {
          out.push({ nodeId, fieldName, fieldType });
        }
      }
      return out;
    } catch {
      return [];
    }
  }

  const nodeIdRaw = env['RUNNINGHUB_IMAGE_NODE_ID'];
  const fieldName = (env['RUNNINGHUB_IMAGE_PARAM_KEY'] ?? 'image').trim();
  if (!nodeIdRaw) return [];
  const nodeId = Number(nodeIdRaw);
  if (!Number.isFinite(nodeId) || nodeId <= 0) return [];
  const fieldType = (env['RUNNINGHUB_IMAGE_FIELD_TYPE']?.trim() === 'text' ? 'text' : 'file') as 'file' | 'text';
  return [{ nodeId, fieldName, fieldType }];
}

export function buildRunCandidates(env: RunningHubEnv, workflowId: string): RunCandidate[] {
  const explicitUrls = parseCsv(env['RUNNINGHUB_RUN_URLS']);
  if (explicitUrls.length) {
    return explicitUrls.map(url => ({
      url,
      mode: url.includes('/call-api/') ? 'call-api' : 'openapi',
      workflowInPath: url.includes(':id') || url.includes(workflowId),
    }));
  }

  // 允许通过环境变量扩展/覆盖域名（无需改代码）
  // 例如：RUNNINGHUB_RUN_HOSTS=www.runninghub.cn,api.runninghub.cn,www.runninghub.ai,api.runninghub.ai
  const hosts = parseCsv(env['RUNNINGHUB_RUN_HOSTS']);
  const fallbackHosts = hosts.length
    ? hosts
    : [
        // 国内
        'www.runninghub.cn',
        'api.runninghub.cn',
        // 国际版
        'www.runninghub.ai',
        'api.runninghub.ai',
      ];

  // 你要求的候选形态：
  // - /openapi/v2/run/workflow/:id
  // - /call-api/run/workflow/:id
  // 同时保留旧入口作为兜底（不同网关/版本可能仍在用 openapi_v2）
  const paths: Array<{ path: (workflowId: string) => string; mode: RunCandidate['mode']; workflowInPath: boolean }> = [
    { path: (id) => `/openapi/v2/run/workflow/${id}`, mode: 'openapi', workflowInPath: true },
    { path: (id) => `/call-api/run/workflow/${id}`, mode: 'call-api', workflowInPath: true },

    // 兼容旧路径（workflowId 走 body）
    { path: () => '/openapi_v2/run/workflow', mode: 'openapi', workflowInPath: false },
    { path: () => '/openapi_v2/call-api/workflow', mode: 'call-api', workflowInPath: false },
    { path: () => '/run/workflow', mode: 'openapi', workflowInPath: false },
  ];

  const urls: RunCandidate[] = [];
  for (const host of fallbackHosts) {
    for (const p of paths) {
      urls.push({ url: `https://${host}${p.path(workflowId)}`, mode: p.mode, workflowInPath: p.workflowInPath });
    }
  }
  return urls;
}


export function buildQueryCandidates(env: RunningHubEnv): string[] {
  const explicitUrls = parseCsv(env['RUNNINGHUB_QUERY_URLS'] ?? env['RUNNINGHUB_QUERY_URL']);
  if (explicitUrls.length) return explicitUrls;

  const hosts = parseCsv(env['RUNNINGHUB_RUN_HOSTS']);
  const fallbackHosts = hosts.length
    ? hosts
    : [
        // 国内
        'www.runninghub.cn',
        'api.runninghub.cn',
        // 国际版
        'www.runninghub.ai',
        'api.runninghub.ai',
        // 旧兜底
        'www.runninghub.com',
        'api.runninghub.com',
      ];

  // “完美案例”跑通的 query 入口是 /openapi/v2/query
  // 这里保持多候选，避免不同网关版本差异。
  const paths = [
    '/openapi/v2/query',
    '/openapi/v2/query/task',

    // legacy / compat
    '/openapi_v2/query/task',
    '/openapi_v2/task/query',
    '/openapi_v2/tasks/query',
    '/query/task',
    '/task/query',
  ];

  const urls: string[] = [];
  for (const host of fallbackHosts) {
    for (const path of paths) {
      urls.push(`https://${host}${path}`);
    }
  }
  return urls;
}


export function buildUploadCandidates(env: RunningHubEnv): string[] {
  // 优先级：
  // 1) 显式多 URL：RUNNINGHUB_UPLOAD_URLS
  // 2) 单 URL（通常是签名 URL）：RUNNINGHUB_UPLOAD_URL（放首位）
  // 3) 默认拼装候选：.cn + .ai
  const explicitUrls = parseCsv(env['RUNNINGHUB_UPLOAD_URLS']);
  if (explicitUrls.length) return explicitUrls;

  const singleUrl = env['RUNNINGHUB_UPLOAD_URL']?.trim();

  const hosts = parseCsv(env['RUNNINGHUB_UPLOAD_HOSTS']);
  const fallbackHosts = hosts.length
    ? hosts
    : [
        // 国内
        'www.runninghub.cn',
        'api.runninghub.cn',
        // 国际版
        'www.runninghub.ai',
        'api.runninghub.ai',
      ];

  const paths = parseCsv(env['RUNNINGHUB_UPLOAD_PATHS']);
  const fallbackPaths = paths.length ? paths : ['/upload/image'];

  const out: string[] = [];
  const seen = new Set<string>();

  if (singleUrl) {
    out.push(singleUrl);
    seen.add(singleUrl);
  }

  for (const host of fallbackHosts) {
    for (const path of fallbackPaths) {
      const p = path.startsWith('/') ? path : `/${path}`;
      const u = `https://${host}${p}`;
      if (seen.has(u)) continue;
      out.push(u);
      seen.add(u);
    }
  }

  return out;
}


export function extractTaskId(payload: any): string | undefined {
  const candidates = [
    payload?.taskId,
    payload?.task_id,
    payload?.data?.taskId,
    payload?.data?.task_id,
    payload?.result?.taskId,
    payload?.result?.task_id,
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c.trim();
  }
  return undefined;
}

export function extractStatus(payload: any): string | undefined {
  const candidates = [payload?.status, payload?.data?.status, payload?.result?.status];
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c.trim();
  }
  return undefined;
}

export function extractResults(payload: any): any[] {
  const candidates = [payload?.results, payload?.data?.results, payload?.result?.results, payload?.data?.data?.results];
  for (const c of candidates) {
    if (Array.isArray(c)) return c;
  }
  return [];
}

export function extractImageUrlsFromResults(results: any[]): string[] {
  const scored = new Map<string, { score: number; order: number }>();
  let order = 0;

  const scoreUrl = (url: string, keyHint?: string) => {
    let s = 0;
    const k = (keyHint ?? '').toLowerCase();
    if (k) {
      if (/(output|outputs|result|results|generated|gen|final)/.test(k)) s += 5;
      if (/(image|img|url)/.test(k)) s += 1;
      if (/(input|source|origin|upload|raw|original)/.test(k)) s -= 4;
    }

    const u = url.toLowerCase();
    if (u.includes('/upload') || u.includes('upload')) s -= 3;
    if (u.includes('/output') || u.includes('output')) s += 2;
    if (u.includes('result')) s += 2;
    if (u.includes('original') || u.includes('origin')) s -= 2;

    return s;
  };

  const visit = (v: any, keyHint?: string) => {
    if (!v) return;

    if (typeof v === 'string') {
      if (v.startsWith('http://') || v.startsWith('https://')) {
        const url = v;
        const s = scoreUrl(url, keyHint);
        const existing = scored.get(url);
        if (!existing) {
          scored.set(url, { score: s, order: order++ });
        } else if (s > existing.score) {
          scored.set(url, { score: s, order: existing.order });
        }
      }
      return;
    }

    if (Array.isArray(v)) {
      for (const x of v) visit(x, keyHint);
      return;
    }

    if (typeof v === 'object') {
      // common keys
      const maybe = (v as any).url ?? (v as any).imageUrl ?? (v as any).imgUrl;
      if (typeof maybe === 'string') visit(maybe, keyHint ?? 'url');

      for (const key of Object.keys(v)) {
        if (key.toLowerCase().includes('token')) continue;
        visit((v as any)[key], key);
      }
    }
  };

  visit(results);

  return [...scored.entries()]
    .sort((a, b) => {
      const sa = a[1];
      const sb = b[1];
      if (sb.score !== sa.score) return sb.score - sa.score;
      return sa.order - sb.order;
    })
    .map(([url]) => url);
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

function looksLikeImageFileName(v: string): boolean {
  const s = v.trim();
  if (!s || s.length > 300) return false;
  if (s.startsWith('http://') || s.startsWith('https://')) return false;
  return /\.(png|jpe?g|webp|gif|bmp)$/i.test(s);
}

function pickString(obj: any, key: string): string | undefined {
  const v = obj?.[key];
  return isNonEmptyString(v) ? v.trim() : undefined;
}

function findLikelyFileKeyFromPayload(payload: any): string | undefined {
  const queue: any[] = [payload];
  const seen = new Set<any>();
  let steps = 0;

  while (queue.length && steps < 200) {
    const cur = queue.shift();
    steps += 1;
    if (!cur || typeof cur !== 'object') continue;
    if (seen.has(cur)) continue;
    seen.add(cur);

    if (Array.isArray(cur)) {
      for (const x of cur) queue.push(x);
      continue;
    }

    for (const [k, v] of Object.entries(cur)) {
      if (typeof v === 'string' && looksLikeImageFileName(v)) return v.trim();
      if (v && typeof v === 'object' && !String(k).toLowerCase().includes('token')) queue.push(v);
    }
  }

  return undefined;
}

export function extractUploadRef(payload: any): { fileKey?: string; fileValue?: unknown } {
  // 兼容多种网关返回：fileKey/fileValue、key/value、name/filename 等
  if (isNonEmptyString(payload) && looksLikeImageFileName(payload)) {
    return { fileKey: payload.trim() };
  }

  const maybeObjects = [payload, payload?.data, payload?.result, payload?.data?.data];

  for (const obj of maybeObjects) {
    if (!obj || typeof obj !== 'object') continue;


    const fileKey =
      pickString(obj, 'fileKey') ??
      pickString(obj, 'key') ??
      pickString(obj, 'name') ??
      pickString(obj, 'fileName') ??
      pickString(obj, 'filename') ??
      pickString((obj as any)?.data, 'fileKey') ??
      pickString((obj as any)?.data, 'name') ??
      pickString((obj as any)?.data, 'fileName') ??
      pickString((obj as any)?.data, 'filename');

    // fileValue 可能是对象（包含 name/full/url 等），不要强行限制为 string
    const fileValue = Object.prototype.hasOwnProperty.call(obj as any, 'fileValue')
      ? (obj as any).fileValue
      : (obj as any)?.data && Object.prototype.hasOwnProperty.call((obj as any).data, 'fileValue')
        ? (obj as any).data.fileValue
        : Object.prototype.hasOwnProperty.call(obj as any, 'value')
          ? (obj as any).value
          : undefined;

    if (fileKey || typeof fileValue !== 'undefined') {
      return { fileKey, fileValue };
    }
  }

  // 兜底：在返回体里找一个看起来像图片文件名的字段（例如 "xxxx.png"）
  const fallbackKey = findLikelyFileKeyFromPayload(payload);
  if (fallbackKey) return { fileKey: fallbackKey };

  return {};
}

export function chooseFileRef(
  ref: { fileKey?: string; fileValue?: unknown },
  mode: 'auto' | 'fileKey' | 'fileValue'
): unknown {
  if (mode === 'fileKey') return ref.fileKey ?? ref.fileValue;
  if (mode === 'fileValue') return ref.fileValue ?? ref.fileKey;

  // auto：优先 fileValue.name/full/url（更贴近“完美案例”），否则回退 fileKey
  const fv = ref.fileValue;
  if (fv && typeof fv === 'object') {
    const o = fv as Record<string, unknown>;
    const name = isNonEmptyString(o.name) ? o.name.trim() : '';
    if (name) return name;
    const full = isNonEmptyString(o.full) ? o.full.trim() : '';
    if (full) return full;
    const url = isNonEmptyString(o.url) ? o.url.trim() : '';
    if (url) return url;
  }

  if (isNonEmptyString(fv)) return fv.trim();
  return ref.fileKey;
}


export function isProbablySuccessStatus(status: string | undefined): boolean {
  const s = (status ?? '').toUpperCase();
  return s === 'SUCCESS' || s === 'SUCCEEDED' || s === 'DONE' || s === 'COMPLETED';
}

export function isProbablyTerminalStatus(status: string | undefined): boolean {
  const s = (status ?? '').toUpperCase();
  return (
    s === 'SUCCESS' ||
    s === 'SUCCEEDED' ||
    s === 'DONE' ||
    s === 'COMPLETED' ||
    s === 'FAILED' ||
    s === 'FAIL' ||
    s === 'ERROR' ||
    s === 'CANCELED' ||
    s === 'CANCELLED'
  );
}

export function toOpenApiNodeInfoList(input: Array<{ nodeId: number; fieldName: string; fieldValue: unknown; fieldType?: 'file' | 'text' }>) {
  return input.map(i => ({
    nodeId: i.nodeId,
    fieldName: i.fieldName,
    fieldValue: i.fieldValue,
    ...(i.fieldType ? { fieldType: i.fieldType } : {}),
  }));
}

export function toCallApiNodeInfoList(input: Array<{ nodeId: number; fieldName: string; fieldValue: unknown }>) {
  return input.map(i => ({
    nodeId: i.nodeId,
    nodeParams: {
      [i.fieldName]: i.fieldValue,
    },
  }));
}
