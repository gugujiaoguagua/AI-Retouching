-- D1 schema for one-time activation code redemption
-- Bind this database as `LICENSE_DB` in Cloudflare Pages/Workers.

CREATE TABLE IF NOT EXISTS license_redemptions (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  points INTEGER NOT NULL,
  amount_cents INTEGER,
  issued_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  redeemed_at INTEGER NOT NULL,
  redeemed_account_id TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_license_redemptions_account_id ON license_redemptions(redeemed_account_id);
CREATE INDEX IF NOT EXISTS idx_license_redemptions_redeemed_at ON license_redemptions(redeemed_at);
