import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/app/components/ui/button';
import { Card } from '@/app/components/ui/card';
import type { ImageData } from '@/app/types';

export function ConfirmPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const image = location.state?.image as ImageData | undefined;

  useEffect(() => {
    if (!image) {
      navigate('/');
      return;
    }
  }, [image]);

  const handleGenerate = () => {
    if (!image) return;

    navigate('/generating', {
      state: { image }
    });
  };

  const handleChangeImage = () => {
    navigate('/');
  };

  if (!image) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="border-b bg-white sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleChangeImage}
          >
            <ArrowLeft className="size-4 mr-1" />
            返回
          </Button>
          <h1 className="flex-1 text-center font-semibold">确认生成</h1>
          <div className="w-20" /> {/* Spacer for center alignment */}
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-6 pb-32">
        {/* Image Preview */}
        <Card className="overflow-hidden">
          <div className="relative aspect-[4/3] bg-gray-100">
            <img
              src={image.url}
              alt="Selected"
              className="w-full h-full object-contain"
            />
            <div className="absolute top-2 right-2">
              <span className="px-2 py-1 bg-black/60 text-white text-xs rounded">
                {image.source === 'album' ? '相册' : '示例'}
              </span>
            </div>
          </div>
        </Card>
      </main>

      {/* Fixed Bottom Actions */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t p-4">
        <div className="max-w-3xl mx-auto space-y-3">
          <div className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1"
              onClick={handleChangeImage}
            >
              换一张图
            </Button>
            <Button
              className="flex-1"
              onClick={handleGenerate}
            >
              确认并生成
            </Button>
          </div>
          <p className="text-xs text-center text-gray-500">
            预计耗时 10-30 秒 · 失败不扣费，可重试
          </p>
        </div>
      </div>
    </div>
  );
}
