import nacl from 'tweetnacl';
import type { GenerationResult } from '@/app/types';

const DEVICE_ID_KEY = 'ai-generator-device-id';
const ACTIVATION_STATE_KEY = 'ai-generator-activation-state';
const ACTIVATION_CODE_PREFIX = 'AIG1';

// 可公开：用于校验激活码签名（私钥请勿写入仓库）
const DEFAULT_LICENSE_PUBLIC_KEY_B64 = 'GBof7kPD0uTUqW163R7I5mqKT36rPOYRVbKfSCaUVrc';

const HISTORY_KEY = 'ai-generator-history';
const POINTS_STATE_KEY = 'ai-generator-points-state';
const AUTH_KEY = 'ai-generator-auth';
const MAX_HISTORY = 20;
const MAX_POINTS_TRANSACTIONS = 50;

type ActivationPayloadV1 = {
  v: 1;
  id: string;
  deviceId: string;
  points: number;
  issuedAt: number;
  expiresAt?: number;
  note?: string;
};

type ActivationStateV1 = {
  version: 1;
  redeemed: Record<string, { payload: ActivationPayloadV1; redeemedAt: number }>;
};

function getOrCreateDeviceId(): string {
  try {
    const existing = localStorage.getItem(DEVICE_ID_KEY);
    if (existing && typeof existing === 'string' && existing.length >= 8) return existing;
    const created = (globalThis.crypto?.randomUUID?.() ?? `dev-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    localStorage.setItem(DEVICE_ID_KEY, created);
    return created;
  } catch {
    return `dev-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}

function base64UrlToBytes(input: string): Uint8Array {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - (normalized.length % 4)) % 4;
  const padded = normalized + '='.repeat(padLen);
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function tryParseActivationPayload(raw: unknown): ActivationPayloadV1 | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as any;
  if (r.v !== 1) return null;
  if (typeof r.id !== 'string' || !r.id) return null;
  if (typeof r.deviceId !== 'string' || !r.deviceId) return null;
  if (!Number.isFinite(r.points) || r.points <= 0) return null;
  if (!Number.isFinite(r.issuedAt) || r.issuedAt <= 0) return null;
  if (r.expiresAt !== undefined && (!Number.isFinite(r.expiresAt) || r.expiresAt <= 0)) return null;
  if (r.note !== undefined && typeof r.note !== 'string') return null;
  return {
    v: 1,
    id: r.id,
    deviceId: r.deviceId,
    points: r.points,
    issuedAt: r.issuedAt,
    expiresAt: r.expiresAt,
    note: r.note,
  };
}

function getActivationPublicKey(): Uint8Array | null {
  try {
    const b64 = (import.meta as any).env?.VITE_LICENSE_PUBLIC_KEY || DEFAULT_LICENSE_PUBLIC_KEY_B64;
    if (typeof b64 !== 'string' || !b64.trim()) return null;
    return base64UrlToBytes(b64.trim());
  } catch {
    return null;
  }
}

function getActivationState(): ActivationStateV1 {
  try {
    const raw = localStorage.getItem(ACTIVATION_STATE_KEY);
    if (!raw) return { version: 1, redeemed: {} };
    const parsed = JSON.parse(raw) as any;
    if (parsed && parsed.version === 1 && parsed.redeemed && typeof parsed.redeemed === 'object') {
      return parsed as ActivationStateV1;
    }
    return { version: 1, redeemed: {} };
  } catch {
    return { version: 1, redeemed: {} };
  }
}

function setActivationState(next: ActivationStateV1): void {
  try {
    localStorage.setItem(ACTIVATION_STATE_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}

type RedeemResult =
  | { ok: true; payload: ActivationPayloadV1; redeemedAt: number }
  | { ok: false; message: string };

function redeemActivationCode(rawCode: string, deviceId: string): RedeemResult {
  const code = rawCode.trim();
  if (!code) return { ok: false, message: '请输入激活码' };

  const parts = code.split('.');
  if (parts.length !== 3 || parts[0] !== ACTIVATION_CODE_PREFIX) {
    return { ok: false, message: '激活码格式不正确' };
  }

  const publicKey = getActivationPublicKey();
  if (!publicKey) return { ok: false, message: '未配置激活码公钥' };

  let payloadBytes: Uint8Array;
  let sigBytes: Uint8Array;
  try {
    payloadBytes = base64UrlToBytes(parts[1]);
    sigBytes = base64UrlToBytes(parts[2]);
  } catch {
    return { ok: false, message: '激活码解析失败' };
  }

  const verified = nacl.sign.detached.verify(payloadBytes, sigBytes, publicKey);
  if (!verified) return { ok: false, message: '激活码无效（签名校验失败）' };

  let payloadObj: unknown;
  try {
    payloadObj = JSON.parse(new TextDecoder().decode(payloadBytes));
  } catch {
    return { ok: false, message: '激活码无效（内容解析失败）' };
  }

  const payload = tryParseActivationPayload(payloadObj);
  if (!payload) return { ok: false, message: '激活码无效（字段不完整）' };
  if (payload.deviceId !== deviceId) return { ok: false, message: '激活码不匹配当前设备' };
  if (payload.expiresAt && Date.now() > payload.expiresAt) return { ok: false, message: '激活码已过期' };

  const state = getActivationState();
  if (state.redeemed[payload.id]) return { ok: false, message: '该激活码已兑换过' };

  const redeemedAt = Date.now();
  const next: ActivationStateV1 = {
    version: 1,
    redeemed: {
      ...state.redeemed,
      [payload.id]: { payload, redeemedAt },
    },
  };
  setActivationState(next);

  return { ok: true, payload, redeemedAt };
}

type AuthProvider = 'wechat' | 'phone';
type AuthState = {
  provider: AuthProvider;
  accountId: string;
  phone?: string;
  nickname?: string;
};

type PointsTransaction = {
  id: string;
  amount: number;
  reason: string;
  timestamp: number;
};

type PointsAccountState = {
  balance: number;
  transactions: PointsTransaction[];
  lastCheckInDate?: string;
  checkInCount?: number;
};

type PointsStoreV2 = {
  version: 2;
  accounts: Record<string, PointsAccountState>;
};

function createTransactionId() {
  return `pt-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getDefaultAccountId() {
  // 方案A：积分/权益默认绑定到设备（无需登录也能持续使用）
  return `device:${getOrCreateDeviceId()}`;
}

export const storageService = {
  // Generation history
  getHistory(): GenerationResult[] {
    try {
      const data = localStorage.getItem(HISTORY_KEY);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  },

  upsertHistoryItem(result: GenerationResult): void {
    try {
      const history = this.getHistory();
      const idx = history.findIndex(item => item.id === result.id);
      const next = idx >= 0 ? [result, ...history.filter((_, i) => i !== idx)] : [result, ...history];
      const updated = next.slice(0, MAX_HISTORY);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
    } catch (error) {
      console.error('Failed to upsert history item:', error);
    }
  },

  updateHistoryItem(id: string, patch: Partial<GenerationResult>): GenerationResult | null {
    try {
      const history = this.getHistory();
      const idx = history.findIndex(item => item.id === id);
      if (idx < 0) return null;
      const updatedItem: GenerationResult = { ...history[idx], ...patch };
      const updated = history.map(item => (item.id === id ? updatedItem : item));
      localStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
      return updatedItem;
    } catch (error) {
      console.error('Failed to update history item:', error);
      return null;
    }
  },

  addToHistory(result: GenerationResult): void {
    // 保持旧 API：等价于 upsert
    this.upsertHistoryItem(result);
  },

  clearHistory(): void {
    try {
      localStorage.removeItem(HISTORY_KEY);
    } catch (error) {
      console.error('Failed to clear history:', error);
    }
  },

  removeHistoryItem(id: string): void {
    try {
      const history = this.getHistory();
      const updated = history.filter(item => item.id !== id);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
    } catch (error) {
      console.error('Failed to remove history item:', error);
    }
  },

  clearAllData(): void {
    this.clearHistory();
  },

  getDeviceId(): string {
    return getOrCreateDeviceId();
  },

  getActivationState(): ActivationStateV1 {
    return getActivationState();
  },

  redeemActivationCode(code: string): { ok: boolean; message: string; addedPoints?: number } {
    const res = redeemActivationCode(code, this.getDeviceId());
    if (!res.ok) return res;

    const points = res.payload.points;
    if (points > 0) {
      this.addPoints(points, `激活码兑换 +${points}（${res.payload.id}）`);
    }

    return {
      ok: true,
      message: points > 0 ? `兑换成功 +${points} 积分` : '兑换成功',
      addedPoints: points,
    };
  },

  getAuthState(): AuthState | null {
    try {
      const raw = localStorage.getItem(AUTH_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Partial<AuthState>;
      if (!parsed || (parsed.provider !== 'wechat' && parsed.provider !== 'phone')) return null;
      if (typeof parsed.accountId !== 'string' || !parsed.accountId) return null;
      return {
        provider: parsed.provider,
        accountId: parsed.accountId,
        phone: typeof parsed.phone === 'string' ? parsed.phone : undefined,
        nickname: typeof parsed.nickname === 'string' ? parsed.nickname : undefined,
      };
    } catch {
      return null;
    }
  },

  setAuthState(next: AuthState | null): void {
    try {
      if (!next) {
        localStorage.removeItem(AUTH_KEY);
        return;
      }
      localStorage.setItem(AUTH_KEY, JSON.stringify(next));
    } catch (error) {
      console.error('Failed to save auth state:', error);
    }
  },

  loginWithWeChat(wechatId: string): AuthState {
    const trimmed = wechatId.trim();
    const accountId = `wechat:${trimmed}`;
    const next: AuthState = {
      provider: 'wechat',
      accountId,
      nickname: trimmed,
    };
    this.setAuthState(next);
    return next;
  },

  loginWithPhone(phone: string): AuthState {
    const trimmed = phone.trim();
    const accountId = `phone:${trimmed}`;
    const next: AuthState = {
      provider: 'phone',
      accountId,
      phone: trimmed,
    };
    this.setAuthState(next);
    return next;
  },

  logout(): void {
    this.setAuthState(null);
  },

  getCurrentAccountId(): string {
    // 方案A：积分与权益默认绑定到设备，不随登录态切换
    return getDefaultAccountId();
  },

  getPointsStore(): PointsStoreV2 {
    try {
      const raw = localStorage.getItem(POINTS_STATE_KEY);
      if (!raw) return { version: 2, accounts: {} };
      const parsed = JSON.parse(raw) as any;

      if (parsed && parsed.version === 2 && parsed.accounts && typeof parsed.accounts === 'object') {
        return parsed as PointsStoreV2;
      }

      if (parsed && typeof parsed.balance === 'number') {
        const migrated: PointsStoreV2 = {
          version: 2,
          accounts: {
            [getDefaultAccountId()]: {
              balance: parsed.balance,
              transactions: Array.isArray(parsed.transactions) ? parsed.transactions : [],
              lastCheckInDate: typeof parsed.lastCheckInDate === 'string' ? parsed.lastCheckInDate : undefined,
              checkInCount: Number.isFinite(parsed.checkInCount) ? parsed.checkInCount : undefined,
            },
          },
        };
        localStorage.setItem(POINTS_STATE_KEY, JSON.stringify(migrated));
        return migrated;
      }

      return { version: 2, accounts: {} };
    } catch {
      return { version: 2, accounts: {} };
    }
  },

  setPointsStore(next: PointsStoreV2): void {
    try {
      localStorage.setItem(POINTS_STATE_KEY, JSON.stringify(next));
    } catch (error) {
      console.error('Failed to save points state:', error);
    }
  },

  getAccountPointsState(accountId?: string): PointsAccountState {
    const id = accountId ?? this.getCurrentAccountId();
    const store = this.getPointsStore();
    const current = store.accounts[id];
    if (current && typeof current.balance === 'number' && Array.isArray(current.transactions)) {
      return {
        balance: current.balance,
        transactions: current.transactions,
        lastCheckInDate: typeof current.lastCheckInDate === 'string' ? current.lastCheckInDate : undefined,
        checkInCount: Number.isFinite((current as any).checkInCount) ? (current as any).checkInCount : undefined,
      };
    }
    return { balance: 0, transactions: [] };
  },

  setAccountPointsState(accountId: string, next: PointsAccountState): void {
    const store = this.getPointsStore();
    const updated: PointsStoreV2 = {
      ...store,
      accounts: {
        ...store.accounts,
        [accountId]: next,
      },
    };
    this.setPointsStore(updated);
  },

  getPointsState(): PointsAccountState {
    return this.getAccountPointsState(this.getCurrentAccountId());
  },

  setPointsState(next: PointsAccountState): void {
    const accountId = this.getCurrentAccountId();
    this.setAccountPointsState(accountId, next);
  },

  getPointsBalance(): number {
    return this.getPointsState().balance;
  },

  getPointsTransactions(): PointsTransaction[] {
    return this.getPointsState().transactions;
  },

  addPoints(amount: number, reason: string): number {
    if (!Number.isFinite(amount) || amount <= 0) return this.getPointsBalance();
    const accountId = this.getCurrentAccountId();
    const state = this.getAccountPointsState(accountId);
    const tx: PointsTransaction = {
      id: createTransactionId(),
      amount,
      reason,
      timestamp: Date.now(),
    };
    const next: PointsAccountState = {
      ...state,
      balance: state.balance + amount,
      transactions: [tx, ...state.transactions].slice(0, MAX_POINTS_TRANSACTIONS),
    };
    this.setAccountPointsState(accountId, next);
    return next.balance;
  },

  spendPoints(amount: number, reason: string): { ok: boolean; balance: number } {
    if (!Number.isFinite(amount) || amount <= 0) return { ok: true, balance: this.getPointsBalance() };
    const accountId = this.getCurrentAccountId();
    const state = this.getAccountPointsState(accountId);
    if (state.balance < amount) return { ok: false, balance: state.balance };
    const tx: PointsTransaction = {
      id: createTransactionId(),
      amount: -amount,
      reason,
      timestamp: Date.now(),
    };
    const next: PointsAccountState = {
      ...state,
      balance: state.balance - amount,
      transactions: [tx, ...state.transactions].slice(0, MAX_POINTS_TRANSACTIONS),
    };
    this.setAccountPointsState(accountId, next);
    return { ok: true, balance: next.balance };
  },

  deductPoints(amount: number, reason: string): number {
    if (!Number.isFinite(amount) || amount <= 0) return this.getPointsBalance();
    const accountId = this.getCurrentAccountId();
    const state = this.getAccountPointsState(accountId);
    const tx: PointsTransaction = {
      id: createTransactionId(),
      amount: -amount,
      reason,
      timestamp: Date.now(),
    };
    const next: PointsAccountState = {
      ...state,
      balance: Math.max(0, state.balance - amount),
      transactions: [tx, ...state.transactions].slice(0, MAX_POINTS_TRANSACTIONS),
    };
    this.setAccountPointsState(accountId, next);
    return next.balance;
  },

  checkIn(): { ok: boolean; balance: number; reason?: 'already' | 'limit' } {
    const today = new Date().toLocaleDateString('zh-CN');
    const accountId = this.getCurrentAccountId();
    const state = this.getAccountPointsState(accountId);

    const used = state.checkInCount ?? 0;
    if (used >= 7) return { ok: false, balance: state.balance, reason: 'limit' };
    if (state.lastCheckInDate === today) return { ok: false, balance: state.balance, reason: 'already' };

    const nextCount = used + 1;
    const tx: PointsTransaction = {
      id: createTransactionId(),
      amount: 3,
      reason: '每日签到',
      timestamp: Date.now(),
    };
    const next: PointsAccountState = {
      ...state,
      lastCheckInDate: today,
      checkInCount: nextCount,
      balance: state.balance + 3,
      transactions: [tx, ...state.transactions].slice(0, MAX_POINTS_TRANSACTIONS),
    };
    this.setAccountPointsState(accountId, next);
    return { ok: true, balance: next.balance };
  },
};
