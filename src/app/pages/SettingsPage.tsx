import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Shield,
  Trash2,
  HelpCircle,
  MessageSquare,
  ChevronRight,
  Database,
  Coins,
  CalendarCheck,
  List,
  CreditCard,
  Cat,
  Copy,
  KeyRound,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { Button } from '@/app/components/ui/button';
import { Card } from '@/app/components/ui/card';
import { Separator } from '@/app/components/ui/separator';
import { Input } from '@/app/components/ui/input';
import { Alert, AlertDescription } from '@/app/components/ui/alert';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/app/components/ui/dialog';
import { storageService } from '@/app/services/storage';
import { toast } from 'sonner';

export function SettingsPage() {
  const navigate = useNavigate();
  const [showClearDialog, setShowClearDialog] = useState(false);
  const [showPrivacyDialog, setShowPrivacyDialog] = useState(false);
  const [showHelpDialog, setShowHelpDialog] = useState(false);
  const [showPointsDialog, setShowPointsDialog] = useState(false);
  const [showRechargeDialog, setShowRechargeDialog] = useState(false);
  const [pointsBalance, setPointsBalance] = useState(() => storageService.getPointsBalance());
  const [pointsTransactions, setPointsTransactions] = useState(() => storageService.getPointsTransactions());

  const accountId = storageService.getCurrentAccountId();

  const [activationCode, setActivationCode] = useState('');
  const [redeemFeedback, setRedeemFeedback] = useState<null | { ok: boolean; message: string }>(null);
  const [redeemLoading, setRedeemLoading] = useState(false);



  const [showCatBurst, setShowCatBurst] = useState(false);
  const [catBurstKey, setCatBurstKey] = useState(0);
  const catBurstTimerRef = useRef<number | null>(null);
  const [catButtonPulse, setCatButtonPulse] = useState(false);
  const catButtonPulseTimerRef = useRef<number | null>(null);

  const handleClearCache = () => {
    storageService.clearAllData();
    setShowClearDialog(false);
    toast.success('缓存已清空');
  };

  const copyText = async (text: string, successMessage: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(successMessage);
    } catch {
      try {
        const el = document.createElement('textarea');
        el.value = text;
        el.style.position = 'fixed';
        el.style.left = '-9999px';
        document.body.appendChild(el);
        el.select();
        document.execCommand('copy');
        document.body.removeChild(el);
        toast.success(successMessage);
      } catch {
        toast.error('复制失败，请手动复制');
      }
    }
  };

  const handleCopyAccountId = async () => {
    await copyText(accountId, '账号ID已复制');
  };


  const handleRedeemActivationCode = async () => {
    if (redeemLoading) return;
    setRedeemLoading(true);
    try {
      const res = await storageService.redeemActivationCode(activationCode);
      setRedeemFeedback({ ok: res.ok, message: res.message });
      if (res.ok) {
        refreshPoints();
        setActivationCode('');
        toast.success(res.message);
      } else {
        toast.error(res.message);
      }
    } finally {
      setRedeemLoading(false);
    }
  };


  const refreshPoints = () => {
    const state = storageService.getPointsState();
    setPointsBalance(state.balance);
    setPointsTransactions(state.transactions);
  };

  const handleCheckIn = () => {
    const res = storageService.checkIn();
    refreshPoints();
    if (res.ok) {
      toast.success('签到成功 +3');
    } else {
      toast.info(res.reason === 'limit' ? '签到已达上限' : '今天已签到');
    }
  };

  const handleDecompress = () => {
    if (catBurstTimerRef.current) {
      window.clearTimeout(catBurstTimerRef.current);
      catBurstTimerRef.current = null;
    }
    if (catButtonPulseTimerRef.current) {
      window.clearTimeout(catButtonPulseTimerRef.current);
      catButtonPulseTimerRef.current = null;
    }

    setCatBurstKey((k) => k + 1);
    setShowCatBurst(true);
    setCatButtonPulse(true);

    catButtonPulseTimerRef.current = window.setTimeout(() => {
      setCatButtonPulse(false);
      catButtonPulseTimerRef.current = null;
    }, 240);

    catBurstTimerRef.current = window.setTimeout(() => {
      setShowCatBurst(false);
      catBurstTimerRef.current = null;
    }, 900);
  };

  const POINTS_PACKAGES = [
    { priceText: '9.9', points: 100 },
    { priceText: '29.9', points: 300 },
    { priceText: '49.9', points: 520 },
    { priceText: '99', points: 1088 },
  ] as const;

  const buildPurchaseMessage = (pkg: { priceText: string; points: number }) => {
    return `购买档位：${pkg.priceText} 元 = ${pkg.points} 积分`;
  };


  const handleCopyPurchaseMessage = async (pkg: { priceText: string; points: number }) => {
    await copyText(buildPurchaseMessage(pkg), '购买信息已复制');
  };

  const getCacheSize = () => {
    const history = storageService.getHistory();
    return {
      history: history.length,
    };
  };

  const cacheSize = getCacheSize();

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="border-b bg-white sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/')}
          >
            <ArrowLeft className="size-4 mr-1" />
            返回
          </Button>
          <h1 className="flex-1 text-center font-semibold">设置与帮助</h1>
          <div className="w-20" /> {/* Spacer */}
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Activation */}
        <section>
          <h2 className="text-sm font-medium text-gray-700 mb-3">激活码</h2>
          <Card className="p-4 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="font-medium flex items-center gap-2">
                  <KeyRound className="size-4 text-gray-600" />
                  账号ID（自动生成）
                </p>
                <p className="text-xs text-gray-600 mt-0.5">
                  当前版本不需要登录；兑换时系统会自动用本机账号ID核销，积分也会绑定到该ID。
                </p>
              </div>
              <div className="shrink-0 flex gap-2">
                <Button variant="outline" size="sm" onClick={handleCopyAccountId}>
                  <Copy className="size-4 mr-2" />
                  复制
                </Button>
              </div>
            </div>


            <div className="text-xs font-mono break-all rounded-md border bg-gray-50 p-2 text-gray-700">
              {accountId}
            </div>

            <div className="space-y-2">

              <div className="text-sm font-medium text-gray-700">输入激活码</div>
              <div className="flex gap-3">
                <Input
                  value={activationCode}
                  onChange={(e) => {
                    setRedeemFeedback(null);
                    setActivationCode(e.target.value.slice(0, 2048));
                  }}
                  placeholder="例如：AIG2.xxxxx.yyyyy"
                />
                <Button onClick={handleRedeemActivationCode} disabled={!activationCode.trim() || redeemLoading}>
                  {redeemLoading ? '兑换中…' : '兑换'}
                </Button>
              </div>
              {redeemFeedback && (
                <Alert variant={redeemFeedback.ok ? 'default' : 'destructive'}>
                  <AlertDescription>{redeemFeedback.message}</AlertDescription>
                </Alert>
              )}
              <div className="text-xs text-gray-500">
                兑换需要联网；成功后积分会绑定到当前账号。
              </div>

            </div>
          </Card>
        </section>

        {/* Points */}
        <section>
          <h2 className="text-sm font-medium text-gray-700 mb-3">积分</h2>
          <Card className="p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="size-10 rounded-full bg-amber-50 flex items-center justify-center">
                  <Coins className="size-5 text-amber-700" />
                </div>
                <div>
                  <p className="font-medium">我的积分</p>
                  <p className="text-xs text-gray-600 mt-0.5">当前余额</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-2xl font-semibold tabular-nums">{pointsBalance}</p>
                <p className="text-xs text-gray-500">points</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <motion.div
                className="relative"
                animate={catButtonPulse ? { scale: [1, 1.04, 1] } : { scale: 1 }}
                transition={{ duration: 0.24 }}
              >
                <Button variant="outline" className="w-full" onClick={handleDecompress}>
                  <Cat className="size-4 mr-2" />
                  解压一下
                </Button>
                <AnimatePresence>
                  {showCatBurst && (
                    <motion.div
                      key={catBurstKey}
                      className="absolute left-1/2 -translate-x-1/2 -top-3 pointer-events-none"
                      initial={{ opacity: 0, y: 0, scale: 0.8 }}
                      animate={{
                        opacity: [0, 1, 1, 0],
                        y: [0, -18, -28, -40],
                        scale: [0.8, 1.05, 1, 0.7],
                      }}
                      transition={{
                        duration: 0.9,
                        times: [0, 0.15, 0.55, 1],
                        ease: 'easeOut',
                      }}
                    >
                      <div className="size-10 rounded-full bg-white/90 border border-amber-200 shadow-sm flex items-center justify-center">
                        <Cat className="size-6 text-amber-700" />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>

              <Button variant="outline" onClick={handleCheckIn}>
                <CalendarCheck className="size-4 mr-2" />
                每日签到
              </Button>
            </div>

            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                setShowRechargeDialog(true);
              }}
            >
              <CreditCard className="size-4 mr-2" />
              购买积分
            </Button>

            <div className="text-xs text-gray-600">
              <span className="font-medium">计费规则：</span>
              生成按耗时计费，1 分钟 = 1 积分，不足 1 分钟按 1 积分。
              <span className="ml-1">购买档位：</span>
              9.9 元 = 100 积分，29.9 元 = 300 积分，49.9 元 = 520 积分，99 元 = 1088 积分。
              <span className="ml-1">购买后客服发放激活码，回到上方“激活码”兑换入账。</span>
            </div>

            <Button
              variant="ghost"
              className="w-full justify-between"
              onClick={() => {
                refreshPoints();
                setShowPointsDialog(true);
              }}
            >
              <span className="flex items-center">
                <List className="size-4 mr-2" />
                积分明细
              </span>
              <ChevronRight className="size-5 text-gray-400" />
            </Button>
          </Card>
        </section>

        {/* Privacy & Data */}
        <section>
          <h2 className="text-sm font-medium text-gray-700 mb-3">隐私与数据</h2>
          <Card className="divide-y">
            <button
              className="w-full px-4 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
              onClick={() => setShowPrivacyDialog(true)}
            >
              <div className="flex items-center gap-3">
                <Shield className="size-5 text-gray-600" />
                <div className="text-left">
                  <p className="font-medium">隐私说明</p>
                  <p className="text-xs text-gray-600 mt-0.5">
                    了解数据如何使用和存储
                  </p>
                </div>
              </div>
              <ChevronRight className="size-5 text-gray-400" />
            </button>

            <button
              className="w-full px-4 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
              onClick={() => setShowClearDialog(true)}
            >
              <div className="flex items-center gap-3">
                <Database className="size-5 text-gray-600" />
                <div className="text-left">
                  <p className="font-medium">清理缓存</p>
                  <p className="text-xs text-gray-600 mt-0.5">
                    {cacheSize.history} 条历史记录
                  </p>
                </div>
              </div>
              <Trash2 className="size-5 text-gray-400" />
            </button>
          </Card>
        </section>

        {/* Help & Support */}
        <section>
          <h2 className="text-sm font-medium text-gray-700 mb-3">帮助与支持</h2>
          <Card className="divide-y">
            <button
              className="w-full px-4 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
              onClick={() => setShowHelpDialog(true)}
            >
              <div className="flex items-center gap-3">
                <HelpCircle className="size-5 text-gray-600" />
                <div className="text-left">
                  <p className="font-medium">常见问题</p>
                  <p className="text-xs text-gray-600 mt-0.5">
                    查看使用帮助和解答
                  </p>
                </div>
              </div>
              <ChevronRight className="size-5 text-gray-400" />
            </button>

            <button
              className="w-full px-4 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
              onClick={() => toast.info('反馈功能即将上线')}
            >
              <div className="flex items-center gap-3">
                <MessageSquare className="size-5 text-gray-600" />
                <div className="text-left">
                  <p className="font-medium">意见反馈</p>
                  <p className="text-xs text-gray-600 mt-0.5">
                    告诉我们你的想法
                  </p>
                </div>
              </div>
              <ChevronRight className="size-5 text-gray-400" />
            </button>
          </Card>
        </section>

        {/* About */}
        <section>
          <Card className="p-4 text-center space-y-2">
            <p className="text-sm text-gray-600">AI 图片生成器</p>
            <p className="text-xs text-gray-500">版本 1.0.0</p>
            <Separator className="my-2" />
            <p className="text-xs text-gray-500">
              使用先进的 AI 技术，基于你的图片智能生成新作品
            </p>
          </Card>
        </section>
      </main>

      {/* Clear Cache Dialog */}
      <AlertDialog open={showClearDialog} onOpenChange={setShowClearDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>清空所有缓存？</AlertDialogTitle>
            <AlertDialogDescription>
              这将删除：
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li>{cacheSize.history} 条生成历史记录</li>
              </ul>
              <p className="mt-2">此操作无法撤销。</p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleClearCache}>
              确认清空
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Privacy Dialog */}
      <Dialog open={showPrivacyDialog} onOpenChange={setShowPrivacyDialog}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>隐私说明</DialogTitle>
            <DialogDescription>
              我们重视你的隐私和数据安全
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 text-sm">
            <section>
              <h3 className="font-semibold mb-2">数据存储</h3>
              <ul className="space-y-1 text-gray-600">
                <li>• 生成历史仅保存在本机</li>
                <li>• 不会上传到任何服务器（除非进行生成）</li>
                <li>• 你可以随时清空缓存</li>
              </ul>
            </section>

            <section>
              <h3 className="font-semibold mb-2">生成过程</h3>
              <ul className="space-y-1 text-gray-600">
                <li>• 生成时图片会临时上传到云端处理</li>
                <li>• 处理完成后自动删除，不会永久存储</li>
                <li>• 传输过程使用加密保护</li>
              </ul>
            </section>

            <section>
              <h3 className="font-semibold mb-2">数据使用</h3>
              <ul className="space-y-1 text-gray-600">
                <li>• 仅用于 AI 模型理解和生成</li>
                <li>• 不会用于其他任何目的</li>
                <li>• 不会与第三方分享</li>
              </ul>
            </section>

            <section>
              <h3 className="font-semibold mb-2">注意事项</h3>
              <ul className="space-y-1 text-gray-600">
                <li>• 请勿上传包含个人隐私信息的图片</li>
                <li>• 请勿上传受版权保护的内容</li>
                <li>• 请遵守社区规范和使用条款</li>
              </ul>
            </section>
          </div>
        </DialogContent>
      </Dialog>

      {/* Help Dialog */}
      <Dialog open={showHelpDialog} onOpenChange={setShowHelpDialog}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>常见问题</DialogTitle>
            <DialogDescription>
              快速解答常见疑问
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 text-sm">
            <section>
              <h3 className="font-semibold mb-2">如何开始？</h3>
              <p className="text-gray-600">
                在首页选择一张图片进入“上传并生成”，上传图片后输入文字描述，点击生成即可开始。
              </p>
            </section>

            <section>
              <h3 className="font-semibold mb-2">生成需要多久？</h3>
              <p className="text-gray-600">
                通常需要 10-30 秒。生成过程中可以选择后台等待，也可以随时取消。
              </p>
            </section>

            <section>
              <h3 className="font-semibold mb-2">如果识别不准确？</h3>
              <p className="text-gray-600">
                当前版本以你输入的文字描述为准，建议把风格、主体、背景、清晰度等需求写清楚。
              </p>
            </section>

            <section>
              <h3 className="font-semibold mb-2">支持哪些图片格式？</h3>
              <p className="text-gray-600">
                支持 JPG、PNG、WebP 等常见格式，图片大小不超过 10MB。
              </p>
            </section>

            <section>
              <h3 className="font-semibold mb-2">生成失败怎么办？</h3>
              <p className="text-gray-600">
                生成失败不会产生任何费用，可以直接重试。如果多次失败，建议检查网络或换一张图片。
              </p>
            </section>

            <section>
              <h3 className="font-semibold mb-2">历史记录保存多久？</h3>
              <p className="text-gray-600">
                历史记录仅保存在本机，最多保存 20 条。可以在设置中清空所有记录。
              </p>
            </section>

            <section>
              <h3 className="font-semibold mb-2">积分是什么？</h3>
              <p className="text-gray-600">
                积分用于兑换功能或参与活动（当前为本地演示版，仅保存在本机）。兑换比例为 1 元 = 10 积分；生成按耗时计费，1 分钟 = 1 积分，不足 1 分钟按 1 积分。充值档位：9.9 元 = 100 积分，29.9 元 = 300 积分，49.9 元 = 520 积分，99.8 元 = 1088 积分；自定义金额按 1 元 = 10 积分换算。你可以在“设置与帮助”的积分模块每日签到，并查看明细与充值。
              </p>
            </section>
          </div>
        </DialogContent>
      </Dialog>

      {/* Points Dialog */}
      <Dialog open={showPointsDialog} onOpenChange={setShowPointsDialog}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>积分明细</DialogTitle>
            <DialogDescription>
              仅保存在本机
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            {pointsTransactions.length === 0 ? (
              <p className="text-gray-600">暂无记录</p>
            ) : (
              <div className="divide-y">
                {pointsTransactions.map((tx) => (
                  <div key={tx.id} className="py-3 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="font-medium truncate">{tx.reason}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {new Date(tx.timestamp).toLocaleString('zh-CN')}
                      </p>
                    </div>
                    <div className={`shrink-0 font-semibold tabular-nums ${tx.amount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {tx.amount >= 0 ? `+${tx.amount}` : `${tx.amount}`}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showRechargeDialog} onOpenChange={setShowRechargeDialog}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>购买积分</DialogTitle>
            <DialogDescription>
              选择档位后复制购买信息发给客服，付款后客服返回激活码，你再到“激活码”兑换入账。
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 text-sm">
            <div className="text-xs text-gray-600">
              下单付款后客服会发放激活码，你回到上方“激活码”直接兑换即可（无需提供设备ID）。
            </div>


            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {POINTS_PACKAGES.map((pkg) => (
                <Card key={pkg.priceText} className="p-3">
                  <div className="space-y-2">
                    <div className="font-semibold">{pkg.priceText} 元</div>
                    <div className="text-xs text-gray-500">{pkg.points} 积分</div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={() => handleCopyPurchaseMessage(pkg)}
                    >
                      复制购买信息
                    </Button>
                  </div>
                </Card>
              ))}
            </div>

            <div className="text-xs text-gray-500">
              提示：本页面不再“点一下就直接加积分”。积分只会在你兑换激活码后入账。
            </div>

            <div className="flex justify-end">
              <Button variant="outline" onClick={() => setShowRechargeDialog(false)}>
                我已获得激活码
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}
