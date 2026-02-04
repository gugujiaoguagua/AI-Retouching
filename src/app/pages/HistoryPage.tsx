import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Download, Trash2, ImageIcon } from 'lucide-react';
import { Button } from '@/app/components/ui/button';
import { Card } from '@/app/components/ui/card';
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
import { storageService } from '@/app/services/storage';
import type { GenerationResult } from '@/app/types';
import { toast } from 'sonner';

export function HistoryPage() {
  const navigate = useNavigate();
  const [history, setHistory] = useState<GenerationResult[]>([]);
  const [showClearDialog, setShowClearDialog] = useState(false);

  useEffect(() => {
    setHistory(storageService.getHistory());
  }, []);

  const handleViewResult = (result: GenerationResult) => {
    navigate('/result', { state: { result } });
  };

  const handleClearHistory = () => {
    storageService.clearHistory();
    setHistory([]);
    setShowClearDialog(false);
    toast.success('历史记录已清空');
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return '刚刚';
    if (minutes < 60) return `${minutes} 分钟前`;
    if (hours < 24) return `${hours} 小时前`;
    if (days < 7) return `${days} 天前`;
    
    return date.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="border-b bg-white sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/')}
            >
              <ArrowLeft className="size-4 mr-1" />
              返回
            </Button>
            <h1 className="font-semibold">生成历史</h1>
          </div>
          {history.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowClearDialog(true)}
            >
              <Trash2 className="size-4 mr-1" />
              清空
            </Button>
          )}
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6">
        {history.length === 0 ? (
          <div className="text-center py-16 space-y-4">
            <ImageIcon className="size-16 text-gray-400 mx-auto" />
            <div>
              <p className="font-medium text-gray-900">暂无生成记录</p>
              <p className="text-sm text-gray-600 mt-1">
                你的生成历史将显示在这里
              </p>
            </div>
            <Button onClick={() => navigate('/')}>
              开始生成
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              共 {history.length} 条记录（仅保存在本机）
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {history.map((result) => (
                <Card
                  key={result.id}
                  className="overflow-hidden cursor-pointer hover:shadow-lg transition-shadow"
                  onClick={() => handleViewResult(result)}
                >
                  <div className="aspect-[4/3] bg-gray-100">
                    <img
                      src={result.generatedUrl}
                      alt="Generated"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="p-4 space-y-2">
                    <p className="text-sm font-medium line-clamp-2">
                      {result.prompt || result.analysis?.summary || '已生成图片'}
                    </p>
                    <div className="flex items-center justify-between text-xs text-gray-500">
                      <span>{formatDate(result.timestamp)}</span>
                      {result.analysis && (
                        <div className="flex gap-1">
                          {result.analysis.tags.slice(0, 2).map((tag) => (
                            <span
                              key={tag}
                              className="px-2 py-0.5 bg-gray-100 rounded"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Clear Confirmation Dialog */}
      <AlertDialog open={showClearDialog} onOpenChange={setShowClearDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>清空历史记录？</AlertDialogTitle>
            <AlertDialogDescription>
              这将删除所有生成历史记录，此操作无法撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleClearHistory}>
              确认清空
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
