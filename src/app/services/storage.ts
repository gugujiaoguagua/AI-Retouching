import type { GenerationResult } from '@/app/types';

const HISTORY_KEY = 'ai-generator-history';
const POINTS_STATE_KEY = 'ai-generator-points-state';
const AUTH_KEY = 'ai-generator-auth';
const MAX_HISTORY = 20;
const MAX_POINTS_TRANSACTIONS = 50;

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
  starterClaimed?: boolean;
  lastCheckInDate?: string;
};

type PointsStoreV2 = {
  version: 2;
  accounts: Record<string, PointsAccountState>;
};

function createTransactionId() {
  return `pt-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getDefaultAccountId() {
  return 'guest';
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
    const auth = this.getAuthState();
    return auth?.accountId ?? getDefaultAccountId();
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
              starterClaimed: Boolean(parsed.starterClaimed),
              lastCheckInDate: typeof parsed.lastCheckInDate === 'string' ? parsed.lastCheckInDate : undefined,
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
        starterClaimed: Boolean(current.starterClaimed),
        lastCheckInDate: typeof current.lastCheckInDate === 'string' ? current.lastCheckInDate : undefined,
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

  claimStarterPack(): { ok: boolean; balance: number } {
    if (!this.getAuthState()) {
      return { ok: false, balance: this.getPointsBalance() };
    }
    const accountId = this.getCurrentAccountId();
    const state = this.getAccountPointsState(accountId);
    if (state.starterClaimed) return { ok: false, balance: state.balance };
    const tx: PointsTransaction = {
      id: createTransactionId(),
      amount: 5,
      reason: '新手礼包',
      timestamp: Date.now(),
    };
    const next: PointsAccountState = {
      ...state,
      starterClaimed: true,
      balance: state.balance + 5,
      transactions: [tx, ...state.transactions].slice(0, MAX_POINTS_TRANSACTIONS),
    };
    this.setAccountPointsState(accountId, next);
    return { ok: true, balance: next.balance };
  },

  checkIn(): { ok: boolean; balance: number } {
    const today = new Date().toLocaleDateString('zh-CN');
    const accountId = this.getCurrentAccountId();
    const state = this.getAccountPointsState(accountId);
    if (state.lastCheckInDate === today) return { ok: false, balance: state.balance };
    const tx: PointsTransaction = {
      id: createTransactionId(),
      amount: 3,
      reason: '每日签到',
      timestamp: Date.now(),
    };
    const next: PointsAccountState = {
      ...state,
      lastCheckInDate: today,
      balance: state.balance + 3,
      transactions: [tx, ...state.transactions].slice(0, MAX_POINTS_TRANSACTIONS),
    };
    this.setAccountPointsState(accountId, next);
    return { ok: true, balance: next.balance };
  },
};
