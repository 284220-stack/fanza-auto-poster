export type Actress = {
  id: number;
  name: string;
  aliases: string[];
  enabled: boolean;
  priority: number;
  targetNewReleases: boolean;
  targetSales: boolean;
  minimumPostIntervalHours: number;
  weeklyPostLimit: number;
  createdAt: string;
  updatedAt: string;
};

export type ActressInput = Omit<Actress, 'id' | 'createdAt' | 'updatedAt'>;
export type Queryable = {
  query<T>(sql: string, values?: readonly unknown[]): Promise<{ rows: T[] }>;
};

export class ActressError extends Error {
  constructor(message: string, public readonly status: 400 | 404 | 409 = 400) {
    super(message);
    this.name = 'ActressError';
  }
}

const fields = 'id, name, aliases, enabled, priority, target_new_releases AS "targetNewReleases", target_sales AS "targetSales", minimum_post_interval_hours AS "minimumPostIntervalHours", weekly_post_limit AS "weeklyPostLimit", created_at AS "createdAt", updated_at AS "updatedAt"';

export class ActressRepository {
  constructor(private readonly db: Queryable) {}

  async list(enabled?: boolean) {
    const where = typeof enabled === 'boolean' ? ' WHERE enabled = $1' : '';
    const values = typeof enabled === 'boolean' ? [enabled] : undefined;
    return (await this.db.query<Actress>(`SELECT ${fields} FROM actresses${where} ORDER BY priority DESC, name`, values)).rows;
  }

  async find(id: number) {
    return (await this.db.query<Actress>(`SELECT ${fields} FROM actresses WHERE id = $1`, [id])).rows[0];
  }

  async search(term: string, enabled?: boolean) {
    const values: unknown[] = [`%${term}%`];
    const enabledWhere = typeof enabled === 'boolean' ? ` AND enabled = $${values.push(enabled)}` : '';
    return (await this.db.query<Actress>(`SELECT ${fields} FROM actresses WHERE (name ILIKE $1 OR EXISTS (SELECT 1 FROM unnest(aliases) alias WHERE alias ILIKE $1))${enabledWhere} ORDER BY priority DESC, name`, values)).rows;
  }

  async create(value: ActressInput) {
    return (await this.db.query<Actress>(`INSERT INTO actresses (name, aliases, enabled, priority, target_new_releases, target_sales, minimum_post_interval_hours, weekly_post_limit) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING ${fields}`, [value.name, value.aliases, value.enabled, value.priority, value.targetNewReleases, value.targetSales, value.minimumPostIntervalHours, value.weeklyPostLimit])).rows[0];
  }

  async update(id: number, value: ActressInput) {
    return (await this.db.query<Actress>(`UPDATE actresses SET name = $2, aliases = $3, enabled = $4, priority = $5, target_new_releases = $6, target_sales = $7, minimum_post_interval_hours = $8, weekly_post_limit = $9 WHERE id = $1 RETURNING ${fields}`, [id, value.name, value.aliases, value.enabled, value.priority, value.targetNewReleases, value.targetSales, value.minimumPostIntervalHours, value.weeklyPostLimit])).rows[0];
  }

  async setEnabled(id: number, enabled: boolean) {
    return (await this.db.query<Actress>(`UPDATE actresses SET enabled = $2 WHERE id = $1 RETURNING ${fields}`, [id, enabled])).rows[0];
  }

  async remove(id: number) {
    return (await this.db.query<{ id: number }>('DELETE FROM actresses WHERE id = $1 RETURNING id', [id])).rows[0];
  }
}

export class ActressService {
  constructor(private readonly repo: ActressRepository) {}

  private normalize(value: Partial<ActressInput>): ActressInput {
    const name = value.name?.trim() ?? '';
    if (!name) throw new ActressError('女優名を入力してください。');
    const aliases = [...new Set((value.aliases ?? []).map((alias) => alias.trim()).filter(Boolean))];
    const priority = Number(value.priority);
    const minimumPostIntervalHours = Number(value.minimumPostIntervalHours);
    const weeklyPostLimit = Number(value.weeklyPostLimit);
    if (!Number.isInteger(priority) || priority < 0 || priority > 100) throw new ActressError('優先度は0から100で入力してください。');
    if (!Number.isInteger(minimumPostIntervalHours) || minimumPostIntervalHours < 0) throw new ActressError('最低投稿間隔は0以上で入力してください。');
    if (!Number.isInteger(weeklyPostLimit) || weeklyPostLimit < 0) throw new ActressError('週間投稿上限は0以上で入力してください。');
    return { name, aliases, enabled: value.enabled ?? true, priority, targetNewReleases: value.targetNewReleases ?? true, targetSales: value.targetSales ?? true, minimumPostIntervalHours, weeklyPostLimit };
  }

  async list(search?: string, enabled?: boolean) {
    return search?.trim() ? this.repo.search(search.trim(), enabled) : this.repo.list(enabled);
  }

  async get(id: number) {
    const actress = await this.repo.find(id);
    if (!actress) throw new ActressError('女優が見つかりません。', 404);
    return actress;
  }

  async create(value: Partial<ActressInput>) {
    try {
      return await this.repo.create(this.normalize(value));
    } catch (error) {
      if (databaseCode(error) === '23505') throw new ActressError('同名の女優が既に登録されています。', 409);
      throw error;
    }
  }

  async update(id: number, value: Partial<ActressInput>) {
    const current = await this.get(id);
    try {
      return await this.repo.update(id, this.normalize({
        name: value.name ?? current.name,
        aliases: value.aliases ?? current.aliases,
        enabled: value.enabled ?? current.enabled,
        priority: value.priority ?? current.priority,
        targetNewReleases: value.targetNewReleases ?? current.targetNewReleases,
        targetSales: value.targetSales ?? current.targetSales,
        minimumPostIntervalHours: value.minimumPostIntervalHours ?? current.minimumPostIntervalHours,
        weeklyPostLimit: value.weeklyPostLimit ?? current.weeklyPostLimit
      }));
    } catch (error) {
      if (databaseCode(error) === '23505') throw new ActressError('同名の女優が既に登録されています。', 409);
      throw error;
    }
  }

  async enabled(id: number, value: unknown) {
    if (typeof value !== 'boolean') throw new ActressError('有効状態が不正です。');
    const actress = await this.repo.setEnabled(id, value);
    if (!actress) throw new ActressError('女優が見つかりません。', 404);
    return actress;
  }

  async remove(id: number) {
    try {
      if (!await this.repo.remove(id)) throw new ActressError('女優が見つかりません。', 404);
    } catch (error) {
      if (databaseCode(error) === '23503') throw new ActressError('関連する商品があるため削除できません。無効化を利用してください。', 409);
      throw error;
    }
  }
}

function databaseCode(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error ? (error as { code?: string }).code : undefined;
}
