import type { MigrationBuilder } from 'node-pg-migrate';

export function up(pgm: MigrationBuilder): void {
  const timestampColumns = {
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('current_timestamp') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('current_timestamp') }
  };

  pgm.createTable('products', {
    id: { type: 'bigserial', primaryKey: true },
    fanza_product_id: { type: 'text', notNull: true, unique: true },
    title: { type: 'text', notNull: true },
    product_url: { type: 'text', notNull: true, unique: true },
    affiliate_url: { type: 'text' },
    sample_video_url: { type: 'text' },
    thumbnail_url: { type: 'text' },
    price: { type: 'numeric(12, 2)' },
    sale_price: { type: 'numeric(12, 2)' },
    is_sale: { type: 'boolean', notNull: true, default: false },
    release_date: { type: 'date' },
    status: { type: 'text', notNull: true, default: 'unknown' },
    ...timestampColumns
  });
  pgm.addConstraint('products', 'products_status_check', {
    check: "status IN ('unknown', 'available', 'unavailable', 'ended')"
  });

  pgm.createTable('actresses', {
    id: { type: 'bigserial', primaryKey: true },
    name: { type: 'text', notNull: true, unique: true },
    enabled: { type: 'boolean', notNull: true, default: true },
    priority: { type: 'integer', notNull: true, default: 0 },
    ...timestampColumns
  });

  pgm.createTable('product_actresses', {
    product_id: {
      type: 'bigint',
      notNull: true,
      primaryKey: true,
      references: 'products',
      onDelete: 'CASCADE'
    },
    actress_id: {
      type: 'bigint',
      notNull: true,
      primaryKey: true,
      references: 'actresses',
      onDelete: 'CASCADE'
    },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('current_timestamp') }
  });

  pgm.createTable('favorites', {
    id: { type: 'bigserial', primaryKey: true },
    product_id: {
      type: 'bigint',
      notNull: true,
      unique: true,
      references: 'products',
      onDelete: 'CASCADE'
    },
    synced_at: { type: 'timestamptz', notNull: true, default: pgm.func('current_timestamp') },
    ...timestampColumns
  });

  pgm.createTable('post_history', {
    id: { type: 'bigserial', primaryKey: true },
    product_id: {
      type: 'bigint',
      notNull: true,
      references: 'products',
      onDelete: 'RESTRICT'
    },
    x_post_id: { type: 'text', unique: true },
    posted_at: { type: 'timestamptz', notNull: true, default: pgm.func('current_timestamp') },
    post_type: { type: 'text', notNull: true },
    ...timestampColumns
  });
  pgm.addConstraint('post_history', 'post_history_post_type_check', {
    check: "post_type IN ('parent', 'reply')"
  });

  pgm.createTable('settings', {
    key: { type: 'text', primaryKey: true },
    value: { type: 'jsonb', notNull: true, default: pgm.func("'{}'::jsonb") },
    ...timestampColumns
  });

  pgm.createIndex('products', ['status', 'is_sale'], { name: 'products_status_is_sale_idx' });
  pgm.createIndex('products', 'release_date', { name: 'products_release_date_idx' });
  pgm.createIndex('actresses', ['enabled', 'priority'], { name: 'actresses_enabled_priority_idx' });
  pgm.createIndex('product_actresses', 'actress_id', { name: 'product_actresses_actress_id_idx' });
  pgm.createIndex('favorites', 'synced_at', { name: 'favorites_synced_at_idx' });
  pgm.createIndex('post_history', ['product_id', 'posted_at'], { name: 'post_history_product_id_posted_at_idx' });
  pgm.createIndex('post_history', 'posted_at', { name: 'post_history_posted_at_idx' });

  pgm.sql(`
    CREATE FUNCTION set_updated_at()
    RETURNS trigger AS $$
    BEGIN
      NEW.updated_at = current_timestamp;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    CREATE TRIGGER products_set_updated_at
    BEFORE UPDATE ON products
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

    CREATE TRIGGER actresses_set_updated_at
    BEFORE UPDATE ON actresses
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

    CREATE TRIGGER favorites_set_updated_at
    BEFORE UPDATE ON favorites
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

    CREATE TRIGGER post_history_set_updated_at
    BEFORE UPDATE ON post_history
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

    CREATE TRIGGER settings_set_updated_at
    BEFORE UPDATE ON settings
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);
}

export function down(pgm: MigrationBuilder): void {
  pgm.dropTable('post_history');
  pgm.dropTable('favorites');
  pgm.dropTable('product_actresses');
  pgm.dropTable('actresses');
  pgm.dropTable('products');
  pgm.dropTable('settings');
  pgm.sql('DROP FUNCTION set_updated_at();');
}
