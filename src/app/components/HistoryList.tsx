import { useEffect, useMemo, useState } from 'react';
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

function formatDate(timestamp: number) {
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
    day: 'numeric',
  });
}

function formatDuration(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function getPreviewUrl(item: GenerationResult) {
  return item.generatedUrl || item.inputPreviews?.[0] || item.originalImage?.url || '';
}

export function HistoryList({ onViewResult }: HistoryListProps) {
  const navigate = useNavigate();
  const [history, setHistory] = useState<GenerationResult[]>([]);
  const [showClearDialog, setShowClearDialog] = useState(false);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    setHistory(storageService.getHistory());
    const t = setInterval(() => {
      setHistory(storageService.getHistory());
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(t);
  }, []);

  const sorted = useMemo(() => {
    return [...history].sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0));
  }, [history]);

  const handleViewResult = (result: GenerationResult) => {
    const isCompleted = result.status === 'completed' && Boolean(result.generatedUrl);
    if (!isCompleted) {
      navigate('/history');
      return;
    }

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

  const getElapsed = (item: GenerationResult) => {
    const startedAt = item.startedAt ?? item.timestamp;
    if (!startedAt) return '';
    if (item.endedAt) return formatDuration(item.endedAt - startedAt);
    if (item.status === 'rendering') return formatDuration(now - startedAt);
    if (item.elapsedMs) return formatDuration(item.elapsedMs);
    return '';
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">渲染记录</h2>
        {sorted.length > 0 && (
          <Button variant="ghost" size="sm" onClick={() => setShowClearDialog(true)}>
            <Trash2 className="size-4 mr-1" />
            清空
          </Button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        {sorted.length === 0 ? (
          <div className="text-center py-16 space-y-4">
            <ImageIcon className="size-16 text-gray-400 mx-auto" />
            <div>
              <p className="font-medium text-gray-900">暂无渲染记录</p>
              <p className="text-sm text-gray-600 mt-1">你的渲染记录将显示在这里</p>
            </div>
          </div>
        ) : (
          <div className="space-y-4 pb-4">
            <p className="text-sm text-gray-600">共 {sorted.length} 条记录（仅保存在本机）</p>
            <div className="grid grid-cols-1 gap-4 overflow-hidden">
              <AnimatePresence>
                {sorted.map((result) => {
                  const previewUrl = getPreviewUrl(result);
                  const elapsed = getElapsed(result);
                  const isRendering = result.status === 'rendering';
                  const isCompleted = result.status === 'completed' && Boolean(result.generatedUrl);

                  return (
                    <motion.div
                      key={result.id}
                      layout
                      initial={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 100 }}
                      drag="x"
                      dragConstraints={{ left: 0, right: 100 }}
                      onDragEnd={(_, info) => {
                        if (info.offset.x > 80) {
                          const newHistory = sorted.filter(item => item.id !== result.id);
                          setHistory(newHistory);
                          storageService.removeHistoryItem(result.id);
                          toast.success('已删除记录');
                        }
                      }}
                      className="relative"
                    >
                      <div className="absolute inset-0 bg-red-500 rounded-lg flex items-center px-4 justify-start text-white">
                        <Trash2 className="size-5" />
                        <span className="ml-2 text-sm font-medium">删除</span>
                      </div>

                      <Card
                        className="relative overflow-hidden cursor-pointer hover:shadow-md transition-shadow"
                        onClick={() => handleViewResult(result)}
                      >
                        <div className="flex">
                          <div className="w-24 h-24 shrink-0 bg-gray-100 relative">
                            {previewUrl ? (
                              <img src={previewUrl} alt="preview" className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-gray-500 text-xs">无预览</div>
                            )}
                            {isRendering && (
                              <span className="absolute top-1 left-1 px-1.5 py-0.5 text-[10px] rounded bg-blue-600 text-white">渲染中</span>
                            )}
                            {isCompleted && (
                              <span className="absolute top-1 left-1 px-1.5 py-0.5 text-[10px] rounded bg-green-600 text-white">完成</span>
                            )}
                            {result.status === 'failed' && (
                              <span className="absolute top-1 left-1 px-1.5 py-0.5 text-[10px] rounded bg-red-600 text-white">失败</span>
                            )}
                          </div>
                          <div className="p-3 flex-1 min-w-0 flex flex-col justify-between">
                            <p className="text-sm font-medium line-clamp-2">{result.prompt || result.analysis?.summary || '渲染任务'}</p>
                            <div className="flex items-center justify-between text-xs text-gray-500">
                              <span>{formatDate(result.timestamp)}</span>
                              <span>{elapsed}</span>
                            </div>
                          </div>
                        </div>
                      </Card>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          </div>
        )}
      </div>

      <AlertDialog open={showClearDialog} onOpenChange={setShowClearDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>清空历史记录？</AlertDialogTitle>
            <AlertDialogDescription>这将删除所有渲染记录，此操作无法撤销。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleClearHistory}>确认清空</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
