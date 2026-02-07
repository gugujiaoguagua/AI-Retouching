import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Loader2, X } from 'lucide-react';
import { Button } from '@/app/components/ui/button';
import { Progress } from '@/app/components/ui/progress';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/app/components/ui/alert-dialog';
import { generateImage, parseError } from '@/app/services/ai';
import { storageService } from '@/app/services/storage';
import type { ImageData, GenerationResult, OutputResolution } from '@/app/types';

import { toast } from 'sonner';

const COST_BY_RESOLUTION: Record<OutputResolution, number> = {
  '2k': 10,
  '4k': 30,
};
const MAX_GENERATION_MS = 5 * 60 * 1000;



function formatDuration(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function formatPoints(points: number) {
  if (!Number.isFinite(points)) return '0';
  const fixed = points.toFixed(2);
  return fixed.replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
}

async function fileToDataUrl(file: File): Promise<string> {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('read-file-failed'));
    reader.onload = () => resolve(String(reader.result || ''));
    reader.readAsDataURL(file);
  });
}

async function createWhitePngFileLike(base: File, name: string): Promise<File> {
  let width = 1024;
  let height = 1024;

  try {
    const bmp = await createImageBitmap(base);
    width = bmp.width || width;
    height = bmp.height || height;
    bmp.close();
  } catch {
    // ignore
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    // fallback: empty file
    return new File([new Blob([], { type: 'image/png' })], name, { type: 'image/png' });
  }
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => {
      if (!b) return reject(new Error('canvas-to-blob-failed'));
      resolve(b);
    }, 'image/png');
  });

  return new File([blob], name, { type: 'image/png' });
}

export function GeneratingPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const image = location.state?.image as ImageData | undefined;
  const prompt = location.state?.prompt as string | undefined;
  const resolutionRaw = location.state?.resolution as OutputResolution | undefined;
  const resolution: OutputResolution = resolutionRaw === '4k' ? '4k' : '2k';
  const costPoints = COST_BY_RESOLUTION[resolution];

  const file = location.state?.file as File | undefined;
  const batchImageFiles = location.state?.batchImageFiles as File[] | undefined;
  const batchImageSlots = location.state?.batchImageSlots as Array<File | null> | undefined;


  const [progress, setProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState('准备中...');
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [canBackground, setCanBackground] = useState(false);
  const [elapsedLabel, setElapsedLabel] = useState('00:00');

  const cancelledRef = useRef(false);
  const userCancelledRef = useRef(false);
  const mountedRef = useRef(true);
  const historyIdRef = useRef<string | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const preDeductedRef = useRef(false);



  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!image) {
      navigate('/');
      return;
    }

    // Allow background after 3 seconds
    const timer = setTimeout(() => {
      if (!mountedRef.current) return;
      setCanBackground(true);
    }, 3000);

    const ticker = setInterval(() => {
      const startedAt = startedAtRef.current;
      if (!startedAt) return;
      if (!mountedRef.current) return;
      setElapsedLabel(formatDuration(Date.now() - startedAt));
    }, 500);

    startGeneration();

    return () => {
      clearTimeout(timer);
      clearInterval(ticker);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [image]);

  const startGeneration = async () => {
    if (!image) return;

    const fallbackFiles = Array.isArray(batchImageFiles) && batchImageFiles.length ? batchImageFiles : file ? [file] : [];
    const slots = Array.isArray(batchImageSlots) && batchImageSlots.length
      ? batchImageSlots
      : [fallbackFiles[0] ?? null, fallbackFiles[1] ?? null, fallbackFiles[2] ?? null];

    const baseFile = slots[0] ?? null;
    if (!baseFile) {
      toast.error('请先选择至少 1 张图片');
      navigate('/upload', { state: { prompt, resolution }, replace: true });
      return;

    }

    const balance = storageService.getPointsBalance();
    if (balance < costPoints) {
      toast.error(`积分不足（至少需要 ${formatPoints(costPoints)} 积分），请先在设置中兑换激活码或充值积分`);
      navigate('/settings', { replace: true });
      return;
    }



    // 自动补齐白底图，保证后端能按 3 节点注入
    const resolvedFiles: File[] = [baseFile];
    for (let i = 1; i < 3; i++) {
      const f = slots[i];
      if (f) {
        resolvedFiles.push(f);
      } else {
        resolvedFiles.push(await createWhitePngFileLike(baseFile, `blank-${i}.png`));
      }
    }

    const startedAt = Date.now();
    startedAtRef.current = startedAt;

    // 生成输入预览（用于渲染记录）
    const inputPreviews = await Promise.all(resolvedFiles.map(f => fileToDataUrl(f)));

    const historyId = `rh-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    historyIdRef.current = historyId;

    const originalForRecord: ImageData = {
      id: `upload-${startedAt}`,
      url: inputPreviews[0] || image.url,
      source: 'album',
      timestamp: startedAt,
    };

    storageService.upsertHistoryItem({
      id: historyId,
      originalImage: originalForRecord,
      prompt,
      timestamp: startedAt,
      status: 'rendering',
      startedAt,
      inputPreviews,
      resolution,
      costPoints,
    });

    // 扣费：按分辨率扣费（失败/取消/超时会自动返还）
    if (!preDeductedRef.current) {
      preDeductedRef.current = true;
      storageService.deductPoints(costPoints, `生成扣费（${resolution.toUpperCase()} / ${formatPoints(costPoints)}）`);
    }



    try {
      if (mountedRef.current) {
        setCurrentStep('上传并提交任务...');
        setProgress(10);
      }


      const generatedUrl = await Promise.race([
        generateImage(
          image.url,
          {
            prompt,
            files: resolvedFiles,
            resolution,
          },
          (genProgress, meta) => {

            if (cancelledRef.current) return;

            if (meta?.taskId) {
              storageService.updateHistoryItem(historyId, { taskId: meta.taskId });
            }

            if (meta?.phase === 'query' && meta?.status) {
              storageService.updateHistoryItem(historyId, { status: 'rendering' });
              if (mountedRef.current) {
                setCurrentStep(`渲染中（${meta.status}）...`);
              }
            }

            if (mountedRef.current) {
              const p = Math.min(0.95, Math.max(0, genProgress));
              setProgress(10 + p * 80); // 10% to 90%
            }
          }
        ),
        new Promise<string>((_, reject) => {
          window.setTimeout(() => {
            // 停止继续写入进度/覆盖失败状态
            cancelledRef.current = true;
            reject(new Error('timeout'));
          }, MAX_GENERATION_MS);
        }),
      ]);


      if (cancelledRef.current) return;

      if (mountedRef.current) {
        setCurrentStep('后处理中...');
        setProgress(95);
      }

      await new Promise(resolve => setTimeout(resolve, 1000));
      if (cancelledRef.current) return;

      const endedAt = Date.now();
      const elapsedMs = endedAt - startedAt;

      preDeductedRef.current = false;
      toast.success(`本次生成扣费 ${resolution.toUpperCase()} / ${formatPoints(costPoints)} 积分`);




      const updated =         storageService.updateHistoryItem(historyId, {
          status: 'completed',
          generatedUrl,
          endedAt,
          elapsedMs,
          resolution,
          costPoints,
        });


      if (mountedRef.current) {
        setProgress(100);
      }

      // Navigate to result page
      const result: GenerationResult = updated ?? {
        id: historyId,
        originalImage: originalForRecord,
        generatedUrl,
        prompt,
        timestamp: startedAt,
        status: 'completed',
        startedAt,
        endedAt,
        elapsedMs,
        inputPreviews,
        resolution,
        costPoints,
      };


      navigate('/result', { state: { result }, replace: true });
    } catch (error) {
      const endedAt = Date.now();
      const elapsedMs = startedAt ? endedAt - startedAt : undefined;
      const errMsg = error instanceof Error ? error.message : 'unknown';

      storageService.updateHistoryItem(historyId, {
        status: 'failed',
        endedAt,
        elapsedMs,
        errorMessage: errMsg,
      });

      // 失败/超时：返还预扣费（如果已预扣且未结算）
      if (preDeductedRef.current) {
        preDeductedRef.current = false;
        storageService.addPoints(costPoints, `生成返还（${resolution.toUpperCase()} / ${formatPoints(costPoints)}）`);
      }


      if (userCancelledRef.current) return;

      // 超过 5 分钟：自动取消并提示
      if (errMsg.includes('timeout')) {

        toast.info('生成超过 5 分钟已自动取消：图片未生成，积分已返还');
        navigate('/history', { replace: true });
        return;
      }

      const parsedError = parseError(error);
      navigate('/error', {
        state: { error: parsedError, image, prompt, resolution, batchImageFiles, batchImageSlots },
        replace: true,
      });

    }
  };

  const handleCancel = () => {
    setShowCancelDialog(true);
  };

  const confirmCancel = () => {
    cancelledRef.current = true;
    userCancelledRef.current = true;


    // 取消：返还预扣费
    if (preDeductedRef.current) {
      preDeductedRef.current = false;
      storageService.addPoints(costPoints, `取消生成返还（${resolution.toUpperCase()} / ${formatPoints(costPoints)}）`);
    }



    const historyId = historyIdRef.current;
    if (historyId) {
      storageService.updateHistoryItem(historyId, {
        status: 'failed',
        endedAt: Date.now(),
        elapsedMs: startedAtRef.current ? Date.now() - startedAtRef.current : undefined,
        errorMessage: 'user-cancelled',
      });
    }

    toast.info('已取消：图片未生成，积分已返还');
    navigate('/', { replace: true });
  };

  const handleBackground = () => {
    // 生成逻辑会继续执行（不再依赖页面是否挂载），用户可在“渲染记录”查看进度。
    navigate('/history', { replace: true });
  };

  const getEstimatedTime = () => {
    const remaining = 100 - progress;
    const seconds = Math.ceil((remaining / 100) * 25);
    return `预计还需 ${seconds} 秒 · 已用 ${elapsedLabel}（超过 5 分钟会自动取消）`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-8">
        <div className="flex justify-center">
          <div className="relative">
            <div className="size-32 rounded-full bg-blue-100 animate-pulse" />
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2 className="size-16 text-blue-600 animate-spin" />
            </div>
          </div>
        </div>

        <div className="text-center space-y-4">
          <h2 className="text-2xl font-semibold">生成中…</h2>
          <p className="text-gray-600">{currentStep}</p>

          <div className="space-y-2">
            <Progress value={progress} className="h-2" />
            <div className="flex justify-between text-sm text-gray-500">
              <span>{Math.round(progress)}%</span>
              <span>{getEstimatedTime()}</span>
            </div>
          </div>
        </div>

        {image && (
          <div className="rounded-lg overflow-hidden border-2 border-blue-200">
            <img
              src={image.url}
              alt="Original"
              className="w-full aspect-[4/3] object-cover opacity-50"
            />
          </div>
        )}

        <div className="flex flex-col gap-3">
          {canBackground && (
            <Button variant="outline" onClick={handleBackground} className="w-full">
              查看渲染记录
            </Button>
          )}
          <Button variant="ghost" onClick={handleCancel} className="w-full">
            <X className="size-4 mr-2" />
            取消生成
          </Button>
          <p className="text-xs text-center text-gray-500">取消不会扣费，你可以随时重新生成</p>
        </div>
      </div>

      <AlertDialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认取消？</AlertDialogTitle>
            <AlertDialogDescription>当前生成进度将会丢失，但不会产生任何费用。你确定要取消吗？</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>继续生成</AlertDialogCancel>
            <AlertDialogAction onClick={confirmCancel}>确认取消</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
