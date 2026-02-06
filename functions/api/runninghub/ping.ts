import { buildQueryCandidates, buildRunCandidates, getEnv, json, readImageNodeMappings, safeHostPath, safeUrlForLog } from './_shared';

export async function onRequestPost(context: { request: Request; env: Record<string, string | undefined> }) {
  try {
    const missing: string[] = [];

    const apiKey = context.env['RUNNINGHUB_API_KEY']?.trim();
    if (!apiKey) missing.push('RUNNINGHUB_API_KEY');

    const workflowId = context.env['RUNNINGHUB_WORKFLOW_ID']?.trim();
    if (!workflowId) missing.push('RUNNINGHUB_WORKFLOW_ID');

    const uploadUrl = context.env['RUNNINGHUB_UPLOAD_URL']?.trim();
    if (!uploadUrl) missing.push('RUNNINGHUB_UPLOAD_URL');

    const imageMappings = readImageNodeMappings(context.env);
    if (!imageMappings.length) missing.push('RUNNINGHUB_IMAGE_NODE_MAP（或 RUNNINGHUB_IMAGE_NODE_ID + RUNNINGHUB_IMAGE_PARAM_KEY）');

    const ok = missing.length === 0;

    const runCandidates = workflowId ? buildRunCandidates(context.env, workflowId) : [];
    const queryCandidates = buildQueryCandidates(context.env);

    return json({
      ok,
      missing,
      upload: uploadUrl ? { ...safeHostPath(uploadUrl) } : null,
      runCandidates: runCandidates.slice(0, 6).map(c => ({ url: safeUrlForLog(c.url), mode: c.mode })),
      queryCandidates: queryCandidates.slice(0, 6).map(u => safeUrlForLog(u)),
      imageNodeMappings: imageMappings,
      // 额外：验证 getEnv 的错误提示不会泄露（这里只验证 env 读取逻辑是否正常）
      envRead: {
        RUNNINGHUB_API_KEY: Boolean(apiKey),
        RUNNINGHUB_WORKFLOW_ID: Boolean(workflowId),
        RUNNINGHUB_UPLOAD_URL: Boolean(uploadUrl),
      },
    });
  } catch (e) {
    // ping 不应暴露内部细节
    return json({ ok: false, error: 'internal-error' }, { status: 500 });
  }
}
