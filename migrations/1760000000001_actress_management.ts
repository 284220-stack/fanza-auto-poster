import type { MigrationBuilder } from 'node-pg-migrate';

export function up(pgm: MigrationBuilder): void {
  pgm.addColumns('actresses', {
    aliases: { type: 'text[]', notNull: true, default: pgm.func("ARRAY[]::text[]") },
    target_new_releases: { type: 'boolean', notNull: true, default: true }, target_sales: { type: 'boolean', notNull: true, default: true },
    minimum_post_interval_hours: { type: 'integer', notNull: true, default: 24 }, weekly_post_limit: { type: 'integer', notNull: true, default: 2 }
  });
  pgm.addConstraint('actresses', 'actresses_name_not_blank_check', { check: "btrim(name) <> ''" });
  pgm.addConstraint('actresses', 'actresses_priority_check', { check: 'priority BETWEEN 0 AND 100' });
  pgm.addConstraint('actresses', 'actresses_minimum_post_interval_hours_check', { check: 'minimum_post_interval_hours >= 0' });
  pgm.addConstraint('actresses', 'actresses_weekly_post_limit_check', { check: 'weekly_post_limit >= 0' });
  pgm.createIndex('actresses', 'aliases', { name: 'actresses_aliases_gin_idx', method: 'gin' });
  pgm.sql("INSERT INTO actresses (name, priority) VALUES ('北岡果林', 100), ('依本しおり', 100) ON CONFLICT (name) DO NOTHING;");
}
export function down(pgm: MigrationBuilder): void {
  pgm.sql("DELETE FROM actresses WHERE name IN ('北岡果林', '依本しおり');");
  pgm.dropIndex('actresses', 'aliases', { name: 'actresses_aliases_gin_idx' });
  pgm.dropConstraint('actresses', 'actresses_weekly_post_limit_check'); pgm.dropConstraint('actresses', 'actresses_minimum_post_interval_hours_check'); pgm.dropConstraint('actresses', 'actresses_priority_check'); pgm.dropConstraint('actresses', 'actresses_name_not_blank_check');
  pgm.dropColumns('actresses', ['weekly_post_limit', 'minimum_post_interval_hours', 'target_sales', 'target_new_releases', 'aliases']);
}
