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
  Gift,
  CalendarCheck,
  List,
  CreditCard,
  QrCode,
  Phone,
  LogOut,
  Cat
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { Button } from '@/app/components/ui/button';
import { Card } from '@/app/components/ui/card';
import { Separator } from '@/app/components/ui/separator';
import { Input } from '@/app/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/app/components/ui/avatar';
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
  const [customRechargeAmount, setCustomRechargeAmount] = useState('');
  const [auth, setAuth] = useState(() => storageService.getAuthState());
  const [showWeChatLoginDialog, setShowWeChatLoginDialog] = useState(false);
  const [showPhoneLoginDialog, setShowPhoneLoginDialog] = useState(false);
  const [wechatId, setWechatId] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [showCatBurst, setShowCatBurst] = useState(false);
  const [catBurstKey, setCatBurstKey] = useState(0);
  const catBurstTimerRef = useRef<number | null>(null);
  const [catButtonPulse, setCatButtonPulse] = useState(false);
  const catButtonPulseTimerRef = useRef<number | null>(null);
  const [pointsBalance, setPointsBalance] = useState(() => storageService.getPointsBalance());
  const [pointsTransactions, setPointsTransactions] = useState(() => storageService.getPointsTransactions());
  const [starterClaimed, setStarterClaimed] = useState(() => Boolean(storageService.getPointsState().starterClaimed));

  const handleClearCache = () => {
    storageService.clearAllData();
    setShowClearDialog(false);
    toast.success('缓存已清空');
  };

  const refreshPoints = () => {
    const state = storageService.getPointsState();
    setPointsBalance(state.balance);
    setPointsTransactions(state.transactions);
    setStarterClaimed(Boolean(state.starterClaimed));
  };

  const handleClaimStarterPack = () => {
    if (!auth) {
      toast.info('请先登录后领取新手礼包');
      return;
    }
    const res = storageService.claimStarterPack();
    refreshPoints();
    if (res.ok) {
      toast.success('已领取新手礼包 +5');
    } else {
      toast.info('新手礼包已领取过');
    }
  };

  const handleCheckIn = () => {
    const res = storageService.checkIn();
    refreshPoints();
    if (res.ok) {
      toast.success('签到成功 +3');
    } else {
      toast.info('今天已签到');
    }
  };

  const getRechargeBonus = (amountYuan: number) => {
    if (amountYuan === 10) return 10;
    if (amountYuan === 50) return 50;
    if (amountYuan === 100) return 100;
    return 0;
  };

  const formatYuan = (amountYuan: number) => {
    return Number.isInteger(amountYuan) ? `${amountYuan}` : amountYuan.toFixed(2);
  };

  const recharge = (amountYuan: number, allowBonus: boolean) => {
    if (!auth) {
      toast.info('请先登录后充值');
      return;
    }
    const minAmount = allowBonus ? 0.98 : 1;
    if (!Number.isFinite(amountYuan) || amountYuan < minAmount) {
      toast.error(`充值金额最低 ${formatYuan(minAmount)} 元`);
      return;
    }
    const basePoints = amountYuan === 0.98 ? 10 : amountYuan * 10;
    const bonusPoints = allowBonus ? getRechargeBonus(amountYuan) : 0;
    const totalPoints = basePoints + bonusPoints;
    const amountText = formatYuan(amountYuan);
    const reason = bonusPoints > 0 ? `充值 ${amountText} 元（赠送 ${bonusPoints} 积分）` : `充值 ${amountText} 元`;
    storageService.addPoints(totalPoints, reason);
    refreshPoints();
    toast.success(`充值成功 +${totalPoints} 积分`);
    setShowRechargeDialog(false);
    setCustomRechargeAmount('');
  };

  const handleCustomRecharge = () => {
    const amount = Number.parseInt(customRechargeAmount.trim(), 10);
    if (!Number.isFinite(amount)) {
      toast.error('请输入有效的金额');
      return;
    }
    recharge(amount, false);
  };

  const maskPhone = (value?: string) => {
    if (!value) return '';
    const digits = value.replace(/[^\d]/g, '');
    if (digits.length !== 11) return value;
    return `${digits.slice(0, 3)}****${digits.slice(7)}`;
  };

  const handleLogout = () => {
    storageService.logout();
    setAuth(null);
    refreshPoints();
    toast.success('已退出登录');
  };

  const handleWeChatLogin = () => {
    const trimmed = wechatId.trim();
    if (!trimmed) {
      toast.error('请输入微信号');
      return;
    }
    const next = storageService.loginWithWeChat(trimmed);
    setAuth(next);
    setShowWeChatLoginDialog(false);
    setWechatId('');
    refreshPoints();
    toast.success('微信登录成功');
  };

  const handlePhoneLogin = () => {
    const digits = phoneNumber.replace(/[^\d]/g, '').slice(0, 11);
    if (digits.length !== 11) {
      toast.error('请输入 11 位手机号');
      return;
    }
    const next = storageService.loginWithPhone(digits);
    setAuth(next);
    setShowPhoneLoginDialog(false);
    setPhoneNumber('');
    refreshPoints();
    toast.success('手机号登录成功');
  };

  const handleCatBurst = () => {
    if (catBurstTimerRef.current) {
      window.clearTimeout(catBurstTimerRef.current);
    }
    if (catButtonPulseTimerRef.current) {
      window.clearTimeout(catButtonPulseTimerRef.current);
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
    }, 1000);
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
        {/* Account */}
        <section>
          <h2 className="text-sm font-medium text-gray-700 mb-3">账号</h2>
          <Card className="p-4 space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <Avatar className="size-10">
                  <AvatarImage alt="账号" />
                  <AvatarFallback className="bg-gray-100 text-gray-700">
                    {auth?.provider === 'wechat' ? (
                      <QrCode className="size-4" />
                    ) : auth?.provider === 'phone' ? (
                      <Phone className="size-4" />
                    ) : (
                      <Cat className="size-4" />
                    )}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="font-medium truncate">
                    {auth
                      ? auth.provider === 'wechat'
                        ? auth.nickname || '微信用户'
                        : maskPhone(auth.phone) || '手机号用户'
                      : '未登录'}
                  </p>
                  <p className="text-xs text-gray-600 mt-0.5 truncate">
                    {auth ? (auth.provider === 'wechat' ? '微信登录' : '手机号登录') : '登录后新手礼包按账号限制领取一次'}
                  </p>
                </div>
              </div>

              {auth ? (
                <Button variant="outline" size="sm" onClick={handleLogout}>
                  <LogOut className="size-4 mr-2" />
                  退出
                </Button>
              ) : null}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Button
                variant="outline"
                onClick={() => {
                  setWechatId(auth?.provider === 'wechat' ? auth.nickname || '' : '');
                  setShowWeChatLoginDialog(true);
                }}
              >
                <QrCode className="size-4 mr-2" />
                微信登录
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setPhoneNumber(auth?.provider === 'phone' ? auth.phone || '' : '');
                  setShowPhoneLoginDialog(true);
                }}
              >
                <Phone className="size-4 mr-2" />
                手机号登录
              </Button>
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
              {starterClaimed ? (
                <motion.div
                  className="relative"
                  animate={catButtonPulse ? { scale: [1, 1.04, 1] } : { scale: 1 }}
                  transition={{ duration: 0.24 }}
                >
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={handleCatBurst}
                  >
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
                          y: [0, -18, -28, -42],
                          scale: [0.8, 1.05, 1, 0.7],
                        }}
                        transition={{
                          duration: 0.9,
                          times: [0, 0.15, 0.5, 1],
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
              ) : (
                <Button variant="outline" onClick={handleClaimStarterPack}>
                  <Gift className="size-4 mr-2" />
                  新手礼包
                </Button>
              )}
              <Button variant="outline" onClick={handleCheckIn}>
                <CalendarCheck className="size-4 mr-2" />
                每日签到
              </Button>
            </div>

            <Button
              variant="outline"
              className="w-full"
              disabled={!auth}
              onClick={() => {
                if (!auth) {
                  toast.info('请先登录后充值');
                  return;
                }
                setCustomRechargeAmount('');
                setShowRechargeDialog(true);
              }}
            >
              <CreditCard className="size-4 mr-2" />
              充值积分
            </Button>
            {!auth && (
              <div className="text-xs text-gray-500">登录后可充值积分</div>
            )}

            <div className="text-xs text-gray-600">
              <span className="font-medium">计费规则：</span>
              1 元 = 10 积分；生成按耗时计费，1 分钟 = 1 积分，不足 1 分钟按 1 积分。
              <span className="ml-1">充值赠送：</span>
              10 元多送 10 积分，50 元多送 50 积分，100 元多送 100 积分；自定义金额最低 1 元且不参与赠送。
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
                积分用于兑换功能或参与活动（当前为本地演示版，仅保存在本机）。兑换比例为 1 元 = 10 积分；生成按耗时计费，1 分钟 = 1 积分，不足 1 分钟按 1 积分。充值赠送：10 元多送 10 积分，50 元多送 50 积分，100 元多送 100 积分；自定义金额最低 1 元且不参与赠送。你可以在“设置与帮助”的积分模块领取新手礼包、每日签到，并查看明细与充值。
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
            <DialogTitle>充值积分</DialogTitle>
            <DialogDescription>
              1 元 = 10 积分；指定档位有赠送，自定义金额不参与赠送
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 text-sm">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Button variant="outline" className="h-auto py-3 flex-col" onClick={() => recharge(0.98, true)}>
                <span className="font-semibold">0.98 元</span>
                <span className="text-xs text-gray-500 mt-1">+10 积分</span>
              </Button>
              <Button variant="outline" className="h-auto py-3 flex-col" onClick={() => recharge(10, true)}>
                <span className="font-semibold">10 元</span>
                <span className="text-xs text-gray-500 mt-1">+110 积分</span>
              </Button>
              <Button variant="outline" className="h-auto py-3 flex-col" onClick={() => recharge(50, true)}>
                <span className="font-semibold">50 元</span>
                <span className="text-xs text-gray-500 mt-1">+550 积分</span>
              </Button>
              <Button variant="outline" className="h-auto py-3 flex-col" onClick={() => recharge(100, true)}>
                <span className="font-semibold">100 元</span>
                <span className="text-xs text-gray-500 mt-1">+1100 积分</span>
              </Button>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium text-gray-700">自定义金额</div>
              <div className="flex gap-3">
                <Input
                  inputMode="numeric"
                  value={customRechargeAmount}
                  onChange={(e) => setCustomRechargeAmount(e.target.value.replace(/[^\d]/g, '').slice(0, 6))}
                  placeholder="最低 1 元"
                />
                <Button onClick={handleCustomRecharge} disabled={!customRechargeAmount.trim()}>
                  充值
                </Button>
              </div>
              <div className="text-xs text-gray-500">
                自定义金额：按 1 元 = 10 积分换算，不参与 10/50/100 档位赠送。
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showWeChatLoginDialog} onOpenChange={setShowWeChatLoginDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>微信登录</DialogTitle>
            <DialogDescription>
              本地演示：使用微信号作为账号标识
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              value={wechatId}
              onChange={(e) => setWechatId(e.target.value.slice(0, 32))}
              placeholder="请输入微信号"
            />
            <Button className="w-full" onClick={handleWeChatLogin}>
              登录
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showPhoneLoginDialog} onOpenChange={setShowPhoneLoginDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>手机号登录</DialogTitle>
            <DialogDescription>
              本地演示：仅校验手机号格式，不发送短信
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              inputMode="numeric"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value.replace(/[^\d]/g, '').slice(0, 11))}
              placeholder="请输入 11 位手机号"
            />
            <Button className="w-full" onClick={handlePhoneLogin}>
              登录
            </Button>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}
