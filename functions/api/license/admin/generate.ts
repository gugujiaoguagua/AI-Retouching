import nacl from 'tweetnacl';

const PREFIX_V2 = 'AIG2';

type Env = {
  [key: string]: unknown;
  LICENSE_PRIVATE_KEY?: string;
  LICENSE_ADMIN_UI_PASSCODE?: string;
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

function bytesToBase64Url(bytes: Uint8Array) {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
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
    98: 10,
    990: 100,
    2990: 300,
    4990: 520,
    9900: 1088,
  };
  return map[amountCents] ?? null;
}

function verifyPasscode(req: Request, env: Env): boolean {
  const expected = safeText(env.LICENSE_ADMIN_UI_PASSCODE, 256);
  if (!expected) return false;
  const got = safeText(req.headers.get('x-admin-passcode'), 256);
  return Boolean(got) && got === expected;
}

export async function onRequestPost(context: { request: Request; env: Env }) {
  try {
    if (!verifyPasscode(context.request, context.env)) {
      return json({ ok: false, error: 'unauthorized' }, { status: 401 });
    }

    const privateKeyB64 = safeText(context.env.LICENSE_PRIVATE_KEY, 512);
    if (!privateKeyB64) {
      return json({ ok: false, error: 'missing-env', key: 'LICENSE_PRIVATE_KEY' }, { status: 500 });
    }

    const keyBytes = base64UrlToBytes(privateKeyB64);
    const secretKey =
      keyBytes.length === 64
        ? keyBytes
        : keyBytes.length === 32
          ? nacl.sign.keyPair.fromSeed(keyBytes).secretKey
          : null;

    if (!secretKey) {
      return json(
        {
          ok: false,
          error: 'bad-env',
          key: 'LICENSE_PRIVATE_KEY',
          hint: `需要 64 字节 secretKey 或 32 字节 seed（base64url）。当前解码长度=${keyBytes.length}`,
        },
        { status: 500 }
      );
    }

    const body = (await context.request.json().catch(() => null)) as any;
    if (!body || typeof body !== 'object') {
      return json({ ok: false, error: 'bad-request', message: 'body 必须是 JSON' }, { status: 400 });
    }

    const now = Date.now();
    const id = safeText(body.id, 64);
    if (!id) {
      return json({ ok: false, error: 'bad-request', message: 'id（订单号）不能为空' }, { status: 400 });
    }

    const note = safeText(body.note, 80);
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
          ok: false,
          error: 'bad-request',
          message: '请传 points 或 amountCents（可按档位自动识别）',
          tiers: [
            { amountCents: 98, points: 10 },
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
    const effectiveHours = typeof expiresHours === 'number' && expiresHours > 0 ? expiresHours : 24;

    const payload: ActivationPayloadV2 = {
      v: 2,
      id,
      amountCents: typeof amountCents === 'number' && amountCents > 0 ? amountCents : undefined,
      points,
      issuedAt: now,
      expiresAt: now + Math.floor(effectiveHours * 60 * 60 * 1000),
      note: note || undefined,
    };

    if (payload.amountCents === undefined) delete payload.amountCents;
    if (payload.note === undefined) delete payload.note;

    const payloadBytes = new TextEncoder().encode(JSON.stringify(payload));
    const sigBytes = nacl.sign.detached(payloadBytes, secretKey);

    const code = `${PREFIX_V2}.${bytesToBase64Url(payloadBytes)}.${bytesToBase64Url(sigBytes)}`;

    return json({ ok: true, code, payload });
  } catch {
    return json({ ok: false, error: 'internal-error' }, { status: 500 });
  }
}
