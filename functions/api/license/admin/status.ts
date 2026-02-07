import nacl from 'tweetnacl';

const PREFIX_V2 = 'AIG2';

type Env = {
  [key: string]: unknown;
  LICENSE_ADMIN_UI_PASSCODE?: string;
  LICENSE_PUBLIC_KEY?: string;
  LICENSE_PRIVATE_KEY?: string;
  LICENSE_DB?: any;
};

type ActivationPayloadV2 = {
  v: 2;
  id: string;
  amountCents?: number;
  points: number;
  issuedAt: number;
  expiresAt: number;
  note?: string;
};

function json(data: unknown, init?: ResponseInit) {
  return Response.json(data, {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      ...init?.headers,
    },
    status: init?.status ?? 200,
  });
}

function base64UrlToBytes(input: string) {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - (normalized.length % 4)) % 4;
  const padded = normalized + '='.repeat(padLen);
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function safeText(value: unknown, maxLen: number) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLen);
}

function verifyPasscode(req: Request, env: Env): boolean {
  const expected = safeText(env.LICENSE_ADMIN_UI_PASSCODE, 256);
  if (!expected) return false;
  const got = safeText(req.headers.get('x-admin-passcode'), 256);
  return Boolean(got) && got === expected;
}

function tryParsePayloadV2(raw: unknown): ActivationPayloadV2 | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as any;
  if (r.v !== 2) return null;
  if (typeof r.id !== 'string' || !r.id) return null;
  if (!Number.isFinite(r.points) || r.points <= 0) return null;
  if (!Number.isFinite(r.issuedAt) || r.issuedAt <= 0) return null;
  if (!Number.isFinite(r.expiresAt) || r.expiresAt <= 0) return null;
  if (r.note !== undefined && typeof r.note !== 'string') return null;
  if (r.amountCents !== undefined && (!Number.isFinite(r.amountCents) || r.amountCents <= 0)) return null;

  return {
    v: 2,
    id: r.id,
    amountCents: r.amountCents === undefined ? undefined : Math.floor(Number(r.amountCents)),
    points: Math.floor(Number(r.points)),
    issuedAt: Math.floor(Number(r.issuedAt)),
    expiresAt: Math.floor(Number(r.expiresAt)),
    note: r.note === undefined ? undefined : String(r.note),
  };
}

function getPublicKey(env: Env): Uint8Array | null {
  const pubB64 = safeText(env.LICENSE_PUBLIC_KEY, 512);
  if (pubB64) {
    try {
      return base64UrlToBytes(pubB64);
    } catch {
      return null;
    }
  }

  const privB64 = safeText(env.LICENSE_PRIVATE_KEY, 512);
  if (!privB64) return null;

  try {
    const keyBytes = base64UrlToBytes(privB64);
    const secretKey =
      keyBytes.length === 64
        ? keyBytes
        : keyBytes.length === 32
          ? nacl.sign.keyPair.fromSeed(keyBytes).secretKey
          : null;

    if (!secretKey) return null;
    return nacl.sign.keyPair.fromSecretKey(secretKey).publicKey;
  } catch {
    return null;
  }
}

function parseAndVerifyV2(code: string, publicKey: Uint8Array): { ok: true; payload: ActivationPayloadV2 } | { ok: false; message: string } {
  const normalized = code.replace(/\s+/g, '').trim();
  const parts = normalized.split('.');
  if (parts.length !== 3 || parts[0] !== PREFIX_V2) {
    return { ok: false, message: '激活码格式不正确（仅支持 AIG2）' };
  }

  let payloadBytes: Uint8Array;
  let sigBytes: Uint8Array;
  try {
    payloadBytes = base64UrlToBytes(parts[1]);
    sigBytes = base64UrlToBytes(parts[2]);
  } catch {
    return { ok: false, message: '激活码解析失败' };
  }

  const verified = nacl.sign.detached.verify(payloadBytes, sigBytes, publicKey);
  if (!verified) {
    return { ok: false, message: '激活码无效（签名校验失败）' };
  }

  let payloadObj: unknown;
  try {
    payloadObj = JSON.parse(new TextDecoder().decode(payloadBytes));
  } catch {
    return { ok: false, message: '激活码无效（内容解析失败）' };
  }

  const payload = tryParsePayloadV2(payloadObj);
  if (!payload) {
    return { ok: false, message: '激活码无效（字段不完整）' };
  }

  return { ok: true, payload };
}

export async function onRequestPost(context: { request: Request; env: Env }) {
  try {
    if (!verifyPasscode(context.request, context.env)) {
      return json({ ok: false, error: 'unauthorized' }, { status: 401 });
    }

    const body = (await context.request.json().catch(() => null)) as any;
    if (!body || typeof body !== 'object') {
      return json({ ok: false, error: 'bad-request', message: 'body 必须是 JSON' }, { status: 400 });
    }

    const idFromBody = safeText(body.id, 128);
    const codeFromBody = safeText(body.code, 4096);

    const db = context.env.LICENSE_DB;
    if (!db || typeof db.prepare !== 'function') {
      return json({ ok: false, error: 'missing-env', key: 'LICENSE_DB', message: '未配置 D1 数据库绑定（LICENSE_DB）' }, { status: 500 });
    }

    const now = Date.now();

    if (codeFromBody) {
      const publicKey = getPublicKey(context.env);
      if (!publicKey) {
        return json({ ok: false, error: 'missing-env', key: 'LICENSE_PUBLIC_KEY', message: '未配置激活码公钥' }, { status: 500 });
      }

      const verified = parseAndVerifyV2(codeFromBody, publicKey);
      if (!verified.ok) {
        return json({ ok: false, error: 'bad-code', message: verified.message }, { status: 400 });
      }

      const payload = verified.payload;

      const row = await db
        .prepare(
          'SELECT id, points, amount_cents as amountCents, issued_at as issuedAt, expires_at as expiresAt, redeemed_at as redeemedAt, redeemed_account_id as redeemedAccountId FROM license_redemptions WHERE id = ? LIMIT 1'
        )
        .bind(payload.id)
        .first();

      if (row) {
        return json({
          ok: true,
          status: 'redeemed',
          id: payload.id,
          points: Number(row.points),
          amountCents: row.amountCents === null || row.amountCents === undefined ? payload.amountCents ?? null : Number(row.amountCents),
          issuedAt: Number(row.issuedAt),
          expiresAt: Number(row.expiresAt),
          redeemedAt: Number(row.redeemedAt),
          redeemedAccountId: String(row.redeemedAccountId || ''),
          note: payload.note ?? null,
        });
      }

      if (now > payload.expiresAt) {
        return json({
          ok: true,
          status: 'expired',
          id: payload.id,
          points: payload.points,
          amountCents: payload.amountCents ?? null,
          issuedAt: payload.issuedAt,
          expiresAt: payload.expiresAt,
          redeemedAt: null,
          redeemedAccountId: null,
          note: payload.note ?? null,
        });
      }

      return json({
        ok: true,
        status: 'unused',
        id: payload.id,
        points: payload.points,
        amountCents: payload.amountCents ?? null,
        issuedAt: payload.issuedAt,
        expiresAt: payload.expiresAt,
        redeemedAt: null,
        redeemedAccountId: null,
        note: payload.note ?? null,
      });
    }

    if (idFromBody) {
      const row = await db
        .prepare(
          'SELECT id, points, amount_cents as amountCents, issued_at as issuedAt, expires_at as expiresAt, redeemed_at as redeemedAt, redeemed_account_id as redeemedAccountId FROM license_redemptions WHERE id = ? LIMIT 1'
        )
        .bind(idFromBody)
        .first();

      if (!row) {
        return json({ ok: true, status: 'not-redeemed-or-unknown', id: idFromBody, message: '未查到核销记录：可能未兑换；如需判断未用/过期请用 code 查询' });
      }

      return json({
        ok: true,
        status: 'redeemed',
        id: String(row.id),
        points: Number(row.points),
        amountCents: row.amountCents === null || row.amountCents === undefined ? null : Number(row.amountCents),
        issuedAt: Number(row.issuedAt),
        expiresAt: Number(row.expiresAt),
        redeemedAt: Number(row.redeemedAt),
        redeemedAccountId: String(row.redeemedAccountId || ''),
      });
    }

    return json({ ok: false, error: 'bad-request', message: '请传 code 或 id' }, { status: 400 });
  } catch {
    return json({ ok: false, error: 'internal-error' }, { status: 500 });
  }
}
