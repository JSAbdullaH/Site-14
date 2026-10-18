// src/touch/processor_worker.ts
import { parentPort, workerData } from "node:worker_threads";
import { Result as Result25 } from "better-result";

// src/util/ds_error.ts
import { TaggedError } from "better-result";

class DurableStreamsError extends TaggedError("DurableStreamsError")() {
}
function dsError(message, opts) {
  return new DurableStreamsError({
    message,
    ...opts?.cause !== undefined ? { cause: opts.cause } : {},
    ...opts?.code !== undefined ? { code: opts.code } : {}
  });
}

// src/db/schema.ts
var SCHEMA_VERSION = 24;
var DEFAULT_PRAGMAS_SQL = `
PRAGMA journal_mode = WAL;
PRAGMA synchronous = FULL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;
PRAGMA temp_store = MEMORY;
`;
var CREATE_TABLES_V4_SQL = `
CREATE TABLE IF NOT EXISTS streams (
  stream TEXT PRIMARY KEY,
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL,

  content_type TEXT NOT NULL,
  profile TEXT NULL,
  stream_seq TEXT NULL,
  closed INTEGER NOT NULL DEFAULT 0,
  closed_producer_id TEXT NULL,
  closed_producer_epoch INTEGER NULL,
  closed_producer_seq INTEGER NULL,
  ttl_seconds INTEGER NULL,

  epoch INTEGER NOT NULL,
  next_offset INTEGER NOT NULL,
  sealed_through INTEGER NOT NULL,
  uploaded_through INTEGER NOT NULL,
  uploaded_segment_count INTEGER NOT NULL DEFAULT 0,

  pending_rows INTEGER NOT NULL,
  pending_bytes INTEGER NOT NULL,

  -- Logical payload bytes ever appended to this stream and still part of its
  -- visible history on this node. This is the constant-time source for
  -- management endpoints such as /_details.
  logical_size_bytes INTEGER NOT NULL DEFAULT 0,

  -- Logical size of retained rows in the wal table for this stream (payload-only bytes).
  -- This is explicitly tracked because SQLite file size is high-water and does not shrink
  -- deterministically after DELETE-based GC/retention trimming.
  wal_rows INTEGER NOT NULL DEFAULT 0,
  wal_bytes INTEGER NOT NULL DEFAULT 0,

  last_append_ms INTEGER NOT NULL,
  last_segment_cut_ms INTEGER NOT NULL,
  segment_in_progress INTEGER NOT NULL,

  expires_at_ms INTEGER NULL,
  stream_flags INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS streams_pending_bytes_idx ON streams(pending_bytes);
CREATE INDEX IF NOT EXISTS streams_last_cut_idx ON streams(last_segment_cut_ms);
CREATE INDEX IF NOT EXISTS streams_inprog_pending_idx ON streams(segment_in_progress, pending_bytes, last_segment_cut_ms);

CREATE TABLE IF NOT EXISTS wal (
  id INTEGER PRIMARY KEY,
  stream TEXT NOT NULL,
  offset INTEGER NOT NULL,
  ts_ms INTEGER NOT NULL,
  payload BLOB NOT NULL,
  payload_len INTEGER NOT NULL,
  routing_key BLOB NULL,
  content_type TEXT NULL,
  flags INTEGER NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX IF NOT EXISTS wal_stream_offset_uniq ON wal(stream, offset);
CREATE INDEX IF NOT EXISTS wal_ts_idx ON wal(ts_ms);

CREATE TABLE IF NOT EXISTS segments (
  segment_id TEXT PRIMARY KEY,
  stream TEXT NOT NULL,
  segment_index INTEGER NOT NULL,
  start_offset INTEGER NOT NULL,
  end_offset INTEGER NOT NULL,
  block_count INTEGER NOT NULL,
  last_append_ms INTEGER NOT NULL,
  payload_bytes INTEGER NOT NULL DEFAULT 0,
  size_bytes INTEGER NOT NULL,
  local_path TEXT NOT NULL,
  created_at_ms INTEGER NOT NULL,
  uploaded_at_ms INTEGER NULL,
  r2_etag TEXT NULL
);

CREATE TABLE IF NOT EXISTS stream_segment_meta (
  stream TEXT PRIMARY KEY,
  segment_count INTEGER NOT NULL,
  segment_offsets BLOB NOT NULL,
  segment_blocks BLOB NOT NULL,
  segment_last_ts BLOB NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS segments_stream_index_uniq ON segments(stream, segment_index);
CREATE INDEX IF NOT EXISTS segments_stream_start_idx ON segments(stream, start_offset);
CREATE INDEX IF NOT EXISTS segments_pending_upload_idx ON segments(uploaded_at_ms);

CREATE TABLE IF NOT EXISTS manifests (
  stream TEXT PRIMARY KEY,
  generation INTEGER NOT NULL,
  uploaded_generation INTEGER NOT NULL,
  last_uploaded_at_ms INTEGER NULL,
  last_uploaded_etag TEXT NULL,
  last_uploaded_size_bytes INTEGER NULL
);

CREATE TABLE IF NOT EXISTS schemas (
  stream TEXT PRIMARY KEY,
  schema_json TEXT NOT NULL,
  updated_at_ms INTEGER NOT NULL,
  uploaded_size_bytes INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS stream_profiles (
  stream TEXT PRIMARY KEY,
  profile_json TEXT NOT NULL,
  updated_at_ms INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS producer_state (
  stream TEXT NOT NULL,
  producer_id TEXT NOT NULL,
  epoch INTEGER NOT NULL,
  last_seq INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL,
  PRIMARY KEY (stream, producer_id)
);

CREATE TABLE IF NOT EXISTS stream_touch_state (
  stream TEXT PRIMARY KEY,
  processed_through INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL
);

-- Live dynamic template registry (per base stream).
CREATE TABLE IF NOT EXISTS live_templates (
  stream TEXT NOT NULL,
  template_id TEXT NOT NULL,
  entity TEXT NOT NULL,
  fields_json TEXT NOT NULL,
  encodings_json TEXT NOT NULL,
  state TEXT NOT NULL,
  created_at_ms INTEGER NOT NULL,
  last_seen_at_ms INTEGER NOT NULL,
  inactivity_ttl_ms INTEGER NOT NULL,
  active_from_source_offset INTEGER NOT NULL,
  retired_at_ms INTEGER NULL,
  retired_reason TEXT NULL,
  PRIMARY KEY (stream, template_id)
);

CREATE INDEX IF NOT EXISTS live_templates_stream_entity_state_last_seen_idx
  ON live_templates(stream, entity, state, last_seen_at_ms);
CREATE INDEX IF NOT EXISTS live_templates_stream_state_last_seen_idx
  ON live_templates(stream, state, last_seen_at_ms);
`;
var CREATE_INDEX_TABLES_SQL = `
CREATE TABLE IF NOT EXISTS index_state (
  stream TEXT PRIMARY KEY,
  index_secret BLOB NOT NULL,
  indexed_through INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS index_runs (
  run_id TEXT PRIMARY KEY,
  stream TEXT NOT NULL,
  level INTEGER NOT NULL,
  start_segment INTEGER NOT NULL,
  end_segment INTEGER NOT NULL,
  object_key TEXT NOT NULL,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  filter_len INTEGER NOT NULL,
  record_count INTEGER NOT NULL,
  retired_gen INTEGER NULL,
  retired_at_ms INTEGER NULL
);

CREATE INDEX IF NOT EXISTS index_runs_stream_idx ON index_runs(stream, level, start_segment);
`;
var CREATE_SECONDARY_INDEX_TABLES_SQL = `
CREATE TABLE IF NOT EXISTS secondary_index_state (
  stream TEXT NOT NULL,
  index_name TEXT NOT NULL,
  index_secret BLOB NOT NULL,
  config_hash TEXT NOT NULL,
  indexed_through INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL,
  PRIMARY KEY (stream, index_name)
);

CREATE TABLE IF NOT EXISTS secondary_index_runs (
  run_id TEXT PRIMARY KEY,
  stream TEXT NOT NULL,
  index_name TEXT NOT NULL,
  level INTEGER NOT NULL,
  start_segment INTEGER NOT NULL,
  end_segment INTEGER NOT NULL,
  object_key TEXT NOT NULL,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  filter_len INTEGER NOT NULL,
  record_count INTEGER NOT NULL,
  retired_gen INTEGER NULL,
  retired_at_ms INTEGER NULL
);

CREATE INDEX IF NOT EXISTS secondary_index_runs_stream_idx
  ON secondary_index_runs(stream, index_name, level, start_segment);
`;
var CREATE_LEXICON_INDEX_TABLES_SQL = `
CREATE TABLE IF NOT EXISTS lexicon_index_state (
  stream TEXT NOT NULL,
  source_kind TEXT NOT NULL,
  source_name TEXT NOT NULL,
  indexed_through INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL,
  PRIMARY KEY (stream, source_kind, source_name)
);

CREATE TABLE IF NOT EXISTS lexicon_index_runs (
  run_id TEXT PRIMARY KEY,
  stream TEXT NOT NULL,
  source_kind TEXT NOT NULL,
  source_name TEXT NOT NULL,
  level INTEGER NOT NULL,
  start_segment INTEGER NOT NULL,
  end_segment INTEGER NOT NULL,
  object_key TEXT NOT NULL,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  record_count INTEGER NOT NULL,
  retired_gen INTEGER NULL,
  retired_at_ms INTEGER NULL
);

CREATE INDEX IF NOT EXISTS lexicon_index_runs_stream_idx
  ON lexicon_index_runs(stream, source_kind, source_name, level, start_segment);
`;
var CREATE_SEARCH_COMPANION_TABLES_SQL = `
CREATE TABLE IF NOT EXISTS search_companion_plans (
  stream TEXT PRIMARY KEY,
  generation INTEGER NOT NULL,
  plan_hash TEXT NOT NULL,
  plan_json TEXT NOT NULL,
  updated_at_ms INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS search_segment_companions (
  stream TEXT NOT NULL,
  segment_index INTEGER NOT NULL,
  object_key TEXT NOT NULL,
  plan_generation INTEGER NOT NULL,
  sections_json TEXT NOT NULL,
  section_sizes_json TEXT NOT NULL DEFAULT '{}',
  size_bytes INTEGER NOT NULL DEFAULT 0,
  primary_timestamp_min_ms INTEGER NULL,
  primary_timestamp_max_ms INTEGER NULL,
  updated_at_ms INTEGER NOT NULL,
  PRIMARY KEY (stream, segment_index)
);

CREATE INDEX IF NOT EXISTS search_segment_companions_stream_plan_idx
  ON search_segment_companions(stream, plan_generation, segment_index);
`;
var CREATE_OBJECTSTORE_REQUEST_TABLES_SQL = `
CREATE TABLE IF NOT EXISTS objectstore_request_counts (
  stream_hash TEXT NOT NULL,
  artifact TEXT NOT NULL,
  op TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  bytes INTEGER NOT NULL DEFAULT 0,
  updated_at_ms INTEGER NOT NULL,
  PRIMARY KEY (stream_hash, artifact, op)
);

CREATE INDEX IF NOT EXISTS objectstore_request_counts_stream_hash_idx
  ON objectstore_request_counts(stream_hash, updated_at_ms);
`;
var CREATE_TABLES_V4_SUFFIX_SQL = (suffix) => `
CREATE TABLE streams_${suffix} (
  stream TEXT PRIMARY KEY,
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL,

  content_type TEXT NOT NULL,
  stream_seq TEXT NULL,
  closed INTEGER NOT NULL DEFAULT 0,
  closed_producer_id TEXT NULL,
  closed_producer_epoch INTEGER NULL,
  closed_producer_seq INTEGER NULL,
  ttl_seconds INTEGER NULL,

  epoch INTEGER NOT NULL,
  next_offset INTEGER NOT NULL,
  sealed_through INTEGER NOT NULL,
  uploaded_through INTEGER NOT NULL,
  uploaded_segment_count INTEGER NOT NULL DEFAULT 0,

  pending_rows INTEGER NOT NULL,
  pending_bytes INTEGER NOT NULL,
  logical_size_bytes INTEGER NOT NULL DEFAULT 0,

  last_append_ms INTEGER NOT NULL,
  last_segment_cut_ms INTEGER NOT NULL,
  segment_in_progress INTEGER NOT NULL,

  expires_at_ms INTEGER NULL,
  stream_flags INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE wal_${suffix} (
  id INTEGER PRIMARY KEY,
  stream TEXT NOT NULL,
  offset INTEGER NOT NULL,
  ts_ms INTEGER NOT NULL,
  payload BLOB NOT NULL,
  payload_len INTEGER NOT NULL,
  routing_key BLOB NULL,
  content_type TEXT NULL,
  flags INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE segments_${suffix} (
  segment_id TEXT PRIMARY KEY,
  stream TEXT NOT NULL,
  segment_index INTEGER NOT NULL,
  start_offset INTEGER NOT NULL,
  end_offset INTEGER NOT NULL,
  block_count INTEGER NOT NULL,
  last_append_ms INTEGER NOT NULL,
  size_bytes INTEGER NOT NULL,
  local_path TEXT NOT NULL,
  created_at_ms INTEGER NOT NULL,
  uploaded_at_ms INTEGER NULL,
  r2_etag TEXT NULL
);

CREATE TABLE manifests_${suffix} (
  stream TEXT PRIMARY KEY,
  generation INTEGER NOT NULL,
  uploaded_generation INTEGER NOT NULL,
  last_uploaded_at_ms INTEGER NULL,
  last_uploaded_etag TEXT NULL
);

CREATE TABLE schemas_${suffix} (
  stream TEXT PRIMARY KEY,
  schema_json TEXT NOT NULL,
  updated_at_ms INTEGER NOT NULL
);

CREATE TABLE producer_state_${suffix} (
  stream TEXT NOT NULL,
  producer_id TEXT NOT NULL,
  epoch INTEGER NOT NULL,
  last_seq INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL,
  PRIMARY KEY (stream, producer_id)
);
`;
var CREATE_INDEXES_V4_SQL = `
CREATE UNIQUE INDEX IF NOT EXISTS wal_stream_offset_uniq ON wal(stream, offset);
CREATE INDEX IF NOT EXISTS wal_ts_idx ON wal(ts_ms);

CREATE INDEX IF NOT EXISTS streams_pending_bytes_idx ON streams(pending_bytes);
CREATE INDEX IF NOT EXISTS streams_last_cut_idx ON streams(last_segment_cut_ms);
CREATE INDEX IF NOT EXISTS streams_inprog_pending_idx ON streams(segment_in_progress, pending_bytes, last_segment_cut_ms);

CREATE UNIQUE INDEX IF NOT EXISTS segments_stream_index_uniq ON segments(stream, segment_index);
CREATE INDEX IF NOT EXISTS segments_stream_start_idx ON segments(stream, start_offset);
CREATE INDEX IF NOT EXISTS segments_pending_upload_idx ON segments(uploaded_at_ms);
`;
function initSchema(db, opts = {}) {
  db.exec(DEFAULT_PRAGMAS_SQL);
  if (opts.skipMigrations)
    return;
  db.exec(`CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL);`);
  const readSchemaVersion = () => {
    const row = db.query("SELECT version FROM schema_version LIMIT 1;").get();
    if (!row)
      return null;
    const raw = row.version;
    if (typeof raw === "bigint")
      return Number(raw);
    if (typeof raw === "number")
      return raw;
    return Number(raw);
  };
  const version0 = readSchemaVersion();
  if (version0 == null) {
    db.exec(CREATE_TABLES_V4_SQL);
    db.exec(CREATE_INDEX_TABLES_SQL);
    db.exec(CREATE_SECONDARY_INDEX_TABLES_SQL);
    db.exec(CREATE_LEXICON_INDEX_TABLES_SQL);
    db.exec(CREATE_SEARCH_COMPANION_TABLES_SQL);
    db.exec(CREATE_OBJECTSTORE_REQUEST_TABLES_SQL);
    db.query("INSERT INTO schema_version(version) VALUES (?);").run(SCHEMA_VERSION);
    return;
  }
  if (version0 === SCHEMA_VERSION)
    return;
  let version = version0;
  while (version !== SCHEMA_VERSION) {
    if (version === 1) {
      migrateV1ToV4(db);
    } else if (version === 2) {
      migrateV2ToV4(db);
    } else if (version === 3) {
      migrateV3ToV4(db);
    } else if (version === 4) {
      migrateV4ToV5(db);
    } else if (version === 5) {
      migrateV5ToV6(db);
    } else if (version === 6) {
      migrateV6ToV7(db);
    } else if (version === 7) {
      migrateV7ToV8(db);
    } else if (version === 8) {
      migrateV8ToV9(db);
    } else if (version === 9) {
      migrateV9ToV10(db);
    } else if (version === 10) {
      migrateV10ToV11(db);
    } else if (version === 11) {
      migrateV11ToV12(db);
    } else if (version === 12) {
      migrateV12ToV13(db);
    } else if (version === 13) {
      migrateV13ToV14(db);
    } else if (version === 14) {
      migrateV14ToV15(db);
    } else if (version === 15) {
      migrateV15ToV16(db);
    } else if (version === 16) {
      migrateV16ToV17(db);
    } else if (version === 17) {
      migrateV17ToV18(db);
    } else if (version === 18) {
      migrateV18ToV19(db);
    } else if (version === 19) {
      migrateV19ToV20(db);
    } else if (version === 20) {
      migrateV20ToV21(db);
    } else if (version === 21) {
      migrateV21ToV22(db);
    } else if (version === 22) {
      migrateV22ToV23(db);
    } else if (version === 23) {
      migrateV23ToV24(db);
    } else {
      throw dsError(`unexpected schema version: ${version} (expected ${SCHEMA_VERSION})`);
    }
    const next = readSchemaVersion();
    if (next == null)
      throw dsError("schema_version row missing after migration");
    version = next;
  }
}
function migrateV1ToV4(db) {
  const tx = db.transaction(() => {
    db.exec(CREATE_TABLES_V4_SUFFIX_SQL("v4"));
    db.exec(`
      INSERT INTO streams_v4(
        stream, created_at_ms, updated_at_ms,
        content_type, stream_seq, closed, closed_producer_id, closed_producer_epoch, closed_producer_seq, ttl_seconds,
        epoch,
        next_offset, sealed_through, uploaded_through,
        pending_rows, pending_bytes,
        last_append_ms, last_segment_cut_ms, segment_in_progress,
        expires_at_ms, stream_flags
      )
      SELECT
        stream,
        CAST(created_at_ns / 1000000 AS INTEGER),
        CAST(updated_at_ns / 1000000 AS INTEGER),
        'application/octet-stream',
        NULL,
        0,
        NULL,
        NULL,
        NULL,
        NULL,
        epoch,
        next_seq,
        sealed_through_seq,
        uploaded_through_seq,
        pending_rows,
        pending_bytes,
        CAST(last_append_ns / 1000000 AS INTEGER),
        CAST(last_segment_cut_ns / 1000000 AS INTEGER),
        segment_in_progress,
        CASE WHEN expires_at_ns IS NULL THEN NULL ELSE CAST(expires_at_ns / 1000000 AS INTEGER) END,
        CASE WHEN deleted != 0 THEN 1 ELSE 0 END
      FROM streams;
    `);
    db.exec(`
      INSERT INTO wal_v4(
        stream, offset, ts_ms, payload, payload_len, routing_key, content_type, flags
      )
      SELECT
        stream,
        seq,
        CAST(append_ns / 1000000 AS INTEGER),
        payload,
        payload_len,
        CASE WHEN routing_key IS NULL THEN NULL ELSE CAST(routing_key AS BLOB) END,
        CASE WHEN is_json != 0 THEN 'application/json' ELSE NULL END,
        0
      FROM wal;
    `);
    db.exec(`
      INSERT INTO segments_v4(
        segment_id, stream, segment_index, start_offset, end_offset, block_count,
        last_append_ms, size_bytes, local_path, created_at_ms, uploaded_at_ms, r2_etag
      )
      SELECT
        segment_id,
        stream,
        segment_index,
        start_seq,
        end_seq,
        block_count,
        CAST(last_append_ns / 1000000 AS INTEGER),
        size_bytes,
        local_path,
        CAST(created_at_ns / 1000000 AS INTEGER),
        CASE WHEN uploaded_at_ns IS NULL THEN NULL ELSE CAST(uploaded_at_ns / 1000000 AS INTEGER) END,
        NULL
      FROM segments;
    `);
    db.exec(`
      INSERT INTO manifests_v4(
        stream, generation, uploaded_generation, last_uploaded_at_ms, last_uploaded_etag
      )
      SELECT
        stream,
        generation,
        uploaded_generation,
        CASE WHEN last_uploaded_at_ns IS NULL THEN NULL ELSE CAST(last_uploaded_at_ns / 1000000 AS INTEGER) END,
        last_uploaded_etag
      FROM manifests;
    `);
    db.exec(`
      INSERT INTO schemas_v4(stream, schema_json, updated_at_ms)
      SELECT stream, schema_json, CAST(updated_at_ns / 1000000 AS INTEGER)
      FROM schemas;
    `);
    db.exec(`DROP TABLE wal;`);
    db.exec(`DROP TABLE streams;`);
    db.exec(`DROP TABLE segments;`);
    db.exec(`DROP TABLE manifests;`);
    db.exec(`DROP TABLE schemas;`);
    db.exec(`ALTER TABLE streams_v4 RENAME TO streams;`);
    db.exec(`ALTER TABLE wal_v4 RENAME TO wal;`);
    db.exec(`ALTER TABLE segments_v4 RENAME TO segments;`);
    db.exec(`ALTER TABLE manifests_v4 RENAME TO manifests;`);
    db.exec(`ALTER TABLE schemas_v4 RENAME TO schemas;`);
    db.exec(`ALTER TABLE producer_state_v4 RENAME TO producer_state;`);
    db.exec(CREATE_INDEXES_V4_SQL);
    db.exec(CREATE_INDEX_TABLES_SQL);
    db.exec(`UPDATE schema_version SET version = 4;`);
  });
  tx();
}
function migrateV2ToV4(db) {
  const tx = db.transaction(() => {
    db.exec(`ALTER TABLE segments ADD COLUMN block_count INTEGER NOT NULL DEFAULT 0;`);
    db.exec(`ALTER TABLE segments ADD COLUMN last_append_ms INTEGER NOT NULL DEFAULT 0;`);
    db.exec(`ALTER TABLE streams ADD COLUMN content_type TEXT NOT NULL DEFAULT 'application/octet-stream';`);
    db.exec(`ALTER TABLE streams ADD COLUMN stream_seq TEXT NULL;`);
    db.exec(`ALTER TABLE streams ADD COLUMN closed INTEGER NOT NULL DEFAULT 0;`);
    db.exec(`ALTER TABLE streams ADD COLUMN closed_producer_id TEXT NULL;`);
    db.exec(`ALTER TABLE streams ADD COLUMN closed_producer_epoch INTEGER NULL;`);
    db.exec(`ALTER TABLE streams ADD COLUMN closed_producer_seq INTEGER NULL;`);
    db.exec(`ALTER TABLE streams ADD COLUMN ttl_seconds INTEGER NULL;`);
    db.exec(`
      CREATE TABLE IF NOT EXISTS producer_state (
        stream TEXT NOT NULL,
        producer_id TEXT NOT NULL,
        epoch INTEGER NOT NULL,
        last_seq INTEGER NOT NULL,
        updated_at_ms INTEGER NOT NULL,
        PRIMARY KEY (stream, producer_id)
      );
    `);
    db.exec(CREATE_INDEX_TABLES_SQL);
    db.exec(`UPDATE schema_version SET version = 4;`);
  });
  tx();
}
function migrateV3ToV4(db) {
  const tx = db.transaction(() => {
    db.exec(`ALTER TABLE streams ADD COLUMN content_type TEXT NOT NULL DEFAULT 'application/octet-stream';`);
    db.exec(`ALTER TABLE streams ADD COLUMN stream_seq TEXT NULL;`);
    db.exec(`ALTER TABLE streams ADD COLUMN closed INTEGER NOT NULL DEFAULT 0;`);
    db.exec(`ALTER TABLE streams ADD COLUMN closed_producer_id TEXT NULL;`);
    db.exec(`ALTER TABLE streams ADD COLUMN closed_producer_epoch INTEGER NULL;`);
    db.exec(`ALTER TABLE streams ADD COLUMN closed_producer_seq INTEGER NULL;`);
    db.exec(`ALTER TABLE streams ADD COLUMN ttl_seconds INTEGER NULL;`);
    db.exec(`
      CREATE TABLE IF NOT EXISTS producer_state (
        stream TEXT NOT NULL,
        producer_id TEXT NOT NULL,
        epoch INTEGER NOT NULL,
        last_seq INTEGER NOT NULL,
        updated_at_ms INTEGER NOT NULL,
        PRIMARY KEY (stream, producer_id)
      );
    `);
    db.exec(CREATE_INDEX_TABLES_SQL);
    db.exec(`UPDATE schema_version SET version = 4;`);
  });
  tx();
}
function migrateV4ToV5(db) {
  const tx = db.transaction(() => {
    db.exec(CREATE_INDEX_TABLES_SQL);
    db.exec(`UPDATE schema_version SET version = 5;`);
  });
  tx();
}
function migrateV5ToV6(db) {
  const tx = db.transaction(() => {
    db.exec(`ALTER TABLE streams ADD COLUMN uploaded_segment_count INTEGER NOT NULL DEFAULT 0;`);
    db.exec(`
      CREATE TABLE IF NOT EXISTS stream_segment_meta (
        stream TEXT PRIMARY KEY,
        segment_count INTEGER NOT NULL,
        segment_offsets BLOB NOT NULL,
        segment_blocks BLOB NOT NULL,
        segment_last_ts BLOB NOT NULL
      );
    `);
    db.exec(`UPDATE schema_version SET version = 6;`);
  });
  tx();
}
function migrateV6ToV7(db) {
  const tx = db.transaction(() => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS stream_touch_state (
        stream TEXT PRIMARY KEY,
        processed_through INTEGER NOT NULL,
        updated_at_ms INTEGER NOT NULL
      );
    `);
    db.exec(`UPDATE schema_version SET version = 7;`);
  });
  tx();
}
function migrateV7ToV8(db) {
  const tx = db.transaction(() => {
    db.exec(`UPDATE schema_version SET version = 8;`);
  });
  tx();
}
function migrateV8ToV9(db) {
  const tx = db.transaction(() => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS live_templates (
        stream TEXT NOT NULL,
        template_id TEXT NOT NULL,
        entity TEXT NOT NULL,
        fields_json TEXT NOT NULL,
        encodings_json TEXT NOT NULL,
        state TEXT NOT NULL,
        created_at_ms INTEGER NOT NULL,
        last_seen_at_ms INTEGER NOT NULL,
        inactivity_ttl_ms INTEGER NOT NULL,
        active_from_source_offset INTEGER NOT NULL,
        retired_at_ms INTEGER NULL,
        retired_reason TEXT NULL,
        PRIMARY KEY (stream, template_id)
      );
    `);
    db.exec(`
      CREATE INDEX IF NOT EXISTS live_templates_stream_entity_state_last_seen_idx
        ON live_templates(stream, entity, state, last_seen_at_ms);
    `);
    db.exec(`
      CREATE INDEX IF NOT EXISTS live_templates_stream_state_last_seen_idx
        ON live_templates(stream, state, last_seen_at_ms);
    `);
    db.exec(`UPDATE schema_version SET version = 9;`);
  });
  tx();
}
function migrateV9ToV10(db) {
  const tx = db.transaction(() => {
    db.exec(`ALTER TABLE streams ADD COLUMN wal_rows INTEGER NOT NULL DEFAULT 0;`);
    db.exec(`ALTER TABLE streams ADD COLUMN wal_bytes INTEGER NOT NULL DEFAULT 0;`);
    db.exec(`DROP TABLE IF EXISTS temp.wal_stats;`);
    db.exec(`
      CREATE TEMP TABLE wal_stats AS
      SELECT stream, COUNT(*) as rows, COALESCE(SUM(payload_len), 0) as bytes
      FROM wal
      GROUP BY stream;
    `);
    db.exec(`
      UPDATE streams
      SET wal_rows = COALESCE((SELECT rows FROM wal_stats WHERE wal_stats.stream = streams.stream), 0),
          wal_bytes = COALESCE((SELECT bytes FROM wal_stats WHERE wal_stats.stream = streams.stream), 0);
    `);
    db.exec(`DROP TABLE wal_stats;`);
    db.exec(`UPDATE schema_version SET version = 10;`);
  });
  tx();
}
function migrateV10ToV11(db) {
  const tx = db.transaction(() => {
    db.exec(`DROP INDEX IF EXISTS wal_touch_stream_rk_offset_idx;`);
    db.exec(`UPDATE schema_version SET version = 11;`);
  });
  tx();
}
function migrateV11ToV12(db) {
  const tx = db.transaction(() => {
    db.exec(`ALTER TABLE streams ADD COLUMN profile TEXT NULL;`);
    db.exec(`UPDATE schema_version SET version = 12;`);
  });
  tx();
}
function migrateV12ToV13(db) {
  const tx = db.transaction(() => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS stream_profiles (
        stream TEXT PRIMARY KEY,
        profile_json TEXT NOT NULL,
        updated_at_ms INTEGER NOT NULL
      );
    `);
    db.exec(`UPDATE schema_version SET version = 13;`);
  });
  tx();
}
function migrateV13ToV14(db) {
  const tx = db.transaction(() => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS stream_touch_state (
        stream TEXT PRIMARY KEY,
        processed_through INTEGER NOT NULL,
        updated_at_ms INTEGER NOT NULL
      );
    `);
    const hasLegacy = !!db.query(`SELECT name FROM sqlite_master WHERE type='table' AND name='stream_interpreters' LIMIT 1;`).get();
    if (hasLegacy) {
      db.exec(`
        INSERT OR REPLACE INTO stream_touch_state(stream, processed_through, updated_at_ms)
        SELECT stream, interpreted_through, updated_at_ms
        FROM stream_interpreters;
      `);
      db.exec(`DROP TABLE stream_interpreters;`);
    }
    db.exec(`UPDATE schema_version SET version = ${SCHEMA_VERSION};`);
  });
  tx();
}
function migrateV14ToV15(db) {
  const tx = db.transaction(() => {
    db.exec(CREATE_SECONDARY_INDEX_TABLES_SQL);
    db.exec(`UPDATE schema_version SET version = 15;`);
  });
  tx();
}
function migrateV15ToV16(db) {
  const tx = db.transaction(() => {
    db.exec(`UPDATE schema_version SET version = 16;`);
  });
  tx();
}
function migrateV16ToV17(db) {
  const tx = db.transaction(() => {
    db.exec(`ALTER TABLE streams ADD COLUMN logical_size_bytes INTEGER NOT NULL DEFAULT 0;`);
    db.exec(`
      UPDATE streams
      SET logical_size_bytes = wal_bytes
      WHERE next_offset = wal_rows;
    `);
    db.exec(`UPDATE schema_version SET version = 17;`);
  });
  tx();
}
function migrateV17ToV18(db) {
  const tx = db.transaction(() => {
    db.exec(CREATE_SEARCH_COMPANION_TABLES_SQL);
    db.exec(`UPDATE schema_version SET version = 18;`);
  });
  tx();
}
function migrateV18ToV19(db) {
  const tx = db.transaction(() => {
    db.exec(`ALTER TABLE secondary_index_state ADD COLUMN config_hash TEXT NOT NULL DEFAULT '';`);
    db.exec(`DROP INDEX IF EXISTS search_family_segments_stream_idx;`);
    db.exec(`DROP TABLE IF EXISTS search_family_segments;`);
    db.exec(`DROP TABLE IF EXISTS search_family_state;`);
    db.exec(`UPDATE schema_version SET version = 19;`);
  });
  tx();
}
function migrateV19ToV20(db) {
  const tx = db.transaction(() => {
    db.exec(`ALTER TABLE manifests ADD COLUMN last_uploaded_size_bytes INTEGER NULL;`);
    db.exec(`ALTER TABLE schemas ADD COLUMN uploaded_size_bytes INTEGER NOT NULL DEFAULT 0;`);
    db.exec(`ALTER TABLE index_runs ADD COLUMN size_bytes INTEGER NOT NULL DEFAULT 0;`);
    db.exec(`ALTER TABLE secondary_index_runs ADD COLUMN size_bytes INTEGER NOT NULL DEFAULT 0;`);
    db.exec(`ALTER TABLE search_segment_companions ADD COLUMN section_sizes_json TEXT NOT NULL DEFAULT '{}';`);
    db.exec(`ALTER TABLE search_segment_companions ADD COLUMN size_bytes INTEGER NOT NULL DEFAULT 0;`);
    db.exec(CREATE_OBJECTSTORE_REQUEST_TABLES_SQL);
    db.exec(`UPDATE schema_version SET version = 20;`);
  });
  tx();
}
function migrateV20ToV21(db) {
  const tx = db.transaction(() => {
    db.exec(`ALTER TABLE search_segment_companions ADD COLUMN primary_timestamp_min_ms INTEGER NULL;`);
    db.exec(`ALTER TABLE search_segment_companions ADD COLUMN primary_timestamp_max_ms INTEGER NULL;`);
    db.exec(`UPDATE schema_version SET version = 21;`);
  });
  tx();
}
function migrateV21ToV22(db) {
  const tx = db.transaction(() => {
    db.exec(CREATE_LEXICON_INDEX_TABLES_SQL);
    db.exec(`UPDATE schema_version SET version = 22;`);
  });
  tx();
}
function migrateV22ToV23(db) {
  const tx = db.transaction(() => {
    db.exec(`DROP INDEX IF EXISTS wal_stream_offset_idx;`);
    db.exec(`UPDATE schema_version SET version = 23;`);
  });
  tx();
}
function migrateV23ToV24(db) {
  const tx = db.transaction(() => {
    const hasPayloadBytes = db.query(`PRAGMA table_info(segments);`).all().some((row) => String(row.name) === "payload_bytes");
    if (!hasPayloadBytes) {
      db.exec(`ALTER TABLE segments ADD COLUMN payload_bytes INTEGER NOT NULL DEFAULT 0;`);
    }
    db.exec(`UPDATE schema_version SET version = 24;`);
  });
  tx();
}

// src/sqlite/adapter.ts
import { createRequire } from "node:module";

// src/runtime/host_runtime.ts
function detectHostRuntime() {
  return typeof globalThis.Bun !== "undefined" || Boolean(process.versions?.bun) ? "bun" : "node";
}

// src/sqlite/adapter.ts
var sqliteAdapterRuntimeCounts = {
  open_connections: 0,
  prepared_statements: 0
};
function incrementSqliteConnection() {
  sqliteAdapterRuntimeCounts.open_connections += 1;
}
function decrementSqliteConnection() {
  sqliteAdapterRuntimeCounts.open_connections = Math.max(0, sqliteAdapterRuntimeCounts.open_connections - 1);
}
function incrementPreparedStatement() {
  sqliteAdapterRuntimeCounts.prepared_statements += 1;
}
function decrementPreparedStatement() {
  sqliteAdapterRuntimeCounts.prepared_statements = Math.max(0, sqliteAdapterRuntimeCounts.prepared_statements - 1);
}
class BunStatementAdapter {
  stmt;
  onFinalize;
  finalized = false;
  constructor(stmt, onFinalize) {
    this.stmt = stmt;
    this.onFinalize = onFinalize;
  }
  get(...params) {
    return this.stmt.get(...params);
  }
  all(...params) {
    return this.stmt.all(...params);
  }
  run(...params) {
    return this.stmt.run(...params);
  }
  iterate(...params) {
    return this.stmt.iterate(...params);
  }
  finalize() {
    if (this.finalized)
      return;
    this.finalized = true;
    try {
      if (typeof this.stmt.finalize === "function")
        this.stmt.finalize();
    } finally {
      this.onFinalize?.();
    }
  }
}

class BunDatabaseAdapter {
  db;
  preparedStatementCount = 0;
  closed = false;
  statementCache = new Map;
  constructor(db) {
    this.db = db;
    incrementSqliteConnection();
  }
  trackStatement() {
    let released = false;
    this.preparedStatementCount += 1;
    incrementPreparedStatement();
    return () => {
      if (released)
        return;
      released = true;
      this.preparedStatementCount = Math.max(0, this.preparedStatementCount - 1);
      decrementPreparedStatement();
    };
  }
  exec(sql) {
    this.db.exec(sql);
  }
  prepare(sql) {
    return new BunStatementAdapter(this.db.query(sql), this.trackStatement());
  }
  query(sql) {
    const cached = this.statementCache.get(sql);
    if (cached)
      return cached;
    let adapter;
    const release = this.trackStatement();
    adapter = new BunStatementAdapter(this.db.query(sql), () => {
      this.statementCache.delete(sql);
      release();
    });
    this.statementCache.set(sql, adapter);
    return adapter;
  }
  transaction(fn) {
    return this.db.transaction(fn);
  }
  close() {
    if (this.closed)
      return;
    this.closed = true;
    const cachedStatements = Array.from(this.statementCache.values());
    this.statementCache.clear();
    for (const stmt of cachedStatements) {
      try {
        stmt.finalize?.();
      } catch {}
    }
    while (this.preparedStatementCount > 0) {
      this.preparedStatementCount -= 1;
      decrementPreparedStatement();
    }
    try {
      this.db.close();
    } finally {
      decrementSqliteConnection();
    }
  }
}

class NodeStatementAdapter {
  stmt;
  onFinalize;
  finalized = false;
  constructor(stmt, onFinalize) {
    this.stmt = stmt;
    this.onFinalize = onFinalize;
  }
  get(...params) {
    return this.stmt.get(...params);
  }
  all(...params) {
    return this.stmt.all(...params);
  }
  run(...params) {
    return this.stmt.run(...params);
  }
  iterate(...params) {
    return this.stmt.iterate(...params);
  }
  finalize() {
    if (this.finalized)
      return;
    this.finalized = true;
    try {
      if (typeof this.stmt.finalize === "function")
        this.stmt.finalize();
    } finally {
      this.onFinalize?.();
    }
  }
}

class NodeDatabaseAdapter {
  txDepth = 0;
  txCounter = 0;
  db;
  preparedStatementCount = 0;
  closed = false;
  statementCache = new Map;
  constructor(db) {
    this.db = db;
    incrementSqliteConnection();
  }
  trackStatement() {
    let released = false;
    this.preparedStatementCount += 1;
    incrementPreparedStatement();
    return () => {
      if (released)
        return;
      released = true;
      this.preparedStatementCount = Math.max(0, this.preparedStatementCount - 1);
      decrementPreparedStatement();
    };
  }
  exec(sql) {
    this.db.exec(sql);
  }
  prepare(sql) {
    const stmt = this.db.prepare(sql);
    if (typeof stmt?.setReadBigInts === "function")
      stmt.setReadBigInts(true);
    return new NodeStatementAdapter(stmt, this.trackStatement());
  }
  query(sql) {
    const cached = this.statementCache.get(sql);
    if (cached)
      return cached;
    const stmt = this.db.prepare(sql);
    if (typeof stmt?.setReadBigInts === "function")
      stmt.setReadBigInts(true);
    let adapter;
    const release = this.trackStatement();
    adapter = new NodeStatementAdapter(stmt, () => {
      this.statementCache.delete(sql);
      release();
    });
    this.statementCache.set(sql, adapter);
    return adapter;
  }
  transaction(fn) {
    return () => {
      const nested = this.txDepth > 0;
      const savepoint = `ds_tx_${++this.txCounter}`;
      this.txDepth += 1;
      try {
        if (nested)
          this.db.exec(`SAVEPOINT ${savepoint};`);
        else
          this.db.exec("BEGIN;");
        const out = fn();
        if (nested)
          this.db.exec(`RELEASE SAVEPOINT ${savepoint};`);
        else
          this.db.exec("COMMIT;");
        return out;
      } catch (err) {
        try {
          if (nested) {
            this.db.exec(`ROLLBACK TO SAVEPOINT ${savepoint};`);
            this.db.exec(`RELEASE SAVEPOINT ${savepoint};`);
          } else {
            this.db.exec("ROLLBACK;");
          }
        } catch {}
        throw err;
      } finally {
        this.txDepth = Math.max(0, this.txDepth - 1);
      }
    };
  }
  close() {
    if (this.closed)
      return;
    this.closed = true;
    const cachedStatements = Array.from(this.statementCache.values());
    this.statementCache.clear();
    for (const stmt of cachedStatements) {
      try {
        stmt.finalize?.();
      } catch {}
    }
    while (this.preparedStatementCount > 0) {
      this.preparedStatementCount -= 1;
      decrementPreparedStatement();
    }
    try {
      this.db.close();
    } finally {
      decrementSqliteConnection();
    }
  }
}
var openImpl = null;
var openImplRuntime = null;
var runtimeOverride = null;
var require2 = createRequire(import.meta.url);
function selectedRuntime() {
  return runtimeOverride ?? detectHostRuntime();
}
function buildOpenImpl(runtime) {
  if (runtime === "bun") {
    const { Database } = require2("bun:sqlite");
    return (path) => new BunDatabaseAdapter(new Database(path));
  }
  const { DatabaseSync } = require2("node:sqlite");
  return (path) => new NodeDatabaseAdapter(new DatabaseSync(path));
}
function setSqliteRuntimeOverride(runtime) {
  runtimeOverride = runtime;
  if (runtimeOverride && openImplRuntime && runtimeOverride !== openImplRuntime) {
    openImpl = null;
    openImplRuntime = null;
  }
}
function openSqliteDatabase(path) {
  const runtime = selectedRuntime();
  if (!openImpl || openImplRuntime !== runtime) {
    openImpl = buildOpenImpl(runtime);
    openImplRuntime = runtime;
  }
  if (!openImpl)
    throw dsError("sqlite adapter not initialized");
  return openImpl(path);
}

// src/db/db.ts
import { Result } from "better-result";
var STREAM_FLAG_DELETED = 1 << 0;
var STREAM_FLAG_TOUCH = 1 << 1;
var BASE_WAL_GC_CHUNK_OFFSETS = (() => {
  const raw = process.env.DS_BASE_WAL_GC_CHUNK_OFFSETS;
  if (raw == null || raw.trim() === "")
    return 1e6;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0)
    return 1e6;
  return Math.floor(n);
})();

class SqliteDurableStore {
  db;
  dbstatReady = null;
  stmts;
  constructor(path, opts = {}) {
    this.db = openSqliteDatabase(path);
    initSchema(this.db, { skipMigrations: opts.skipMigrations });
    if (opts.cacheBytes && opts.cacheBytes > 0) {
      const kb = Math.max(1, Math.floor(opts.cacheBytes / 1024));
      this.db.exec(`PRAGMA cache_size = -${kb};`);
    }
    this.stmts = {
      getStream: this.db.query(`SELECT stream, created_at_ms, updated_at_ms,
                content_type, profile, stream_seq, closed, closed_producer_id, closed_producer_epoch, closed_producer_seq, ttl_seconds,
                epoch, next_offset, sealed_through, uploaded_through, uploaded_segment_count,
                pending_rows, pending_bytes, logical_size_bytes, wal_rows, wal_bytes, last_append_ms, last_segment_cut_ms, segment_in_progress,
                expires_at_ms, stream_flags
         FROM streams WHERE stream = ? LIMIT 1;`),
      upsertStream: this.db.query(`INSERT INTO streams(stream, created_at_ms, updated_at_ms,
                             content_type, profile, stream_seq, closed, closed_producer_id, closed_producer_epoch, closed_producer_seq, ttl_seconds,
                             epoch, next_offset, sealed_through, uploaded_through, uploaded_segment_count,
                             pending_rows, pending_bytes, logical_size_bytes, wal_rows, wal_bytes, last_append_ms, last_segment_cut_ms, segment_in_progress,
                             expires_at_ms, stream_flags)
         VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(stream) DO UPDATE SET
           updated_at_ms=excluded.updated_at_ms,
           expires_at_ms=excluded.expires_at_ms,
           ttl_seconds=excluded.ttl_seconds,
           content_type=excluded.content_type,
           profile=excluded.profile,
           stream_flags=excluded.stream_flags;`),
      listStreams: this.db.query(`SELECT stream, created_at_ms, updated_at_ms,
                content_type, profile, stream_seq, closed, closed_producer_id, closed_producer_epoch, closed_producer_seq, ttl_seconds,
                epoch, next_offset, sealed_through, uploaded_through, uploaded_segment_count,
                pending_rows, pending_bytes, logical_size_bytes, wal_rows, wal_bytes, last_append_ms, last_segment_cut_ms, segment_in_progress,
                expires_at_ms, stream_flags
         FROM streams
         WHERE (stream_flags & ?) = 0
           AND (expires_at_ms IS NULL OR expires_at_ms > ?)
         ORDER BY stream
         LIMIT ? OFFSET ?;`),
      listDeletedStreams: this.db.query(`SELECT stream
         FROM streams
         WHERE (stream_flags & ?) != 0
         ORDER BY stream
         LIMIT ? OFFSET ?;`),
      setDeleted: this.db.query(`UPDATE streams SET stream_flags = (stream_flags | ?), updated_at_ms=? WHERE stream=?;`),
      setStreamProfile: this.db.query(`UPDATE streams SET profile=?, updated_at_ms=? WHERE stream=?;`),
      insertWal: this.db.query(`INSERT INTO wal(stream, offset, ts_ms, payload, payload_len, routing_key, content_type, flags)
         VALUES(?, ?, ?, ?, ?, ?, ?, ?);`),
      updateStreamAppend: this.db.query(`UPDATE streams
         SET next_offset = ?, updated_at_ms = ?, last_append_ms = ?,
             pending_rows = pending_rows + ?, pending_bytes = pending_bytes + ?,
             logical_size_bytes = logical_size_bytes + ?,
             wal_rows = wal_rows + ?, wal_bytes = wal_bytes + ?
         WHERE stream = ? AND (stream_flags & ?) = 0;`),
      updateStreamAppendSeqCheck: this.db.query(`UPDATE streams
         SET next_offset = ?, updated_at_ms = ?, last_append_ms = ?,
             pending_rows = pending_rows + ?, pending_bytes = pending_bytes + ?,
             logical_size_bytes = logical_size_bytes + ?,
             wal_rows = wal_rows + ?, wal_bytes = wal_bytes + ?
         WHERE stream = ? AND (stream_flags & ?) = 0 AND next_offset = ?;`),
      candidateStreams: this.db.query(`SELECT stream, pending_bytes, pending_rows, last_segment_cut_ms, sealed_through, next_offset, epoch
         FROM streams
         WHERE (stream_flags & ?) = 0
           AND segment_in_progress = 0
           AND (pending_bytes >= ? OR pending_rows >= ? OR (? - last_segment_cut_ms) >= ?)
         ORDER BY pending_bytes DESC
         LIMIT ?;`),
      candidateStreamsNoInterval: this.db.query(`SELECT stream, pending_bytes, pending_rows, last_segment_cut_ms, sealed_through, next_offset, epoch
         FROM streams
         WHERE (stream_flags & ?) = 0
           AND segment_in_progress = 0
           AND (pending_bytes >= ? OR pending_rows >= ?)
         ORDER BY pending_bytes DESC
         LIMIT ?;`),
      listExpiredStreams: this.db.query(`SELECT stream
         FROM streams
         WHERE (stream_flags & ?) = 0
           AND expires_at_ms IS NOT NULL
           AND expires_at_ms <= ?
         ORDER BY expires_at_ms ASC
         LIMIT ?;`),
      streamWalRange: this.db.query(`SELECT offset, ts_ms, routing_key, content_type, payload
         FROM wal
         WHERE stream = ? AND offset >= ? AND offset <= ?
         ORDER BY offset ASC;`),
      streamWalRangeByKey: this.db.query(`SELECT offset, ts_ms, routing_key, content_type, payload
         FROM wal
         WHERE stream = ? AND offset >= ? AND offset <= ? AND routing_key = ?
         ORDER BY offset ASC;`),
      streamWalRangeDesc: this.db.query(`SELECT offset, ts_ms, routing_key, content_type, payload
         FROM wal
         WHERE stream = ? AND offset >= ? AND offset <= ?
         ORDER BY offset DESC;`),
      streamWalRangeDescByKey: this.db.query(`SELECT offset, ts_ms, routing_key, content_type, payload
         FROM wal
         WHERE stream = ? AND offset >= ? AND offset <= ? AND routing_key = ?
         ORDER BY offset DESC;`),
      createSegment: this.db.query(`INSERT INTO segments(segment_id, stream, segment_index, start_offset, end_offset, block_count,
                              last_append_ms, payload_bytes, size_bytes, local_path, created_at_ms, uploaded_at_ms, r2_etag)
         VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL);`),
      listSegmentsForStream: this.db.query(`SELECT segment_id, stream, segment_index, start_offset, end_offset, block_count, last_append_ms, payload_bytes, size_bytes,
                local_path, created_at_ms, uploaded_at_ms, r2_etag
         FROM segments WHERE stream=? ORDER BY segment_index ASC;`),
      getSegmentByIndex: this.db.query(`SELECT segment_id, stream, segment_index, start_offset, end_offset, block_count, last_append_ms, payload_bytes, size_bytes,
                local_path, created_at_ms, uploaded_at_ms, r2_etag
         FROM segments WHERE stream=? AND segment_index=? LIMIT 1;`),
      findSegmentForOffset: this.db.query(`SELECT segment_id, stream, segment_index, start_offset, end_offset, block_count, last_append_ms, payload_bytes, size_bytes,
                local_path, created_at_ms, uploaded_at_ms, r2_etag
         FROM segments
         WHERE stream=? AND start_offset <= ? AND end_offset >= ?
         ORDER BY segment_index DESC
         LIMIT 1;`),
      nextSegmentIndex: this.db.query(`SELECT COALESCE(MAX(segment_index)+1, 0) as next_idx FROM segments WHERE stream=?;`),
      markSegmentUploaded: this.db.query(`UPDATE segments SET r2_etag=?, uploaded_at_ms=? WHERE segment_id=?;`),
      pendingUploadHeads: this.db.query(`SELECT segment_id, stream, segment_index, start_offset, end_offset, block_count, last_append_ms, payload_bytes, size_bytes,
                local_path, created_at_ms, uploaded_at_ms, r2_etag
         FROM segments s
         WHERE s.uploaded_at_ms IS NULL
           AND s.segment_index = (
             SELECT MIN(s2.segment_index)
             FROM segments s2
             WHERE s2.stream = s.stream AND s2.uploaded_at_ms IS NULL
           )
         ORDER BY s.created_at_ms ASC, s.stream ASC
         LIMIT ?;`),
      recentSegmentCompressionWindow: this.db.query(`SELECT
           COALESCE(SUM(payload_bytes), 0) AS payload_total,
           COALESCE(SUM(size_bytes), 0) AS size_total,
           COUNT(*) AS cnt
         FROM (
           SELECT payload_bytes, size_bytes
           FROM segments
           WHERE stream=? AND payload_bytes > 0
           ORDER BY segment_index DESC
           LIMIT ?
         );`),
      countPendingSegments: this.db.query(`SELECT COUNT(*) as cnt FROM segments WHERE uploaded_at_ms IS NULL;`),
      countSegmentsForStream: this.db.query(`SELECT COUNT(*) as cnt FROM segments WHERE stream=?;`),
      tryClaimSegment: this.db.query(`UPDATE streams SET segment_in_progress=1, updated_at_ms=? WHERE stream=? AND segment_in_progress=0;`),
      getManifest: this.db.query(`SELECT stream, generation, uploaded_generation, last_uploaded_at_ms, last_uploaded_etag, last_uploaded_size_bytes
         FROM manifests WHERE stream=? LIMIT 1;`),
      upsertManifest: this.db.query(`INSERT INTO manifests(stream, generation, uploaded_generation, last_uploaded_at_ms, last_uploaded_etag, last_uploaded_size_bytes)
         VALUES(?, ?, ?, ?, ?, ?)
         ON CONFLICT(stream) DO UPDATE SET
           generation=excluded.generation,
           uploaded_generation=excluded.uploaded_generation,
           last_uploaded_at_ms=excluded.last_uploaded_at_ms,
           last_uploaded_etag=excluded.last_uploaded_etag,
           last_uploaded_size_bytes=excluded.last_uploaded_size_bytes;`),
      getIndexState: this.db.query(`SELECT stream, index_secret, indexed_through, updated_at_ms
         FROM index_state WHERE stream=? LIMIT 1;`),
      upsertIndexState: this.db.query(`INSERT INTO index_state(stream, index_secret, indexed_through, updated_at_ms)
         VALUES(?, ?, ?, ?)
         ON CONFLICT(stream) DO UPDATE SET
           index_secret=excluded.index_secret,
           indexed_through=excluded.indexed_through,
           updated_at_ms=excluded.updated_at_ms;`),
      updateIndexedThrough: this.db.query(`UPDATE index_state SET indexed_through=?, updated_at_ms=? WHERE stream=?;`),
      listIndexRuns: this.db.query(`SELECT run_id, stream, level, start_segment, end_segment, object_key, size_bytes, filter_len, record_count, retired_gen, retired_at_ms
         FROM index_runs WHERE stream=? AND retired_gen IS NULL
         ORDER BY start_segment ASC, level ASC;`),
      listIndexRunsAll: this.db.query(`SELECT run_id, stream, level, start_segment, end_segment, object_key, size_bytes, filter_len, record_count, retired_gen, retired_at_ms
         FROM index_runs WHERE stream=?
         ORDER BY start_segment ASC, level ASC;`),
      listRetiredIndexRuns: this.db.query(`SELECT run_id, stream, level, start_segment, end_segment, object_key, size_bytes, filter_len, record_count, retired_gen, retired_at_ms
         FROM index_runs WHERE stream=? AND retired_gen IS NOT NULL
         ORDER BY retired_at_ms ASC;`),
      insertIndexRun: this.db.query(`INSERT OR IGNORE INTO index_runs(run_id, stream, level, start_segment, end_segment, object_key, size_bytes, filter_len, record_count, retired_gen, retired_at_ms)
         VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL);`),
      retireIndexRun: this.db.query(`UPDATE index_runs SET retired_gen=?, retired_at_ms=? WHERE run_id=?;`),
      deleteIndexRun: this.db.query(`DELETE FROM index_runs WHERE run_id=?;`),
      deleteIndexStateForStream: this.db.query(`DELETE FROM index_state WHERE stream=?;`),
      deleteIndexRunsForStream: this.db.query(`DELETE FROM index_runs WHERE stream=?;`),
      getSecondaryIndexState: this.db.query(`SELECT stream, index_name, index_secret, config_hash, indexed_through, updated_at_ms
         FROM secondary_index_state WHERE stream=? AND index_name=? LIMIT 1;`),
      listSecondaryIndexStates: this.db.query(`SELECT stream, index_name, index_secret, config_hash, indexed_through, updated_at_ms
         FROM secondary_index_state WHERE stream=?
         ORDER BY index_name ASC;`),
      upsertSecondaryIndexState: this.db.query(`INSERT INTO secondary_index_state(stream, index_name, index_secret, config_hash, indexed_through, updated_at_ms)
         VALUES(?, ?, ?, ?, ?, ?)
         ON CONFLICT(stream, index_name) DO UPDATE SET
           index_secret=excluded.index_secret,
           config_hash=excluded.config_hash,
           indexed_through=excluded.indexed_through,
           updated_at_ms=excluded.updated_at_ms;`),
      updateSecondaryIndexedThrough: this.db.query(`UPDATE secondary_index_state
         SET indexed_through=?, updated_at_ms=?
         WHERE stream=? AND index_name=?;`),
      listSecondaryIndexRuns: this.db.query(`SELECT run_id, stream, index_name, level, start_segment, end_segment, object_key, size_bytes, filter_len, record_count, retired_gen, retired_at_ms
         FROM secondary_index_runs
         WHERE stream=? AND index_name=? AND retired_gen IS NULL
         ORDER BY start_segment ASC, level ASC;`),
      listSecondaryIndexRunsAll: this.db.query(`SELECT run_id, stream, index_name, level, start_segment, end_segment, object_key, size_bytes, filter_len, record_count, retired_gen, retired_at_ms
         FROM secondary_index_runs
         WHERE stream=? AND index_name=?
         ORDER BY start_segment ASC, level ASC;`),
      listRetiredSecondaryIndexRuns: this.db.query(`SELECT run_id, stream, index_name, level, start_segment, end_segment, object_key, size_bytes, filter_len, record_count, retired_gen, retired_at_ms
         FROM secondary_index_runs
         WHERE stream=? AND index_name=? AND retired_gen IS NOT NULL
         ORDER BY retired_at_ms ASC;`),
      insertSecondaryIndexRun: this.db.query(`INSERT OR IGNORE INTO secondary_index_runs(run_id, stream, index_name, level, start_segment, end_segment, object_key, size_bytes, filter_len, record_count, retired_gen, retired_at_ms)
         VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL);`),
      retireSecondaryIndexRun: this.db.query(`UPDATE secondary_index_runs SET retired_gen=?, retired_at_ms=? WHERE run_id=?;`),
      deleteSecondaryIndexRun: this.db.query(`DELETE FROM secondary_index_runs WHERE run_id=?;`),
      deleteSecondaryIndexState: this.db.query(`DELETE FROM secondary_index_state WHERE stream=? AND index_name=?;`),
      deleteSecondaryIndexRunsForIndex: this.db.query(`DELETE FROM secondary_index_runs WHERE stream=? AND index_name=?;`),
      deleteSecondaryIndexStatesForStream: this.db.query(`DELETE FROM secondary_index_state WHERE stream=?;`),
      deleteSecondaryIndexRunsForStream: this.db.query(`DELETE FROM secondary_index_runs WHERE stream=?;`),
      getLexiconIndexState: this.db.query(`SELECT stream, source_kind, source_name, indexed_through, updated_at_ms
         FROM lexicon_index_state
         WHERE stream=? AND source_kind=? AND source_name=?
         LIMIT 1;`),
      listLexiconIndexStates: this.db.query(`SELECT stream, source_kind, source_name, indexed_through, updated_at_ms
         FROM lexicon_index_state
         WHERE stream=?
         ORDER BY source_kind ASC, source_name ASC;`),
      upsertLexiconIndexState: this.db.query(`INSERT INTO lexicon_index_state(stream, source_kind, source_name, indexed_through, updated_at_ms)
         VALUES(?, ?, ?, ?, ?)
         ON CONFLICT(stream, source_kind, source_name) DO UPDATE SET
           indexed_through=excluded.indexed_through,
           updated_at_ms=excluded.updated_at_ms;`),
      updateLexiconIndexedThrough: this.db.query(`UPDATE lexicon_index_state
         SET indexed_through=?, updated_at_ms=?
         WHERE stream=? AND source_kind=? AND source_name=?;`),
      listLexiconIndexRuns: this.db.query(`SELECT run_id, stream, source_kind, source_name, level, start_segment, end_segment, object_key, size_bytes, record_count, retired_gen, retired_at_ms
         FROM lexicon_index_runs
         WHERE stream=? AND source_kind=? AND source_name=? AND retired_gen IS NULL
         ORDER BY start_segment ASC, level ASC;`),
      listLexiconIndexRunsAll: this.db.query(`SELECT run_id, stream, source_kind, source_name, level, start_segment, end_segment, object_key, size_bytes, record_count, retired_gen, retired_at_ms
         FROM lexicon_index_runs
         WHERE stream=? AND source_kind=? AND source_name=?
         ORDER BY start_segment ASC, level ASC;`),
      listRetiredLexiconIndexRuns: this.db.query(`SELECT run_id, stream, source_kind, source_name, level, start_segment, end_segment, object_key, size_bytes, record_count, retired_gen, retired_at_ms
         FROM lexicon_index_runs
         WHERE stream=? AND source_kind=? AND source_name=? AND retired_gen IS NOT NULL
         ORDER BY retired_at_ms ASC;`),
      insertLexiconIndexRun: this.db.query(`INSERT OR IGNORE INTO lexicon_index_runs(run_id, stream, source_kind, source_name, level, start_segment, end_segment, object_key, size_bytes, record_count, retired_gen, retired_at_ms)
         VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL);`),
      retireLexiconIndexRun: this.db.query(`UPDATE lexicon_index_runs SET retired_gen=?, retired_at_ms=? WHERE run_id=?;`),
      deleteLexiconIndexRun: this.db.query(`DELETE FROM lexicon_index_runs WHERE run_id=?;`),
      deleteLexiconIndexState: this.db.query(`DELETE FROM lexicon_index_state WHERE stream=? AND source_kind=? AND source_name=?;`),
      deleteLexiconIndexRunsForSource: this.db.query(`DELETE FROM lexicon_index_runs WHERE stream=? AND source_kind=? AND source_name=?;`),
      deleteLexiconIndexStatesForStream: this.db.query(`DELETE FROM lexicon_index_state WHERE stream=?;`),
      deleteLexiconIndexRunsForStream: this.db.query(`DELETE FROM lexicon_index_runs WHERE stream=?;`),
      getSearchCompanionPlan: this.db.query(`SELECT stream, generation, plan_hash, plan_json, updated_at_ms
         FROM search_companion_plans WHERE stream=? LIMIT 1;`),
      listSearchCompanionPlanStreams: this.db.query(`SELECT stream FROM search_companion_plans ORDER BY stream ASC;`),
      upsertSearchCompanionPlan: this.db.query(`INSERT INTO search_companion_plans(stream, generation, plan_hash, plan_json, updated_at_ms)
         VALUES(?, ?, ?, ?, ?)
         ON CONFLICT(stream) DO UPDATE SET
           generation=excluded.generation,
           plan_hash=excluded.plan_hash,
           plan_json=excluded.plan_json,
           updated_at_ms=excluded.updated_at_ms;`),
      deleteSearchCompanionPlan: this.db.query(`DELETE FROM search_companion_plans WHERE stream=?;`),
      listSearchSegmentCompanions: this.db.query(`SELECT stream, segment_index, object_key, plan_generation, sections_json, section_sizes_json, size_bytes,
                primary_timestamp_min_ms, primary_timestamp_max_ms, updated_at_ms
         FROM search_segment_companions
         WHERE stream=?
         ORDER BY segment_index ASC;`),
      getSearchSegmentCompanion: this.db.query(`SELECT stream, segment_index, object_key, plan_generation, sections_json, section_sizes_json, size_bytes,
                primary_timestamp_min_ms, primary_timestamp_max_ms, updated_at_ms
         FROM search_segment_companions
         WHERE stream=? AND segment_index=? LIMIT 1;`),
      upsertSearchSegmentCompanion: this.db.query(`INSERT INTO search_segment_companions(stream, segment_index, object_key, plan_generation, sections_json, section_sizes_json, size_bytes,
                                               primary_timestamp_min_ms, primary_timestamp_max_ms, updated_at_ms)
         VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(stream, segment_index) DO UPDATE SET
           object_key=excluded.object_key,
           plan_generation=excluded.plan_generation,
           sections_json=excluded.sections_json,
           section_sizes_json=excluded.section_sizes_json,
           size_bytes=excluded.size_bytes,
           primary_timestamp_min_ms=excluded.primary_timestamp_min_ms,
           primary_timestamp_max_ms=excluded.primary_timestamp_max_ms,
           updated_at_ms=excluded.updated_at_ms;`),
      deleteSearchSegmentCompanionsFromGeneration: this.db.query(`DELETE FROM search_segment_companions WHERE stream=? AND plan_generation < ?;`),
      deleteSearchSegmentCompanionsFromIndex: this.db.query(`DELETE FROM search_segment_companions WHERE stream=? AND segment_index >= ?;`),
      deleteSearchSegmentCompanions: this.db.query(`DELETE FROM search_segment_companions WHERE stream=?;`),
      countUploadedSegments: this.db.query(`SELECT COALESCE(MAX(segment_index), -1) as max_idx
         FROM segments WHERE stream=? AND r2_etag IS NOT NULL;`),
      getSegmentMeta: this.db.query(`SELECT stream, segment_count, segment_offsets, segment_blocks, segment_last_ts
         FROM stream_segment_meta WHERE stream=? LIMIT 1;`),
      ensureSegmentMeta: this.db.query(`INSERT INTO stream_segment_meta(stream, segment_count, segment_offsets, segment_blocks, segment_last_ts)
         VALUES(?, 0, x'', x'', x'')
         ON CONFLICT(stream) DO NOTHING;`),
      appendSegmentMeta: this.db.query(`UPDATE stream_segment_meta
         SET segment_count = segment_count + 1,
             segment_offsets = segment_offsets || ?,
             segment_blocks = segment_blocks || ?,
             segment_last_ts = segment_last_ts || ?
         WHERE stream = ?;`),
      upsertSegmentMeta: this.db.query(`INSERT INTO stream_segment_meta(stream, segment_count, segment_offsets, segment_blocks, segment_last_ts)
         VALUES(?, ?, ?, ?, ?)
         ON CONFLICT(stream) DO UPDATE SET
           segment_count=excluded.segment_count,
           segment_offsets=excluded.segment_offsets,
           segment_blocks=excluded.segment_blocks,
           segment_last_ts=excluded.segment_last_ts;`),
      setUploadedSegmentCount: this.db.query(`UPDATE streams SET uploaded_segment_count=?, updated_at_ms=? WHERE stream=?;`),
      advanceUploadedThrough: this.db.query(`UPDATE streams SET uploaded_through=?, updated_at_ms=? WHERE stream=?;`),
      getSchemaRegistry: this.db.query(`SELECT stream, schema_json, updated_at_ms, uploaded_size_bytes FROM schemas WHERE stream=? LIMIT 1;`),
      upsertSchemaRegistry: this.db.query(`INSERT INTO schemas(stream, schema_json, updated_at_ms) VALUES(?, ?, ?)
         ON CONFLICT(stream) DO UPDATE SET schema_json=excluded.schema_json, updated_at_ms=excluded.updated_at_ms;`),
      setSchemaUploadedSize: this.db.query(`UPDATE schemas SET uploaded_size_bytes=?, updated_at_ms=? WHERE stream=?;`),
      getStreamProfile: this.db.query(`SELECT stream, profile_json, updated_at_ms FROM stream_profiles WHERE stream=? LIMIT 1;`),
      upsertStreamProfile: this.db.query(`INSERT INTO stream_profiles(stream, profile_json, updated_at_ms) VALUES(?, ?, ?)
         ON CONFLICT(stream) DO UPDATE SET profile_json=excluded.profile_json, updated_at_ms=excluded.updated_at_ms;`),
      deleteStreamProfile: this.db.query(`DELETE FROM stream_profiles WHERE stream=?;`),
      getStreamTouchState: this.db.query(`SELECT stream, processed_through, updated_at_ms
         FROM stream_touch_state WHERE stream=? LIMIT 1;`),
      upsertStreamTouchState: this.db.query(`INSERT INTO stream_touch_state(stream, processed_through, updated_at_ms)
         VALUES(?, ?, ?)
         ON CONFLICT(stream) DO UPDATE SET
           processed_through=excluded.processed_through,
           updated_at_ms=excluded.updated_at_ms;`),
      deleteStreamTouchState: this.db.query(`DELETE FROM stream_touch_state WHERE stream=?;`),
      listStreamTouchStates: this.db.query(`SELECT stream, processed_through, updated_at_ms
         FROM stream_touch_state
         ORDER BY stream ASC;`),
      listStreamsByProfile: this.db.query(`SELECT stream FROM streams WHERE profile=? ORDER BY stream ASC;`),
      countStreams: this.db.query(`SELECT COUNT(*) as cnt FROM streams WHERE (stream_flags & ?) = 0;`),
      sumPendingBytes: this.db.query(`SELECT COALESCE(SUM(pending_bytes), 0) as total FROM streams;`),
      sumPendingSegmentBytes: this.db.query(`SELECT COALESCE(SUM(size_bytes), 0) as total FROM segments WHERE uploaded_at_ms IS NULL;`),
      recordObjectStoreRequest: this.db.query(`INSERT INTO objectstore_request_counts(stream_hash, artifact, op, count, bytes, updated_at_ms)
         VALUES(?, ?, ?, ?, ?, ?)
         ON CONFLICT(stream_hash, artifact, op) DO UPDATE SET
           count=objectstore_request_counts.count + excluded.count,
           bytes=objectstore_request_counts.bytes + excluded.bytes,
           updated_at_ms=excluded.updated_at_ms;`)
    };
  }
  toBigInt(v) {
    return typeof v === "bigint" ? v : BigInt(v);
  }
  bindInt(v) {
    const max = BigInt(Number.MAX_SAFE_INTEGER);
    const min = BigInt(Number.MIN_SAFE_INTEGER);
    if (v <= max && v >= min)
      return Number(v);
    return v.toString();
  }
  deleteWalThroughWithStats(stream, through, opts) {
    if (through < 0n)
      return { deletedRows: 0n, deletedBytes: 0n };
    const bound = this.bindInt(through);
    const maxRows = opts?.maxRows;
    const useChunkedDelete = typeof maxRows === "number" && Number.isFinite(maxRows) && maxRows > 0;
    const stmt = useChunkedDelete ? this.db.prepare(`DELETE FROM wal
           WHERE rowid IN (
             SELECT rowid
             FROM wal
             WHERE stream=? AND offset <= ?
             ORDER BY offset ASC
             LIMIT ?
           )
           RETURNING payload_len;`) : this.db.prepare(`DELETE FROM wal
           WHERE stream=? AND offset <= ?
           RETURNING payload_len;`);
    try {
      const rows = useChunkedDelete ? stmt.iterate(stream, bound, Math.max(1, Math.floor(maxRows))) : stmt.iterate(stream, bound);
      let deletedRows = 0n;
      let deletedBytes = 0n;
      for (const row of rows) {
        deletedRows += 1n;
        deletedBytes += this.toBigInt(row?.payload_len ?? 0);
      }
      return { deletedRows, deletedBytes };
    } finally {
      try {
        stmt.finalize?.();
      } catch {}
    }
  }
  encodeU64Le(value) {
    const buf = new Uint8Array(8);
    const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    dv.setBigUint64(0, value, true);
    return buf;
  }
  encodeU32Le(value) {
    const buf = new Uint8Array(4);
    const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    dv.setUint32(0, value >>> 0, true);
    return buf;
  }
  coerceStreamRow(row) {
    return {
      stream: String(row.stream),
      created_at_ms: this.toBigInt(row.created_at_ms),
      updated_at_ms: this.toBigInt(row.updated_at_ms),
      content_type: String(row.content_type),
      profile: row.profile == null ? null : String(row.profile),
      stream_seq: row.stream_seq == null ? null : String(row.stream_seq),
      closed: Number(row.closed),
      closed_producer_id: row.closed_producer_id == null ? null : String(row.closed_producer_id),
      closed_producer_epoch: row.closed_producer_epoch == null ? null : Number(row.closed_producer_epoch),
      closed_producer_seq: row.closed_producer_seq == null ? null : Number(row.closed_producer_seq),
      ttl_seconds: row.ttl_seconds == null ? null : Number(row.ttl_seconds),
      epoch: Number(row.epoch),
      next_offset: this.toBigInt(row.next_offset),
      sealed_through: this.toBigInt(row.sealed_through),
      uploaded_through: this.toBigInt(row.uploaded_through),
      uploaded_segment_count: Number(row.uploaded_segment_count ?? 0),
      pending_rows: this.toBigInt(row.pending_rows),
      pending_bytes: this.toBigInt(row.pending_bytes),
      logical_size_bytes: this.toBigInt(row.logical_size_bytes ?? 0),
      wal_rows: this.toBigInt(row.wal_rows ?? 0),
      wal_bytes: this.toBigInt(row.wal_bytes ?? 0),
      last_append_ms: this.toBigInt(row.last_append_ms),
      last_segment_cut_ms: this.toBigInt(row.last_segment_cut_ms),
      segment_in_progress: Number(row.segment_in_progress),
      expires_at_ms: row.expires_at_ms == null ? null : this.toBigInt(row.expires_at_ms),
      stream_flags: Number(row.stream_flags)
    };
  }
  coerceSegmentRow(row) {
    return {
      segment_id: String(row.segment_id),
      stream: String(row.stream),
      segment_index: Number(row.segment_index),
      start_offset: this.toBigInt(row.start_offset),
      end_offset: this.toBigInt(row.end_offset),
      block_count: Number(row.block_count),
      last_append_ms: this.toBigInt(row.last_append_ms),
      payload_bytes: this.toBigInt(row.payload_bytes ?? 0),
      size_bytes: Number(row.size_bytes),
      local_path: String(row.local_path),
      created_at_ms: this.toBigInt(row.created_at_ms),
      uploaded_at_ms: row.uploaded_at_ms == null ? null : this.toBigInt(row.uploaded_at_ms),
      r2_etag: row.r2_etag == null ? null : String(row.r2_etag)
    };
  }
  close() {
    this.db.close();
  }
  nowMs() {
    return BigInt(Date.now());
  }
  isDeleted(row) {
    return (row.stream_flags & STREAM_FLAG_DELETED) !== 0;
  }
  getStream(stream) {
    const row = this.stmts.getStream.get(stream);
    return row ? this.coerceStreamRow(row) : null;
  }
  setStreamLogicalSizeBytes(stream, logicalSizeBytes) {
    this.db.query(`UPDATE streams SET logical_size_bytes=?, updated_at_ms=? WHERE stream=?;`).run(this.bindInt(logicalSizeBytes), this.nowMs(), stream);
  }
  listStreamsMissingLogicalSize(limit) {
    const now = this.nowMs();
    const rows = this.db.query(`SELECT stream
         FROM streams
         WHERE (stream_flags & ?) = 0
           AND (expires_at_ms IS NULL OR expires_at_ms > ?)
           AND next_offset > 0
           AND logical_size_bytes = 0
         ORDER BY updated_at_ms ASC
         LIMIT ?;`).all(STREAM_FLAG_DELETED | STREAM_FLAG_TOUCH, now, limit);
    return rows.map((row) => String(row.stream));
  }
  getWalBytesAfterOffset(stream, offset) {
    const row = this.db.query(`SELECT COALESCE(SUM(payload_len), 0) as bytes
         FROM wal
         WHERE stream=? AND offset > ?;`).get(stream, this.bindInt(offset));
    return this.toBigInt(row?.bytes ?? 0);
  }
  ensureStream(stream, opts) {
    const existing = this.getStream(stream);
    if (existing)
      return existing;
    const now = this.nowMs();
    const epoch = 0;
    const nextOffset = 0n;
    const contentType = opts?.contentType ?? "application/octet-stream";
    const profile = opts?.profile ?? "generic";
    const closed = opts?.closed ? 1 : 0;
    const closedProducer = opts?.closedProducer ?? null;
    const expiresAtMs = opts?.expiresAtMs ?? null;
    const ttlSeconds = opts?.ttlSeconds ?? null;
    const streamFlags = opts?.streamFlags ?? 0;
    this.db.query(`INSERT INTO streams(
          stream, created_at_ms, updated_at_ms,
          content_type, profile, stream_seq, closed, closed_producer_id, closed_producer_epoch, closed_producer_seq, ttl_seconds,
          epoch, next_offset, sealed_through, uploaded_through, uploaded_segment_count,
          pending_rows, pending_bytes, logical_size_bytes, last_append_ms, last_segment_cut_ms, segment_in_progress,
          expires_at_ms, stream_flags
        )
        VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`).run(stream, now, now, contentType, profile, null, closed, closedProducer ? closedProducer.id : null, closedProducer ? closedProducer.epoch : null, closedProducer ? closedProducer.seq : null, ttlSeconds, epoch, nextOffset, -1n, -1n, 0, 0n, 0n, 0n, now, now, 0, expiresAtMs, streamFlags);
    this.stmts.upsertManifest.run(stream, 0, 0, null, null, null);
    this.ensureSegmentMeta(stream);
    return this.getStream(stream);
  }
  restoreStreamRow(row) {
    this.stmts.upsertStream.run(row.stream, row.created_at_ms, row.updated_at_ms, row.content_type, row.profile, row.stream_seq, row.closed, row.closed_producer_id, row.closed_producer_epoch, row.closed_producer_seq, row.ttl_seconds, row.epoch, row.next_offset, row.sealed_through, row.uploaded_through, row.uploaded_segment_count, row.pending_rows, row.pending_bytes, row.logical_size_bytes, row.wal_rows, row.wal_bytes, row.last_append_ms, row.last_segment_cut_ms, row.segment_in_progress, row.expires_at_ms, row.stream_flags);
  }
  listStreams(limit, offset) {
    const now = this.nowMs();
    const rows = this.stmts.listStreams.all(STREAM_FLAG_DELETED | STREAM_FLAG_TOUCH, now, limit, offset);
    return rows.map((r) => this.coerceStreamRow(r));
  }
  listDeletedStreams(limit, offset) {
    const rows = this.stmts.listDeletedStreams.all(STREAM_FLAG_DELETED, limit, offset);
    return rows.map((row) => String(row.stream));
  }
  listExpiredStreams(limit) {
    const now = this.nowMs();
    const rows = this.stmts.listExpiredStreams.all(STREAM_FLAG_DELETED | STREAM_FLAG_TOUCH, now, limit);
    return rows.map((r) => String(r.stream));
  }
  deleteAccelerationState(stream) {
    const tx = this.db.transaction(() => {
      this.stmts.deleteIndexRunsForStream.run(stream);
      this.stmts.deleteIndexStateForStream.run(stream);
      this.stmts.deleteSecondaryIndexRunsForStream.run(stream);
      this.stmts.deleteSecondaryIndexStatesForStream.run(stream);
      this.stmts.deleteLexiconIndexRunsForStream.run(stream);
      this.stmts.deleteLexiconIndexStatesForStream.run(stream);
      this.stmts.deleteSearchSegmentCompanions.run(stream);
      this.stmts.deleteSearchCompanionPlan.run(stream);
    });
    tx();
  }
  deleteStream(stream) {
    const existing = this.getStream(stream);
    if (!existing)
      return false;
    const now = this.nowMs();
    const tx = this.db.transaction(() => {
      this.stmts.setDeleted.run(STREAM_FLAG_DELETED, now, stream);
      this.stmts.deleteIndexRunsForStream.run(stream);
      this.stmts.deleteIndexStateForStream.run(stream);
      this.stmts.deleteSecondaryIndexRunsForStream.run(stream);
      this.stmts.deleteSecondaryIndexStatesForStream.run(stream);
      this.stmts.deleteLexiconIndexRunsForStream.run(stream);
      this.stmts.deleteLexiconIndexStatesForStream.run(stream);
      this.stmts.deleteSearchSegmentCompanions.run(stream);
      this.stmts.deleteSearchCompanionPlan.run(stream);
    });
    tx();
    return true;
  }
  updateStreamProfile(stream, profile) {
    this.stmts.setStreamProfile.run(profile, this.nowMs(), stream);
    return this.getStream(stream);
  }
  hardDeleteStream(stream) {
    const tx = this.db.transaction(() => {
      const existing = this.getStream(stream);
      if (!existing)
        return false;
      this.db.query(`DELETE FROM wal WHERE stream=?;`).run(stream);
      this.db.query(`DELETE FROM segments WHERE stream=?;`).run(stream);
      this.db.query(`DELETE FROM manifests WHERE stream=?;`).run(stream);
      this.db.query(`DELETE FROM schemas WHERE stream=?;`).run(stream);
      this.db.query(`DELETE FROM stream_profiles WHERE stream=?;`).run(stream);
      this.db.query(`DELETE FROM stream_touch_state WHERE stream=?;`).run(stream);
      this.db.query(`DELETE FROM live_templates WHERE stream=?;`).run(stream);
      this.db.query(`DELETE FROM producer_state WHERE stream=?;`).run(stream);
      this.db.query(`DELETE FROM index_state WHERE stream=?;`).run(stream);
      this.db.query(`DELETE FROM index_runs WHERE stream=?;`).run(stream);
      this.db.query(`DELETE FROM secondary_index_state WHERE stream=?;`).run(stream);
      this.db.query(`DELETE FROM secondary_index_runs WHERE stream=?;`).run(stream);
      this.db.query(`DELETE FROM lexicon_index_state WHERE stream=?;`).run(stream);
      this.db.query(`DELETE FROM lexicon_index_runs WHERE stream=?;`).run(stream);
      this.db.query(`DELETE FROM search_companion_plans WHERE stream=?;`).run(stream);
      this.db.query(`DELETE FROM search_segment_companions WHERE stream=?;`).run(stream);
      this.db.query(`DELETE FROM stream_segment_meta WHERE stream=?;`).run(stream);
      this.db.query(`DELETE FROM streams WHERE stream=?;`).run(stream);
      return true;
    });
    return tx();
  }
  getSchemaRegistry(stream) {
    const row = this.stmts.getSchemaRegistry.get(stream);
    if (!row)
      return null;
    return {
      stream: String(row.stream),
      registry_json: String(row.schema_json),
      updated_at_ms: this.toBigInt(row.updated_at_ms),
      uploaded_size_bytes: this.toBigInt(row.uploaded_size_bytes ?? 0)
    };
  }
  upsertSchemaRegistry(stream, registryJson) {
    this.stmts.upsertSchemaRegistry.run(stream, registryJson, this.nowMs());
  }
  setSchemaUploadedSizeBytes(stream, sizeBytes) {
    this.stmts.setSchemaUploadedSize.run(sizeBytes, this.nowMs(), stream);
  }
  getStreamProfile(stream) {
    const row = this.stmts.getStreamProfile.get(stream);
    if (!row)
      return null;
    return {
      stream: String(row.stream),
      profile_json: String(row.profile_json),
      updated_at_ms: this.toBigInt(row.updated_at_ms)
    };
  }
  upsertStreamProfile(stream, profileJson) {
    this.stmts.upsertStreamProfile.run(stream, profileJson, this.nowMs());
  }
  deleteStreamProfile(stream) {
    this.stmts.deleteStreamProfile.run(stream);
  }
  getStreamTouchState(stream) {
    const row = this.stmts.getStreamTouchState.get(stream);
    if (!row)
      return null;
    return {
      stream: String(row.stream),
      processed_through: this.toBigInt(row.processed_through),
      updated_at_ms: this.toBigInt(row.updated_at_ms)
    };
  }
  listStreamTouchStates() {
    const rows = this.stmts.listStreamTouchStates.all();
    return rows.map((row) => ({
      stream: String(row.stream),
      processed_through: this.toBigInt(row.processed_through),
      updated_at_ms: this.toBigInt(row.updated_at_ms)
    }));
  }
  listStreamsByProfile(kind) {
    const rows = this.stmts.listStreamsByProfile.all(kind);
    return rows.map((row) => String(row.stream));
  }
  ensureStreamTouchState(stream) {
    const existing = this.getStreamTouchState(stream);
    if (existing)
      return;
    const srow = this.getStream(stream);
    const initialThrough = srow ? srow.next_offset - 1n : -1n;
    this.stmts.upsertStreamTouchState.run(stream, this.bindInt(initialThrough), this.nowMs());
  }
  updateStreamTouchStateThrough(stream, processedThrough) {
    this.stmts.upsertStreamTouchState.run(stream, this.bindInt(processedThrough), this.nowMs());
  }
  deleteStreamTouchState(stream) {
    this.stmts.deleteStreamTouchState.run(stream);
  }
  addStreamFlags(stream, flags) {
    if (!Number.isFinite(flags) || flags <= 0)
      return;
    this.db.query(`UPDATE streams SET stream_flags = (stream_flags | ?), updated_at_ms=? WHERE stream=?;`).run(flags, this.nowMs(), stream);
  }
  getWalOldestOffset(stream) {
    const row = this.db.query(`SELECT MIN(offset) as min_off FROM wal WHERE stream=?;`).get(stream);
    if (!row || row.min_off == null)
      return null;
    return this.toBigInt(row.min_off);
  }
  getWalOldestTimestampMs(stream) {
    const row = this.db.query(`SELECT MIN(ts_ms) as min_ts FROM wal WHERE stream=?;`).get(stream);
    if (!row || row.min_ts == null)
      return null;
    return this.toBigInt(row.min_ts);
  }
  trimWalByAge(stream, maxAgeMs) {
    const ageMs = Math.max(0, Math.floor(maxAgeMs));
    if (!Number.isFinite(ageMs))
      return { trimmedRows: 0, trimmedBytes: 0, keptFromOffset: null };
    const tx = this.db.transaction(() => {
      const lastRow = this.db.query(`SELECT offset, ts_ms FROM wal WHERE stream=? ORDER BY offset DESC LIMIT 1;`).get(stream);
      if (!lastRow || lastRow.offset == null)
        return { trimmedRows: 0, trimmedBytes: 0, keptFromOffset: null };
      const lastOffset = this.toBigInt(lastRow.offset);
      let keepFromOffset;
      if (ageMs === 0) {
        keepFromOffset = lastOffset;
      } else {
        const cutoff = this.nowMs() - BigInt(ageMs);
        const keepRow = this.db.query(`SELECT offset FROM wal WHERE stream=? AND ts_ms >= ? ORDER BY offset ASC LIMIT 1;`).get(stream, this.bindInt(cutoff));
        keepFromOffset = keepRow && keepRow.offset != null ? this.toBigInt(keepRow.offset) : lastOffset;
      }
      if (keepFromOffset <= 0n)
        return { trimmedRows: 0, trimmedBytes: 0, keptFromOffset: keepFromOffset };
      const { deletedRows: rows, deletedBytes: bytes } = this.deleteWalThroughWithStats(stream, keepFromOffset - 1n);
      if (rows <= 0n)
        return { trimmedRows: 0, trimmedBytes: 0, keptFromOffset: keepFromOffset };
      const now = this.nowMs();
      this.db.query(`UPDATE streams
         SET pending_bytes = CASE WHEN pending_bytes >= ? THEN pending_bytes - ? ELSE 0 END,
             pending_rows = CASE WHEN pending_rows >= ? THEN pending_rows - ? ELSE 0 END,
             wal_bytes = CASE WHEN wal_bytes >= ? THEN wal_bytes - ? ELSE 0 END,
             wal_rows = CASE WHEN wal_rows >= ? THEN wal_rows - ? ELSE 0 END,
             updated_at_ms = ?
         WHERE stream = ?;`).run(bytes, bytes, rows, rows, bytes, bytes, rows, rows, now, stream);
      const trimmedBytes = bytes <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(bytes) : Number.MAX_SAFE_INTEGER;
      const trimmedRows = rows <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(rows) : Number.MAX_SAFE_INTEGER;
      return { trimmedRows, trimmedBytes, keptFromOffset: keepFromOffset };
    });
    return tx();
  }
  countStreams() {
    const row = this.stmts.countStreams.get(STREAM_FLAG_DELETED | STREAM_FLAG_TOUCH);
    return row ? Number(row.cnt) : 0;
  }
  sumPendingBytes() {
    const row = this.stmts.sumPendingBytes.get();
    const total = row?.total ?? 0;
    return Number(this.toBigInt(total));
  }
  sumPendingSegmentBytes() {
    const row = this.stmts.sumPendingSegmentBytes.get();
    const total = row?.total ?? 0;
    return Number(this.toBigInt(total));
  }
  ensureDbStat() {
    if (this.dbstatReady != null)
      return this.dbstatReady;
    try {
      this.db.exec("CREATE VIRTUAL TABLE IF NOT EXISTS temp.dbstat USING dbstat;");
      this.dbstatReady = true;
    } catch {
      this.dbstatReady = false;
    }
    return this.dbstatReady;
  }
  estimateWalBytes() {
    try {
      const row = this.db.query(`SELECT
           COALESCE(SUM(payload_len), 0) as payload,
           COALESCE(SUM(LENGTH(routing_key)), 0) as rk,
           COALESCE(SUM(LENGTH(content_type)), 0) as ct
         FROM wal;`).get();
      return Number(row?.payload ?? 0) + Number(row?.rk ?? 0) + Number(row?.ct ?? 0);
    } catch {
      return 0;
    }
  }
  estimateMetaBytes() {
    try {
      const streams = this.db.query(`SELECT
           COALESCE(SUM(LENGTH(stream)), 0) as stream,
           COALESCE(SUM(LENGTH(content_type)), 0) as content_type,
           COALESCE(SUM(LENGTH(stream_seq)), 0) as stream_seq,
           COALESCE(SUM(LENGTH(closed_producer_id)), 0) as closed_producer_id
         FROM streams;`).get();
      const segments = this.db.query(`SELECT
           COALESCE(SUM(LENGTH(segment_id)), 0) as segment_id,
           COALESCE(SUM(LENGTH(stream)), 0) as stream,
           COALESCE(SUM(LENGTH(local_path)), 0) as local_path,
           COALESCE(SUM(LENGTH(r2_etag)), 0) as r2_etag
         FROM segments;`).get();
      const manifests = this.db.query(`SELECT
           COALESCE(SUM(LENGTH(stream)), 0) as stream,
           COALESCE(SUM(LENGTH(last_uploaded_etag)), 0) as last_uploaded_etag
         FROM manifests;`).get();
      const schemas = this.db.query(`SELECT COALESCE(SUM(LENGTH(schema_json)), 0) as schema_json FROM schemas;`).get();
      const producers = this.db.query(`SELECT
           COALESCE(SUM(LENGTH(stream)), 0) as stream,
           COALESCE(SUM(LENGTH(producer_id)), 0) as producer_id
         FROM producer_state;`).get();
      const total = Number(streams?.stream ?? 0) + Number(streams?.content_type ?? 0) + Number(streams?.stream_seq ?? 0) + Number(streams?.closed_producer_id ?? 0) + Number(segments?.segment_id ?? 0) + Number(segments?.stream ?? 0) + Number(segments?.local_path ?? 0) + Number(segments?.r2_etag ?? 0) + Number(manifests?.stream ?? 0) + Number(manifests?.last_uploaded_etag ?? 0) + Number(schemas?.schema_json ?? 0) + Number(producers?.stream ?? 0) + Number(producers?.producer_id ?? 0);
      return total;
    } catch {
      return 0;
    }
  }
  getWalDbSizeBytes() {
    if (this.ensureDbStat()) {
      try {
        const row = this.db.query(`SELECT COALESCE(SUM(pgsize), 0) as total FROM temp.dbstat WHERE name = 'wal';`).get();
        return Number(row?.total ?? 0);
      } catch {}
    }
    return this.estimateWalBytes();
  }
  getMetaDbSizeBytes() {
    if (this.ensureDbStat()) {
      try {
        const row = this.db.query(`SELECT COALESCE(SUM(pgsize), 0) as total FROM temp.dbstat WHERE name != 'wal';`).get();
        return Number(row?.total ?? 0);
      } catch {}
    }
    return this.estimateMetaBytes();
  }
  appendWalRows(args) {
    const { stream, startOffset, expectedOffset, rows } = args;
    if (rows.length === 0)
      return Result.err({ kind: "no_rows" });
    const tx = this.db.transaction(() => {
      const st = this.getStream(stream);
      if (!st || this.isDeleted(st))
        return Result.err({ kind: "stream_missing" });
      if (st.expires_at_ms != null && this.nowMs() > st.expires_at_ms)
        return Result.err({ kind: "stream_expired" });
      if (expectedOffset !== undefined && st.next_offset !== expectedOffset) {
        return Result.err({ kind: "seq_mismatch", expectedNext: st.next_offset });
      }
      let totalBytes = 0n;
      let offset = startOffset;
      for (const r of rows) {
        const payloadLen = r.payload.byteLength;
        totalBytes += BigInt(payloadLen);
        this.stmts.insertWal.run(stream, offset, r.appendMs, r.payload, payloadLen, r.routingKey, r.contentType, 0);
        offset += 1n;
      }
      const lastOffset = offset - 1n;
      const newNextOffset = lastOffset + 1n;
      const now = this.nowMs();
      const pendingRows = BigInt(rows.length);
      const lastAppend = rows[rows.length - 1].appendMs;
      this.stmts.updateStreamAppend.run(newNextOffset, now, lastAppend, pendingRows, totalBytes, totalBytes, pendingRows, totalBytes, stream, STREAM_FLAG_DELETED);
      return Result.ok({ lastOffset });
    });
    return tx();
  }
  *iterWalRange(stream, startOffset, endOffset, routingKey) {
    const start = this.bindInt(startOffset);
    const end = this.bindInt(endOffset);
    const stmt = routingKey ? this.db.prepare(`SELECT offset, ts_ms, routing_key, content_type, payload
           FROM wal
           WHERE stream = ? AND offset >= ? AND offset <= ? AND routing_key = ?
           ORDER BY offset ASC;`) : this.db.prepare(`SELECT offset, ts_ms, routing_key, content_type, payload
           FROM wal
           WHERE stream = ? AND offset >= ? AND offset <= ?
           ORDER BY offset ASC;`);
    try {
      const it = routingKey ? stmt.iterate(stream, start, end, routingKey) : stmt.iterate(stream, start, end);
      for (const row of it) {
        yield row;
      }
    } finally {
      try {
        stmt.finalize?.();
      } catch {}
    }
  }
  *iterWalRangeDesc(stream, startOffset, endOffset, routingKey) {
    const start = this.bindInt(startOffset);
    const end = this.bindInt(endOffset);
    const stmt = routingKey ? this.db.prepare(`SELECT offset, ts_ms, routing_key, content_type, payload
           FROM wal
           WHERE stream = ? AND offset >= ? AND offset <= ? AND routing_key = ?
           ORDER BY offset DESC;`) : this.db.prepare(`SELECT offset, ts_ms, routing_key, content_type, payload
           FROM wal
           WHERE stream = ? AND offset >= ? AND offset <= ?
           ORDER BY offset DESC;`);
    try {
      const it = routingKey ? stmt.iterate(stream, start, end, routingKey) : stmt.iterate(stream, start, end);
      for (const row of it) {
        yield row;
      }
    } finally {
      try {
        stmt.finalize?.();
      } catch {}
    }
  }
  nextSegmentIndexForStream(stream) {
    const row = this.stmts.nextSegmentIndex.get(stream);
    return Number(row?.next_idx ?? 0);
  }
  createSegmentRow(row) {
    this.stmts.createSegment.run(row.segmentId, row.stream, row.segmentIndex, row.startOffset, row.endOffset, row.blockCount, row.lastAppendMs, row.payloadBytes, row.sizeBytes, row.localPath, this.nowMs());
  }
  commitSealedSegment(row) {
    const tx = this.db.transaction(() => {
      this.createSegmentRow(row);
      this.appendSegmentMeta(row.stream, row.endOffset + 1n, row.blockCount, row.lastAppendMs * 1000000n);
      this.setStreamSealedThrough(row.stream, row.endOffset, row.payloadBytes, row.rowsSealed);
    });
    tx();
  }
  listSegmentsForStream(stream) {
    const rows = this.stmts.listSegmentsForStream.all(stream);
    return rows.map((r) => this.coerceSegmentRow(r));
  }
  getSegmentByIndex(stream, segmentIndex) {
    const row = this.stmts.getSegmentByIndex.get(stream, segmentIndex);
    return row ? this.coerceSegmentRow(row) : null;
  }
  findSegmentForOffset(stream, offset) {
    const bound = this.bindInt(offset);
    const row = this.stmts.findSegmentForOffset.get(stream, bound, bound);
    return row ? this.coerceSegmentRow(row) : null;
  }
  pendingUploadHeads(limit) {
    const rows = this.stmts.pendingUploadHeads.all(limit);
    return rows.map((r) => this.coerceSegmentRow(r));
  }
  recentSegmentCompressionRatio(stream, limit = 8) {
    const row = this.stmts.recentSegmentCompressionWindow.get(stream, Math.max(1, limit));
    const count = Number(row?.cnt ?? 0);
    if (!Number.isFinite(count) || count <= 0)
      return null;
    const payloadTotal = this.toBigInt(row?.payload_total ?? 0);
    const sizeTotal = this.toBigInt(row?.size_total ?? 0);
    if (payloadTotal <= 0n || sizeTotal <= 0n)
      return null;
    return Number(sizeTotal) / Number(payloadTotal);
  }
  countPendingSegments() {
    const row = this.stmts.countPendingSegments.get();
    return row ? Number(row.cnt) : 0;
  }
  countSegmentsForStream(stream) {
    const row = this.stmts.countSegmentsForStream.get(stream);
    return row ? Number(row.cnt) : 0;
  }
  getSegmentMeta(stream) {
    const row = this.stmts.getSegmentMeta.get(stream);
    if (!row)
      return null;
    const offsets = row.segment_offsets instanceof Uint8Array ? row.segment_offsets : new Uint8Array(row.segment_offsets);
    const blocks = row.segment_blocks instanceof Uint8Array ? row.segment_blocks : new Uint8Array(row.segment_blocks);
    const lastTs = row.segment_last_ts instanceof Uint8Array ? row.segment_last_ts : new Uint8Array(row.segment_last_ts);
    return {
      stream: String(row.stream),
      segment_count: Number(row.segment_count),
      segment_offsets: offsets,
      segment_blocks: blocks,
      segment_last_ts: lastTs
    };
  }
  ensureSegmentMeta(stream) {
    this.stmts.ensureSegmentMeta.run(stream);
  }
  appendSegmentMeta(stream, offsetPlusOne, blockCount, lastAppendNs) {
    this.ensureSegmentMeta(stream);
    const offsetBytes = this.encodeU64Le(offsetPlusOne);
    const blockBytes = this.encodeU32Le(blockCount);
    const tsBytes = this.encodeU64Le(lastAppendNs);
    this.stmts.appendSegmentMeta.run(offsetBytes, blockBytes, tsBytes, stream);
  }
  upsertSegmentMeta(stream, count, offsets, blocks, lastTs) {
    this.stmts.upsertSegmentMeta.run(stream, count, offsets, blocks, lastTs);
  }
  rebuildSegmentMeta(stream) {
    const rows = this.db.query(`SELECT end_offset, block_count, last_append_ms
         FROM segments WHERE stream=? ORDER BY segment_index ASC;`).all(stream);
    const count = rows.length;
    const offsets = new Uint8Array(count * 8);
    const blocks = new Uint8Array(count * 4);
    const lastTs = new Uint8Array(count * 8);
    const dvOffsets = new DataView(offsets.buffer, offsets.byteOffset, offsets.byteLength);
    const dvBlocks = new DataView(blocks.buffer, blocks.byteOffset, blocks.byteLength);
    const dvLastTs = new DataView(lastTs.buffer, lastTs.byteOffset, lastTs.byteLength);
    for (let i = 0;i < rows.length; i++) {
      const endOffset = this.toBigInt(rows[i].end_offset);
      const blockCount = Number(rows[i].block_count);
      const lastAppendMs = this.toBigInt(rows[i].last_append_ms);
      dvOffsets.setBigUint64(i * 8, endOffset + 1n, true);
      dvBlocks.setUint32(i * 4, blockCount >>> 0, true);
      dvLastTs.setBigUint64(i * 8, lastAppendMs * 1000000n, true);
    }
    this.upsertSegmentMeta(stream, count, offsets, blocks, lastTs);
    return { stream, segment_count: count, segment_offsets: offsets, segment_blocks: blocks, segment_last_ts: lastTs };
  }
  setUploadedSegmentCount(stream, count) {
    this.stmts.setUploadedSegmentCount.run(count, this.nowMs(), stream);
  }
  advanceUploadedSegmentCount(stream) {
    const row = this.getStream(stream);
    if (!row)
      return 0;
    let count = row.uploaded_segment_count ?? 0;
    for (;; ) {
      const seg = this.getSegmentByIndex(stream, count);
      if (!seg || !seg.r2_etag)
        break;
      count += 1;
    }
    if (count !== row.uploaded_segment_count) {
      this.stmts.setUploadedSegmentCount.run(count, this.nowMs(), stream);
    }
    return count;
  }
  markSegmentUploaded(segmentId, etag, uploadedAtMs) {
    this.stmts.markSegmentUploaded.run(etag, uploadedAtMs, segmentId);
  }
  setStreamSealedThrough(stream, sealedThrough, bytesSealed, rowsSealed) {
    const now = this.nowMs();
    this.db.query(`UPDATE streams
       SET sealed_through = ?,
           pending_bytes = CASE WHEN pending_bytes >= ? THEN pending_bytes - ? ELSE 0 END,
           pending_rows = CASE WHEN pending_rows >= ? THEN pending_rows - ? ELSE 0 END,
           last_segment_cut_ms = ?,
           updated_at_ms = ?
       WHERE stream = ?;`).run(sealedThrough, bytesSealed, bytesSealed, rowsSealed, rowsSealed, now, now, stream);
  }
  setSegmentInProgress(stream, inProgress) {
    this.db.query(`UPDATE streams SET segment_in_progress=?, updated_at_ms=? WHERE stream=?;`).run(inProgress, this.nowMs(), stream);
  }
  tryClaimSegment(stream) {
    const res = this.stmts.tryClaimSegment.run(this.nowMs(), stream);
    const changes = typeof res?.changes === "bigint" ? res.changes : BigInt(Number(res?.changes ?? 0));
    return changes > 0n;
  }
  resetSegmentInProgress() {
    this.db.query(`UPDATE streams SET segment_in_progress=0 WHERE segment_in_progress != 0;`).run();
  }
  advanceUploadedThrough(stream, uploadedThrough) {
    this.stmts.advanceUploadedThrough.run(uploadedThrough, this.nowMs(), stream);
  }
  deleteWalThrough(stream, uploadedThrough) {
    const tx = this.db.transaction(() => {
      const { deletedRows: rows, deletedBytes: bytes } = this.deleteWalThroughWithStats(stream, uploadedThrough);
      if (rows <= 0n)
        return { deletedRows: 0, deletedBytes: 0 };
      const now = this.nowMs();
      this.db.query(`UPDATE streams
         SET wal_bytes = CASE WHEN wal_bytes >= ? THEN wal_bytes - ? ELSE 0 END,
             wal_rows = CASE WHEN wal_rows >= ? THEN wal_rows - ? ELSE 0 END,
             updated_at_ms = ?
         WHERE stream = ?;`).run(bytes, bytes, rows, rows, now, stream);
      const deletedBytes = bytes <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(bytes) : Number.MAX_SAFE_INTEGER;
      const deletedRows = rows <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(rows) : Number.MAX_SAFE_INTEGER;
      return { deletedRows, deletedBytes };
    });
    return tx();
  }
  getManifestRow(stream) {
    const row = this.stmts.getManifest.get(stream);
    if (!row) {
      this.stmts.upsertManifest.run(stream, 0, 0, null, null, null);
      const fresh = this.stmts.getManifest.get(stream);
      return {
        stream: String(fresh.stream),
        generation: Number(fresh.generation),
        uploaded_generation: Number(fresh.uploaded_generation),
        last_uploaded_at_ms: fresh.last_uploaded_at_ms == null ? null : this.toBigInt(fresh.last_uploaded_at_ms),
        last_uploaded_etag: fresh.last_uploaded_etag == null ? null : String(fresh.last_uploaded_etag),
        last_uploaded_size_bytes: fresh.last_uploaded_size_bytes == null ? null : this.toBigInt(fresh.last_uploaded_size_bytes)
      };
    }
    return {
      stream: String(row.stream),
      generation: Number(row.generation),
      uploaded_generation: Number(row.uploaded_generation),
      last_uploaded_at_ms: row.last_uploaded_at_ms == null ? null : this.toBigInt(row.last_uploaded_at_ms),
      last_uploaded_etag: row.last_uploaded_etag == null ? null : String(row.last_uploaded_etag),
      last_uploaded_size_bytes: row.last_uploaded_size_bytes == null ? null : this.toBigInt(row.last_uploaded_size_bytes)
    };
  }
  upsertManifestRow(stream, generation, uploadedGeneration, uploadedAtMs, etag, sizeBytes) {
    this.stmts.upsertManifest.run(stream, generation, uploadedGeneration, uploadedAtMs, etag, sizeBytes);
  }
  getIndexState(stream) {
    const row = this.stmts.getIndexState.get(stream);
    if (!row)
      return null;
    return {
      stream: String(row.stream),
      index_secret: row.index_secret instanceof Uint8Array ? row.index_secret : new Uint8Array(row.index_secret),
      indexed_through: Number(row.indexed_through),
      updated_at_ms: this.toBigInt(row.updated_at_ms)
    };
  }
  upsertIndexState(stream, indexSecret, indexedThrough) {
    this.stmts.upsertIndexState.run(stream, indexSecret, indexedThrough, this.nowMs());
  }
  updateIndexedThrough(stream, indexedThrough) {
    this.stmts.updateIndexedThrough.run(indexedThrough, this.nowMs(), stream);
  }
  listIndexRuns(stream) {
    const rows = this.stmts.listIndexRuns.all(stream);
    return rows.map((r) => ({
      run_id: String(r.run_id),
      stream: String(r.stream),
      level: Number(r.level),
      start_segment: Number(r.start_segment),
      end_segment: Number(r.end_segment),
      object_key: String(r.object_key),
      size_bytes: Number(r.size_bytes ?? 0),
      filter_len: Number(r.filter_len),
      record_count: Number(r.record_count),
      retired_gen: r.retired_gen == null ? null : Number(r.retired_gen),
      retired_at_ms: r.retired_at_ms == null ? null : this.toBigInt(r.retired_at_ms)
    }));
  }
  listIndexRunsAll(stream) {
    const rows = this.stmts.listIndexRunsAll.all(stream);
    return rows.map((r) => ({
      run_id: String(r.run_id),
      stream: String(r.stream),
      level: Number(r.level),
      start_segment: Number(r.start_segment),
      end_segment: Number(r.end_segment),
      object_key: String(r.object_key),
      size_bytes: Number(r.size_bytes ?? 0),
      filter_len: Number(r.filter_len),
      record_count: Number(r.record_count),
      retired_gen: r.retired_gen == null ? null : Number(r.retired_gen),
      retired_at_ms: r.retired_at_ms == null ? null : this.toBigInt(r.retired_at_ms)
    }));
  }
  listRetiredIndexRuns(stream) {
    const rows = this.stmts.listRetiredIndexRuns.all(stream);
    return rows.map((r) => ({
      run_id: String(r.run_id),
      stream: String(r.stream),
      level: Number(r.level),
      start_segment: Number(r.start_segment),
      end_segment: Number(r.end_segment),
      object_key: String(r.object_key),
      size_bytes: Number(r.size_bytes ?? 0),
      filter_len: Number(r.filter_len),
      record_count: Number(r.record_count),
      retired_gen: r.retired_gen == null ? null : Number(r.retired_gen),
      retired_at_ms: r.retired_at_ms == null ? null : this.toBigInt(r.retired_at_ms)
    }));
  }
  insertIndexRun(row) {
    this.stmts.insertIndexRun.run(row.run_id, row.stream, row.level, row.start_segment, row.end_segment, row.object_key, row.size_bytes, row.filter_len, row.record_count);
  }
  retireIndexRuns(runIds, retiredGen, retiredAtMs) {
    if (runIds.length === 0)
      return;
    const tx = this.db.transaction(() => {
      for (const runId of runIds) {
        this.stmts.retireIndexRun.run(retiredGen, retiredAtMs, runId);
      }
    });
    tx();
  }
  deleteIndexRuns(runIds) {
    if (runIds.length === 0)
      return;
    const tx = this.db.transaction(() => {
      for (const runId of runIds) {
        this.stmts.deleteIndexRun.run(runId);
      }
    });
    tx();
  }
  deleteIndex(stream) {
    const tx = this.db.transaction(() => {
      this.db.query(`DELETE FROM index_runs WHERE stream=?;`).run(stream);
      this.db.query(`DELETE FROM index_state WHERE stream=?;`).run(stream);
    });
    tx();
  }
  countUploadedSegments(stream) {
    const row = this.stmts.countUploadedSegments.get(stream);
    const maxIdx = row ? Number(row.max_idx) : -1;
    return maxIdx >= 0 ? maxIdx + 1 : 0;
  }
  getSecondaryIndexState(stream, indexName) {
    const row = this.stmts.getSecondaryIndexState.get(stream, indexName);
    if (!row)
      return null;
    return {
      stream: String(row.stream),
      index_name: String(row.index_name),
      index_secret: row.index_secret instanceof Uint8Array ? row.index_secret : new Uint8Array(row.index_secret),
      config_hash: String(row.config_hash ?? ""),
      indexed_through: Number(row.indexed_through),
      updated_at_ms: this.toBigInt(row.updated_at_ms)
    };
  }
  listSecondaryIndexStates(stream) {
    const rows = this.stmts.listSecondaryIndexStates.all(stream);
    return rows.map((row) => ({
      stream: String(row.stream),
      index_name: String(row.index_name),
      index_secret: row.index_secret instanceof Uint8Array ? row.index_secret : new Uint8Array(row.index_secret),
      config_hash: String(row.config_hash ?? ""),
      indexed_through: Number(row.indexed_through),
      updated_at_ms: this.toBigInt(row.updated_at_ms)
    }));
  }
  upsertSecondaryIndexState(stream, indexName, indexSecret, configHash, indexedThrough) {
    this.stmts.upsertSecondaryIndexState.run(stream, indexName, indexSecret, configHash, indexedThrough, this.nowMs());
  }
  updateSecondaryIndexedThrough(stream, indexName, indexedThrough) {
    this.stmts.updateSecondaryIndexedThrough.run(indexedThrough, this.nowMs(), stream, indexName);
  }
  listSecondaryIndexRuns(stream, indexName) {
    const rows = this.stmts.listSecondaryIndexRuns.all(stream, indexName);
    return rows.map((r) => ({
      run_id: String(r.run_id),
      stream: String(r.stream),
      index_name: String(r.index_name),
      level: Number(r.level),
      start_segment: Number(r.start_segment),
      end_segment: Number(r.end_segment),
      object_key: String(r.object_key),
      size_bytes: Number(r.size_bytes ?? 0),
      filter_len: Number(r.filter_len),
      record_count: Number(r.record_count),
      retired_gen: r.retired_gen == null ? null : Number(r.retired_gen),
      retired_at_ms: r.retired_at_ms == null ? null : this.toBigInt(r.retired_at_ms)
    }));
  }
  listSecondaryIndexRunsAll(stream, indexName) {
    const rows = this.stmts.listSecondaryIndexRunsAll.all(stream, indexName);
    return rows.map((r) => ({
      run_id: String(r.run_id),
      stream: String(r.stream),
      index_name: String(r.index_name),
      level: Number(r.level),
      start_segment: Number(r.start_segment),
      end_segment: Number(r.end_segment),
      object_key: String(r.object_key),
      size_bytes: Number(r.size_bytes ?? 0),
      filter_len: Number(r.filter_len),
      record_count: Number(r.record_count),
      retired_gen: r.retired_gen == null ? null : Number(r.retired_gen),
      retired_at_ms: r.retired_at_ms == null ? null : this.toBigInt(r.retired_at_ms)
    }));
  }
  listRetiredSecondaryIndexRuns(stream, indexName) {
    const rows = this.stmts.listRetiredSecondaryIndexRuns.all(stream, indexName);
    return rows.map((r) => ({
      run_id: String(r.run_id),
      stream: String(r.stream),
      index_name: String(r.index_name),
      level: Number(r.level),
      start_segment: Number(r.start_segment),
      end_segment: Number(r.end_segment),
      object_key: String(r.object_key),
      size_bytes: Number(r.size_bytes ?? 0),
      filter_len: Number(r.filter_len),
      record_count: Number(r.record_count),
      retired_gen: r.retired_gen == null ? null : Number(r.retired_gen),
      retired_at_ms: r.retired_at_ms == null ? null : this.toBigInt(r.retired_at_ms)
    }));
  }
  insertSecondaryIndexRun(row) {
    this.stmts.insertSecondaryIndexRun.run(row.run_id, row.stream, row.index_name, row.level, row.start_segment, row.end_segment, row.object_key, row.size_bytes, row.filter_len, row.record_count);
  }
  retireSecondaryIndexRuns(runIds, retiredGen, retiredAtMs) {
    if (runIds.length === 0)
      return;
    const tx = this.db.transaction(() => {
      for (const runId of runIds) {
        this.stmts.retireSecondaryIndexRun.run(retiredGen, retiredAtMs, runId);
      }
    });
    tx();
  }
  deleteSecondaryIndexRuns(runIds) {
    if (runIds.length === 0)
      return;
    const tx = this.db.transaction(() => {
      for (const runId of runIds) {
        this.stmts.deleteSecondaryIndexRun.run(runId);
      }
    });
    tx();
  }
  deleteSecondaryIndex(stream, indexName) {
    const tx = this.db.transaction(() => {
      this.stmts.deleteSecondaryIndexRunsForIndex.run(stream, indexName);
      this.stmts.deleteSecondaryIndexState.run(stream, indexName);
    });
    tx();
  }
  getLexiconIndexState(stream, sourceKind, sourceName) {
    const row = this.stmts.getLexiconIndexState.get(stream, sourceKind, sourceName);
    if (!row)
      return null;
    return {
      stream: String(row.stream),
      source_kind: String(row.source_kind),
      source_name: String(row.source_name),
      indexed_through: Number(row.indexed_through),
      updated_at_ms: this.toBigInt(row.updated_at_ms)
    };
  }
  listLexiconIndexStates(stream) {
    const rows = this.stmts.listLexiconIndexStates.all(stream);
    return rows.map((row) => ({
      stream: String(row.stream),
      source_kind: String(row.source_kind),
      source_name: String(row.source_name),
      indexed_through: Number(row.indexed_through),
      updated_at_ms: this.toBigInt(row.updated_at_ms)
    }));
  }
  upsertLexiconIndexState(stream, sourceKind, sourceName, indexedThrough) {
    this.stmts.upsertLexiconIndexState.run(stream, sourceKind, sourceName, indexedThrough, this.nowMs());
  }
  updateLexiconIndexedThrough(stream, sourceKind, sourceName, indexedThrough) {
    this.stmts.updateLexiconIndexedThrough.run(indexedThrough, this.nowMs(), stream, sourceKind, sourceName);
  }
  listLexiconIndexRuns(stream, sourceKind, sourceName) {
    const rows = this.stmts.listLexiconIndexRuns.all(stream, sourceKind, sourceName);
    return rows.map((row) => ({
      run_id: String(row.run_id),
      stream: String(row.stream),
      source_kind: String(row.source_kind),
      source_name: String(row.source_name),
      level: Number(row.level),
      start_segment: Number(row.start_segment),
      end_segment: Number(row.end_segment),
      object_key: String(row.object_key),
      size_bytes: Number(row.size_bytes ?? 0),
      record_count: Number(row.record_count ?? 0),
      retired_gen: row.retired_gen == null ? null : Number(row.retired_gen),
      retired_at_ms: row.retired_at_ms == null ? null : this.toBigInt(row.retired_at_ms)
    }));
  }
  listLexiconIndexRunsAll(stream, sourceKind, sourceName) {
    const rows = this.stmts.listLexiconIndexRunsAll.all(stream, sourceKind, sourceName);
    return rows.map((row) => ({
      run_id: String(row.run_id),
      stream: String(row.stream),
      source_kind: String(row.source_kind),
      source_name: String(row.source_name),
      level: Number(row.level),
      start_segment: Number(row.start_segment),
      end_segment: Number(row.end_segment),
      object_key: String(row.object_key),
      size_bytes: Number(row.size_bytes ?? 0),
      record_count: Number(row.record_count ?? 0),
      retired_gen: row.retired_gen == null ? null : Number(row.retired_gen),
      retired_at_ms: row.retired_at_ms == null ? null : this.toBigInt(row.retired_at_ms)
    }));
  }
  listRetiredLexiconIndexRuns(stream, sourceKind, sourceName) {
    const rows = this.stmts.listRetiredLexiconIndexRuns.all(stream, sourceKind, sourceName);
    return rows.map((row) => ({
      run_id: String(row.run_id),
      stream: String(row.stream),
      source_kind: String(row.source_kind),
      source_name: String(row.source_name),
      level: Number(row.level),
      start_segment: Number(row.start_segment),
      end_segment: Number(row.end_segment),
      object_key: String(row.object_key),
      size_bytes: Number(row.size_bytes ?? 0),
      record_count: Number(row.record_count ?? 0),
      retired_gen: row.retired_gen == null ? null : Number(row.retired_gen),
      retired_at_ms: row.retired_at_ms == null ? null : this.toBigInt(row.retired_at_ms)
    }));
  }
  insertLexiconIndexRun(row) {
    this.stmts.insertLexiconIndexRun.run(row.run_id, row.stream, row.source_kind, row.source_name, row.level, row.start_segment, row.end_segment, row.object_key, row.size_bytes, row.record_count);
  }
  retireLexiconIndexRuns(runIds, retiredGen, retiredAtMs) {
    if (runIds.length === 0)
      return;
    const tx = this.db.transaction(() => {
      for (const runId of runIds) {
        this.stmts.retireLexiconIndexRun.run(retiredGen, retiredAtMs, runId);
      }
    });
    tx();
  }
  deleteLexiconIndexRuns(runIds) {
    if (runIds.length === 0)
      return;
    const tx = this.db.transaction(() => {
      for (const runId of runIds) {
        this.stmts.deleteLexiconIndexRun.run(runId);
      }
    });
    tx();
  }
  deleteLexiconIndexSource(stream, sourceKind, sourceName) {
    const tx = this.db.transaction(() => {
      this.stmts.deleteLexiconIndexRunsForSource.run(stream, sourceKind, sourceName);
      this.stmts.deleteLexiconIndexState.run(stream, sourceKind, sourceName);
    });
    tx();
  }
  getSearchCompanionPlan(stream) {
    const row = this.stmts.getSearchCompanionPlan.get(stream);
    if (!row)
      return null;
    return {
      stream: String(row.stream),
      generation: Number(row.generation),
      plan_hash: String(row.plan_hash),
      plan_json: String(row.plan_json),
      updated_at_ms: this.toBigInt(row.updated_at_ms)
    };
  }
  listSearchCompanionPlanStreams() {
    const rows = this.stmts.listSearchCompanionPlanStreams.all();
    return rows.map((row) => String(row.stream));
  }
  upsertSearchCompanionPlan(stream, generation, planHash, planJson) {
    this.stmts.upsertSearchCompanionPlan.run(stream, generation, planHash, planJson, this.nowMs());
  }
  deleteSearchCompanionPlan(stream) {
    this.stmts.deleteSearchCompanionPlan.run(stream);
  }
  listSearchSegmentCompanions(stream) {
    const rows = this.stmts.listSearchSegmentCompanions.all(stream);
    return rows.map((row) => ({
      stream: String(row.stream),
      segment_index: Number(row.segment_index),
      object_key: String(row.object_key),
      plan_generation: Number(row.plan_generation),
      sections_json: String(row.sections_json),
      section_sizes_json: String(row.section_sizes_json ?? "{}"),
      size_bytes: Number(row.size_bytes ?? 0),
      primary_timestamp_min_ms: row.primary_timestamp_min_ms == null ? null : this.toBigInt(row.primary_timestamp_min_ms),
      primary_timestamp_max_ms: row.primary_timestamp_max_ms == null ? null : this.toBigInt(row.primary_timestamp_max_ms),
      updated_at_ms: this.toBigInt(row.updated_at_ms)
    }));
  }
  getSearchSegmentCompanion(stream, segmentIndex) {
    const row = this.stmts.getSearchSegmentCompanion.get(stream, segmentIndex);
    if (!row)
      return null;
    return {
      stream: String(row.stream),
      segment_index: Number(row.segment_index),
      object_key: String(row.object_key),
      plan_generation: Number(row.plan_generation),
      sections_json: String(row.sections_json),
      section_sizes_json: String(row.section_sizes_json ?? "{}"),
      size_bytes: Number(row.size_bytes ?? 0),
      primary_timestamp_min_ms: row.primary_timestamp_min_ms == null ? null : this.toBigInt(row.primary_timestamp_min_ms),
      primary_timestamp_max_ms: row.primary_timestamp_max_ms == null ? null : this.toBigInt(row.primary_timestamp_max_ms),
      updated_at_ms: this.toBigInt(row.updated_at_ms)
    };
  }
  upsertSearchSegmentCompanion(stream, segmentIndex, objectKey, planGeneration, sectionsJson, sectionSizesJson, sizeBytes, primaryTimestampMinMs, primaryTimestampMaxMs) {
    this.stmts.upsertSearchSegmentCompanion.run(stream, segmentIndex, objectKey, planGeneration, sectionsJson, sectionSizesJson, sizeBytes, primaryTimestampMinMs, primaryTimestampMaxMs, this.nowMs());
  }
  deleteSearchSegmentCompanionsBeforeGeneration(stream, generation) {
    this.stmts.deleteSearchSegmentCompanionsFromGeneration.run(stream, generation);
  }
  deleteSearchSegmentCompanionsFrom(stream, segmentIndex) {
    this.stmts.deleteSearchSegmentCompanionsFromIndex.run(stream, segmentIndex);
  }
  deleteSearchSegmentCompanions(stream) {
    this.stmts.deleteSearchSegmentCompanions.run(stream);
  }
  commitManifest(stream, generation, etag, uploadedAtMs, uploadedThrough, sizeBytes) {
    const tx = this.db.transaction(() => {
      this.stmts.upsertManifest.run(stream, generation, generation, uploadedAtMs, etag, sizeBytes);
      this.stmts.advanceUploadedThrough.run(uploadedThrough, this.nowMs(), stream);
      let gcThrough = uploadedThrough;
      const touchState = this.stmts.getStreamTouchState.get(stream);
      if (touchState) {
        const processedThrough = this.toBigInt(touchState.processed_through);
        gcThrough = processedThrough < gcThrough ? processedThrough : gcThrough;
      }
      if (gcThrough < 0n)
        return;
      const { deletedRows: rows, deletedBytes: bytes } = this.deleteWalThroughWithStats(stream, gcThrough, {
        maxRows: BASE_WAL_GC_CHUNK_OFFSETS
      });
      if (rows <= 0n)
        return;
      const now = this.nowMs();
      this.db.query(`UPDATE streams
         SET wal_bytes = CASE WHEN wal_bytes >= ? THEN wal_bytes - ? ELSE 0 END,
             wal_rows = CASE WHEN wal_rows >= ? THEN wal_rows - ? ELSE 0 END,
             updated_at_ms = ?
         WHERE stream = ?;`).run(bytes, bytes, rows, rows, now, stream);
    });
    tx();
  }
  recordObjectStoreRequestByHash(streamHash, artifact, op, bytes = 0, count = 1) {
    if (!streamHash || !artifact || !op)
      return;
    this.stmts.recordObjectStoreRequest.run(streamHash, artifact, op, count, bytes, this.nowMs());
  }
  getObjectStoreRequestSummaryByHash(streamHash) {
    const rows = this.db.query(`SELECT artifact, op, count
         FROM objectstore_request_counts
         WHERE stream_hash=?
         ORDER BY artifact ASC, op ASC;`).all(streamHash);
    const byArtifact = new Map;
    let puts = 0n;
    let gets = 0n;
    let heads = 0n;
    let lists = 0n;
    let deletes = 0n;
    for (const row of rows) {
      const artifact = String(row.artifact);
      const op = String(row.op);
      const count = this.toBigInt(row.count ?? 0);
      const entry = byArtifact.get(artifact) ?? { puts: 0n, gets: 0n, heads: 0n, lists: 0n, deletes: 0n, reads: 0n };
      if (op === "put") {
        entry.puts += count;
        puts += count;
      } else if (op === "get") {
        entry.gets += count;
        entry.reads += count;
        gets += count;
      } else if (op === "head") {
        entry.heads += count;
        entry.reads += count;
        heads += count;
      } else if (op === "list") {
        entry.lists += count;
        entry.reads += count;
        lists += count;
      } else if (op === "delete") {
        entry.deletes += count;
        deletes += count;
      }
      byArtifact.set(artifact, entry);
    }
    return {
      puts,
      reads: gets + heads + lists,
      gets,
      heads,
      lists,
      deletes,
      by_artifact: Array.from(byArtifact.entries()).map(([artifact, entry]) => ({ artifact, ...entry }))
    };
  }
  getUploadedSegmentBytes(stream) {
    const row = this.db.query(`SELECT COALESCE(SUM(size_bytes), 0) as total FROM segments WHERE stream=? AND r2_etag IS NOT NULL;`).get(stream);
    return this.toBigInt(row?.total ?? 0);
  }
  getPendingSealedSegmentBytes(stream) {
    const row = this.db.query(`SELECT COALESCE(SUM(size_bytes), 0) as total FROM segments WHERE stream=? AND uploaded_at_ms IS NULL;`).get(stream);
    return this.toBigInt(row?.total ?? 0);
  }
  getRoutingIndexStorage(stream) {
    const row = this.db.query(`SELECT COUNT(*) as cnt, COALESCE(SUM(size_bytes), 0) as total FROM index_runs WHERE stream=?;`).get(stream);
    return {
      object_count: Number(row?.cnt ?? 0),
      bytes: this.toBigInt(row?.total ?? 0)
    };
  }
  getSecondaryIndexStorage(stream) {
    const rows = this.db.query(`SELECT index_name, COUNT(*) as cnt, COALESCE(SUM(size_bytes), 0) as total
         FROM secondary_index_runs
         WHERE stream=?
         GROUP BY index_name
         ORDER BY index_name ASC;`).all(stream);
    return rows.map((row) => ({
      index_name: String(row.index_name),
      object_count: Number(row.cnt ?? 0),
      bytes: this.toBigInt(row.total ?? 0)
    }));
  }
  getLexiconIndexStorage(stream) {
    const rows = this.db.query(`SELECT source_kind, source_name, COUNT(*) as cnt, COALESCE(SUM(size_bytes), 0) as total
         FROM lexicon_index_runs
         WHERE stream=?
         GROUP BY source_kind, source_name
         ORDER BY source_kind ASC, source_name ASC;`).all(stream);
    return rows.map((row) => ({
      source_kind: String(row.source_kind),
      source_name: String(row.source_name),
      object_count: Number(row.cnt ?? 0),
      bytes: this.toBigInt(row.total ?? 0)
    }));
  }
  getBundledCompanionStorage(stream) {
    const row = this.db.query(`SELECT COUNT(*) as cnt, COALESCE(SUM(size_bytes), 0) as total FROM search_segment_companions WHERE stream=?;`).get(stream);
    return {
      object_count: Number(row?.cnt ?? 0),
      bytes: this.toBigInt(row?.total ?? 0)
    };
  }
  getSegmentLastAppendMsFromMeta(stream, segmentIndex) {
    const meta = this.getSegmentMeta(stream);
    if (!meta)
      return null;
    if (segmentIndex < 0 || segmentIndex >= meta.segment_count)
      return null;
    const off = segmentIndex * 8;
    if (off + 8 > meta.segment_last_ts.byteLength)
      return null;
    const dv = new DataView(meta.segment_last_ts.buffer, meta.segment_last_ts.byteOffset, meta.segment_last_ts.byteLength);
    return dv.getBigUint64(off, true) / 1000000n;
  }
  candidates(minPendingBytes, minPendingRows, maxIntervalMs, limit) {
    if (maxIntervalMs <= 0n) {
      return this.stmts.candidateStreamsNoInterval.all(STREAM_FLAG_DELETED | STREAM_FLAG_TOUCH, minPendingBytes, minPendingRows, limit);
    }
    const now = this.nowMs();
    return this.stmts.candidateStreams.all(STREAM_FLAG_DELETED | STREAM_FLAG_TOUCH, minPendingBytes, minPendingRows, now, maxIntervalMs, limit);
  }
}

// src/profiles/index.ts
import { Result as Result24 } from "better-result";

// src/util/lru.ts
class LruCache {
  maxEntries;
  map = new Map;
  constructor(maxEntries) {
    if (maxEntries <= 0)
      throw dsError("maxEntries must be > 0");
    this.maxEntries = maxEntries;
  }
  get size() {
    return this.map.size;
  }
  get(key) {
    const value = this.map.get(key);
    if (value === undefined)
      return;
    this.map.delete(key);
    this.map.set(key, value);
    return value;
  }
  set(key, value) {
    if (this.map.has(key))
      this.map.delete(key);
    this.map.set(key, value);
    while (this.map.size > this.maxEntries) {
      const oldest = this.map.keys().next();
      if (oldest.done)
        break;
      this.map.delete(oldest.value);
    }
  }
  has(key) {
    return this.map.has(key);
  }
  delete(key) {
    return this.map.delete(key);
  }
  clear() {
    this.map.clear();
  }
  values() {
    return this.map.values();
  }
  entries() {
    return this.map.entries();
  }
}

// src/profiles/generic.ts
import { Result as Result3 } from "better-result";

// src/profiles/profile.ts
import { Result as Result2 } from "better-result";
var DEFAULT_STREAM_PROFILE = "generic";
function isPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function expectPlainObjectResult(value, path) {
  if (!isPlainObject(value))
    return Result2.err({ message: `${path} must be an object` });
  return Result2.ok(value);
}
function rejectUnknownKeysResult(obj, allowed, path) {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(obj)) {
    if (!allowedSet.has(key))
      return Result2.err({ message: `${path}.${key} is not supported` });
  }
  return Result2.ok(undefined);
}
function normalizeProfileContentType(value) {
  if (!value)
    return null;
  const base = value.split(";")[0]?.trim().toLowerCase();
  return base ? base : null;
}
function parseStoredProfileJsonResult(raw) {
  try {
    return Result2.ok(JSON.parse(raw));
  } catch (e) {
    return Result2.err({ message: String(e?.message ?? e) });
  }
}
function cloneStreamProfileSpec(profile) {
  return structuredClone(profile);
}

// src/profiles/generic.ts
function cloneGenericProfile() {
  return { kind: "generic" };
}
var GENERIC_STREAM_PROFILE_DEFINITION = {
  kind: "generic",
  usesStoredProfileRow: false,
  defaultProfile() {
    return cloneGenericProfile();
  },
  validateResult(raw, path) {
    const objRes = expectPlainObjectResult(raw, path);
    if (Result3.isError(objRes))
      return objRes;
    if (objRes.value.kind !== "generic") {
      return Result3.err({ message: `${path}.kind must be generic` });
    }
    const keyCheck = rejectUnknownKeysResult(objRes.value, ["kind"], path);
    if (Result3.isError(keyCheck))
      return keyCheck;
    return Result3.ok(cloneGenericProfile());
  },
  readProfileResult() {
    return Result3.ok({ profile: cloneGenericProfile(), cache: null });
  },
  persistProfileResult({ db, stream }) {
    db.updateStreamProfile(stream, "generic");
    db.deleteStreamProfile(stream);
    db.deleteStreamTouchState(stream);
    const profile = cloneStreamProfileSpec(cloneGenericProfile());
    return Result3.ok({ profile, cache: null, schemaRegistry: null });
  }
};

// src/profiles/evlog.ts
import { Result as Result9 } from "better-result";

// src/schema/registry.ts
import Ajv from "ajv";
import { Result as Result8 } from "better-result";

// src/schema/lens_schema.ts
var DURABLE_LENS_V1_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://example.com/schemas/durable-lens-v1.schema.json",
  title: "Durable Stream Lens Spec",
  type: "object",
  additionalProperties: false,
  required: ["apiVersion", "schema", "from", "to", "ops"],
  properties: {
    apiVersion: {
      type: "string",
      const: "durable.lens/v1"
    },
    schema: {
      type: "string",
      minLength: 1,
      description: "Logical stream schema/type name (e.g., 'Task')."
    },
    from: {
      type: "integer",
      minimum: 0,
      description: "Source schema version."
    },
    to: {
      type: "integer",
      minimum: 0,
      description: "Target schema version."
    },
    description: {
      type: "string"
    },
    ops: {
      type: "array",
      minItems: 1,
      items: { $ref: "#/$defs/op" }
    }
  },
  $defs: {
    jsonPointer: {
      type: "string",
      description: "RFC 6901 JSON Pointer. Empty string refers to the document root.",
      pattern: "^(?:/(?:[^~/]|~0|~1)*)*$"
    },
    jsonScalar: {
      description: "JSON scalar value.",
      type: ["string", "number", "integer", "boolean", "null"]
    },
    embeddedJsonSchema: {
      description: "An embedded JSON Schema fragment (object or boolean).",
      anyOf: [{ type: "object" }, { type: "boolean" }]
    },
    mapTransform: {
      type: "object",
      additionalProperties: false,
      required: ["map"],
      properties: {
        map: {
          type: "object",
          description: "Mapping table for values. Keys must be strings; values are JSON scalars.",
          additionalProperties: { $ref: "#/$defs/jsonScalar" }
        },
        default: {
          $ref: "#/$defs/jsonScalar",
          description: "Default output value used when input is not found in map."
        }
      }
    },
    builtinTransform: {
      type: "object",
      additionalProperties: false,
      required: ["builtin"],
      properties: {
        builtin: {
          type: "string",
          minLength: 1,
          description: "Name of a built-in, version-stable transform implemented by the system."
        }
      }
    },
    convertTransform: {
      description: "Restricted conversion: either a total mapping table (+ optional default) or a built-in transform.",
      oneOf: [{ $ref: "#/$defs/mapTransform" }, { $ref: "#/$defs/builtinTransform" }]
    },
    opRename: {
      type: "object",
      additionalProperties: false,
      required: ["op", "from", "to"],
      properties: {
        op: { const: "rename" },
        from: { $ref: "#/$defs/jsonPointer" },
        to: { $ref: "#/$defs/jsonPointer" }
      }
    },
    opCopy: {
      type: "object",
      additionalProperties: false,
      required: ["op", "from", "to"],
      properties: {
        op: { const: "copy" },
        from: { $ref: "#/$defs/jsonPointer" },
        to: { $ref: "#/$defs/jsonPointer" }
      }
    },
    opAdd: {
      type: "object",
      additionalProperties: false,
      required: ["op", "path", "schema"],
      properties: {
        op: { const: "add" },
        path: { $ref: "#/$defs/jsonPointer" },
        schema: { $ref: "#/$defs/embeddedJsonSchema" },
        default: {
          description: "Default value to insert if the field is missing. If omitted, the runtime may derive a default when possible.",
          type: ["object", "array", "string", "number", "integer", "boolean", "null"]
        }
      }
    },
    opRemove: {
      type: "object",
      additionalProperties: false,
      required: ["op", "path", "schema"],
      properties: {
        op: { const: "remove" },
        path: { $ref: "#/$defs/jsonPointer" },
        schema: {
          $ref: "#/$defs/embeddedJsonSchema",
          description: "Schema of the removed field (required so the transformation remains declarative and reversible/validatable)."
        },
        default: {
          description: "Default to use when reconstructing the field (e.g., during backward reasoning/validation).",
          type: ["object", "array", "string", "number", "integer", "boolean", "null"]
        }
      }
    },
    opHoist: {
      type: "object",
      additionalProperties: false,
      required: ["op", "host", "name", "to"],
      properties: {
        op: { const: "hoist" },
        host: {
          $ref: "#/$defs/jsonPointer",
          description: "Pointer to an object field that contains the nested value."
        },
        name: {
          type: "string",
          minLength: 1,
          description: "Field name inside host to move outward."
        },
        to: {
          $ref: "#/$defs/jsonPointer",
          description: "Destination pointer for the hoisted value."
        },
        removeFromHost: {
          type: "boolean",
          default: true,
          description: "If true, remove the nested field from the host after hoisting."
        }
      }
    },
    opPlunge: {
      type: "object",
      additionalProperties: false,
      required: ["op", "from", "host", "name"],
      properties: {
        op: { const: "plunge" },
        from: {
          $ref: "#/$defs/jsonPointer",
          description: "Pointer to the source field to move inward."
        },
        host: {
          $ref: "#/$defs/jsonPointer",
          description: "Pointer to the destination object field."
        },
        name: {
          type: "string",
          minLength: 1,
          description: "Field name inside host to receive the value."
        },
        createHost: {
          type: "boolean",
          default: true,
          description: "If true, create the destination host object if missing."
        },
        removeFromSource: {
          type: "boolean",
          default: true,
          description: "If true, remove the source field after plunging."
        }
      }
    },
    opWrap: {
      type: "object",
      additionalProperties: false,
      required: ["op", "path", "mode"],
      properties: {
        op: { const: "wrap" },
        path: { $ref: "#/$defs/jsonPointer" },
        mode: {
          type: "string",
          enum: ["singleton"],
          description: "singleton: x -> [x]"
        },
        reverseMode: {
          type: "string",
          enum: ["first"],
          default: "first",
          description: "When reversing array->scalar, choose 'first'."
        }
      }
    },
    opHead: {
      type: "object",
      additionalProperties: false,
      required: ["op", "path"],
      properties: {
        op: { const: "head" },
        path: { $ref: "#/$defs/jsonPointer" },
        reverseMode: {
          type: "string",
          enum: ["singleton"],
          default: "singleton",
          description: "When reversing scalar->array, wrap as [scalar]."
        }
      }
    },
    opConvert: {
      type: "object",
      additionalProperties: false,
      required: ["op", "path", "fromType", "toType", "forward", "backward"],
      properties: {
        op: { const: "convert" },
        path: { $ref: "#/$defs/jsonPointer" },
        fromType: {
          type: "string",
          enum: ["string", "number", "integer", "boolean", "null", "object", "array"]
        },
        toType: {
          type: "string",
          enum: ["string", "number", "integer", "boolean", "null", "object", "array"]
        },
        forward: { $ref: "#/$defs/convertTransform" },
        backward: { $ref: "#/$defs/convertTransform" }
      }
    },
    opIn: {
      type: "object",
      additionalProperties: false,
      required: ["op", "path", "ops"],
      properties: {
        op: { const: "in" },
        path: { $ref: "#/$defs/jsonPointer" },
        ops: {
          type: "array",
          minItems: 1,
          items: { $ref: "#/$defs/op" }
        }
      }
    },
    opMap: {
      type: "object",
      additionalProperties: false,
      required: ["op", "path", "ops"],
      properties: {
        op: { const: "map" },
        path: { $ref: "#/$defs/jsonPointer" },
        ops: {
          type: "array",
          minItems: 1,
          items: { $ref: "#/$defs/op" }
        }
      }
    },
    op: {
      description: "A single lens operation.",
      oneOf: [
        { $ref: "#/$defs/opRename" },
        { $ref: "#/$defs/opCopy" },
        { $ref: "#/$defs/opAdd" },
        { $ref: "#/$defs/opRemove" },
        { $ref: "#/$defs/opHoist" },
        { $ref: "#/$defs/opPlunge" },
        { $ref: "#/$defs/opWrap" },
        { $ref: "#/$defs/opHead" },
        { $ref: "#/$defs/opConvert" },
        { $ref: "#/$defs/opIn" },
        { $ref: "#/$defs/opMap" }
      ]
    }
  }
};

// src/lens/lens.ts
import { Result as Result5 } from "better-result";

// src/util/json_pointer.ts
import { Result as Result4 } from "better-result";

// src/schema/proof.ts
import { Result as Result6 } from "better-result";

// src/util/duration.ts
import { Result as Result7 } from "better-result";

// src/schema/registry.ts
var SCHEMA_REGISTRY_API_VERSION = "durable.streams/schema-registry/v1";
var AJV = new Ajv({
  allErrors: true,
  strict: false,
  allowUnionTypes: true,
  validateSchema: false
});
function isDateTimeString(value) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
    return false;
  }
  return !Number.isNaN(Date.parse(value));
}
AJV.addFormat("date-time", {
  type: "string",
  validate: isDateTimeString
});
var LENS_VALIDATOR = AJV.compile(DURABLE_LENS_V1_SCHEMA);

// src/profiles/evlog/schema.ts
var EVLOG_CANONICAL_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    timestamp: { type: "string" },
    level: { type: "string", enum: ["debug", "info", "warn", "error"] },
    service: { type: ["string", "null"] },
    environment: { type: ["string", "null"] },
    version: { type: ["string", "null"] },
    region: { type: ["string", "null"] },
    requestId: { type: ["string", "null"] },
    traceId: { type: ["string", "null"] },
    spanId: { type: ["string", "null"] },
    method: { type: ["string", "null"] },
    path: { type: ["string", "null"] },
    status: { type: ["integer", "null"] },
    duration: { type: ["number", "null"] },
    message: { type: ["string", "null"] },
    why: { type: ["string", "null"] },
    fix: { type: ["string", "null"] },
    link: { type: ["string", "null"] },
    sampling: {
      type: ["object", "null"],
      additionalProperties: true
    },
    redaction: {
      type: "object",
      additionalProperties: false,
      properties: {
        keys: {
          type: "array",
          items: { type: "string" }
        }
      },
      required: ["keys"]
    },
    context: {
      type: "object",
      additionalProperties: true
    }
  },
  required: [
    "timestamp",
    "level",
    "service",
    "environment",
    "version",
    "region",
    "requestId",
    "traceId",
    "spanId",
    "method",
    "path",
    "status",
    "duration",
    "message",
    "why",
    "fix",
    "link",
    "sampling",
    "redaction",
    "context"
  ]
};
var EVLOG_DEFAULT_SEARCH_CONFIG = {
  profile: "evlog",
  primaryTimestampField: "timestamp",
  aliases: {
    env: "environment",
    msg: "message",
    req: "requestId",
    span: "spanId",
    time: "timestamp",
    trace: "traceId",
    ts: "timestamp"
  },
  defaultFields: [
    { field: "message", boost: 2 },
    { field: "why", boost: 1.5 },
    { field: "fix", boost: 1.25 },
    { field: "error.message", boost: 2 }
  ],
  fields: {
    timestamp: {
      kind: "date",
      bindings: [{ version: 1, jsonPointer: "/timestamp" }],
      exact: true,
      column: true,
      exists: true,
      sortable: true,
      aggregatable: true
    },
    level: {
      kind: "keyword",
      bindings: [{ version: 1, jsonPointer: "/level" }],
      normalizer: "lowercase_v1",
      exact: true,
      prefix: true,
      exists: true,
      sortable: true,
      aggregatable: true
    },
    service: {
      kind: "keyword",
      bindings: [{ version: 1, jsonPointer: "/service" }],
      normalizer: "lowercase_v1",
      exact: true,
      prefix: true,
      exists: true,
      sortable: true,
      aggregatable: true
    },
    environment: {
      kind: "keyword",
      bindings: [{ version: 1, jsonPointer: "/environment" }],
      normalizer: "lowercase_v1",
      exact: true,
      prefix: true,
      exists: true,
      sortable: true,
      aggregatable: true
    },
    requestId: {
      kind: "keyword",
      bindings: [{ version: 1, jsonPointer: "/requestId" }],
      exact: true,
      prefix: true,
      exists: true,
      sortable: true
    },
    traceId: {
      kind: "keyword",
      bindings: [{ version: 1, jsonPointer: "/traceId" }],
      exact: true,
      prefix: true,
      exists: true,
      sortable: true
    },
    spanId: {
      kind: "keyword",
      bindings: [{ version: 1, jsonPointer: "/spanId" }],
      exact: true,
      prefix: true,
      exists: true,
      sortable: true
    },
    path: {
      kind: "keyword",
      bindings: [{ version: 1, jsonPointer: "/path" }],
      exact: true,
      prefix: true,
      exists: true,
      sortable: true,
      aggregatable: true
    },
    method: {
      kind: "keyword",
      bindings: [{ version: 1, jsonPointer: "/method" }],
      normalizer: "lowercase_v1",
      exact: true,
      prefix: true,
      exists: true,
      sortable: true,
      aggregatable: true
    },
    status: {
      kind: "integer",
      bindings: [{ version: 1, jsonPointer: "/status" }],
      exact: true,
      column: true,
      exists: true,
      sortable: true,
      aggregatable: true
    },
    duration: {
      kind: "float",
      bindings: [{ version: 1, jsonPointer: "/duration" }],
      exact: true,
      column: true,
      exists: true,
      sortable: true,
      aggregatable: true
    },
    message: {
      kind: "text",
      bindings: [{ version: 1, jsonPointer: "/message" }],
      analyzer: "unicode_word_v1",
      exists: true,
      positions: true
    },
    why: {
      kind: "text",
      bindings: [{ version: 1, jsonPointer: "/why" }],
      analyzer: "unicode_word_v1",
      exists: true,
      positions: true
    },
    fix: {
      kind: "text",
      bindings: [{ version: 1, jsonPointer: "/fix" }],
      analyzer: "unicode_word_v1",
      exists: true,
      positions: true
    },
    "error.message": {
      kind: "text",
      bindings: [{ version: 1, jsonPointer: "/context/error/message" }],
      analyzer: "unicode_word_v1",
      exists: true,
      positions: true
    }
  }
};
function buildEvlogDefaultRegistry(stream) {
  return {
    apiVersion: SCHEMA_REGISTRY_API_VERSION,
    schema: stream,
    currentVersion: 1,
    search: structuredClone(EVLOG_DEFAULT_SEARCH_CONFIG),
    boundaries: [{ offset: 0, version: 1 }],
    schemas: {
      "1": structuredClone(EVLOG_CANONICAL_SCHEMA)
    },
    lenses: {}
  };
}

// src/profiles/evlog.ts
var DEFAULT_REDACT_KEYS = ["password", "token", "secret", "authorization", "cookie", "apikey"];
var REDACTED_VALUE = "[REDACTED]";
var EVLOG_RESERVED_FIELDS = new Set([
  "timestamp",
  "level",
  "service",
  "environment",
  "version",
  "region",
  "requestId",
  "traceId",
  "spanId",
  "method",
  "path",
  "status",
  "duration",
  "message",
  "why",
  "fix",
  "link",
  "sampling",
  "redaction",
  "context"
]);
function cloneEvlogProfile(profile) {
  return cloneStreamProfileSpec(profile);
}
function cloneEvlogCache(cache) {
  if (!cache || cache.profile.kind !== "evlog")
    return null;
  return {
    profile: cloneEvlogProfile(cache.profile),
    updatedAtMs: cache.updatedAtMs
  };
}
function isEvlogProfile(profile) {
  return !!profile && profile.kind === "evlog";
}
function parseRedactKeysResult(raw, path) {
  if (raw === undefined)
    return Result9.ok(undefined);
  if (!Array.isArray(raw))
    return Result9.err({ message: `${path} must be an array of strings` });
  if (raw.length > 64)
    return Result9.err({ message: `${path} too large (max 64)` });
  const normalized = [];
  const seen = new Set;
  for (const item of raw) {
    if (typeof item !== "string")
      return Result9.err({ message: `${path} must be an array of strings` });
    const value = item.trim().toLowerCase();
    if (value === "")
      return Result9.err({ message: `${path} must not contain empty strings` });
    if (seen.has(value))
      continue;
    seen.add(value);
    normalized.push(value);
  }
  return Result9.ok(normalized);
}
function parseStringListResult(raw, path, maxItems) {
  if (raw === undefined)
    return Result9.ok(undefined);
  if (!Array.isArray(raw))
    return Result9.err({ message: `${path} must be an array of strings` });
  if (raw.length > maxItems)
    return Result9.err({ message: `${path} too large (max ${maxItems})` });
  const out = [];
  const seen = new Set;
  for (const item of raw) {
    if (typeof item !== "string")
      return Result9.err({ message: `${path} must be an array of strings` });
    const value = item.trim();
    if (value === "")
      return Result9.err({ message: `${path} must not contain empty strings` });
    if (seen.has(value))
      continue;
    seen.add(value);
    out.push(value);
  }
  return Result9.ok(out);
}
function parseEvlogCorrelationResult(raw, path) {
  if (raw === undefined)
    return Result9.ok(undefined);
  const objRes = expectPlainObjectResult(raw, path);
  if (Result9.isError(objRes))
    return objRes;
  const keyCheck = rejectUnknownKeysResult(objRes.value, ["requestIdFields", "traceContextFields", "parseTraceparent"], path);
  if (Result9.isError(keyCheck))
    return keyCheck;
  const requestIdFieldsRes = parseStringListResult(objRes.value.requestIdFields, `${path}.requestIdFields`, 64);
  if (Result9.isError(requestIdFieldsRes))
    return requestIdFieldsRes;
  const traceContextFieldsRes = parseStringListResult(objRes.value.traceContextFields, `${path}.traceContextFields`, 64);
  if (Result9.isError(traceContextFieldsRes))
    return traceContextFieldsRes;
  if (objRes.value.parseTraceparent !== undefined && typeof objRes.value.parseTraceparent !== "boolean") {
    return Result9.err({ message: `${path}.parseTraceparent must be boolean` });
  }
  const correlation = {};
  if (requestIdFieldsRes.value)
    correlation.requestIdFields = requestIdFieldsRes.value;
  if (traceContextFieldsRes.value)
    correlation.traceContextFields = traceContextFieldsRes.value;
  if (objRes.value.parseTraceparent !== undefined)
    correlation.parseTraceparent = objRes.value.parseTraceparent;
  return Result9.ok(Object.keys(correlation).length > 0 ? correlation : undefined);
}
function parseStreamNameResult(raw, path) {
  if (raw === undefined)
    return Result9.ok(undefined);
  if (typeof raw !== "string")
    return Result9.err({ message: `${path} must be a string` });
  const value = raw.trim();
  if (value === "")
    return Result9.err({ message: `${path} must not be empty` });
  return Result9.ok(value);
}
function parseEvlogObservabilityResult(raw, path) {
  if (raw === undefined)
    return Result9.ok(undefined);
  const objRes = expectPlainObjectResult(raw, path);
  if (Result9.isError(objRes))
    return objRes;
  const keyCheck = rejectUnknownKeysResult(objRes.value, ["request"], path);
  if (Result9.isError(keyCheck))
    return keyCheck;
  if (objRes.value.request === undefined)
    return Result9.ok(undefined);
  const requestRes = expectPlainObjectResult(objRes.value.request, `${path}.request`);
  if (Result9.isError(requestRes))
    return requestRes;
  const requestKeyCheck = rejectUnknownKeysResult(requestRes.value, ["tracesStream"], `${path}.request`);
  if (Result9.isError(requestKeyCheck))
    return requestKeyCheck;
  const tracesStreamRes = parseStreamNameResult(requestRes.value.tracesStream, `${path}.request.tracesStream`);
  if (Result9.isError(tracesStreamRes))
    return tracesStreamRes;
  if (!tracesStreamRes.value)
    return Result9.ok(undefined);
  return Result9.ok({
    request: {
      tracesStream: tracesStreamRes.value
    }
  });
}
function validateEvlogProfileResult(raw, path) {
  const objRes = expectPlainObjectResult(raw, path);
  if (Result9.isError(objRes))
    return objRes;
  if (objRes.value.kind !== "evlog") {
    return Result9.err({ message: `${path}.kind must be evlog` });
  }
  const keyCheck = rejectUnknownKeysResult(objRes.value, ["kind", "redactKeys", "correlation", "observability"], path);
  if (Result9.isError(keyCheck))
    return keyCheck;
  const redactKeysRes = parseRedactKeysResult(objRes.value.redactKeys, `${path}.redactKeys`);
  if (Result9.isError(redactKeysRes))
    return redactKeysRes;
  const correlationRes = parseEvlogCorrelationResult(objRes.value.correlation, `${path}.correlation`);
  if (Result9.isError(correlationRes))
    return correlationRes;
  const observabilityRes = parseEvlogObservabilityResult(objRes.value.observability, `${path}.observability`);
  if (Result9.isError(observabilityRes))
    return observabilityRes;
  const profile = { kind: "evlog" };
  if (redactKeysRes.value)
    profile.redactKeys = redactKeysRes.value;
  if (correlationRes.value)
    profile.correlation = correlationRes.value;
  if (observabilityRes.value)
    profile.observability = observabilityRes.value;
  return Result9.ok(profile);
}
function normalizeString(value) {
  if (typeof value !== "string")
    return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}
function normalizeTraceField(input, field) {
  const direct = normalizeString(input[field]);
  if (direct)
    return direct;
  const traceContext = isPlainObject(input.traceContext) ? input.traceContext : null;
  return traceContext ? normalizeString(traceContext[field]) : null;
}
function readDottedString(input, path) {
  let cur = input;
  for (const part of path.split(".")) {
    if (!isPlainObject(cur))
      return null;
    cur = cur[part];
  }
  return normalizeString(cur);
}
function normalizeRequestId(input, profile) {
  const fields = profile.correlation?.requestIdFields ?? ["requestId", "context.requestId"];
  for (const field of fields) {
    const value = readDottedString(input, field);
    if (value)
      return value;
  }
  return null;
}
function normalizeConfiguredTraceField(input, profile, field) {
  const fields = profile.correlation?.traceContextFields;
  if (!fields)
    return normalizeTraceField(input, field);
  for (const path of fields) {
    if (path !== field && !path.endsWith(`.${field}`))
      continue;
    const value = readDottedString(input, path);
    if (value)
      return value;
  }
  return normalizeTraceField(input, field);
}
function parseTraceparent(input) {
  for (const path of ["traceparent", "traceContext.traceparent", "context.traceparent", "headers.traceparent"]) {
    const value = readDottedString(input, path);
    if (!value)
      continue;
    const match = /^([0-9a-f]{2})-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})(?:-.+)?$/i.exec(value);
    if (!match)
      continue;
    const traceId = match[2].toLowerCase();
    const spanId = match[3].toLowerCase();
    if (/^0+$/.test(traceId) || /^0+$/.test(spanId))
      continue;
    return { traceId, spanId };
  }
  return null;
}
function normalizeOptionalNumber(value) {
  if (typeof value === "number" && Number.isFinite(value))
    return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    if (Number.isFinite(n))
      return n;
  }
  return null;
}
function normalizeOptionalInteger(value) {
  if (typeof value === "number" && Number.isFinite(value) && Number.isInteger(value))
    return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    if (Number.isFinite(n) && Number.isInteger(n))
      return n;
  }
  return null;
}
function deriveLevel(input, status) {
  const direct = normalizeString(input.level)?.toLowerCase();
  if (direct === "debug" || direct === "info" || direct === "warn" || direct === "error") {
    return direct;
  }
  if (normalizeString(input.why) || normalizeString(input.fix) || normalizeString(input.link))
    return "error";
  if (status != null && status >= 500)
    return "error";
  if (status != null && status >= 400)
    return "warn";
  return "info";
}
function redactValue(value, redactKeys, path = "") {
  if (Array.isArray(value)) {
    const items = value.map((item, index) => redactValue(item, redactKeys, path === "" ? String(index) : `${path}.${index}`));
    return {
      value: items.map((item) => item.value),
      paths: items.flatMap((item) => item.paths)
    };
  }
  if (!isPlainObject(value))
    return { value: structuredClone(value), paths: [] };
  const out = {};
  const paths = [];
  for (const [key, raw] of Object.entries(value)) {
    const keyPath = path === "" ? key : `${path}.${key}`;
    if (redactKeys.has(key.toLowerCase())) {
      out[key] = REDACTED_VALUE;
      paths.push(keyPath);
      continue;
    }
    const nested = redactValue(raw, redactKeys, keyPath);
    out[key] = nested.value;
    paths.push(...nested.paths);
  }
  return { value: out, paths };
}
function buildContext(input) {
  const context = isPlainObject(input.context) ? structuredClone(input.context) : {};
  for (const [key, value] of Object.entries(input)) {
    if (EVLOG_RESERVED_FIELDS.has(key))
      continue;
    context[key] = structuredClone(value);
  }
  if (!isPlainObject(input.context) && Object.prototype.hasOwnProperty.call(input, "context")) {
    context.context = structuredClone(input.context);
  }
  return context;
}
function normalizeEvlogRecordResult(profile, value) {
  const objRes = expectPlainObjectResult(value, "evlog record");
  if (Result9.isError(objRes))
    return objRes;
  const input = objRes.value;
  const status = normalizeOptionalInteger(input.status);
  const duration = normalizeOptionalNumber(input.duration);
  const timestamp = normalizeString(input.timestamp) ?? new Date().toISOString();
  const requestId = normalizeRequestId(input, profile);
  const traceparent = profile.correlation?.parseTraceparent === false ? null : parseTraceparent(input);
  const traceId = normalizeConfiguredTraceField(input, profile, "traceId") ?? traceparent?.traceId ?? null;
  const spanId = normalizeConfiguredTraceField(input, profile, "spanId") ?? traceparent?.spanId ?? null;
  const contextRes = redactValue(buildContext(input), new Set([...DEFAULT_REDACT_KEYS, ...profile.redactKeys ?? []]));
  const normalized = {
    timestamp,
    level: deriveLevel(input, status),
    service: normalizeString(input.service),
    environment: normalizeString(input.environment),
    version: normalizeString(input.version),
    region: normalizeString(input.region),
    requestId,
    traceId,
    spanId,
    method: normalizeString(input.method),
    path: normalizeString(input.path),
    status,
    duration,
    message: normalizeString(input.message),
    why: normalizeString(input.why),
    fix: normalizeString(input.fix),
    link: normalizeString(input.link),
    sampling: Object.prototype.hasOwnProperty.call(input, "sampling") ? structuredClone(input.sampling) : null,
    redaction: { keys: contextRes.paths },
    context: contextRes.value
  };
  return Result9.ok({
    value: normalized,
    routingKey: requestId ?? traceId ?? null
  });
}
function evlogSeverity(record) {
  const level = normalizeString(record.level)?.toLowerCase();
  if (level === "debug" || level === "info" || level === "warn" || level === "error")
    return level;
  const status = normalizeOptionalInteger(record.status);
  if (status != null && status >= 500)
    return "error";
  if (status != null && status >= 400)
    return "warn";
  return "info";
}
function evlogTimelineItems(args) {
  if (!isPlainObject(args.record))
    return [];
  const record = args.record;
  const timestamp = normalizeString(record.timestamp);
  if (!timestamp)
    return [];
  const message = normalizeString(record.message);
  const method = normalizeString(record.method);
  const path = normalizeString(record.path);
  const title = message ?? ([method, path].filter(Boolean).join(" ") || "evlog event");
  return [
    {
      kind: "evlog.event",
      time: timestamp,
      duration: normalizeOptionalNumber(record.duration),
      service: normalizeString(record.service),
      title,
      severity: evlogSeverity(record),
      ids: {
        requestId: normalizeString(record.requestId),
        traceId: normalizeString(record.traceId),
        spanId: normalizeString(record.spanId)
      },
      source: {
        stream: args.stream,
        offset: args.offset,
        profile: "evlog"
      },
      data: record
    }
  ];
}
var EVLOG_STREAM_PROFILE_DEFINITION = {
  kind: "evlog",
  usesStoredProfileRow: true,
  defaultProfile() {
    return { kind: "evlog" };
  },
  validateResult(raw, path) {
    return validateEvlogProfileResult(raw, path);
  },
  readProfileResult({ row, cached }) {
    if (!row)
      return Result9.ok({ profile: { kind: "evlog" }, cache: null });
    const cachedCopy = cloneEvlogCache(cached);
    if (cachedCopy && cachedCopy.updatedAtMs === row.updated_at_ms) {
      return Result9.ok({
        profile: cloneEvlogProfile(cachedCopy.profile),
        cache: cachedCopy
      });
    }
    const parsedRes = parseStoredProfileJsonResult(row.profile_json);
    if (Result9.isError(parsedRes))
      return parsedRes;
    const profileRes = validateEvlogProfileResult(parsedRes.value, "profile");
    if (Result9.isError(profileRes))
      return profileRes;
    const profile = cloneEvlogProfile(profileRes.value);
    return Result9.ok({
      profile: cloneEvlogProfile(profile),
      cache: { profile, updatedAtMs: row.updated_at_ms }
    });
  },
  persistProfileResult({ db, registry, stream, streamRow, profile }) {
    if (!isEvlogProfile(profile)) {
      return Result9.err({ kind: "bad_request", message: "invalid evlog profile" });
    }
    const contentType = normalizeProfileContentType(streamRow.content_type);
    if (contentType !== "application/json") {
      return Result9.err({
        kind: "bad_request",
        message: "evlog profile requires application/json stream content-type"
      });
    }
    if (streamRow.profile !== "evlog" && streamRow.next_offset > 0n) {
      return Result9.err({
        kind: "bad_request",
        message: "evlog profile must be installed before appending data"
      });
    }
    const persistedProfile = cloneEvlogProfile(profile);
    const registryRes = registry.replaceRegistryResult(stream, buildEvlogDefaultRegistry(stream));
    if (Result9.isError(registryRes)) {
      return Result9.err({ kind: "bad_request", message: registryRes.error.message });
    }
    db.updateStreamProfile(stream, persistedProfile.kind);
    db.upsertStreamProfile(stream, JSON.stringify(persistedProfile));
    db.deleteStreamTouchState(stream);
    const row = db.getStreamProfile(stream);
    return Result9.ok({
      profile: cloneEvlogProfile(persistedProfile),
      cache: {
        profile: persistedProfile,
        updatedAtMs: row?.updated_at_ms ?? db.nowMs()
      },
      schemaRegistry: registryRes.value
    });
  },
  jsonIngest: {
    prepareRecordResult({ profile, value }) {
      if (!isEvlogProfile(profile))
        return Result9.err({ message: "invalid evlog profile" });
      return normalizeEvlogRecordResult(profile, value);
    }
  },
  correlation: {
    toTimelineItems(args) {
      return evlogTimelineItems(args);
    }
  }
};

// src/profiles/metrics.ts
import { Result as Result11 } from "better-result";

// src/profiles/metrics/schema.ts
var METRICS_CANONICAL_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    apiVersion: { type: "string", const: "durable.streams/metrics/v1" },
    kind: { type: "string", const: "interval" },
    metric: { type: "string" },
    unit: { type: "string" },
    metricKind: { type: "string" },
    temporality: { type: "string" },
    windowStart: { type: "integer" },
    windowEnd: { type: "integer" },
    intervalMs: { type: "integer" },
    instance: { type: ["string", "null"] },
    stream: { type: ["string", "null"] },
    tags: {
      type: "object",
      additionalProperties: { type: "string" }
    },
    attributes: {
      type: "object",
      additionalProperties: { type: "string" }
    },
    dimensionPairs: {
      type: "array",
      items: { type: "string" }
    },
    dimensionKey: { type: ["string", "null"] },
    seriesKey: { type: "string" },
    count: { type: "number" },
    sum: { type: "number" },
    min: { type: ["number", "null"] },
    max: { type: ["number", "null"] },
    avg: { type: "number" },
    p50: { type: "number" },
    p95: { type: "number" },
    p99: { type: "number" },
    buckets: {
      type: "object",
      additionalProperties: { type: "number" }
    },
    summary: {
      type: "object",
      additionalProperties: false,
      properties: {
        count: { type: "number" },
        sum: { type: "number" },
        min: { type: ["number", "null"] },
        max: { type: ["number", "null"] },
        histogram: {
          type: "object",
          additionalProperties: { type: "number" }
        }
      },
      required: ["count", "sum", "min", "max", "histogram"]
    }
  },
  required: [
    "apiVersion",
    "kind",
    "metric",
    "unit",
    "metricKind",
    "temporality",
    "windowStart",
    "windowEnd",
    "intervalMs",
    "instance",
    "stream",
    "tags",
    "attributes",
    "dimensionPairs",
    "dimensionKey",
    "seriesKey",
    "count",
    "sum",
    "min",
    "max",
    "avg",
    "p50",
    "p95",
    "p99",
    "buckets",
    "summary"
  ]
};
var METRICS_DEFAULT_SEARCH_CONFIG = {
  profile: "metrics",
  primaryTimestampField: "windowStart",
  aliases: {
    ts: "windowStart",
    time: "windowStart",
    name: "metric",
    dims: "dimensionKey",
    series: "seriesKey"
  },
  defaultFields: [
    { field: "metric", boost: 2 },
    { field: "stream", boost: 1.25 },
    { field: "dimensionPairs", boost: 1 }
  ],
  fields: {
    windowStart: {
      kind: "date",
      bindings: [{ version: 1, jsonPointer: "/windowStart" }],
      exact: true,
      column: true,
      exists: true,
      sortable: true,
      aggregatable: true
    },
    windowEnd: {
      kind: "date",
      bindings: [{ version: 1, jsonPointer: "/windowEnd" }],
      exact: true,
      column: true,
      exists: true,
      sortable: true
    },
    intervalMs: {
      kind: "integer",
      bindings: [{ version: 1, jsonPointer: "/intervalMs" }],
      exact: true,
      column: true,
      exists: true,
      sortable: true,
      aggregatable: true
    },
    metric: {
      kind: "keyword",
      bindings: [{ version: 1, jsonPointer: "/metric" }],
      normalizer: "lowercase_v1",
      exact: true,
      prefix: true,
      exists: true,
      sortable: true,
      aggregatable: true
    },
    unit: {
      kind: "keyword",
      bindings: [{ version: 1, jsonPointer: "/unit" }],
      normalizer: "lowercase_v1",
      exact: true,
      prefix: true,
      exists: true,
      aggregatable: true
    },
    metricKind: {
      kind: "keyword",
      bindings: [{ version: 1, jsonPointer: "/metricKind" }],
      normalizer: "lowercase_v1",
      exact: true,
      prefix: true,
      exists: true,
      aggregatable: true
    },
    temporality: {
      kind: "keyword",
      bindings: [{ version: 1, jsonPointer: "/temporality" }],
      normalizer: "lowercase_v1",
      exact: true,
      prefix: true,
      exists: true,
      aggregatable: true
    },
    stream: {
      kind: "keyword",
      bindings: [{ version: 1, jsonPointer: "/stream" }],
      normalizer: "lowercase_v1",
      exact: true,
      prefix: true,
      exists: true,
      sortable: true,
      aggregatable: true
    },
    instance: {
      kind: "keyword",
      bindings: [{ version: 1, jsonPointer: "/instance" }],
      exact: true,
      prefix: true,
      exists: true,
      sortable: true,
      aggregatable: true
    },
    seriesKey: {
      kind: "keyword",
      bindings: [{ version: 1, jsonPointer: "/seriesKey" }],
      exact: true,
      exists: true,
      sortable: true
    },
    dimensionKey: {
      kind: "keyword",
      bindings: [{ version: 1, jsonPointer: "/dimensionKey" }],
      exact: true,
      prefix: true,
      exists: true,
      sortable: true,
      aggregatable: true
    },
    dimensionPairs: {
      kind: "keyword",
      bindings: [{ version: 1, jsonPointer: "/dimensionPairs" }],
      exact: true,
      prefix: true,
      exists: true
    },
    count: {
      kind: "integer",
      bindings: [{ version: 1, jsonPointer: "/count" }],
      exact: true,
      column: true,
      exists: true,
      sortable: true,
      aggregatable: true
    },
    sum: {
      kind: "float",
      bindings: [{ version: 1, jsonPointer: "/sum" }],
      exact: true,
      column: true,
      exists: true,
      sortable: true,
      aggregatable: true
    },
    min: {
      kind: "float",
      bindings: [{ version: 1, jsonPointer: "/min" }],
      exact: true,
      column: true,
      exists: true,
      sortable: true
    },
    max: {
      kind: "float",
      bindings: [{ version: 1, jsonPointer: "/max" }],
      exact: true,
      column: true,
      exists: true,
      sortable: true
    },
    avg: {
      kind: "float",
      bindings: [{ version: 1, jsonPointer: "/avg" }],
      exact: true,
      column: true,
      exists: true,
      sortable: true
    },
    p95: {
      kind: "float",
      bindings: [{ version: 1, jsonPointer: "/p95" }],
      exact: true,
      column: true,
      exists: true,
      sortable: true
    },
    p99: {
      kind: "float",
      bindings: [{ version: 1, jsonPointer: "/p99" }],
      exact: true,
      column: true,
      exists: true,
      sortable: true
    }
  },
  rollups: {
    metrics: {
      timestampField: "windowStart",
      dimensions: ["metric", "unit", "stream", "instance", "dimensionKey", "metricKind", "temporality"],
      intervals: ["10s", "1m", "5m", "1h"],
      measures: {
        value: {
          kind: "summary_parts",
          countJsonPointer: "/count",
          sumJsonPointer: "/sum",
          minJsonPointer: "/min",
          maxJsonPointer: "/max",
          histogramJsonPointer: "/buckets"
        }
      }
    }
  }
};
function buildMetricsDefaultRegistry(stream) {
  return {
    apiVersion: SCHEMA_REGISTRY_API_VERSION,
    schema: stream,
    currentVersion: 1,
    routingKey: { jsonPointer: "/seriesKey", required: true },
    search: structuredClone(METRICS_DEFAULT_SEARCH_CONFIG),
    boundaries: [{ offset: 0, version: 1 }],
    schemas: {
      "1": structuredClone(METRICS_CANONICAL_SCHEMA)
    },
    lenses: {}
  };
}
function buildInternalMetricsRegistry(stream) {
  return {
    apiVersion: SCHEMA_REGISTRY_API_VERSION,
    schema: stream,
    currentVersion: 1,
    boundaries: [{ offset: 0, version: 1 }],
    schemas: {
      "1": structuredClone(METRICS_CANONICAL_SCHEMA)
    },
    lenses: {}
  };
}

// src/profiles/metrics/normalize.ts
import { Result as Result10 } from "better-result";
function normalizeString2(value) {
  if (typeof value !== "string")
    return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}
function normalizeFiniteNumber(value) {
  if (typeof value === "number" && Number.isFinite(value))
    return value;
  if (typeof value === "bigint")
    return Number(value);
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed))
      return parsed;
  }
  return null;
}
function normalizeInteger(value) {
  const numeric = normalizeFiniteNumber(value);
  if (numeric == null)
    return null;
  return Math.trunc(numeric);
}
function normalizeHistogram(value) {
  if (!isPlainObject(value))
    return;
  const out = {};
  for (const [bucket, raw] of Object.entries(value)) {
    const count = normalizeFiniteNumber(raw);
    if (count == null || count <= 0)
      continue;
    out[String(bucket)] = (out[String(bucket)] ?? 0) + count;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}
function histogramPercentile(histogram, percentile) {
  if (!histogram)
    return null;
  const entries = Object.entries(histogram).map(([bucket, count]) => ({ bucket: Number(bucket), count })).filter((entry) => Number.isFinite(entry.bucket) && Number.isFinite(entry.count) && entry.count > 0).sort((a, b) => a.bucket - b.bucket);
  if (entries.length === 0)
    return null;
  const total = entries.reduce((sum, entry) => sum + entry.count, 0);
  if (total <= 0)
    return null;
  const threshold = total * percentile;
  let seen = 0;
  for (const entry of entries) {
    seen += entry.count;
    if (seen >= threshold)
      return entry.bucket;
  }
  return entries[entries.length - 1]?.bucket ?? null;
}
function normalizeAttributes(value) {
  if (!isPlainObject(value))
    return {};
  const out = {};
  for (const [key, raw] of Object.entries(value)) {
    if (typeof raw === "string")
      out[key] = raw;
    else if (typeof raw === "number" && Number.isFinite(raw))
      out[key] = String(raw);
    else if (typeof raw === "boolean")
      out[key] = raw ? "true" : "false";
    else if (typeof raw === "bigint")
      out[key] = raw.toString();
  }
  return Object.fromEntries(Object.entries(out).sort((a, b) => a[0].localeCompare(b[0])));
}
function buildDimensionPairs(attributes) {
  return Object.entries(attributes).map(([key, value]) => `${key}=${value}`).sort((a, b) => a.localeCompare(b));
}
function buildSeriesKey(args) {
  return [
    args.metricKind,
    args.temporality,
    args.metric,
    args.unit,
    args.stream ?? "",
    args.instance ?? "",
    args.dimensionKey ?? ""
  ].join("|");
}
function normalizeSummaryResult(value) {
  const summaryObject = isPlainObject(value.summary) ? value.summary : null;
  const histogram = normalizeHistogram(value.buckets) ?? normalizeHistogram(summaryObject?.histogram ?? undefined);
  const count = normalizeFiniteNumber(value.count) ?? normalizeFiniteNumber(summaryObject?.count);
  const sum = normalizeFiniteNumber(value.sum) ?? normalizeFiniteNumber(summaryObject?.sum);
  const min = normalizeFiniteNumber(value.min) ?? normalizeFiniteNumber(summaryObject?.min);
  const max = normalizeFiniteNumber(value.max) ?? normalizeFiniteNumber(summaryObject?.max);
  if (count == null || count < 0)
    return Result10.err({ message: "metrics interval requires count" });
  if (sum == null)
    return Result10.err({ message: "metrics interval requires sum" });
  return Result10.ok({
    count,
    sum,
    min: count === 0 ? null : min ?? 0,
    max: count === 0 ? null : max ?? 0,
    histogram
  });
}
function normalizeMetricsRecordResult(value) {
  const objRes = expectPlainObjectResult(value, "metrics record");
  if (Result10.isError(objRes))
    return objRes;
  const input = objRes.value;
  const kind = normalizeString2(input.kind) ?? "interval";
  if (kind !== "interval")
    return Result10.err({ message: "metrics record.kind must be interval" });
  const metric = normalizeString2(input.metric);
  if (!metric)
    return Result10.err({ message: "metrics record.metric must be a non-empty string" });
  const unit = normalizeString2(input.unit);
  if (!unit)
    return Result10.err({ message: "metrics record.unit must be a non-empty string" });
  const windowStart = normalizeInteger(input.windowStart);
  const windowEnd = normalizeInteger(input.windowEnd);
  if (windowStart == null || windowEnd == null) {
    return Result10.err({ message: "metrics record.windowStart and windowEnd must be integers" });
  }
  if (windowEnd < windowStart)
    return Result10.err({ message: "metrics record.windowEnd must be >= windowStart" });
  const intervalMs = normalizeInteger(input.intervalMs) ?? windowEnd - windowStart;
  if (intervalMs < 0)
    return Result10.err({ message: "metrics record.intervalMs must be >= 0" });
  const metricKind = normalizeString2(input.metricKind) ?? "summary";
  const temporality = normalizeString2(input.temporality) ?? "delta";
  const stream = normalizeString2(input.stream);
  const instance = normalizeString2(input.instance);
  const attributes = normalizeAttributes(input.attributes ?? input.tags);
  const dimensionPairs = buildDimensionPairs(attributes);
  const dimensionKey = dimensionPairs.length > 0 ? dimensionPairs.join("\x00") : null;
  const seriesKey = buildSeriesKey({
    metricKind,
    temporality,
    metric,
    unit,
    stream,
    instance,
    dimensionKey
  });
  const summaryRes = normalizeSummaryResult(input);
  if (Result10.isError(summaryRes))
    return summaryRes;
  const summary = summaryRes.value;
  const avg = normalizeFiniteNumber(input.avg) ?? (summary.count > 0 ? summary.sum / summary.count : 0);
  const p50 = normalizeFiniteNumber(input.p50) ?? histogramPercentile(summary.histogram, 0.5) ?? 0;
  const p95 = normalizeFiniteNumber(input.p95) ?? histogramPercentile(summary.histogram, 0.95) ?? 0;
  const p99 = normalizeFiniteNumber(input.p99) ?? histogramPercentile(summary.histogram, 0.99) ?? 0;
  const normalizedValue = {
    apiVersion: "durable.streams/metrics/v1",
    kind: "interval",
    metric,
    unit,
    metricKind,
    temporality,
    windowStart,
    windowEnd,
    intervalMs,
    instance,
    stream,
    tags: attributes,
    attributes,
    dimensionPairs,
    dimensionKey,
    seriesKey,
    count: summary.count,
    sum: summary.sum,
    min: summary.min,
    max: summary.max,
    avg,
    p50,
    p95,
    p99,
    buckets: summary.histogram ?? {},
    summary: {
      count: summary.count,
      sum: summary.sum,
      min: summary.min,
      max: summary.max,
      histogram: summary.histogram ?? {}
    }
  };
  return Result10.ok({
    value: normalizedValue,
    routingKey: seriesKey,
    companion: {
      metric,
      unit,
      metricKind,
      temporality,
      windowStartMs: windowStart,
      windowEndMs: windowEnd,
      intervalMs,
      stream,
      instance,
      attributes,
      dimensionPairs,
      dimensionKey,
      seriesKey,
      summary
    }
  });
}

// src/profiles/metrics.ts
var INTERNAL_METRICS_STREAM = "__stream_metrics__";
function cloneMetricsProfile() {
  return { kind: "metrics" };
}
function validateMetricsProfileResult(raw, path) {
  const objRes = expectPlainObjectResult(raw, path);
  if (Result11.isError(objRes))
    return objRes;
  if (objRes.value.kind !== "metrics")
    return Result11.err({ message: `${path}.kind must be metrics` });
  const keyCheck = rejectUnknownKeysResult(objRes.value, ["kind"], path);
  if (Result11.isError(keyCheck))
    return keyCheck;
  return Result11.ok(cloneMetricsProfile());
}
var METRICS_STREAM_PROFILE_DEFINITION = {
  kind: "metrics",
  usesStoredProfileRow: false,
  defaultProfile() {
    return cloneMetricsProfile();
  },
  validateResult(raw, path) {
    return validateMetricsProfileResult(raw, path);
  },
  readProfileResult() {
    return Result11.ok({ profile: cloneMetricsProfile(), cache: null });
  },
  persistProfileResult({ db, registry, stream, streamRow, profile }) {
    if (profile.kind !== "metrics")
      return Result11.err({ kind: "bad_request", message: "invalid metrics profile" });
    const contentType = normalizeProfileContentType(streamRow.content_type);
    if (contentType !== "application/json") {
      return Result11.err({
        kind: "bad_request",
        message: "metrics profile requires application/json stream content-type"
      });
    }
    const desiredRegistry = stream === INTERNAL_METRICS_STREAM ? buildInternalMetricsRegistry(stream) : buildMetricsDefaultRegistry(stream);
    const registryRes = registry.replaceRegistryResult(stream, desiredRegistry);
    if (Result11.isError(registryRes))
      return Result11.err({ kind: "bad_request", message: registryRes.error.message });
    db.updateStreamProfile(stream, "metrics");
    db.deleteStreamProfile(stream);
    db.deleteStreamTouchState(stream);
    return Result11.ok({
      profile: cloneStreamProfileSpec(cloneMetricsProfile()),
      cache: null,
      schemaRegistry: registryRes.value
    });
  },
  jsonIngest: {
    prepareRecordResult({ value }) {
      const normalizedRes = normalizeMetricsRecordResult(value);
      if (Result11.isError(normalizedRes))
        return normalizedRes;
      return Result11.ok({
        value: normalizedRes.value.value,
        routingKey: normalizedRes.value.routingKey
      });
    }
  },
  metrics: {
    normalizeRecordResult({ value }) {
      return normalizeMetricsRecordResult(value);
    }
  }
};

// src/profiles/otelTraces.ts
import { Result as Result14 } from "better-result";

// src/profiles/otelTraces/schema.ts
var NULLABLE_STRING = { type: ["string", "null"] };
var NULLABLE_NUMBER = { type: ["number", "null"] };
var ATTRIBUTES_SCHEMA = { type: "object", additionalProperties: true };
var OTEL_TRACES_CANONICAL_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    schemaVersion: { type: "integer", enum: [1] },
    signal: { type: "string", enum: ["trace.span"] },
    timestamp: { type: "string" },
    endTimestamp: NULLABLE_STRING,
    startUnixNano: NULLABLE_STRING,
    endUnixNano: NULLABLE_STRING,
    duration: NULLABLE_NUMBER,
    traceId: { type: "string" },
    spanId: { type: "string" },
    parentSpanId: NULLABLE_STRING,
    traceState: NULLABLE_STRING,
    traceFlags: {
      type: "object",
      additionalProperties: false,
      properties: {
        sampled: { type: "boolean" },
        raw: { type: ["integer", "null"] }
      },
      required: ["sampled", "raw"]
    },
    name: { type: "string" },
    kind: { type: "string", enum: ["unspecified", "internal", "server", "client", "producer", "consumer"] },
    status: {
      type: "object",
      additionalProperties: false,
      properties: {
        code: { type: "string", enum: ["unset", "ok", "error"] },
        message: NULLABLE_STRING
      },
      required: ["code", "message"]
    },
    service: NULLABLE_STRING,
    serviceNamespace: NULLABLE_STRING,
    serviceInstanceId: NULLABLE_STRING,
    environment: NULLABLE_STRING,
    version: NULLABLE_STRING,
    region: NULLABLE_STRING,
    requestId: NULLABLE_STRING,
    http: {
      type: "object",
      additionalProperties: false,
      properties: {
        method: NULLABLE_STRING,
        route: NULLABLE_STRING,
        path: NULLABLE_STRING,
        target: NULLABLE_STRING,
        url: NULLABLE_STRING,
        statusCode: { type: ["integer", "null"] },
        userAgent: NULLABLE_STRING
      },
      required: ["method", "route", "path", "target", "url", "statusCode", "userAgent"]
    },
    db: {
      type: "object",
      additionalProperties: false,
      properties: {
        system: NULLABLE_STRING,
        name: NULLABLE_STRING,
        operation: NULLABLE_STRING,
        statement: NULLABLE_STRING
      },
      required: ["system", "name", "operation", "statement"]
    },
    rpc: {
      type: "object",
      additionalProperties: false,
      properties: {
        system: NULLABLE_STRING,
        service: NULLABLE_STRING,
        method: NULLABLE_STRING
      },
      required: ["system", "service", "method"]
    },
    messaging: {
      type: "object",
      additionalProperties: false,
      properties: {
        system: NULLABLE_STRING,
        destination: NULLABLE_STRING,
        operation: NULLABLE_STRING
      },
      required: ["system", "destination", "operation"]
    },
    error: {
      type: "object",
      additionalProperties: false,
      properties: {
        isError: { type: "boolean" },
        type: NULLABLE_STRING,
        message: NULLABLE_STRING,
        stacktrace: NULLABLE_STRING
      },
      required: ["isError", "type", "message", "stacktrace"]
    },
    instrumentationScope: {
      type: "object",
      additionalProperties: false,
      properties: {
        name: NULLABLE_STRING,
        version: NULLABLE_STRING,
        schemaUrl: NULLABLE_STRING,
        attributes: ATTRIBUTES_SCHEMA
      },
      required: ["name", "version", "schemaUrl", "attributes"]
    },
    resource: {
      type: "object",
      additionalProperties: false,
      properties: {
        schemaUrl: NULLABLE_STRING,
        attributes: ATTRIBUTES_SCHEMA
      },
      required: ["schemaUrl", "attributes"]
    },
    attributes: ATTRIBUTES_SCHEMA,
    events: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          timestamp: NULLABLE_STRING,
          timeUnixNano: NULLABLE_STRING,
          name: { type: "string" },
          attributes: ATTRIBUTES_SCHEMA,
          droppedAttributesCount: { type: "integer" }
        },
        required: ["timestamp", "timeUnixNano", "name", "attributes"]
      }
    },
    eventNames: {
      type: "array",
      items: { type: "string" }
    },
    links: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          traceId: { type: "string" },
          spanId: { type: "string" },
          traceState: NULLABLE_STRING,
          attributes: ATTRIBUTES_SCHEMA,
          droppedAttributesCount: { type: "integer" }
        },
        required: ["traceId", "spanId", "traceState", "attributes"]
      }
    },
    dropped: {
      type: "object",
      additionalProperties: false,
      properties: {
        attributes: { type: "integer" },
        events: { type: "integer" },
        links: { type: "integer" }
      },
      required: ["attributes", "events", "links"]
    },
    redaction: {
      type: "object",
      additionalProperties: false,
      properties: {
        keys: {
          type: "array",
          items: { type: "string" }
        }
      },
      required: ["keys"]
    },
    identity: {
      type: "object",
      additionalProperties: false,
      properties: {
        spanKey: { type: "string" },
        dedupeKey: { type: "string" }
      },
      required: ["spanKey", "dedupeKey"]
    }
  },
  required: [
    "schemaVersion",
    "signal",
    "timestamp",
    "endTimestamp",
    "startUnixNano",
    "endUnixNano",
    "duration",
    "traceId",
    "spanId",
    "parentSpanId",
    "traceState",
    "traceFlags",
    "name",
    "kind",
    "status",
    "service",
    "serviceNamespace",
    "serviceInstanceId",
    "environment",
    "version",
    "region",
    "requestId",
    "http",
    "db",
    "rpc",
    "messaging",
    "error",
    "instrumentationScope",
    "resource",
    "attributes",
    "events",
    "eventNames",
    "links",
    "dropped",
    "redaction",
    "identity"
  ]
};
var exactKeyword = (jsonPointer, aggregatable = false) => {
  const field = {
    kind: "keyword",
    bindings: [{ version: 1, jsonPointer }],
    exact: true,
    prefix: true,
    exists: true,
    sortable: true
  };
  if (aggregatable)
    field.aggregatable = true;
  return field;
};
var lowercaseKeyword = (jsonPointer, aggregatable = false) => ({
  ...exactKeyword(jsonPointer, aggregatable),
  normalizer: "lowercase_v1"
});
var textField = (jsonPointer) => ({
  kind: "text",
  bindings: [{ version: 1, jsonPointer }],
  analyzer: "unicode_word_v1",
  exists: true,
  positions: true
});
var OTEL_TRACES_DEFAULT_SEARCH_CONFIG = {
  profile: "otel-traces",
  primaryTimestampField: "timestamp",
  aliases: {
    db: "db.system",
    duration_ms: "duration",
    error: "error.isError",
    method: "http.method",
    op: "name",
    parent: "parentSpanId",
    req: "requestId",
    route: "http.route",
    span: "spanId",
    status: "http.statusCode",
    svc: "service",
    time: "timestamp",
    trace: "traceId",
    ts: "timestamp"
  },
  defaultFields: [
    { field: "name", boost: 2 },
    { field: "error.message", boost: 2 },
    { field: "status.message", boost: 1.5 },
    { field: "events.name", boost: 1.2 },
    { field: "db.statement", boost: 0.5 }
  ],
  fields: {
    timestamp: {
      kind: "date",
      bindings: [{ version: 1, jsonPointer: "/timestamp" }],
      exact: true,
      column: true,
      exists: true,
      sortable: true,
      aggregatable: true
    },
    endTimestamp: {
      kind: "date",
      bindings: [{ version: 1, jsonPointer: "/endTimestamp" }],
      exact: true,
      column: true,
      exists: true,
      sortable: true,
      aggregatable: true
    },
    duration: {
      kind: "float",
      bindings: [{ version: 1, jsonPointer: "/duration" }],
      exact: true,
      column: true,
      exists: true,
      sortable: true,
      aggregatable: true
    },
    traceId: exactKeyword("/traceId"),
    spanId: exactKeyword("/spanId"),
    parentSpanId: exactKeyword("/parentSpanId"),
    requestId: exactKeyword("/requestId"),
    service: lowercaseKeyword("/service", true),
    serviceNamespace: lowercaseKeyword("/serviceNamespace", true),
    serviceInstanceId: exactKeyword("/serviceInstanceId"),
    environment: lowercaseKeyword("/environment", true),
    version: exactKeyword("/version"),
    region: lowercaseKeyword("/region", true),
    name: {
      kind: "keyword",
      bindings: [{ version: 1, jsonPointer: "/name" }],
      exact: true,
      prefix: true,
      exists: true,
      sortable: true,
      aggregatable: true
    },
    kind: lowercaseKeyword("/kind", true),
    "status.code": lowercaseKeyword("/status/code", true),
    "status.message": textField("/status/message"),
    "error.isError": {
      kind: "bool",
      bindings: [{ version: 1, jsonPointer: "/error/isError" }],
      exact: true,
      column: true,
      exists: true,
      sortable: true,
      aggregatable: true
    },
    "error.type": exactKeyword("/error/type", true),
    "error.message": textField("/error/message"),
    "error.stacktrace": textField("/error/stacktrace"),
    "http.method": lowercaseKeyword("/http/method", true),
    "http.route": exactKeyword("/http/route", true),
    "http.path": exactKeyword("/http/path"),
    "http.statusCode": {
      kind: "integer",
      bindings: [{ version: 1, jsonPointer: "/http/statusCode" }],
      exact: true,
      column: true,
      exists: true,
      sortable: true,
      aggregatable: true
    },
    "db.system": lowercaseKeyword("/db/system", true),
    "db.operation": lowercaseKeyword("/db/operation", true),
    "db.statement": textField("/db/statement"),
    "rpc.system": lowercaseKeyword("/rpc/system", true),
    "rpc.service": exactKeyword("/rpc/service", true),
    "rpc.method": exactKeyword("/rpc/method", true),
    "messaging.system": lowercaseKeyword("/messaging/system", true),
    "messaging.destination": exactKeyword("/messaging/destination", true),
    "messaging.operation": lowercaseKeyword("/messaging/operation", true),
    "events.name": textField("/eventNames")
  },
  rollups: {
    spans: {
      dimensions: ["service", "kind", "status.code"],
      intervals: ["1m", "5m", "1h"],
      measures: {
        spans: { kind: "count" },
        errors: { kind: "count", include: "error:true" },
        latency: { kind: "summary", field: "duration", histogram: "log2_v1" }
      }
    },
    http_server: {
      include: "kind:server",
      dimensions: ["service", "http.method", "http.route", "http.statusCode"],
      intervals: ["1m", "5m", "1h"],
      measures: {
        requests: { kind: "count" },
        errors: { kind: "count", include: "error:true" },
        latency: { kind: "summary", field: "duration", histogram: "log2_v1" }
      }
    }
  }
};
function buildOtelTracesDefaultRegistry(stream) {
  return {
    apiVersion: SCHEMA_REGISTRY_API_VERSION,
    schema: stream,
    currentVersion: 1,
    search: structuredClone(OTEL_TRACES_DEFAULT_SEARCH_CONFIG),
    boundaries: [{ offset: 0, version: 1 }],
    schemas: {
      "1": structuredClone(OTEL_TRACES_CANONICAL_SCHEMA)
    },
    lenses: {}
  };
}

// src/profiles/otelTraces/normalize.ts
import { createHash } from "node:crypto";
import { Result as Result12 } from "better-result";
var TEXT_ENCODER = new TextEncoder;
var TEXT_DECODER = new TextDecoder;
var REDACTED_VALUE2 = "[REDACTED]";
var DEFAULT_OTEL_TRACE_REDACT_KEYS = [
  "password",
  "token",
  "secret",
  "authorization",
  "cookie",
  "apikey",
  "api_key",
  "set-cookie",
  "x-api-key"
];
var DEFAULT_REQUEST_ID_ATTRIBUTES = [
  "request.id",
  "http.request_id",
  "http.request.header.x_request_id",
  "http.request.header.x-request-id",
  "http.request.header.x_correlation_id",
  "http.request.header.x-correlation-id",
  "correlation.id"
];
var DEFAULT_ATTRIBUTE_LIMITS = {
  maxAttributeValueBytes: 8192,
  maxAttributesPerSpan: 256,
  maxEventsPerSpan: 128,
  maxLinksPerSpan: 128,
  maxStatementBytes: 4096
};
var DEFAULT_OTLP_LIMITS = {
  maxCompressedBytes: 4 * 1024 * 1024,
  maxDecodedBytes: 16 * 1024 * 1024,
  maxResourceSpansPerRequest: 1024,
  maxScopeSpansPerRequest: 4096,
  maxSpansPerRequest: 50000,
  maxAnyValueDepth: 16,
  maxArrayValuesPerAnyValue: 256,
  maxKvListValuesPerAnyValue: 256
};
var DEFAULT_STORE_CONFIG = {
  rawResourceAttributes: true,
  rawSpanAttributes: true,
  rawEvents: true,
  rawLinks: true
};
var DEFAULT_URL_MODE = "drop_query";
function normalizeString3(value) {
  if (typeof value !== "string")
    return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}
function normalizeNumber(value) {
  if (typeof value === "number" && Number.isFinite(value))
    return value;
  if (typeof value === "bigint")
    return Number(value);
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed))
      return parsed;
  }
  return null;
}
function normalizeInteger2(value) {
  const n = normalizeNumber(value);
  return n != null && Number.isInteger(n) ? n : null;
}
function normalizeNanoString(value) {
  if (value == null)
    return null;
  if (typeof value === "bigint")
    return value >= 0n ? value.toString() : null;
  if (typeof value === "number" && Number.isFinite(value) && Number.isInteger(value) && value >= 0) {
    return BigInt(value).toString();
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (/^(0|[1-9][0-9]*)$/.test(trimmed))
      return trimmed;
  }
  return null;
}
function isoFromUnixNano(nanoString) {
  if (!nanoString)
    return null;
  try {
    const ms = BigInt(nanoString) / 1000000n;
    const date = new Date(Number(ms));
    if (Number.isNaN(date.getTime()))
      return null;
    return date.toISOString();
  } catch {
    return null;
  }
}
function durationMs(startUnixNano, endUnixNano) {
  if (!startUnixNano || !endUnixNano)
    return Result12.ok(null);
  const start = BigInt(startUnixNano);
  const end = BigInt(endUnixNano);
  if (end < start)
    return Result12.err({ message: "endTimeUnixNano must be greater than or equal to startTimeUnixNano" });
  return Result12.ok(Number(end - start) / 1e6);
}
function normalizeHexIdResult(raw, chars, field) {
  const value = normalizeString3(raw)?.toLowerCase() ?? "";
  if (!new RegExp(`^[0-9a-f]{${chars}}$`).test(value)) {
    return Result12.err({ message: `${field} must be ${chars} lowercase hex characters` });
  }
  if (/^0+$/.test(value))
    return Result12.err({ message: `${field} must not be all zeroes` });
  return Result12.ok(value);
}
function normalizeParentSpanIdResult(raw) {
  const value = normalizeString3(raw);
  if (!value)
    return Result12.ok(null);
  const lowered = value.toLowerCase();
  if (/^0+$/.test(lowered))
    return Result12.ok(null);
  return normalizeHexIdResult(lowered, 16, "parentSpanId");
}
function normalizeSpanKind(value) {
  if (typeof value === "number") {
    if (value === 1)
      return "internal";
    if (value === 2)
      return "server";
    if (value === 3)
      return "client";
    if (value === 4)
      return "producer";
    if (value === 5)
      return "consumer";
    return "unspecified";
  }
  const raw = normalizeString3(value)?.toLowerCase().replace(/^span_kind_/, "");
  if (raw === "internal" || raw === "server" || raw === "client" || raw === "producer" || raw === "consumer")
    return raw;
  return "unspecified";
}
function normalizeStatusCode(value) {
  if (typeof value === "number") {
    if (value === 1)
      return "ok";
    if (value === 2)
      return "error";
    return "unset";
  }
  const raw = normalizeString3(value)?.toLowerCase().replace(/^status_code_/, "");
  if (raw === "ok" || raw === "error")
    return raw;
  return "unset";
}
function truncateUtf8(value, maxBytes) {
  const bytes = TEXT_ENCODER.encode(value);
  if (bytes.byteLength <= maxBytes)
    return value;
  return TEXT_DECODER.decode(bytes.slice(0, Math.max(0, maxBytes)));
}
function truncateNullableString(value, maxBytes) {
  return value == null ? null : truncateUtf8(value, maxBytes);
}
function stripUrlQueryAndFragment(value) {
  const fragmentStart = value.indexOf("#");
  const withoutFragment = fragmentStart >= 0 ? value.slice(0, fragmentStart) : value;
  const queryStart = withoutFragment.indexOf("?");
  return queryStart >= 0 ? withoutFragment.slice(0, queryStart) : withoutFragment;
}
function sanitizeUrl(value, urlMode, maxBytes) {
  if (!value)
    return null;
  const sanitized = urlMode === "raw" ? value : stripUrlQueryAndFragment(value);
  const normalized = normalizeString3(sanitized);
  return normalized ? truncateUtf8(normalized, maxBytes) : null;
}
function redactionKeyCandidates(key) {
  const lowered = key.trim().toLowerCase();
  const out = new Set;
  if (lowered === "")
    return out;
  out.add(lowered);
  const dotted = lowered.split(".").filter((part) => part !== "");
  for (let i = 0;i < dotted.length; i++)
    out.add(dotted.slice(i).join("."));
  const terminal = dotted.at(-1) ?? lowered;
  out.add(terminal);
  out.add(terminal.replace(/[-_]/g, ""));
  const tokens = lowered.split(/[._-]+/).filter((part) => part !== "");
  for (let length = 1;length <= Math.min(4, tokens.length); length++) {
    const suffix = tokens.slice(tokens.length - length);
    out.add(suffix.join("."));
    out.add(suffix.join("-"));
    out.add(suffix.join("_"));
    out.add(suffix.join(""));
  }
  return out;
}
function shouldRedactAttributeKey(key, redactKeys) {
  for (const candidate of redactionKeyCandidates(key)) {
    if (redactKeys.has(candidate))
      return true;
  }
  return false;
}
function sanitizeAttributeValue(value, redactKeys, path, maxBytes) {
  if (typeof value === "string")
    return { value: truncateUtf8(value, maxBytes), redacted: [] };
  if (typeof value === "number")
    return { value: Number.isFinite(value) ? value : null, redacted: [] };
  if (typeof value === "boolean" || value === null)
    return { value, redacted: [] };
  if (typeof value === "bigint")
    return { value: value.toString(), redacted: [] };
  if (value instanceof Uint8Array)
    return { value: Buffer.from(value).toString("base64"), redacted: [] };
  if (Array.isArray(value)) {
    const out2 = [];
    const redacted2 = [];
    for (let i = 0;i < value.length; i++) {
      const child = sanitizeAttributeValue(value[i], redactKeys, `${path}.${i}`, maxBytes);
      out2.push(child.value);
      redacted2.push(...child.redacted);
    }
    return { value: out2, redacted: redacted2 };
  }
  if (!isPlainObject(value))
    return { value: null, redacted: [] };
  const out = {};
  const redacted = [];
  for (const [key, childValue] of Object.entries(value)) {
    const childPath = path === "" ? key : `${path}.${key}`;
    if (shouldRedactAttributeKey(key, redactKeys)) {
      out[key] = REDACTED_VALUE2;
      redacted.push(childPath);
      continue;
    }
    const child = sanitizeAttributeValue(childValue, redactKeys, childPath, maxBytes);
    out[key] = child.value;
    redacted.push(...child.redacted);
  }
  return { value: out, redacted };
}
function limitAttributes(attrs, args) {
  const out = {};
  const redacted = [];
  let count = 0;
  let dropped = Math.max(0, Math.trunc(args.dropped));
  for (const [key, value] of Object.entries(attrs)) {
    if (count >= args.maxAttributes) {
      dropped += 1;
      continue;
    }
    count += 1;
    const keyPath = args.path === "" ? key : `${args.path}.${key}`;
    if (shouldRedactAttributeKey(key, args.redactKeys)) {
      out[key] = REDACTED_VALUE2;
      redacted.push(keyPath);
      continue;
    }
    const sanitized = sanitizeAttributeValue(value, args.redactKeys, keyPath, args.maxAttributeValueBytes);
    out[key] = sanitized.value;
    redacted.push(...sanitized.redacted);
  }
  return { attributes: out, dropped, redacted };
}
function getString(attrs, ...keys) {
  for (const key of keys) {
    const value = normalizeString3(attrs[key]);
    if (value)
      return value;
  }
  return null;
}
function getInteger(attrs, ...keys) {
  for (const key of keys) {
    const value = normalizeInteger2(attrs[key]);
    if (value != null)
      return value;
  }
  return null;
}
function getRequestId(attrs, direct, requestIdAttributes) {
  if (direct)
    return direct;
  for (const key of requestIdAttributes) {
    const value = normalizeString3(attrs[key]);
    if (value)
      return value;
  }
  return null;
}
function extractExceptionFromEvents(events) {
  for (const event of events) {
    const type = getString(event.attributes, "exception.type");
    const message = getString(event.attributes, "exception.message");
    const stacktrace = getString(event.attributes, "exception.stacktrace");
    if ((normalizeString3(event.name)?.toLowerCase() ?? "") !== "exception" && !type && !message)
      continue;
    return {
      type,
      message,
      stacktrace
    };
  }
  return { type: null, message: null, stacktrace: null };
}
function sha256Hex(value) {
  return createHash("sha256").update(value).digest("hex");
}
function normalizeOtelDecodedSpanResult(profile, input) {
  const traceIdRes = normalizeHexIdResult(input.traceId, 32, "traceId");
  if (Result12.isError(traceIdRes))
    return traceIdRes;
  const spanIdRes = normalizeHexIdResult(input.spanId, 16, "spanId");
  if (Result12.isError(spanIdRes))
    return spanIdRes;
  const parentSpanIdRes = normalizeParentSpanIdResult(input.parentSpanId);
  if (Result12.isError(parentSpanIdRes))
    return parentSpanIdRes;
  const limits = { ...DEFAULT_ATTRIBUTE_LIMITS, ...profile.attributeLimits ?? {} };
  const store = { ...DEFAULT_STORE_CONFIG, ...profile.store ?? {} };
  const urlMode = profile.urlMode ?? DEFAULT_URL_MODE;
  const redactKeys = new Set([...DEFAULT_OTEL_TRACE_REDACT_KEYS, ...profile.redactKeys ?? []].map((key) => key.toLowerCase()));
  const requestIdAttributes = profile.requestIdAttributes ?? [...DEFAULT_REQUEST_ID_ATTRIBUTES];
  const resourceRes = limitAttributes(input.resourceAttributes, {
    maxAttributes: limits.maxAttributesPerSpan,
    maxAttributeValueBytes: limits.maxAttributeValueBytes,
    dropped: 0,
    redactKeys,
    path: "resource.attributes"
  });
  const scopeRes = limitAttributes(input.instrumentationScope?.attributes ?? {}, {
    maxAttributes: limits.maxAttributesPerSpan,
    maxAttributeValueBytes: limits.maxAttributeValueBytes,
    dropped: 0,
    redactKeys,
    path: "instrumentationScope.attributes"
  });
  const attrsRes = limitAttributes(input.attributes, {
    maxAttributes: limits.maxAttributesPerSpan,
    maxAttributeValueBytes: limits.maxAttributeValueBytes,
    dropped: input.droppedAttributesCount ?? 0,
    redactKeys,
    path: "attributes"
  });
  const startUnixNano = normalizeNanoString(input.startUnixNano);
  const endUnixNano = normalizeNanoString(input.endUnixNano);
  const durationRes = durationMs(startUnixNano, endUnixNano);
  if (Result12.isError(durationRes))
    return durationRes;
  const timestamp = isoFromUnixNano(startUnixNano) ?? normalizeString3(input.timestamp) ?? new Date().toISOString();
  const endTimestamp = isoFromUnixNano(endUnixNano);
  const normalizedEvents = [];
  const eventDerivationInput = [];
  let droppedEvents = Math.max(0, Math.trunc(input.droppedEventsCount ?? 0));
  const eventNames = [];
  for (const event of input.events) {
    if (normalizedEvents.length >= limits.maxEventsPerSpan) {
      droppedEvents += 1;
      continue;
    }
    const eventAttrs = limitAttributes(event.attributes, {
      maxAttributes: limits.maxAttributesPerSpan,
      maxAttributeValueBytes: limits.maxAttributeValueBytes,
      dropped: event.droppedAttributesCount ?? 0,
      redactKeys,
      path: `events.${normalizedEvents.length}.attributes`
    });
    const eventName = normalizeString3(event.name) ?? "";
    eventNames.push(eventName);
    eventDerivationInput.push({
      timeUnixNano: normalizeNanoString(event.timeUnixNano),
      name: eventName,
      attributes: eventAttrs.attributes,
      droppedAttributesCount: eventAttrs.dropped
    });
    normalizedEvents.push({
      timestamp: isoFromUnixNano(normalizeNanoString(event.timeUnixNano)),
      timeUnixNano: normalizeNanoString(event.timeUnixNano),
      name: eventName,
      attributes: store.rawEvents ? eventAttrs.attributes : {},
      droppedAttributesCount: eventAttrs.dropped
    });
    resourceRes.redacted.push(...eventAttrs.redacted);
  }
  const normalizedLinks = [];
  let droppedLinks = Math.max(0, Math.trunc(input.droppedLinksCount ?? 0));
  for (const link of input.links) {
    if (normalizedLinks.length >= limits.maxLinksPerSpan) {
      droppedLinks += 1;
      continue;
    }
    const linkTraceIdRes = normalizeHexIdResult(link.traceId, 32, "links.traceId");
    if (Result12.isError(linkTraceIdRes)) {
      droppedLinks += 1;
      continue;
    }
    const linkSpanIdRes = normalizeHexIdResult(link.spanId, 16, "links.spanId");
    if (Result12.isError(linkSpanIdRes)) {
      droppedLinks += 1;
      continue;
    }
    const linkAttrs = limitAttributes(link.attributes, {
      maxAttributes: limits.maxAttributesPerSpan,
      maxAttributeValueBytes: limits.maxAttributeValueBytes,
      dropped: link.droppedAttributesCount ?? 0,
      redactKeys,
      path: `links.${normalizedLinks.length}.attributes`
    });
    normalizedLinks.push({
      traceId: linkTraceIdRes.value,
      spanId: linkSpanIdRes.value,
      traceState: normalizeString3(link.traceState),
      attributes: store.rawLinks ? linkAttrs.attributes : {},
      droppedAttributesCount: linkAttrs.dropped
    });
    resourceRes.redacted.push(...linkAttrs.redacted);
  }
  const resourceAttrs = resourceRes.attributes;
  const spanAttrs = attrsRes.attributes;
  const service = getString(resourceAttrs, "service.name");
  const statusCode = normalizeStatusCode(input.status?.code);
  const exception = extractExceptionFromEvents(eventDerivationInput);
  const attrErrorType = getString(spanAttrs, "exception.type", "error.type");
  const attrErrorMessage = getString(spanAttrs, "exception.message", "error.message");
  const attrErrorStack = getString(spanAttrs, "exception.stacktrace", "error.stacktrace");
  const httpStatusCode = getInteger(spanAttrs, "http.response.status_code", "http.status_code");
  const statusMessage = truncateNullableString(normalizeString3(input.status?.message), limits.maxAttributeValueBytes);
  const errorMessage = attrErrorMessage ?? exception.message ?? statusMessage;
  const traceFlagsRaw = normalizeInteger2(input.traceFlags);
  const dbStatementRaw = getString(spanAttrs, "db.statement", "db.query.text");
  const dbStatement = profile.dbStatementMode === "raw" && dbStatementRaw ? truncateUtf8(dbStatementRaw, limits.maxStatementBytes) : null;
  const canonical = {
    schemaVersion: 1,
    signal: "trace.span",
    timestamp,
    endTimestamp,
    startUnixNano,
    endUnixNano,
    duration: durationRes.value,
    traceId: traceIdRes.value,
    spanId: spanIdRes.value,
    parentSpanId: parentSpanIdRes.value,
    traceState: normalizeString3(input.traceState),
    traceFlags: {
      sampled: traceFlagsRaw == null ? false : (traceFlagsRaw & 1) === 1,
      raw: traceFlagsRaw
    },
    name: normalizeString3(input.name) ?? "",
    kind: normalizeSpanKind(input.kind),
    status: {
      code: statusCode,
      message: statusMessage
    },
    service,
    serviceNamespace: getString(resourceAttrs, "service.namespace"),
    serviceInstanceId: getString(resourceAttrs, "service.instance.id"),
    environment: getString(resourceAttrs, "deployment.environment.name", "deployment.environment"),
    version: getString(resourceAttrs, "service.version"),
    region: getString(resourceAttrs, "cloud.region"),
    requestId: getRequestId(spanAttrs, normalizeString3(input.requestId), requestIdAttributes),
    http: {
      method: getString(spanAttrs, "http.request.method", "http.method"),
      route: getString(spanAttrs, "http.route"),
      path: getString(spanAttrs, "url.path", "http.target"),
      target: getString(spanAttrs, "http.target"),
      url: sanitizeUrl(getString(spanAttrs, "url.full", "http.url"), urlMode, limits.maxAttributeValueBytes),
      statusCode: httpStatusCode,
      userAgent: getString(spanAttrs, "user_agent.original", "http.user_agent")
    },
    db: {
      system: getString(spanAttrs, "db.system"),
      name: getString(spanAttrs, "db.name", "db.namespace"),
      operation: getString(spanAttrs, "db.operation", "db.operation.name"),
      statement: dbStatement
    },
    rpc: {
      system: getString(spanAttrs, "rpc.system"),
      service: getString(spanAttrs, "rpc.service"),
      method: getString(spanAttrs, "rpc.method")
    },
    messaging: {
      system: getString(spanAttrs, "messaging.system"),
      destination: getString(spanAttrs, "messaging.destination", "messaging.destination.name"),
      operation: getString(spanAttrs, "messaging.operation", "messaging.operation.name")
    },
    error: {
      isError: statusCode === "error" || httpStatusCode != null && httpStatusCode >= 500 || !!attrErrorType || !!exception.type,
      type: attrErrorType ?? exception.type,
      message: errorMessage,
      stacktrace: truncateNullableString(attrErrorStack ?? exception.stacktrace, limits.maxAttributeValueBytes)
    },
    instrumentationScope: {
      name: normalizeString3(input.instrumentationScope?.name),
      version: normalizeString3(input.instrumentationScope?.version),
      schemaUrl: normalizeString3(input.instrumentationScope?.schemaUrl),
      attributes: scopeRes.attributes
    },
    resource: {
      schemaUrl: normalizeString3(input.resourceSchemaUrl),
      attributes: store.rawResourceAttributes ? resourceAttrs : {}
    },
    attributes: store.rawSpanAttributes ? spanAttrs : {},
    events: store.rawEvents ? normalizedEvents : [],
    eventNames,
    links: store.rawLinks ? normalizedLinks : [],
    dropped: {
      attributes: attrsRes.dropped,
      events: droppedEvents,
      links: droppedLinks
    },
    redaction: {
      keys: [...resourceRes.redacted, ...scopeRes.redacted, ...attrsRes.redacted].sort()
    },
    identity: {
      spanKey: `${traceIdRes.value}:${spanIdRes.value}`,
      dedupeKey: sha256Hex(`${traceIdRes.value}\x00${spanIdRes.value}\x00${startUnixNano ?? ""}\x00${service ?? ""}\x00${normalizeString3(input.name) ?? ""}`)
    }
  };
  return Result12.ok(canonical);
}
function objectFromUnknown(value) {
  return isPlainObject(value) ? structuredClone(value) : {};
}
function eventFromCanonical(value) {
  if (!isPlainObject(value))
    return null;
  return {
    timeUnixNano: normalizeNanoString(value.timeUnixNano),
    name: normalizeString3(value.name) ?? "",
    attributes: objectFromUnknown(value.attributes),
    droppedAttributesCount: normalizeInteger2(value.droppedAttributesCount) ?? 0
  };
}
function linkFromCanonical(value) {
  if (!isPlainObject(value))
    return null;
  const traceId = normalizeString3(value.traceId);
  const spanId = normalizeString3(value.spanId);
  if (!traceId || !spanId)
    return null;
  return {
    traceId,
    spanId,
    traceState: normalizeString3(value.traceState),
    attributes: objectFromUnknown(value.attributes),
    droppedAttributesCount: normalizeInteger2(value.droppedAttributesCount) ?? 0
  };
}
function canonicalString(value, fallback) {
  const normalized = normalizeString3(value);
  return normalized ?? fallback;
}
function canonicalLimitedString(value, fallback, maxBytes) {
  return truncateNullableString(canonicalString(value, fallback), maxBytes);
}
function canonicalNumber(value, fallback) {
  const normalized = normalizeNumber(value);
  return normalized ?? fallback;
}
function canonicalInteger(value, fallback) {
  const normalized = normalizeInteger2(value);
  return normalized ?? fallback;
}
function canonicalBoolean(value, fallback) {
  return typeof value === "boolean" ? value : fallback;
}
function preserveCanonicalEventNames(value, fallback) {
  const out = new Set(fallback);
  if (Array.isArray(value)) {
    for (const item of value) {
      const normalized = normalizeString3(item);
      if (normalized)
        out.add(normalized);
    }
  }
  return Array.from(out);
}
function preserveRedactionKeys(value, fallback) {
  const out = new Set(fallback);
  if (isPlainObject(value) && Array.isArray(value.keys)) {
    for (const item of value.keys) {
      const normalized = normalizeString3(item);
      if (normalized)
        out.add(normalized);
    }
  }
  return Array.from(out).sort();
}
function preserveCanonicalDerivedFields(canonical, raw, profile, limits) {
  if (raw.schemaVersion !== 1 || raw.signal !== "trace.span")
    return canonical;
  const out = structuredClone(canonical);
  const urlMode = profile.urlMode ?? DEFAULT_URL_MODE;
  out.duration = canonicalNumber(raw.duration, out.duration);
  out.service = canonicalLimitedString(raw.service, out.service, limits.maxAttributeValueBytes);
  out.serviceNamespace = canonicalLimitedString(raw.serviceNamespace, out.serviceNamespace, limits.maxAttributeValueBytes);
  out.serviceInstanceId = canonicalLimitedString(raw.serviceInstanceId, out.serviceInstanceId, limits.maxAttributeValueBytes);
  out.environment = canonicalLimitedString(raw.environment, out.environment, limits.maxAttributeValueBytes);
  out.version = canonicalLimitedString(raw.version, out.version, limits.maxAttributeValueBytes);
  out.region = canonicalLimitedString(raw.region, out.region, limits.maxAttributeValueBytes);
  out.requestId = canonicalLimitedString(raw.requestId, out.requestId, limits.maxAttributeValueBytes);
  const status = isPlainObject(raw.status) ? raw.status : {};
  out.status = {
    code: out.status.code,
    message: canonicalLimitedString(status.message, out.status.message, limits.maxAttributeValueBytes)
  };
  const http = isPlainObject(raw.http) ? raw.http : {};
  out.http = {
    method: canonicalLimitedString(http.method, out.http.method, limits.maxAttributeValueBytes),
    route: canonicalLimitedString(http.route, out.http.route, limits.maxAttributeValueBytes),
    path: canonicalLimitedString(http.path, out.http.path, limits.maxAttributeValueBytes),
    target: canonicalLimitedString(http.target, out.http.target, limits.maxAttributeValueBytes),
    url: sanitizeUrl(canonicalString(http.url, out.http.url), urlMode, limits.maxAttributeValueBytes),
    statusCode: canonicalInteger(http.statusCode, out.http.statusCode),
    userAgent: canonicalLimitedString(http.userAgent, out.http.userAgent, limits.maxAttributeValueBytes)
  };
  const db = isPlainObject(raw.db) ? raw.db : {};
  out.db = {
    system: canonicalLimitedString(db.system, out.db.system, limits.maxAttributeValueBytes),
    name: canonicalLimitedString(db.name, out.db.name, limits.maxAttributeValueBytes),
    operation: canonicalLimitedString(db.operation, out.db.operation, limits.maxAttributeValueBytes),
    statement: profile.dbStatementMode === "raw" ? canonicalLimitedString(db.statement, out.db.statement, limits.maxStatementBytes) : null
  };
  const rpc = isPlainObject(raw.rpc) ? raw.rpc : {};
  out.rpc = {
    system: canonicalLimitedString(rpc.system, out.rpc.system, limits.maxAttributeValueBytes),
    service: canonicalLimitedString(rpc.service, out.rpc.service, limits.maxAttributeValueBytes),
    method: canonicalLimitedString(rpc.method, out.rpc.method, limits.maxAttributeValueBytes)
  };
  const messaging = isPlainObject(raw.messaging) ? raw.messaging : {};
  out.messaging = {
    system: canonicalLimitedString(messaging.system, out.messaging.system, limits.maxAttributeValueBytes),
    destination: canonicalLimitedString(messaging.destination, out.messaging.destination, limits.maxAttributeValueBytes),
    operation: canonicalLimitedString(messaging.operation, out.messaging.operation, limits.maxAttributeValueBytes)
  };
  const error = isPlainObject(raw.error) ? raw.error : {};
  out.error = {
    isError: canonicalBoolean(error.isError, out.error.isError),
    type: canonicalLimitedString(error.type, out.error.type, limits.maxAttributeValueBytes),
    message: canonicalLimitedString(error.message, out.error.message, limits.maxAttributeValueBytes),
    stacktrace: canonicalLimitedString(error.stacktrace, out.error.stacktrace, limits.maxAttributeValueBytes)
  };
  out.eventNames = preserveCanonicalEventNames(raw.eventNames, out.eventNames);
  out.redaction.keys = preserveRedactionKeys(raw.redaction, out.redaction.keys);
  const dropped = isPlainObject(raw.dropped) ? raw.dropped : {};
  out.dropped = {
    attributes: canonicalInteger(dropped.attributes, out.dropped.attributes) ?? 0,
    events: canonicalInteger(dropped.events, out.dropped.events) ?? 0,
    links: canonicalInteger(dropped.links, out.dropped.links) ?? 0
  };
  out.identity = {
    spanKey: `${out.traceId}:${out.spanId}`,
    dedupeKey: sha256Hex(`${out.traceId}\x00${out.spanId}\x00${out.startUnixNano ?? ""}\x00${out.service ?? ""}\x00${out.name}`)
  };
  return out;
}
function decodedSpanFromCanonicalLikeResult(value) {
  const objRes = expectPlainObjectResult(value, "otel-traces record");
  if (Result12.isError(objRes))
    return objRes;
  const obj = objRes.value;
  const traceId = normalizeString3(obj.traceId);
  const spanId = normalizeString3(obj.spanId);
  if (!traceId)
    return Result12.err({ message: "traceId is required" });
  if (!spanId)
    return Result12.err({ message: "spanId is required" });
  const resource = isPlainObject(obj.resource) ? obj.resource : {};
  const scope = isPlainObject(obj.instrumentationScope) ? obj.instrumentationScope : {};
  const status = isPlainObject(obj.status) ? obj.status : {};
  const traceFlags = isPlainObject(obj.traceFlags) ? obj.traceFlags : {};
  return Result12.ok({
    traceId,
    spanId,
    parentSpanId: normalizeString3(obj.parentSpanId),
    traceState: normalizeString3(obj.traceState),
    traceFlags: normalizeInteger2(traceFlags.raw),
    name: normalizeString3(obj.name) ?? "",
    kind: obj.kind,
    startUnixNano: normalizeNanoString(obj.startUnixNano),
    endUnixNano: normalizeNanoString(obj.endUnixNano),
    timestamp: normalizeString3(obj.timestamp),
    status: {
      code: status.code,
      message: normalizeString3(status.message)
    },
    resourceSchemaUrl: normalizeString3(resource.schemaUrl),
    resourceAttributes: objectFromUnknown(resource.attributes),
    instrumentationScope: {
      name: normalizeString3(scope.name),
      version: normalizeString3(scope.version),
      schemaUrl: normalizeString3(scope.schemaUrl),
      attributes: objectFromUnknown(scope.attributes)
    },
    attributes: objectFromUnknown(obj.attributes),
    events: Array.isArray(obj.events) ? obj.events.map(eventFromCanonical).filter((event) => !!event) : [],
    links: Array.isArray(obj.links) ? obj.links.map(linkFromCanonical).filter((link) => !!link) : [],
    droppedAttributesCount: isPlainObject(obj.dropped) ? normalizeInteger2(obj.dropped.attributes) ?? 0 : 0,
    droppedEventsCount: isPlainObject(obj.dropped) ? normalizeInteger2(obj.dropped.events) ?? 0 : 0,
    droppedLinksCount: isPlainObject(obj.dropped) ? normalizeInteger2(obj.dropped.links) ?? 0 : 0,
    requestId: normalizeString3(obj.requestId)
  });
}
function normalizeOtelTraceRecordResult(profile, value) {
  const decodedRes = decodedSpanFromCanonicalLikeResult(value);
  if (Result12.isError(decodedRes))
    return decodedRes;
  const normalizedRes = normalizeOtelDecodedSpanResult(profile, decodedRes.value);
  if (Result12.isError(normalizedRes))
    return normalizedRes;
  const limits = { ...DEFAULT_ATTRIBUTE_LIMITS, ...profile.attributeLimits ?? {} };
  const normalized = preserveCanonicalDerivedFields(normalizedRes.value, isPlainObject(value) ? value : {}, profile, limits);
  return Result12.ok({
    value: normalized,
    routingKey: normalized.traceId
  });
}

// src/profiles/otelTraces/otlp.ts
import { gunzipSync } from "node:zlib";
import { Result as Result13 } from "better-result";
var JSON_TEXT_DECODER = new TextDecoder;
var JSON_CONTENT_TYPE = "application/json";
var PROTOBUF_CONTENT_TYPE = "application/x-protobuf";
function baseContentType(value) {
  return value.split(";")[0]?.trim().toLowerCase() ?? "";
}
function hexFromBytes(bytes) {
  return Array.from(bytes).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
function isPlainObject2(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function normalizeString4(value) {
  if (typeof value !== "string")
    return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}
function normalizeNanoString2(value) {
  if (value == null)
    return null;
  if (typeof value === "bigint")
    return value >= 0n ? value.toString() : null;
  if (typeof value === "number" && Number.isFinite(value) && Number.isInteger(value) && value >= 0)
    return BigInt(value).toString();
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (/^(0|[1-9][0-9]*)$/.test(trimmed))
      return trimmed;
  }
  return null;
}
function appendWarning(warnings, message) {
  if (warnings.includes(message))
    return;
  if (warnings.length < 8)
    warnings.push(message);
}
function checkAnyValueDepthResult(depth, limits) {
  if (depth > limits.maxAnyValueDepth) {
    return Result13.err({ message: `OTLP AnyValue nesting too deep (max ${limits.maxAnyValueDepth})` });
  }
  return Result13.ok(undefined);
}
function anyValueFromJsonResult(raw, limits, depth = 0) {
  const depthRes = checkAnyValueDepthResult(depth, limits);
  if (Result13.isError(depthRes))
    return depthRes;
  if (!isPlainObject2(raw))
    return Result13.ok(structuredClone(raw));
  if (Object.prototype.hasOwnProperty.call(raw, "stringValue"))
    return Result13.ok(normalizeString4(raw.stringValue) ?? "");
  if (Object.prototype.hasOwnProperty.call(raw, "boolValue"))
    return Result13.ok(raw.boolValue === true);
  if (Object.prototype.hasOwnProperty.call(raw, "intValue")) {
    const value = raw.intValue;
    if (typeof value === "string" && /^-?(0|[1-9][0-9]*)$/.test(value.trim()))
      return Result13.ok(value.trim());
    if (typeof value === "number" && Number.isFinite(value))
      return Result13.ok(Math.trunc(value));
    return Result13.ok(null);
  }
  if (Object.prototype.hasOwnProperty.call(raw, "doubleValue")) {
    return Result13.ok(typeof raw.doubleValue === "number" ? raw.doubleValue : Number(raw.doubleValue));
  }
  if (Object.prototype.hasOwnProperty.call(raw, "bytesValue"))
    return Result13.ok(normalizeString4(raw.bytesValue) ?? "");
  if (isPlainObject2(raw.arrayValue) && Array.isArray(raw.arrayValue.values)) {
    if (raw.arrayValue.values.length > limits.maxArrayValuesPerAnyValue) {
      return Result13.err({ message: `OTLP AnyValue array too large (max ${limits.maxArrayValuesPerAnyValue})` });
    }
    const out = [];
    for (const item of raw.arrayValue.values) {
      const valueRes = anyValueFromJsonResult(item, limits, depth + 1);
      if (Result13.isError(valueRes))
        return valueRes;
      out.push(valueRes.value);
    }
    return Result13.ok(out);
  }
  if (isPlainObject2(raw.kvlistValue) && Array.isArray(raw.kvlistValue.values)) {
    return keyValuesFromJsonResult(raw.kvlistValue.values, limits, depth + 1, true);
  }
  return Result13.ok(structuredClone(raw));
}
function keyValuesFromJsonResult(raw, limits, depth, enforceCollectionLimit) {
  const depthRes = checkAnyValueDepthResult(depth, limits);
  if (Result13.isError(depthRes))
    return depthRes;
  const out = {};
  if (!Array.isArray(raw))
    return Result13.ok(out);
  if (enforceCollectionLimit && raw.length > limits.maxKvListValuesPerAnyValue) {
    return Result13.err({ message: `OTLP AnyValue kvlist too large (max ${limits.maxKvListValuesPerAnyValue})` });
  }
  for (const item of raw) {
    if (!isPlainObject2(item))
      continue;
    const key = normalizeString4(item.key);
    if (!key)
      continue;
    const valueRes = anyValueFromJsonResult(item.value, limits, depth);
    if (Result13.isError(valueRes))
      return valueRes;
    out[key] = valueRes.value;
  }
  return Result13.ok(out);
}
function eventFromJsonResult(raw, limits) {
  if (!isPlainObject2(raw))
    return Result13.ok(null);
  const attrsRes = keyValuesFromJsonResult(raw.attributes, limits, 0, false);
  if (Result13.isError(attrsRes))
    return attrsRes;
  return Result13.ok({
    timeUnixNano: normalizeNanoString2(raw.timeUnixNano),
    name: normalizeString4(raw.name) ?? "",
    attributes: attrsRes.value,
    droppedAttributesCount: typeof raw.droppedAttributesCount === "number" ? raw.droppedAttributesCount : Number(raw.droppedAttributesCount ?? 0)
  });
}
function linkFromJsonResult(raw, limits) {
  if (!isPlainObject2(raw))
    return Result13.ok(null);
  const traceId = normalizeString4(raw.traceId);
  const spanId = normalizeString4(raw.spanId);
  if (!traceId || !spanId)
    return Result13.ok(null);
  const attrsRes = keyValuesFromJsonResult(raw.attributes, limits, 0, false);
  if (Result13.isError(attrsRes))
    return attrsRes;
  return Result13.ok({
    traceId,
    spanId,
    traceState: normalizeString4(raw.traceState),
    attributes: attrsRes.value,
    droppedAttributesCount: typeof raw.droppedAttributesCount === "number" ? raw.droppedAttributesCount : Number(raw.droppedAttributesCount ?? 0)
  });
}
function spanFromJsonResult(raw, limits) {
  if (!isPlainObject2(raw))
    return Result13.ok(null);
  const traceId = normalizeString4(raw.traceId);
  const spanId = normalizeString4(raw.spanId);
  if (!traceId || !spanId)
    return Result13.ok(null);
  const status = isPlainObject2(raw.status) ? raw.status : {};
  const attrsRes = keyValuesFromJsonResult(raw.attributes, limits, 0, false);
  if (Result13.isError(attrsRes))
    return attrsRes;
  const events = [];
  if (Array.isArray(raw.events)) {
    for (const eventRaw of raw.events) {
      const eventRes = eventFromJsonResult(eventRaw, limits);
      if (Result13.isError(eventRes))
        return eventRes;
      if (eventRes.value)
        events.push(eventRes.value);
    }
  }
  const links = [];
  if (Array.isArray(raw.links)) {
    for (const linkRaw of raw.links) {
      const linkRes = linkFromJsonResult(linkRaw, limits);
      if (Result13.isError(linkRes))
        return linkRes;
      if (linkRes.value)
        links.push(linkRes.value);
    }
  }
  return Result13.ok({
    traceId,
    spanId,
    parentSpanId: normalizeString4(raw.parentSpanId),
    traceState: normalizeString4(raw.traceState),
    traceFlags: typeof raw.flags === "number" ? raw.flags : Number(raw.flags ?? raw.traceFlags ?? 0),
    name: normalizeString4(raw.name) ?? "",
    kind: raw.kind,
    startUnixNano: normalizeNanoString2(raw.startTimeUnixNano),
    endUnixNano: normalizeNanoString2(raw.endTimeUnixNano),
    status: {
      code: status.code,
      message: normalizeString4(status.message)
    },
    attributes: attrsRes.value,
    events,
    links,
    droppedAttributesCount: typeof raw.droppedAttributesCount === "number" ? raw.droppedAttributesCount : Number(raw.droppedAttributesCount ?? 0),
    droppedEventsCount: typeof raw.droppedEventsCount === "number" ? raw.droppedEventsCount : Number(raw.droppedEventsCount ?? 0),
    droppedLinksCount: typeof raw.droppedLinksCount === "number" ? raw.droppedLinksCount : Number(raw.droppedLinksCount ?? 0)
  });
}
function incrementLimitCounter(counters, key, max, label) {
  counters[key] += 1;
  if (counters[key] > max)
    return Result13.err({ message: `too many ${label} in OTLP request (max ${max})` });
  return Result13.ok(undefined);
}
function acceptSpanForDecode(counters, limits) {
  counters.spans += 1;
  if (counters.spans <= limits.maxSpansPerRequest)
    return true;
  counters.rejectedSpans += 1;
  appendWarning(counters.warnings, `too many spans in OTLP request (max ${limits.maxSpansPerRequest})`);
  return false;
}
function decodeJsonExportResult(body, limits) {
  let parsed;
  try {
    parsed = JSON.parse(JSON_TEXT_DECODER.decode(body));
  } catch {
    return Result13.err({ message: "invalid OTLP JSON" });
  }
  if (!isPlainObject2(parsed))
    return Result13.err({ message: "OTLP JSON request must be an object" });
  const out = [];
  const counters = { resourceSpans: 0, scopeSpans: 0, spans: 0, rejectedSpans: 0, warnings: [] };
  const resourceSpans = Array.isArray(parsed.resourceSpans) ? parsed.resourceSpans : [];
  for (const resourceSpanRaw of resourceSpans) {
    const resourceLimitRes = incrementLimitCounter(counters, "resourceSpans", limits.maxResourceSpansPerRequest, "resourceSpans");
    if (Result13.isError(resourceLimitRes))
      return resourceLimitRes;
    if (!isPlainObject2(resourceSpanRaw))
      continue;
    const resource = isPlainObject2(resourceSpanRaw.resource) ? resourceSpanRaw.resource : {};
    const resourceAttributesRes = keyValuesFromJsonResult(resource.attributes, limits, 0, false);
    if (Result13.isError(resourceAttributesRes))
      return resourceAttributesRes;
    const resourceAttributes = resourceAttributesRes.value;
    const resourceSchemaUrl = normalizeString4(resourceSpanRaw.schemaUrl);
    const scopeSpans = [
      ...Array.isArray(resourceSpanRaw.scopeSpans) ? resourceSpanRaw.scopeSpans : [],
      ...Array.isArray(resourceSpanRaw.instrumentationLibrarySpans) ? resourceSpanRaw.instrumentationLibrarySpans : []
    ];
    for (const scopeSpanRaw of scopeSpans) {
      const scopeLimitRes = incrementLimitCounter(counters, "scopeSpans", limits.maxScopeSpansPerRequest, "scopeSpans");
      if (Result13.isError(scopeLimitRes))
        return scopeLimitRes;
      if (!isPlainObject2(scopeSpanRaw))
        continue;
      const scopeRaw = isPlainObject2(scopeSpanRaw.scope) ? scopeSpanRaw.scope : isPlainObject2(scopeSpanRaw.instrumentationLibrary) ? scopeSpanRaw.instrumentationLibrary : {};
      const scopeAttrsRes = keyValuesFromJsonResult(scopeRaw.attributes, limits, 0, false);
      if (Result13.isError(scopeAttrsRes))
        return scopeAttrsRes;
      const scope = {
        name: normalizeString4(scopeRaw.name),
        version: normalizeString4(scopeRaw.version),
        schemaUrl: normalizeString4(scopeSpanRaw.schemaUrl),
        attributes: scopeAttrsRes.value
      };
      const spans = Array.isArray(scopeSpanRaw.spans) ? scopeSpanRaw.spans : [];
      for (const spanRaw of spans) {
        if (!acceptSpanForDecode(counters, limits))
          continue;
        const spanRes = spanFromJsonResult(spanRaw, limits);
        if (Result13.isError(spanRes))
          return spanRes;
        const span = spanRes.value;
        if (!span)
          continue;
        out.push({
          ...span,
          resourceAttributes,
          resourceSchemaUrl,
          instrumentationScope: scope
        });
      }
    }
  }
  return Result13.ok({ spans: out, rejectedSpans: counters.rejectedSpans, warnings: counters.warnings });
}

class ProtoReader {
  bytes;
  pos = 0;
  constructor(bytes) {
    this.bytes = bytes;
  }
  eof() {
    return this.pos >= this.bytes.byteLength;
  }
  readTag() {
    const tagRes = this.readVarint();
    if (Result13.isError(tagRes))
      return tagRes;
    const tag = Number(tagRes.value);
    if (tag === 0)
      return Result13.err({ message: "invalid protobuf tag" });
    return Result13.ok({ field: tag >>> 3, wire: tag & 7 });
  }
  readVarint() {
    let shift = 0n;
    let out = 0n;
    while (shift <= 63n) {
      if (this.pos >= this.bytes.byteLength)
        return Result13.err({ message: "truncated protobuf varint" });
      const byte = this.bytes[this.pos++];
      out |= BigInt(byte & 127) << shift;
      if ((byte & 128) === 0)
        return Result13.ok(out);
      shift += 7n;
    }
    return Result13.err({ message: "protobuf varint too long" });
  }
  readFixed32() {
    if (this.pos + 4 > this.bytes.byteLength)
      return Result13.err({ message: "truncated protobuf fixed32" });
    const view = new DataView(this.bytes.buffer, this.bytes.byteOffset + this.pos, 4);
    this.pos += 4;
    return Result13.ok(view.getUint32(0, true));
  }
  readFixed64() {
    if (this.pos + 8 > this.bytes.byteLength)
      return Result13.err({ message: "truncated protobuf fixed64" });
    const view = new DataView(this.bytes.buffer, this.bytes.byteOffset + this.pos, 8);
    this.pos += 8;
    return Result13.ok(view.getBigUint64(0, true));
  }
  readDouble() {
    if (this.pos + 8 > this.bytes.byteLength)
      return Result13.err({ message: "truncated protobuf double" });
    const view = new DataView(this.bytes.buffer, this.bytes.byteOffset + this.pos, 8);
    this.pos += 8;
    return Result13.ok(view.getFloat64(0, true));
  }
  readBytes() {
    const lenRes = this.readVarint();
    if (Result13.isError(lenRes))
      return lenRes;
    const len = Number(lenRes.value);
    if (!Number.isSafeInteger(len) || len < 0 || this.pos + len > this.bytes.byteLength) {
      return Result13.err({ message: "truncated protobuf bytes" });
    }
    const out = this.bytes.slice(this.pos, this.pos + len);
    this.pos += len;
    return Result13.ok(out);
  }
  readString() {
    const bytesRes = this.readBytes();
    if (Result13.isError(bytesRes))
      return bytesRes;
    return Result13.ok(JSON_TEXT_DECODER.decode(bytesRes.value));
  }
  skip(wire) {
    if (wire === 0) {
      const res = this.readVarint();
      return Result13.isError(res) ? res : Result13.ok(undefined);
    }
    if (wire === 1) {
      const res = this.readFixed64();
      return Result13.isError(res) ? res : Result13.ok(undefined);
    }
    if (wire === 2) {
      const res = this.readBytes();
      return Result13.isError(res) ? res : Result13.ok(undefined);
    }
    if (wire === 5) {
      const res = this.readFixed32();
      return Result13.isError(res) ? res : Result13.ok(undefined);
    }
    return Result13.err({ message: `unsupported protobuf wire type ${wire}` });
  }
}
function signedInt64(value) {
  return value > 9223372036854775807n ? (value - 18446744073709551616n).toString() : value.toString();
}
function decodeAnyValue(bytes, limits, depth = 0) {
  const depthRes = checkAnyValueDepthResult(depth, limits);
  if (Result13.isError(depthRes))
    return depthRes;
  const reader = new ProtoReader(bytes);
  let value = null;
  while (!reader.eof()) {
    const tagRes = reader.readTag();
    if (Result13.isError(tagRes))
      return tagRes;
    const { field, wire } = tagRes.value;
    if (field === 1 && wire === 2) {
      const res = reader.readString();
      if (Result13.isError(res))
        return res;
      value = res.value;
    } else if (field === 2 && wire === 0) {
      const res = reader.readVarint();
      if (Result13.isError(res))
        return res;
      value = res.value !== 0n;
    } else if (field === 3 && wire === 0) {
      const res = reader.readVarint();
      if (Result13.isError(res))
        return res;
      value = signedInt64(res.value);
    } else if (field === 4 && wire === 1) {
      const res = reader.readDouble();
      if (Result13.isError(res))
        return res;
      value = res.value;
    } else if (field === 5 && wire === 2) {
      const bytesRes = reader.readBytes();
      if (Result13.isError(bytesRes))
        return bytesRes;
      const arrayRes = decodeArrayValue(bytesRes.value, limits, depth + 1);
      if (Result13.isError(arrayRes))
        return arrayRes;
      value = arrayRes.value;
    } else if (field === 6 && wire === 2) {
      const bytesRes = reader.readBytes();
      if (Result13.isError(bytesRes))
        return bytesRes;
      const kvRes = decodeKeyValueList(bytesRes.value, limits, depth + 1, true);
      if (Result13.isError(kvRes))
        return kvRes;
      value = kvRes.value;
    } else if (field === 7 && wire === 2) {
      const bytesRes = reader.readBytes();
      if (Result13.isError(bytesRes))
        return bytesRes;
      value = Buffer.from(bytesRes.value).toString("base64");
    } else {
      const skipRes = reader.skip(wire);
      if (Result13.isError(skipRes))
        return skipRes;
    }
  }
  return Result13.ok(value);
}
function decodeArrayValue(bytes, limits, depth) {
  const depthRes = checkAnyValueDepthResult(depth, limits);
  if (Result13.isError(depthRes))
    return depthRes;
  const reader = new ProtoReader(bytes);
  const out = [];
  while (!reader.eof()) {
    const tagRes = reader.readTag();
    if (Result13.isError(tagRes))
      return tagRes;
    if (tagRes.value.field === 1 && tagRes.value.wire === 2) {
      if (out.length >= limits.maxArrayValuesPerAnyValue) {
        return Result13.err({ message: `OTLP AnyValue array too large (max ${limits.maxArrayValuesPerAnyValue})` });
      }
      const bytesRes = reader.readBytes();
      if (Result13.isError(bytesRes))
        return bytesRes;
      const valueRes = decodeAnyValue(bytesRes.value, limits, depth);
      if (Result13.isError(valueRes))
        return valueRes;
      out.push(valueRes.value);
    } else {
      const skipRes = reader.skip(tagRes.value.wire);
      if (Result13.isError(skipRes))
        return skipRes;
    }
  }
  return Result13.ok(out);
}
function decodeKeyValue(bytes, limits, depth) {
  const reader = new ProtoReader(bytes);
  let key = "";
  let value = null;
  while (!reader.eof()) {
    const tagRes = reader.readTag();
    if (Result13.isError(tagRes))
      return tagRes;
    const { field, wire } = tagRes.value;
    if (field === 1 && wire === 2) {
      const keyRes = reader.readString();
      if (Result13.isError(keyRes))
        return keyRes;
      key = keyRes.value;
    } else if (field === 2 && wire === 2) {
      const bytesRes = reader.readBytes();
      if (Result13.isError(bytesRes))
        return bytesRes;
      const valueRes = decodeAnyValue(bytesRes.value, limits, depth);
      if (Result13.isError(valueRes))
        return valueRes;
      value = valueRes.value;
    } else {
      const skipRes = reader.skip(wire);
      if (Result13.isError(skipRes))
        return skipRes;
    }
  }
  return Result13.ok(key === "" ? null : { key, value });
}
function decodeKeyValueList(bytes, limits, depth, enforceCollectionLimit) {
  const depthRes = checkAnyValueDepthResult(depth, limits);
  if (Result13.isError(depthRes))
    return depthRes;
  const reader = new ProtoReader(bytes);
  const out = {};
  let count = 0;
  while (!reader.eof()) {
    const tagRes = reader.readTag();
    if (Result13.isError(tagRes))
      return tagRes;
    if (tagRes.value.field === 1 && tagRes.value.wire === 2) {
      count += 1;
      if (enforceCollectionLimit && count > limits.maxKvListValuesPerAnyValue) {
        return Result13.err({ message: `OTLP AnyValue kvlist too large (max ${limits.maxKvListValuesPerAnyValue})` });
      }
      const bytesRes = reader.readBytes();
      if (Result13.isError(bytesRes))
        return bytesRes;
      const kvRes = decodeKeyValue(bytesRes.value, limits, depth);
      if (Result13.isError(kvRes))
        return kvRes;
      if (kvRes.value)
        out[kvRes.value.key] = kvRes.value.value;
    } else {
      const skipRes = reader.skip(tagRes.value.wire);
      if (Result13.isError(skipRes))
        return skipRes;
    }
  }
  return Result13.ok(out);
}
function decodeResource(bytes, limits) {
  return decodeKeyValueList(bytes, limits, 0, false);
}
function decodeScope(bytes, limits) {
  const reader = new ProtoReader(bytes);
  const scope = { name: null, version: null, schemaUrl: null, attributes: {} };
  while (!reader.eof()) {
    const tagRes = reader.readTag();
    if (Result13.isError(tagRes))
      return tagRes;
    const { field, wire } = tagRes.value;
    if (field === 1 && wire === 2) {
      const res = reader.readString();
      if (Result13.isError(res))
        return res;
      scope.name = res.value;
    } else if (field === 2 && wire === 2) {
      const res = reader.readString();
      if (Result13.isError(res))
        return res;
      scope.version = res.value;
    } else if (field === 3 && wire === 2) {
      const bytesRes = reader.readBytes();
      if (Result13.isError(bytesRes))
        return bytesRes;
      const kvRes = decodeKeyValue(bytesRes.value, limits, 0);
      if (Result13.isError(kvRes))
        return kvRes;
      if (kvRes.value)
        scope.attributes[kvRes.value.key] = kvRes.value.value;
    } else {
      const skipRes = reader.skip(wire);
      if (Result13.isError(skipRes))
        return skipRes;
    }
  }
  return Result13.ok(scope);
}
function decodeStatus(bytes) {
  const reader = new ProtoReader(bytes);
  const status = {};
  while (!reader.eof()) {
    const tagRes = reader.readTag();
    if (Result13.isError(tagRes))
      return tagRes;
    const { field, wire } = tagRes.value;
    if ((field === 1 || field === 3) && wire === 0) {
      const res = reader.readVarint();
      if (Result13.isError(res))
        return res;
      status.code = Number(res.value);
    } else if (field === 2 && wire === 2) {
      const res = reader.readString();
      if (Result13.isError(res))
        return res;
      status.message = res.value;
    } else {
      const skipRes = reader.skip(wire);
      if (Result13.isError(skipRes))
        return skipRes;
    }
  }
  return Result13.ok(status);
}
function decodeEvent(bytes, limits) {
  const reader = new ProtoReader(bytes);
  const event = { timeUnixNano: null, name: "", attributes: {}, droppedAttributesCount: 0 };
  while (!reader.eof()) {
    const tagRes = reader.readTag();
    if (Result13.isError(tagRes))
      return tagRes;
    const { field, wire } = tagRes.value;
    if (field === 1 && (wire === 1 || wire === 0)) {
      const res = wire === 1 ? reader.readFixed64() : reader.readVarint();
      if (Result13.isError(res))
        return res;
      event.timeUnixNano = res.value.toString();
    } else if (field === 2 && wire === 2) {
      const res = reader.readString();
      if (Result13.isError(res))
        return res;
      event.name = res.value;
    } else if (field === 3 && wire === 2) {
      const bytesRes = reader.readBytes();
      if (Result13.isError(bytesRes))
        return bytesRes;
      const kvRes = decodeKeyValue(bytesRes.value, limits, 0);
      if (Result13.isError(kvRes))
        return kvRes;
      if (kvRes.value)
        event.attributes[kvRes.value.key] = kvRes.value.value;
    } else if (field === 4 && wire === 0) {
      const res = reader.readVarint();
      if (Result13.isError(res))
        return res;
      event.droppedAttributesCount = Number(res.value);
    } else {
      const skipRes = reader.skip(wire);
      if (Result13.isError(skipRes))
        return skipRes;
    }
  }
  return Result13.ok(event);
}
function decodeLink(bytes, limits) {
  const reader = new ProtoReader(bytes);
  const link = { traceId: "", spanId: "", traceState: null, attributes: {}, droppedAttributesCount: 0 };
  while (!reader.eof()) {
    const tagRes = reader.readTag();
    if (Result13.isError(tagRes))
      return tagRes;
    const { field, wire } = tagRes.value;
    if (field === 1 && wire === 2) {
      const res = reader.readBytes();
      if (Result13.isError(res))
        return res;
      link.traceId = hexFromBytes(res.value);
    } else if (field === 2 && wire === 2) {
      const res = reader.readBytes();
      if (Result13.isError(res))
        return res;
      link.spanId = hexFromBytes(res.value);
    } else if (field === 3 && wire === 2) {
      const res = reader.readString();
      if (Result13.isError(res))
        return res;
      link.traceState = res.value;
    } else if (field === 4 && wire === 2) {
      const bytesRes = reader.readBytes();
      if (Result13.isError(bytesRes))
        return bytesRes;
      const kvRes = decodeKeyValue(bytesRes.value, limits, 0);
      if (Result13.isError(kvRes))
        return kvRes;
      if (kvRes.value)
        link.attributes[kvRes.value.key] = kvRes.value.value;
    } else if (field === 5 && wire === 0) {
      const res = reader.readVarint();
      if (Result13.isError(res))
        return res;
      link.droppedAttributesCount = Number(res.value);
    } else {
      const skipRes = reader.skip(wire);
      if (Result13.isError(skipRes))
        return skipRes;
    }
  }
  return Result13.ok(link);
}
function decodeSpan(bytes, limits) {
  const reader = new ProtoReader(bytes);
  const span = {
    traceId: "",
    spanId: "",
    parentSpanId: null,
    traceState: null,
    traceFlags: null,
    name: "",
    kind: 0,
    startUnixNano: null,
    endUnixNano: null,
    status: { code: 0, message: null },
    attributes: {},
    events: [],
    links: [],
    droppedAttributesCount: 0,
    droppedEventsCount: 0,
    droppedLinksCount: 0
  };
  while (!reader.eof()) {
    const tagRes = reader.readTag();
    if (Result13.isError(tagRes))
      return tagRes;
    const { field, wire } = tagRes.value;
    if (field === 1 && wire === 2) {
      const res = reader.readBytes();
      if (Result13.isError(res))
        return res;
      span.traceId = hexFromBytes(res.value);
    } else if (field === 2 && wire === 2) {
      const res = reader.readBytes();
      if (Result13.isError(res))
        return res;
      span.spanId = hexFromBytes(res.value);
    } else if (field === 3 && wire === 2) {
      const res = reader.readString();
      if (Result13.isError(res))
        return res;
      span.traceState = res.value;
    } else if (field === 4 && wire === 2) {
      const res = reader.readBytes();
      if (Result13.isError(res))
        return res;
      span.parentSpanId = res.value.byteLength === 0 ? null : hexFromBytes(res.value);
    } else if (field === 5 && wire === 2) {
      const res = reader.readString();
      if (Result13.isError(res))
        return res;
      span.name = res.value;
    } else if (field === 6 && wire === 0) {
      const res = reader.readVarint();
      if (Result13.isError(res))
        return res;
      span.kind = Number(res.value);
    } else if ((field === 7 || field === 8) && (wire === 1 || wire === 0)) {
      const res = wire === 1 ? reader.readFixed64() : reader.readVarint();
      if (Result13.isError(res))
        return res;
      if (field === 7)
        span.startUnixNano = res.value.toString();
      else
        span.endUnixNano = res.value.toString();
    } else if (field === 9 && wire === 2) {
      const bytesRes = reader.readBytes();
      if (Result13.isError(bytesRes))
        return bytesRes;
      const kvRes = decodeKeyValue(bytesRes.value, limits, 0);
      if (Result13.isError(kvRes))
        return kvRes;
      if (kvRes.value)
        span.attributes[kvRes.value.key] = kvRes.value.value;
    } else if (field === 10 && wire === 0) {
      const res = reader.readVarint();
      if (Result13.isError(res))
        return res;
      span.droppedAttributesCount = Number(res.value);
    } else if (field === 11 && wire === 2) {
      const bytesRes = reader.readBytes();
      if (Result13.isError(bytesRes))
        return bytesRes;
      const eventRes = decodeEvent(bytesRes.value, limits);
      if (Result13.isError(eventRes))
        return eventRes;
      span.events.push(eventRes.value);
    } else if (field === 12 && wire === 0) {
      const res = reader.readVarint();
      if (Result13.isError(res))
        return res;
      span.droppedEventsCount = Number(res.value);
    } else if (field === 13 && wire === 2) {
      const bytesRes = reader.readBytes();
      if (Result13.isError(bytesRes))
        return bytesRes;
      const linkRes = decodeLink(bytesRes.value, limits);
      if (Result13.isError(linkRes))
        return linkRes;
      span.links.push(linkRes.value);
    } else if (field === 14 && wire === 0) {
      const res = reader.readVarint();
      if (Result13.isError(res))
        return res;
      span.droppedLinksCount = Number(res.value);
    } else if (field === 15 && wire === 2) {
      const bytesRes = reader.readBytes();
      if (Result13.isError(bytesRes))
        return bytesRes;
      const statusRes = decodeStatus(bytesRes.value);
      if (Result13.isError(statusRes))
        return statusRes;
      span.status = statusRes.value;
    } else if (field === 16 && (wire === 5 || wire === 0)) {
      if (wire === 5) {
        const res = reader.readFixed32();
        if (Result13.isError(res))
          return res;
        span.traceFlags = res.value;
      } else {
        const res = reader.readVarint();
        if (Result13.isError(res))
          return res;
        span.traceFlags = Number(res.value);
      }
    } else {
      const skipRes = reader.skip(wire);
      if (Result13.isError(skipRes))
        return skipRes;
    }
  }
  return Result13.ok(span);
}
function decodeScopeSpans(bytes, limits, counters) {
  const reader = new ProtoReader(bytes);
  const out = {
    scope: { name: null, version: null, schemaUrl: null, attributes: {} },
    spans: []
  };
  while (!reader.eof()) {
    const tagRes = reader.readTag();
    if (Result13.isError(tagRes))
      return tagRes;
    const { field, wire } = tagRes.value;
    if ((field === 1 || field === 1000) && wire === 2) {
      const bytesRes = reader.readBytes();
      if (Result13.isError(bytesRes))
        return bytesRes;
      const scopeRes = decodeScope(bytesRes.value, limits);
      if (Result13.isError(scopeRes))
        return scopeRes;
      out.scope = { ...out.scope, ...scopeRes.value };
    } else if (field === 2 && wire === 2) {
      const bytesRes = reader.readBytes();
      if (Result13.isError(bytesRes))
        return bytesRes;
      if (!acceptSpanForDecode(counters, limits))
        continue;
      const spanRes = decodeSpan(bytesRes.value, limits);
      if (Result13.isError(spanRes))
        return spanRes;
      out.spans.push(spanRes.value);
    } else if (field === 3 && wire === 2) {
      const res = reader.readString();
      if (Result13.isError(res))
        return res;
      out.scope.schemaUrl = res.value;
    } else {
      const skipRes = reader.skip(wire);
      if (Result13.isError(skipRes))
        return skipRes;
    }
  }
  return Result13.ok(out);
}
function decodeResourceSpans(bytes, limits, counters) {
  const reader = new ProtoReader(bytes);
  const out = { resourceAttributes: {}, resourceSchemaUrl: null, scopeSpans: [] };
  while (!reader.eof()) {
    const tagRes = reader.readTag();
    if (Result13.isError(tagRes))
      return tagRes;
    const { field, wire } = tagRes.value;
    if (field === 1 && wire === 2) {
      const bytesRes = reader.readBytes();
      if (Result13.isError(bytesRes))
        return bytesRes;
      const resourceRes = decodeResource(bytesRes.value, limits);
      if (Result13.isError(resourceRes))
        return resourceRes;
      out.resourceAttributes = resourceRes.value;
    } else if ((field === 2 || field === 1000) && wire === 2) {
      const scopeLimitRes = incrementLimitCounter(counters, "scopeSpans", limits.maxScopeSpansPerRequest, "scopeSpans");
      if (Result13.isError(scopeLimitRes))
        return scopeLimitRes;
      const bytesRes = reader.readBytes();
      if (Result13.isError(bytesRes))
        return bytesRes;
      const scopeRes = decodeScopeSpans(bytesRes.value, limits, counters);
      if (Result13.isError(scopeRes))
        return scopeRes;
      out.scopeSpans.push(scopeRes.value);
    } else if (field === 3 && wire === 2) {
      const res = reader.readString();
      if (Result13.isError(res))
        return res;
      out.resourceSchemaUrl = res.value;
    } else {
      const skipRes = reader.skip(wire);
      if (Result13.isError(skipRes))
        return skipRes;
    }
  }
  return Result13.ok(out);
}
function decodeProtobufExportResult(body, limits) {
  const reader = new ProtoReader(body);
  const out = [];
  const counters = { resourceSpans: 0, scopeSpans: 0, spans: 0, rejectedSpans: 0, warnings: [] };
  while (!reader.eof()) {
    const tagRes = reader.readTag();
    if (Result13.isError(tagRes))
      return tagRes;
    if (tagRes.value.field === 1 && tagRes.value.wire === 2) {
      const resourceLimitRes = incrementLimitCounter(counters, "resourceSpans", limits.maxResourceSpansPerRequest, "resourceSpans");
      if (Result13.isError(resourceLimitRes))
        return resourceLimitRes;
      const bytesRes = reader.readBytes();
      if (Result13.isError(bytesRes))
        return bytesRes;
      const resourceSpansRes = decodeResourceSpans(bytesRes.value, limits, counters);
      if (Result13.isError(resourceSpansRes))
        return resourceSpansRes;
      for (const scopeSpans of resourceSpansRes.value.scopeSpans) {
        for (const span of scopeSpans.spans) {
          out.push({
            ...span,
            resourceAttributes: resourceSpansRes.value.resourceAttributes,
            resourceSchemaUrl: resourceSpansRes.value.resourceSchemaUrl,
            instrumentationScope: scopeSpans.scope
          });
        }
      }
    } else {
      const skipRes = reader.skip(tagRes.value.wire);
      if (Result13.isError(skipRes))
        return skipRes;
    }
  }
  return Result13.ok({ spans: out, rejectedSpans: counters.rejectedSpans, warnings: counters.warnings });
}
function decodeBody(args) {
  let body = args.body;
  const maxDecodedBytes = Math.min(args.maxDecodedBytes, args.limits.maxDecodedBytes);
  const encoding = args.contentEncoding?.trim().toLowerCase() ?? "";
  if (encoding !== "" && encoding !== "identity" && encoding !== "gzip") {
    return Result13.err({ status: 415, message: "unsupported content-encoding" });
  }
  if (encoding === "gzip") {
    if (body.byteLength > args.limits.maxCompressedBytes) {
      return Result13.err({ status: 413, message: `compressed OTLP body too large (max ${args.limits.maxCompressedBytes})` });
    }
    try {
      body = new Uint8Array(gunzipSync(body, { maxOutputLength: maxDecodedBytes }));
    } catch (error) {
      const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
      if (code === "ERR_BUFFER_TOO_LARGE") {
        return Result13.err({ status: 413, message: `decoded OTLP body too large (max ${maxDecodedBytes})` });
      }
      return Result13.err({ status: 400, message: "invalid gzip body" });
    }
  }
  if (body.byteLength > maxDecodedBytes) {
    return Result13.err({ status: 413, message: `decoded OTLP body too large (max ${maxDecodedBytes})` });
  }
  const contentType = baseContentType(args.contentType);
  if (contentType === JSON_CONTENT_TYPE) {
    const spansRes = decodeJsonExportResult(body, args.limits);
    if (Result13.isError(spansRes))
      return Result13.err({ status: 400, message: spansRes.error.message });
    return Result13.ok({ ...spansRes.value, responseEncoding: "json" });
  }
  if (contentType === PROTOBUF_CONTENT_TYPE) {
    const spansRes = decodeProtobufExportResult(body, args.limits);
    if (Result13.isError(spansRes))
      return Result13.err({ status: 400, message: spansRes.error.message });
    return Result13.ok({ ...spansRes.value, responseEncoding: "protobuf" });
  }
  return Result13.err({ status: 415, message: "OTLP traces require application/x-protobuf or application/json" });
}
function decodeOtlpTraceExportRequestResult(args) {
  const limits = { ...DEFAULT_OTLP_LIMITS, ...args.profile.otlpLimits ?? {} };
  const decodedRes = decodeBody({ ...args, limits });
  if (Result13.isError(decodedRes))
    return decodedRes;
  const records = [];
  const warnings = [...decodedRes.value.warnings];
  let rejectedSpans = decodedRes.value.rejectedSpans;
  for (const span of decodedRes.value.spans) {
    const normalizedRes = normalizeOtelDecodedSpanResult(args.profile, span);
    if (Result13.isError(normalizedRes)) {
      rejectedSpans += 1;
      if (warnings.length < 8)
        warnings.push(normalizedRes.error.message);
      continue;
    }
    records.push({
      value: normalizedRes.value,
      routingKey: normalizedRes.value.traceId
    });
  }
  return Result13.ok({
    records,
    acceptedSpans: records.length,
    rejectedSpans,
    warnings,
    responseEncoding: decodedRes.value.responseEncoding
  });
}

// src/profiles/otelTraces.ts
function cloneOtelTracesProfile(profile) {
  return cloneStreamProfileSpec(profile);
}
function cloneOtelTracesCache(cache) {
  if (!cache || cache.profile.kind !== "otel-traces")
    return null;
  return {
    profile: cloneOtelTracesProfile(cache.profile),
    updatedAtMs: cache.updatedAtMs
  };
}
function isOtelTracesProfile(profile) {
  return !!profile && profile.kind === "otel-traces";
}
function parseStringArrayResult(raw, path, maxItems) {
  if (raw === undefined)
    return Result14.ok(undefined);
  if (!Array.isArray(raw))
    return Result14.err({ message: `${path} must be an array of strings` });
  if (raw.length > maxItems)
    return Result14.err({ message: `${path} too large (max ${maxItems})` });
  const out = [];
  const seen = new Set;
  for (const item of raw) {
    if (typeof item !== "string")
      return Result14.err({ message: `${path} must be an array of strings` });
    const value = item.trim();
    if (value === "")
      return Result14.err({ message: `${path} must not contain empty strings` });
    const key = value.toLowerCase();
    if (seen.has(key))
      continue;
    seen.add(key);
    out.push(path.endsWith("redactKeys") ? key : value);
  }
  return Result14.ok(out);
}
function parsePositiveIntResult(raw, path, fallback) {
  if (raw === undefined)
    return Result14.ok(fallback);
  if (typeof raw !== "number" || !Number.isFinite(raw) || !Number.isInteger(raw) || raw <= 0) {
    return Result14.err({ message: `${path} must be a positive integer` });
  }
  return Result14.ok(raw);
}
function parseAttributeLimitsResult(raw, path) {
  if (raw === undefined)
    return Result14.ok(undefined);
  const objRes = expectPlainObjectResult(raw, path);
  if (Result14.isError(objRes))
    return objRes;
  const keyCheck = rejectUnknownKeysResult(objRes.value, ["maxAttributeValueBytes", "maxAttributesPerSpan", "maxEventsPerSpan", "maxLinksPerSpan", "maxStatementBytes"], path);
  if (Result14.isError(keyCheck))
    return keyCheck;
  const out = {};
  for (const key of Object.keys(DEFAULT_ATTRIBUTE_LIMITS)) {
    const valueRes = parsePositiveIntResult(objRes.value[key], `${path}.${key}`, DEFAULT_ATTRIBUTE_LIMITS[key]);
    if (Result14.isError(valueRes))
      return valueRes;
    if (objRes.value[key] !== undefined)
      out[key] = valueRes.value;
  }
  return Result14.ok(Object.keys(out).length > 0 ? out : undefined);
}
function parseOtlpLimitsResult(raw, path) {
  if (raw === undefined)
    return Result14.ok(undefined);
  const objRes = expectPlainObjectResult(raw, path);
  if (Result14.isError(objRes))
    return objRes;
  const keyCheck = rejectUnknownKeysResult(objRes.value, [
    "maxCompressedBytes",
    "maxDecodedBytes",
    "maxResourceSpansPerRequest",
    "maxScopeSpansPerRequest",
    "maxSpansPerRequest",
    "maxAnyValueDepth",
    "maxArrayValuesPerAnyValue",
    "maxKvListValuesPerAnyValue"
  ], path);
  if (Result14.isError(keyCheck))
    return keyCheck;
  const out = {};
  for (const key of Object.keys(DEFAULT_OTLP_LIMITS)) {
    const valueRes = parsePositiveIntResult(objRes.value[key], `${path}.${key}`, DEFAULT_OTLP_LIMITS[key]);
    if (Result14.isError(valueRes))
      return valueRes;
    if (objRes.value[key] !== undefined)
      out[key] = valueRes.value;
  }
  return Result14.ok(Object.keys(out).length > 0 ? out : undefined);
}
function parseStoreResult(raw, path) {
  if (raw === undefined)
    return Result14.ok(undefined);
  const objRes = expectPlainObjectResult(raw, path);
  if (Result14.isError(objRes))
    return objRes;
  const keyCheck = rejectUnknownKeysResult(objRes.value, ["rawResourceAttributes", "rawSpanAttributes", "rawEvents", "rawLinks"], path);
  if (Result14.isError(keyCheck))
    return keyCheck;
  const out = {};
  for (const key of Object.keys(DEFAULT_STORE_CONFIG)) {
    const value = objRes.value[key];
    if (value === undefined)
      continue;
    if (typeof value !== "boolean")
      return Result14.err({ message: `${path}.${key} must be boolean` });
    out[key] = value;
  }
  return Result14.ok(Object.keys(out).length > 0 ? out : undefined);
}
function parseDbStatementModeResult(raw, path) {
  if (raw === undefined)
    return Result14.ok(undefined);
  if (raw === "drop" || raw === "raw")
    return Result14.ok(raw);
  return Result14.err({ message: `${path} must be drop or raw` });
}
function parseUrlModeResult(raw, path) {
  if (raw === undefined)
    return Result14.ok(undefined);
  if (raw === "drop_query" || raw === "raw")
    return Result14.ok(raw);
  return Result14.err({ message: `${path} must be drop_query or raw` });
}
function parseStreamNameResult2(raw, path) {
  if (raw === undefined)
    return Result14.ok(undefined);
  if (typeof raw !== "string")
    return Result14.err({ message: `${path} must be a string` });
  const value = raw.trim();
  if (value === "")
    return Result14.err({ message: `${path} must not be empty` });
  return Result14.ok(value);
}
function parseOtelTracesObservabilityResult(raw, path) {
  if (raw === undefined)
    return Result14.ok(undefined);
  const objRes = expectPlainObjectResult(raw, path);
  if (Result14.isError(objRes))
    return objRes;
  const keyCheck = rejectUnknownKeysResult(objRes.value, ["request"], path);
  if (Result14.isError(keyCheck))
    return keyCheck;
  if (objRes.value.request === undefined)
    return Result14.ok(undefined);
  const requestRes = expectPlainObjectResult(objRes.value.request, `${path}.request`);
  if (Result14.isError(requestRes))
    return requestRes;
  const requestKeyCheck = rejectUnknownKeysResult(requestRes.value, ["eventsStream"], `${path}.request`);
  if (Result14.isError(requestKeyCheck))
    return requestKeyCheck;
  const eventsStreamRes = parseStreamNameResult2(requestRes.value.eventsStream, `${path}.request.eventsStream`);
  if (Result14.isError(eventsStreamRes))
    return eventsStreamRes;
  if (!eventsStreamRes.value)
    return Result14.ok(undefined);
  return Result14.ok({
    request: {
      eventsStream: eventsStreamRes.value
    }
  });
}
function validateOtelTracesProfileResult(raw, path) {
  const objRes = expectPlainObjectResult(raw, path);
  if (Result14.isError(objRes))
    return objRes;
  if (objRes.value.kind !== "otel-traces")
    return Result14.err({ message: `${path}.kind must be otel-traces` });
  const keyCheck = rejectUnknownKeysResult(objRes.value, ["kind", "redactKeys", "requestIdAttributes", "attributeLimits", "store", "dbStatementMode", "urlMode", "otlpLimits", "observability"], path);
  if (Result14.isError(keyCheck))
    return keyCheck;
  const redactKeysRes = parseStringArrayResult(objRes.value.redactKeys, `${path}.redactKeys`, 64);
  if (Result14.isError(redactKeysRes))
    return redactKeysRes;
  const requestIdAttributesRes = parseStringArrayResult(objRes.value.requestIdAttributes, `${path}.requestIdAttributes`, 64);
  if (Result14.isError(requestIdAttributesRes))
    return requestIdAttributesRes;
  const limitsRes = parseAttributeLimitsResult(objRes.value.attributeLimits, `${path}.attributeLimits`);
  if (Result14.isError(limitsRes))
    return limitsRes;
  const storeRes = parseStoreResult(objRes.value.store, `${path}.store`);
  if (Result14.isError(storeRes))
    return storeRes;
  const dbStatementModeRes = parseDbStatementModeResult(objRes.value.dbStatementMode, `${path}.dbStatementMode`);
  if (Result14.isError(dbStatementModeRes))
    return dbStatementModeRes;
  const urlModeRes = parseUrlModeResult(objRes.value.urlMode, `${path}.urlMode`);
  if (Result14.isError(urlModeRes))
    return urlModeRes;
  const otlpLimitsRes = parseOtlpLimitsResult(objRes.value.otlpLimits, `${path}.otlpLimits`);
  if (Result14.isError(otlpLimitsRes))
    return otlpLimitsRes;
  const observabilityRes = parseOtelTracesObservabilityResult(objRes.value.observability, `${path}.observability`);
  if (Result14.isError(observabilityRes))
    return observabilityRes;
  const profile = { kind: "otel-traces" };
  if (redactKeysRes.value)
    profile.redactKeys = redactKeysRes.value;
  if (requestIdAttributesRes.value)
    profile.requestIdAttributes = requestIdAttributesRes.value;
  if (limitsRes.value)
    profile.attributeLimits = limitsRes.value;
  if (storeRes.value)
    profile.store = storeRes.value;
  if (dbStatementModeRes.value)
    profile.dbStatementMode = dbStatementModeRes.value;
  if (urlModeRes.value)
    profile.urlMode = urlModeRes.value;
  if (otlpLimitsRes.value)
    profile.otlpLimits = otlpLimitsRes.value;
  if (observabilityRes.value)
    profile.observability = observabilityRes.value;
  return Result14.ok(profile);
}
function getString2(record, key) {
  const value = record[key];
  return typeof value === "string" && value.trim() !== "" ? value : null;
}
function getNumber(record, key) {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
function severityForSpan(record) {
  const status = isPlainObject(record.status) ? getString2(record.status, "code") : null;
  const error = isPlainObject(record.error) && record.error.isError === true;
  return status === "error" || error ? "error" : "info";
}
function spanEventIsException(event) {
  const eventName = getString2(event, "name")?.toLowerCase() ?? "";
  if (eventName === "exception")
    return true;
  const attributes = isPlainObject(event.attributes) ? event.attributes : {};
  return getString2(attributes, "exception.type") != null || getString2(attributes, "exception.message") != null;
}
function buildOtelTimelineItems(args) {
  if (!isPlainObject(args.record))
    return [];
  const record = args.record;
  const traceId = getString2(record, "traceId");
  const spanId = getString2(record, "spanId");
  const parentSpanId = getString2(record, "parentSpanId");
  const requestId = getString2(record, "requestId");
  const service = getString2(record, "service");
  const title = getString2(record, "name") ?? spanId ?? "span";
  const timestamp = getString2(record, "timestamp");
  const endTimestamp = getString2(record, "endTimestamp");
  const duration = getNumber(record, "duration");
  const severity = severityForSpan(record);
  const source = { stream: args.stream, offset: args.offset, profile: "otel-traces" };
  const ids = { requestId, traceId, spanId, parentSpanId };
  const out = [];
  if (timestamp) {
    out.push({
      kind: "otel.span.start",
      time: timestamp,
      duration,
      service,
      title,
      severity,
      ids,
      source,
      data: record
    });
  }
  if (Array.isArray(record.events)) {
    for (const event of record.events) {
      if (!isPlainObject(event))
        continue;
      const eventTime = getString2(event, "timestamp");
      const eventName = getString2(event, "name") ?? "span event";
      if (!eventTime)
        continue;
      const isException = spanEventIsException(event);
      out.push({
        kind: isException ? "otel.exception" : "otel.span.event",
        time: eventTime,
        service,
        title: eventName,
        severity: isException ? "error" : severity,
        ids,
        source,
        data: event
      });
    }
  }
  if (endTimestamp) {
    out.push({
      kind: "otel.span.end",
      time: endTimestamp,
      duration,
      service,
      title,
      severity,
      ids,
      source,
      data: record
    });
  }
  return out;
}
var OTEL_TRACES_STREAM_PROFILE_DEFINITION = {
  kind: "otel-traces",
  usesStoredProfileRow: true,
  defaultProfile() {
    return { kind: "otel-traces" };
  },
  validateResult(raw, path) {
    return validateOtelTracesProfileResult(raw, path);
  },
  readProfileResult({ row, cached }) {
    if (!row)
      return Result14.ok({ profile: { kind: "otel-traces" }, cache: null });
    const cachedCopy = cloneOtelTracesCache(cached);
    if (cachedCopy && cachedCopy.updatedAtMs === row.updated_at_ms) {
      return Result14.ok({
        profile: cloneOtelTracesProfile(cachedCopy.profile),
        cache: cachedCopy
      });
    }
    const parsedRes = parseStoredProfileJsonResult(row.profile_json);
    if (Result14.isError(parsedRes))
      return parsedRes;
    const profileRes = validateOtelTracesProfileResult(parsedRes.value, "profile");
    if (Result14.isError(profileRes))
      return profileRes;
    const profile = cloneOtelTracesProfile(profileRes.value);
    return Result14.ok({
      profile: cloneOtelTracesProfile(profile),
      cache: { profile, updatedAtMs: row.updated_at_ms }
    });
  },
  persistProfileResult({ db, registry, stream, streamRow, profile }) {
    if (!isOtelTracesProfile(profile))
      return Result14.err({ kind: "bad_request", message: "invalid otel-traces profile" });
    const contentType = normalizeProfileContentType(streamRow.content_type);
    if (contentType !== "application/json") {
      return Result14.err({
        kind: "bad_request",
        message: "otel-traces profile requires application/json stream content-type"
      });
    }
    if (streamRow.profile !== "otel-traces" && streamRow.next_offset > 0n) {
      return Result14.err({
        kind: "bad_request",
        message: "otel-traces profile must be installed before appending data"
      });
    }
    const persistedProfile = cloneOtelTracesProfile(profile);
    const registryRes = registry.replaceRegistryResult(stream, buildOtelTracesDefaultRegistry(stream));
    if (Result14.isError(registryRes)) {
      return Result14.err({ kind: "bad_request", message: registryRes.error.message });
    }
    db.updateStreamProfile(stream, persistedProfile.kind);
    db.upsertStreamProfile(stream, JSON.stringify(persistedProfile));
    db.deleteStreamTouchState(stream);
    const row = db.getStreamProfile(stream);
    return Result14.ok({
      profile: cloneOtelTracesProfile(persistedProfile),
      cache: {
        profile: persistedProfile,
        updatedAtMs: row?.updated_at_ms ?? db.nowMs()
      },
      schemaRegistry: registryRes.value
    });
  },
  jsonIngest: {
    prepareRecordResult({ profile, value }) {
      if (!isOtelTracesProfile(profile))
        return Result14.err({ message: "invalid otel-traces profile" });
      return normalizeOtelTraceRecordResult(profile, value);
    }
  },
  otlpTraces: {
    decodeExportRequestResult({ profile, stream, contentType, contentEncoding, body, maxDecodedBytes }) {
      if (!isOtelTracesProfile(profile))
        return Result14.err({ status: 400, message: "invalid otel-traces profile" });
      return decodeOtlpTraceExportRequestResult({ stream, profile, contentType, contentEncoding, body, maxDecodedBytes });
    }
  },
  correlation: {
    toTimelineItems(args) {
      return buildOtelTimelineItems(args);
    }
  }
};

// src/profiles/stateProtocol.ts
import { Result as Result23 } from "better-result";

// src/profiles/stateProtocol/changes.ts
function deriveStateProtocolChanges(record) {
  if (!record || typeof record !== "object" || Array.isArray(record))
    return [];
  const headers = record.headers;
  if (!headers || typeof headers !== "object" || Array.isArray(headers))
    return [];
  if (typeof headers.control === "string")
    return [];
  const opRaw = headers.operation;
  if (typeof opRaw !== "string")
    return [];
  const op = opRaw;
  if (op !== "insert" && op !== "update" && op !== "delete")
    return [];
  const type = record.type;
  const key = record.key;
  if (typeof type !== "string" || type.trim() === "")
    return [];
  if (typeof key !== "string" || key.trim() === "")
    return [];
  const before = Object.prototype.hasOwnProperty.call(record, "old_value") ? record.old_value : undefined;
  const after = Object.prototype.hasOwnProperty.call(record, "value") ? record.value : undefined;
  return [{ entity: type, key, op, before, after }];
}

// src/profiles/stateProtocol/routes.ts
import { Result as Result21 } from "better-result";

// src/util/base32_crockford.ts
import { Result as Result15 } from "better-result";
var ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
var DECODE_MAP = (() => {
  const m = {};
  for (let i = 0;i < ALPHABET.length; i++) {
    m[ALPHABET[i]] = i;
    m[ALPHABET[i].toLowerCase()] = i;
  }
  m["O"] = m["o"] = 0;
  m["I"] = m["i"] = 1;
  m["L"] = m["l"] = 1;
  return m;
})();
function invalidBase32(message) {
  return Result15.err({ kind: "invalid_base32", message });
}
function encodeCrockfordBase32Fixed26Result(bytes16) {
  if (bytes16.byteLength !== 16)
    return invalidBase32(`expected 16 bytes, got ${bytes16.byteLength}`);
  let n = 0n;
  for (const b of bytes16)
    n = n << 8n | BigInt(b);
  n = n << 2n;
  let out = "";
  for (let i = 0;i < 26; i++) {
    const shift = 5n * BigInt(25 - i);
    const idx = Number(n >> shift & 31n);
    out += ALPHABET[idx];
  }
  return Result15.ok(out);
}
function decodeCrockfordBase32Fixed26Result(s) {
  if (s === "-1")
    return invalidBase32("-1 is a sentinel offset and cannot be decoded as base32");
  if (s.length !== 26)
    return invalidBase32(`expected 26 chars, got ${s.length}`);
  let n = 0n;
  for (const ch of s) {
    const v = DECODE_MAP[ch];
    if (v === undefined)
      return invalidBase32(`invalid base32 char: ${ch}`);
    n = n << 5n | BigInt(v);
  }
  n = n >> 2n;
  const out = new Uint8Array(16);
  for (let i = 15;i >= 0; i--) {
    out[i] = Number(n & 0xffn);
    n = n >> 8n;
  }
  return Result15.ok(out);
}

// src/util/endian.ts
function writeU32BE(dst, offset, value) {
  const dv = new DataView(dst.buffer, dst.byteOffset, dst.byteLength);
  dv.setUint32(offset, value >>> 0, false);
}
function readU32BE(src, offset) {
  const dv = new DataView(src.buffer, src.byteOffset, src.byteLength);
  return dv.getUint32(offset, false);
}

// src/offset.ts
import { Result as Result16 } from "better-result";
function parseOffsetResult(input) {
  if (input == null || input === "") {
    return Result16.err({ kind: "invalid_offset", message: "missing offset" });
  }
  if (input === "-1")
    return Result16.ok({ kind: "start" });
  if (input.length !== 26) {
    return Result16.err({ kind: "invalid_offset", message: `invalid offset length: ${input.length}` });
  }
  const bytesRes = decodeCrockfordBase32Fixed26Result(input);
  if (Result16.isError(bytesRes))
    return Result16.err({ kind: "invalid_offset", message: bytesRes.error.message });
  const bytes = bytesRes.value;
  const epoch = readU32BE(bytes, 0);
  const hi = readU32BE(bytes, 4);
  const lo = readU32BE(bytes, 8);
  const inBlock = readU32BE(bytes, 12);
  const rawSeq = BigInt(hi) << 32n | BigInt(lo);
  const seq = rawSeq - 1n;
  return Result16.ok({ kind: "seq", epoch, seq, inBlock });
}
function encodeOffsetResult(epoch, seq, inBlock = 0) {
  if (seq < -1n)
    return Result16.err({ kind: "invalid_offset", message: "invalid offset" });
  const bytes = new Uint8Array(16);
  writeU32BE(bytes, 0, epoch >>> 0);
  const rawSeq = seq + 1n;
  const hi = Number(rawSeq >> 32n & 0xffffffffn);
  const lo = Number(rawSeq & 0xffffffffn);
  writeU32BE(bytes, 4, hi);
  writeU32BE(bytes, 8, lo);
  writeU32BE(bytes, 12, inBlock >>> 0);
  const encodedRes = encodeCrockfordBase32Fixed26Result(bytes);
  if (Result16.isError(encodedRes))
    return Result16.err({ kind: "invalid_offset", message: encodedRes.error.message });
  return Result16.ok(encodedRes.value);
}
function encodeOffset(epoch, seq, inBlock = 0) {
  const res = encodeOffsetResult(epoch, seq, inBlock);
  if (Result16.isError(res))
    throw dsError(res.error.message);
  return res.value;
}

// src/touch/touch_journal.ts
function u32(x) {
  return x >>> 0;
}
function mix32(x) {
  let y = u32(x);
  y ^= y >>> 16;
  y = Math.imul(y, 2246822507) >>> 0;
  y ^= y >>> 13;
  y = Math.imul(y, 3266489909) >>> 0;
  y ^= y >>> 16;
  return y >>> 0;
}
function newEpochHex16() {
  const buf = new Uint32Array(2);
  crypto.getRandomValues(buf);
  return buf[0].toString(16).padStart(8, "0") + buf[1].toString(16).padStart(8, "0");
}
function parseTouchCursor(raw) {
  const s = raw.trim();
  if (s === "")
    return null;
  const idx = s.indexOf(":");
  if (idx <= 0)
    return null;
  const epoch = s.slice(0, idx);
  const genRaw = s.slice(idx + 1);
  if (!/^[0-9a-f]{16}$/i.test(epoch))
    return null;
  if (!/^[0-9]+$/.test(genRaw))
    return null;
  const gen = Number(genRaw);
  if (!Number.isFinite(gen) || gen < 0)
    return null;
  return { epoch: epoch.toLowerCase(), generation: Math.floor(gen) };
}
function formatTouchCursor(epoch, generation) {
  return `${epoch}:${Math.max(0, Math.floor(generation))}`;
}

class TouchJournal {
  static EXACT_RECENT_WINDOW_MS = 15000;
  epoch;
  generation;
  bucketMs;
  coalesceMs;
  k;
  mask;
  lastSet;
  pending = new Set;
  pendingExact = new Set;
  pendingBucketStartMs = 0;
  pendingMaxSourceOffsetSeq = -1n;
  lastFlushedSourceOffsetSeq = -1n;
  overflow = false;
  overflowBuckets = 0;
  lastOverflowGeneration = 0;
  lastFlushAtMs = 0;
  lastBucketStartMs = 0;
  flushIntervalsLast10s = [];
  flushTimer = null;
  byKey = new Map;
  byExactKey = new Map;
  broad = new Set;
  exactRecent = [];
  exactRecentMaxGenerations;
  activeWaiters = 0;
  deadlineHeap = [];
  timeoutTimer = null;
  scheduledDeadlineMs = null;
  interval = {
    timeoutsFired: 0,
    timeoutSweeps: 0,
    timeoutSweepMsSum: 0,
    timeoutSweepMsMax: 0,
    notifyWakeups: 0,
    notifyFlushes: 0,
    notifyWakeMsSum: 0,
    notifyWakeMsMax: 0,
    heapSize: 0
  };
  totals = {
    timeoutsFired: 0,
    timeoutSweeps: 0,
    timeoutSweepMsSum: 0,
    timeoutSweepMsMax: 0,
    notifyWakeups: 0,
    notifyFlushes: 0,
    notifyWakeMsSum: 0,
    notifyWakeMsMax: 0,
    flushes: 0
  };
  pendingMaxKeys;
  keyIndexMaxKeys;
  constructor(opts) {
    this.epoch = newEpochHex16();
    this.generation = 0;
    this.bucketMs = Math.max(1, Math.floor(opts.bucketMs));
    this.coalesceMs = this.bucketMs;
    const pow2 = Math.max(10, Math.min(30, Math.floor(opts.filterPow2)));
    const size = 1 << pow2;
    this.k = Math.max(1, Math.min(8, Math.floor(opts.k)));
    this.mask = size - 1;
    this.lastSet = new Uint32Array(size);
    this.pendingMaxKeys = Math.max(1, Math.floor(opts.pendingMaxKeys));
    this.keyIndexMaxKeys = Math.max(1, Math.floor(opts.keyIndexMaxKeys));
    this.exactRecentMaxGenerations = Math.max(16, Math.ceil(TouchJournal.EXACT_RECENT_WINDOW_MS / this.bucketMs));
  }
  stop() {
    if (this.flushTimer)
      clearTimeout(this.flushTimer);
    if (this.timeoutTimer)
      clearTimeout(this.timeoutTimer);
    this.flushTimer = null;
    this.timeoutTimer = null;
    this.scheduledDeadlineMs = null;
    this.pending.clear();
    this.pendingExact.clear();
    this.pendingBucketStartMs = 0;
    this.pendingMaxSourceOffsetSeq = -1n;
    this.lastFlushedSourceOffsetSeq = -1n;
    this.lastFlushAtMs = 0;
    this.lastBucketStartMs = 0;
    this.flushIntervalsLast10s.length = 0;
    this.byKey.clear();
    this.byExactKey.clear();
    this.broad.clear();
    this.exactRecent.length = 0;
    this.deadlineHeap.length = 0;
    this.activeWaiters = 0;
  }
  getEpoch() {
    return this.epoch;
  }
  getGeneration() {
    return this.generation >>> 0;
  }
  getCursor() {
    return formatTouchCursor(this.epoch, this.getGeneration());
  }
  getLastFlushedSourceOffsetSeq() {
    return this.lastFlushedSourceOffsetSeq;
  }
  getActiveWaiters() {
    return this.activeWaiters;
  }
  snapshotAndResetIntervalStats() {
    const out = { ...this.interval, heapSize: this.deadlineHeap.length };
    this.interval = {
      timeoutsFired: 0,
      timeoutSweeps: 0,
      timeoutSweepMsSum: 0,
      timeoutSweepMsMax: 0,
      notifyWakeups: 0,
      notifyFlushes: 0,
      notifyWakeMsSum: 0,
      notifyWakeMsMax: 0,
      heapSize: 0
    };
    return out;
  }
  getTotalStats() {
    return { ...this.totals };
  }
  getMeta() {
    const nowMs = Date.now();
    this.pruneFlushIntervals(nowMs);
    const intervals = this.flushIntervalsLast10s.map((x) => x.intervalMs);
    return {
      mode: "memory",
      cursor: this.getCursor(),
      epoch: this.epoch,
      generation: this.getGeneration(),
      bucketMs: this.bucketMs,
      coalesceMs: this.coalesceMs,
      filterSize: this.lastSet.length,
      k: this.k,
      pendingKeys: this.pending.size,
      overflowBuckets: this.overflowBuckets,
      activeWaiters: this.activeWaiters,
      bucketMaxSourceOffsetSeq: this.lastFlushedSourceOffsetSeq.toString(),
      lastFlushAtMs: this.lastFlushAtMs,
      flushIntervalMsMaxLast10s: intervals.length > 0 ? Math.max(...intervals) : 0,
      flushIntervalMsP95Last10s: percentile(intervals, 0.95)
    };
  }
  getFilterBytes() {
    return this.lastSet.byteLength;
  }
  touch(keyId, sourceOffsetSeq, routingKey) {
    if (this.pending.size === 0 && !this.overflow && this.pendingBucketStartMs <= 0) {
      this.pendingBucketStartMs = Date.now();
    }
    if (this.pending.size >= this.pendingMaxKeys) {
      this.overflow = true;
    } else {
      this.pending.add(u32(keyId));
    }
    if (typeof routingKey === "string" && /^[0-9a-f]{16}$/i.test(routingKey.trim())) {
      this.pendingExact.add(routingKey.trim().toLowerCase());
    }
    if (typeof sourceOffsetSeq === "bigint" && sourceOffsetSeq > this.pendingMaxSourceOffsetSeq) {
      this.pendingMaxSourceOffsetSeq = sourceOffsetSeq;
    }
    this.ensureFlushScheduled();
  }
  setCoalesceMs(ms) {
    const next = Math.max(1, Math.min(this.bucketMs, Math.floor(ms)));
    this.coalesceMs = next;
  }
  maybeTouchedSince(keyId, sinceGeneration) {
    const since = u32(sinceGeneration);
    if (since < u32(this.lastOverflowGeneration))
      return true;
    const h1 = u32(keyId);
    let h2 = mix32(h1);
    if (h2 === 0)
      h2 = 2654435769;
    let min = 4294967295;
    for (let i = 0;i < this.k; i++) {
      const pos = u32(h1 + Math.imul(i, h2)) & this.mask;
      const g = this.lastSet[pos];
      if (g < min)
        min = g;
    }
    return u32(min) > since;
  }
  maybeTouchedSinceAny(keyIds, sinceGeneration) {
    const since = u32(sinceGeneration);
    if (since < u32(this.lastOverflowGeneration))
      return true;
    for (let i = 0;i < keyIds.length; i++) {
      if (this.maybeTouchedSince(keyIds[i], since))
        return true;
    }
    return false;
  }
  exactTouchedSinceAny(routingKeys, sinceGeneration) {
    const normalized = Array.from(new Set(routingKeys.map((key) => key.trim().toLowerCase()).filter((key) => /^[0-9a-f]{16}$/.test(key))));
    if (normalized.length === 0)
      return false;
    if (sinceGeneration >= this.getGeneration())
      return false;
    if (sinceGeneration < this.lastOverflowGeneration)
      return null;
    if (this.exactRecent.length === 0)
      return null;
    const firstNeededGeneration = Math.max(0, Math.floor(sinceGeneration) + 1);
    const oldestRetainedGeneration = this.exactRecent[0].generation;
    if (firstNeededGeneration < oldestRetainedGeneration)
      return null;
    let expectedGeneration = firstNeededGeneration;
    for (const entry of this.exactRecent) {
      if (entry.generation < firstNeededGeneration)
        continue;
      if (entry.generation !== expectedGeneration)
        return null;
      if (entry.overflow)
        return null;
      for (const routingKey of normalized) {
        if (entry.keys.has(routingKey))
          return true;
      }
      expectedGeneration += 1;
    }
    return expectedGeneration > this.getGeneration() ? false : null;
  }
  waitForAny(args) {
    const exactKeys = Array.isArray(args.exactKeys) ? Array.from(new Set(args.exactKeys.map((key) => key.trim().toLowerCase()).filter((key) => /^[0-9a-f]{16}$/.test(key)))) : [];
    if (args.keys.length === 0 && exactKeys.length === 0)
      return Promise.resolve(null);
    if (args.signal?.aborted)
      return Promise.resolve(null);
    const timeoutMs = Math.max(0, Math.floor(args.timeoutMs));
    if (timeoutMs <= 0)
      return Promise.resolve(null);
    const keys = Array.from(new Set(args.keys.map(u32)));
    const broad = keys.length > this.keyIndexMaxKeys;
    return new Promise((resolve) => {
      const waiter = {
        afterGeneration: u32(args.afterGeneration),
        keys,
        exactKeys: exactKeys.length > 0 ? exactKeys : null,
        broad,
        deadlineMs: Date.now() + timeoutMs,
        heapIndex: -1,
        done: false,
        cleanup: (hit) => {
          if (waiter.done)
            return;
          waiter.done = true;
          if (waiter.exactKeys) {
            for (const routingKey of waiter.exactKeys) {
              const s = this.byExactKey.get(routingKey);
              if (!s)
                continue;
              s.delete(waiter);
              if (s.size === 0)
                this.byExactKey.delete(routingKey);
            }
          }
          if (waiter.broad) {
            this.broad.delete(waiter);
          } else {
            for (const k of waiter.keys) {
              const s = this.byKey.get(k);
              if (!s)
                continue;
              s.delete(waiter);
              if (s.size === 0)
                this.byKey.delete(k);
            }
          }
          this.activeWaiters = Math.max(0, this.activeWaiters - 1);
          const removedRoot = this.heapRemove(waiter);
          if (args.signal)
            args.signal.removeEventListener("abort", onAbort);
          if (removedRoot)
            this.rescheduleTimeoutTimer();
          resolve(hit);
        }
      };
      if (waiter.exactKeys) {
        for (const routingKey of waiter.exactKeys) {
          const set = this.byExactKey.get(routingKey) ?? new Set;
          set.add(waiter);
          this.byExactKey.set(routingKey, set);
        }
      }
      if (waiter.broad) {
        this.broad.add(waiter);
      } else {
        for (const k of waiter.keys) {
          const set = this.byKey.get(k) ?? new Set;
          set.add(waiter);
          this.byKey.set(k, set);
        }
      }
      this.activeWaiters += 1;
      const onAbort = () => waiter.cleanup(null);
      if (args.signal)
        args.signal.addEventListener("abort", onAbort, { once: true });
      this.heapPush(waiter);
      this.rescheduleTimeoutTimer();
    });
  }
  ensureFlushScheduled() {
    if (this.flushTimer)
      return;
    this.flushTimer = setTimeout(() => this.flushBucket(), this.coalesceMs);
  }
  flushBucket() {
    this.flushTimer = null;
    const hasTouches = this.pending.size > 0 || this.overflow;
    if (!hasTouches)
      return;
    this.generation = u32(this.generation + 1);
    const gen = this.getGeneration();
    const bucketMaxSourceOffsetSeq = this.pendingMaxSourceOffsetSeq;
    if (bucketMaxSourceOffsetSeq > this.lastFlushedSourceOffsetSeq)
      this.lastFlushedSourceOffsetSeq = bucketMaxSourceOffsetSeq;
    const flushAtMs = Date.now();
    const bucketStartMs = this.pendingBucketStartMs > 0 ? this.pendingBucketStartMs : flushAtMs;
    if (this.lastFlushAtMs > 0 && flushAtMs >= this.lastFlushAtMs) {
      this.flushIntervalsLast10s.push({ atMs: flushAtMs, intervalMs: flushAtMs - this.lastFlushAtMs });
      this.pruneFlushIntervals(flushAtMs);
    }
    this.lastFlushAtMs = flushAtMs;
    this.lastBucketStartMs = bucketStartMs;
    this.totals.flushes += 1;
    if (this.overflow) {
      this.overflowBuckets += 1;
      this.lastOverflowGeneration = gen;
    }
    this.exactRecent.push({
      generation: gen,
      keys: new Set(this.pendingExact),
      overflow: this.overflow
    });
    while (this.exactRecent.length > this.exactRecentMaxGenerations) {
      this.exactRecent.shift();
    }
    for (const keyId of this.pending) {
      const h1 = u32(keyId);
      let h2 = mix32(h1);
      if (h2 === 0)
        h2 = 2654435769;
      for (let i = 0;i < this.k; i++) {
        const pos = u32(h1 + Math.imul(i, h2)) & this.mask;
        this.lastSet[pos] = gen;
      }
    }
    if (this.overflow) {
      const wakeStartMs = Date.now();
      let wakeups = 0;
      const all = new Set;
      for (const s of this.byKey.values())
        for (const w of s)
          all.add(w);
      for (const s of this.byExactKey.values())
        for (const w of s)
          all.add(w);
      for (const w of this.broad)
        all.add(w);
      for (const w of all) {
        if (w.done)
          continue;
        if (gen > w.afterGeneration) {
          wakeups += 1;
          w.cleanup({ generation: gen, keyId: 0, bucketMaxSourceOffsetSeq, flushAtMs, bucketStartMs });
        }
      }
      if (wakeups > 0) {
        const wakeMs = Date.now() - wakeStartMs;
        this.interval.notifyWakeups += wakeups;
        this.interval.notifyFlushes += 1;
        this.interval.notifyWakeMsSum += wakeMs;
        this.interval.notifyWakeMsMax = Math.max(this.interval.notifyWakeMsMax, wakeMs);
        this.totals.notifyWakeups += wakeups;
        this.totals.notifyFlushes += 1;
        this.totals.notifyWakeMsSum += wakeMs;
        this.totals.notifyWakeMsMax = Math.max(this.totals.notifyWakeMsMax, wakeMs);
      }
    } else {
      const wakeStartMs = Date.now();
      let wakeups = 0;
      const exactWoken = new Set;
      for (const routingKey of this.pendingExact) {
        const set = this.byExactKey.get(routingKey);
        if (!set || set.size === 0)
          continue;
        for (const w of set) {
          if (w.done || exactWoken.has(w))
            continue;
          if (gen > w.afterGeneration) {
            exactWoken.add(w);
            wakeups += 1;
            w.cleanup({ generation: gen, keyId: 0, bucketMaxSourceOffsetSeq, flushAtMs, bucketStartMs });
          }
        }
      }
      for (const keyId of this.pending) {
        const set = this.byKey.get(keyId);
        if (!set || set.size === 0)
          continue;
        for (const w of set) {
          if (w.done)
            continue;
          if (gen > w.afterGeneration) {
            wakeups += 1;
            w.cleanup({ generation: gen, keyId, bucketMaxSourceOffsetSeq, flushAtMs, bucketStartMs });
          }
        }
      }
      if (this.broad.size > 0) {
        for (const w of this.broad) {
          if (w.done)
            continue;
          if (gen <= w.afterGeneration)
            continue;
          let hit = false;
          for (let i = 0;i < w.keys.length; i++) {
            if (this.maybeTouchedSince(w.keys[i], w.afterGeneration)) {
              hit = true;
              break;
            }
          }
          if (hit) {
            wakeups += 1;
            w.cleanup({ generation: gen, keyId: 0, bucketMaxSourceOffsetSeq, flushAtMs, bucketStartMs });
          }
        }
      }
      if (wakeups > 0) {
        const wakeMs = Date.now() - wakeStartMs;
        this.interval.notifyWakeups += wakeups;
        this.interval.notifyFlushes += 1;
        this.interval.notifyWakeMsSum += wakeMs;
        this.interval.notifyWakeMsMax = Math.max(this.interval.notifyWakeMsMax, wakeMs);
        this.totals.notifyWakeups += wakeups;
        this.totals.notifyFlushes += 1;
        this.totals.notifyWakeMsSum += wakeMs;
        this.totals.notifyWakeMsMax = Math.max(this.totals.notifyWakeMsMax, wakeMs);
      }
    }
    this.pending.clear();
    this.pendingExact.clear();
    this.pendingBucketStartMs = 0;
    this.pendingMaxSourceOffsetSeq = -1n;
    this.overflow = false;
  }
  getLastFlushAtMs() {
    return this.lastFlushAtMs;
  }
  getLastBucketStartMs() {
    return this.lastBucketStartMs;
  }
  pruneFlushIntervals(nowMs) {
    const cutoff = nowMs - 1e4;
    while (this.flushIntervalsLast10s.length > 0 && this.flushIntervalsLast10s[0].atMs < cutoff) {
      this.flushIntervalsLast10s.shift();
    }
  }
  rescheduleTimeoutTimer() {
    const next = this.deadlineHeap[0];
    if (!next) {
      if (this.timeoutTimer)
        clearTimeout(this.timeoutTimer);
      this.timeoutTimer = null;
      this.scheduledDeadlineMs = null;
      return;
    }
    if (this.timeoutTimer && this.scheduledDeadlineMs != null && this.scheduledDeadlineMs === next.deadlineMs)
      return;
    if (this.timeoutTimer)
      clearTimeout(this.timeoutTimer);
    this.scheduledDeadlineMs = next.deadlineMs;
    const delayMs = Math.max(0, next.deadlineMs - Date.now());
    this.timeoutTimer = setTimeout(() => this.expireDueWaiters(), delayMs);
  }
  expireDueWaiters() {
    this.timeoutTimer = null;
    this.scheduledDeadlineMs = null;
    const start = Date.now();
    const now = start;
    let expired = 0;
    for (;; ) {
      const head = this.deadlineHeap[0];
      if (!head)
        break;
      if (head.deadlineMs > now)
        break;
      const w = this.heapPopMin();
      if (!w)
        break;
      if (w.done)
        continue;
      expired += 1;
      w.cleanup(null);
    }
    if (expired > 0) {
      const sweepMs = Date.now() - start;
      this.interval.timeoutsFired += expired;
      this.interval.timeoutSweeps += 1;
      this.interval.timeoutSweepMsSum += sweepMs;
      this.interval.timeoutSweepMsMax = Math.max(this.interval.timeoutSweepMsMax, sweepMs);
      this.totals.timeoutsFired += expired;
      this.totals.timeoutSweeps += 1;
      this.totals.timeoutSweepMsSum += sweepMs;
      this.totals.timeoutSweepMsMax = Math.max(this.totals.timeoutSweepMsMax, sweepMs);
    }
    this.rescheduleTimeoutTimer();
  }
  heapSwap(i, j) {
    const a = this.deadlineHeap[i];
    const b = this.deadlineHeap[j];
    this.deadlineHeap[i] = b;
    this.deadlineHeap[j] = a;
    a.heapIndex = j;
    b.heapIndex = i;
  }
  heapLess(i, j) {
    const a = this.deadlineHeap[i];
    const b = this.deadlineHeap[j];
    return a.deadlineMs < b.deadlineMs;
  }
  heapSiftUp(i) {
    let idx = i;
    while (idx > 0) {
      const parent = idx - 1 >> 1;
      if (!this.heapLess(idx, parent))
        break;
      this.heapSwap(idx, parent);
      idx = parent;
    }
  }
  heapSiftDown(i) {
    let idx = i;
    for (;; ) {
      const left = idx * 2 + 1;
      const right = left + 1;
      if (left >= this.deadlineHeap.length)
        break;
      let smallest = left;
      if (right < this.deadlineHeap.length && this.heapLess(right, left))
        smallest = right;
      if (!this.heapLess(smallest, idx))
        break;
      this.heapSwap(idx, smallest);
      idx = smallest;
    }
  }
  heapPush(w) {
    if (w.heapIndex >= 0)
      return;
    w.heapIndex = this.deadlineHeap.length;
    this.deadlineHeap.push(w);
    this.heapSiftUp(w.heapIndex);
  }
  heapRemove(w) {
    const idx = w.heapIndex;
    if (idx < 0)
      return false;
    const lastIdx = this.deadlineHeap.length - 1;
    const removedRoot = idx === 0;
    if (idx !== lastIdx)
      this.heapSwap(idx, lastIdx);
    this.deadlineHeap.pop();
    w.heapIndex = -1;
    if (idx < this.deadlineHeap.length) {
      this.heapSiftDown(idx);
      this.heapSiftUp(idx);
    }
    return removedRoot;
  }
  heapPopMin() {
    if (this.deadlineHeap.length === 0)
      return null;
    const w = this.deadlineHeap[0];
    const last = this.deadlineHeap.length - 1;
    if (last === 0) {
      this.deadlineHeap.pop();
      w.heapIndex = -1;
      return w;
    }
    this.heapSwap(0, last);
    this.deadlineHeap.pop();
    w.heapIndex = -1;
    this.heapSiftDown(0);
    return w;
  }
}
function percentile(values, p) {
  if (values.length === 0)
    return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.max(0, Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p)));
  return sorted[idx] ?? 0;
}

// src/touch/touch_key_id.ts
import { Result as Result18 } from "better-result";

// src/runtime/hash.ts
import { Result as Result17 } from "better-result";
import { createRequire as createRequire2 } from "node:module";
import { fileURLToPath } from "node:url";
var xxh3Hasher = null;
var xxh64Hasher = null;
var xxh32Hasher = null;
var isBunRuntime = typeof globalThis.Bun !== "undefined";
var require3 = createRequire2(import.meta.url);
function loadVendoredModule(name) {
  const path = fileURLToPath(new URL(`./hash_vendor/${name}`, import.meta.url));
  return require3(path);
}
if (!isBunRuntime) {
  const xxh3Module = loadVendoredModule("xxhash3.umd.min.cjs");
  const xxh64Module = loadVendoredModule("xxhash64.umd.min.cjs");
  const xxh32Module = loadVendoredModule("xxhash32.umd.min.cjs");
  xxh3Hasher = await xxh3Module.createXXHash3();
  xxh64Hasher = await xxh64Module.createXXHash64();
  xxh32Hasher = await xxh32Module.createXXHash32();
}
function toBigIntDigest(value) {
  if (typeof value === "bigint")
    return value;
  if (typeof value === "number")
    return BigInt(value >>> 0);
  const hex = value.startsWith("0x") ? value.slice(2) : value;
  if (hex.length === 0)
    return 0n;
  return BigInt(`0x${hex}`);
}
function toHex16(value) {
  const masked = value & 0xffff_ffff_ffff_ffffn;
  return masked.toString(16).padStart(16, "0");
}
function bunHash64(input, fn) {
  return fn(input);
}
function nodeHash64Result(input, hasher, label) {
  if (!hasher)
    return Result17.err({ kind: "hasher_not_initialized", message: `${label} hasher not initialized` });
  hasher.init();
  hasher.update(input);
  const digest = hasher.digest("hex");
  return Result17.ok(toBigIntDigest(digest));
}
function nodeHash32Result(input) {
  if (!xxh32Hasher)
    return Result17.err({ kind: "hasher_not_initialized", message: "xxh32 hasher not initialized" });
  xxh32Hasher.init();
  xxh32Hasher.update(input);
  const digest = xxh32Hasher.digest("hex");
  if (typeof digest === "number")
    return Result17.ok(digest >>> 0);
  const asBigInt = toBigIntDigest(digest);
  return Result17.ok(Number(asBigInt & 0xffff_ffffn) >>> 0);
}
function xxh3BigIntResult(input) {
  if (isBunRuntime)
    return Result17.ok(bunHash64(input, (x) => Bun.hash.xxHash3(x)));
  return nodeHash64Result(input, xxh3Hasher, "xxh3");
}
function xxh3HexResult(input) {
  const res = xxh3BigIntResult(input);
  if (Result17.isError(res))
    return res;
  return Result17.ok(toHex16(res.value));
}
function xxh32Result(input) {
  if (isBunRuntime)
    return Result17.ok(Bun.hash.xxHash32(input) >>> 0);
  return nodeHash32Result(input);
}
function xxh3BigInt(input) {
  const res = xxh3BigIntResult(input);
  if (Result17.isError(res))
    throw dsError(res.error.message);
  return res.value;
}
function xxh3Hex(input) {
  const res = xxh3HexResult(input);
  if (Result17.isError(res))
    throw dsError(res.error.message);
  return res.value;
}

// src/touch/touch_key_id.ts
function touchKeyIdFromRoutingKeyResult(key) {
  const s = key.trim().toLowerCase();
  if (/^[0-9a-f]{16}$/.test(s)) {
    return Result18.ok(Number.parseInt(s.slice(8), 16) >>> 0);
  }
  return xxh32Result(s);
}

// src/touch/live_keys.ts
function utf8(s) {
  return new TextEncoder().encode(s);
}
function encodeU64Be(v) {
  const out = new Uint8Array(8);
  let x = v;
  for (let i = 7;i >= 0; i--) {
    out[i] = Number(x & 0xffn);
    x >>= 8n;
  }
  return out;
}
function xxh3Low32(bytes) {
  const h = xxh3BigInt(bytes);
  return Number(h & 0xffffffffn) >>> 0;
}
function tableKeyIdFor(entity) {
  return xxh3Low32(concat([utf8("tbl\x00"), utf8(entity)]));
}
function templateKeyIdFor(templateIdHex16) {
  const tplBytes = encodeU64Be(BigInt(`0x${templateIdHex16}`));
  return xxh3Low32(concat([utf8("tpl\x00"), tplBytes]));
}
function membershipKeyFor(templateIdHex16, encodedArgs) {
  const tplBytes = encodeU64Be(BigInt(`0x${templateIdHex16}`));
  const parts = [utf8("mem\x00"), tplBytes];
  for (const a of encodedArgs) {
    parts.push(utf8("\x00"));
    parts.push(utf8(a));
  }
  return xxh3Hex(concat(parts));
}
function membershipKeyIdFor(templateIdHex16, encodedArgs) {
  const tplBytes = encodeU64Be(BigInt(`0x${templateIdHex16}`));
  const parts = [utf8("mem\x00"), tplBytes];
  for (const a of encodedArgs) {
    parts.push(utf8("\x00"));
    parts.push(utf8(a));
  }
  return xxh3Low32(concat(parts));
}
function projectedFieldKeyFor(templateIdHex16, fieldName, encodedArgs) {
  const tplBytes = encodeU64Be(BigInt(`0x${templateIdHex16}`));
  const parts = [utf8("fld\x00"), tplBytes, utf8("\x00"), utf8(fieldName)];
  for (const a of encodedArgs) {
    parts.push(utf8("\x00"));
    parts.push(utf8(a));
  }
  return xxh3Hex(concat(parts));
}
function projectedFieldKeyIdFor(templateIdHex16, fieldName, encodedArgs) {
  const tplBytes = encodeU64Be(BigInt(`0x${templateIdHex16}`));
  const parts = [utf8("fld\x00"), tplBytes, utf8("\x00"), utf8(fieldName)];
  for (const a of encodedArgs) {
    parts.push(utf8("\x00"));
    parts.push(utf8(a));
  }
  return xxh3Low32(concat(parts));
}
function watchKeyFor(templateIdHex16, encodedArgs) {
  const tplBytes = encodeU64Be(BigInt(`0x${templateIdHex16}`));
  const parts = [utf8("key\x00"), tplBytes];
  for (const a of encodedArgs) {
    parts.push(utf8("\x00"));
    parts.push(utf8(a));
  }
  return xxh3Hex(concat(parts));
}
function watchKeyIdFor(templateIdHex16, encodedArgs) {
  const tplBytes = encodeU64Be(BigInt(`0x${templateIdHex16}`));
  const parts = [utf8("key\x00"), tplBytes];
  for (const a of encodedArgs) {
    parts.push(utf8("\x00"));
    parts.push(utf8(a));
  }
  return xxh3Low32(concat(parts));
}
function encodeTemplateArg(value, encoding) {
  if (value === null || value === undefined)
    return null;
  switch (encoding) {
    case "string": {
      if (typeof value === "string")
        return value;
      if (typeof value === "number" && Number.isFinite(value))
        return String(value);
      if (typeof value === "boolean")
        return value ? "true" : "false";
      return null;
    }
    case "int64": {
      if (typeof value === "bigint")
        return value.toString();
      if (typeof value === "number" && Number.isFinite(value) && Number.isInteger(value))
        return String(value);
      if (typeof value === "string" && /^-?(0|[1-9][0-9]*)$/.test(value.trim()))
        return value.trim();
      return null;
    }
    case "bool": {
      if (typeof value !== "boolean")
        return null;
      return value ? "1" : "0";
    }
    case "datetime": {
      if (typeof value !== "string")
        return null;
      const d = new Date(value);
      if (!Number.isFinite(d.getTime()))
        return null;
      return d.toISOString();
    }
    case "bytes": {
      if (typeof value !== "string")
        return null;
      return value;
    }
  }
}
function concat(parts) {
  let total = 0;
  for (const p of parts)
    total += p.byteLength;
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.byteLength;
  }
  return out;
}

// src/profiles/stateProtocol/validation.ts
import { Result as Result20 } from "better-result";

// src/touch/spec.ts
import { Result as Result19 } from "better-result";
function isPlainObject3(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function rejectUnknownKeysResult2(obj, allowed, path) {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(obj)) {
    if (!allowedSet.has(key))
      return invalidTouch(`${path}.${key} is not supported`);
  }
  return Result19.ok(undefined);
}
function invalidTouch(message) {
  return Result19.err({ kind: "invalid_touch", message });
}
function parseNumberField(value, defaultValue, message, predicate) {
  const n = value === undefined ? defaultValue : Number(value);
  if (!Number.isFinite(n) || !predicate(n))
    return invalidTouch(message);
  return Result19.ok(n);
}
function parseIntegerField(value, defaultValue, message, predicate) {
  const n = value === undefined ? defaultValue : Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n) || !predicate(n))
    return invalidTouch(message);
  return Result19.ok(n);
}
function validateTouchConfigResult(raw, fieldPath = "touch") {
  if (!isPlainObject3(raw))
    return invalidTouch(`${fieldPath} must be an object`);
  const topLevelCheck = rejectUnknownKeysResult2(raw, [
    "enabled",
    "coarseIntervalMs",
    "touchCoalesceWindowMs",
    "onMissingBefore",
    "lagDegradeFineTouchesAtSourceOffsets",
    "lagRecoverFineTouchesAtSourceOffsets",
    "fineTouchBudgetPerBatch",
    "fineTokensPerSecond",
    "fineBurstTokens",
    "lagReservedFineTouchBudgetPerBatch",
    "memory",
    "templates"
  ], fieldPath);
  if (Result19.isError(topLevelCheck))
    return topLevelCheck;
  const enabled = !!raw.enabled;
  if (!enabled) {
    return Result19.ok({ enabled: false });
  }
  const coarseIntervalMsRes = parseNumberField(raw.coarseIntervalMs, 100, `${fieldPath}.coarseIntervalMs must be > 0`, (n) => n > 0);
  if (Result19.isError(coarseIntervalMsRes))
    return coarseIntervalMsRes;
  const touchCoalesceWindowMsRes = parseNumberField(raw.touchCoalesceWindowMs, 100, `${fieldPath}.touchCoalesceWindowMs must be > 0`, (n) => n > 0);
  if (Result19.isError(touchCoalesceWindowMsRes))
    return touchCoalesceWindowMsRes;
  const onMissingBefore = raw.onMissingBefore === undefined ? "coarse" : raw.onMissingBefore;
  if (onMissingBefore !== "coarse" && onMissingBefore !== "skipBefore" && onMissingBefore !== "error") {
    return invalidTouch(`${fieldPath}.onMissingBefore must be coarse|skipBefore|error`);
  }
  const templates = raw.templates === undefined ? {} : isPlainObject3(raw.templates) ? raw.templates : null;
  if (templates == null)
    return invalidTouch(`${fieldPath}.templates must be an object`);
  const templatesCheck = rejectUnknownKeysResult2(templates, ["defaultInactivityTtlMs", "lastSeenPersistIntervalMs", "gcIntervalMs", "maxActiveTemplatesPerEntity", "maxActiveTemplatesPerStream", "activationRateLimitPerMinute"], `${fieldPath}.templates`);
  if (Result19.isError(templatesCheck))
    return templatesCheck;
  const defaultInactivityTtlMsRes = parseNumberField(templates.defaultInactivityTtlMs, 60 * 60 * 1000, `${fieldPath}.templates.defaultInactivityTtlMs must be >= 0`, (n) => n >= 0);
  if (Result19.isError(defaultInactivityTtlMsRes))
    return defaultInactivityTtlMsRes;
  const lastSeenPersistIntervalMsRes = parseNumberField(templates.lastSeenPersistIntervalMs, 5 * 60 * 1000, `${fieldPath}.templates.lastSeenPersistIntervalMs must be > 0`, (n) => n > 0);
  if (Result19.isError(lastSeenPersistIntervalMsRes))
    return lastSeenPersistIntervalMsRes;
  const gcIntervalMsRes = parseNumberField(templates.gcIntervalMs, 60000, `${fieldPath}.templates.gcIntervalMs must be > 0`, (n) => n > 0);
  if (Result19.isError(gcIntervalMsRes))
    return gcIntervalMsRes;
  const maxActiveTemplatesPerEntityRes = parseNumberField(templates.maxActiveTemplatesPerEntity, 256, `${fieldPath}.templates.maxActiveTemplatesPerEntity must be > 0`, (n) => n > 0);
  if (Result19.isError(maxActiveTemplatesPerEntityRes))
    return maxActiveTemplatesPerEntityRes;
  const maxActiveTemplatesPerStreamRes = parseNumberField(templates.maxActiveTemplatesPerStream, 2048, `${fieldPath}.templates.maxActiveTemplatesPerStream must be > 0`, (n) => n > 0);
  if (Result19.isError(maxActiveTemplatesPerStreamRes))
    return maxActiveTemplatesPerStreamRes;
  const activationRateLimitPerMinuteRes = parseNumberField(templates.activationRateLimitPerMinute, 100, `${fieldPath}.templates.activationRateLimitPerMinute must be >= 0`, (n) => n >= 0);
  if (Result19.isError(activationRateLimitPerMinuteRes))
    return activationRateLimitPerMinuteRes;
  const memoryRaw = raw.memory === undefined ? {} : isPlainObject3(raw.memory) ? raw.memory : null;
  if (memoryRaw == null)
    return invalidTouch(`${fieldPath}.memory must be an object`);
  const memoryCheck = rejectUnknownKeysResult2(memoryRaw, ["bucketMs", "filterPow2", "k", "pendingMaxKeys", "keyIndexMaxKeys", "hotKeyTtlMs", "hotTemplateTtlMs", "hotMaxKeys", "hotMaxTemplates"], `${fieldPath}.memory`);
  if (Result19.isError(memoryCheck))
    return memoryCheck;
  const bucketMsRes = parseIntegerField(memoryRaw.bucketMs, 100, `${fieldPath}.memory.bucketMs must be an integer > 0`, (n) => n > 0);
  if (Result19.isError(bucketMsRes))
    return bucketMsRes;
  const filterPow2Res = parseIntegerField(memoryRaw.filterPow2, 22, `${fieldPath}.memory.filterPow2 must be an integer in [10,30]`, (n) => n >= 10 && n <= 30);
  if (Result19.isError(filterPow2Res))
    return filterPow2Res;
  const kRes = parseIntegerField(memoryRaw.k, 4, `${fieldPath}.memory.k must be an integer in [1,8]`, (n) => n >= 1 && n <= 8);
  if (Result19.isError(kRes))
    return kRes;
  const pendingMaxKeysRes = parseIntegerField(memoryRaw.pendingMaxKeys, 1e5, `${fieldPath}.memory.pendingMaxKeys must be an integer > 0`, (n) => n > 0);
  if (Result19.isError(pendingMaxKeysRes))
    return pendingMaxKeysRes;
  const keyIndexMaxKeysRes = parseIntegerField(memoryRaw.keyIndexMaxKeys, 32, `${fieldPath}.memory.keyIndexMaxKeys must be an integer in [1,1024]`, (n) => n >= 1 && n <= 1024);
  if (Result19.isError(keyIndexMaxKeysRes))
    return keyIndexMaxKeysRes;
  const hotKeyTtlMsRes = parseIntegerField(memoryRaw.hotKeyTtlMs, 1e4, `${fieldPath}.memory.hotKeyTtlMs must be an integer > 0`, (n) => n > 0);
  if (Result19.isError(hotKeyTtlMsRes))
    return hotKeyTtlMsRes;
  const hotTemplateTtlMsRes = parseIntegerField(memoryRaw.hotTemplateTtlMs, 1e4, `${fieldPath}.memory.hotTemplateTtlMs must be an integer > 0`, (n) => n > 0);
  if (Result19.isError(hotTemplateTtlMsRes))
    return hotTemplateTtlMsRes;
  const hotMaxKeysRes = parseIntegerField(memoryRaw.hotMaxKeys, 1e6, `${fieldPath}.memory.hotMaxKeys must be an integer > 0`, (n) => n > 0);
  if (Result19.isError(hotMaxKeysRes))
    return hotMaxKeysRes;
  const hotMaxTemplatesRes = parseIntegerField(memoryRaw.hotMaxTemplates, 4096, `${fieldPath}.memory.hotMaxTemplates must be an integer > 0`, (n) => n > 0);
  if (Result19.isError(hotMaxTemplatesRes))
    return hotMaxTemplatesRes;
  const lagDegradeFineTouchesAtSourceOffsetsRes = parseIntegerField(raw.lagDegradeFineTouchesAtSourceOffsets, 5000, `${fieldPath}.lagDegradeFineTouchesAtSourceOffsets must be an integer >= 0`, (n) => n >= 0);
  if (Result19.isError(lagDegradeFineTouchesAtSourceOffsetsRes))
    return lagDegradeFineTouchesAtSourceOffsetsRes;
  const lagRecoverFineTouchesAtSourceOffsetsRes = parseIntegerField(raw.lagRecoverFineTouchesAtSourceOffsets, 1000, `${fieldPath}.lagRecoverFineTouchesAtSourceOffsets must be an integer >= 0`, (n) => n >= 0);
  if (Result19.isError(lagRecoverFineTouchesAtSourceOffsetsRes))
    return lagRecoverFineTouchesAtSourceOffsetsRes;
  const fineTouchBudgetPerBatchRes = parseIntegerField(raw.fineTouchBudgetPerBatch, 2000, `${fieldPath}.fineTouchBudgetPerBatch must be an integer >= 0`, (n) => n >= 0);
  if (Result19.isError(fineTouchBudgetPerBatchRes))
    return fineTouchBudgetPerBatchRes;
  const fineTokensPerSecondRes = parseIntegerField(raw.fineTokensPerSecond, 200000, `${fieldPath}.fineTokensPerSecond must be an integer >= 0`, (n) => n >= 0);
  if (Result19.isError(fineTokensPerSecondRes))
    return fineTokensPerSecondRes;
  const fineBurstTokensRes = parseIntegerField(raw.fineBurstTokens, 400000, `${fieldPath}.fineBurstTokens must be an integer >= 0`, (n) => n >= 0);
  if (Result19.isError(fineBurstTokensRes))
    return fineBurstTokensRes;
  const lagReservedFineTouchBudgetPerBatchRes = parseIntegerField(raw.lagReservedFineTouchBudgetPerBatch, 200, `${fieldPath}.lagReservedFineTouchBudgetPerBatch must be an integer >= 0`, (n) => n >= 0);
  if (Result19.isError(lagReservedFineTouchBudgetPerBatchRes))
    return lagReservedFineTouchBudgetPerBatchRes;
  return Result19.ok({
    enabled: true,
    coarseIntervalMs: coarseIntervalMsRes.value,
    touchCoalesceWindowMs: touchCoalesceWindowMsRes.value,
    onMissingBefore,
    lagDegradeFineTouchesAtSourceOffsets: lagDegradeFineTouchesAtSourceOffsetsRes.value,
    lagRecoverFineTouchesAtSourceOffsets: lagRecoverFineTouchesAtSourceOffsetsRes.value,
    fineTouchBudgetPerBatch: fineTouchBudgetPerBatchRes.value,
    fineTokensPerSecond: fineTokensPerSecondRes.value,
    fineBurstTokens: fineBurstTokensRes.value,
    lagReservedFineTouchBudgetPerBatch: lagReservedFineTouchBudgetPerBatchRes.value,
    memory: {
      bucketMs: bucketMsRes.value,
      filterPow2: filterPow2Res.value,
      k: kRes.value,
      pendingMaxKeys: pendingMaxKeysRes.value,
      keyIndexMaxKeys: keyIndexMaxKeysRes.value,
      hotKeyTtlMs: hotKeyTtlMsRes.value,
      hotTemplateTtlMs: hotTemplateTtlMsRes.value,
      hotMaxKeys: hotMaxKeysRes.value,
      hotMaxTemplates: hotMaxTemplatesRes.value
    },
    templates: {
      defaultInactivityTtlMs: defaultInactivityTtlMsRes.value,
      lastSeenPersistIntervalMs: lastSeenPersistIntervalMsRes.value,
      gcIntervalMs: gcIntervalMsRes.value,
      maxActiveTemplatesPerEntity: maxActiveTemplatesPerEntityRes.value,
      maxActiveTemplatesPerStream: maxActiveTemplatesPerStreamRes.value,
      activationRateLimitPerMinute: activationRateLimitPerMinuteRes.value
    }
  });
}

// src/profiles/stateProtocol/validation.ts
function isStateProtocolProfile(profile) {
  return !!profile && profile.kind === "state-protocol";
}
function getStateProtocolTouchConfig(profile) {
  return isStateProtocolProfile(profile) && profile.touch?.enabled ? profile.touch : null;
}
function cloneStateProtocolProfile(profile) {
  return cloneStreamProfileSpec(profile);
}
function cloneStateProtocolCache(cache) {
  if (!cache || cache.profile.kind !== "state-protocol")
    return null;
  return {
    profile: cloneStateProtocolProfile(cache.profile),
    updatedAtMs: cache.updatedAtMs
  };
}
function validateStateProtocolProfileResult(raw, path) {
  const objRes = expectPlainObjectResult(raw, path);
  if (Result20.isError(objRes))
    return objRes;
  if (objRes.value.kind !== "state-protocol") {
    return Result20.err({ message: `${path}.kind must be state-protocol` });
  }
  const keyCheck = rejectUnknownKeysResult(objRes.value, ["kind", "touch"], path);
  if (Result20.isError(keyCheck))
    return keyCheck;
  let touch = undefined;
  if (objRes.value.touch !== undefined) {
    const touchRes = validateTouchConfigResult(objRes.value.touch, `${path}.touch`);
    if (Result20.isError(touchRes))
      return Result20.err({ message: touchRes.error.message });
    touch = touchRes.value;
  }
  return Result20.ok(touch ? { kind: "state-protocol", touch } : { kind: "state-protocol" });
}

// src/profiles/stateProtocol/routes.ts
var EXACT_FINE_WAIT_MAX_KEYS = 16;
function countActiveTemplates(stream, db) {
  try {
    const row = db.db.query(`SELECT COUNT(*) as cnt FROM live_templates WHERE stream=? AND state='active';`).get(stream);
    return Number(row?.cnt ?? 0);
  } catch {
    return 0;
  }
}
function parseInactivityTtlResult(raw, defaultValue, fieldPath) {
  if (raw === undefined)
    return Result21.ok(defaultValue);
  if (typeof raw === "number" && Number.isFinite(raw) && raw >= 0) {
    return Result21.ok(Math.floor(raw));
  }
  return Result21.err({ message: `${fieldPath} must be a non-negative number (ms)` });
}
function parseTemplateDeclsResult(raw, fieldPath) {
  if (!Array.isArray(raw) || raw.length === 0) {
    return Result21.err({ message: `${fieldPath} must be a non-empty array` });
  }
  if (raw.length > 256)
    return Result21.err({ message: `${fieldPath} too large (max 256)` });
  const templates = [];
  for (const t of raw) {
    const entity = typeof t?.entity === "string" ? t.entity.trim() : "";
    const fieldsRaw = t?.fields;
    if (entity === "" || !Array.isArray(fieldsRaw) || fieldsRaw.length === 0 || fieldsRaw.length > 3) {
      return Result21.err({ message: `${fieldPath} contains invalid template definitions` });
    }
    const fields = [];
    for (const f of fieldsRaw) {
      const name = typeof f?.name === "string" ? f.name.trim() : "";
      const encoding = f?.encoding;
      if (name === "") {
        return Result21.err({ message: `${fieldPath} contains invalid template definitions` });
      }
      fields.push({ name, encoding });
    }
    if (fields.length !== fieldsRaw.length) {
      return Result21.err({ message: `${fieldPath} contains invalid template definitions` });
    }
    templates.push({ entity, fields });
  }
  return Result21.ok(templates);
}
function parseWaitTimeoutMsQueryResult(raw, defaultValue, fieldPath) {
  if (raw == null || raw.trim() === "")
    return Result21.ok(defaultValue);
  const n = Number(raw);
  if (!Number.isFinite(n))
    return Result21.err({ message: `${fieldPath} must be a number (ms)` });
  return Result21.ok(Math.max(0, Math.min(120000, Math.floor(n))));
}
function normalizeExactFineWaitKeys(keys) {
  if (keys.length === 0 || keys.length > EXACT_FINE_WAIT_MAX_KEYS)
    return [];
  const normalized = Array.from(new Set(keys.map((key) => key.trim().toLowerCase())));
  if (!normalized.every((key) => /^[0-9a-f]{16}$/.test(key)))
    return [];
  return normalized;
}
async function handleTemplatesActivateRoute(args, touchCfg) {
  const { req, stream, streamRow, touchManager, respond } = args;
  if (req.method !== "POST")
    return respond.badRequest("unsupported method");
  let body;
  try {
    body = await req.json();
  } catch {
    return respond.badRequest("activate body must be valid JSON");
  }
  const templatesRes = parseTemplateDeclsResult(body?.templates, "activate.templates");
  if (Result21.isError(templatesRes))
    return respond.badRequest(templatesRes.error.message);
  const inactivityTtlRes = parseInactivityTtlResult(body?.inactivityTtlMs, touchCfg.templates?.defaultInactivityTtlMs ?? 60 * 60 * 1000, "activate.inactivityTtlMs");
  if (Result21.isError(inactivityTtlRes))
    return respond.badRequest(inactivityTtlRes.error.message);
  const limits = {
    maxActiveTemplatesPerStream: touchCfg.templates?.maxActiveTemplatesPerStream ?? 2048,
    maxActiveTemplatesPerEntity: touchCfg.templates?.maxActiveTemplatesPerEntity ?? 256
  };
  const activeFromTouchOffset = touchManager.getOrCreateJournal(stream, touchCfg).getCursor();
  const res = touchManager.activateTemplates({
    stream,
    touchCfg,
    baseStreamNextOffset: streamRow.next_offset,
    activeFromTouchOffset,
    templates: templatesRes.value,
    inactivityTtlMs: inactivityTtlRes.value
  });
  return respond.json(200, { activated: res.activated, denied: res.denied, limits });
}
function buildMetaRoutePayload(args, touchCfg) {
  const { stream, streamRow, db, touchManager } = args;
  const meta = touchManager.getOrCreateJournal(stream, touchCfg).getMeta();
  const runtime = touchManager.getTouchRuntimeSnapshot({ stream, touchCfg });
  const touchState = db.getStreamTouchState(stream);
  return {
    ...meta,
    settled: meta.pendingKeys === 0 && runtime.lagSourceOffsets === 0,
    coarseIntervalMs: touchCfg.coarseIntervalMs ?? 100,
    touchCoalesceWindowMs: touchCfg.touchCoalesceWindowMs ?? 100,
    activeTemplates: countActiveTemplates(stream, db),
    lagSourceOffsets: runtime.lagSourceOffsets,
    touchMode: runtime.touchMode,
    walScannedThrough: touchState ? encodeOffset(streamRow.epoch, touchState.processed_through) : null,
    bucketMaxSourceOffsetSeq: meta.bucketMaxSourceOffsetSeq,
    hotFineKeys: runtime.hotFineKeys,
    hotTemplates: runtime.hotTemplates,
    hotFineKeysActive: runtime.hotFineKeysActive,
    hotFineKeysGrace: runtime.hotFineKeysGrace,
    hotTemplatesActive: runtime.hotTemplatesActive,
    hotTemplatesGrace: runtime.hotTemplatesGrace,
    fineWaitersActive: runtime.fineWaitersActive,
    coarseWaitersActive: runtime.coarseWaitersActive,
    broadFineWaitersActive: runtime.broadFineWaitersActive,
    hotKeyFilteringEnabled: runtime.hotKeyFilteringEnabled,
    hotTemplateFilteringEnabled: runtime.hotTemplateFilteringEnabled,
    scanRowsTotal: runtime.scanRowsTotal,
    scanBatchesTotal: runtime.scanBatchesTotal,
    scannedButEmitted0BatchesTotal: runtime.scannedButEmitted0BatchesTotal,
    processedThroughDeltaTotal: runtime.processedThroughDeltaTotal,
    touchesEmittedTotal: runtime.touchesEmittedTotal,
    touchesTableTotal: runtime.touchesTableTotal,
    touchesTemplateTotal: runtime.touchesTemplateTotal,
    fineTouchesDroppedDueToBudgetTotal: runtime.fineTouchesDroppedDueToBudgetTotal,
    fineTouchesSkippedColdTemplateTotal: runtime.fineTouchesSkippedColdTemplateTotal,
    fineTouchesSkippedColdKeyTotal: runtime.fineTouchesSkippedColdKeyTotal,
    fineTouchesSkippedTemplateBucketTotal: runtime.fineTouchesSkippedTemplateBucketTotal,
    waitTouchedTotal: runtime.waitTouchedTotal,
    waitTimeoutTotal: runtime.waitTimeoutTotal,
    waitStaleTotal: runtime.waitStaleTotal,
    journalFlushesTotal: runtime.journalFlushesTotal,
    journalNotifyWakeupsTotal: runtime.journalNotifyWakeupsTotal,
    journalNotifyWakeMsTotal: runtime.journalNotifyWakeMsTotal,
    journalNotifyWakeMsMax: runtime.journalNotifyWakeMsMax,
    journalTimeoutsFiredTotal: runtime.journalTimeoutsFiredTotal,
    journalTimeoutSweepMsTotal: runtime.journalTimeoutSweepMsTotal
  };
}
async function handleMetaRoute(args, touchCfg) {
  const { req, respond } = args;
  if (req.method !== "GET")
    return respond.badRequest("unsupported method");
  const url = new URL(req.url);
  const settleRaw = url.searchParams.get("settle");
  if (settleRaw !== null && settleRaw !== "flush") {
    return respond.badRequest("meta.settle must be 'flush' when provided");
  }
  const timeoutMsRes = parseWaitTimeoutMsQueryResult(url.searchParams.get("timeoutMs"), 30000, "meta.timeoutMs");
  if (Result21.isError(timeoutMsRes))
    return respond.badRequest(timeoutMsRes.error.message);
  if (settleRaw !== "flush") {
    return respond.json(200, buildMetaRoutePayload(args, touchCfg));
  }
  const deadlineMs = Date.now() + timeoutMsRes.value;
  for (;; ) {
    const payload = buildMetaRoutePayload(args, touchCfg);
    if (payload.settled || Date.now() >= deadlineMs) {
      return respond.json(200, payload);
    }
    if (req.signal.aborted)
      return new Response(null, { status: 204 });
    const remainingMs = Math.max(1, deadlineMs - Date.now());
    await new Promise((resolve) => {
      const waitMs = Math.min(25, remainingMs);
      const timer = setTimeout(() => {
        req.signal.removeEventListener("abort", onAbort);
        resolve();
      }, waitMs);
      const onAbort = () => {
        clearTimeout(timer);
        req.signal.removeEventListener("abort", onAbort);
        resolve();
      };
      req.signal.addEventListener("abort", onAbort, { once: true });
    });
  }
}
async function handleWaitRoute(args, touchCfg) {
  const { req, stream, streamRow, touchManager, respond } = args;
  if (req.method !== "POST")
    return respond.badRequest("unsupported method");
  const waitStartMs = Date.now();
  let body;
  try {
    body = await req.json();
  } catch {
    return respond.badRequest("wait body must be valid JSON");
  }
  const keysRaw = body?.keys;
  if (keysRaw !== undefined && (!Array.isArray(keysRaw) || !keysRaw.every((k) => typeof k === "string" && k.trim() !== ""))) {
    return respond.badRequest("wait.keys must be a non-empty string array when provided");
  }
  const keys = Array.isArray(keysRaw) ? Array.from(new Set(keysRaw.map((k) => k.trim()))) : [];
  if (keys.length > 1024)
    return respond.badRequest("wait.keys too large (max 1024)");
  const keyIdsRaw = body?.keyIds;
  const keyIds = Array.isArray(keyIdsRaw) && keyIdsRaw.length > 0 ? Array.from(new Set(keyIdsRaw.map((x) => Number(x)).filter((n) => Number.isFinite(n) && Number.isInteger(n) && n >= 0 && n <= 4294967295))).map((n) => n >>> 0) : [];
  if (Array.isArray(keyIdsRaw) && keyIds.length !== keyIdsRaw.length) {
    return respond.badRequest("wait.keyIds must be a non-empty uint32 array when provided");
  }
  if (keys.length === 0 && keyIds.length === 0)
    return respond.badRequest("wait requires keys or keyIds");
  if (keyIds.length > 1024)
    return respond.badRequest("wait.keyIds too large (max 1024)");
  const exactRaw = body?.exact;
  if (exactRaw !== undefined && typeof exactRaw !== "boolean")
    return respond.badRequest("wait.exact must be a boolean when provided");
  const exactRequested = exactRaw === true;
  const cursorRaw = body?.cursor;
  if (typeof cursorRaw !== "string" || cursorRaw.trim() === "")
    return respond.badRequest("wait.cursor must be a non-empty string");
  const cursor = cursorRaw.trim();
  const timeoutMsRaw = body?.timeoutMs;
  const timeoutMs = timeoutMsRaw === undefined ? 30000 : typeof timeoutMsRaw === "number" && Number.isFinite(timeoutMsRaw) ? Math.max(0, Math.min(120000, timeoutMsRaw)) : null;
  if (timeoutMs == null)
    return respond.badRequest("wait.timeoutMs must be a number (ms)");
  const templateIdsUsedRaw = body?.templateIdsUsed;
  if (Array.isArray(templateIdsUsedRaw) && !templateIdsUsedRaw.every((x) => typeof x === "string" && x.trim() !== "")) {
    return respond.badRequest("wait.templateIdsUsed must be a string array");
  }
  const templateIdsUsed = Array.isArray(templateIdsUsedRaw) && templateIdsUsedRaw.length > 0 ? Array.from(new Set(templateIdsUsedRaw.map((s) => typeof s === "string" ? s.trim() : "").filter((s) => s !== ""))) : [];
  const interestModeRaw = body?.interestMode;
  if (interestModeRaw !== undefined && interestModeRaw !== "fine" && interestModeRaw !== "coarse") {
    return respond.badRequest("wait.interestMode must be 'fine' or 'coarse'");
  }
  const interestMode = interestModeRaw === "coarse" ? "coarse" : "fine";
  if (interestMode === "fine" && templateIdsUsed.length > 0) {
    touchManager.heartbeatTemplates({ stream, touchCfg, templateIdsUsed });
  }
  const declareTemplatesRaw = body?.declareTemplates;
  if (Array.isArray(declareTemplatesRaw) && declareTemplatesRaw.length > 0) {
    const templatesRes = parseTemplateDeclsResult(declareTemplatesRaw, "wait.declareTemplates");
    if (Result21.isError(templatesRes))
      return respond.badRequest(templatesRes.error.message);
    const inactivityTtlRes = parseInactivityTtlResult(body?.inactivityTtlMs, touchCfg.templates?.defaultInactivityTtlMs ?? 60 * 60 * 1000, "wait.inactivityTtlMs");
    if (Result21.isError(inactivityTtlRes))
      return respond.badRequest(inactivityTtlRes.error.message);
    const activeFromTouchOffset = touchManager.getOrCreateJournal(stream, touchCfg).getCursor();
    touchManager.activateTemplates({
      stream,
      touchCfg,
      baseStreamNextOffset: streamRow.next_offset,
      activeFromTouchOffset,
      templates: templatesRes.value,
      inactivityTtlMs: inactivityTtlRes.value
    });
  }
  const journal = touchManager.getOrCreateJournal(stream, touchCfg);
  const runtime = touchManager.getTouchRuntimeSnapshot({ stream, touchCfg });
  let rawFineKeyIds = keyIds;
  if (keyIds.length === 0) {
    const parsedKeyIds = [];
    for (const key of keys) {
      const keyIdRes = touchKeyIdFromRoutingKeyResult(key);
      if (Result21.isError(keyIdRes))
        return respond.internalError();
      parsedKeyIds.push(keyIdRes.value);
    }
    rawFineKeyIds = parsedKeyIds;
  }
  const templateWaitKeyIds = templateIdsUsed.length > 0 ? Array.from(new Set(templateIdsUsed.map((templateId) => templateKeyIdFor(templateId) >>> 0))) : [];
  let waitKeyIds = rawFineKeyIds;
  let effectiveWaitKind = "fineKey";
  if (interestMode === "coarse") {
    effectiveWaitKind = "tableKey";
  } else if (runtime.touchMode === "restricted" && templateIdsUsed.length > 0) {
    effectiveWaitKind = "templateKey";
  } else if (runtime.touchMode === "coarseOnly" && templateIdsUsed.length > 0) {
    effectiveWaitKind = "tableKey";
  }
  if (effectiveWaitKind === "templateKey") {
    waitKeyIds = templateWaitKeyIds;
  } else if (effectiveWaitKind === "tableKey" && templateIdsUsed.length > 0) {
    const entities = touchManager.resolveTemplateEntitiesForWait({ stream, templateIdsUsed });
    waitKeyIds = Array.from(new Set(entities.map((entity) => tableKeyIdFor(entity) >>> 0)));
  }
  if (exactRequested && (interestMode !== "fine" || effectiveWaitKind !== "fineKey")) {
    return respond.badRequest("wait.exact requires fine interest while runtime is in fine-key mode");
  }
  const exactFineRoutingKeys = exactRequested && interestMode === "fine" && effectiveWaitKind === "fineKey" ? normalizeExactFineWaitKeys(keys) : [];
  if (exactRequested && exactFineRoutingKeys.length === 0) {
    return respond.badRequest("wait.exact requires 1 to 16 literal 64-bit routing keys");
  }
  const useExactFineKeyMatch = exactFineRoutingKeys.length > 0;
  const exactFallbackKeyIds = interestMode === "fine" && effectiveWaitKind === "fineKey" && templateWaitKeyIds.length > 0 ? templateWaitKeyIds : [];
  if (interestMode === "fine" && effectiveWaitKind === "fineKey" && templateWaitKeyIds.length > 0 && !useExactFineKeyMatch) {
    const merged = new Set;
    for (const keyId of waitKeyIds)
      merged.add(keyId >>> 0);
    for (const keyId of templateWaitKeyIds)
      merged.add(keyId >>> 0);
    waitKeyIds = Array.from(merged);
  }
  if (waitKeyIds.length === 0) {
    waitKeyIds = rawFineKeyIds;
    effectiveWaitKind = "fineKey";
  }
  const hotInterestKeyIds = interestMode === "fine" ? rawFineKeyIds : waitKeyIds;
  const releaseHotInterest = touchManager.beginHotWaitInterest({
    stream,
    touchCfg,
    keyIds: hotInterestKeyIds,
    templateIdsUsed,
    interestMode
  });
  try {
    let sinceGen;
    if (cursor === "now") {
      sinceGen = journal.getGeneration();
    } else {
      const parsed = parseTouchCursor(cursor);
      if (!parsed)
        return respond.badRequest("wait.cursor must be in the form <epochHex>:<generation> or 'now'");
      if (parsed.epoch !== journal.getEpoch()) {
        const latencyMs2 = Date.now() - waitStartMs;
        touchManager.recordWaitMetrics({ stream, touchCfg, keysCount: waitKeyIds.length, outcome: "stale", latencyMs: latencyMs2 });
        return respond.json(200, {
          stale: true,
          cursor: journal.getCursor(),
          epoch: journal.getEpoch(),
          generation: journal.getGeneration(),
          effectiveWaitKind,
          bucketMaxSourceOffsetSeq: journal.getLastFlushedSourceOffsetSeq().toString(),
          flushAtMs: journal.getLastFlushAtMs(),
          bucketStartMs: journal.getLastBucketStartMs(),
          error: { code: "stale", message: "cursor epoch mismatch; rerun/re-subscribe and start from cursor" }
        });
      }
      sinceGen = parsed.generation;
    }
    const nowGen = journal.getGeneration();
    if (sinceGen > nowGen)
      sinceGen = nowGen;
    if (useExactFineKeyMatch) {
      const exactTouched = journal.exactTouchedSinceAny(exactFineRoutingKeys, sinceGen);
      if (exactTouched === true) {
        const latencyMs2 = Date.now() - waitStartMs;
        touchManager.recordWaitMetrics({ stream, touchCfg, keysCount: waitKeyIds.length, outcome: "touched", latencyMs: latencyMs2 });
        return respond.json(200, {
          touched: true,
          cursor: journal.getCursor(),
          effectiveWaitKind,
          bucketMaxSourceOffsetSeq: journal.getLastFlushedSourceOffsetSeq().toString(),
          flushAtMs: journal.getLastFlushAtMs(),
          bucketStartMs: journal.getLastBucketStartMs()
        });
      }
      const fallbackTouched = exactFallbackKeyIds.length > 0 ? journal.maybeTouchedSinceAny(exactFallbackKeyIds, sinceGen) : false;
      if (fallbackTouched) {
        const latencyMs2 = Date.now() - waitStartMs;
        touchManager.recordWaitMetrics({ stream, touchCfg, keysCount: waitKeyIds.length, outcome: "touched", latencyMs: latencyMs2 });
        return respond.json(200, {
          touched: true,
          cursor: journal.getCursor(),
          effectiveWaitKind,
          bucketMaxSourceOffsetSeq: journal.getLastFlushedSourceOffsetSeq().toString(),
          flushAtMs: journal.getLastFlushAtMs(),
          bucketStartMs: journal.getLastBucketStartMs()
        });
      }
      if (exactTouched === false) {} else if (journal.maybeTouchedSinceAny(waitKeyIds, sinceGen)) {
        const latencyMs2 = Date.now() - waitStartMs;
        touchManager.recordWaitMetrics({ stream, touchCfg, keysCount: waitKeyIds.length, outcome: "touched", latencyMs: latencyMs2 });
        return respond.json(200, {
          touched: true,
          cursor: journal.getCursor(),
          effectiveWaitKind,
          bucketMaxSourceOffsetSeq: journal.getLastFlushedSourceOffsetSeq().toString(),
          flushAtMs: journal.getLastFlushAtMs(),
          bucketStartMs: journal.getLastBucketStartMs()
        });
      }
    } else if (journal.maybeTouchedSinceAny(waitKeyIds, sinceGen)) {
      const latencyMs2 = Date.now() - waitStartMs;
      touchManager.recordWaitMetrics({ stream, touchCfg, keysCount: waitKeyIds.length, outcome: "touched", latencyMs: latencyMs2 });
      return respond.json(200, {
        touched: true,
        cursor: journal.getCursor(),
        effectiveWaitKind,
        bucketMaxSourceOffsetSeq: journal.getLastFlushedSourceOffsetSeq().toString(),
        flushAtMs: journal.getLastFlushAtMs(),
        bucketStartMs: journal.getLastBucketStartMs()
      });
    }
    const deadline = Date.now() + timeoutMs;
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      const latencyMs2 = Date.now() - waitStartMs;
      touchManager.recordWaitMetrics({ stream, touchCfg, keysCount: waitKeyIds.length, outcome: "timeout", latencyMs: latencyMs2 });
      return respond.json(200, {
        touched: false,
        cursor: journal.getCursor(),
        effectiveWaitKind,
        bucketMaxSourceOffsetSeq: journal.getLastFlushedSourceOffsetSeq().toString(),
        flushAtMs: journal.getLastFlushAtMs(),
        bucketStartMs: journal.getLastBucketStartMs()
      });
    }
    const afterGen = journal.getGeneration();
    const hit = await journal.waitForAny({
      keys: useExactFineKeyMatch ? exactFallbackKeyIds : waitKeyIds,
      exactKeys: useExactFineKeyMatch ? exactFineRoutingKeys : null,
      afterGeneration: afterGen,
      timeoutMs: remaining,
      signal: req.signal
    });
    if (req.signal.aborted)
      return new Response(null, { status: 204 });
    if (hit == null) {
      const latencyMs2 = Date.now() - waitStartMs;
      touchManager.recordWaitMetrics({ stream, touchCfg, keysCount: waitKeyIds.length, outcome: "timeout", latencyMs: latencyMs2 });
      return respond.json(200, {
        touched: false,
        cursor: journal.getCursor(),
        effectiveWaitKind,
        bucketMaxSourceOffsetSeq: journal.getLastFlushedSourceOffsetSeq().toString(),
        flushAtMs: journal.getLastFlushAtMs(),
        bucketStartMs: journal.getLastBucketStartMs()
      });
    }
    const latencyMs = Date.now() - waitStartMs;
    touchManager.recordWaitMetrics({ stream, touchCfg, keysCount: waitKeyIds.length, outcome: "touched", latencyMs });
    return respond.json(200, {
      touched: true,
      cursor: journal.getCursor(),
      effectiveWaitKind,
      bucketMaxSourceOffsetSeq: hit.bucketMaxSourceOffsetSeq.toString(),
      flushAtMs: hit.flushAtMs,
      bucketStartMs: hit.bucketStartMs
    });
  } finally {
    releaseHotInterest();
  }
}
async function handleStateProtocolTouchRoute(args) {
  const { route, profile, respond } = args;
  const touchCfg = getStateProtocolTouchConfig(profile);
  if (!touchCfg)
    return respond.notFound("touch not enabled");
  if (route.kind === "templates_activate")
    return handleTemplatesActivateRoute(args, touchCfg);
  if (route.kind === "meta")
    return handleMetaRoute(args, touchCfg);
  return handleWaitRoute(args, touchCfg);
}

// src/profiles/stateProtocol/ingest.ts
import { Result as Result22 } from "better-result";
var CHANGE_KEYS = ["type", "key", "value", "old_value", "headers"];
var CHANGE_HEADER_KEYS = ["operation", "txid", "timestamp"];
var CONTROL_KEYS = ["headers"];
var CONTROL_HEADER_KEYS = ["control", "offset"];
function isDateTimeString2(value) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
    return false;
  }
  return !Number.isNaN(Date.parse(value));
}
function nonEmptyStringFieldResult(value, path) {
  if (typeof value !== "string" || value.trim() === "") {
    return Result22.err({ message: `${path} must be a non-empty string` });
  }
  return Result22.ok(value);
}
function validateChangeRecordResult(record, headers) {
  const keyCheck = rejectUnknownKeysResult(record, CHANGE_KEYS, "state-protocol record");
  if (Result22.isError(keyCheck))
    return keyCheck;
  const headerKeyCheck = rejectUnknownKeysResult(headers, CHANGE_HEADER_KEYS, "state-protocol record.headers");
  if (Result22.isError(headerKeyCheck))
    return headerKeyCheck;
  const typeRes = nonEmptyStringFieldResult(record.type, "state-protocol record.type");
  if (Result22.isError(typeRes))
    return typeRes;
  const keyRes = nonEmptyStringFieldResult(record.key, "state-protocol record.key");
  if (Result22.isError(keyRes))
    return keyRes;
  const operation = headers.operation;
  if (operation !== "insert" && operation !== "update" && operation !== "delete") {
    return Result22.err({ message: "state-protocol record.headers.operation must be insert, update, or delete" });
  }
  if ((operation === "insert" || operation === "update") && !Object.prototype.hasOwnProperty.call(record, "value")) {
    return Result22.err({ message: `state-protocol ${operation} records must include value` });
  }
  if (Object.prototype.hasOwnProperty.call(headers, "txid")) {
    const txidRes = nonEmptyStringFieldResult(headers.txid, "state-protocol record.headers.txid");
    if (Result22.isError(txidRes))
      return txidRes;
  }
  if (Object.prototype.hasOwnProperty.call(headers, "timestamp")) {
    if (typeof headers.timestamp !== "string" || !isDateTimeString2(headers.timestamp)) {
      return Result22.err({ message: "state-protocol record.headers.timestamp must be a valid RFC 3339 timestamp" });
    }
  }
  return Result22.ok({ value: record, routingKey: null });
}
function validateControlRecordResult(record, headers) {
  const keyCheck = rejectUnknownKeysResult(record, CONTROL_KEYS, "state-protocol record");
  if (Result22.isError(keyCheck))
    return keyCheck;
  const headerKeyCheck = rejectUnknownKeysResult(headers, CONTROL_HEADER_KEYS, "state-protocol record.headers");
  if (Result22.isError(headerKeyCheck))
    return headerKeyCheck;
  const control = headers.control;
  if (control !== "snapshot-start" && control !== "snapshot-end" && control !== "reset") {
    return Result22.err({ message: "state-protocol record.headers.control must be snapshot-start, snapshot-end, or reset" });
  }
  if (Object.prototype.hasOwnProperty.call(headers, "offset")) {
    if (typeof headers.offset !== "string") {
      return Result22.err({ message: "state-protocol record.headers.offset must be a valid stream offset string" });
    }
    const offsetRes = parseOffsetResult(headers.offset);
    if (Result22.isError(offsetRes)) {
      return Result22.err({ message: "state-protocol record.headers.offset must be a valid stream offset string" });
    }
  }
  return Result22.ok({ value: record, routingKey: null });
}
function validateStateProtocolRecordResult(value) {
  const recordRes = expectPlainObjectResult(value, "state-protocol record");
  if (Result22.isError(recordRes)) {
    return Result22.err({ message: "state-protocol records must be JSON objects" });
  }
  const headersRes = expectPlainObjectResult(recordRes.value.headers, "state-protocol record.headers");
  if (Result22.isError(headersRes)) {
    return Result22.err({ message: "state-protocol record.headers must be an object" });
  }
  const hasControl = Object.prototype.hasOwnProperty.call(headersRes.value, "control");
  const hasOperation = Object.prototype.hasOwnProperty.call(headersRes.value, "operation");
  if (hasControl && hasOperation) {
    return Result22.err({ message: "state-protocol record.headers cannot mix control and operation" });
  }
  if (hasControl)
    return validateControlRecordResult(recordRes.value, headersRes.value);
  if (hasOperation)
    return validateChangeRecordResult(recordRes.value, headersRes.value);
  return Result22.err({ message: "state-protocol record.headers must contain operation or control" });
}

// src/profiles/stateProtocol.ts
var STATE_PROTOCOL_TOUCH_CAPABILITY = {
  getTouchConfig(profile) {
    return getStateProtocolTouchConfig(profile);
  },
  syncState({ db, stream, profile }) {
    if (getStateProtocolTouchConfig(profile))
      db.ensureStreamTouchState(stream);
    else
      db.deleteStreamTouchState(stream);
  },
  deriveCanonicalChanges(record) {
    return deriveStateProtocolChanges(record);
  },
  async handleRoute(args) {
    return handleStateProtocolTouchRoute(args);
  }
};
var STATE_PROTOCOL_STREAM_PROFILE_DEFINITION = {
  kind: "state-protocol",
  usesStoredProfileRow: true,
  touch: STATE_PROTOCOL_TOUCH_CAPABILITY,
  defaultProfile() {
    return { kind: "state-protocol" };
  },
  validateResult(raw, path) {
    return validateStateProtocolProfileResult(raw, path);
  },
  readProfileResult({ row, cached }) {
    if (!row) {
      return Result23.ok({ profile: { kind: "state-protocol" }, cache: null });
    }
    const cachedCopy = cloneStateProtocolCache(cached);
    if (cachedCopy && cachedCopy.updatedAtMs === row.updated_at_ms) {
      return Result23.ok({
        profile: cloneStateProtocolProfile(cachedCopy.profile),
        cache: cachedCopy
      });
    }
    const parsedRes = parseStoredProfileJsonResult(row.profile_json);
    if (Result23.isError(parsedRes))
      return parsedRes;
    const profileRes = validateStateProtocolProfileResult(parsedRes.value, "profile");
    if (Result23.isError(profileRes))
      return profileRes;
    const profile = cloneStateProtocolProfile(profileRes.value);
    return Result23.ok({
      profile: cloneStateProtocolProfile(profile),
      cache: { profile, updatedAtMs: row.updated_at_ms }
    });
  },
  persistProfileResult({ db, stream, streamRow, profile }) {
    if (!isStateProtocolProfile(profile)) {
      return Result23.err({ kind: "bad_request", message: "invalid state-protocol profile" });
    }
    const contentType = normalizeProfileContentType(streamRow.content_type);
    if (contentType !== "application/json") {
      return Result23.err({
        kind: "bad_request",
        message: "state-protocol profile requires application/json stream content-type"
      });
    }
    const persistedProfile = cloneStateProtocolProfile(profile);
    db.updateStreamProfile(stream, persistedProfile.kind);
    db.upsertStreamProfile(stream, JSON.stringify(persistedProfile));
    STATE_PROTOCOL_TOUCH_CAPABILITY.syncState({ db, stream, profile: persistedProfile });
    const row = db.getStreamProfile(stream);
    return Result23.ok({
      profile: cloneStateProtocolProfile(persistedProfile),
      cache: {
        profile: persistedProfile,
        updatedAtMs: row?.updated_at_ms ?? db.nowMs()
      },
      schemaRegistry: null
    });
  },
  jsonIngest: {
    prepareRecordResult({ profile, value }) {
      if (!isStateProtocolProfile(profile))
        return Result23.err({ message: "invalid state-protocol profile" });
      return validateStateProtocolRecordResult(value);
    }
  }
};

// src/profiles/index.ts
var STREAM_PROFILE_DEFINITIONS = {
  [EVLOG_STREAM_PROFILE_DEFINITION.kind]: EVLOG_STREAM_PROFILE_DEFINITION,
  [GENERIC_STREAM_PROFILE_DEFINITION.kind]: GENERIC_STREAM_PROFILE_DEFINITION,
  [METRICS_STREAM_PROFILE_DEFINITION.kind]: METRICS_STREAM_PROFILE_DEFINITION,
  [OTEL_TRACES_STREAM_PROFILE_DEFINITION.kind]: OTEL_TRACES_STREAM_PROFILE_DEFINITION,
  [STATE_PROTOCOL_STREAM_PROFILE_DEFINITION.kind]: STATE_PROTOCOL_STREAM_PROFILE_DEFINITION
};
function resolveStreamProfileDefinition(kind) {
  const normalized = typeof kind === "string" && kind !== "" ? kind : DEFAULT_STREAM_PROFILE;
  return STREAM_PROFILE_DEFINITIONS[normalized] ?? null;
}
function resolveTouchCapability(profile2) {
  if (!profile2)
    return null;
  return resolveStreamProfileDefinition(profile2.kind)?.touch ?? null;
}
function resolveEnabledTouchCapability(profile2) {
  const capability = resolveTouchCapability(profile2);
  if (!profile2 || !capability)
    return null;
  const touchCfg = capability.getTouchConfig(profile2);
  if (!touchCfg)
    return null;
  return { capability, touchCfg };
}

// src/util/log.ts
var patched = false;
function wrapConsole(orig, level) {
  return (...args) => {
    const prefix = `[${new Date().toISOString()}] [${level}]`;
    if (args.length === 0)
      return orig(prefix);
    return orig(prefix, ...args);
  };
}
function initConsoleLogging() {
  if (patched)
    return;
  patched = true;
  const globalAny = globalThis;
  if (globalAny.__ds_console_patched)
    return;
  globalAny.__ds_console_patched = true;
  console.log = wrapConsole(console.log.bind(console), "INFO");
  console.info = wrapConsole(console.info.bind(console), "INFO");
  console.warn = wrapConsole(console.warn.bind(console), "WARN");
  console.error = wrapConsole(console.error.bind(console), "ERROR");
  if (console.debug)
    console.debug = wrapConsole(console.debug.bind(console), "DEBUG");
}

// src/touch/processor_worker.ts
initConsoleLogging();
var data = workerData;
var cfg = data.config;
setSqliteRuntimeOverride(data.hostRuntime ?? null);
var db = new SqliteDurableStore(cfg.dbPath, { cacheBytes: cfg.workerSqliteCacheBytes, skipMigrations: true });
var decoder = new TextDecoder;
function isPlainObject4(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function isProjectedFieldValue(value) {
  return value === undefined || value === null || typeof value === "string" || typeof value === "boolean" || typeof value === "bigint" || typeof value === "number" && Number.isFinite(value);
}
function projectedFieldValueEquals(a, b) {
  if (a === b)
    return true;
  return typeof a === "number" && typeof b === "number" && Number.isNaN(a) && Number.isNaN(b);
}
function changedProjectedFieldNames(args) {
  const names = new Set([...Object.keys(args.before), ...Object.keys(args.after)]);
  const out = [];
  for (const name of names) {
    if (args.excluded.has(name))
      continue;
    const beforeValue = Object.prototype.hasOwnProperty.call(args.before, name) ? args.before[name] : undefined;
    const afterValue = Object.prototype.hasOwnProperty.call(args.after, name) ? args.after[name] : undefined;
    if (!isProjectedFieldValue(beforeValue) || !isProjectedFieldValue(afterValue))
      continue;
    if (!projectedFieldValueEquals(beforeValue, afterValue))
      out.push(name);
  }
  return out;
}
function projectedFieldNamesFromAfter(args) {
  const out = [];
  for (const name of Object.keys(args.after)) {
    if (args.excluded.has(name))
      continue;
    if (!isProjectedFieldValue(args.after[name]))
      continue;
    out.push(name);
  }
  return out;
}
async function handleProcess(msg) {
  const { stream, fromOffset, toOffset, profile: profile2, maxRows, maxBytes } = msg;
  const failProcess = (message) => {
    const err = Result25.err({ kind: "missing_old_value", message });
    parentPort?.postMessage({
      type: "error",
      id: msg.id,
      stream,
      message: err.error.message
    });
  };
  const enabledTouch = resolveEnabledTouchCapability(profile2);
  if (!enabledTouch) {
    parentPort?.postMessage({
      type: "error",
      id: msg.id,
      stream,
      message: "touch not enabled for profile"
    });
    return;
  }
  const { capability: touchCapability, touchCfg: touch } = enabledTouch;
  const fineBudgetRaw = msg.fineTouchBudget ?? touch.fineTouchBudgetPerBatch;
  const fineBudget = fineBudgetRaw == null ? null : Math.max(0, Math.floor(fineBudgetRaw));
  const fineGranularity = msg.fineGranularity === "template" ? "template" : "key";
  const processingMode = msg.processingMode === "hotTemplatesOnly" ? "hotTemplatesOnly" : "full";
  const hotTemplatesOnly = fineGranularity === "template" && processingMode === "hotTemplatesOnly";
  const emitFineTouches = msg.emitFineTouches !== false && fineBudget !== 0;
  let fineBudgetExhausted = fineBudget != null && fineBudget <= 0;
  let fineKeysBudgetRemaining = fineBudget;
  let fineTouchesSuppressedDueToBudget = false;
  const filterHotTemplates = msg.filterHotTemplates === true;
  const hotTemplateIdsRaw = filterHotTemplates ? msg.hotTemplateIds ?? [] : [];
  const hotTemplateIds = filterHotTemplates ? new Set(hotTemplateIdsRaw.filter((x) => typeof x === "string" && /^[0-9a-f]{16}$/.test(x))) : null;
  const coarseIntervalMs = Math.max(1, Math.floor(touch.coarseIntervalMs ?? 100));
  const coalesceWindowMs = Math.max(1, Math.floor(touch.touchCoalesceWindowMs ?? 100));
  const onMissingBefore = touch.onMissingBefore ?? "coarse";
  const templatesByEntity = new Map;
  const coldTemplateCountByEntity = new Map;
  if (emitFineTouches) {
    try {
      const rows = db.db.query(`SELECT template_id, entity, fields_json, encodings_json, active_from_source_offset
           FROM live_templates
           WHERE stream=? AND state='active';`).all(stream);
      for (const row of rows) {
        const templateId = String(row.template_id ?? "");
        if (!/^[0-9a-f]{16}$/.test(templateId))
          continue;
        const entity = String(row.entity ?? "");
        if (entity.trim() === "")
          continue;
        let fields;
        let encodings;
        try {
          fields = JSON.parse(String(row.fields_json ?? "[]"));
          encodings = JSON.parse(String(row.encodings_json ?? "[]"));
        } catch {
          continue;
        }
        if (!Array.isArray(fields) || !Array.isArray(encodings) || fields.length !== encodings.length)
          continue;
        const f = fields.map(String);
        const e = encodings.map(String);
        if (f.length === 0 || f.length > 3)
          continue;
        if (!e.every((x) => x === "string" || x === "int64" || x === "bool" || x === "datetime" || x === "bytes"))
          continue;
        if (hotTemplateIds && !hotTemplateIds.has(templateId)) {
          coldTemplateCountByEntity.set(entity, (coldTemplateCountByEntity.get(entity) ?? 0) + 1);
          continue;
        }
        const activeFromSourceOffset = typeof row.active_from_source_offset === "bigint" ? row.active_from_source_offset : BigInt(row.active_from_source_offset ?? 0);
        const tpl = { templateId, entity, fields: f, encodings: e, activeFromSourceOffset };
        const arr = templatesByEntity.get(entity) ?? [];
        arr.push(tpl);
        templatesByEntity.set(entity, arr);
      }
    } catch {}
  }
  let rowsRead = 0;
  let bytesRead = 0;
  let changes = 0;
  let maxSourceTsMs = 0;
  let processedThrough = fromOffset - 1n;
  const pending = new Map;
  const templateOnlyEntityTouch = new Map;
  const touches = [];
  let fineTouchesDroppedDueToBudget = 0;
  let fineTouchesSkippedColdTemplate = 0;
  const flush = (_mapKey, p) => {
    touches.push({
      keyId: p.keyId >>> 0,
      routingKey: p.routingKey,
      watermark: p.watermark,
      entity: p.entity,
      kind: p.kind,
      templateId: p.templateId
    });
  };
  const queueTouch = (args) => {
    const mapKey = args.routingKey ? `r:${args.routingKey}` : `i:${args.keyId >>> 0}`;
    const prev = pending.get(mapKey);
    if (args.kind !== "table" && fineBudget != null && !fineBudgetExhausted && !prev) {
      const remaining = fineKeysBudgetRemaining ?? 0;
      if (remaining <= 0) {
        fineBudgetExhausted = true;
        fineTouchesSuppressedDueToBudget = true;
        fineTouchesDroppedDueToBudget += 1;
        return;
      }
      fineKeysBudgetRemaining = remaining - 1;
    } else if (args.kind !== "table" && fineBudget != null && !prev && fineBudgetExhausted) {
      fineTouchesSuppressedDueToBudget = true;
      fineTouchesDroppedDueToBudget += 1;
      return;
    }
    if (!prev) {
      pending.set(mapKey, {
        keyId: args.keyId >>> 0,
        routingKey: args.routingKey,
        windowStartMs: args.tsMs,
        watermark: args.watermark,
        entity: args.entity,
        kind: args.kind,
        templateId: args.templateId
      });
      return;
    }
    if (args.tsMs - prev.windowStartMs < args.windowMs) {
      prev.watermark = args.watermark;
      return;
    }
    flush(mapKey, prev);
    pending.set(mapKey, {
      keyId: args.keyId >>> 0,
      routingKey: args.routingKey,
      windowStartMs: args.tsMs,
      watermark: args.watermark,
      entity: args.entity,
      kind: args.kind,
      templateId: args.templateId
    });
  };
  for (const row of db.iterWalRange(stream, fromOffset, toOffset)) {
    const payload = row.payload;
    const payloadLen = payload.byteLength;
    if (rowsRead > 0 && (rowsRead >= maxRows || bytesRead + payloadLen > maxBytes))
      break;
    rowsRead++;
    bytesRead += payloadLen;
    const offset = typeof row.offset === "bigint" ? row.offset : BigInt(row.offset);
    processedThrough = offset;
    const tsMsRaw = row.ts_ms;
    const tsMs = typeof tsMsRaw === "bigint" ? Number(tsMsRaw) : Number(tsMsRaw);
    if (!Number.isFinite(tsMs))
      continue;
    if (tsMs > maxSourceTsMs)
      maxSourceTsMs = tsMs;
    let value;
    try {
      value = JSON.parse(decoder.decode(payload));
    } catch {
      continue;
    }
    const canonical = touchCapability.deriveCanonicalChanges(value, profile2);
    changes += canonical.length;
    if (canonical.length === 0)
      continue;
    const watermark = offset.toString();
    for (const ch of canonical) {
      const entity = ch.entity;
      const coarseKeyId = tableKeyIdFor(entity);
      queueTouch({
        keyId: coarseKeyId,
        tsMs,
        watermark,
        entity,
        kind: "table",
        windowMs: coarseIntervalMs
      });
      if (!emitFineTouches)
        continue;
      if (fineBudgetExhausted)
        continue;
      const tpls = templatesByEntity.get(entity);
      if (filterHotTemplates) {
        fineTouchesSkippedColdTemplate += coldTemplateCountByEntity.get(entity) ?? 0;
      }
      if (!tpls || tpls.length === 0)
        continue;
      if (hotTemplatesOnly) {
        const prev = templateOnlyEntityTouch.get(entity);
        if (!prev || offset > prev.offset)
          templateOnlyEntityTouch.set(entity, { offset, tsMs, watermark });
        continue;
      }
      for (const tpl of tpls) {
        if (fineBudgetExhausted)
          break;
        if (offset < tpl.activeFromSourceOffset)
          continue;
        if (fineGranularity === "template") {
          queueTouch({
            keyId: templateKeyIdFor(tpl.templateId) >>> 0,
            tsMs,
            watermark,
            entity,
            kind: "template",
            templateId: tpl.templateId,
            windowMs: coalesceWindowMs
          });
          if (fineBudgetExhausted)
            break;
          continue;
        }
        const afterObj = ch.after;
        const beforeObj = ch.before;
        const watchKeys = new Map;
        const membershipKeys = new Map;
        const projectedFieldKeys = new Map;
        const computeArgs = (obj) => {
          if (!obj || typeof obj !== "object" || Array.isArray(obj))
            return null;
          const args = [];
          for (let i = 0;i < tpl.fields.length; i++) {
            const name = tpl.fields[i];
            const enc = tpl.encodings[i];
            const v = obj[name];
            const encoded = encodeTemplateArg(v, enc);
            if (encoded == null)
              return null;
            args.push(encoded);
          }
          return args;
        };
        const computeWatch = (args) => {
          const routingKey = watchKeyFor(tpl.templateId, args);
          return { keyId: watchKeyIdFor(tpl.templateId, args) >>> 0, routingKey };
        };
        const computeMembership = (args) => {
          const routingKey = membershipKeyFor(tpl.templateId, args);
          return { keyId: membershipKeyIdFor(tpl.templateId, args) >>> 0, routingKey };
        };
        const computeProjectedField = (fieldName, args) => {
          const routingKey = projectedFieldKeyFor(tpl.templateId, fieldName, args);
          return { keyId: projectedFieldKeyIdFor(tpl.templateId, fieldName, args) >>> 0, routingKey };
        };
        const afterArgs = computeArgs(afterObj);
        const beforeArgs = computeArgs(beforeObj);
        const watchAfter = afterArgs != null ? computeWatch(afterArgs) : null;
        const watchBefore = beforeArgs != null ? computeWatch(beforeArgs) : null;
        const membershipAfter = afterArgs != null ? computeMembership(afterArgs) : null;
        const membershipBefore = beforeArgs != null ? computeMembership(beforeArgs) : null;
        const sameTuple = watchBefore != null && watchAfter != null && watchBefore.routingKey === watchAfter.routingKey;
        const excludedProjectedFields = new Set(tpl.fields);
        if (ch.op === "insert") {
          if (watchAfter != null)
            watchKeys.set(watchAfter.keyId >>> 0, watchAfter.routingKey);
          if (membershipAfter != null)
            membershipKeys.set(membershipAfter.keyId >>> 0, membershipAfter.routingKey);
        } else if (ch.op === "delete") {
          if (watchBefore != null)
            watchKeys.set(watchBefore.keyId >>> 0, watchBefore.routingKey);
          if (membershipBefore != null)
            membershipKeys.set(membershipBefore.keyId >>> 0, membershipBefore.routingKey);
        } else {
          if (watchBefore != null) {
            watchKeys.set(watchBefore.keyId >>> 0, watchBefore.routingKey);
            if (watchAfter != null)
              watchKeys.set(watchAfter.keyId >>> 0, watchAfter.routingKey);
            if (membershipBefore != null && membershipAfter != null) {
              if (membershipBefore.routingKey !== membershipAfter.routingKey) {
                membershipKeys.set(membershipBefore.keyId >>> 0, membershipBefore.routingKey);
                membershipKeys.set(membershipAfter.keyId >>> 0, membershipAfter.routingKey);
              } else if (sameTuple && isPlainObject4(beforeObj) && isPlainObject4(afterObj) && afterArgs != null) {
                for (const fieldName of changedProjectedFieldNames({
                  before: beforeObj,
                  after: afterObj,
                  excluded: excludedProjectedFields
                })) {
                  const projected = computeProjectedField(fieldName, afterArgs);
                  projectedFieldKeys.set(projected.keyId >>> 0, projected.routingKey);
                }
              }
            } else {
              if (membershipBefore != null)
                membershipKeys.set(membershipBefore.keyId >>> 0, membershipBefore.routingKey);
              if (membershipAfter != null)
                membershipKeys.set(membershipAfter.keyId >>> 0, membershipAfter.routingKey);
            }
          } else {
            if (beforeObj === undefined) {
              if (onMissingBefore === "error") {
                failProcess(`missing old_value for update (entity=${entity}, templateId=${tpl.templateId})`);
                return;
              }
            } else {
              if (onMissingBefore === "error") {
                failProcess(`old_value missing required fields for update (entity=${entity}, templateId=${tpl.templateId})`);
                return;
              }
            }
            if (onMissingBefore === "skipBefore") {
              if (watchAfter != null)
                watchKeys.set(watchAfter.keyId >>> 0, watchAfter.routingKey);
              if (membershipAfter != null)
                membershipKeys.set(membershipAfter.keyId >>> 0, membershipAfter.routingKey);
              if (afterArgs != null && isPlainObject4(afterObj)) {
                for (const fieldName of projectedFieldNamesFromAfter({
                  after: afterObj,
                  excluded: excludedProjectedFields
                })) {
                  const projected = computeProjectedField(fieldName, afterArgs);
                  projectedFieldKeys.set(projected.keyId >>> 0, projected.routingKey);
                }
              }
            } else {}
          }
        }
        for (const [watchKeyId, routingKey] of watchKeys) {
          queueTouch({
            keyId: watchKeyId >>> 0,
            routingKey,
            tsMs,
            watermark,
            entity,
            kind: "template",
            templateId: tpl.templateId,
            windowMs: coalesceWindowMs
          });
          if (fineBudgetExhausted)
            break;
        }
        for (const [membershipKeyId, routingKey] of membershipKeys) {
          queueTouch({
            keyId: membershipKeyId >>> 0,
            routingKey,
            tsMs,
            watermark,
            entity,
            kind: "template",
            templateId: tpl.templateId,
            windowMs: coalesceWindowMs
          });
          if (fineBudgetExhausted)
            break;
        }
        for (const [projectedFieldKeyId, routingKey] of projectedFieldKeys) {
          queueTouch({
            keyId: projectedFieldKeyId >>> 0,
            routingKey,
            tsMs,
            watermark,
            entity,
            kind: "template",
            templateId: tpl.templateId,
            windowMs: coalesceWindowMs
          });
          if (fineBudgetExhausted)
            break;
        }
      }
    }
  }
  if (emitFineTouches && hotTemplatesOnly && !fineBudgetExhausted && templateOnlyEntityTouch.size > 0) {
    for (const [entity, agg] of templateOnlyEntityTouch.entries()) {
      if (fineBudgetExhausted)
        break;
      const tpls = templatesByEntity.get(entity);
      if (!tpls || tpls.length === 0)
        continue;
      for (const tpl of tpls) {
        if (fineBudgetExhausted)
          break;
        if (agg.offset < tpl.activeFromSourceOffset)
          continue;
        queueTouch({
          keyId: templateKeyIdFor(tpl.templateId) >>> 0,
          tsMs: agg.tsMs,
          watermark: agg.watermark,
          entity,
          kind: "template",
          templateId: tpl.templateId,
          windowMs: coalesceWindowMs
        });
      }
    }
  }
  for (const [key, p] of pending.entries()) {
    flush(key, p);
  }
  touches.sort((a, b) => {
    const ak = a.keyId >>> 0;
    const bk = b.keyId >>> 0;
    if (ak < bk)
      return -1;
    if (ak > bk)
      return 1;
    const ar = a.routingKey ?? "";
    const br = b.routingKey ?? "";
    if (ar < br)
      return -1;
    if (ar > br)
      return 1;
    const aw = BigInt(a.watermark);
    const bw = BigInt(b.watermark);
    if (aw < bw)
      return -1;
    if (aw > bw)
      return 1;
    return 0;
  });
  let tableTouchesEmitted = 0;
  let templateTouchesEmitted = 0;
  for (const t of touches) {
    if (t.kind === "table")
      tableTouchesEmitted++;
    else
      templateTouchesEmitted++;
  }
  parentPort?.postMessage({
    type: "result",
    id: msg.id,
    stream,
    processedThrough,
    touches,
    stats: {
      rowsRead,
      bytesRead,
      changes,
      touchesEmitted: touches.length,
      tableTouchesEmitted,
      templateTouchesEmitted,
      maxSourceTsMs,
      fineTouchesDroppedDueToBudget,
      fineTouchesSuppressedDueToBudget,
      fineTouchesSkippedColdTemplate
    }
  });
}
parentPort?.on("message", (msg) => {
  if (!msg || typeof msg !== "object")
    return;
  if (msg.type === "stop") {
    try {
      db.close();
    } catch {}
    try {
      parentPort?.postMessage({ type: "stopped" });
    } catch {}
    return;
  }
  if (msg.type === "process") {
    handleProcess(msg).catch((e) => {
      try {
        parentPort?.postMessage({
          type: "error",
          id: msg.id,
          stream: msg.stream,
          message: String(e?.message ?? e),
          stack: e?.stack ? String(e.stack) : undefined
        });
      } catch {}
    });
  }
});
