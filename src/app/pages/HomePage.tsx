import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ImagePlus, Camera, History, AlertCircle, User } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { Button } from '@/app/components/ui/button';
import { Card } from '@/app/components/ui/card';
import { Alert, AlertDescription } from '@/app/components/ui/alert';
import { Avatar, AvatarFallback, AvatarImage } from '@/app/components/ui/avatar';
import {
  Drawer,
  DrawerContent,
  DrawerTrigger,
} from '@/app/components/ui/drawer';
import { HistoryList } from '@/app/components/HistoryList';
import { exampleCategories, getExamplePrompt } from '@/app/services/examples';
import { storageService } from '@/app/services/storage';
import type { ImageData } from '@/app/types';
import { toast } from 'sonner';

export function HomePage() {
  const navigate = useNavigate();
  const [recentImages, setRecentImages] = useState<ImageData[]>([]);
  const [hasPermission, setHasPermission] = useState(true);

  useEffect(() => {
    setRecentImages(storageService.getRecentImages());
  }, []);

  const handleImageSelect = (image: ImageData) => {
    navigate('/upload', { state: { image } });
  };

  const handleCameraClick = () => {
    // In a real app, this would open the camera
    toast.info('相机功能需要在移动设备上使用');
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
      {/* Header */}
      <header className="border-b bg-white/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-xl font-semibold">选一张图开始生成</h1>
          <div className="flex gap-2">
            <Drawer direction="right">
              <DrawerTrigger asChild>
                <Button variant="ghost" size="sm">
                  <History className="size-4 mr-1" />
                  历史
                </Button>
              </DrawerTrigger>
              <DrawerContent className="h-full w-3/4 sm:max-w-sm p-6">
                <HistoryList />
              </DrawerContent>
            </Drawer>
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full"
              onClick={() => navigate('/settings')}
            >
              <Avatar className="size-8">
                <AvatarImage alt="个人中心" />
                <AvatarFallback className="bg-gray-100 text-gray-700">
                  <User className="size-4" />
                </AvatarFallback>
              </Avatar>
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-8">
        {/* Permission Alert */}
        {!hasPermission && (
          <Alert>
            <AlertCircle className="size-4" />
            <AlertDescription>
              需要相册访问权限才能选择图片。
              <Button variant="link" className="h-auto p-0 ml-2">
                去开启权限
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {/* Main Action Buttons */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Card
            className="p-8 hover:shadow-lg transition-shadow cursor-pointer border-2 border-blue-200 bg-gradient-to-br from-blue-50 to-white"
            onClick={() => navigate('/upload')}
          >
            <div className="flex flex-col items-center text-center space-y-4">
              <div className="size-16 rounded-full bg-blue-500 flex items-center justify-center">
                <ImagePlus className="size-8 text-white" />
              </div>
              <div>
                <h2 className="font-semibold mb-1">从相册选择</h2>
                <p className="text-sm text-gray-600">选择一张照片开始创作</p>
              </div>
            </div>
          </Card>

          <Card
            className="p-8 hover:shadow-lg transition-shadow cursor-pointer"
            onClick={handleCameraClick}
          >
            <div className="flex flex-col items-center text-center space-y-4">
              <div className="size-16 rounded-full bg-gray-200 flex items-center justify-center">
                <Camera className="size-8 text-gray-600" />
              </div>
              <div>
                <h2 className="font-semibold mb-1">拍照</h2>
                <p className="text-sm text-gray-600">拍摄新照片进行创作</p>
              </div>
            </div>
          </Card>
        </div>

        {/* Example Images */}
        <section>
          <h2 className="text-lg font-semibold mb-4">示例图片</h2>
          <div className="space-y-6">
            {exampleCategories.map((category) => (
              <div key={category.id}>
                <h3 className="text-sm font-medium text-gray-700 mb-3">
                  {category.name}
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
                  {category.images.map((image) => (
                    <Card
                      key={image.id}
                      className="aspect-square overflow-hidden cursor-pointer hover:ring-2 hover:ring-blue-500 transition-all"
                      onClick={() => {
                        navigate('/upload', {
                          state: {
                            prompt: getExamplePrompt(category.id, image.id)
                          }
                        });
                      }}
                    >
                      <img
                        src={image.url}
                        alt={`示例 ${category.name}`}
                        className="w-full h-full object-cover"
                      />
                    </Card>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Recent Images */}
        {recentImages.length > 0 && (
          <section>
            <h2 className="text-lg font-semibold mb-4">最近使用</h2>
            <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-3 overflow-hidden">
              <AnimatePresence>
                {recentImages.map((image) => (
                  <motion.div
                    key={image.id}
                    layout
                    initial={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, x: 100 }}
                    drag="x"
                    dragConstraints={{ left: 0, right: 100 }}
                    onDragEnd={(_, info) => {
                      if (info.offset.x > 50) {
                        const newImages = recentImages.filter(img => img.id !== image.id);
                        setRecentImages(newImages);
                        storageService.removeRecentImage(image.id);
                        toast.success('已隐藏');
                      }
                    }}
                    className="relative"
                  >
                    <Card
                      className="aspect-square overflow-hidden cursor-pointer hover:ring-2 hover:ring-blue-500 transition-all"
                      onClick={() => handleImageSelect(image)}
                    >
                      <img
                        src={image.url}
                        alt="最近使用"
                        className="w-full h-full object-cover"
                      />
                    </Card>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </section>
        )}

      </main>
    </div>
  );
}
