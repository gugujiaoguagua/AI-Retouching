import nacl from 'tweetnacl';

const PREFIX_V1 = 'AIG1';
const PREFIX_V2 = 'AIG2';

type Env = Record<string, string | undefined>;

type ActivationPayloadV1 = {
  v: 1;
  id: string;
  deviceId: string;
  points: number;
  issuedAt: number;
  expiresAt?: number;
  note?: string;
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

function getBearerToken(req: Request) {
  const auth = req.headers.get('authorization') || '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m?.[1]?.trim() || '';
}

function bytesToBase64Url(bytes: Uint8Array) {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
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

function safeInt(value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined;
  const n = Number(value);
  if (!Number.isFinite(n)) return undefined;
  return Math.floor(n);
}

function pointsFromAmountCents(amountCents: number): number | null {
  const map: Record<number, number> = {
    990: 100,
    2990: 300,
    4990: 520,
    9900: 1088,
  };
  return map[amountCents] ?? null;
}

export async function onRequestPost(context: { request: Request; env: Env }) {
  try {
    const adminToken = (context.env.LICENSE_ADMIN_TOKEN || '').trim();
    if (!adminToken) {
      return json({ error: 'missing-env', key: 'LICENSE_ADMIN_TOKEN' }, { status: 500 });
    }

    const callerToken = getBearerToken(context.request);
    if (!callerToken || callerToken !== adminToken) {
      return json({ error: 'unauthorized' }, { status: 401 });
    }

    const privateKeyB64 = (context.env.LICENSE_PRIVATE_KEY || '').trim();
    if (!privateKeyB64) {
      return json({ error: 'missing-env', key: 'LICENSE_PRIVATE_KEY' }, { status: 500 });
    }

    const keyBytes = base64UrlToBytes(privateKeyB64);

    // 兼容两种写法：
    // - 64 字节：tweetnacl 的 sign.secretKey（推荐）
    // - 32 字节：Ed25519 seed（会在此处派生为 64 字节 secretKey）
    const secretKey =
      keyBytes.length === 64
        ? keyBytes
        : keyBytes.length === 32
          ? nacl.sign.keyPair.fromSeed(keyBytes).secretKey
          : null;

    if (!secretKey) {
      return json(
        {
          error: 'bad-env',
          key: 'LICENSE_PRIVATE_KEY',
          hint: `需要 64 字节 secretKey 或 32 字节 seed（base64url）。当前解码长度=${keyBytes.length}`,
        },
        { status: 500 }
      );
    }

    const body = (await context.request.json().catch(() => null)) as any;
    if (!body || typeof body !== 'object') {
      return json({ error: 'bad-request', message: 'body 必须是 JSON' }, { status: 400 });
    }

    const now = Date.now();
    const id = safeText(body.id, 64) || `lic-${now}-${Math.random().toString(16).slice(2)}`;
    const note = safeText(body.note, 80);

    // 兼容旧版：如果传了 deviceId，则生成 AIG1（v1）
    const deviceId = safeText(body.deviceId, 128);
    if (deviceId) {
      const points = Number(body.points);
      const expiresDays = body.expiresDays === undefined || body.expiresDays === null ? undefined : Number(body.expiresDays);

      if (!Number.isFinite(points) || points <= 0) {
        return json({ error: 'bad-request', message: 'points 必须为正数' }, { status: 400 });
      }

      if (expiresDays !== undefined && (!Number.isFinite(expiresDays) || expiresDays <= 0)) {
        return json({ error: 'bad-request', message: 'expiresDays 必须为正数（天）' }, { status: 400 });
      }

      const payload: ActivationPayloadV1 = {
        v: 1,
        id,
        deviceId,
        points: Math.floor(points),
        issuedAt: now,
        expiresAt: expiresDays ? now + Math.floor(expiresDays * 24 * 60 * 60 * 1000) : undefined,
        note: note || undefined,
      };

      // 删除 undefined 字段
      if (payload.expiresAt === undefined) delete payload.expiresAt;
      if (payload.note === undefined) delete payload.note;

      const payloadBytes = new TextEncoder().encode(JSON.stringify(payload));
      const sigBytes = nacl.sign.detached(payloadBytes, secretKey);
      const code = `${PREFIX_V1}.${bytesToBase64Url(payloadBytes)}.${bytesToBase64Url(sigBytes)}`;

      return json({ ok: true, code, payload });
    }

    // 新版：AIG2（v2）
    const amountCents = safeInt(body.amountCents);
    const pointsFromBody = safeInt(body.points);

    const points =
      typeof pointsFromBody === 'number' && pointsFromBody > 0
        ? pointsFromBody
        : typeof amountCents === 'number'
          ? pointsFromAmountCents(amountCents)
          : null;

    if (!points || points <= 0) {
      return json(
        {
          error: 'bad-request',
          message: '请传 points 或 amountCents（可按档位自动识别）',
          tiers: [
            { amountCents: 990, points: 100 },
            { amountCents: 2990, points: 300 },
            { amountCents: 4990, points: 520 },
            { amountCents: 9900, points: 1088 },
          ],
        },
        { status: 400 }
      );
    }

    const expiresHours = safeInt(body.expiresHours);
    const expiresDays = safeInt(body.expiresDays);
    const effectiveHours =
      typeof expiresHours === 'number' && expiresHours > 0
        ? expiresHours
        : typeof expiresDays === 'number' && expiresDays > 0
          ? expiresDays * 24
          : 24;

    const expiresAt = now + Math.floor(effectiveHours * 60 * 60 * 1000);

    const payload: ActivationPayloadV2 = {
      v: 2,
      id,
      amountCents: typeof amountCents === 'number' && amountCents > 0 ? amountCents : undefined,
      points,
      issuedAt: now,
      expiresAt,
      note: note || undefined,
    };

    // 删除 undefined 字段
    if (payload.amountCents === undefined) delete payload.amountCents;
    if (payload.note === undefined) delete payload.note;

    const payloadBytes = new TextEncoder().encode(JSON.stringify(payload));
    const sigBytes = nacl.sign.detached(payloadBytes, secretKey);

    const code = `${PREFIX_V2}.${bytesToBase64Url(payloadBytes)}.${bytesToBase64Url(sigBytes)}`;

    return json({ ok: true, code, payload });
  } catch {
    return json({ error: 'internal-error' }, { status: 500 });
  }
}

