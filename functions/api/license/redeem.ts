import nacl from 'tweetnacl';

const PREFIX_V2 = 'AIG2';

type Env = {
  [key: string]: unknown;
  LICENSE_PUBLIC_KEY?: string;
  LICENSE_PRIVATE_KEY?: string;
  LICENSE_DB?: any; // D1 binding (Cloudflare Pages/Workers)
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

export async function onRequestPost(context: { request: Request; env: Env }) {
  try {
    const body = (await context.request.json().catch(() => null)) as any;
    if (!body || typeof body !== 'object') {
      return json({ ok: false, error: 'bad-request', message: 'body 必须是 JSON' }, { status: 400 });
    }

    const rawCode = safeText(body.code, 4096);
    const accountId = safeText(body.accountId, 128);

    if (!rawCode) return json({ ok: false, error: 'bad-request', message: 'code 不能为空' }, { status: 400 });
    if (!accountId) return json({ ok: false, error: 'bad-request', message: 'accountId 不能为空' }, { status: 400 });

    const code = rawCode.replace(/\s+/g, '').trim();
    const parts = code.split('.');
    if (parts.length !== 3 || parts[0] !== PREFIX_V2) {
      return json({ ok: false, error: 'bad-code', message: '激活码格式不正确' }, { status: 400 });
    }

    const publicKey = getPublicKey(context.env);
    if (!publicKey) {
      return json({ ok: false, error: 'missing-env', key: 'LICENSE_PUBLIC_KEY', message: '未配置激活码公钥' }, { status: 500 });
    }

    let payloadBytes: Uint8Array;
    let sigBytes: Uint8Array;
    try {
      payloadBytes = base64UrlToBytes(parts[1]);
      sigBytes = base64UrlToBytes(parts[2]);
    } catch {
      return json({ ok: false, error: 'bad-code', message: '激活码解析失败' }, { status: 400 });
    }

    const verified = nacl.sign.detached.verify(payloadBytes, sigBytes, publicKey);
    if (!verified) {
      return json({ ok: false, error: 'bad-code', message: '激活码无效（签名校验失败）' }, { status: 400 });
    }

    let payloadObj: unknown;
    try {
      payloadObj = JSON.parse(new TextDecoder().decode(payloadBytes));
    } catch {
      return json({ ok: false, error: 'bad-code', message: '激活码无效（内容解析失败）' }, { status: 400 });
    }

    const payload = tryParsePayloadV2(payloadObj);
    if (!payload) {
      return json({ ok: false, error: 'bad-code', message: '激活码无效（字段不完整）' }, { status: 400 });
    }

    const now = Date.now();
    if (now > payload.expiresAt) {
      return json({ ok: false, error: 'expired', message: '激活码已过期' }, { status: 400 });
    }

    const db = context.env.LICENSE_DB;
    if (!db || typeof db.prepare !== 'function') {
      return json(
        {
          ok: false,
          error: 'missing-env',
          key: 'LICENSE_DB',
          message: '未配置 D1 数据库绑定（LICENSE_DB）',
        },
        { status: 500 }
      );
    }

    const redeemedAt = now;

    // 1) Try insert as the first redeemer
    const insertSql = `INSERT INTO license_redemptions (id, code, points, amount_cents, issued_at, expires_at, redeemed_at, redeemed_account_id)
VALUES (?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(id) DO NOTHING;`;

    const insertRes = await db
      .prepare(insertSql)
      .bind(
        payload.id,
        code,
        payload.points,
        payload.amountCents ?? null,
        payload.issuedAt,
        payload.expiresAt,
        redeemedAt,
        accountId
      )
      .run();

    const changes = insertRes?.meta?.changes ?? 0;
    if (changes > 0) {
      return json({ ok: true, id: payload.id, points: payload.points, redeemedAt, alreadyRedeemed: false });
    }

    // 2) Already redeemed: return who redeemed it
    const row = await db
      .prepare('SELECT redeemed_at as redeemedAt, redeemed_account_id as redeemedAccountId, points as points FROM license_redemptions WHERE id = ? LIMIT 1')
      .bind(payload.id)
      .first();

    const redeemedAccountId = typeof row?.redeemedAccountId === 'string' ? row.redeemedAccountId : '';
    const redeemedAtDb = Number(row?.redeemedAt);
    const pointsDb = Number(row?.points);

    if (redeemedAccountId && redeemedAccountId === accountId) {
      // Idempotent response for same account
      return json({
        ok: true,
        id: payload.id,
        points: Number.isFinite(pointsDb) && pointsDb > 0 ? pointsDb : payload.points,
        redeemedAt: Number.isFinite(redeemedAtDb) && redeemedAtDb > 0 ? redeemedAtDb : redeemedAt,
        alreadyRedeemed: true,
      });
    }

    return json(
      {
        ok: false,
        error: 'already-redeemed',
        message: '该激活码已被其他账号兑换',
      },
      { status: 409 }
    );
  } catch {
    return json({ ok: false, error: 'internal-error' }, { status: 500 });
  }
}
