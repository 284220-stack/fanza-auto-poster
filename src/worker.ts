import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { TwitterApi } from 'twitter-api-v2';
import { loadConfig, type AppConfig } from './config.js';
import { buildPost, extractCandidates } from './extract.js';
import { loadState, saveState, todayKey } from './state.js';

function senderAllowed(config: AppConfig, from: string) {
  return config.allowedSenders.length === 0 || config.allowedSenders.some((sender) => from.toLowerCase().includes(sender));
}

function hasTargetKeyword(config: AppConfig, text: string) {
  return config.targetKeywords.some((keyword) => text.includes(keyword));
}

export async function pollOnce() {
  const config = loadConfig();
  const xClient = new TwitterApi({ appKey: config.x.appKey, appSecret: config.x.appSecret, accessToken: config.x.accessToken, accessSecret: config.x.accessSecret });
  const state = await loadState();
  const today = todayKey();
  state.daily[today] ??= { sale: 0, newRelease: 0 };
  const client = new ImapFlow({ host: config.yahoo.host, port: config.yahoo.port, secure: true, auth: { user: config.yahoo.user, pass: config.yahoo.password }, logger: false });

  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');
    try {
      for await (const message of client.fetch({ seen: false }, { uid: true, source: true, envelope: true })) {
        const messageId = message.envelope?.messageId ?? `uid:${message.uid}`;
        if (state.postedMessageIds.includes(messageId) || !message.source) continue;
        const parsed = await simpleParser(message.source);
        const from = parsed.from?.text ?? '';
        const subject = parsed.subject ?? '';
        const html = typeof parsed.html === 'string' ? parsed.html : undefined;
        const body = parsed.text ?? html?.replace(/<[^>]+>/g, ' ') ?? '';
        if (!senderAllowed(config, from) || !hasTargetKeyword(config, `${subject}\n${body}`)) continue;

        const candidates = extractCandidates(subject, body, html);
        let handled = false;
        for (const candidate of candidates) {
          if (state.postedUrls.includes(candidate.url)) continue;
          if (state.daily[today][candidate.type] >= (candidate.type === 'sale' ? config.saleLimit : config.newReleaseLimit)) continue;
          const post = buildPost(candidate, config.disclosure);
          if (config.dryRun) console.log(`[DRY RUN] ${candidate.type}:\n${post}\n`);
          else {
            const result = await xClient.v2.tweet(post);
            console.log(`Posted ${candidate.type}: https://x.com/i/web/status/${result.data.id}`);
          }
          state.postedUrls.push(candidate.url);
          state.history.push({ type: candidate.type, title: candidate.title, url: candidate.url, postedAt: new Date().toISOString(), status: config.dryRun ? 'dryRun' : 'posted' });
          state.daily[today][candidate.type] += 1;
          handled = true;
        }
        if (handled || candidates.length === 0) state.postedMessageIds.push(messageId);
      }
    } finally { lock.release(); }
  } finally {
    await client.logout().catch(() => undefined);
    await saveState(state);
  }
}

export function startWorker() {
  let lastPollAt = 0;
  let busy = false;
  const runIfDue = async () => {
    if (busy) return;
    try {
      const config = loadConfig();
      if (Date.now() - lastPollAt < config.pollMinutes * 60_000) return;
      busy = true;
      await pollOnce();
      lastPollAt = Date.now();
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('Initial setup is incomplete')) return;
      console.error('Poll failed:', error);
    } finally { busy = false; }
  };
  console.log('Auto poster started. It will begin after initial setup is complete.');
  void runIfDue();
  setInterval(() => void runIfDue(), 60_000);
}
