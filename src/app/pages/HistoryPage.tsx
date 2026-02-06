import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Trash2, ImageIcon } from 'lucide-react';
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
import { Dialog, DialogContent } from '@/app/components/ui/dialog';
import { storageService } from '@/app/services/storage';
import type { GenerationResult } from '@/app/types';
import { toast } from 'sonner';

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

export function HistoryPage() {
  const navigate = useNavigate();
  const [history, setHistory] = useState<GenerationResult[]>([]);
  const [showClearDialog, setShowClearDialog] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [previewItem, setPreviewItem] = useState<GenerationResult | null>(null);

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
    <div className="min-h-screen bg-gray-50">
      <header className="border-b bg-white sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => navigate('/')}
            >
              <ArrowLeft className="size-4 mr-1" />
              返回
            </Button>
            <h1 className="font-semibold">渲染记录</h1>
          </div>
          {sorted.length > 0 && (
            <Button variant="ghost" size="sm" onClick={() => setShowClearDialog(true)}>
              <Trash2 className="size-4 mr-1" />
              清空
            </Button>
          )}
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6">
        {sorted.length === 0 ? (
          <div className="text-center py-16 space-y-4">
            <ImageIcon className="size-16 text-gray-400 mx-auto" />
            <div>
              <p className="font-medium text-gray-900">暂无渲染记录</p>
              <p className="text-sm text-gray-600 mt-1">你的渲染记录将显示在这里（仅保存在本机）</p>
            </div>
            <Button onClick={() => navigate('/upload')}>开始生成</Button>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">共 {sorted.length} 条记录（仅保存在本机）</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {sorted.map((item) => {
                const previewUrl = getPreviewUrl(item);
                const isRendering = item.status === 'rendering';
                const isCompleted = item.status === 'completed' && Boolean(item.generatedUrl);
                const elapsed = getElapsed(item);

                return (
                  <Card
                    key={item.id}
                    className="overflow-hidden cursor-pointer hover:shadow-lg transition-shadow"
                    onClick={() => setPreviewItem(item)}
                  >
                    <div className="aspect-[4/3] bg-gray-100 relative">
                      {previewUrl ? (
                        <img src={previewUrl} alt="preview" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-500 text-sm">无预览</div>
                      )}

                      <div className="absolute top-2 left-2 flex items-center gap-2">
                        {isRendering && (
                          <span className="px-2 py-1 text-xs rounded bg-blue-600 text-white">渲染中</span>
                        )}
                        {item.status === 'failed' && (
                          <span className="px-2 py-1 text-xs rounded bg-red-600 text-white">失败</span>
                        )}
                        {isCompleted && (
                          <span className="px-2 py-1 text-xs rounded bg-green-600 text-white">已完成</span>
                        )}
                      </div>

                      {elapsed && (
                        <div className="absolute bottom-2 right-2">
                          <span className="px-2 py-1 text-xs rounded bg-black/60 text-white">{elapsed}</span>
                        </div>
                      )}
                    </div>

                    <div className="p-4 space-y-2">
                      <p className="text-sm font-medium line-clamp-2">{item.prompt || item.analysis?.summary || '渲染任务'}</p>
                      <div className="flex items-center justify-between text-xs text-gray-500">
                        <span>{formatDate(item.timestamp)}</span>
                        {item.taskId ? <span className="font-mono">task: {item.taskId.slice(0, 6)}…</span> : null}
                      </div>

                      {isCompleted && (
                        <div className="pt-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate('/result', { state: { result: item } });
                            }}
                          >
                            查看结果
                          </Button>
                        </div>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>
        )}
      </main>

      <Dialog open={Boolean(previewItem)} onOpenChange={(open) => (!open ? setPreviewItem(null) : null)}>
        <DialogContent className="top-0 left-0 translate-x-0 translate-y-0 w-screen h-screen max-w-none rounded-none p-0 border-0 bg-black">
          <div className="w-full h-full flex items-center justify-center">
            {previewItem ? (
              <img
                src={getPreviewUrl(previewItem)}
                alt="preview"
                className="max-w-full max-h-full object-contain"
              />
            ) : null}
          </div>
        </DialogContent>
      </Dialog>

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
