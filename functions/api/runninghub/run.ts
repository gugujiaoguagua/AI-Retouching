import {
  buildAuthHeaders,
  buildRunCandidates,
  buildUploadCandidates,
  chooseFileRef,
  extractStatus,
  extractTaskId,
  extractUploadRef,
  getEnv,
  hasRhQuery,
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

    const uploadCandidates = buildUploadCandidates(context.env);
    if (!uploadCandidates.length) {
      return json({ error: 'missing-upload-config', required: ['RUNNINGHUB_UPLOAD_URL（或 RUNNINGHUB_UPLOAD_URLS）'] }, { status: 500 });
    }

    console.log(
      `[runninghub] run start files=${files.length} mappings=${imageMappings.length} uploadCandidates=${uploadCandidates.length} firstUpload=${safeUrlForLog(uploadCandidates[0])}`
    );

    if (files.length < imageMappings.length) {
      return json({ error: 'not-enough-files', required: imageMappings.length, received: files.length }, { status: 400 });
    }

    const authHeaders = buildAuthHeaders(apiKey);

    const uploadFieldFromEnv = (context.env['RUNNINGHUB_UPLOAD_FIELD'] ?? '').trim();

    const uploadUseBearerRaw = (context.env['RUNNINGHUB_UPLOAD_USE_BEARER'] ?? '').trim().toLowerCase();
    const uploadUseBearerFixed = uploadUseBearerRaw === 'true' ? true : uploadUseBearerRaw === 'false' ? false : undefined;

    function inferUploadField(uploadUrl: string) {
      if (uploadFieldFromEnv) return uploadFieldFromEnv;
      return safeUrlForLog(uploadUrl).includes('/upload/image') ? 'image' : 'file';
    }

    function inferUseBearer(uploadUrl: string) {
      if (typeof uploadUseBearerFixed === 'boolean') return uploadUseBearerFixed;
      // 如果 uploadUrl 带 Rh-* 签名 query，通常不需要/不接受 Bearer
      return !hasRhQuery(uploadUrl);
    }

    async function uploadOnce(file: File, uploadUrl: string, field: string, useBearer: boolean) {
      const upForm = new FormData();
      upForm.set(field, file, file.name);

      const resp = await fetch(uploadUrl, {
        method: 'POST',
        headers: useBearer ? authHeaders : undefined,
        body: upForm,
      });

      const contentType = resp.headers.get('content-type') || '';
      const text = await resp.text().catch(() => '');
      let data: any = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = null;
      }

      const ref = extractUploadRef(data);
      const topKeys = data && typeof data === 'object' && !Array.isArray(data) ? Object.keys(data).slice(0, 30) : null;

      return {
        ok: resp.ok,
        status: resp.status,
        contentType,
        bytes: text.length,
        topKeys,
        ref,
      };
    }

    // 1) Upload files first (B-mode)
    const uploadedRefs: Array<{ fileKey?: string; fileValue?: unknown }> = [];
    for (const f of files.slice(0, imageMappings.length)) {
      let gotRef: { fileKey?: string; fileValue?: unknown } | null = null;

      const attempts: Array<{
        url: string;
        field: string;
        useBearer: boolean;
        status?: number;
        bytes?: number;
        topKeys?: string[] | null;
      }> = [];

      let sawOkButNoRef = false;
      let lastBadStatus: number | undefined = undefined;

      for (const candUrl of uploadCandidates) {
        const uploadField = inferUploadField(candUrl);
        const altField = uploadField === 'image' ? 'file' : 'image';
        const useBearer0 = inferUseBearer(candUrl);

        const attemptPlan: Array<{ field: string; useBearer: boolean }> = [];
        // 优先按当前推断
        attemptPlan.push({ field: uploadField, useBearer: useBearer0 });

        // 兜底：换字段名（某些入口用 image，有些用 file）
        if (!uploadFieldFromEnv && altField !== uploadField) {
          attemptPlan.push({ field: altField, useBearer: useBearer0 });
        }

        // 兜底：换鉴权方式（某些签名上传入口不需要/不接受 Bearer）
        if (!uploadUseBearerRaw) {
          attemptPlan.push({ field: uploadField, useBearer: !useBearer0 });
        }

        for (const plan of attemptPlan) {
          const res = await uploadOnce(f, candUrl, plan.field, plan.useBearer);
          lastBadStatus = res.ok ? lastBadStatus : res.status;

          attempts.push({
            url: safeUrlForLog(candUrl),
            field: plan.field,
            useBearer: plan.useBearer,
            status: res.status,
            bytes: res.bytes,
            topKeys: res.topKeys,
          });

          if (!res.ok) continue;

          if (res.ref.fileKey || typeof res.ref.fileValue !== 'undefined') {
            gotRef = res.ref;
            break;
          }

          sawOkButNoRef = true;
        }

        if (gotRef) break;
      }

      if (!gotRef) {
        const firstUpload = uploadCandidates[0];
        if (!sawOkButNoRef) {
          console.warn(
            `[runninghub] upload failed status=${lastBadStatus ?? 0} url=${safeUrlForLog(firstUpload)}`
          );
          return json(
            {
              error: 'upload-failed',
              upstream: {
                url: safeUrlForLog(firstUpload),
                status: lastBadStatus,
              },
              attempts,
            },
            { status: 502 }
          );
        }

        return json(
          {
            error: 'upload-no-file-ref',
            upstream: {
              url: safeUrlForLog(firstUpload),
            },
            attempts,
          },
          { status: 502 }
        );
      }

      uploadedRefs.push(gotRef);
    }


    // 2) Build nodeInfoList from uploaded refs
    const nodeInputs: Array<{ nodeId: number; fieldName: string; fieldValue: unknown; fieldType?: 'file' | 'text' }> = [];
    for (let i = 0; i < imageMappings.length; i++) {
      const map = imageMappings[i];
      const ref = uploadedRefs[i];
      const chosen = chooseFileRef(ref, fileValueMode);
      const isEmptyString = typeof chosen === 'string' && chosen.trim().length === 0;
      if (typeof chosen === 'undefined' || chosen === null || isEmptyString) {
        return json({ error: 'upload-ref-empty' }, { status: 502 });
      }

      nodeInputs.push({
        nodeId: map.nodeId,
        fieldName: map.fieldName,
        fieldValue: chosen,
        fieldType: map.fieldType ?? 'file',
      });
    }

    // Prompt injection
    // - Prefer env: RUNNINGHUB_PROMPT_NODE_ID
    // - Fallback: node 1 (common for ComfyUI-style workflows)
    const parsedPromptNodeId = promptNodeIdRaw ? Number(promptNodeIdRaw) : Number.NaN;
    const effectivePromptNodeId = Number.isFinite(parsedPromptNodeId) && parsedPromptNodeId > 0 ? parsedPromptNodeId : 1;

    if (prompt) {
      nodeInputs.push({
        nodeId: effectivePromptNodeId,
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
