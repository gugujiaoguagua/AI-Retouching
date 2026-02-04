import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, ImagePlus } from 'lucide-react';
import { Button } from '@/app/components/ui/button';
import { Card } from '@/app/components/ui/card';
import { Textarea } from '@/app/components/ui/textarea';
import { storageService } from '@/app/services/storage';
import type { ImageData } from '@/app/types';
import { toast } from 'sonner';

export function UploadPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const initialImage = location.state?.image as ImageData | undefined;
  const initialPrompt = (location.state?.prompt as string | undefined) ?? '';

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [image, setImage] = useState<ImageData | undefined>(
    initialImage?.source === 'example' ? undefined : initialImage,
  );
  const [prompt, setPrompt] = useState(initialPrompt);
  const [localObjectUrl, setLocalObjectUrl] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  useEffect(() => {
    return () => {
      if (localObjectUrl) {
        URL.revokeObjectURL(localObjectUrl);
      }
    };
  }, [localObjectUrl]);

  const handlePickImage = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('请选择图片文件');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast.error('图片大小不能超过 10MB');
      return;
    }

    if (localObjectUrl) {
      URL.revokeObjectURL(localObjectUrl);
    }

    const url = URL.createObjectURL(file);
    setLocalObjectUrl(url);
    setSelectedFile(file);
    setImage({
      id: `upload-${Date.now()}`,
      url,
      source: 'album',
      timestamp: Date.now(),
    });
  };

  const handleGenerate = () => {
    if (!image) return;

    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt) {
      toast.error('请输入文字描述');
      return;
    }

    if (!selectedFile) {
      toast.error('请先上传一张图片');
      return;
    }

    storageService.addRecentImage(image);
    navigate('/generating', { state: { image, prompt: trimmedPrompt, file: selectedFile } });
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
        <Card className="overflow-hidden">
          <div className="relative aspect-[4/3] bg-gray-100">
            {image ? (
              <img
                src={image.url}
                alt="Selected"
                className="w-full h-full object-contain"
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center gap-3 text-gray-500">
                <div className="size-14 rounded-full bg-white flex items-center justify-center border">
                  <ImagePlus className="size-6" />
                </div>
                <div className="text-sm">上传一张图片开始</div>
                <Button variant="outline" onClick={handlePickImage}>
                  选择图片
                </Button>
              </div>
            )}

            {image && (
              <div className="absolute top-2 right-2">
                <Button size="sm" variant="secondary" onClick={handlePickImage}>
                  重新选择
                </Button>
              </div>
            )}
          </div>
        </Card>

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
              disabled={!image || !prompt.trim()}
            >
              生成
            </Button>
          </div>
          <p className="text-xs text-center text-gray-500">
            上传 1 张图片 · 输入文字后可生成
          </p>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileSelect}
      />
    </div>
  );
}
