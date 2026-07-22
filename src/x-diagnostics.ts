import { createHash } from 'node:crypto';
import { TwitterApi } from 'twitter-api-v2';

const requiredKeys = ['X_APP_KEY', 'X_APP_SECRET', 'X_ACCESS_TOKEN', 'X_ACCESS_SECRET'] as const;
export type XCredentialKey = typeof requiredKeys[number];
export type XDiagnosticResult = {
  configured: Record<XCredentialKey, boolean>;
  authenticated: boolean;
  accountReference?: string;
  writePermission: 'requires_live_post';
  mediaUploadPermission: 'requires_live_upload';
  planAndRateLimit: 'not_confirmed';
  errors: string[];
};

type Account = { id: string; username?: string };
type Probe = (values: Record<XCredentialKey, string>) => Promise<Account>;

export async function diagnoseXConnection(values: Record<string, string>, probe: Probe = defaultProbe): Promise<XDiagnosticResult> {
  const configured = Object.fromEntries(requiredKeys.map((key) => [key, Boolean(values[key]?.trim())])) as Record<XCredentialKey, boolean>;
  const base = { configured, writePermission: 'requires_live_post' as const, mediaUploadPermission: 'requires_live_upload' as const, planAndRateLimit: 'not_confirmed' as const };
  if (requiredKeys.some((key) => !configured[key])) return { ...base, authenticated: false, errors: ['x_credentials_incomplete'] };
  try {
    const credentials = Object.fromEntries(requiredKeys.map((key) => [key, values[key]])) as Record<XCredentialKey, string>;
    const account = await probe(credentials);
    return { ...base, authenticated: true, accountReference: createHash('sha256').update(account.id).digest('hex').slice(0, 12), errors: [] };
  } catch {
    return { ...base, authenticated: false, errors: ['x_authentication_failed'] };
  }
}

async function defaultProbe(values: Record<XCredentialKey, string>): Promise<Account> {
  const client = new TwitterApi({ appKey: values.X_APP_KEY, appSecret: values.X_APP_SECRET, accessToken: values.X_ACCESS_TOKEN, accessSecret: values.X_ACCESS_SECRET });
  const response = await client.v2.me();
  return { id: response.data.id, username: response.data.username };
}
