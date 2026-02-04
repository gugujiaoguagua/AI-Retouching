import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trash2, ImageIcon } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
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

interface HistoryListProps {
  onViewResult?: (result: GenerationResult) => void;
}

export function HistoryList({ onViewResult }: HistoryListProps) {
  const navigate = useNavigate();
  const [history, setHistory] = useState<GenerationResult[]>([]);
  const [showClearDialog, setShowClearDialog] = useState(false);

  useEffect(() => {
    setHistory(storageService.getHistory());
  }, []);

  const handleViewResult = (result: GenerationResult) => {
    if (onViewResult) {
      onViewResult(result);
    } else {
      navigate('/result', { state: { result } });
    }
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
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">生成历史</h2>
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

      <div className="flex-1 overflow-y-auto min-h-0">
        {history.length === 0 ? (
          <div className="text-center py-16 space-y-4">
            <ImageIcon className="size-16 text-gray-400 mx-auto" />
            <div>
              <p className="font-medium text-gray-900">暂无生成记录</p>
              <p className="text-sm text-gray-600 mt-1">
                你的生成历史将显示在这里
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4 pb-4">
            <p className="text-sm text-gray-600">
              共 {history.length} 条记录（仅保存在本机）
            </p>
            <div className="grid grid-cols-1 gap-4 overflow-hidden">
              <AnimatePresence>
                {history.map((result) => (
                  <motion.div
                    key={result.id}
                    layout
                    initial={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 100 }}
                    drag="x"
                    dragConstraints={{ left: 0, right: 100 }}
                    onDragEnd={(_, info) => {
                      if (info.offset.x > 80) {
                        const newHistory = history.filter(item => item.id !== result.id);
                        setHistory(newHistory);
                        storageService.removeHistoryItem(result.id);
                        toast.success('已删除记录');
                      }
                    }}
                    className="relative"
                  >
                    {/* Background Delete Action */}
                    <div className="absolute inset-0 bg-red-500 rounded-lg flex items-center px-4 justify-start text-white">
                      <Trash2 className="size-5" />
                      <span className="ml-2 text-sm font-medium">删除</span>
                    </div>

                    <Card
                      className="relative overflow-hidden cursor-pointer hover:shadow-md transition-shadow"
                      onClick={() => handleViewResult(result)}
                    >
                      <div className="flex">
                        <div className="w-24 h-24 shrink-0 bg-gray-100">
                          <img
                            src={result.generatedUrl}
                            alt="Generated"
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <div className="p-3 flex-1 min-w-0 flex flex-col justify-between">
                          <p className="text-sm font-medium line-clamp-2">
                            {result.prompt || result.analysis?.summary || '已生成图片'}
                          </p>
                          <div className="flex items-center justify-between text-xs text-gray-500">
                            <span>{formatDate(result.timestamp)}</span>
                          </div>
                        </div>
                      </div>
                    </Card>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>
        )}
      </div>

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
