import dotenv from 'dotenv';
import { join } from 'node:path';

const dataDir = process.env.APP_DATA_DIR ?? new URL('../data/', import.meta.url).pathname;
const settingsPath = join(dataDir, 'settings.env');

export type AppConfig = {
  yahoo: { user: string; password: string; host: string; port: number };
  x: { appKey: string; appSecret: string; accessToken: string; accessSecret: string };
  allowedSenders: string[];
  targetKeywords: string[];
  pollMinutes: number;
  saleLimit: number;
  newReleaseLimit: number;
  disclosure: string;
  dryRun: boolean;
  officialSaleMonitor: { enabled: boolean; urls: string[] };
};

function numberValue(name: string, fallback: number) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isFinite(value) || value < 1) throw new Error(`${name} must be a positive number.`);
  return value;
}

function value(name: string) {
  return process.env[name]?.trim() ?? '';
}

export function loadConfig(): AppConfig {
  dotenv.config({ path: settingsPath, override: true, quiet: true });
  const required = ['YAHOO_IMAP_USER', 'YAHOO_IMAP_PASSWORD', 'X_APP_KEY', 'X_APP_SECRET', 'X_ACCESS_TOKEN', 'X_ACCESS_SECRET'];
  const missing = required.filter((name) => !value(name));
  if (missing.length) throw new Error(`Initial setup is incomplete: ${missing.join(', ')}`);

  return {
    yahoo: { user: value('YAHOO_IMAP_USER'), password: value('YAHOO_IMAP_PASSWORD'), host: value('YAHOO_IMAP_HOST') || 'imap.mail.yahoo.co.jp', port: numberValue('YAHOO_IMAP_PORT', 993) },
    x: { appKey: value('X_APP_KEY'), appSecret: value('X_APP_SECRET'), accessToken: value('X_ACCESS_TOKEN'), accessSecret: value('X_ACCESS_SECRET') },
    allowedSenders: (process.env.ALLOWED_SENDERS ?? '').split(',').map((item) => item.trim().toLowerCase()).filter(Boolean),
    targetKeywords: (process.env.TARGET_KEYWORDS ?? 'FANZA,DMM,セール,新作,新製品,新着').split(',').map((item) => item.trim()).filter(Boolean),
    pollMinutes: numberValue('POLL_MINUTES', 10),
    saleLimit: numberValue('DAILY_SALE_LIMIT', 3),
    newReleaseLimit: numberValue('DAILY_NEW_RELEASE_LIMIT', 3),
    disclosure: value('DISCLOSURE') || '#PR',
    dryRun: (process.env.DRY_RUN ?? 'true').toLowerCase() !== 'false',
    officialSaleMonitor: {
      enabled: (process.env.OFFICIAL_SALE_MONITOR_ENABLED ?? 'false').toLowerCase() === 'true',
      urls: (process.env.OFFICIAL_SALE_URLS ?? '').split(/[\n,]+/).map((item) => item.trim()).filter(Boolean)
    }
  };
}
