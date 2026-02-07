import nacl from 'tweetnacl';

const PREFIX_V1 = 'AIG1';
const PREFIX_V2 = 'AIG2';

function b64u(buf) {
  return Buffer.from(buf)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function b64uToBytes(input) {
  const normalized = String(input).replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - (normalized.length % 4)) % 4;
  const padded = normalized + '='.repeat(padLen);
  return new Uint8Array(Buffer.from(padded, 'base64'));
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function getArg(name) {
  const idx = process.argv.findIndex(a => a === `--${name}`);
  if (idx < 0) return null;
  return process.argv[idx + 1] ?? null;
}

function usage(exitCode = 0) {
  console.log('用法：');
  console.log('  # 生成新版一次性激活码（默认 24h 过期）：');
  console.log('  LICENSE_PRIVATE_KEY=... node scripts/license-gen.mjs --amount-cents 2990 [--id <orderId>] [--expires-hours 24] [--note <text>]');
  console.log('  LICENSE_PRIVATE_KEY=... node scripts/license-gen.mjs --points 300 [--id <orderId>] [--expires-hours 24] [--note <text>]');
  console.log('');
  console.log('  # 生成旧版绑定设备的激活码（v1）：');
  console.log('  LICENSE_PRIVATE_KEY=... node scripts/license-gen.mjs --v1 --device <deviceId> --points <points> [--expires-days <days>] [--note <text>]');
  process.exit(exitCode);
}

function pointsFromAmountCents(amountCents) {
  const map = {
    990: 100,
    2990: 300,
    4990: 520,
    9900: 1088,
  };
  return map[amountCents] ?? null;
}

const wantV1 = hasFlag('v1') || Boolean(getArg('device'));

const privateKeyB64 = process.env.LICENSE_PRIVATE_KEY;
if (!privateKeyB64) {
  console.error('缺少环境变量 LICENSE_PRIVATE_KEY（请使用 scripts/keygen.mjs 生成）');
  process.exit(1);
}

const secretKey = b64uToBytes(privateKeyB64.trim());
if (secretKey.length !== 64) {
  console.error('LICENSE_PRIVATE_KEY 长度不正确（需要 64 字节的 Ed25519 secretKey）');
  process.exit(1);
}

const now = Date.now();
const idArg = getArg('id');
const id = idArg ? String(idArg).slice(0, 64) : `lic-${now}-${Math.random().toString(16).slice(2)}`;
const note = getArg('note');

if (wantV1) {
  const deviceId = getArg('device');
  const pointsRaw = getArg('points');
  const expiresDaysRaw = getArg('expires-days');

  if (!deviceId || !pointsRaw) usage(1);

  const points = Number(pointsRaw);
  if (!Number.isFinite(points) || points <= 0) {
    console.error('points 必须是正数');
    process.exit(1);
  }

  const expiresDays = expiresDaysRaw ? Number(expiresDaysRaw) : null;
  if (expiresDaysRaw && (!Number.isFinite(expiresDays) || expiresDays <= 0)) {
    console.error('expires-days 必须是正数');
    process.exit(1);
  }

  const payload = {
    v: 1,
    id,
    deviceId: String(deviceId),
    points: Math.floor(points),
    issuedAt: now,
    expiresAt: expiresDays ? now + Math.floor(expiresDays * 24 * 60 * 60 * 1000) : undefined,
    note: note ? String(note).slice(0, 80) : undefined,
  };

  for (const k of Object.keys(payload)) {
    if (payload[k] === undefined) delete payload[k];
  }

  const payloadBytes = Buffer.from(JSON.stringify(payload), 'utf8');
  const sig = nacl.sign.detached(new Uint8Array(payloadBytes), secretKey);
  const code = `${PREFIX_V1}.${b64u(payloadBytes)}.${b64u(sig)}`;

  console.log('激活码：');
  console.log(code);
  console.log('');
  console.log('payload：');
  console.log(JSON.stringify(payload, null, 2));
  process.exit(0);
}

// v2
const amountCentsRaw = getArg('amount-cents');
const pointsRaw = getArg('points');
const expiresHoursRaw = getArg('expires-hours');

const amountCents = amountCentsRaw ? Math.floor(Number(amountCentsRaw)) : null;
const pointsFromArg = pointsRaw ? Math.floor(Number(pointsRaw)) : null;

let points = null;
if (typeof pointsFromArg === 'number' && Number.isFinite(pointsFromArg) && pointsFromArg > 0) {
  points = pointsFromArg;
} else if (typeof amountCents === 'number' && Number.isFinite(amountCents) && amountCents > 0) {
  points = pointsFromAmountCents(amountCents);
}

if (!points) usage(1);

const expiresHours = expiresHoursRaw ? Math.floor(Number(expiresHoursRaw)) : 24;
if (!Number.isFinite(expiresHours) || expiresHours <= 0) {
  console.error('expires-hours 必须是正数');
  process.exit(1);
}

const payload = {
  v: 2,
  id,
  amountCents: amountCents ? amountCents : undefined,
  points,
  issuedAt: now,
  expiresAt: now + expiresHours * 60 * 60 * 1000,
  note: note ? String(note).slice(0, 80) : undefined,
};

for (const k of Object.keys(payload)) {
  if (payload[k] === undefined) delete payload[k];
}

const payloadBytes = Buffer.from(JSON.stringify(payload), 'utf8');
const sig = nacl.sign.detached(new Uint8Array(payloadBytes), secretKey);
const code = `${PREFIX_V2}.${b64u(payloadBytes)}.${b64u(sig)}`;

console.log('激活码：');
console.log(code);
console.log('');
console.log('payload：');
console.log(JSON.stringify(payload, null, 2));

