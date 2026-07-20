import { ActressError, type Actress, type ActressInput } from './actresses.js';
import { DatabaseConfigurationError } from './db/pool.js';

export type ActressApiService = {
  list(search?: string, enabled?: boolean): Promise<Actress[]>;
  get(id: number): Promise<Actress>;
  create(value: Partial<ActressInput>): Promise<Actress>;
  update(id: number, value: Partial<ActressInput>): Promise<Actress>;
  enabled(id: number, value: unknown): Promise<Actress>;
  remove(id: number): Promise<void>;
};

export type ActressApiResponse = { status: number; body: Record<string, unknown> };

const inputKeys = new Set(['name', 'aliases', 'enabled', 'priority', 'target_new_releases', 'target_sales', 'minimum_post_interval_hours', 'weekly_post_limit']);

function invalid(message: string): never {
  throw new ActressError(message);
}

function parseId(value: string | undefined) {
  if (!value || !/^[1-9]\d*$/.test(value)) invalid('IDは正の整数で指定してください。');
  return Number(value);
}

function parseEnabled(value: string | null) {
  if (value === null) return undefined;
  if (value === 'true') return true;
  if (value === 'false') return false;
  invalid('enabledはtrueまたはfalseで指定してください。');
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function parseInput(body: Record<string, unknown>, required: boolean) {
  const unknownKey = Object.keys(body).find((key) => !inputKeys.has(key));
  if (unknownKey) invalid('指定できない項目が含まれています。');
  if (!required && Object.keys(body).length === 0) invalid('更新項目を指定してください。');
  const value: Partial<ActressInput> = {};
  if ('name' in body) {
    if (typeof body.name !== 'string') invalid('女優名が不正です。');
    value.name = body.name;
  }
  if ('aliases' in body) {
    if (!isStringArray(body.aliases)) invalid('別名が不正です。');
    value.aliases = body.aliases;
  }
  if ('enabled' in body) { if (typeof body.enabled !== 'boolean') invalid('enabledが不正です。'); value.enabled = body.enabled; }
  if ('priority' in body) { if (typeof body.priority !== 'number') invalid('priorityが不正です。'); value.priority = body.priority; }
  if ('target_new_releases' in body) { if (typeof body.target_new_releases !== 'boolean') invalid('target_new_releasesが不正です。'); value.targetNewReleases = body.target_new_releases; }
  if ('target_sales' in body) { if (typeof body.target_sales !== 'boolean') invalid('target_salesが不正です。'); value.targetSales = body.target_sales; }
  if ('minimum_post_interval_hours' in body) { if (typeof body.minimum_post_interval_hours !== 'number') invalid('minimum_post_interval_hoursが不正です。'); value.minimumPostIntervalHours = body.minimum_post_interval_hours; }
  if ('weekly_post_limit' in body) { if (typeof body.weekly_post_limit !== 'number') invalid('weekly_post_limitが不正です。'); value.weeklyPostLimit = body.weekly_post_limit; }
  return value;
}

function errorResponse(error: unknown): ActressApiResponse {
  if (error instanceof ActressError) return { status: error.status, body: { message: error.message } };
  if (error instanceof DatabaseConfigurationError) return { status: 500, body: { message: 'データベースが設定されていません。' } };
  return { status: 500, body: { message: '女優管理の処理に失敗しました。' } };
}

export async function handleActressApiRequest(method: string | undefined, pathname: string, search: URLSearchParams, body: Record<string, unknown>, createService: () => ActressApiService): Promise<ActressApiResponse | undefined> {
  if (!pathname.startsWith('/api/actresses')) return undefined;
  const match = pathname.match(/^\/api\/actresses(?:\/([^/]+))?(?:\/(enabled))?$/);
  if (!match) return { status: 400, body: { message: 'APIの呼び出し方法が不正です。' } };
  try {
    const service = createService();
    const id = match[1] === undefined ? undefined : parseId(match[1]);
    const enabledAction = match[2] === 'enabled';
    if (method === 'GET' && id === undefined && !enabledAction) return { status: 200, body: { actresses: await service.list(search.get('search') ?? undefined, parseEnabled(search.get('enabled'))) } };
    if (method === 'GET' && id !== undefined && !enabledAction) return { status: 200, body: { actress: await service.get(id) } };
    if (method === 'POST' && id === undefined && !enabledAction) return { status: 201, body: { actress: await service.create(parseInput(body, true)) } };
    if (method === 'PATCH' && id !== undefined && !enabledAction) return { status: 200, body: { actress: await service.update(id, parseInput(body, false)) } };
    if (method === 'PATCH' && id !== undefined && enabledAction) return { status: 200, body: { actress: await service.enabled(id, body.enabled) } };
    if (method === 'DELETE' && id !== undefined && !enabledAction) {
      await service.remove(id);
      return { status: 200, body: { message: '女優を削除しました。' } };
    }
    return { status: 400, body: { message: 'APIの呼び出し方法が不正です。' } };
  } catch (error) {
    return errorResponse(error);
  }
}
