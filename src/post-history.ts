import type { Queryable } from './actresses.js';

export type PostHistory = { id: number; productId: number; xPostId: string | null; postType: 'parent' | 'reply'; executionStatus: 'posted' | 'pending_reply'; parentHistoryId: number | null; postText: string | null; characterCount: number | null; postedAt: string };
export type PostHistoryListItem = PostHistory & { productTitle: string; actressNames: string[]; parentPostId: string | null; replyPostId: string | null; replyText: string | null; repostAvailableAt: string | null };
const fields = 'id, product_id AS "productId", x_post_id AS "xPostId", post_type AS "postType", execution_status AS "executionStatus", parent_history_id AS "parentHistoryId", post_text AS "postText", character_count AS "characterCount", posted_at AS "postedAt"';

export class PostHistoryRepository {
  constructor(private readonly db: Queryable) {}
  async create(value: { productId: number; xPostId: string; postType: 'parent' | 'reply'; executionStatus: 'posted' | 'pending_reply'; parentHistoryId?: number; postText?: string }) {
    return (await this.db.query<PostHistory>(`INSERT INTO post_history (product_id, x_post_id, post_type, execution_status, parent_history_id, post_text, character_count) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING ${fields}`, [value.productId, value.xPostId, value.postType, value.executionStatus, value.parentHistoryId ?? null, value.postText ?? null, value.postText === undefined ? null : Array.from(value.postText).length])).rows[0];
  }
  async latest(productId: number) { return (await this.db.query<PostHistory>(`SELECT ${fields} FROM post_history WHERE product_id = $1 ORDER BY posted_at DESC, id DESC LIMIT 1`, [productId])).rows[0]; }
  async hasWithin(productId: number, since: Date) { return (await this.db.query<{ exists: boolean }>("SELECT EXISTS(SELECT 1 FROM post_history WHERE product_id = $1 AND posted_at >= $2 AND post_type = $3 AND execution_status IN ('posted', 'pending_reply')) AS exists", [productId, since.toISOString(), 'parent'])).rows[0]?.exists ?? false; }
  async findPendingReply(productId: number) { return (await this.db.query<PostHistory>(`SELECT ${fields} FROM post_history WHERE product_id = $1 AND post_type = $2 AND execution_status = $3 ORDER BY posted_at DESC, id DESC LIMIT 1`, [productId, 'parent', 'pending_reply'])).rows[0]; }
  async markReplyCompleted(parentHistoryId: number) { await this.db.query('UPDATE post_history SET execution_status = $2 WHERE id = $1', [parentHistoryId, 'posted']); }
  async list(options: { page: number; limit: number; status?: string; actress?: string; product?: string; dateFrom?: string; dateTo?: string; pendingReply?: boolean }) {
    const values: unknown[] = []; const conditions: string[] = ["h.post_type = 'parent'"];
    if (options.status) { values.push(options.status); conditions.push(`h.execution_status = $${values.length}`); }
    if (options.pendingReply !== undefined) { values.push(options.pendingReply ? 'pending_reply' : 'posted'); conditions.push(`h.execution_status = $${values.length}`); }
    if (options.actress) { values.push(`%${options.actress}%`); conditions.push(`EXISTS (SELECT 1 FROM product_actresses xpa JOIN actresses xa ON xa.id=xpa.actress_id WHERE xpa.product_id=h.product_id AND xa.name ILIKE $${values.length})`); }
    if (options.product) { values.push(`%${options.product}%`); conditions.push(`p.title ILIKE $${values.length}`); }
    if (options.dateFrom) { values.push(options.dateFrom); conditions.push(`h.posted_at >= $${values.length}::date`); }
    if (options.dateTo) { values.push(options.dateTo); conditions.push(`h.posted_at < ($${values.length}::date + interval '1 day')`); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    values.push(options.limit, (options.page - 1) * options.limit);
    const rows = await this.db.query<PostHistoryListItem>(`SELECT h.id, h.product_id AS "productId", h.x_post_id AS "xPostId", h.post_type AS "postType", h.execution_status AS "executionStatus", h.parent_history_id AS "parentHistoryId", h.post_text AS "postText", h.character_count AS "characterCount", h.posted_at AS "postedAt", p.title AS "productTitle", COALESCE(array_agg(DISTINCT a.name) FILTER (WHERE a.id IS NOT NULL), '{}') AS "actressNames", h.x_post_id AS "parentPostId", reply.x_post_id AS "replyPostId", reply.post_text AS "replyText", h.posted_at + interval '30 days' AS "repostAvailableAt" FROM post_history h JOIN products p ON p.id=h.product_id LEFT JOIN product_actresses pa ON pa.product_id=p.id LEFT JOIN actresses a ON a.id=pa.actress_id LEFT JOIN post_history reply ON reply.parent_history_id=h.id AND reply.post_type='reply' ${where} GROUP BY h.id,p.title,reply.x_post_id,reply.post_text ORDER BY h.posted_at DESC,h.id DESC LIMIT $${values.length - 1} OFFSET $${values.length}`, values);
    const total = await this.db.query<{ count: string }>(`SELECT count(*)::text AS count FROM post_history h JOIN products p ON p.id=h.product_id ${where}`, values.slice(0, -2));
    return { items: rows.rows, total: Number(total.rows[0]?.count ?? 0) };
  }
  async getDetail(id: number) {
    const result = await this.db.query<PostHistoryListItem>(`SELECT h.id, h.product_id AS "productId", h.x_post_id AS "xPostId", h.post_type AS "postType", h.execution_status AS "executionStatus", h.parent_history_id AS "parentHistoryId", h.post_text AS "postText", h.character_count AS "characterCount", h.posted_at AS "postedAt", p.title AS "productTitle", COALESCE(array_agg(DISTINCT a.name) FILTER (WHERE a.id IS NOT NULL), '{}') AS "actressNames", h.x_post_id AS "parentPostId", reply.x_post_id AS "replyPostId", reply.post_text AS "replyText", h.posted_at + interval '30 days' AS "repostAvailableAt" FROM post_history h JOIN products p ON p.id=h.product_id LEFT JOIN product_actresses pa ON pa.product_id=p.id LEFT JOIN actresses a ON a.id=pa.actress_id LEFT JOIN post_history reply ON reply.parent_history_id=h.id AND reply.post_type='reply' WHERE h.id=$1 AND h.post_type='parent' GROUP BY h.id,p.title,reply.x_post_id,reply.post_text`, [id]);
    return result.rows[0];
  }
}
