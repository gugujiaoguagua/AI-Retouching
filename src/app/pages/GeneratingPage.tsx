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
import type { ImageData, GenerationResult } from '@/app/types';
import { toast } from 'sonner';

export function GeneratingPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const image = location.state?.image as ImageData | undefined;
  const prompt = location.state?.prompt as string | undefined;

  const [progress, setProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState('准备中...');
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [canBackground, setCanBackground] = useState(false);
  const cancelledRef = useRef(false);

  useEffect(() => {
    if (!image) {
      navigate('/');
      return;
    }

    // Allow background after 3 seconds
    const timer = setTimeout(() => {
      setCanBackground(true);
    }, 3000);

    startGeneration();

    return () => clearTimeout(timer);
  }, [image]);

  const startGeneration = async () => {
    if (!image) return;

    try {
      // Step 1: Generating
      setCurrentStep('生成中...');
      setProgress(10);
      const generationStartedAt = Date.now();

      const generatedUrl = await generateImage(
        image.url,
        { prompt },
        (genProgress) => {
          if (cancelledRef.current) return;
          setProgress(10 + genProgress * 80); // 10% to 90%
        }
      );

      if (cancelledRef.current) return;

      // Step 3: Post-processing
      setCurrentStep('后处理中...');
      setProgress(95);

      await new Promise(resolve => setTimeout(resolve, 1000));
      if (cancelledRef.current) return;

      setProgress(100);

      const generationEndedAt = Date.now();
      const elapsedMs = generationEndedAt - generationStartedAt;
      const billedMinutes = Math.max(1, Math.ceil(elapsedMs / 60000));
      storageService.deductPoints(billedMinutes, `生成扣费（${billedMinutes} 分钟）`);
      toast.success(`本次生成扣费 ${billedMinutes} 积分`);

      // Save to history
      const result: GenerationResult = {
        id: `gen-${Date.now()}`,
        originalImage: image,
        generatedUrl,
        prompt,
        timestamp: Date.now()
      };

      storageService.addToHistory(result);

      // Navigate to result page
      navigate('/result', { state: { result }, replace: true });

    } catch (error) {
      if (cancelledRef.current) return;

      const parsedError = parseError(error);
      navigate('/error', {
        state: { error: parsedError, image, prompt },
        replace: true
      });
    }
  };

  const handleCancel = () => {
    setShowCancelDialog(true);
  };

  const confirmCancel = () => {
    cancelledRef.current = true;
    navigate('/', { replace: true });
  };

  const handleBackground = () => {
    // In a real app, this would minimize and allow background processing
    navigate('/', { replace: true });
  };

  const getEstimatedTime = () => {
    const remaining = 100 - progress;
    const seconds = Math.ceil((remaining / 100) * 25);
    return `预计还需 ${seconds} 秒`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-8">
        {/* Animation */}
        <div className="flex justify-center">
          <div className="relative">
            <div className="size-32 rounded-full bg-blue-100 animate-pulse" />
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2 className="size-16 text-blue-600 animate-spin" />
            </div>
          </div>
        </div>

        {/* Status */}
        <div className="text-center space-y-4">
          <h2 className="text-2xl font-semibold">生成中…</h2>
          <p className="text-gray-600">{currentStep}</p>

          {/* Progress Bar */}
          <div className="space-y-2">
            <Progress value={progress} className="h-2" />
            <div className="flex justify-between text-sm text-gray-500">
              <span>{Math.round(progress)}%</span>
              <span>{getEstimatedTime()}</span>
            </div>
          </div>
        </div>

        {/* Preview Image */}
        {image && (
          <div className="rounded-lg overflow-hidden border-2 border-blue-200">
            <img
              src={image.url}
              alt="Original"
              className="w-full aspect-[4/3] object-cover opacity-50"
            />
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-col gap-3">
          {canBackground && (
            <Button
              variant="outline"
              onClick={handleBackground}
              className="w-full"
            >
              后台等待
            </Button>
          )}
          <Button
            variant="ghost"
            onClick={handleCancel}
            className="w-full"
          >
            <X className="size-4 mr-2" />
            取消生成
          </Button>
          <p className="text-xs text-center text-gray-500">
            取消不会扣费，你可以随时重新生成
          </p>
        </div>
      </div>

      {/* Cancel Confirmation Dialog */}
      <AlertDialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认取消？</AlertDialogTitle>
            <AlertDialogDescription>
              当前生成进度将会丢失，但不会产生任何费用。你确定要取消吗？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>继续生成</AlertDialogCancel>
            <AlertDialogAction onClick={confirmCancel}>
              确认取消
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
