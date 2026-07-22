import type { MigrationBuilder } from 'node-pg-migrate';

export function up(pgm: MigrationBuilder): void {
  pgm.createTable('product_sources', {
    id: { type: 'bigserial', primaryKey: true },
    product_id: { type: 'bigint', notNull: true, references: 'products', onDelete: 'CASCADE' },
    source_type: { type: 'text', notNull: true },
    source_reference: { type: 'text', notNull: true },
    first_seen_at: { type: 'timestamptz', notNull: true, default: pgm.func('current_timestamp') },
    last_seen_at: { type: 'timestamptz', notNull: true, default: pgm.func('current_timestamp') },
    active: { type: 'boolean', notNull: true, default: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('current_timestamp') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('current_timestamp') }
  });
  pgm.addConstraint('product_sources', 'product_sources_type_check', {
    check: "source_type IN ('actress', 'favorite', 'sale')"
  });
  pgm.addConstraint('product_sources', 'product_sources_reference_not_blank_check', {
    check: "btrim(source_reference) <> ''"
  });
  pgm.addConstraint('product_sources', 'product_sources_unique_observation', {
    unique: ['product_id', 'source_type', 'source_reference']
  });
  pgm.createIndex('product_sources', ['source_type', 'active', 'last_seen_at'], {
    name: 'product_sources_type_active_last_seen_idx'
  });
  pgm.createIndex('product_sources', 'product_id', { name: 'product_sources_product_id_idx' });
  pgm.sql(`
    CREATE TRIGGER product_sources_set_updated_at
    BEFORE UPDATE ON product_sources
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

    INSERT INTO product_sources (
      product_id, source_type, source_reference, first_seen_at, last_seen_at, active
    )
    SELECT
      f.product_id,
      'favorite',
      'manual-favorite-sync',
      LEAST(f.created_at, f.synced_at),
      GREATEST(f.updated_at, f.synced_at),
      true
    FROM favorites f
    ON CONFLICT (product_id, source_type, source_reference) DO NOTHING;

    INSERT INTO product_sources (
      product_id, source_type, source_reference, first_seen_at, last_seen_at, active
    )
    SELECT
      pa.product_id,
      'actress',
      'actress:' || pa.actress_id::text,
      pa.created_at,
      pa.created_at,
      true
    FROM product_actresses pa
    ON CONFLICT (product_id, source_type, source_reference) DO NOTHING;
  `);
}

export function down(pgm: MigrationBuilder): void {
  pgm.sql('DROP TRIGGER IF EXISTS product_sources_set_updated_at ON product_sources;');
  pgm.dropTable('product_sources');
}
