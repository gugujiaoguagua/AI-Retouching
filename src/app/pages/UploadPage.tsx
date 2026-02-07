import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, ImagePlus } from 'lucide-react';
import { Button } from '@/app/components/ui/button';
import { Card } from '@/app/components/ui/card';
import { Textarea } from '@/app/components/ui/textarea';
import { storageService } from '@/app/services/storage';
import type { ImageData } from '@/app/types';
import { toast } from 'sonner';

type PickedImage = {
  file: File | null;
  objectUrl: string | null;
};

function validateImageFile(file: File) {
  if (!file.type.startsWith('image/')) {
    toast.error('请选择图片文件');
    return false;
  }

  if (file.size > 10 * 1024 * 1024) {
    toast.error('图片大小不能超过 10MB');
    return false;
  }

  return true;
}

export function UploadPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const initialPrompt = (location.state?.prompt as string | undefined) ?? '';


  const baseInputRef = useRef<HTMLInputElement>(null);
  const image1InputRef = useRef<HTMLInputElement>(null);
  const image2InputRef = useRef<HTMLInputElement>(null);

  const [prompt, setPrompt] = useState(initialPrompt);
  const pointsBalance = storageService.getPointsBalance();



  const [picked, setPicked] = useState<{ base: PickedImage; image1: PickedImage; image2: PickedImage }>({
    base: { file: null, objectUrl: null },
    image1: { file: null, objectUrl: null },
    image2: { file: null, objectUrl: null },
  });

  const pickedRef = useRef(picked);

  useEffect(() => {
    pickedRef.current = picked;
  }, [picked]);

  useEffect(() => {
    return () => {
      const current = pickedRef.current;
      for (const k of Object.keys(current) as Array<keyof typeof current>) {
        const url = current[k].objectUrl;
        if (url) URL.revokeObjectURL(url);
      }
    };
  }, []);

  const handlePick = (which: 'base' | 'image1' | 'image2') => {
    if (which === 'base') baseInputRef.current?.click();
    if (which === 'image1') image1InputRef.current?.click();
    if (which === 'image2') image2InputRef.current?.click();
  };

  const handleFileSelect = (which: 'base' | 'image1' | 'image2') => (event: ChangeEvent<HTMLInputElement>) => {

    const file = event.target.files?.[0];
    if (!file) return;
    if (!validateImageFile(file)) return;

    setPicked(prev => {
      const prevUrl = prev[which].objectUrl;
      if (prevUrl) URL.revokeObjectURL(prevUrl);

      const url = URL.createObjectURL(file);
      const next = {
        ...prev,
        [which]: { file, objectUrl: url },
      };



      return next;
    });

    // allow picking same file again
    event.currentTarget.value = '';
  };

  const handleGenerate = () => {
    const balance = storageService.getPointsBalance();
    if (balance < 1.25) {
      toast.error('积分不足（至少需要 1.25 积分），请先在设置中兑换激活码或充值积分');
      return;
    }

    if (!picked.base.file) {
      toast.error('请先选择图片');
      return;
    }

    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt) {
      toast.error('请输入文字描述');
      return;
    }


    const baseUrl = picked.base.objectUrl ?? URL.createObjectURL(picked.base.file);
    const nextImage: ImageData = {
      id: `upload-${Date.now()}`,
      url: baseUrl,
      source: 'album',
      timestamp: Date.now(),
    };

    navigate('/generating', {
      state: {
        image: nextImage,
        prompt: trimmedPrompt,
        batchImageSlots: [picked.base.file, picked.image1.file, picked.image2.file],
      },
    });
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b bg-white sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/')}
          >
            <ArrowLeft className="size-4 mr-1" />
            返回
          </Button>
          <h1 className="flex-1 text-center font-semibold">上传并生成</h1>
          <div className="w-20" />
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-6 pb-32">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-gray-700">选择 1-3 张图片</h2>
            <p className="text-xs text-gray-500">不足会自动补白底图</p>
          </div>

          <div className="flex flex-wrap gap-4">
            <Card className="overflow-hidden w-40 h-40 flex-shrink-0">
              <div className="relative w-full h-full bg-gray-100">
                {picked.base.objectUrl ? (
                  <img src={picked.base.objectUrl} alt="图片" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-gray-500">
                    <ImagePlus className="size-5" />
                    <div className="text-[10px]">图片</div>
                  </div>
                )}
                <div className="absolute top-1 right-1">
                  <Button size="sm" variant="secondary" className="h-7 px-2 text-[10px]" onClick={() => handlePick('base')}>
                    {picked.base.objectUrl ? '重选' : '选择'}
                  </Button>
                </div>
              </div>
            </Card>

            {picked.base.objectUrl && (
              <Card className="overflow-hidden w-40 h-40 flex-shrink-0 animate-in fade-in slide-in-from-left-2">
                <div className="relative w-full h-full bg-gray-100">
                  {picked.image1.objectUrl ? (
                    <img src={picked.image1.objectUrl} alt="图片1" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-gray-500">
                      <ImagePlus className="size-5" />
                      <div className="text-[10px]">图片1</div>
                    </div>
                  )}
                  <div className="absolute top-1 right-1">
                    <Button size="sm" variant="secondary" className="h-7 px-2 text-[10px]" onClick={() => handlePick('image1')}>
                      {picked.image1.objectUrl ? '重选' : '选择'}
                    </Button>
                  </div>
                </div>
              </Card>
            )}

            {picked.image1.objectUrl && (
              <Card className="overflow-hidden w-40 h-40 flex-shrink-0 animate-in fade-in slide-in-from-left-2">
                <div className="relative w-full h-full bg-gray-100">
                  {picked.image2.objectUrl ? (
                    <img src={picked.image2.objectUrl} alt="图片2" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-gray-500">
                      <ImagePlus className="size-5" />
                      <div className="text-[10px]">图片2</div>
                    </div>
                  )}
                  <div className="absolute top-1 right-1">
                    <Button size="sm" variant="secondary" className="h-7 px-2 text-[10px]" onClick={() => handlePick('image2')}>
                      {picked.image2.objectUrl ? '重选' : '选择'}
                    </Button>
                  </div>
                </div>
              </Card>
            )}
          </div>


        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-gray-700">文字描述</h2>
            <div className="text-xs text-gray-500">
              {prompt.trim().length}/200
            </div>
          </div>
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value.slice(0, 200))}
            placeholder="输入你想生成的效果，例如：把照片变成日漫风格、增加柔和光晕、提升清晰度..."
            className="min-h-28"
          />
        </div>
      </main>

      <div className="fixed bottom-0 left-0 right-0 bg-white border-t p-4">
        <div className="max-w-3xl mx-auto space-y-3">
          <div className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => navigate('/')}
            >
              取消
            </Button>
            <Button
              className="flex-1"
              onClick={handleGenerate}
              disabled={!picked.base.file || !prompt.trim() || pointsBalance < 1}
            >
              生成
            </Button>
          </div>
          <p className="text-xs text-center text-gray-500">
            至少上传 1 张图片 · 不足会自动补白底图
          </p>
          {pointsBalance < 1 && (
            <p className="text-xs text-center text-red-500">
              积分不足，无法生成，请先在设置中兑换激活码或充值积分
            </p>
          )}
        </div>
      </div>

      <input
        ref={baseInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileSelect('base')}
      />
      <input
        ref={image1InputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileSelect('image1')}
      />
      <input
        ref={image2InputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileSelect('image2')}
      />
    </div>
  );
}
