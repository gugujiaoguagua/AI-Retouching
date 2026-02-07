import nacl from 'tweetnacl';

const PREFIX = 'AIG1';

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

function getArg(name) {
  const idx = process.argv.findIndex(a => a === `--${name}`);
  if (idx < 0) return null;
  return process.argv[idx + 1] ?? null;
}

function usage(exitCode = 0) {
  console.log('用法：');
  console.log('  LICENSE_PRIVATE_KEY=... node scripts/license-gen.mjs --device <deviceId> --points <points> [--expires-days <days>] [--note <text>]');
  process.exit(exitCode);
}

const deviceId = getArg('device');
const pointsRaw = getArg('points');
const expiresDaysRaw = getArg('expires-days');
const note = getArg('note');

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
const id = `lic-${now}-${Math.random().toString(16).slice(2)}`;
const payload = {
  v: 1,
  id,
  deviceId: String(deviceId),
  points,
  issuedAt: now,
  expiresAt: expiresDays ? now + Math.floor(expiresDays * 24 * 60 * 60 * 1000) : undefined,
  note: note ? String(note).slice(0, 80) : undefined,
};

// 删除 undefined 字段，避免 JSON 里出现 null/undefined 差异
for (const k of Object.keys(payload)) {
  if (payload[k] === undefined) delete payload[k];
}

const payloadBytes = Buffer.from(JSON.stringify(payload), 'utf8');
const sig = nacl.sign.detached(new Uint8Array(payloadBytes), secretKey);

const code = `${PREFIX}.${b64u(payloadBytes)}.${b64u(sig)}`;

console.log('激活码：');
console.log(code);
console.log('');
console.log('payload：');
console.log(JSON.stringify(payload, null, 2));
