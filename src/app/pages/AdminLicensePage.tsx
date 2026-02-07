import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Copy, KeyRound, Search, ShieldCheck } from 'lucide-react';
import { Button } from '@/app/components/ui/button';
import { Card } from '@/app/components/ui/card';
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
import { Separator } from '@/app/components/ui/separator';
import { toast } from 'sonner';


const PASSCODE_STORAGE_KEY = 'ai-generator-admin-passcode';

type Tier = { label: string; amountCents: number; points: number };
const PRESET_TIERS: Tier[] = [
  { label: '9.9 元', amountCents: 990, points: 100 },
  { label: '29.9 元', amountCents: 2990, points: 300 },
  { label: '49.9 元', amountCents: 4990, points: 520 },
  { label: '99 元', amountCents: 9900, points: 1088 },
];

const CUSTOM_POINTS_PER_YUAN = 10;


function fmtTime(ms: number) {
  if (!Number.isFinite(ms) || ms <= 0) return '-';
  try {
    return new Date(ms).toLocaleString('zh-CN');
  } catch {
    return String(ms);
  }
}

function parseYuanToCents(raw: string, maxYuan: number): number | null {
  const s = raw.trim();
  if (!s) return null;
  if (!/^\d+(?:\.\d{0,2})?$/.test(s)) return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n > maxYuan) return null;
  return Math.round(n * 100);
}

function formatYuanFromCents(amountCents: number) {
  const yuan = amountCents / 100;
  return Number.isInteger(yuan) ? String(yuan) : yuan.toFixed(2).replace(/0$/, '').replace(/\.0$/, '');
}

export function AdminLicensePage() {
  const navigate = useNavigate();

  const [passcode, setPasscode] = useState(() => {
    try {
      return sessionStorage.getItem(PASSCODE_STORAGE_KEY) || '';
    } catch {
      return '';
    }
  });

  const [orderId, setOrderId] = useState('');
  const [tierMode, setTierMode] = useState<'preset' | 'custom'>('preset');
  const [selectedPresetCents, setSelectedPresetCents] = useState<number>(PRESET_TIERS[0].amountCents);
  const [customAmount, setCustomAmount] = useState('');
  const [expiresHours, setExpiresHours] = useState('24');
  const [note, setNote] = useState('xhs');

  const selectedTier = useMemo<Tier | null>(() => {
    if (tierMode === 'preset') {
      return PRESET_TIERS.find((t) => t.amountCents === selectedPresetCents) ?? PRESET_TIERS[0];
    }

    const amountCents = parseYuanToCents(customAmount, 5000);
    if (!amountCents || amountCents <= 0) return null;

    const points = Math.max(1, Math.round((amountCents / 100) * CUSTOM_POINTS_PER_YUAN));

    return {
      label: `${formatYuanFromCents(amountCents)} 元`,
      amountCents,
      points,
    };
  }, [tierMode, selectedPresetCents, customAmount]);

  const customTierError = useMemo(() => {
    if (tierMode !== 'custom') return null;
    const amountCents = parseYuanToCents(customAmount, 5000);
    if (!customAmount.trim()) return '请输入自定义金额（最高 5000 元）';
    if (!amountCents) return '金额格式不正确（最多 2 位小数，且 ≤ 5000）';
    return null;
  }, [tierMode, customAmount]);



  const [genLoading, setGenLoading] = useState(false);
  const [genResult, setGenResult] = useState<null | { code: string; payload: any }>(null);
  const [showGenerateConfirm, setShowGenerateConfirm] = useState(false);


  const [queryInput, setQueryInput] = useState('');
  const [queryLoading, setQueryLoading] = useState(false);
  const [queryResult, setQueryResult] = useState<any>(null);

  const passcodeReady = passcode.trim().length > 0;

  const effectiveExpiresHours = useMemo(() => {
    const n = Number(expiresHours);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 24;
  }, [expiresHours]);

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

  const savePasscode = () => {
    const trimmed = passcode.trim();
    if (!trimmed) {
      toast.error('请输入口令');
      return;
    }
    try {
      sessionStorage.setItem(PASSCODE_STORAGE_KEY, trimmed);
    } catch {
      // ignore
    }
    toast.success('口令已保存（仅本次会话）');
  };

  const clearPasscode = () => {
    try {
      sessionStorage.removeItem(PASSCODE_STORAGE_KEY);
    } catch {
      // ignore
    }
    setPasscode('');
    toast.success('口令已清除');
  };

  const openGenerateConfirm = () => {
    if (!passcodeReady) {
      toast.error('请先输入口令');
      return;
    }

    const id = orderId.trim();
    if (!id) {
      toast.error('请输入订单号');
      return;
    }

    if (!selectedTier) {
      toast.error('请先输入有效金额');
      return;
    }

    setShowGenerateConfirm(true);
  };

  const handleGenerate = async () => {
    setShowGenerateConfirm(false);

    if (!passcodeReady) {
      toast.error('请先输入口令');
      return;
    }

    const id = orderId.trim();
    if (!id) {
      toast.error('请输入订单号');
      return;
    }

    if (!selectedTier) {
      toast.error('请先完善自定义档位');
      return;
    }

    if (genLoading) return;
    setGenLoading(true);
    setGenResult(null);


    try {
      const resp = await fetch('/api/license/admin/generate', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-admin-passcode': passcode.trim(),
        },
        body: JSON.stringify({
          id,
          amountCents: selectedTier.amountCents,
          points: selectedTier.points,
          expiresHours: effectiveExpiresHours,
          note: note.trim() || undefined,
        }),

      });

      const data = (await resp.json().catch(() => null)) as any;
      if (!resp.ok || !data || typeof data !== 'object' || !data.ok) {
        const msg = typeof data?.message === 'string' ? data.message : resp.status === 401 ? '口令错误' : '生成失败';
        toast.error(msg);
        return;
      }

      const code = typeof data.code === 'string' ? data.code : '';
      if (!code) {
        toast.error('生成失败（返回数据不完整）');
        return;
      }

      setGenResult({ code, payload: data.payload });
      await copyText(code, '激活码已复制');
    } finally {
      setGenLoading(false);
    }
  };

  const handleQuery = async () => {
    if (!passcodeReady) {
      toast.error('请先输入口令');
      return;
    }

    const raw = queryInput.trim();
    if (!raw) {
      toast.error('请输入激活码或订单号');
      return;
    }

    if (queryLoading) return;
    setQueryLoading(true);
    setQueryResult(null);

    try {
      const isCode = raw.startsWith('AIG2.');
      const body = isCode ? { code: raw } : { id: raw };

      const resp = await fetch('/api/license/admin/status', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-admin-passcode': passcode.trim(),
        },
        body: JSON.stringify(body),
      });

      const data = (await resp.json().catch(() => null)) as any;
      if (!resp.ok || !data || typeof data !== 'object' || !data.ok) {
        const msg = typeof data?.message === 'string' ? data.message : resp.status === 401 ? '口令错误' : '查询失败';
        toast.error(msg);
        return;
      }

      setQueryResult(data);
      toast.success('查询成功');
    } finally {
      setQueryLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b bg-white sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center">
          <Button variant="ghost" size="sm" onClick={() => navigate('/')}
          >
            <ArrowLeft className="size-4 mr-1" />
            返回
          </Button>
          <h1 className="flex-1 text-center font-semibold">客服出码 / 核对</h1>
          <div className="w-20" />
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        <section>
          <h2 className="text-sm font-medium text-gray-700 mb-3">口令</h2>
          <Card className="p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium flex items-center gap-2">
                  <ShieldCheck className="size-4 text-gray-600" />
                  管理口令
                </p>
                <p className="text-xs text-gray-600 mt-0.5">口令仅保存在本次浏览器会话，不会写入代码仓库。</p>
              </div>
              {passcodeReady ? (
                <Button variant="ghost" size="sm" onClick={clearPasscode}>清除</Button>
              ) : null}
            </div>

            <div className="flex gap-3">
              <Input
                value={passcode}
                type="password"
                onChange={(e) => setPasscode(e.target.value.slice(0, 128))}
                placeholder="输入口令"
              />
              <Button onClick={savePasscode} disabled={!passcode.trim()}>保存</Button>
            </div>
          </Card>
        </section>

        <section>
          <h2 className="text-sm font-medium text-gray-700 mb-3">生成激活码（AIG2）</h2>
          <Card className="p-4 space-y-4">
            <div className="space-y-2">
              <div className="text-sm font-medium text-gray-700">订单号</div>
              <Input value={orderId} onChange={(e) => setOrderId(e.target.value.slice(0, 64))} placeholder="例如：xhs-20260207-0001" />
              <div className="text-xs text-gray-500">建议直接用小红书订单号，避免重复。</div>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium text-gray-700">购买档位</div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {PRESET_TIERS.map((t) => (
                  <Button
                    key={t.amountCents}
                    variant={tierMode === 'preset' && selectedPresetCents === t.amountCents ? 'default' : 'outline'}
                    onClick={() => {
                      setTierMode('preset');
                      setSelectedPresetCents(t.amountCents);
                    }}
                    className="justify-center"
                  >
                    {t.label}
                  </Button>
                ))}

                <Button
                  key="custom"
                  variant={tierMode === 'custom' ? 'default' : 'outline'}
                  onClick={() => setTierMode('custom')}
                  className="justify-center"
                >
                  自定义
                </Button>
              </div>

              {tierMode === 'custom' ? (
                <div className="mt-3 space-y-2">
                  <div className="space-y-1">
                    <div className="text-xs text-gray-600">自定义金额（元，≤5000）</div>
                    <Input
                      value={customAmount}
                      onChange={(e) => setCustomAmount(e.target.value.slice(0, 16))}
                      placeholder="例如：88.8"
                    />
                    <div className="text-xs text-gray-500">
                      自动计算：{selectedTier ? `${selectedTier.points} 积分` : '-'}（按 1 元 = {CUSTOM_POINTS_PER_YUAN} 积分）
                    </div>
                  </div>
                  {customTierError ? <div className="text-xs text-red-500">{customTierError}</div> : null}
                </div>
              ) : null}


              <div className="text-xs text-gray-600">
                当前：{selectedTier ? `${selectedTier.label} = ${selectedTier.points} 积分` : '请完善自定义档位'}
              </div>
            </div>


            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <div className="text-sm font-medium text-gray-700">有效期（小时）</div>
                <Input value={expiresHours} onChange={(e) => setExpiresHours(e.target.value.slice(0, 6))} placeholder="24" />
                <div className="text-xs text-gray-500">默认 24 小时；过期后无法兑换。</div>
              </div>
              <div className="space-y-2">
                <div className="text-sm font-medium text-gray-700">备注（可选）</div>
                <Input value={note} onChange={(e) => setNote(e.target.value.slice(0, 80))} placeholder="xhs" />
              </div>
            </div>

            <Button onClick={openGenerateConfirm} disabled={!passcodeReady || !orderId.trim() || genLoading || !selectedTier} className="w-full">
              <KeyRound className="size-4 mr-2" />
              {genLoading ? '生成中…' : '生成并复制激活码'}
            </Button>

            <AlertDialog open={showGenerateConfirm} onOpenChange={setShowGenerateConfirm}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>确认生成激活码？</AlertDialogTitle>
                  <AlertDialogDescription>
                    {selectedTier ? (
                      <div className="space-y-2">
                        <div className="text-sm">
                          本次充值 <span className="font-semibold">{formatYuanFromCents(selectedTier.amountCents)} 元</span>，获得{' '}
                          <span className="font-semibold">{selectedTier.points} 积分</span>。
                        </div>
                        <div className="text-sm font-medium text-red-600">
                          提醒：本次充值 {formatYuanFromCents(selectedTier.amountCents)} 元 = {selectedTier.points} 积分
                        </div>
                        <div className="text-sm font-medium text-blue-600">
                          提醒：本次充值 {formatYuanFromCents(selectedTier.amountCents)} 元 = {selectedTier.points} 积分
                        </div>
                        <div className="text-sm font-medium text-yellow-600">
                          提醒：本次充值 {formatYuanFromCents(selectedTier.amountCents)} 元 = {selectedTier.points} 积分
                        </div>
                      </div>
                    ) : (
                      '请先选择档位'
                    )}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>取消</AlertDialogCancel>
                  <AlertDialogAction onClick={handleGenerate}>确认并生成</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>



            {genResult ? (
              <>
                <Separator />
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium text-gray-700">激活码</div>
                    <Button variant="outline" size="sm" onClick={() => copyText(genResult.code, '激活码已复制')}>
                      <Copy className="size-4 mr-2" />
                      复制
                    </Button>
                  </div>
                  <div className="text-xs font-mono break-all rounded-md border bg-gray-50 p-2 text-gray-700">{genResult.code}</div>
                  <Alert>
                    <AlertDescription>
                      已按 {selectedTier.label} 生成 {selectedTier.points} 积分；有效期 {effectiveExpiresHours} 小时。
                    </AlertDescription>
                  </Alert>
                </div>
              </>
            ) : null}
          </Card>
        </section>

        <section>
          <h2 className="text-sm font-medium text-gray-700 mb-3">查询兑换状态</h2>
          <Card className="p-4 space-y-4">
            <div className="space-y-2">
              <div className="text-sm font-medium text-gray-700">输入激活码（AIG2…）或订单号</div>
              <div className="flex gap-3">
                <Input value={queryInput} onChange={(e) => setQueryInput(e.target.value.slice(0, 4096))} placeholder="粘贴 AIG2... 或输入订单号" />
                <Button onClick={handleQuery} disabled={!passcodeReady || !queryInput.trim() || queryLoading}>
                  <Search className="size-4 mr-2" />
                  {queryLoading ? '查询中…' : '查询'}
                </Button>
              </div>
              <div className="text-xs text-gray-500">用激活码查询可判断未用/过期；仅用订单号只能判断是否已兑换。</div>
            </div>

            {queryResult ? (
              <Alert>
                <AlertDescription>
                  <div className="space-y-1">
                    <div>状态：<span className="font-medium">{String(queryResult.status)}</span></div>
                    {queryResult.id ? <div>订单号：{String(queryResult.id)}</div> : null}
                    {Number.isFinite(Number(queryResult.points)) ? <div>积分：{Number(queryResult.points)}</div> : null}
                    {queryResult.amountCents !== undefined ? <div>金额分：{String(queryResult.amountCents)}</div> : null}
                    {queryResult.issuedAt ? <div>签发：{fmtTime(Number(queryResult.issuedAt))}</div> : null}
                    {queryResult.expiresAt ? <div>过期：{fmtTime(Number(queryResult.expiresAt))}</div> : null}
                    {queryResult.redeemedAt ? <div>兑换：{fmtTime(Number(queryResult.redeemedAt))}</div> : null}
                    {queryResult.redeemedAccountId ? <div>兑换账号：{String(queryResult.redeemedAccountId)}</div> : null}
                    {queryResult.message ? <div>说明：{String(queryResult.message)}</div> : null}
                  </div>
                </AlertDescription>
              </Alert>
            ) : null}
          </Card>
        </section>

        <section>
          <Card className="p-4 text-xs text-gray-600 space-y-2">
            <div className="font-medium">给客户的发码话术（建议复制）</div>
            <div className="whitespace-pre-wrap rounded-md border bg-gray-50 p-3 text-gray-700">
              {`我已为你生成一次性激活码（24小时内有效、只能用一次）。\n请打开 App → 设置与帮助 → 激活码：\n1）先绑定账号（手机号或微信号）\n2）粘贴激活码点击兑换（需要联网）`}
            </div>
          </Card>
        </section>
      </main>
    </div>
  );
}
