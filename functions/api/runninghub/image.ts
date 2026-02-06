import {
  buildAuthHeaders,
  buildQueryCandidates,
  extractImageUrlsFromResults,
  extractResults,
  extractStatus,
  getEnv,
  isProbablySuccessStatus,
  json,
  safeUrlForLog,
} from './_shared';


async function queryTaskRaw(taskId: string, env: Record<string, string | undefined>) {
  const apiKey = getEnv(env, 'RUNNINGHUB_API_KEY', true)!;
  const authHeaders = buildAuthHeaders(apiKey);
  const candidates = buildQueryCandidates(env);

  const tried: Array<{ url: string; status?: number }> = [];

  for (const url of candidates) {
    const urlForLog = safeUrlForLog(url);

    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        ...Object.fromEntries(authHeaders.entries()),
        'content-type': 'application/json',
      },
      body: JSON.stringify({ taskId }),
    }).catch(() => null);

    if (!resp) {
      tried.push({ url: urlForLog });
      continue;
    }

    if (!resp.ok) {
      tried.push({ url: urlForLog, status: resp.status });
      continue;
    }

    const data = await resp.json().catch(() => null);
    const status = extractStatus(data) ?? 'PENDING';
    const rawResults = extractResults(data);
    return { ok: true as const, status, rawResults, tried };
  }

  return { ok: false as const, tried };
}

export async function onRequestGet(context: { request: Request; env: Record<string, string | undefined> }) {
  try {
    const url = new URL(context.request.url);
    const taskId = (url.searchParams.get('taskId') ?? '').trim();
    const index = Number(url.searchParams.get('index') ?? '0');

    if (!taskId) {
      return json({ error: 'missing-taskId' }, { status: 400 });
    }

    if (!Number.isFinite(index) || index < 0) {
      return json({ error: 'invalid-index' }, { status: 400 });
    }

    const q = await queryTaskRaw(taskId, context.env);
    if (!q.ok) {
      return json({ error: 'query-failed', tried: q.tried }, { status: 502 });
    }

    if (!isProbablySuccessStatus(q.status)) {
      return json({ error: 'not-ready', status: q.status }, { status: 409 });
    }

    const urls = extractImageUrlsFromResults(q.rawResults);
    const upstreamUrl = urls[index];
    if (!upstreamUrl) {
      return json({ error: 'image-not-found', available: urls.length }, { status: 404 });
    }

    // Fetch upstream image on server side, never expose its URL
    const upstream = await fetch(upstreamUrl);
    if (!upstream.ok || !upstream.body) {
      return json(
        {
          error: 'fetch-image-failed',
          upstream: { url: safeUrlForLog(upstreamUrl), status: upstream.status },
        },
        { status: 502 }
      );
    }

    const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
    return new Response(upstream.body, {
      headers: {
        'content-type': contentType,
        'cache-control': 'no-store',
      },
    });
  } catch {
    return json({ error: 'internal-error' }, { status: 500 });
  }
}
