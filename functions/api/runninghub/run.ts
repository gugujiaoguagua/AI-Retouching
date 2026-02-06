import {
  buildAuthHeaders,
  buildRunCandidates,
  chooseFileRef,
  extractStatus,
  extractTaskId,
  extractUploadRef,
  getEnv,
  json,
  readImageNodeMappings,
  safeUrlForLog,
  toCallApiNodeInfoList,
  toOpenApiNodeInfoList,
} from './_shared';

export async function onRequestPost(context: { request: Request; env: Record<string, string | undefined> }) {
  try {
    const apiKey = getEnv(context.env, 'RUNNINGHUB_API_KEY', true)!;
    const workflowId = getEnv(context.env, 'RUNNINGHUB_WORKFLOW_ID', true)!;
    const uploadUrl = getEnv(context.env, 'RUNNINGHUB_UPLOAD_URL', true)!;

    const fileValueModeRaw = (context.env['RUNNINGHUB_FILEVALUE_MODE'] ?? 'auto').trim();
    const fileValueMode = (fileValueModeRaw === 'fileKey' || fileValueModeRaw === 'fileValue' ? fileValueModeRaw : 'auto') as
      | 'auto'
      | 'fileKey'
      | 'fileValue';

    const promptNodeIdRaw = context.env['RUNNINGHUB_PROMPT_NODE_ID'];
    const promptFieldName = (context.env['RUNNINGHUB_PROMPT_PARAM_KEY'] ?? 'prompt').trim();
    const promptFieldType = (context.env['RUNNINGHUB_PROMPT_FIELD_TYPE']?.trim() === 'file' ? 'file' : 'text') as
      | 'file'
      | 'text';

    const contentType = context.request.headers.get('content-type') || '';
    if (!contentType.includes('multipart/form-data')) {
      return json({ error: 'unsupported-content-type' }, { status: 415 });
    }

    const form = await context.request.formData();
    const files = form
      .getAll('file')
      .concat(form.getAll('image'))
      .filter((v): v is File => v instanceof File);

    if (!files.length) {
      return json({ error: 'missing-file' }, { status: 400 });
    }

    const prompt = typeof form.get('prompt') === 'string' ? String(form.get('prompt')).trim() : '';

    // Optional knobs from client
    const workflowType = typeof form.get('workflowType') === 'string' ? String(form.get('workflowType')).trim() : undefined;
    const instanceType = typeof form.get('instanceType') === 'string' ? String(form.get('instanceType')).trim() : undefined;
    const usePersonalQueue = typeof form.get('usePersonalQueue') === 'string' ? String(form.get('usePersonalQueue')).trim() : undefined;
    const addMetadata = typeof form.get('addMetadata') === 'string' ? String(form.get('addMetadata')).trim() : undefined;

    const imageMappings = readImageNodeMappings(context.env);
    if (!imageMappings.length) {
      return json(
        {
          error: 'missing-image-node-config',
          hint: '请在 Pages Functions 环境变量中配置图片节点映射（支持多图）',
          required: ['RUNNINGHUB_IMAGE_NODE_MAP（推荐）', '或 RUNNINGHUB_IMAGE_NODE_ID + RUNNINGHUB_IMAGE_PARAM_KEY'],
          example: {
            RUNNINGHUB_IMAGE_NODE_MAP:
              '[{"nodeId":2,"fieldName":"image","fieldType":"file"},{"nodeId":4,"fieldName":"image","fieldType":"file"},{"nodeId":5,"fieldName":"image","fieldType":"file"}]',
          },
        },
        { status: 500 }
      );
    }

    console.log(
      `[runninghub] run start files=${files.length} mappings=${imageMappings.length} upload=${safeUrlForLog(uploadUrl)}`
    );

    if (files.length < imageMappings.length) {
      return json({ error: 'not-enough-files', required: imageMappings.length, received: files.length }, { status: 400 });
    }

    const authHeaders = buildAuthHeaders(apiKey);

    // 1) Upload files first (B-mode)
    const uploadedRefs: Array<{ fileKey?: string; fileValue?: string }> = [];
    for (const f of files.slice(0, imageMappings.length)) {
      const upForm = new FormData();
      upForm.set('file', f, f.name);

      const upstream = await fetch(uploadUrl, {
        method: 'POST',
        headers: authHeaders,
        body: upForm,
      });

      if (!upstream.ok) {
        console.warn(`[runninghub] upload failed status=${upstream.status} url=${safeUrlForLog(uploadUrl)}`);
        return json(
          {
            error: 'upload-failed',
            upstream: {
              url: safeUrlForLog(uploadUrl),
              status: upstream.status,
            },
          },
          { status: 502 }
        );
      }


      const payload = await upstream.json().catch(() => null);
      const ref = extractUploadRef(payload);
      if (!ref.fileKey && !ref.fileValue) {
        return json(
          {
            error: 'upload-no-file-ref',
            upstream: {
              url: safeUrlForLog(uploadUrl),
            },
          },
          { status: 502 }
        );
      }
      uploadedRefs.push(ref);
    }

    // 2) Build nodeInfoList from uploaded refs
    const nodeInputs: Array<{ nodeId: number; fieldName: string; fieldValue: unknown; fieldType?: 'file' | 'text' }> = [];
    for (let i = 0; i < imageMappings.length; i++) {
      const map = imageMappings[i];
      const ref = uploadedRefs[i];
      const chosen = chooseFileRef(ref, fileValueMode);
      if (!chosen) {
        return json({ error: 'upload-ref-empty' }, { status: 502 });
      }
      nodeInputs.push({
        nodeId: map.nodeId,
        fieldName: map.fieldName,
        fieldValue: chosen,
        fieldType: map.fieldType ?? 'file',
      });
    }

    // Optional prompt injection
    const promptNodeId = promptNodeIdRaw ? Number(promptNodeIdRaw) : undefined;
    if (prompt && promptNodeId && Number.isFinite(promptNodeId) && promptNodeId > 0) {
      nodeInputs.push({
        nodeId: promptNodeId,
        fieldName: promptFieldName,
        fieldValue: prompt,
        fieldType: promptFieldType,
      });
    }

    const basePayload: Record<string, unknown> = {
      // workflowId 有的入口走 path（.../workflow/:id），有的入口走 body
      // 这里先不放，后面会按候选入口自动补齐
    };


    if (workflowType) basePayload.workflowType = workflowType;
    if (instanceType) basePayload.instanceType = instanceType;
    if (usePersonalQueue) basePayload.usePersonalQueue = usePersonalQueue;
    if (addMetadata) basePayload.addMetadata = addMetadata;

    const candidates = buildRunCandidates(context.env, workflowId);
    const errors: Array<{ url: string; status?: number }> = [];

    for (const c of candidates) {
      const urlForLog = safeUrlForLog(c.url);
      const payload = {
        ...basePayload,
        ...(c.workflowInPath ? {} : { workflowId }),
        nodeInfoList:
          c.mode === 'call-api'
            ? toCallApiNodeInfoList(nodeInputs.map(n => ({ nodeId: n.nodeId, fieldName: n.fieldName, fieldValue: n.fieldValue })))
            : toOpenApiNodeInfoList(nodeInputs),
      };


      const resp = await fetch(c.url, {
        method: 'POST',
        headers: {
          ...Object.fromEntries(authHeaders.entries()),
          'content-type': 'application/json',
        },
        body: JSON.stringify(payload),
      }).catch(() => null);

      if (!resp) {
        console.warn(`[runninghub] run gateway fetch failed url=${urlForLog}`);
        errors.push({ url: urlForLog });
        continue;
      }

      if (!resp.ok) {
        console.warn(`[runninghub] run gateway bad status=${resp.status} url=${urlForLog}`);
        errors.push({ url: urlForLog, status: resp.status });
        continue;
      }


      const data = await resp.json().catch(() => null);
      const taskId = extractTaskId(data);
      const status = extractStatus(data) ?? 'PENDING';
      if (!taskId) {
        errors.push({ url: urlForLog, status: 200 });
        continue;
      }

      return json({ taskId, status });
    }

    return json(
      {
        error: 'run-failed',
        tried: errors,
      },
      { status: 502 }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown';

    if (msg.startsWith('missing-env:')) {
      const key = msg.slice('missing-env:'.length);
      return json({ error: 'missing-env', key }, { status: 500 });
    }

    console.error('[runninghub] run internal error');
    return json({ error: 'internal-error' }, { status: 500 });
  }
}
