import type { MigrationBuilder } from 'node-pg-migrate';

export function up(pgm: MigrationBuilder): void {
  pgm.addColumns('post_history', {
    post_text: { type: 'text' },
    character_count: { type: 'integer' }
  });
  pgm.addConstraint('post_history', 'post_history_character_count_check', { check: 'character_count IS NULL OR character_count >= 0' });
}

export function down(pgm: MigrationBuilder): void {
  pgm.dropConstraint('post_history', 'post_history_character_count_check');
  pgm.dropColumns('post_history', ['post_text', 'character_count']);
}
