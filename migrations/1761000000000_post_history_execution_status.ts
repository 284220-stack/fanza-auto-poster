import type { MigrationBuilder } from 'node-pg-migrate';

export function up(pgm: MigrationBuilder): void {
  pgm.addColumns('post_history', {
    execution_status: { type: 'text', notNull: true, default: 'posted' },
    parent_history_id: { type: 'bigint', references: 'post_history', onDelete: 'RESTRICT' }
  });
  pgm.addConstraint('post_history', 'post_history_execution_status_check', { check: "execution_status IN ('posted', 'pending_reply')" });
  pgm.createIndex('post_history', ['product_id', 'execution_status'], { name: 'post_history_product_status_idx' });
}

export function down(pgm: MigrationBuilder): void {
  pgm.dropIndex('post_history', ['product_id', 'execution_status'], { name: 'post_history_product_status_idx' });
  pgm.dropConstraint('post_history', 'post_history_execution_status_check');
  pgm.dropColumns('post_history', ['parent_history_id', 'execution_status']);
}
