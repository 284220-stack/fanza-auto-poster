import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const statePath = join(process.env.APP_DATA_DIR ?? new URL('../data/', import.meta.url).pathname, 'state.json');

export type State = {
  postedMessageIds: string[];
  postedUrls: string[];
  daily: Record<string, { sale: number; newRelease: number }>;
  history: Array<{ type: 'sale' | 'newRelease'; title: string; url: string; postedAt: string; status: 'posted' | 'dryRun' }>;
};

const emptyState = (): State => ({ postedMessageIds: [], postedUrls: [], daily: {}, history: [] });

export async function loadState(): Promise<State> {
  try {
    const state = JSON.parse(await readFile(statePath, 'utf8')) as Partial<State>;
    return { ...emptyState(), ...state, history: state.history ?? [] };
  } catch {
    return emptyState();
  }
}

export async function saveState(state: State) {
  await mkdir(dirname(statePath), { recursive: true });
  state.postedMessageIds = state.postedMessageIds.slice(-1000);
  state.postedUrls = state.postedUrls.slice(-1000);
  state.history = state.history.slice(-100);
  await writeFile(statePath, JSON.stringify(state, null, 2));
}

export function todayKey() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(new Date());
}
