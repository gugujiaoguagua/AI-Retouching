import type { AnalysisResult, GenerationError } from '@/app/types';

// Simulate AI image analysis
export async function analyzeImage(imageUrl: string): Promise<AnalysisResult> {
  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 2000 + Math.random() * 1000));

  // Simulate occasional failures
  if (Math.random() < 0.05) {
    throw new Error('analysis-failed');
  }

  // Generate mock analysis based on image content hints
  const analyses = [
    {
      summary: '室内人像、柔光、浅景深',
      details: '这是一张专业的人像摄影作品，采用自然光拍摄，背景虚化效果良好。人物表情自然，光线柔和，整体色调温暖。适合用于头像、社交媒体或专业简历。',
      tags: ['人像', '室内', '自然光', '专业'],
      confidence: 0.92
    },
    {
      summary: '风景摄影、日落时分、山景',
      details: '壮丽的山地风光，拍摄于日落时分。画面层次分明，色彩饱满，展现了大自然的磅礴气势。光线温暖，适合作为壁纸或旅行记录。',
      tags: ['风景', '山景', '日落', '户外'],
      confidence: 0.89
    },
    {
      summary: '宠物摄影、动物特写、自然环境',
      details: '可爱的宠物照片，捕捉到了动物生动的表情和姿态。背景简洁，主体突出，色彩自然。非常适合宠物主人纪念或分享。',
      tags: ['宠物', '动物', '特写', '户外'],
      confidence: 0.95
    },
    {
      summary: '产品摄影、简约风格、静物',
      details: '专业的产品摄影，采用简约的构图和纯净的背景。光线均匀，细节清晰，能够很好地展现产品的质感和设计。适合电商或品牌展示。',
      tags: ['产品', '静物', '简约', '商业'],
      confidence: 0.88
    },
    {
      summary: '抽象艺术、色彩丰富、创意设计',
      details: '充满创意的抽象作品，色彩鲜明，构图独特。视觉冲击力强，富有艺术感和想象空间。适合作为装饰画或设计素材。',
      tags: ['抽象', '艺术', '色彩', '创意'],
      confidence: 0.86
    }
  ];

  // Return random analysis
  return analyses[Math.floor(Math.random() * analyses.length)];
}

// Simulate AI image generation
export async function generateImage(
  originalUrl: string,
  options?: {
    prompt?: string;
    file?: File;
    files?: File[];
  },
  onProgress?: (
    progress: number,
    meta?: {
      phase?: 'run' | 'query' | 'done';
      taskId?: string;
      status?: string;
    }
  ) => void
): Promise<string> {
  if (import.meta.env.PROD) {
    const prompt = options?.prompt?.trim() ?? '';
    const files = (options?.files?.filter(Boolean) ?? []) as File[];

    // B 模式：必须先上传文件再 run（前端只把 File 交给同域 Functions）
    if (!files.length) {
      throw new Error('missing-file');
    }

    onProgress?.(0.05, { phase: 'run' });

    // 1) run
    const runForm = new FormData();
    for (const f of files) {
      runForm.append('file', f, f.name);
    }
    if (prompt) runForm.set('prompt', prompt);

    const runResp = await fetch('/api/runninghub/run', {
      method: 'POST',
      body: runForm,
    });

    if (!runResp.ok) {
      throw new Error('generation-failed');
    }

    const runJson = (await runResp.json().catch(() => null)) as null | { taskId?: string };
    const taskId = typeof runJson?.taskId === 'string' ? runJson.taskId : '';
    if (!taskId) {
      throw new Error('generation-failed');
    }

    onProgress?.(0.15, { phase: 'query', taskId });

    // 2) poll query
    const startedAt = Date.now();
    const timeoutMs = 3 * 60 * 1000;
    const intervalMs = 1200;

    while (Date.now() - startedAt < timeoutMs) {
      const queryResp = await fetch('/api/runninghub/query', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ taskId }),
      });

      if (!queryResp.ok) {
        throw new Error('generation-failed');
      }

      const queryJson = (await queryResp.json().catch(() => null)) as null | {
        status?: string;
        results?: Array<{ url?: string }>;
      };

      const status = (queryJson?.status ?? '').toUpperCase();
      onProgress?.(Math.min(0.95, 0.15), { phase: 'query', taskId, status });
      if (status === 'SUCCESS' || status === 'SUCCEEDED' || status === 'DONE' || status === 'COMPLETED') {
        const url = queryJson?.results?.[0]?.url;
        onProgress?.(1, { phase: 'done', taskId, status });
        return typeof url === 'string' && url ? url : `/api/runninghub/image?taskId=${encodeURIComponent(taskId)}&index=0`;
      }

      if (status === 'FAILED' || status === 'FAIL' || status === 'ERROR' || status === 'CANCELED' || status === 'CANCELLED') {
        throw new Error('generation-failed');
      }

      const elapsed = Date.now() - startedAt;
      const p = Math.min(0.95, 0.15 + (elapsed / timeoutMs) * 0.8);
      onProgress?.(p);

      await new Promise(resolve => setTimeout(resolve, intervalMs));
    }

    throw new Error('timeout');
  }


  const steps = 10;
  for (let i = 0; i <= steps; i++) {
    await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 500));
    onProgress?.(i / steps);
  }

  if (Math.random() < 0.03) {
    throw new Error('generation-failed');
  }

  return originalUrl;
}

// Error handling helper
export function parseError(error: unknown): GenerationError {
  const errorMessage = error instanceof Error ? error.message : 'unknown';

  if (errorMessage.includes('network') || errorMessage.includes('fetch')) {
    return {
      type: 'network',
      message: '网络连接失败',
      action: '请检查网络后重试'
    };
  }

  if (errorMessage.includes('missing-file')) {
    return {
      type: 'format',
      message: '缺少上传图片',
      action: '请至少选择 1 张图片后再生成'
    };
  }

  if (errorMessage.includes('format') || errorMessage.includes('unsupported')) {
    return {
      type: 'format',
      message: '图片格式不支持',
      action: '请选择 JPG、PNG 或 WebP 格式的图片'
    };
  }


  if (errorMessage.includes('compliance')) {
    return {
      type: 'compliance',
      message: '该图片内容不支持生成',
      action: '请选择其他图片'
    };
  }

  if (errorMessage.includes('busy') || errorMessage.includes('timeout')) {
    return {
      type: 'service-busy',
      message: '服务繁忙',
      action: '请稍后再试'
    };
  }

  return {
    type: 'service-busy',
    message: '生成失败',
    action: '请重试或换一张图片'
  };
}
