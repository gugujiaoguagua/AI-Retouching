import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Copy, KeyRound, Search, ShieldCheck } from 'lucide-react';
import { Button } from '@/app/components/ui/button';
import { Card } from '@/app/components/ui/card';
import { Input } from '@/app/components/ui/input';
import { Alert, AlertDescription } from '@/app/components/ui/alert';
import { Separator } from '@/app/components/ui/separator';
import { toast } from 'sonner';

const PASSCODE_STORAGE_KEY = 'ai-generator-admin-passcode';

type Tier = { label: string; amountCents: number; points: number };
const TIERS: Tier[] = [
  { label: '0.98 元', amountCents: 98, points: 10 },
  { label: '9.9 元', amountCents: 990, points: 100 },
  { label: '29.9 元', amountCents: 2990, points: 300 },
  { label: '49.9 元', amountCents: 4990, points: 520 },
  { label: '99 元', amountCents: 9900, points: 1088 },
];

function fmtTime(ms: number) {
  if (!Number.isFinite(ms) || ms <= 0) return '-';
  try {
    return new Date(ms).toLocaleString('zh-CN');
  } catch {
    return String(ms);
  }
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
  const [selectedTier, setSelectedTier] = useState<Tier>(TIERS[1]);
  const [expiresHours, setExpiresHours] = useState('24');
  const [note, setNote] = useState('xhs');

  const [genLoading, setGenLoading] = useState(false);
  const [genResult, setGenResult] = useState<null | { code: string; payload: any }>(null);

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

  const handleGenerate = async () => {
    if (!passcodeReady) {
      toast.error('请先输入口令');
      return;
    }

    const id = orderId.trim();
    if (!id) {
      toast.error('请输入订单号');
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
                {TIERS.map((t) => (
                  <Button
                    key={t.amountCents}
                    variant={selectedTier.amountCents === t.amountCents ? 'default' : 'outline'}
                    onClick={() => setSelectedTier(t)}
                    className="justify-center"
                  >
                    {t.label}\n
                  </Button>
                ))}
              </div>
              <div className="text-xs text-gray-600">当前：{selectedTier.label} = {selectedTier.points} 积分</div>
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

            <Button onClick={handleGenerate} disabled={!passcodeReady || !orderId.trim() || genLoading}>
              <KeyRound className="size-4 mr-2" />
              {genLoading ? '生成中…' : '生成并复制激活码'}
            </Button>

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
