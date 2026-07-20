import type { Queryable } from './actresses.js';

export type PostHistory = { id: number; productId: number; xPostId: string | null; postType: 'parent' | 'reply'; executionStatus: 'posted' | 'pending_reply'; parentHistoryId: number | null; postedAt: string };
const fields = 'id, product_id AS "productId", x_post_id AS "xPostId", post_type AS "postType", execution_status AS "executionStatus", parent_history_id AS "parentHistoryId", posted_at AS "postedAt"';
export class PostHistoryRepository {
  constructor(private readonly db: Queryable) {}
  async create(value: { productId: number; xPostId: string; postType: 'parent' | 'reply'; executionStatus: 'posted' | 'pending_reply'; parentHistoryId?: number }) {
    return (await this.db.query<PostHistory>(`INSERT INTO post_history (product_id, x_post_id, post_type, execution_status, parent_history_id) VALUES ($1, $2, $3, $4, $5) RETURNING ${fields}`, [value.productId, value.xPostId, value.postType, value.executionStatus, value.parentHistoryId ?? null])).rows[0];
  }
  async latest(productId: number) { return (await this.db.query<PostHistory>(`SELECT ${fields} FROM post_history WHERE product_id = $1 ORDER BY posted_at DESC, id DESC LIMIT 1`, [productId])).rows[0]; }
  async hasWithin(productId: number, since: Date) { return (await this.db.query<{ exists: boolean }>("SELECT EXISTS(SELECT 1 FROM post_history WHERE product_id = $1 AND posted_at >= $2 AND post_type = $3 AND execution_status IN ('posted', 'pending_reply')) AS exists", [productId, since.toISOString(), 'parent'])).rows[0]?.exists ?? false; }
  async findPendingReply(productId: number) { return (await this.db.query<PostHistory>(`SELECT ${fields} FROM post_history WHERE product_id = $1 AND post_type = $2 AND execution_status = $3 ORDER BY posted_at DESC, id DESC LIMIT 1`, [productId, 'parent', 'pending_reply'])).rows[0]; }
  async markReplyCompleted(parentHistoryId: number) { await this.db.query('UPDATE post_history SET execution_status = $2 WHERE id = $1', [parentHistoryId, 'posted']); }
}
