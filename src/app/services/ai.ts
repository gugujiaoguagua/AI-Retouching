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
  },
  onProgress?: (progress: number) => void
): Promise<string> {
  if (import.meta.env.PROD) {
    onProgress?.(0.1);

    const file = options?.file;
    if (file) {
      const form = new FormData();
      form.set('image', file);
      if (options?.prompt) form.set('prompt', options.prompt);

      const response = await fetch('/api/generate', {
        method: 'POST',
        body: form,
      });
      if (!response.ok) {
        throw new Error('generation-failed');
      }

      const blob = await response.blob();
      onProgress?.(1);
      return URL.createObjectURL(blob);
    }

    const response = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ imageUrl: originalUrl, prompt: options?.prompt }),
    });
    if (!response.ok) {
      throw new Error('generation-failed');
    }

    const blob = await response.blob();
    onProgress?.(1);
    return URL.createObjectURL(blob);
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
