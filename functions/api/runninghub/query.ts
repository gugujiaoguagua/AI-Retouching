import {
  buildAuthHeaders,
  buildQueryCandidates,
  extractImageUrlsFromResults,
  extractResults,
  extractStatus,
  getEnv,
  isProbablyTerminalStatus,
  json,
  safeUrlForLog,
} from './_shared';

type QueryBody = { taskId?: string };


export async function onRequestPost(context: { request: Request; env: Record<string, string | undefined> }) {
  try {
    const apiKey = getEnv(context.env, 'RUNNINGHUB_API_KEY', true)!;

    const body = (await context.request.json().catch(() => null)) as QueryBody | null;
    const taskId = typeof body?.taskId === 'string' ? body.taskId.trim() : '';
    if (!taskId) {
      return json({ error: 'missing-taskId' }, { status: 400 });
    }

    const authHeaders = buildAuthHeaders(apiKey);
    const candidates = buildQueryCandidates(context.env);

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

      // Do NOT return upstream urls. Always rewrite to same-origin proxy.
      const imageUrls = extractImageUrlsFromResults(rawResults);
      const count = imageUrls.length || (isProbablyTerminalStatus(status) ? 1 : 0);

      const results = Array.from({ length: count }).map((_, index) => ({
        index,
        url: `/api/runninghub/image?taskId=${encodeURIComponent(taskId)}&index=${index}`,
      }));

      return json({ taskId, status, results });
    }

    return json({ error: 'query-failed', tried }, { status: 502 });
  } catch (e) {
    return json({ error: 'internal-error' }, { status: 500 });
  }
}
