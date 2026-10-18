import { createRequire } from "node:module";
var __require = /* @__PURE__ */ createRequire(import.meta.url);

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

// src/local/common.ts
function readOptionValue(args, flag) {
  const idx = args.findIndex((arg) => arg === flag || arg.startsWith(`${flag}=`));
  if (idx === -1)
    return { found: false };
  const raw = args[idx];
  if (raw.includes("="))
    return { found: true, value: raw.split("=", 2)[1] };
  const next = args[idx + 1];
  if (!next || next.startsWith("--"))
    return { found: true };
  return { found: true, value: next };
}
function readFirstPositionalArg(args) {
  for (let i = 0;i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--name" || arg === "--hostname" || arg === "--port") {
      i += 1;
      continue;
    }
    if (arg.startsWith("--name=") || arg.startsWith("--hostname=") || arg.startsWith("--port=")) {
      continue;
    }
    if (!arg.startsWith("--"))
      return arg;
  }
  return;
}
function parseLocalProcessOptions(args, opts = {}) {
  const out = {};
  const name = readOptionValue(args, "--name");
  if (name.found)
    out.name = name.value ?? "default";
  else if (opts.allowPositionalName) {
    out.name = readFirstPositionalArg(args) ?? opts.defaultNameWhenMissing;
  } else if (opts.defaultNameWhenMissing != null) {
    out.name = opts.defaultNameWhenMissing;
  }
  const hostname = readOptionValue(args, "--hostname");
  if (hostname.found)
    out.hostname = hostname.value ?? "127.0.0.1";
  else if (opts.defaultHostnameWhenMissing != null)
    out.hostname = opts.defaultHostnameWhenMissing;
  const port = readOptionValue(args, "--port");
  if (port.found)
    out.port = parsePortValue(port.value ?? "0");
  else if (opts.defaultPortWhenMissing != null)
    out.port = opts.defaultPortWhenMissing;
  return out;
}
function parsePortValue(raw, flag = "--port") {
  const port = Number(raw);
  if (!Number.isFinite(port) || port < 0) {
    throw dsError(`invalid ${flag}: ${raw}`);
  }
  return Math.floor(port);
}

// src/app_core.ts
import { mkdirSync as mkdirSync2 } from "node:fs";
import { createHash as createHash6 } from "node:crypto";

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
import { createRequire as createRequire2 } from "node:module";

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
function getSqliteAdapterRuntimeCounts() {
  return { ...sqliteAdapterRuntimeCounts };
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
var require2 = createRequire2(import.meta.url);
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

// src/ingest.ts
import { Result as Result2 } from "better-result";

class IngestQueue {
  cfg;
  db;
  stats;
  gate;
  metrics;
  q = [];
  timer = null;
  scheduled = false;
  queuedBytes = 0;
  lastBacklogWarnMs = 0;
  stmts;
  constructor(cfg, db, stats, gate, metrics) {
    this.cfg = cfg;
    this.db = db;
    this.stats = stats;
    this.gate = gate;
    this.metrics = metrics;
    this.stmts = {
      getStream: this.db.db.query(`SELECT stream, epoch, next_offset, last_append_ms, expires_at_ms, stream_flags,
                content_type, stream_seq, closed, closed_producer_id, closed_producer_epoch, closed_producer_seq
         FROM streams WHERE stream=? LIMIT 1;`),
      insertWal: this.db.db.query(`INSERT INTO wal(stream, offset, ts_ms, payload, payload_len, routing_key, content_type, flags)
         VALUES(?, ?, ?, ?, ?, ?, ?, ?);`),
      updateStreamAppend: this.db.db.query(`UPDATE streams
         SET next_offset=?, updated_at_ms=?, last_append_ms=?,
             pending_rows=pending_rows+?, pending_bytes=pending_bytes+?,
             logical_size_bytes=logical_size_bytes+?,
             wal_rows=wal_rows+?, wal_bytes=wal_bytes+?,
             stream_seq=?,
             closed=CASE WHEN ? THEN 1 ELSE closed END,
             closed_producer_id=CASE WHEN ? THEN ? ELSE closed_producer_id END,
             closed_producer_epoch=CASE WHEN ? THEN ? ELSE closed_producer_epoch END,
             closed_producer_seq=CASE WHEN ? THEN ? ELSE closed_producer_seq END
         WHERE stream=? AND (stream_flags & ?) = 0;`),
      updateStreamCloseOnly: this.db.db.query(`UPDATE streams
         SET closed=1,
             closed_producer_id=?,
             closed_producer_epoch=?,
             closed_producer_seq=?,
             updated_at_ms=?,
             stream_seq=?
         WHERE stream=? AND (stream_flags & ?) = 0;`),
      getProducerState: this.db.db.query(`SELECT epoch, last_seq FROM producer_state WHERE stream=? AND producer_id=? LIMIT 1;`),
      upsertProducerState: this.db.db.query(`INSERT INTO producer_state(stream, producer_id, epoch, last_seq, updated_at_ms)
         VALUES(?, ?, ?, ?, ?)
         ON CONFLICT(stream, producer_id) DO UPDATE SET
           epoch=excluded.epoch,
           last_seq=excluded.last_seq,
           updated_at_ms=excluded.updated_at_ms;`)
    };
    this.timer = setInterval(() => {
      this.flush();
    }, this.cfg.ingestFlushIntervalMs);
  }
  stop() {
    if (this.timer)
      clearInterval(this.timer);
    this.timer = null;
  }
  append(args, opts) {
    const bytes = args.rows.reduce((acc, r) => acc + r.payload.byteLength, 0);
    if (!opts?.bypassBackpressure) {
      if (this.q.length >= this.cfg.ingestMaxQueueRequests || this.queuedBytes + bytes > this.cfg.ingestMaxQueueBytes) {
        if (this.metrics)
          this.metrics.record("tieredstore.backpressure.over_limit", 1, "count", { reason: "queue" });
        return Promise.resolve(Result2.err({ kind: "overloaded" }));
      }
      if (this.gate && !this.gate.reserve(bytes)) {
        if (this.metrics)
          this.metrics.record("tieredstore.backpressure.over_limit", 1, "count", { reason: "backlog" });
        this.warnBacklog();
        return Promise.resolve(Result2.err({ kind: "overloaded" }));
      }
    }
    this.queuedBytes += bytes;
    return new Promise((resolve) => {
      const task = {
        stream: args.stream,
        baseAppendMs: args.baseAppendMs,
        rows: args.rows,
        contentType: args.contentType ?? null,
        streamSeq: args.streamSeq ?? null,
        producer: args.producer ?? null,
        close: args.close ?? false,
        reservedBytes: opts?.bypassBackpressure ? 0 : bytes,
        enqueuedAtMs: this.stats ? Date.now() : undefined,
        resolve
      };
      if (opts?.priority === "high")
        this.q.unshift(task);
      else
        this.q.push(task);
      if (!this.scheduled && this.q.length >= this.cfg.ingestMaxBatchRequests) {
        this.scheduled = true;
        setTimeout(() => {
          this.scheduled = false;
          this.flush();
        }, 0);
      }
    });
  }
  appendInternal(args) {
    return this.append(args, { bypassBackpressure: true, priority: "high" });
  }
  getQueueStats() {
    return { requests: this.q.length, bytes: this.queuedBytes };
  }
  getMemoryStats() {
    return {
      queuedPayloadBytes: this.queuedBytes,
      queuedRequests: this.q.length
    };
  }
  isQueueFull() {
    return this.q.length >= this.cfg.ingestMaxQueueRequests || this.queuedBytes >= this.cfg.ingestMaxQueueBytes;
  }
  warnBacklog() {
    if (!this.gate)
      return;
    const now = Date.now();
    if (now - this.lastBacklogWarnMs < 1e4)
      return;
    this.lastBacklogWarnMs = now;
    const current = this.gate.getCurrentBytes();
    const max = this.gate.getMaxBytes();
    const msg = `[backpressure] local backlog ${formatBytes(current)} exceeds limit ${formatBytes(max)}; rejecting appends (DS_LOCAL_BACKLOG_MAX_BYTES)`;
    console.warn(msg);
  }
  async flush() {
    if (this.q.length === 0)
      return;
    const flushStartMs = Date.now();
    let busyWaitMs = 0;
    const batch = [];
    let batchBytes = 0;
    let batchReservedBytes = 0;
    let drainCount = 0;
    while (drainCount < this.q.length && batch.length < this.cfg.ingestMaxBatchRequests && batchBytes < this.cfg.ingestMaxBatchBytes) {
      const t = this.q[drainCount];
      batch.push(t);
      drainCount += 1;
      for (const r of t.rows)
        batchBytes += r.payload.byteLength;
      batchReservedBytes += t.reservedBytes;
    }
    if (drainCount > 0) {
      this.q.splice(0, drainCount);
    }
    this.queuedBytes = Math.max(0, this.queuedBytes - batchBytes);
    let bpOverMs = 0;
    if (this.stats) {
      const budgetMs = this.stats.getBackpressureBudgetMs();
      const nowMs2 = Date.now();
      for (const t of batch) {
        if (t.enqueuedAtMs == null)
          continue;
        const waitMs = Math.max(0, nowMs2 - t.enqueuedAtMs);
        if (waitMs > budgetMs) {
          bpOverMs += waitMs - budgetMs;
        }
      }
    }
    const nowMs = this.db.nowMs();
    let perStream = new Map;
    let perProducer = new Map;
    let walBytesCommitted = 0;
    let results = [];
    const resetAttempt = () => {
      perStream = new Map;
      perProducer = new Map;
      walBytesCommitted = 0;
      results = new Array(batch.length);
    };
    const tx = this.db.db.transaction(() => {
      const loadStream = (stream) => {
        const cached = perStream.get(stream);
        if (cached)
          return cached;
        const row = this.stmts.getStream.get(stream);
        if (!row || (Number(row.stream_flags) & STREAM_FLAG_DELETED) !== 0)
          return null;
        const st = {
          epoch: Number(row.epoch),
          nextOffset: BigInt(row.next_offset),
          lastAppendMs: BigInt(row.last_append_ms),
          expiresAtMs: row.expires_at_ms == null ? null : BigInt(row.expires_at_ms),
          streamFlags: Number(row.stream_flags),
          contentType: String(row.content_type),
          streamSeq: row.stream_seq == null ? null : String(row.stream_seq),
          closed: Number(row.closed) !== 0,
          closedProducerId: row.closed_producer_id == null ? null : String(row.closed_producer_id),
          closedProducerEpoch: row.closed_producer_epoch == null ? null : Number(row.closed_producer_epoch),
          closedProducerSeq: row.closed_producer_seq == null ? null : Number(row.closed_producer_seq)
        };
        perStream.set(stream, st);
        return st;
      };
      const loadProducerState = (stream, producerId) => {
        const key = `${stream}\x00${producerId}`;
        if (perProducer.has(key))
          return perProducer.get(key);
        const row = this.stmts.getProducerState.get(stream, producerId);
        const state = row ? { epoch: Number(row.epoch), lastSeq: Number(row.last_seq) } : null;
        perProducer.set(key, state);
        return state;
      };
      const checkProducer = (task) => {
        const producer = task.producer;
        const key = `${task.stream}\x00${producer.id}`;
        const state = loadProducerState(task.stream, producer.id);
        if (!state) {
          if (producer.seq !== 0) {
            return Result2.err({ kind: "producer_epoch_seq" });
          }
          const next = { epoch: producer.epoch, lastSeq: producer.seq };
          perProducer.set(key, next);
          return Result2.ok({ duplicate: false, update: true, epoch: producer.epoch, seq: producer.seq });
        }
        if (producer.epoch < state.epoch) {
          return Result2.err({ kind: "producer_stale_epoch", producerEpoch: state.epoch });
        }
        if (producer.epoch > state.epoch) {
          if (producer.seq !== 0) {
            return Result2.err({ kind: "producer_epoch_seq" });
          }
          const next = { epoch: producer.epoch, lastSeq: producer.seq };
          perProducer.set(key, next);
          return Result2.ok({ duplicate: false, update: true, epoch: producer.epoch, seq: producer.seq });
        }
        if (producer.seq <= state.lastSeq) {
          return Result2.ok({ duplicate: true, update: false, epoch: state.epoch, seq: state.lastSeq });
        }
        if (producer.seq === state.lastSeq + 1) {
          const next = { epoch: state.epoch, lastSeq: producer.seq };
          perProducer.set(key, next);
          return Result2.ok({ duplicate: false, update: true, epoch: state.epoch, seq: producer.seq });
        }
        return Result2.err({ kind: "producer_gap", expected: state.lastSeq + 1, received: producer.seq });
      };
      const checkStreamSeq = (task, st) => {
        if (task.streamSeq == null)
          return Result2.ok({ nextSeq: st.streamSeq });
        if (st.streamSeq != null && task.streamSeq <= st.streamSeq) {
          return Result2.err({
            kind: "stream_seq",
            expected: st.streamSeq,
            received: task.streamSeq
          });
        }
        return Result2.ok({ nextSeq: task.streamSeq });
      };
      for (let idx = 0;idx < batch.length; idx++) {
        const task = batch[idx];
        const st = loadStream(task.stream);
        if (!st) {
          results[idx] = Result2.err({ kind: "not_found" });
          continue;
        }
        if (st.expiresAtMs != null && nowMs > st.expiresAtMs) {
          results[idx] = Result2.err({ kind: "gone" });
          continue;
        }
        const tailOffset = st.nextOffset - 1n;
        const isCloseOnly = task.close && task.rows.length === 0;
        if (st.closed) {
          if (isCloseOnly) {
            results[idx] = Result2.ok({
              lastOffset: tailOffset,
              appendedRows: 0,
              closed: true,
              duplicate: true
            });
            continue;
          }
          if (task.producer && task.close && st.closedProducerId != null && st.closedProducerEpoch != null && st.closedProducerSeq != null && st.closedProducerId === task.producer.id && st.closedProducerEpoch === task.producer.epoch && st.closedProducerSeq === task.producer.seq) {
            results[idx] = Result2.ok({
              lastOffset: tailOffset,
              appendedRows: 0,
              closed: true,
              duplicate: true,
              producer: { epoch: st.closedProducerEpoch, seq: st.closedProducerSeq }
            });
            continue;
          }
          results[idx] = Result2.err({ kind: "closed", lastOffset: tailOffset });
          continue;
        }
        if (isCloseOnly) {
          let producerInfo2;
          let duplicate = false;
          if (task.producer) {
            const prodCheck = checkProducer(task);
            if (Result2.isError(prodCheck)) {
              results[idx] = Result2.err(prodCheck.error);
              continue;
            }
            duplicate = prodCheck.value.duplicate;
            producerInfo2 = { epoch: prodCheck.value.epoch, seq: prodCheck.value.seq };
            if (prodCheck.value.update) {
              this.stmts.upsertProducerState.run(task.stream, task.producer.id, prodCheck.value.epoch, prodCheck.value.seq, nowMs);
            }
          }
          if (!duplicate) {
            const seqCheck2 = checkStreamSeq(task, st);
            if (Result2.isError(seqCheck2)) {
              results[idx] = Result2.err(seqCheck2.error);
              continue;
            }
            st.streamSeq = seqCheck2.value.nextSeq;
            const closedProducer2 = task.producer ?? null;
            this.stmts.updateStreamCloseOnly.run(closedProducer2 ? closedProducer2.id : null, closedProducer2 ? closedProducer2.epoch : null, closedProducer2 ? closedProducer2.seq : null, nowMs, st.streamSeq, task.stream, STREAM_FLAG_DELETED);
            st.closed = true;
            st.closedProducerId = closedProducer2 ? closedProducer2.id : null;
            st.closedProducerEpoch = closedProducer2 ? closedProducer2.epoch : null;
            st.closedProducerSeq = closedProducer2 ? closedProducer2.seq : null;
          }
          results[idx] = Result2.ok({
            lastOffset: tailOffset,
            appendedRows: 0,
            closed: st.closed,
            duplicate,
            producer: producerInfo2
          });
          continue;
        }
        if (!task.contentType || task.contentType !== st.contentType) {
          results[idx] = Result2.err({ kind: "content_type_mismatch" });
          continue;
        }
        let producerInfo;
        if (task.producer) {
          const prodCheck = checkProducer(task);
          if (Result2.isError(prodCheck)) {
            results[idx] = Result2.err(prodCheck.error);
            continue;
          }
          if (prodCheck.value.duplicate) {
            results[idx] = Result2.ok({
              lastOffset: tailOffset,
              appendedRows: 0,
              closed: false,
              duplicate: true,
              producer: { epoch: prodCheck.value.epoch, seq: prodCheck.value.seq }
            });
            continue;
          }
          producerInfo = { epoch: prodCheck.value.epoch, seq: prodCheck.value.seq };
          if (prodCheck.value.update) {
            this.stmts.upsertProducerState.run(task.stream, task.producer.id, prodCheck.value.epoch, prodCheck.value.seq, nowMs);
          }
        }
        const seqCheck = checkStreamSeq(task, st);
        if (Result2.isError(seqCheck)) {
          results[idx] = Result2.err(seqCheck.error);
          continue;
        }
        st.streamSeq = seqCheck.value.nextSeq;
        let appendMs = task.baseAppendMs;
        if (appendMs <= st.lastAppendMs)
          appendMs = st.lastAppendMs + 1n;
        let offset = st.nextOffset;
        let totalBytes = 0n;
        for (let i = 0;i < task.rows.length; i++) {
          const r = task.rows[i];
          const rowAppendMs = appendMs;
          const payloadLen = r.payload.byteLength;
          totalBytes += BigInt(payloadLen);
          this.stmts.insertWal.run(task.stream, offset, rowAppendMs, r.payload, payloadLen, r.routingKey, r.contentType, 0);
          offset += 1n;
        }
        const lastOffset = offset - 1n;
        st.nextOffset = offset;
        st.lastAppendMs = appendMs;
        if (task.close) {
          st.closed = true;
          if (task.producer) {
            st.closedProducerId = task.producer.id;
            st.closedProducerEpoch = task.producer.epoch;
            st.closedProducerSeq = task.producer.seq;
          } else {
            st.closedProducerId = null;
            st.closedProducerEpoch = null;
            st.closedProducerSeq = null;
          }
        }
        const closedProducer = task.close && task.producer ? task.producer : null;
        const closeFlag = task.close ? 1 : 0;
        this.stmts.updateStreamAppend.run(st.nextOffset, nowMs, st.lastAppendMs, BigInt(task.rows.length), totalBytes, totalBytes, BigInt(task.rows.length), totalBytes, st.streamSeq, closeFlag, closeFlag, closedProducer ? closedProducer.id : null, closeFlag, closedProducer ? closedProducer.epoch : null, closeFlag, closedProducer ? closedProducer.seq : null, task.stream, STREAM_FLAG_DELETED);
        walBytesCommitted += Number(totalBytes);
        results[idx] = Result2.ok({
          lastOffset,
          appendedRows: task.rows.length,
          closed: task.close,
          duplicate: false,
          producer: producerInfo
        });
      }
    });
    const isSqliteBusy = (e) => {
      const code = String(e?.code ?? "");
      const errno = Number(e?.errno ?? -1);
      return code === "SQLITE_BUSY" || code === "SQLITE_BUSY_SNAPSHOT" || errno === 5 || errno === 517;
    };
    const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
    try {
      const maxBusyMs = Math.max(0, this.cfg.ingestBusyTimeoutMs);
      const startMs = Date.now();
      let attempt = 0;
      while (true) {
        resetAttempt();
        try {
          tx();
          break;
        } catch (e) {
          if (!isSqliteBusy(e))
            throw e;
          if (maxBusyMs <= 0)
            throw e;
          const elapsed = Date.now() - startMs;
          if (elapsed >= maxBusyMs)
            throw e;
          const delay = Math.min(200, 5 * 2 ** attempt);
          attempt += 1;
          busyWaitMs += delay;
          await sleep(delay);
        }
      }
      if (this.gate) {
        const reservedCommitted = Math.min(batchReservedBytes, walBytesCommitted);
        this.gate.commit(walBytesCommitted, reservedCommitted);
        const extra = batchReservedBytes - walBytesCommitted;
        if (extra > 0)
          this.gate.release(extra);
      }
      if (this.stats && walBytesCommitted > 0)
        this.stats.recordWalCommitBytes(walBytesCommitted);
      if (this.stats && bpOverMs > 0)
        this.stats.recordBackpressureOverMs(bpOverMs);
      for (let i = 0;i < batch.length; i++)
        batch[i].resolve(results[i] ?? Result2.err({ kind: "internal" }));
      const elapsedNs = (Date.now() - flushStartMs) * 1e6;
      if (this.metrics) {
        this.metrics.record("tieredstore.ingest.flush.latency", elapsedNs, "ns");
        if (busyWaitMs > 0)
          this.metrics.record("tieredstore.ingest.sqlite_busy.wait", busyWaitMs * 1e6, "ns");
      }
    } catch (e) {
      console.error("ingest tx failed", e);
      if (this.gate && batchReservedBytes > 0)
        this.gate.release(batchReservedBytes);
      for (const t of batch)
        t.resolve(Result2.err({ kind: "internal" }));
      const elapsedNs = (Date.now() - flushStartMs) * 1e6;
      if (this.metrics) {
        this.metrics.record("tieredstore.ingest.flush.latency", elapsedNs, "ns");
        if (busyWaitMs > 0)
          this.metrics.record("tieredstore.ingest.sqlite_busy.wait", busyWaitMs * 1e6, "ns");
      }
    }
  }
}
function formatBytes(bytes) {
  const units = ["b", "kb", "mb", "gb"];
  let value = Math.max(0, bytes);
  let idx = 0;
  while (value >= 1024 && idx < units.length - 1) {
    value /= 1024;
    idx += 1;
  }
  const digits = idx === 0 ? 0 : 1;
  return `${value.toFixed(digits)}${units[idx]}`;
}

// src/notifier.ts
class StreamNotifier {
  waiters = new Map;
  latestSeq = new Map;
  detailsWaiters = new Map;
  detailsVersion = new Map;
  notify(stream, newEndSeq) {
    this.latestSeq.set(stream, newEndSeq);
    const set = this.waiters.get(stream);
    if (!set || set.size === 0)
      return;
    for (const w of Array.from(set)) {
      if (newEndSeq > w.afterSeq) {
        set.delete(w);
        w.resolve();
      }
    }
    if (set.size === 0)
      this.waiters.delete(stream);
  }
  waitFor(stream, afterSeq, timeoutMs, signal) {
    if (signal?.aborted)
      return Promise.resolve();
    const latest = this.latestSeq.get(stream);
    if (latest != null && latest > afterSeq)
      return Promise.resolve();
    return new Promise((resolve) => {
      let done = false;
      const set = this.waiters.get(stream) ?? new Set;
      const cleanup = () => {
        if (done)
          return;
        done = true;
        const s = this.waiters.get(stream);
        if (s) {
          s.delete(waiter);
          if (s.size === 0)
            this.waiters.delete(stream);
        }
        if (timeoutId)
          clearTimeout(timeoutId);
        if (signal)
          signal.removeEventListener("abort", onAbort);
        resolve();
      };
      const waiter = { afterSeq, resolve: cleanup };
      set.add(waiter);
      this.waiters.set(stream, set);
      const onAbort = () => cleanup();
      if (signal)
        signal.addEventListener("abort", onAbort, { once: true });
      let timeoutId = null;
      if (timeoutMs > 0) {
        timeoutId = setTimeout(() => {
          cleanup();
        }, timeoutMs);
      }
    });
  }
  currentDetailsVersion(stream) {
    return this.detailsVersion.get(stream) ?? 0n;
  }
  notifyDetailsChanged(stream) {
    const nextVersion = (this.detailsVersion.get(stream) ?? 0n) + 1n;
    this.detailsVersion.set(stream, nextVersion);
    const set = this.detailsWaiters.get(stream);
    if (!set || set.size === 0)
      return;
    for (const w of Array.from(set)) {
      if (nextVersion > w.afterVersion) {
        set.delete(w);
        w.resolve();
      }
    }
    if (set.size === 0)
      this.detailsWaiters.delete(stream);
  }
  waitForDetailsChange(stream, afterVersion, timeoutMs, signal) {
    if (signal?.aborted)
      return Promise.resolve();
    const latest = this.detailsVersion.get(stream);
    if (latest != null && latest > afterVersion)
      return Promise.resolve();
    return new Promise((resolve) => {
      let done = false;
      const set = this.detailsWaiters.get(stream) ?? new Set;
      const cleanup = () => {
        if (done)
          return;
        done = true;
        const s = this.detailsWaiters.get(stream);
        if (s) {
          s.delete(waiter);
          if (s.size === 0)
            this.detailsWaiters.delete(stream);
        }
        if (timeoutId)
          clearTimeout(timeoutId);
        if (signal)
          signal.removeEventListener("abort", onAbort);
        resolve();
      };
      const waiter = { afterVersion, resolve: cleanup };
      set.add(waiter);
      this.detailsWaiters.set(stream, set);
      const onAbort = () => cleanup();
      if (signal)
        signal.addEventListener("abort", onAbort, { once: true });
      let timeoutId = null;
      if (timeoutMs > 0) {
        timeoutId = setTimeout(() => {
          cleanup();
        }, timeoutMs);
      }
    });
  }
  notifyClose(stream) {
    const set = this.waiters.get(stream);
    if (set && set.size > 0) {
      for (const w of Array.from(set)) {
        set.delete(w);
        w.resolve();
      }
      if (set.size === 0)
        this.waiters.delete(stream);
    }
    const detailsSet = this.detailsWaiters.get(stream);
    if (detailsSet && detailsSet.size > 0) {
      for (const w of Array.from(detailsSet)) {
        detailsSet.delete(w);
        w.resolve();
      }
      if (detailsSet.size === 0)
        this.detailsWaiters.delete(stream);
    }
  }
  getMemoryStats() {
    let waiters = 0;
    for (const set of this.waiters.values())
      waiters += set.size;
    let detailsWaiters = 0;
    for (const set of this.detailsWaiters.values())
      detailsWaiters += set.size;
    return {
      waiterStreams: this.waiters.size,
      waiters,
      latestSeqStreams: this.latestSeq.size,
      detailsWaiterStreams: this.detailsWaiters.size,
      detailsWaiters,
      detailsVersionStreams: this.detailsVersion.size
    };
  }
  getTopStreams(limit = 5) {
    const totals = new Map;
    for (const [stream, waiters] of this.waiters) {
      const row = totals.get(stream) ?? { stream, waiters: 0, details_waiters: 0, total_waiters: 0 };
      row.waiters = waiters.size;
      row.total_waiters = row.waiters + row.details_waiters;
      totals.set(stream, row);
    }
    for (const [stream, detailsWaiters] of this.detailsWaiters) {
      const row = totals.get(stream) ?? { stream, waiters: 0, details_waiters: 0, total_waiters: 0 };
      row.details_waiters = detailsWaiters.size;
      row.total_waiters = row.waiters + row.details_waiters;
      totals.set(stream, row);
    }
    return Array.from(totals.values()).sort((a, b) => b.total_waiters - a.total_waiters || a.stream.localeCompare(b.stream)).slice(0, Math.max(0, Math.floor(limit)));
  }
}

// src/util/base32_crockford.ts
import { Result as Result3 } from "better-result";
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
  return Result3.err({ kind: "invalid_base32", message });
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
  return Result3.ok(out);
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
  return Result3.ok(out);
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
function readU64BE(src, offset) {
  const dv = new DataView(src.buffer, src.byteOffset, src.byteLength);
  return dv.getBigUint64(offset, false);
}

// src/offset.ts
import { Result as Result4 } from "better-result";
var DEFAULT_EPOCH = 0;
function parseOffsetResult(input) {
  if (input == null || input === "") {
    return Result4.err({ kind: "invalid_offset", message: "missing offset" });
  }
  if (input === "-1")
    return Result4.ok({ kind: "start" });
  if (input.length !== 26) {
    return Result4.err({ kind: "invalid_offset", message: `invalid offset length: ${input.length}` });
  }
  const bytesRes = decodeCrockfordBase32Fixed26Result(input);
  if (Result4.isError(bytesRes))
    return Result4.err({ kind: "invalid_offset", message: bytesRes.error.message });
  const bytes = bytesRes.value;
  const epoch = readU32BE(bytes, 0);
  const hi = readU32BE(bytes, 4);
  const lo = readU32BE(bytes, 8);
  const inBlock = readU32BE(bytes, 12);
  const rawSeq = BigInt(hi) << 32n | BigInt(lo);
  const seq = rawSeq - 1n;
  return Result4.ok({ kind: "seq", epoch, seq, inBlock });
}
function parseOffset(input) {
  const res = parseOffsetResult(input);
  if (Result4.isError(res))
    throw dsError(res.error.message);
  return res.value;
}
function encodeOffsetResult(epoch, seq, inBlock = 0) {
  if (seq < -1n)
    return Result4.err({ kind: "invalid_offset", message: "invalid offset" });
  const bytes = new Uint8Array(16);
  writeU32BE(bytes, 0, epoch >>> 0);
  const rawSeq = seq + 1n;
  const hi = Number(rawSeq >> 32n & 0xffffffffn);
  const lo = Number(rawSeq & 0xffffffffn);
  writeU32BE(bytes, 4, hi);
  writeU32BE(bytes, 8, lo);
  writeU32BE(bytes, 12, inBlock >>> 0);
  const encodedRes = encodeCrockfordBase32Fixed26Result(bytes);
  if (Result4.isError(encodedRes))
    return Result4.err({ kind: "invalid_offset", message: encodedRes.error.message });
  return Result4.ok(encodedRes.value);
}
function encodeOffset(epoch, seq, inBlock = 0) {
  const res = encodeOffsetResult(epoch, seq, inBlock);
  if (Result4.isError(res))
    throw dsError(res.error.message);
  return res.value;
}
function canonicalizeOffset(input) {
  const p = parseOffset(input);
  if (p.kind === "start")
    return encodeOffset(DEFAULT_EPOCH, -1n, 0);
  return encodeOffset(p.epoch, p.seq, p.inBlock);
}
function offsetToSeqOrNeg1(p) {
  return p.kind === "start" ? -1n : p.seq;
}

// src/util/duration.ts
import { Result as Result5 } from "better-result";
function parseDurationMsResult(s) {
  const m = /^([0-9]+)(ms|s|m|h|d)$/.exec(s.trim());
  if (!m)
    return Result5.err({ kind: "invalid_duration", message: `invalid duration: ${s}` });
  const n = Number(m[1]);
  const unit = m[2];
  switch (unit) {
    case "ms":
      return Result5.ok(n);
    case "s":
      return Result5.ok(n * 1000);
    case "m":
      return Result5.ok(n * 60 * 1000);
    case "h":
      return Result5.ok(n * 60 * 60 * 1000);
    case "d":
      return Result5.ok(n * 24 * 60 * 60 * 1000);
    default:
      return Result5.err({ kind: "invalid_duration", message: `invalid unit: ${unit}` });
  }
}

// src/profiles/metrics/normalize.ts
import { Result as Result7 } from "better-result";

// src/profiles/profile.ts
import { Result as Result6 } from "better-result";
var STREAM_PROFILE_API_VERSION = "durable.streams/profile/v1";
var DEFAULT_STREAM_PROFILE = "generic";
function isPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function expectPlainObjectResult(value, path) {
  if (!isPlainObject(value))
    return Result6.err({ message: `${path} must be an object` });
  return Result6.ok(value);
}
function rejectUnknownKeysResult(obj, allowed, path) {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(obj)) {
    if (!allowedSet.has(key))
      return Result6.err({ message: `${path}.${key} is not supported` });
  }
  return Result6.ok(undefined);
}
function normalizeProfileContentType(value) {
  if (!value)
    return null;
  const base = value.split(";")[0]?.trim().toLowerCase();
  return base ? base : null;
}
function parseStoredProfileJsonResult(raw) {
  try {
    return Result6.ok(JSON.parse(raw));
  } catch (e) {
    return Result6.err({ message: String(e?.message ?? e) });
  }
}
function readProfileKindResult(raw, path = "profile") {
  const objRes = expectPlainObjectResult(raw, path);
  if (Result6.isError(objRes))
    return objRes;
  const kind = typeof objRes.value.kind === "string" ? objRes.value.kind.trim() : "";
  if (kind !== "")
    return Result6.ok(kind);
  return Result6.err({ message: `${path}.kind must be a non-empty string` });
}
function parseProfileUpdateEnvelopeResult(body) {
  const bodyRes = expectPlainObjectResult(body, "profile update");
  if (Result6.isError(bodyRes)) {
    return Result6.err({ message: "profile update must be a JSON object" });
  }
  const keyCheck = rejectUnknownKeysResult(bodyRes.value, ["apiVersion", "profile"], "profileUpdate");
  if (Result6.isError(keyCheck))
    return keyCheck;
  if (bodyRes.value.apiVersion !== undefined && bodyRes.value.apiVersion !== STREAM_PROFILE_API_VERSION) {
    return Result6.err({ message: "invalid profile apiVersion" });
  }
  if (!Object.prototype.hasOwnProperty.call(bodyRes.value, "profile")) {
    return Result6.err({ message: "missing profile" });
  }
  return Result6.ok(bodyRes.value.profile);
}
function cloneStreamProfileSpec(profile) {
  return structuredClone(profile);
}
function buildStreamProfileResource(profile) {
  return {
    apiVersion: STREAM_PROFILE_API_VERSION,
    profile: cloneStreamProfileSpec(profile)
  };
}

// src/profiles/metrics/normalize.ts
function normalizeString(value) {
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
    return Result7.err({ message: "metrics interval requires count" });
  if (sum == null)
    return Result7.err({ message: "metrics interval requires sum" });
  return Result7.ok({
    count,
    sum,
    min: count === 0 ? null : min ?? 0,
    max: count === 0 ? null : max ?? 0,
    histogram
  });
}
function normalizeMetricsRecordResult(value) {
  const objRes = expectPlainObjectResult(value, "metrics record");
  if (Result7.isError(objRes))
    return objRes;
  const input = objRes.value;
  const kind = normalizeString(input.kind) ?? "interval";
  if (kind !== "interval")
    return Result7.err({ message: "metrics record.kind must be interval" });
  const metric = normalizeString(input.metric);
  if (!metric)
    return Result7.err({ message: "metrics record.metric must be a non-empty string" });
  const unit = normalizeString(input.unit);
  if (!unit)
    return Result7.err({ message: "metrics record.unit must be a non-empty string" });
  const windowStart = normalizeInteger(input.windowStart);
  const windowEnd = normalizeInteger(input.windowEnd);
  if (windowStart == null || windowEnd == null) {
    return Result7.err({ message: "metrics record.windowStart and windowEnd must be integers" });
  }
  if (windowEnd < windowStart)
    return Result7.err({ message: "metrics record.windowEnd must be >= windowStart" });
  const intervalMs = normalizeInteger(input.intervalMs) ?? windowEnd - windowStart;
  if (intervalMs < 0)
    return Result7.err({ message: "metrics record.intervalMs must be >= 0" });
  const metricKind = normalizeString(input.metricKind) ?? "summary";
  const temporality = normalizeString(input.temporality) ?? "delta";
  const stream = normalizeString(input.stream);
  const instance = normalizeString(input.instance);
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
  if (Result7.isError(summaryRes))
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
  return Result7.ok({
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
function materializeMetricsBlockRecord(record) {
  const histogram = record.summary.histogram ?? {};
  const avg = record.summary.count > 0 ? record.summary.sum / record.summary.count : 0;
  return {
    apiVersion: "durable.streams/metrics/v1",
    kind: "interval",
    metric: record.metric,
    unit: record.unit,
    metricKind: record.metricKind,
    temporality: record.temporality,
    windowStart: record.windowStartMs,
    windowEnd: record.windowEndMs,
    intervalMs: record.intervalMs,
    instance: record.instance,
    stream: record.stream,
    tags: { ...record.attributes },
    attributes: { ...record.attributes },
    dimensionPairs: [...record.dimensionPairs],
    dimensionKey: record.dimensionKey,
    seriesKey: record.seriesKey,
    count: record.summary.count,
    sum: record.summary.sum,
    min: record.summary.min,
    max: record.summary.max,
    avg,
    p50: histogramPercentile(histogram, 0.5) ?? 0,
    p95: histogramPercentile(histogram, 0.95) ?? 0,
    p99: histogramPercentile(histogram, 0.99) ?? 0,
    buckets: { ...histogram },
    summary: {
      count: record.summary.count,
      sum: record.summary.sum,
      min: record.summary.min,
      max: record.summary.max,
      histogram: { ...histogram }
    }
  };
}
function buildInternalMetricsRecord(args) {
  const attributes = normalizeAttributes(args.tags);
  const dimensionPairs = buildDimensionPairs(attributes);
  const dimensionKey = dimensionPairs.length > 0 ? dimensionPairs.join("\x00") : null;
  const seriesKey = buildSeriesKey({
    metricKind: "summary",
    temporality: "delta",
    metric: args.metric,
    unit: args.unit,
    stream: args.stream ?? null,
    instance: args.instance,
    dimensionKey
  });
  return {
    apiVersion: "durable.streams/metrics/v1",
    kind: "interval",
    metric: args.metric,
    unit: args.unit,
    metricKind: "summary",
    temporality: "delta",
    windowStart: args.windowStart,
    windowEnd: args.windowEnd,
    intervalMs: args.intervalMs,
    instance: args.instance,
    stream: args.stream ?? null,
    tags: attributes,
    attributes,
    dimensionPairs,
    dimensionKey,
    seriesKey,
    count: args.count,
    sum: args.sum,
    min: args.count === 0 ? null : args.min,
    max: args.count === 0 ? null : args.max,
    avg: args.avg,
    p50: args.p50,
    p95: args.p95,
    p99: args.p99,
    buckets: { ...args.buckets },
    summary: {
      count: args.count,
      sum: args.sum,
      min: args.count === 0 ? null : args.min,
      max: args.count === 0 ? null : args.max,
      histogram: { ...args.buckets }
    }
  };
}

// src/metrics.ts
class Histogram {
  maxSamples;
  samples = [];
  count = 0;
  sum = 0;
  min = Number.POSITIVE_INFINITY;
  max = Number.NEGATIVE_INFINITY;
  buckets = {};
  constructor(maxSamples = 1024) {
    this.maxSamples = maxSamples;
  }
  add(value) {
    this.count++;
    this.sum += value;
    if (value < this.min)
      this.min = value;
    if (value > this.max)
      this.max = value;
    const bucket = Math.floor(Math.log2(Math.max(1, value)));
    const key = String(2 ** bucket);
    this.buckets[key] = (this.buckets[key] ?? 0) + 1;
    if (this.samples.length < this.maxSamples) {
      this.samples.push(value);
    } else {
      const idx = Math.floor(Math.random() * this.count);
      if (idx < this.maxSamples)
        this.samples[idx] = value;
    }
  }
  snapshotAndReset() {
    const count = this.count;
    const sum = this.sum;
    const min = count === 0 ? 0 : this.min;
    const max = count === 0 ? 0 : this.max;
    const avg = count === 0 ? 0 : sum / count;
    const sorted = this.samples.slice().sort((a, b) => a - b);
    const p = (q) => sorted.length === 0 ? 0 : sorted[Math.min(sorted.length - 1, Math.floor(q * (sorted.length - 1)))];
    const p50 = p(0.5);
    const p95 = p(0.95);
    const p99 = p(0.99);
    const buckets = { ...this.buckets };
    this.samples = [];
    this.count = 0;
    this.sum = 0;
    this.min = Number.POSITIVE_INFINITY;
    this.max = Number.NEGATIVE_INFINITY;
    this.buckets = {};
    return { count, sum, min, max, avg, p50, p95, p99, buckets };
  }
}

class MetricSeries {
  metric;
  unit;
  stream;
  tags;
  hist = new Histogram;
  constructor(metric, unit, stream, tags) {
    this.metric = metric;
    this.unit = unit;
    this.stream = stream;
    this.tags = tags;
  }
}
function keyFor(metric, unit, stream, tags) {
  const tagStr = tags ? JSON.stringify(tags) : "";
  return `${metric}|${unit}|${stream ?? ""}|${tagStr}`;
}
function instanceId() {
  const host = typeof process !== "undefined" ? process.pid.toString() : "node";
  const rand = Math.random().toString(16).slice(2, 8);
  return `${host}-${rand}`;
}

class Metrics {
  startMs = Date.now();
  windowStartMs = Date.now();
  series = new Map;
  instance = instanceId();
  record(metric, value, unit, tags, stream) {
    const key = keyFor(metric, unit, stream, tags);
    let s = this.series.get(key);
    if (!s) {
      s = new MetricSeries(metric, unit, stream, tags);
      this.series.set(key, s);
    }
    s.hist.add(value);
  }
  recordAppend(bytes, entries) {
    this.record("tieredstore.append.bytes", bytes, "bytes");
    this.record("tieredstore.append.entries", entries, "count");
  }
  recordRead(bytes, entries) {
    this.record("tieredstore.read.bytes", bytes, "bytes");
    this.record("tieredstore.read.entries", entries, "count");
  }
  snapshot() {
    return {
      uptime_ms: Date.now() - this.startMs,
      series: this.series.size
    };
  }
  getMemoryStats() {
    return { seriesCount: this.series.size };
  }
  flushInterval() {
    const windowEnd = Date.now();
    const intervalMs = windowEnd - this.windowStartMs;
    const events = [];
    for (const s of this.series.values()) {
      const snap = s.hist.snapshotAndReset();
      if (snap.count === 0)
        continue;
      events.push(buildInternalMetricsRecord({
        metric: s.metric,
        unit: s.unit,
        windowStart: this.windowStartMs,
        windowEnd,
        intervalMs,
        instance: this.instance,
        stream: s.stream,
        tags: s.tags,
        ...snap
      }));
    }
    this.windowStartMs = windowEnd;
    return events;
  }
}

// src/util/time.ts
import { Result as Result8 } from "better-result";
function parseTimestampMsResult(input) {
  const s = input.trim();
  if (s === "")
    return Result8.err({ kind: "empty_timestamp", message: "empty timestamp" });
  if (/^[0-9]+$/.test(s)) {
    return Result8.ok(BigInt(s) / 1000000n);
  }
  const d = new Date(s);
  const ms = d.getTime();
  if (Number.isNaN(ms))
    return Result8.err({ kind: "invalid_timestamp", message: `invalid timestamp: ${input}` });
  return Result8.ok(BigInt(ms));
}

// src/util/cleanup.ts
import { existsSync, readdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";
function cleanupTempSegments(rootDir) {
  const base = join(rootDir, "local");
  if (!existsSync(base))
    return;
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile() && entry.name.endsWith(".tmp")) {
        try {
          unlinkSync(full);
        } catch {}
      }
    }
  };
  walk(base);
}

// src/metrics_emitter.ts
import { Result as Result9 } from "better-result";

class MetricsEmitter {
  metrics;
  ingest;
  intervalMs;
  onAppended;
  collectRuntimeMetrics;
  timer = null;
  constructor(metrics, ingest, intervalMs, opts) {
    this.metrics = metrics;
    this.ingest = ingest;
    this.intervalMs = intervalMs;
    this.onAppended = opts?.onAppended;
    this.collectRuntimeMetrics = opts?.collectRuntimeMetrics;
  }
  start() {
    if (this.intervalMs <= 0 || this.timer)
      return;
    this.timer = setInterval(() => {
      this.flush();
    }, this.intervalMs);
  }
  stop() {
    if (this.timer)
      clearInterval(this.timer);
    this.timer = null;
  }
  async flush() {
    const queue = this.ingest.getQueueStats();
    this.metrics.record("tieredstore.ingest.queue.bytes", queue.bytes, "bytes");
    this.metrics.record("tieredstore.ingest.queue.requests", queue.requests, "count");
    this.collectRuntimeMetrics?.();
    const events = this.metrics.flushInterval();
    if (events.length === 0)
      return;
    const rows = events.map((e) => ({
      routingKey: typeof e.seriesKey === "string" ? new TextEncoder().encode(e.seriesKey) : null,
      contentType: "application/json",
      payload: new TextEncoder().encode(JSON.stringify(e))
    }));
    try {
      const appendRes = await this.ingest.appendInternal({
        stream: "__stream_metrics__",
        baseAppendMs: BigInt(Date.now()),
        rows,
        contentType: "application/json"
      });
      if (!Result9.isError(appendRes)) {
        this.onAppended?.({
          lastOffset: appendRes.value.lastOffset,
          stream: "__stream_metrics__"
        });
      }
    } catch {}
  }
}

// src/schema/registry.ts
import Ajv from "ajv";
import { createHash } from "node:crypto";
import { Result as Result13 } from "better-result";

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
import { Result as Result11 } from "better-result";

// src/util/json_pointer.ts
import { Result as Result10 } from "better-result";
function parseJsonPointerResult(ptr) {
  if (ptr === "")
    return Result10.ok([]);
  if (!ptr.startsWith("/"))
    return Result10.err({ kind: "invalid_json_pointer", message: "invalid json pointer" });
  return Result10.ok(ptr.split("/").slice(1).map((seg) => seg.replace(/~1/g, "/").replace(/~0/g, "~")));
}
function isArrayIndex(seg) {
  return seg !== "" && /^[0-9]+$/.test(seg);
}
function getChild(container, seg) {
  if (Array.isArray(container) && isArrayIndex(seg)) {
    return container[Number(seg)];
  }
  if (container && typeof container === "object") {
    return container[seg];
  }
  return;
}
function resolvePointerResult(doc, ptr) {
  const segmentsRes = parseJsonPointerResult(ptr);
  if (Result10.isError(segmentsRes))
    return Result10.err(segmentsRes.error);
  const segments = segmentsRes.value;
  if (segments.length === 0) {
    return Result10.ok({ parent: null, key: null, value: doc, exists: true });
  }
  let cur = doc;
  for (let i = 0;i < segments.length - 1; i++) {
    cur = getChild(cur, segments[i]);
    if (cur === undefined)
      return Result10.ok({ parent: null, key: null, value: undefined, exists: false });
  }
  const key = segments[segments.length - 1];
  const value = cur === undefined ? undefined : getChild(cur, key);
  return Result10.ok({ parent: cur, key, value, exists: value !== undefined });
}

// src/lens/lens.ts
function invalidLensApply(message) {
  return Result11.err({ kind: "invalid_lens_ops", message });
}
function resolveSegments(doc, segments) {
  if (segments.length === 0)
    return { parent: null, key: null, value: doc, exists: true };
  let cur = doc;
  for (let i = 0;i < segments.length - 1; i++) {
    cur = getChild2(cur, segments[i]);
    if (cur === undefined)
      return { parent: null, key: null, value: undefined, exists: false };
  }
  const key = segments[segments.length - 1];
  const value = cur === undefined ? undefined : getChild2(cur, key);
  return { parent: cur, key, value, exists: value !== undefined };
}
function getChild2(container, seg) {
  if (Array.isArray(container)) {
    const idx = Number(seg);
    if (!Number.isInteger(idx))
      return;
    return container[idx];
  }
  if (container && typeof container === "object")
    return container[seg];
  return;
}
function setChildResult(container, seg, value) {
  if (Array.isArray(container)) {
    const idx = Number(seg);
    if (!Number.isInteger(idx) || idx < 0 || idx >= container.length)
      return invalidLensApply("array index out of bounds");
    container[idx] = value;
    return Result11.ok(undefined);
  }
  if (container && typeof container === "object") {
    container[seg] = value;
    return Result11.ok(undefined);
  }
  return invalidLensApply("invalid parent");
}
function deleteChildResult(container, seg) {
  if (Array.isArray(container)) {
    const idx = Number(seg);
    if (!Number.isInteger(idx) || idx < 0 || idx >= container.length)
      return invalidLensApply("array index out of bounds");
    container.splice(idx, 1);
    return Result11.ok(undefined);
  }
  if (container && typeof container === "object") {
    delete container[seg];
    return Result11.ok(undefined);
  }
  return invalidLensApply("invalid parent");
}
function setAtResult(doc, segments, value, opts) {
  if (segments.length === 0)
    return Result11.ok(value);
  let cur = doc;
  for (let i = 0;i < segments.length - 1; i++) {
    const seg = segments[i];
    let next = getChild2(cur, seg);
    if (next === undefined) {
      if (!opts?.createParents)
        return invalidLensApply("missing parent");
      next = {};
      const setRes = setChildResult(cur, seg, next);
      if (Result11.isError(setRes))
        return setRes;
    }
    cur = next;
  }
  const setLeafRes = setChildResult(cur, segments[segments.length - 1], value);
  if (Result11.isError(setLeafRes))
    return setLeafRes;
  return Result11.ok(doc);
}
function deleteAtResult(doc, segments) {
  if (segments.length === 0)
    return invalidLensApply("cannot delete document root");
  let cur = doc;
  for (let i = 0;i < segments.length - 1; i++) {
    cur = getChild2(cur, segments[i]);
    if (cur === undefined)
      return invalidLensApply("missing parent");
  }
  const deleteRes = deleteChildResult(cur, segments[segments.length - 1]);
  if (Result11.isError(deleteRes))
    return deleteRes;
  return Result11.ok(doc);
}
function coerceTypeNameResult(value) {
  if (value === null)
    return Result11.ok("null");
  if (Array.isArray(value))
    return Result11.ok("array");
  switch (typeof value) {
    case "string":
      return Result11.ok("string");
    case "number":
      return Result11.ok(Number.isInteger(value) ? "integer" : "number");
    case "boolean":
      return Result11.ok("boolean");
    case "object":
      return Result11.ok("object");
    default:
      return invalidLensApply("invalid json type");
  }
}
function ensureTypeResult(value, expected) {
  const actualRes = coerceTypeNameResult(value);
  if (Result11.isError(actualRes))
    return actualRes;
  const actual = actualRes.value;
  if (expected === "number" && (actual === "number" || actual === "integer"))
    return Result11.ok(undefined);
  if (actual !== expected)
    return invalidLensApply(`type mismatch: expected ${expected}, got ${actual}`);
  return Result11.ok(undefined);
}
function applyTransformResult(transform, value) {
  if (transform.builtin) {
    const name = transform.builtin;
    return applyBuiltinResult(name, value);
  }
  const t = transform;
  const key = String(value);
  if (Object.prototype.hasOwnProperty.call(t.map, key))
    return Result11.ok(t.map[key]);
  if (Object.prototype.hasOwnProperty.call(t, "default"))
    return Result11.ok(t.default);
  return invalidLensApply("convert map missing key and default");
}
function applyBuiltinResult(name, value) {
  switch (name) {
    case "lowercase":
      if (typeof value !== "string")
        return invalidLensApply("builtin lowercase expects string");
      return Result11.ok(value.toLowerCase());
    case "uppercase":
      if (typeof value !== "string")
        return invalidLensApply("builtin uppercase expects string");
      return Result11.ok(value.toUpperCase());
    case "string_to_int": {
      if (typeof value !== "string")
        return invalidLensApply("builtin string_to_int expects string");
      const n = Number.parseInt(value, 10);
      if (!Number.isFinite(n))
        return invalidLensApply("builtin string_to_int invalid");
      return Result11.ok(n);
    }
    case "int_to_string":
      if (typeof value !== "number" || !Number.isInteger(value))
        return invalidLensApply("builtin int_to_string expects integer");
      return Result11.ok(String(value));
    case "rfc3339_to_unix_millis": {
      if (typeof value !== "string")
        return invalidLensApply("builtin rfc3339_to_unix_millis expects string");
      const ms = new Date(value).getTime();
      if (Number.isNaN(ms))
        return invalidLensApply("builtin rfc3339_to_unix_millis invalid");
      return Result11.ok(ms);
    }
    case "unix_millis_to_rfc3339":
      if (typeof value !== "number" || !Number.isFinite(value))
        return invalidLensApply("builtin unix_millis_to_rfc3339 expects number");
      return Result11.ok(new Date(value).toISOString());
    default:
      return invalidLensApply(`unknown builtin: ${name}`);
  }
}
function compileLensResult(lens) {
  const opsRes = compileOpsResult(lens.ops);
  if (Result11.isError(opsRes))
    return opsRes;
  return Result11.ok({
    schema: lens.schema,
    from: lens.from,
    to: lens.to,
    ops: opsRes.value
  });
}
function invalidLens(message) {
  return Result11.err({ kind: "invalid_lens", message });
}
function parsePointer(pointer, field) {
  const res = parseJsonPointerResult(pointer);
  if (Result11.isError(res))
    return invalidLens(`${field} ${res.error.message}`);
  return Result11.ok(res.value);
}
function compileOpsResult(ops) {
  const compiled = [];
  for (const op of ops) {
    switch (op.op) {
      case "rename": {
        const fromRes = parsePointer(op.from, "rename.from:");
        if (Result11.isError(fromRes))
          return fromRes;
        const toRes = parsePointer(op.to, "rename.to:");
        if (Result11.isError(toRes))
          return toRes;
        compiled.push({ op: "rename", from: fromRes.value, to: toRes.value });
        break;
      }
      case "copy": {
        const fromRes = parsePointer(op.from, "copy.from:");
        if (Result11.isError(fromRes))
          return fromRes;
        const toRes = parsePointer(op.to, "copy.to:");
        if (Result11.isError(toRes))
          return toRes;
        compiled.push({ op: "copy", from: fromRes.value, to: toRes.value });
        break;
      }
      case "add": {
        const pathRes = parsePointer(op.path, "add.path:");
        if (Result11.isError(pathRes))
          return pathRes;
        compiled.push({ op: "add", path: pathRes.value, default: op.default });
        break;
      }
      case "remove": {
        const pathRes = parsePointer(op.path, "remove.path:");
        if (Result11.isError(pathRes))
          return pathRes;
        compiled.push({ op: "remove", path: pathRes.value });
        break;
      }
      case "hoist": {
        const hostRes = parsePointer(op.host, "hoist.host:");
        if (Result11.isError(hostRes))
          return hostRes;
        const toRes = parsePointer(op.to, "hoist.to:");
        if (Result11.isError(toRes))
          return toRes;
        compiled.push({
          op: "hoist",
          host: hostRes.value,
          name: op.name,
          to: toRes.value,
          removeFromHost: op.removeFromHost !== false
        });
        break;
      }
      case "plunge": {
        const fromRes = parsePointer(op.from, "plunge.from:");
        if (Result11.isError(fromRes))
          return fromRes;
        const hostRes = parsePointer(op.host, "plunge.host:");
        if (Result11.isError(hostRes))
          return hostRes;
        compiled.push({
          op: "plunge",
          from: fromRes.value,
          host: hostRes.value,
          name: op.name,
          createHost: op.createHost !== false,
          removeFromSource: op.removeFromSource !== false
        });
        break;
      }
      case "wrap": {
        const pathRes = parsePointer(op.path, "wrap.path:");
        if (Result11.isError(pathRes))
          return pathRes;
        compiled.push({ op: "wrap", path: pathRes.value });
        break;
      }
      case "head": {
        const pathRes = parsePointer(op.path, "head.path:");
        if (Result11.isError(pathRes))
          return pathRes;
        compiled.push({ op: "head", path: pathRes.value });
        break;
      }
      case "convert": {
        const pathRes = parsePointer(op.path, "convert.path:");
        if (Result11.isError(pathRes))
          return pathRes;
        compiled.push({
          op: "convert",
          path: pathRes.value,
          fromType: op.fromType,
          toType: op.toType,
          forward: op.forward
        });
        break;
      }
      case "in": {
        const pathRes = parsePointer(op.path, "in.path:");
        if (Result11.isError(pathRes))
          return pathRes;
        const nestedRes = compileOpsResult(op.ops);
        if (Result11.isError(nestedRes))
          return nestedRes;
        compiled.push({ op: "in", path: pathRes.value, ops: nestedRes.value });
        break;
      }
      case "map": {
        const pathRes = parsePointer(op.path, "map.path:");
        if (Result11.isError(pathRes))
          return pathRes;
        const nestedRes = compileOpsResult(op.ops);
        if (Result11.isError(nestedRes))
          return nestedRes;
        compiled.push({ op: "map", path: pathRes.value, ops: nestedRes.value });
        break;
      }
      default: {
        return invalidLens(`unknown op: ${op.op}`);
      }
    }
  }
  return Result11.ok(compiled);
}
function applyCompiledLensResult(lens, doc) {
  return applyOpsResult(doc, lens.ops);
}
function applyLensChainResult(lenses, doc) {
  let cur = doc;
  for (const l of lenses) {
    const stepRes = applyCompiledLensResult(l, cur);
    if (Result11.isError(stepRes))
      return stepRes;
    cur = stepRes.value;
  }
  return Result11.ok(cur);
}
function applyOpsResult(doc, ops) {
  let root = doc;
  for (const op of ops) {
    switch (op.op) {
      case "rename": {
        const src = resolveSegments(root, op.from);
        if (!src.exists)
          return invalidLensApply("rename missing source");
        const setRes = setAtResult(root, op.to, src.value);
        if (Result11.isError(setRes))
          return setRes;
        const deleteRes = deleteAtResult(setRes.value, op.from);
        if (Result11.isError(deleteRes))
          return deleteRes;
        root = deleteRes.value;
        break;
      }
      case "copy": {
        const src = resolveSegments(root, op.from);
        if (!src.exists)
          return invalidLensApply("copy missing source");
        const setRes = setAtResult(root, op.to, src.value);
        if (Result11.isError(setRes))
          return setRes;
        root = setRes.value;
        break;
      }
      case "add": {
        const setRes = setAtResult(root, op.path, op.default);
        if (Result11.isError(setRes))
          return setRes;
        root = setRes.value;
        break;
      }
      case "remove": {
        const dst = resolveSegments(root, op.path);
        if (!dst.exists)
          return invalidLensApply("remove missing path");
        const deleteRes = deleteAtResult(root, op.path);
        if (Result11.isError(deleteRes))
          return deleteRes;
        root = deleteRes.value;
        break;
      }
      case "hoist": {
        const host = resolveSegments(root, op.host);
        if (!host.exists || !host.value || typeof host.value !== "object" || Array.isArray(host.value)) {
          return invalidLensApply("hoist host missing or not object");
        }
        if (!(op.name in host.value))
          return invalidLensApply("hoist missing name");
        const value = host.value[op.name];
        const setRes = setAtResult(root, op.to, value);
        if (Result11.isError(setRes))
          return setRes;
        root = setRes.value;
        if (op.removeFromHost)
          delete host.value[op.name];
        break;
      }
      case "plunge": {
        const src = resolveSegments(root, op.from);
        if (!src.exists)
          return invalidLensApply("plunge missing source");
        let host = resolveSegments(root, op.host);
        if (!host.exists) {
          if (!op.createHost)
            return invalidLensApply("plunge host missing");
          const setHostRes = setAtResult(root, op.host, {}, { createParents: true });
          if (Result11.isError(setHostRes))
            return setHostRes;
          root = setHostRes.value;
          host = resolveSegments(root, op.host);
        }
        if (!host.value || typeof host.value !== "object" || Array.isArray(host.value)) {
          return invalidLensApply("plunge host not object");
        }
        host.value[op.name] = src.value;
        if (op.removeFromSource) {
          const deleteRes = deleteAtResult(root, op.from);
          if (Result11.isError(deleteRes))
            return deleteRes;
          root = deleteRes.value;
        }
        break;
      }
      case "wrap": {
        const dst = resolveSegments(root, op.path);
        if (!dst.exists)
          return invalidLensApply("wrap missing path");
        const setRes = setAtResult(root, op.path, [dst.value]);
        if (Result11.isError(setRes))
          return setRes;
        root = setRes.value;
        break;
      }
      case "head": {
        const dst = resolveSegments(root, op.path);
        if (!dst.exists)
          return invalidLensApply("head missing path");
        if (!Array.isArray(dst.value) || dst.value.length === 0)
          return invalidLensApply("head expects non-empty array");
        const setRes = setAtResult(root, op.path, dst.value[0]);
        if (Result11.isError(setRes))
          return setRes;
        root = setRes.value;
        break;
      }
      case "convert": {
        const dst = resolveSegments(root, op.path);
        if (!dst.exists)
          return invalidLensApply("convert missing path");
        const ensureFromRes = ensureTypeResult(dst.value, op.fromType);
        if (Result11.isError(ensureFromRes))
          return ensureFromRes;
        const outRes = applyTransformResult(op.forward, dst.value);
        if (Result11.isError(outRes))
          return outRes;
        const ensureToRes = ensureTypeResult(outRes.value, op.toType);
        if (Result11.isError(ensureToRes))
          return ensureToRes;
        const setRes = setAtResult(root, op.path, outRes.value);
        if (Result11.isError(setRes))
          return setRes;
        root = setRes.value;
        break;
      }
      case "in": {
        const dst = resolveSegments(root, op.path);
        if (!dst.exists)
          return invalidLensApply("in missing path");
        if (!dst.value || typeof dst.value !== "object" || Array.isArray(dst.value))
          return invalidLensApply("in expects object");
        const nestedRes = applyOpsResult(dst.value, op.ops);
        if (Result11.isError(nestedRes))
          return nestedRes;
        break;
      }
      case "map": {
        const dst = resolveSegments(root, op.path);
        if (!dst.exists)
          return invalidLensApply("map missing path");
        if (!Array.isArray(dst.value))
          return invalidLensApply("map expects array");
        for (const item of dst.value) {
          const nestedRes = applyOpsResult(item, op.ops);
          if (Result11.isError(nestedRes))
            return nestedRes;
        }
        break;
      }
      default:
        return invalidLensApply(`unknown op: ${op.op}`);
    }
  }
  return Result11.ok(root);
}
function lensFromJson(raw) {
  return raw;
}

// src/schema/proof.ts
import { Result as Result12 } from "better-result";
function invalidLensProof(message) {
  return Result12.err({ kind: "invalid_lens_proof", message });
}
function invalidLensDefaults(message) {
  return Result12.err({ kind: "invalid_lens_defaults", message });
}
function parsePointerResult(ptr, kind) {
  const res = parseJsonPointerResult(ptr);
  if (Result12.isError(res)) {
    return Result12.err({ kind, message: res.error.message });
  }
  return Result12.ok(res.value);
}
function isObjectSchema(schema) {
  if (schema === true)
    return true;
  if (schema === false || schema == null)
    return false;
  const t = schema.type;
  if (t === undefined)
    return true;
  if (Array.isArray(t))
    return t.includes("object");
  return t === "object";
}
function isArraySchema(schema) {
  if (schema === true)
    return true;
  if (schema === false || schema == null)
    return false;
  const t = schema.type;
  if (t === undefined)
    return true;
  if (Array.isArray(t))
    return t.includes("array");
  return t === "array";
}
function getTypeSet(schema) {
  if (schema === true)
    return null;
  if (schema === false || schema == null)
    return new Set;
  if (schema.const !== undefined)
    return new Set([inferType(schema.const)]);
  if (schema.enum)
    return new Set(schema.enum.map((v) => inferType(v)));
  const t = schema.type;
  if (t === undefined)
    return null;
  if (Array.isArray(t))
    return new Set(t);
  return new Set([t]);
}
function inferType(value) {
  if (value === null)
    return "null";
  if (Array.isArray(value))
    return "array";
  switch (typeof value) {
    case "string":
      return "string";
    case "number":
      return Number.isInteger(value) ? "integer" : "number";
    case "boolean":
      return "boolean";
    case "object":
      return "object";
    default:
      return "unknown";
  }
}
function typeSubset(src, dest) {
  if (src === dest)
    return true;
  if (src === "integer" && dest === "number")
    return true;
  return false;
}
function isSchemaCompatible(src, dest) {
  if (dest === true)
    return true;
  if (dest === false || dest == null)
    return false;
  if (src && src.const !== undefined) {
    return valueConformsToSchema(src.const, dest);
  }
  if (src && Array.isArray(src.enum)) {
    return src.enum.every((v) => valueConformsToSchema(v, dest));
  }
  const srcTypes = getTypeSet(src);
  const destTypes = getTypeSet(dest);
  if (srcTypes && destTypes) {
    for (const t of srcTypes) {
      let ok = false;
      for (const d of destTypes) {
        if (typeSubset(t, d)) {
          ok = true;
          break;
        }
      }
      if (!ok)
        return false;
    }
    return true;
  }
  if (dest.const !== undefined || Array.isArray(dest.enum))
    return false;
  return true;
}
function valueConformsToSchema(value, schema) {
  if (schema === true)
    return true;
  if (schema === false || schema == null)
    return false;
  if (schema.const !== undefined)
    return deepEqual(value, schema.const);
  if (Array.isArray(schema.enum))
    return schema.enum.some((v) => deepEqual(v, value));
  const t = getTypeSet(schema);
  if (t) {
    const vt = inferType(value);
    for (const allowed of t) {
      if (typeSubset(vt, allowed))
        return true;
    }
    return false;
  }
  return true;
}
function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}
function getPropertySchema(schema, prop, requireExplicit) {
  if (!schema || schema === false)
    return { schema, required: false, exists: false, explicit: false };
  if (!isObjectSchema(schema))
    return { schema, required: false, exists: false, explicit: false };
  const props = schema.properties ?? {};
  const required = Array.isArray(schema.required) && schema.required.includes(prop);
  if (Object.prototype.hasOwnProperty.call(props, prop)) {
    return { schema: props[prop], required, exists: true, explicit: true };
  }
  if (requireExplicit)
    return { schema, required, exists: false, explicit: false };
  if (schema.additionalProperties === false)
    return { schema, required, exists: false, explicit: false };
  if (schema.additionalProperties && schema.additionalProperties !== true) {
    return { schema: schema.additionalProperties, required, exists: true, explicit: false };
  }
  return { schema: true, required, exists: true, explicit: false };
}
function getItemsSchema(schema) {
  if (!schema || schema === false)
    return schema;
  if (!isArraySchema(schema))
    return schema;
  if (schema.items !== undefined)
    return schema.items;
  return true;
}
function getPathInfo(schema, segments, requireExplicit) {
  if (segments.length === 0)
    return { schema, required: true, exists: true, explicit: true };
  let cur = schema;
  let required = true;
  for (let i = 0;i < segments.length; i++) {
    const seg = segments[i];
    if (/^[0-9]+$/.test(seg)) {
      if (!isArraySchema(cur))
        return { schema: cur, required: false, exists: false, explicit: false };
      cur = getItemsSchema(cur);
      continue;
    }
    const info = getPropertySchema(cur, seg, requireExplicit);
    if (!info.exists)
      return info;
    required = required && info.required;
    cur = info.schema;
  }
  return { schema: cur, required, exists: true, explicit: true };
}
function ensureParentRequiredResult(schema, segments, requireExplicit, kind) {
  if (segments.length === 0)
    return Result12.ok(undefined);
  let cur = schema;
  for (let i = 0;i < segments.length - 1; i++) {
    const seg = segments[i];
    const info = getPropertySchema(cur, seg, requireExplicit);
    if (!info.exists || !info.required) {
      return Result12.err({ kind, message: "parent path not required" });
    }
    if (!isObjectSchema(info.schema)) {
      return Result12.err({ kind, message: "parent path not object" });
    }
    cur = info.schema;
  }
  return Result12.ok(undefined);
}
function isPathRequired(schema, segments) {
  const info = getPathInfo(schema, segments, false);
  return info.exists && info.required;
}
function deriveDefault(schema) {
  if (schema === false || schema == null)
    return;
  if (schema.default !== undefined)
    return schema.default;
  const types = getTypeSet(schema);
  if (types) {
    if (types.has("object"))
      return {};
    if (types.has("array"))
      return [];
  }
  return;
}
function ensureEnumOrConstResult(kind, schema) {
  if (schema && (schema.const !== undefined || Array.isArray(schema.enum)))
    return Result12.ok(undefined);
  return Result12.err({ kind, message: "schema must be enum/const for non-total transform" });
}
function samePointer(a, b) {
  if (a.length !== b.length)
    return false;
  for (let i = 0;i < a.length; i++)
    if (a[i] !== b[i])
      return false;
  return true;
}
function hasWrapAfterResult(ops, pathSeg) {
  for (const op of ops) {
    if (op.op !== "wrap")
      continue;
    const wrapPathRes = parsePointerResult(op.path, "invalid_lens_proof");
    if (Result12.isError(wrapPathRes))
      return wrapPathRes;
    if (samePointer(wrapPathRes.value, pathSeg))
      return Result12.ok(true);
  }
  return Result12.ok(false);
}
function findRenameToResult(priorOps, pathSeg) {
  for (let i = priorOps.length - 1;i >= 0; i--) {
    const op = priorOps[i];
    if (op.op !== "rename")
      continue;
    const toRes = parsePointerResult(op.to, "invalid_lens_proof");
    if (Result12.isError(toRes))
      return toRes;
    if (samePointer(toRes.value, pathSeg))
      return Result12.ok(op);
  }
  return Result12.ok(null);
}
function validateOpResult(oldSchema, newSchema, op, priorOps, remainingOps) {
  switch (op.op) {
    case "rename": {
      const fromSegRes = parsePointerResult(op.from, "invalid_lens_proof");
      if (Result12.isError(fromSegRes))
        return fromSegRes;
      const toSegRes = parsePointerResult(op.to, "invalid_lens_proof");
      if (Result12.isError(toSegRes))
        return toSegRes;
      const fromSeg = fromSegRes.value;
      const toSeg = toSegRes.value;
      const src = getPathInfo(oldSchema, fromSeg, false);
      if (!src.exists || !src.required)
        return invalidLensProof("rename source not required");
      const parentRes = ensureParentRequiredResult(oldSchema, toSeg, false, "invalid_lens_proof");
      if (Result12.isError(parentRes))
        return parentRes;
      const dest = getPathInfo(newSchema, toSeg, false);
      if (!dest.exists)
        return invalidLensProof("rename dest missing in new schema");
      if (!isSchemaCompatible(src.schema, dest.schema)) {
        if (isArraySchema(dest.schema)) {
          const hasWrapRes = hasWrapAfterResult(remainingOps, toSeg);
          if (Result12.isError(hasWrapRes))
            return hasWrapRes;
          if (hasWrapRes.value) {
            const items = getItemsSchema(dest.schema);
            if (!isSchemaCompatible(src.schema, items)) {
              return invalidLensProof("rename schema incompatible");
            }
            return Result12.ok(undefined);
          }
        }
        return invalidLensProof("rename schema incompatible");
      }
      return Result12.ok(undefined);
    }
    case "copy": {
      const fromSegRes = parsePointerResult(op.from, "invalid_lens_proof");
      if (Result12.isError(fromSegRes))
        return fromSegRes;
      const toSegRes = parsePointerResult(op.to, "invalid_lens_proof");
      if (Result12.isError(toSegRes))
        return toSegRes;
      const fromSeg = fromSegRes.value;
      const toSeg = toSegRes.value;
      const src = getPathInfo(oldSchema, fromSeg, false);
      if (!src.exists || !src.required)
        return invalidLensProof("copy source not required");
      const parentRes = ensureParentRequiredResult(oldSchema, toSeg, false, "invalid_lens_proof");
      if (Result12.isError(parentRes))
        return parentRes;
      const dest = getPathInfo(newSchema, toSeg, false);
      if (!dest.exists)
        return invalidLensProof("copy dest missing in new schema");
      if (!isSchemaCompatible(src.schema, dest.schema))
        return invalidLensProof("copy schema incompatible");
      return Result12.ok(undefined);
    }
    case "add": {
      const pathSegRes = parsePointerResult(op.path, "invalid_lens_proof");
      if (Result12.isError(pathSegRes))
        return pathSegRes;
      const pathSeg = pathSegRes.value;
      const parentRes = ensureParentRequiredResult(oldSchema, pathSeg, true, "invalid_lens_proof");
      if (Result12.isError(parentRes))
        return parentRes;
      const dest = getPathInfo(newSchema, pathSeg, true);
      if (!dest.exists)
        return invalidLensProof("add dest missing in new schema");
      const def = op.default ?? deriveDefault(dest.schema);
      if (def === undefined)
        return invalidLensProof("add missing default");
      if (!valueConformsToSchema(def, dest.schema))
        return invalidLensProof("add default invalid");
      return Result12.ok(undefined);
    }
    case "remove": {
      const pathSegRes = parsePointerResult(op.path, "invalid_lens_proof");
      if (Result12.isError(pathSegRes))
        return pathSegRes;
      const pathSeg = pathSegRes.value;
      const src = getPathInfo(oldSchema, pathSeg, true);
      if (!src.exists || !src.required)
        return invalidLensProof("remove path not required");
      if (isPathRequired(newSchema, pathSeg))
        return invalidLensProof("remove path still required in new schema");
      return Result12.ok(undefined);
    }
    case "hoist": {
      const hostSegRes = parsePointerResult(op.host, "invalid_lens_proof");
      if (Result12.isError(hostSegRes))
        return hostSegRes;
      const toSegRes = parsePointerResult(op.to, "invalid_lens_proof");
      if (Result12.isError(toSegRes))
        return toSegRes;
      const hostSeg = hostSegRes.value;
      const toSeg = toSegRes.value;
      const host = getPathInfo(oldSchema, hostSeg, true);
      if (!host.exists || !host.required || !isObjectSchema(host.schema))
        return invalidLensProof("hoist host invalid");
      const child = getPropertySchema(host.schema, op.name, true);
      if (!child.exists || !child.required)
        return invalidLensProof("hoist name missing/optional");
      const parentRes = ensureParentRequiredResult(oldSchema, toSeg, true, "invalid_lens_proof");
      if (Result12.isError(parentRes))
        return parentRes;
      const dest = getPathInfo(newSchema, toSeg, true);
      if (!dest.exists)
        return invalidLensProof("hoist dest missing in new schema");
      if (!isSchemaCompatible(child.schema, dest.schema))
        return invalidLensProof("hoist schema incompatible");
      if (op.removeFromHost !== false) {
        const hostNew = getPathInfo(newSchema, hostSeg, true);
        if (hostNew.exists && hostNew.required && isPathRequired(hostNew.schema, [op.name])) {
          return invalidLensProof("hoist removed field still required");
        }
      }
      return Result12.ok(undefined);
    }
    case "plunge": {
      const fromSegRes = parsePointerResult(op.from, "invalid_lens_proof");
      if (Result12.isError(fromSegRes))
        return fromSegRes;
      const hostSegRes = parsePointerResult(op.host, "invalid_lens_proof");
      if (Result12.isError(hostSegRes))
        return hostSegRes;
      const fromSeg = fromSegRes.value;
      const hostSeg = hostSegRes.value;
      const src = getPathInfo(oldSchema, fromSeg, true);
      if (!src.exists || !src.required)
        return invalidLensProof("plunge source not required");
      if (op.createHost !== false) {
        const parentRes = ensureParentRequiredResult(oldSchema, hostSeg, true, "invalid_lens_proof");
        if (Result12.isError(parentRes))
          return parentRes;
      } else {
        const host = getPathInfo(oldSchema, hostSeg, true);
        if (!host.exists || !host.required || !isObjectSchema(host.schema))
          return invalidLensProof("plunge host invalid");
      }
      const hostNew = getPathInfo(newSchema, hostSeg, true);
      if (!hostNew.exists || !isObjectSchema(hostNew.schema))
        return invalidLensProof("plunge host missing in new schema");
      const child = getPropertySchema(hostNew.schema, op.name, true);
      if (!child.exists)
        return invalidLensProof("plunge name missing in new schema");
      if (!isSchemaCompatible(src.schema, child.schema))
        return invalidLensProof("plunge schema incompatible");
      if (op.removeFromSource !== false && isPathRequired(newSchema, fromSeg)) {
        return invalidLensProof("plunge removed field still required");
      }
      return Result12.ok(undefined);
    }
    case "wrap": {
      const pathSegRes = parsePointerResult(op.path, "invalid_lens_proof");
      if (Result12.isError(pathSegRes))
        return pathSegRes;
      const pathSeg = pathSegRes.value;
      let src = getPathInfo(oldSchema, pathSeg, true);
      if (!src.exists || !src.required) {
        const renameRes = findRenameToResult(priorOps, pathSeg);
        if (Result12.isError(renameRes))
          return renameRes;
        if (renameRes.value) {
          const fromRes = parsePointerResult(renameRes.value.from, "invalid_lens_proof");
          if (Result12.isError(fromRes))
            return fromRes;
          src = getPathInfo(oldSchema, fromRes.value, true);
        }
      }
      if (!src.exists || !src.required)
        return invalidLensProof("wrap path not required");
      const dest = getPathInfo(newSchema, pathSeg, true);
      if (!dest.exists || !isArraySchema(dest.schema))
        return invalidLensProof("wrap dest not array");
      const items = getItemsSchema(dest.schema);
      if (!isSchemaCompatible(src.schema, items))
        return invalidLensProof("wrap items incompatible");
      return Result12.ok(undefined);
    }
    case "head": {
      const pathSegRes = parsePointerResult(op.path, "invalid_lens_proof");
      if (Result12.isError(pathSegRes))
        return pathSegRes;
      const pathSeg = pathSegRes.value;
      const src = getPathInfo(oldSchema, pathSeg, true);
      if (!src.exists || !src.required || !isArraySchema(src.schema))
        return invalidLensProof("head path not required array");
      const hasEnum = src.schema && Array.isArray(src.schema.enum);
      if (hasEnum) {
        const ok = src.schema.enum.every((v) => Array.isArray(v) && v.length > 0);
        if (!ok)
          return invalidLensProof("head requires enum non-empty");
      }
      const minItems = src.schema?.minItems;
      if (!hasEnum && (minItems === undefined || minItems < 1)) {
        return invalidLensProof("head requires minItems");
      }
      if (minItems !== undefined && minItems < 1)
        return invalidLensProof("head requires non-empty array");
      const dest = getPathInfo(newSchema, pathSeg, true);
      if (!dest.exists)
        return invalidLensProof("head dest missing");
      const items = getItemsSchema(src.schema);
      if (!isSchemaCompatible(items, dest.schema))
        return invalidLensProof("head schema incompatible");
      return Result12.ok(undefined);
    }
    case "convert": {
      const pathSegRes = parsePointerResult(op.path, "invalid_lens_proof");
      if (Result12.isError(pathSegRes))
        return pathSegRes;
      const pathSeg = pathSegRes.value;
      const src = getPathInfo(oldSchema, pathSeg, true);
      if (!src.exists || !src.required)
        return invalidLensProof("convert path not required");
      if (op.forward.map && !op.forward.default) {
        const enumRes = ensureEnumOrConstResult("invalid_lens_proof", src.schema);
        if (Result12.isError(enumRes))
          return enumRes;
      }
      const builtin = op.forward.builtin;
      if (builtin === "string_to_int" || builtin === "rfc3339_to_unix_millis") {
        const enumRes = ensureEnumOrConstResult("invalid_lens_proof", src.schema);
        if (Result12.isError(enumRes))
          return enumRes;
      }
      const dest = getPathInfo(newSchema, pathSeg, true);
      if (!dest.exists)
        return invalidLensProof("convert dest missing");
      const outType = { type: op.toType };
      if (!isSchemaCompatible(outType, dest.schema))
        return invalidLensProof("convert dest incompatible");
      return Result12.ok(undefined);
    }
    case "in": {
      const pathSegRes = parsePointerResult(op.path, "invalid_lens_proof");
      if (Result12.isError(pathSegRes))
        return pathSegRes;
      const pathSeg = pathSegRes.value;
      const src = getPathInfo(oldSchema, pathSeg, true);
      const dest = getPathInfo(newSchema, pathSeg, true);
      if (!src.exists || !src.required || !isObjectSchema(src.schema))
        return invalidLensProof("in path invalid");
      if (!dest.exists || !isObjectSchema(dest.schema))
        return invalidLensProof("in dest invalid");
      return validateOpsResult(src.schema, dest.schema, op.ops);
    }
    case "map": {
      const pathSegRes = parsePointerResult(op.path, "invalid_lens_proof");
      if (Result12.isError(pathSegRes))
        return pathSegRes;
      const pathSeg = pathSegRes.value;
      const src = getPathInfo(oldSchema, pathSeg, true);
      const dest = getPathInfo(newSchema, pathSeg, true);
      if (!src.exists || !src.required || !isArraySchema(src.schema))
        return invalidLensProof("map path invalid");
      if (!dest.exists || !isArraySchema(dest.schema))
        return invalidLensProof("map dest invalid");
      const srcItems = getItemsSchema(src.schema);
      const destItems = getItemsSchema(dest.schema);
      return validateOpsResult(srcItems, destItems, op.ops);
    }
    default:
      return invalidLensProof(`unknown op: ${op.op}`);
  }
}
function validateOpsResult(oldSchema, newSchema, ops) {
  for (let i = 0;i < ops.length; i++) {
    const res = validateOpResult(oldSchema, newSchema, ops[i], ops.slice(0, i), ops.slice(i + 1));
    if (Result12.isError(res))
      return res;
  }
  return Result12.ok(undefined);
}
function validateLensAgainstSchemasResult(oldSchema, newSchema, lens) {
  return validateOpsResult(oldSchema, newSchema, lens.ops);
}
function fillOpsDefaultsResult(ops, newSchema) {
  for (const op of ops) {
    if (op.op === "add") {
      if (op.default === undefined) {
        const pathRes = parsePointerResult(op.path, "invalid_lens_defaults");
        if (Result12.isError(pathRes))
          return pathRes;
        const info = getPathInfo(newSchema, pathRes.value, true);
        if (!info.exists)
          return invalidLensDefaults("add dest missing in new schema");
        const def = deriveDefault(info.schema);
        if (def === undefined)
          return invalidLensDefaults("add missing default");
        op.default = def;
      }
      continue;
    }
    if (op.op === "in") {
      const pathRes = parsePointerResult(op.path, "invalid_lens_defaults");
      if (Result12.isError(pathRes))
        return pathRes;
      const info = getPathInfo(newSchema, pathRes.value, true);
      if (!info.exists)
        return invalidLensDefaults("in dest missing in new schema");
      const nestedRes = fillOpsDefaultsResult(op.ops, info.schema);
      if (Result12.isError(nestedRes))
        return nestedRes;
      continue;
    }
    if (op.op === "map") {
      const pathRes = parsePointerResult(op.path, "invalid_lens_defaults");
      if (Result12.isError(pathRes))
        return pathRes;
      const info = getPathInfo(newSchema, pathRes.value, true);
      if (!info.exists)
        return invalidLensDefaults("map dest missing in new schema");
      const items = getItemsSchema(info.schema);
      const nestedRes = fillOpsDefaultsResult(op.ops, items);
      if (Result12.isError(nestedRes))
        return nestedRes;
    }
  }
  return Result12.ok(undefined);
}
function cloneLensForDefaultsResult(lens) {
  try {
    return Result12.ok(JSON.parse(JSON.stringify(lens)));
  } catch (e) {
    return invalidLensDefaults(String(e?.message ?? e));
  }
}
function fillLensDefaultsResult(lens, newSchema) {
  const copyRes = cloneLensForDefaultsResult(lens);
  if (Result12.isError(copyRes))
    return copyRes;
  const fillRes = fillOpsDefaultsResult(copyRes.value.ops, newSchema);
  if (Result12.isError(fillRes))
    return fillRes;
  return Result12.ok(copyRes.value);
}

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
function sha256Hex(input) {
  return createHash("sha256").update(input).digest("hex");
}
function defaultRegistry(stream) {
  return {
    apiVersion: SCHEMA_REGISTRY_API_VERSION,
    schema: stream,
    currentVersion: 0,
    boundaries: [],
    schemas: {},
    lenses: {}
  };
}
function ensureNoRefResult(schema) {
  const stack = [schema];
  while (stack.length > 0) {
    const cur = stack.pop();
    if (!cur || typeof cur !== "object")
      continue;
    if (Object.prototype.hasOwnProperty.call(cur, "$ref")) {
      return Result13.err({ message: "external $ref is not supported" });
    }
    for (const v of Object.values(cur)) {
      if (v && typeof v === "object")
        stack.push(v);
    }
  }
  return Result13.ok(undefined);
}
function isPlainObject2(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function rejectUnknownKeysResult2(obj, allowed, path) {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(obj)) {
    if (!allowedSet.has(key))
      return Result13.err({ message: `${path}.${key} is not supported` });
  }
  return Result13.ok(undefined);
}
function parseRoutingKeyConfigResult(raw, path) {
  if (raw == null)
    return Result13.ok(null);
  if (!isPlainObject2(raw))
    return Result13.err({ message: `${path} must be an object or null` });
  const keyCheck = rejectUnknownKeysResult2(raw, ["jsonPointer", "required"], path);
  if (Result13.isError(keyCheck))
    return keyCheck;
  if (typeof raw.jsonPointer !== "string")
    return Result13.err({ message: `${path}.jsonPointer must be a string` });
  const pointerRes = parseJsonPointerResult(raw.jsonPointer);
  if (Result13.isError(pointerRes))
    return Result13.err({ message: pointerRes.error.message });
  if (typeof raw.required !== "boolean")
    return Result13.err({ message: `${path}.required must be boolean` });
  return Result13.ok({ jsonPointer: raw.jsonPointer, required: raw.required });
}
function validateSearchFieldNameResult(name, path) {
  const trimmed = name.trim();
  if (trimmed === "")
    return Result13.err({ message: `${path} must not be empty` });
  if (trimmed.length > 64)
    return Result13.err({ message: `${path} too long (max 64)` });
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(trimmed)) {
    return Result13.err({ message: `${path} must match ^[a-zA-Z0-9][a-zA-Z0-9._-]*$` });
  }
  return Result13.ok(trimmed);
}
function parseSearchFieldBindingResult(raw, path) {
  if (!isPlainObject2(raw))
    return Result13.err({ message: `${path} must be an object` });
  const keyCheck = rejectUnknownKeysResult2(raw, ["version", "jsonPointer"], path);
  if (Result13.isError(keyCheck))
    return keyCheck;
  if (typeof raw.version !== "number" || !Number.isFinite(raw.version) || raw.version <= 0 || !Number.isInteger(raw.version)) {
    return Result13.err({ message: `${path}.version must be a positive integer` });
  }
  if (typeof raw.jsonPointer !== "string")
    return Result13.err({ message: `${path}.jsonPointer must be a string` });
  const pointerRes = parseJsonPointerResult(raw.jsonPointer);
  if (Result13.isError(pointerRes))
    return Result13.err({ message: pointerRes.error.message });
  return Result13.ok({
    version: raw.version,
    jsonPointer: raw.jsonPointer
  });
}
function parseSearchDefaultFieldResult(raw, path) {
  if (!isPlainObject2(raw))
    return Result13.err({ message: `${path} must be an object` });
  const keyCheck = rejectUnknownKeysResult2(raw, ["field", "boost"], path);
  if (Result13.isError(keyCheck))
    return keyCheck;
  if (typeof raw.field !== "string")
    return Result13.err({ message: `${path}.field must be a string` });
  const fieldRes = validateSearchFieldNameResult(raw.field, `${path}.field`);
  if (Result13.isError(fieldRes))
    return fieldRes;
  if (raw.boost !== undefined && (typeof raw.boost !== "number" || !Number.isFinite(raw.boost) || raw.boost <= 0)) {
    return Result13.err({ message: `${path}.boost must be a positive number` });
  }
  return Result13.ok({
    field: fieldRes.value,
    boost: typeof raw.boost === "number" ? raw.boost : undefined
  });
}
function parseSearchFieldConfigResult(raw, path) {
  if (!isPlainObject2(raw))
    return Result13.err({ message: `${path} must be an object` });
  const keyCheck = rejectUnknownKeysResult2(raw, ["kind", "bindings", "normalizer", "analyzer", "exact", "prefix", "column", "exists", "sortable", "aggregatable", "contains", "positions"], path);
  if (Result13.isError(keyCheck))
    return keyCheck;
  if (raw.kind !== "keyword" && raw.kind !== "text" && raw.kind !== "integer" && raw.kind !== "float" && raw.kind !== "date" && raw.kind !== "bool") {
    return Result13.err({ message: `${path}.kind must be keyword, text, integer, float, date, or bool` });
  }
  if (!Array.isArray(raw.bindings) || raw.bindings.length === 0) {
    return Result13.err({ message: `${path}.bindings must be a non-empty array` });
  }
  const bindings = [];
  const seenVersions = new Set;
  for (let i = 0;i < raw.bindings.length; i++) {
    const bindingRes = parseSearchFieldBindingResult(raw.bindings[i], `${path}.bindings[${i}]`);
    if (Result13.isError(bindingRes))
      return bindingRes;
    if (seenVersions.has(bindingRes.value.version)) {
      return Result13.err({ message: `${path}.bindings[${i}].version duplicates ${bindingRes.value.version}` });
    }
    seenVersions.add(bindingRes.value.version);
    bindings.push(bindingRes.value);
  }
  if (raw.normalizer !== undefined && raw.normalizer !== "identity_v1" && raw.normalizer !== "lowercase_v1") {
    return Result13.err({ message: `${path}.normalizer must be identity_v1 or lowercase_v1` });
  }
  if (raw.analyzer !== undefined && raw.analyzer !== "unicode_word_v1") {
    return Result13.err({ message: `${path}.analyzer must be unicode_word_v1` });
  }
  const out = {
    kind: raw.kind,
    bindings,
    normalizer: raw.normalizer,
    analyzer: raw.analyzer,
    exact: raw.exact === true ? true : undefined,
    prefix: raw.prefix === true ? true : undefined,
    column: raw.column === true ? true : undefined,
    exists: raw.exists === true ? true : undefined,
    sortable: raw.sortable === true ? true : undefined,
    aggregatable: raw.aggregatable === true ? true : undefined,
    contains: raw.contains === true ? true : undefined,
    positions: raw.positions === true ? true : undefined
  };
  if (out.kind === "text") {
    if (!out.analyzer)
      return Result13.err({ message: `${path}.analyzer is required for text fields` });
    if (out.column)
      return Result13.err({ message: `${path}.column is not supported for text fields` });
    if (out.sortable)
      return Result13.err({ message: `${path}.sortable is not supported for text fields` });
    if (out.aggregatable)
      return Result13.err({ message: `${path}.aggregatable is not supported for text fields` });
  } else {
    if (out.positions)
      return Result13.err({ message: `${path}.positions is only supported for text fields` });
  }
  if (out.kind === "keyword") {
    if (out.analyzer)
      return Result13.err({ message: `${path}.analyzer is not supported for keyword fields` });
  }
  if (out.kind === "integer" || out.kind === "float" || out.kind === "date" || out.kind === "bool") {
    if (out.prefix)
      return Result13.err({ message: `${path}.prefix is not supported for typed fields` });
    if (out.contains)
      return Result13.err({ message: `${path}.contains is not supported for typed fields` });
    if (out.normalizer)
      return Result13.err({ message: `${path}.normalizer is not supported for typed fields` });
  }
  return Result13.ok(out);
}
function parseSearchRollupMeasureResult(raw, path, fields) {
  if (!isPlainObject2(raw))
    return Result13.err({ message: `${path} must be an object` });
  if (raw.kind === "count") {
    const keyCheck = rejectUnknownKeysResult2(raw, ["kind", "include"], path);
    if (Result13.isError(keyCheck))
      return keyCheck;
    if (raw.include !== undefined && (typeof raw.include !== "string" || raw.include.trim() === "")) {
      return Result13.err({ message: `${path}.include must be a non-empty string` });
    }
    return Result13.ok({ kind: "count", include: typeof raw.include === "string" ? raw.include.trim() : undefined });
  }
  if (raw.kind === "summary") {
    const keyCheck = rejectUnknownKeysResult2(raw, ["kind", "field", "histogram"], path);
    if (Result13.isError(keyCheck))
      return keyCheck;
    if (typeof raw.field !== "string")
      return Result13.err({ message: `${path}.field must be a string` });
    const fieldRes = validateSearchFieldNameResult(raw.field, `${path}.field`);
    if (Result13.isError(fieldRes))
      return fieldRes;
    const field = fields[fieldRes.value];
    if (!field)
      return Result13.err({ message: `${path}.field must reference a declared search field` });
    if (!field.aggregatable)
      return Result13.err({ message: `${path}.field must reference an aggregatable search field` });
    if (field.kind !== "integer" && field.kind !== "float") {
      return Result13.err({ message: `${path}.field must reference an integer or float field` });
    }
    if (raw.histogram !== undefined && raw.histogram !== "log2_v1") {
      return Result13.err({ message: `${path}.histogram must be log2_v1` });
    }
    return Result13.ok({
      kind: "summary",
      field: fieldRes.value,
      histogram: raw.histogram === "log2_v1" ? "log2_v1" : undefined
    });
  }
  if (raw.kind === "summary_parts") {
    const keyCheck = rejectUnknownKeysResult2(raw, ["kind", "countJsonPointer", "sumJsonPointer", "minJsonPointer", "maxJsonPointer", "histogramJsonPointer"], path);
    if (Result13.isError(keyCheck))
      return keyCheck;
    for (const key of ["countJsonPointer", "sumJsonPointer", "minJsonPointer", "maxJsonPointer"]) {
      if (typeof raw[key] !== "string")
        return Result13.err({ message: `${path}.${key} must be a string` });
      const pointerRes = parseJsonPointerResult(raw[key]);
      if (Result13.isError(pointerRes))
        return Result13.err({ message: pointerRes.error.message });
    }
    if (raw.histogramJsonPointer !== undefined) {
      if (typeof raw.histogramJsonPointer !== "string")
        return Result13.err({ message: `${path}.histogramJsonPointer must be a string` });
      const pointerRes = parseJsonPointerResult(raw.histogramJsonPointer);
      if (Result13.isError(pointerRes))
        return Result13.err({ message: pointerRes.error.message });
    }
    return Result13.ok({
      kind: "summary_parts",
      countJsonPointer: raw.countJsonPointer,
      sumJsonPointer: raw.sumJsonPointer,
      minJsonPointer: raw.minJsonPointer,
      maxJsonPointer: raw.maxJsonPointer,
      histogramJsonPointer: typeof raw.histogramJsonPointer === "string" ? raw.histogramJsonPointer : undefined
    });
  }
  return Result13.err({ message: `${path}.kind must be count, summary, or summary_parts` });
}
function parseSearchRollupConfigResult(raw, path, fields, primaryTimestampField) {
  if (!isPlainObject2(raw))
    return Result13.err({ message: `${path} must be an object` });
  const keyCheck = rejectUnknownKeysResult2(raw, ["timestampField", "include", "dimensions", "intervals", "measures"], path);
  if (Result13.isError(keyCheck))
    return keyCheck;
  const timestampFieldRaw = raw.timestampField === undefined ? primaryTimestampField : raw.timestampField;
  if (typeof timestampFieldRaw !== "string")
    return Result13.err({ message: `${path}.timestampField must be a string` });
  const timestampFieldRes = validateSearchFieldNameResult(timestampFieldRaw, `${path}.timestampField`);
  if (Result13.isError(timestampFieldRes))
    return timestampFieldRes;
  const timestampField = fields[timestampFieldRes.value];
  if (!timestampField)
    return Result13.err({ message: `${path}.timestampField must reference a declared field` });
  if (timestampField.kind !== "date")
    return Result13.err({ message: `${path}.timestampField must reference a date field` });
  let include;
  if (raw.include !== undefined) {
    if (typeof raw.include !== "string" || raw.include.trim() === "") {
      return Result13.err({ message: `${path}.include must be a non-empty string` });
    }
    include = raw.include.trim();
  }
  let dimensions;
  if (raw.dimensions !== undefined) {
    if (!Array.isArray(raw.dimensions))
      return Result13.err({ message: `${path}.dimensions must be an array` });
    dimensions = [];
    const seen = new Set;
    for (let i = 0;i < raw.dimensions.length; i++) {
      if (typeof raw.dimensions[i] !== "string")
        return Result13.err({ message: `${path}.dimensions[${i}] must be a string` });
      const dimRes = validateSearchFieldNameResult(raw.dimensions[i], `${path}.dimensions[${i}]`);
      if (Result13.isError(dimRes))
        return dimRes;
      if (seen.has(dimRes.value))
        return Result13.err({ message: `${path}.dimensions[${i}] duplicates ${dimRes.value}` });
      const field = fields[dimRes.value];
      if (!field)
        return Result13.err({ message: `${path}.dimensions[${i}] must reference a declared field` });
      if (!field.exact)
        return Result13.err({ message: `${path}.dimensions[${i}] must reference an exact-capable field` });
      seen.add(dimRes.value);
      dimensions.push(dimRes.value);
    }
  }
  if (!Array.isArray(raw.intervals) || raw.intervals.length === 0) {
    return Result13.err({ message: `${path}.intervals must be a non-empty array` });
  }
  const intervals = [];
  const seenIntervals = new Set;
  for (let i = 0;i < raw.intervals.length; i++) {
    if (typeof raw.intervals[i] !== "string")
      return Result13.err({ message: `${path}.intervals[${i}] must be a string` });
    const parsedRes = parseDurationMsResult(raw.intervals[i]);
    if (Result13.isError(parsedRes) || parsedRes.value <= 0) {
      return Result13.err({ message: `${path}.intervals[${i}] must be a positive duration string` });
    }
    if (seenIntervals.has(raw.intervals[i])) {
      return Result13.err({ message: `${path}.intervals[${i}] duplicates ${raw.intervals[i]}` });
    }
    seenIntervals.add(raw.intervals[i]);
    intervals.push(raw.intervals[i]);
  }
  if (!isPlainObject2(raw.measures) || Object.keys(raw.measures).length === 0) {
    return Result13.err({ message: `${path}.measures must be a non-empty object` });
  }
  const measures = {};
  for (const [measureName, measureRaw] of Object.entries(raw.measures)) {
    const nameRes = validateSearchFieldNameResult(measureName, `${path}.measures`);
    if (Result13.isError(nameRes))
      return nameRes;
    const measureRes = parseSearchRollupMeasureResult(measureRaw, `${path}.measures.${measureName}`, fields);
    if (Result13.isError(measureRes))
      return measureRes;
    measures[nameRes.value] = measureRes.value;
  }
  return Result13.ok({
    timestampField: timestampFieldRes.value,
    include,
    dimensions,
    intervals,
    measures
  });
}
function parseSearchConfigResult(raw, path) {
  if (raw == null)
    return Result13.ok(null);
  if (!isPlainObject2(raw))
    return Result13.err({ message: `${path} must be an object` });
  const keyCheck = rejectUnknownKeysResult2(raw, ["profile", "primaryTimestampField", "defaultFields", "containsDefaultFields", "aliases", "fields", "rollups"], path);
  if (Result13.isError(keyCheck))
    return keyCheck;
  if (typeof raw.primaryTimestampField !== "string") {
    return Result13.err({ message: `${path}.primaryTimestampField must be a string` });
  }
  const primaryFieldRes = validateSearchFieldNameResult(raw.primaryTimestampField, `${path}.primaryTimestampField`);
  if (Result13.isError(primaryFieldRes))
    return primaryFieldRes;
  if (!isPlainObject2(raw.fields) || Object.keys(raw.fields).length === 0) {
    return Result13.err({ message: `${path}.fields must be a non-empty object` });
  }
  const fields = {};
  for (const [fieldName, fieldRaw] of Object.entries(raw.fields)) {
    const nameRes = validateSearchFieldNameResult(fieldName, `${path}.fields`);
    if (Result13.isError(nameRes))
      return nameRes;
    const fieldRes = parseSearchFieldConfigResult(fieldRaw, `${path}.fields.${fieldName}`);
    if (Result13.isError(fieldRes))
      return fieldRes;
    fields[nameRes.value] = fieldRes.value;
  }
  if (!fields[primaryFieldRes.value]) {
    return Result13.err({ message: `${path}.primaryTimestampField must reference a declared field` });
  }
  if (fields[primaryFieldRes.value].kind !== "date") {
    return Result13.err({ message: `${path}.primaryTimestampField must reference a date field` });
  }
  let defaultFields;
  if (raw.defaultFields !== undefined) {
    if (!Array.isArray(raw.defaultFields))
      return Result13.err({ message: `${path}.defaultFields must be an array` });
    defaultFields = [];
    for (let i = 0;i < raw.defaultFields.length; i++) {
      const fieldRes = parseSearchDefaultFieldResult(raw.defaultFields[i], `${path}.defaultFields[${i}]`);
      if (Result13.isError(fieldRes))
        return fieldRes;
      if (!fields[fieldRes.value.field]) {
        return Result13.err({ message: `${path}.defaultFields[${i}].field must reference a declared field` });
      }
      defaultFields.push(fieldRes.value);
    }
  }
  let containsDefaultFields;
  if (raw.containsDefaultFields !== undefined) {
    if (!Array.isArray(raw.containsDefaultFields)) {
      return Result13.err({ message: `${path}.containsDefaultFields must be an array` });
    }
    containsDefaultFields = [];
    for (let i = 0;i < raw.containsDefaultFields.length; i++) {
      if (typeof raw.containsDefaultFields[i] !== "string") {
        return Result13.err({ message: `${path}.containsDefaultFields[${i}] must be a string` });
      }
      const nameRes = validateSearchFieldNameResult(raw.containsDefaultFields[i], `${path}.containsDefaultFields[${i}]`);
      if (Result13.isError(nameRes))
        return nameRes;
      if (!fields[nameRes.value]) {
        return Result13.err({ message: `${path}.containsDefaultFields[${i}] must reference a declared field` });
      }
      containsDefaultFields.push(nameRes.value);
    }
  }
  let aliases;
  if (raw.aliases !== undefined) {
    if (!isPlainObject2(raw.aliases))
      return Result13.err({ message: `${path}.aliases must be an object` });
    aliases = {};
    for (const [aliasRaw, targetRaw] of Object.entries(raw.aliases)) {
      const aliasRes = validateSearchFieldNameResult(aliasRaw, `${path}.aliases`);
      if (Result13.isError(aliasRes))
        return aliasRes;
      if (typeof targetRaw !== "string")
        return Result13.err({ message: `${path}.aliases.${aliasRaw} must be a string` });
      const targetRes = validateSearchFieldNameResult(targetRaw, `${path}.aliases.${aliasRaw}`);
      if (Result13.isError(targetRes))
        return targetRes;
      if (!fields[targetRes.value]) {
        return Result13.err({ message: `${path}.aliases.${aliasRaw} must reference a declared field` });
      }
      aliases[aliasRes.value] = targetRes.value;
    }
  }
  let rollups;
  if (raw.rollups !== undefined) {
    if (!isPlainObject2(raw.rollups))
      return Result13.err({ message: `${path}.rollups must be an object` });
    rollups = {};
    for (const [rollupName, rollupRaw] of Object.entries(raw.rollups)) {
      const nameRes = validateSearchFieldNameResult(rollupName, `${path}.rollups`);
      if (Result13.isError(nameRes))
        return nameRes;
      const rollupRes = parseSearchRollupConfigResult(rollupRaw, `${path}.rollups.${rollupName}`, fields, primaryFieldRes.value);
      if (Result13.isError(rollupRes))
        return rollupRes;
      rollups[nameRes.value] = rollupRes.value;
    }
  }
  return Result13.ok({
    profile: typeof raw.profile === "string" ? raw.profile : undefined,
    primaryTimestampField: primaryFieldRes.value,
    defaultFields,
    containsDefaultFields,
    aliases,
    fields,
    rollups
  });
}
function validateJsonSchemaResult(schema) {
  const noRefRes = ensureNoRefResult(schema);
  if (Result13.isError(noRefRes))
    return noRefRes;
  try {
    const validate = AJV.compile(schema);
    if (!validate)
      return Result13.err({ message: "schema validation failed" });
  } catch (e) {
    return Result13.err({ message: String(e?.message ?? e) });
  }
  return Result13.ok(undefined);
}
function parseRegistryResult(stream, json) {
  let raw;
  try {
    raw = JSON.parse(json);
  } catch (e) {
    return Result13.err({ message: String(e?.message ?? e) });
  }
  if (!isPlainObject2(raw))
    return Result13.err({ message: "invalid schema registry" });
  const keyCheck = rejectUnknownKeysResult2(raw, ["apiVersion", "schema", "currentVersion", "routingKey", "search", "boundaries", "schemas", "lenses"], "registry");
  if (Result13.isError(keyCheck))
    return keyCheck;
  if (raw.apiVersion !== SCHEMA_REGISTRY_API_VERSION)
    return Result13.err({ message: "invalid registry apiVersion" });
  const routingKeyRes = parseRoutingKeyConfigResult(raw.routingKey, "routingKey");
  if (Result13.isError(routingKeyRes))
    return routingKeyRes;
  const searchRes = parseSearchConfigResult(raw.search, "search");
  if (Result13.isError(searchRes))
    return searchRes;
  const boundariesRaw = Array.isArray(raw.boundaries) ? raw.boundaries : [];
  const boundaries = [];
  for (const item of boundariesRaw) {
    if (!isPlainObject2(item))
      return Result13.err({ message: "invalid boundary entry" });
    const offset = typeof item.offset === "number" && Number.isFinite(item.offset) ? item.offset : null;
    const version = typeof item.version === "number" && Number.isFinite(item.version) ? item.version : null;
    if (offset == null || version == null)
      return Result13.err({ message: "invalid boundary entry" });
    boundaries.push({ offset, version });
  }
  const schemas = isPlainObject2(raw.schemas) ? raw.schemas : {};
  const lenses = isPlainObject2(raw.lenses) ? raw.lenses : {};
  const currentVersion = typeof raw.currentVersion === "number" && Number.isFinite(raw.currentVersion) ? raw.currentVersion : 0;
  const schemaName = typeof raw.schema === "string" && raw.schema.trim() !== "" ? raw.schema : stream;
  return Result13.ok({
    apiVersion: SCHEMA_REGISTRY_API_VERSION,
    schema: schemaName,
    currentVersion,
    routingKey: routingKeyRes.value ?? undefined,
    search: searchRes.value ?? undefined,
    boundaries,
    schemas,
    lenses
  });
}
function serializeRegistry(reg) {
  return JSON.stringify(reg);
}
function validateLensResult(raw) {
  const ok = LENS_VALIDATOR(raw);
  if (!ok) {
    const msg = AJV.errorsText(LENS_VALIDATOR.errors || undefined);
    return Result13.err({ message: `invalid lens: ${msg}` });
  }
  return Result13.ok(raw);
}
function parseSchemaUpdateResult(body) {
  if (!isPlainObject2(body))
    return Result13.err({ message: "schema update must be a JSON object" });
  const keyCheck = rejectUnknownKeysResult2(body, ["apiVersion", "schema", "lens", "routingKey", "search"], "schemaUpdate");
  if (Result13.isError(keyCheck))
    return keyCheck;
  if (body.apiVersion !== undefined && body.apiVersion !== SCHEMA_REGISTRY_API_VERSION) {
    return Result13.err({ message: "invalid schema apiVersion" });
  }
  const hasSchema = Object.prototype.hasOwnProperty.call(body, "schema");
  const hasRoutingKey = Object.prototype.hasOwnProperty.call(body, "routingKey");
  const hasSearch = Object.prototype.hasOwnProperty.call(body, "search");
  if (!hasSchema && !hasRoutingKey && !hasSearch) {
    return Result13.err({ message: "schema update must include schema, routingKey, or search" });
  }
  if (!hasSchema && body.lens !== undefined) {
    return Result13.err({ message: "schema update lens requires schema" });
  }
  const routingKeyRes = hasRoutingKey ? parseRoutingKeyConfigResult(body.routingKey, "routingKey") : Result13.ok(null);
  if (Result13.isError(routingKeyRes))
    return routingKeyRes;
  if (hasSchema && hasRoutingKey && routingKeyRes.value == null) {
    return Result13.err({ message: "schema update routingKey must be an object when schema is provided" });
  }
  const searchRes = hasSearch ? parseSearchConfigResult(body.search, "search") : Result13.ok(null);
  if (Result13.isError(searchRes))
    return searchRes;
  const out = {};
  if (hasSchema)
    out.schema = body.schema;
  if (body.lens !== undefined)
    out.lens = body.lens;
  if (hasRoutingKey)
    out.routingKey = routingKeyRes.value;
  if (hasSearch)
    out.search = searchRes.value;
  return Result13.ok(out);
}
function bigintToNumberSafeResult(v) {
  const max = BigInt(Number.MAX_SAFE_INTEGER);
  if (v > max)
    return Result13.err({ message: "offset exceeds MAX_SAFE_INTEGER" });
  return Result13.ok(Number(v));
}

class SchemaRegistryStore {
  db;
  registryCache;
  validatorCache;
  lensCache;
  lensChainCache;
  constructor(db, opts) {
    this.db = db;
    this.registryCache = new LruCache(opts?.registryCacheEntries ?? 1024);
    this.validatorCache = new LruCache(opts?.validatorCacheEntries ?? 256);
    this.lensCache = new LruCache(opts?.lensCacheEntries ?? 256);
    this.lensChainCache = new LruCache(opts?.lensCacheEntries ?? 256);
  }
  loadRow(stream) {
    return this.db.getSchemaRegistry(stream);
  }
  getRegistry(stream) {
    const res = this.getRegistryResult(stream);
    if (Result13.isError(res))
      throw dsError(res.error.message, { code: res.error.code });
    return res.value;
  }
  getRegistryResult(stream) {
    const row = this.loadRow(stream);
    if (!row)
      return Result13.ok(defaultRegistry(stream));
    const cached = this.registryCache.get(stream);
    if (cached && cached.updatedAtMs === row.updated_at_ms)
      return Result13.ok(cached.reg);
    const parseRes = parseRegistryResult(stream, row.registry_json);
    if (Result13.isError(parseRes)) {
      return Result13.err({ kind: "invalid_registry", message: parseRes.error.message });
    }
    const reg = parseRes.value;
    this.registryCache.set(stream, { reg, updatedAtMs: row.updated_at_ms });
    return Result13.ok(reg);
  }
  updateRegistry(stream, streamRow, update) {
    const res = this.updateRegistryResult(stream, streamRow, update);
    if (Result13.isError(res))
      throw dsError(res.error.message, { code: res.error.code });
    return res.value;
  }
  updateRegistryResult(stream, streamRow, update) {
    if (update.routingKey) {
      const pointerRes = parseJsonPointerResult(update.routingKey.jsonPointer);
      if (Result13.isError(pointerRes)) {
        return Result13.err({ kind: "bad_request", message: pointerRes.error.message });
      }
      if (typeof update.routingKey.required !== "boolean") {
        return Result13.err({ kind: "bad_request", message: "routingKey.required must be boolean" });
      }
    }
    if (update.schema === undefined)
      return Result13.err({ kind: "bad_request", message: "missing schema" });
    const schemaRes = validateJsonSchemaResult(update.schema);
    if (Result13.isError(schemaRes))
      return Result13.err({ kind: "bad_request", message: schemaRes.error.message });
    const regRes = this.getRegistryResult(stream);
    if (Result13.isError(regRes))
      return Result13.err({ kind: "bad_request", message: regRes.error.message, code: regRes.error.code });
    const reg = regRes.value;
    const currentVersion = reg.currentVersion ?? 0;
    const streamEmpty = streamRow.next_offset === 0n;
    if (currentVersion === 0) {
      if (!streamEmpty)
        return Result13.err({ kind: "bad_request", message: "first schema requires empty stream" });
      if (update.lens) {
        const lensRes2 = validateLensResult(update.lens);
        if (Result13.isError(lensRes2))
          return Result13.err({ kind: "bad_request", message: lensRes2.error.message });
        if (lensRes2.value.from !== 0 || lensRes2.value.to !== 1) {
          return Result13.err({
            kind: "version_mismatch",
            message: "lens version mismatch",
            code: "schema_lens_version_mismatch"
          });
        }
      }
      const nextReg2 = {
        apiVersion: "durable.streams/schema-registry/v1",
        schema: stream,
        currentVersion: 1,
        routingKey: update.routingKey,
        search: update.search === undefined ? reg.search : update.search ?? undefined,
        boundaries: [{ offset: 0, version: 1 }],
        schemas: { ...reg.schemas, ["1"]: update.schema },
        lenses: { ...reg.lenses }
      };
      this.persist(stream, nextReg2);
      return Result13.ok(nextReg2);
    }
    if (!update.lens)
      return Result13.err({ kind: "bad_request", message: "lens required" });
    const lensRes = validateLensResult(update.lens);
    if (Result13.isError(lensRes))
      return Result13.err({ kind: "bad_request", message: lensRes.error.message });
    const lens = lensRes.value;
    if (lens.from !== currentVersion || lens.to !== currentVersion + 1) {
      return Result13.err({
        kind: "version_mismatch",
        message: "lens version mismatch",
        code: "schema_lens_version_mismatch"
      });
    }
    if (lens.schema && lens.schema !== reg.schema)
      return Result13.err({ kind: "bad_request", message: "lens schema mismatch" });
    const oldSchema = reg.schemas[String(currentVersion)];
    if (!oldSchema)
      return Result13.err({ kind: "bad_request", message: "missing current schema" });
    const proofRes = validateLensAgainstSchemasResult(oldSchema, update.schema, lens);
    if (Result13.isError(proofRes))
      return Result13.err({ kind: "bad_request", message: proofRes.error.message });
    const defaultsRes = fillLensDefaultsResult(lens, update.schema);
    if (Result13.isError(defaultsRes))
      return Result13.err({ kind: "bad_request", message: defaultsRes.error.message });
    const boundaryRes = bigintToNumberSafeResult(streamRow.next_offset);
    if (Result13.isError(boundaryRes))
      return Result13.err({ kind: "bad_request", message: boundaryRes.error.message });
    const nextVersion = currentVersion + 1;
    const nextReg = {
      apiVersion: "durable.streams/schema-registry/v1",
      schema: reg.schema ?? stream,
      currentVersion: nextVersion,
      routingKey: update.routingKey ?? reg.routingKey,
      search: update.search === undefined ? reg.search : update.search ?? undefined,
      boundaries: [...reg.boundaries, { offset: boundaryRes.value, version: nextVersion }],
      schemas: { ...reg.schemas, [String(nextVersion)]: update.schema },
      lenses: { ...reg.lenses, [String(currentVersion)]: defaultsRes.value }
    };
    this.persist(stream, nextReg);
    return Result13.ok(nextReg);
  }
  updateRoutingKey(stream, routingKey) {
    const res = this.updateRoutingKeyResult(stream, routingKey);
    if (Result13.isError(res))
      throw dsError(res.error.message, { code: res.error.code });
    return res.value;
  }
  updateRoutingKeyResult(stream, routingKey) {
    if (routingKey) {
      const pointerRes = parseJsonPointerResult(routingKey.jsonPointer);
      if (Result13.isError(pointerRes)) {
        return Result13.err({ kind: "bad_request", message: pointerRes.error.message });
      }
      if (typeof routingKey.required !== "boolean") {
        return Result13.err({ kind: "bad_request", message: "routingKey.required must be boolean" });
      }
    }
    const regRes = this.getRegistryResult(stream);
    if (Result13.isError(regRes))
      return Result13.err({ kind: "bad_request", message: regRes.error.message, code: regRes.error.code });
    const nextReg = {
      ...regRes.value,
      routingKey: routingKey ?? undefined
    };
    this.persist(stream, nextReg);
    return Result13.ok(nextReg);
  }
  updateSearch(stream, search) {
    const res = this.updateSearchResult(stream, search);
    if (Result13.isError(res))
      throw dsError(res.error.message, { code: res.error.code });
    return res.value;
  }
  updateSearchResult(stream, search) {
    const searchRes = parseSearchConfigResult(search, "search");
    if (Result13.isError(searchRes))
      return Result13.err({ kind: "bad_request", message: searchRes.error.message });
    const regRes = this.getRegistryResult(stream);
    if (Result13.isError(regRes))
      return Result13.err({ kind: "bad_request", message: regRes.error.message, code: regRes.error.code });
    if (searchRes.value && (regRes.value.currentVersion <= 0 || regRes.value.boundaries.length === 0)) {
      return Result13.err({
        kind: "bad_request",
        message: "search config requires an installed schema version"
      });
    }
    const nextReg = {
      ...regRes.value,
      search: searchRes.value ?? undefined
    };
    this.persist(stream, nextReg);
    return Result13.ok(nextReg);
  }
  replaceRegistry(stream, registry) {
    const res = this.replaceRegistryResult(stream, registry);
    if (Result13.isError(res))
      throw dsError(res.error.message, { code: res.error.code });
    return res.value;
  }
  replaceRegistryResult(stream, registry) {
    const parseRes = parseRegistryResult(stream, JSON.stringify(registry));
    if (Result13.isError(parseRes))
      return Result13.err({ kind: "bad_request", message: parseRes.error.message });
    this.persist(stream, parseRes.value);
    return Result13.ok(parseRes.value);
  }
  persist(stream, reg) {
    const json = serializeRegistry(reg);
    this.db.upsertSchemaRegistry(stream, json);
    this.registryCache.set(stream, { reg, updatedAtMs: this.db.nowMs() });
  }
  getValidatorForVersion(reg, version) {
    const schema = reg.schemas[String(version)];
    if (!schema)
      return null;
    const hash = sha256Hex(JSON.stringify(schema));
    const cached = this.validatorCache.get(hash);
    if (cached)
      return cached;
    const validate = AJV.compile(schema);
    this.validatorCache.set(hash, validate);
    return validate;
  }
  getLensChain(reg, fromVersion, toVersion) {
    const res = this.getLensChainResult(reg, fromVersion, toVersion);
    if (Result13.isError(res))
      throw dsError(res.error.message, { code: res.error.code });
    return res.value;
  }
  getLensChainResult(reg, fromVersion, toVersion) {
    const key = `${reg.schema}:${fromVersion}->${toVersion}`;
    const cached = this.lensChainCache.get(key);
    if (cached)
      return Result13.ok(cached);
    const chain = [];
    for (let v = fromVersion;v < toVersion; v++) {
      const lensRaw = reg.lenses[String(v)];
      if (!lensRaw) {
        return Result13.err({
          kind: "invalid_lens_chain",
          message: `missing lens v${v}->v${v + 1}`
        });
      }
      const hash = sha256Hex(JSON.stringify(lensRaw));
      let compiled = this.lensCache.get(hash);
      if (!compiled) {
        const compiledRes = compileLensResult(lensFromJson(lensRaw));
        if (Result13.isError(compiledRes)) {
          return Result13.err({
            kind: "invalid_lens_chain",
            message: compiledRes.error.message
          });
        }
        compiled = compiledRes.value;
        this.lensCache.set(hash, compiled);
      }
      chain.push(compiled);
    }
    this.lensChainCache.set(key, chain);
    return Result13.ok(chain);
  }
}

// src/schema/read_json.ts
import { Result as Result14 } from "better-result";
function schemaVersionForOffset(reg, offset) {
  if (!reg.boundaries || reg.boundaries.length === 0)
    return 0;
  const off = Number(offset);
  let version = 0;
  for (const boundary of reg.boundaries) {
    if (boundary.offset <= off)
      version = boundary.version;
    else
      break;
  }
  return version;
}
function decodeJsonPayloadResult(registry, stream, offset, payload) {
  const regRes = registry.getRegistryResult(stream);
  if (Result14.isError(regRes))
    return Result14.err({ status: 500, message: regRes.error.message });
  const reg = regRes.value;
  try {
    const text = new TextDecoder().decode(payload);
    let value = JSON.parse(text);
    if (reg.currentVersion > 0) {
      const version = schemaVersionForOffset(reg, offset);
      if (version < reg.currentVersion) {
        const chainRes = registry.getLensChainResult(reg, version, reg.currentVersion);
        if (Result14.isError(chainRes))
          return Result14.err({ status: 500, message: chainRes.error.message });
        const transformedRes = applyLensChainResult(chainRes.value, value);
        if (Result14.isError(transformedRes))
          return Result14.err({ status: 400, message: transformedRes.error.message });
        value = transformedRes.value;
      }
    }
    return Result14.ok(value);
  } catch (e) {
    return Result14.err({ status: 400, message: String(e?.message ?? e) });
  }
}

// src/expiry_sweeper.ts
class ExpirySweeper {
  cfg;
  db;
  timer = null;
  running = false;
  constructor(cfg, db) {
    this.cfg = cfg;
    this.db = db;
  }
  start() {
    if (this.timer || this.cfg.expirySweepIntervalMs <= 0)
      return;
    this.timer = setInterval(() => {
      this.tick();
    }, this.cfg.expirySweepIntervalMs);
  }
  stop() {
    if (this.timer)
      clearInterval(this.timer);
    this.timer = null;
  }
  async tick() {
    if (this.running)
      return;
    this.running = true;
    try {
      const expired = this.db.listExpiredStreams(this.cfg.expirySweepBatchLimit);
      if (expired.length === 0)
        return;
      for (const stream of expired) {
        try {
          this.db.deleteStream(stream);
        } catch {}
      }
    } finally {
      this.running = false;
    }
  }
}

// src/backpressure.ts
class BackpressureGate {
  maxBytes;
  currentBytes;
  reservedBytes;
  constructor(maxBytes, initialBytes) {
    this.maxBytes = maxBytes;
    this.currentBytes = Math.max(0, initialBytes);
    this.reservedBytes = 0;
  }
  enabled() {
    return this.maxBytes > 0;
  }
  reserve(bytes) {
    if (this.maxBytes <= 0)
      return true;
    if (bytes <= 0)
      return true;
    if (this.currentBytes + this.reservedBytes + bytes > this.maxBytes)
      return false;
    this.reservedBytes += bytes;
    return true;
  }
  commit(bytes, reservedBytes = bytes) {
    if (this.maxBytes <= 0)
      return;
    if (bytes <= 0)
      return;
    if (reservedBytes > 0)
      this.reservedBytes = Math.max(0, this.reservedBytes - reservedBytes);
    this.currentBytes += bytes;
  }
  release(bytes) {
    if (this.maxBytes <= 0)
      return;
    if (bytes <= 0)
      return;
    this.reservedBytes = Math.max(0, this.reservedBytes - bytes);
  }
  adjustOnSeal(payloadBytes, segmentBytes) {
    if (this.maxBytes <= 0)
      return;
    const delta = segmentBytes - payloadBytes;
    this.currentBytes = Math.max(0, this.currentBytes + delta);
  }
  adjustOnUpload(segmentBytes) {
    if (this.maxBytes <= 0)
      return;
    this.currentBytes = Math.max(0, this.currentBytes - segmentBytes);
  }
  adjustOnWalTrim(payloadBytes) {
    if (this.maxBytes <= 0)
      return;
    if (payloadBytes <= 0)
      return;
    this.currentBytes = Math.max(0, this.currentBytes - payloadBytes);
  }
  getCurrentBytes() {
    return this.currentBytes;
  }
  getMaxBytes() {
    return this.maxBytes;
  }
  isOverLimit() {
    if (this.maxBytes <= 0)
      return false;
    return this.currentBytes + this.reservedBytes >= this.maxBytes;
  }
}

// src/memory.ts
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import os from "node:os";
var HOST_MEMORY_GUARD_FRACTION = 0.7;
var HOST_MEMORY_HEADROOM_FRACTION = 0.15;
var HOST_MEMORY_HEADROOM_MIN_BYTES = 512 * 1024 * 1024;
var HOST_MEMORY_HEADROOM_MAX_BYTES = 2 * 1024 * 1024 * 1024;
function deriveMemoryPressureLimitBytes(requestedLimitBytes, hostTotalBytes = os.totalmem()) {
  const requested = Math.max(0, Math.floor(requestedLimitBytes));
  if (requested <= 0)
    return 0;
  if (!Number.isFinite(hostTotalBytes) || hostTotalBytes <= 0)
    return requested;
  const safeHostCap = Math.max(256 * 1024 * 1024, Math.floor(hostTotalBytes * HOST_MEMORY_GUARD_FRACTION));
  return Math.min(requested, safeHostCap);
}
function deriveMemoryPressureHeadroomBytes(limitBytes, hostTotalBytes = os.totalmem()) {
  const limit = Math.max(0, Math.floor(limitBytes));
  if (limit <= 0)
    return 0;
  if (!Number.isFinite(hostTotalBytes) || hostTotalBytes <= 0) {
    return Math.min(limit, HOST_MEMORY_HEADROOM_MIN_BYTES);
  }
  const headroomFromHost = Math.floor(hostTotalBytes * HOST_MEMORY_HEADROOM_FRACTION);
  const headroom = Math.max(HOST_MEMORY_HEADROOM_MIN_BYTES, headroomFromHost);
  return Math.min(limit, Math.min(HOST_MEMORY_HEADROOM_MAX_BYTES, headroom));
}

class MemoryPressureMonitor {
  limitBytes;
  resumeBytes;
  hostHeadroomBytes;
  hostResumeHeadroomBytes;
  intervalMs;
  onSample;
  heapSnapshotPath;
  heapSnapshotMinIntervalMs;
  timer = null;
  overLimit = false;
  maxRssBytes = 0;
  lastRssBytes = 0;
  lastGcMs = 0;
  forcedGcCount = 0;
  forcedGcReclaimedBytesTotal = 0;
  lastForcedGcAtMs = 0;
  lastForcedGcBeforeBytes = 0;
  lastForcedGcAfterBytes = 0;
  lastForcedGcReclaimedBytes = 0;
  lastSnapshotMs = 0;
  heapSnapshotsWritten = 0;
  lastDarwinPhysicalBytes = 0;
  lastDarwinPhysicalAtMs = 0;
  constructor(limitBytes, opts = {}) {
    const requestedLimitBytes = Math.max(0, Math.floor(limitBytes));
    this.limitBytes = deriveMemoryPressureLimitBytes(requestedLimitBytes);
    const initialRssBytes = process.memoryUsage().rss;
    this.lastRssBytes = initialRssBytes;
    this.maxRssBytes = initialRssBytes;
    if (requestedLimitBytes > 0 && this.limitBytes < requestedLimitBytes) {
      console.warn(`[memory] clamped limit from ${formatBytes2(requestedLimitBytes)} to ${formatBytes2(this.limitBytes)} based on host memory`);
    }
    const resumeFraction = Math.min(1, Math.max(0.5, opts.resumeFraction ?? 1));
    this.resumeBytes = Math.floor(this.limitBytes * resumeFraction);
    this.hostHeadroomBytes = deriveMemoryPressureHeadroomBytes(this.limitBytes);
    this.hostResumeHeadroomBytes = Math.floor(this.hostHeadroomBytes * 1.25);
    this.intervalMs = Math.max(50, opts.intervalMs ?? 1000);
    this.onSample = opts.onSample;
    this.heapSnapshotPath = opts.heapSnapshotPath;
    this.heapSnapshotMinIntervalMs = Math.max(1000, opts.heapSnapshotMinIntervalMs ?? 60000);
  }
  start() {
    if (this.timer)
      return;
    if (this.limitBytes <= 0)
      return;
    this.sample();
    this.timer = setInterval(() => this.sample(), this.intervalMs);
  }
  stop() {
    if (this.timer)
      clearInterval(this.timer);
    this.timer = null;
  }
  sample() {
    const rss = process.memoryUsage().rss;
    const effectiveBytes = this.effectiveBytesForGuard(rss);
    const hostAvailableBytes = readHostAvailableMemoryBytes();
    this.lastRssBytes = rss;
    if (rss > this.maxRssBytes)
      this.maxRssBytes = rss;
    const hostLowMemory = this.hostHeadroomBytes > 0 && hostAvailableBytes <= this.hostHeadroomBytes;
    const overLimit = this.limitBytes > 0 && (effectiveBytes > this.limitBytes || hostLowMemory);
    if (this.onSample) {
      try {
        this.onSample(rss, overLimit, this.limitBytes);
      } catch {}
    }
    if (this.limitBytes <= 0)
      return;
    if (overLimit) {
      this.maybeGc(hostLowMemory ? "host memory headroom" : "memory sample");
      this.maybeHeapSnapshot(hostLowMemory ? "host memory headroom" : "memory sample");
    }
    if (this.overLimit) {
      if (effectiveBytes <= this.resumeBytes && hostAvailableBytes > this.hostResumeHeadroomBytes)
        this.overLimit = false;
    } else if (effectiveBytes > this.limitBytes) {
      this.overLimit = true;
    } else if (hostLowMemory) {
      this.overLimit = true;
    }
  }
  effectiveBytesForGuard(rssBytes) {
    if (this.limitBytes <= 0 || rssBytes <= this.limitBytes)
      return rssBytes;
    if (process.platform !== "darwin")
      return rssBytes;
    const now = Date.now();
    if (this.lastDarwinPhysicalAtMs !== 0 && now - this.lastDarwinPhysicalAtMs < 5000) {
      return this.lastDarwinPhysicalBytes > 0 ? this.lastDarwinPhysicalBytes : this.limitBytes;
    }
    this.lastDarwinPhysicalAtMs = now;
    const physicalBytes = readDarwinTopMemBytes(process.pid);
    if (physicalBytes != null) {
      this.lastDarwinPhysicalBytes = physicalBytes;
      return physicalBytes;
    }
    if (this.lastDarwinPhysicalBytes > 0)
      return this.lastDarwinPhysicalBytes;
    this.lastDarwinPhysicalBytes = this.limitBytes;
    return this.lastDarwinPhysicalBytes;
  }
  isOverLimit() {
    return this.overLimit;
  }
  getMaxRssBytes() {
    return this.maxRssBytes;
  }
  snapshotMaxRssBytes(reset = true) {
    const max = this.maxRssBytes;
    if (reset)
      this.maxRssBytes = this.lastRssBytes;
    return max;
  }
  getLastRssBytes() {
    return this.lastRssBytes;
  }
  getLimitBytes() {
    return this.limitBytes;
  }
  getGcStats() {
    return {
      forced_gc_count: this.forcedGcCount,
      forced_gc_reclaimed_bytes_total: this.forcedGcReclaimedBytesTotal,
      last_forced_gc_at_ms: this.lastForcedGcAtMs > 0 ? this.lastForcedGcAtMs : null,
      last_forced_gc_before_bytes: this.lastForcedGcAtMs > 0 ? this.lastForcedGcBeforeBytes : null,
      last_forced_gc_after_bytes: this.lastForcedGcAtMs > 0 ? this.lastForcedGcAfterBytes : null,
      last_forced_gc_reclaimed_bytes: this.lastForcedGcAtMs > 0 ? this.lastForcedGcReclaimedBytes : null,
      heap_snapshots_written: this.heapSnapshotsWritten,
      last_heap_snapshot_at_ms: this.lastSnapshotMs > 0 ? this.lastSnapshotMs : null
    };
  }
  maybeGc(reason) {
    const gcFn = globalThis?.Bun?.gc;
    if (typeof gcFn !== "function")
      return;
    const now = Date.now();
    if (now - this.lastGcMs < 1e4)
      return;
    this.lastGcMs = now;
    const before = process.memoryUsage().rss;
    try {
      gcFn(true);
    } catch {
      try {
        gcFn();
      } catch {
        return;
      }
    }
    const after = process.memoryUsage().rss;
    const reclaimed = Math.max(0, before - after);
    this.forcedGcCount += 1;
    this.forcedGcReclaimedBytesTotal += reclaimed;
    this.lastForcedGcAtMs = now;
    this.lastForcedGcBeforeBytes = before;
    this.lastForcedGcAfterBytes = after;
    this.lastForcedGcReclaimedBytes = reclaimed;
    console.warn(`[gc] forced GC (${reason}) rss ${formatBytes2(before)} -> ${formatBytes2(after)}`);
  }
  maybeHeapSnapshot(reason) {
    if (!this.heapSnapshotPath)
      return;
    const now = Date.now();
    if (now - this.lastSnapshotMs < this.heapSnapshotMinIntervalMs)
      return;
    this.lastSnapshotMs = now;
    this.writeHeapSnapshot(reason);
  }
  async writeHeapSnapshot(reason) {
    try {
      const v8 = await import("v8");
      if (typeof v8.writeHeapSnapshot !== "function")
        return;
      const fs = await import("node:fs");
      try {
        fs.unlinkSync(this.heapSnapshotPath);
      } catch {}
      const before = process.memoryUsage().rss;
      v8.writeHeapSnapshot(this.heapSnapshotPath);
      const after = process.memoryUsage().rss;
      this.heapSnapshotsWritten += 1;
      console.warn(`[heap] snapshot (${reason}) rss ${formatBytes2(before)} -> ${formatBytes2(after)} path=${this.heapSnapshotPath}`);
    } catch (err) {
      console.warn(`[heap] snapshot failed (${reason}): ${String(err)}`);
    }
  }
}
function parseDarwinTopMemBytes(output, pid) {
  const line = output.split(/\r?\n/).map((entry) => entry.trim()).find((entry) => new RegExp(`^${pid}\\s+`).test(entry));
  if (!line)
    return null;
  const match = line.match(new RegExp(`^${pid}\\s+([0-9]+(?:\\.[0-9]+)?)([BKMGTP])\\+?\\b`, "i"));
  if (!match)
    return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value))
    return null;
  const unit = match[2].toUpperCase();
  const power = unit === "B" ? 0 : unit === "K" ? 1 : unit === "M" ? 2 : unit === "G" ? 3 : unit === "T" ? 4 : unit === "P" ? 5 : -1;
  if (power < 0)
    return null;
  return Math.round(value * 1024 ** power);
}
function darwinTopMemArgs(pid) {
  return ["-l", "1", "-pid", String(pid), "-stats", "pid,mem"];
}
function parseLinuxMemAvailableBytes(meminfo) {
  for (const line of meminfo.split(/\r?\n/)) {
    const match = line.match(/^MemAvailable:\s+([0-9]+)\s+kB$/i);
    if (!match)
      continue;
    const kb = Number(match[1]);
    if (!Number.isFinite(kb) || kb < 0)
      return null;
    return kb * 1024;
  }
  return null;
}
function readLinuxMemAvailableBytes() {
  try {
    const meminfo = readFileSync("/proc/meminfo", "utf8");
    return parseLinuxMemAvailableBytes(meminfo);
  } catch {
    return null;
  }
}
function readHostAvailableMemoryBytes() {
  if (process.platform === "linux") {
    const available = readLinuxMemAvailableBytes();
    if (available != null)
      return available;
  }
  return os.freemem();
}
function readDarwinTopMemBytes(pid) {
  try {
    const output = execFileSync("/usr/bin/top", darwinTopMemArgs(pid), {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 5000,
      maxBuffer: 262144
    });
    return parseDarwinTopMemBytes(output, pid);
  } catch {
    return null;
  }
}
function formatBytes2(bytes) {
  const units = ["b", "kb", "mb", "gb"];
  let value = bytes;
  let idx = 0;
  while (value >= 1024 && idx < units.length - 1) {
    value /= 1024;
    idx += 1;
  }
  const digits = idx === 0 ? 0 : 1;
  return `${value.toFixed(digits)}${units[idx]}`;
}

// src/runtime_memory_sampler.ts
import { mkdirSync, createWriteStream } from "node:fs";
import { dirname, extname } from "node:path";
import { isMainThread, threadId } from "node:worker_threads";

// src/runtime_memory.ts
import { readFileSync as readFileSync2 } from "node:fs";
var cachedLinuxStatusBreakdown = null;
function parseLinuxStatusRssBreakdown(status) {
  let anon = null;
  let file = null;
  let shmem = null;
  for (const line of status.split(/\r?\n/)) {
    let match = line.match(/^RssAnon:\s+([0-9]+)\s+kB$/i);
    if (match) {
      anon = Number(match[1]) * 1024;
      continue;
    }
    match = line.match(/^RssFile:\s+([0-9]+)\s+kB$/i);
    if (match) {
      file = Number(match[1]) * 1024;
      continue;
    }
    match = line.match(/^RssShmem:\s+([0-9]+)\s+kB$/i);
    if (match) {
      shmem = Number(match[1]) * 1024;
    }
  }
  if (anon == null || file == null || shmem == null)
    return null;
  return {
    rss_anon_bytes: Math.max(0, Math.floor(anon)),
    rss_file_bytes: Math.max(0, Math.floor(file)),
    rss_shmem_bytes: Math.max(0, Math.floor(shmem))
  };
}
function readLinuxStatusRssBreakdown(ttlMs = 1000) {
  if (process.platform !== "linux")
    return null;
  const now = Date.now();
  if (cachedLinuxStatusBreakdown && cachedLinuxStatusBreakdown.pid === process.pid && now - cachedLinuxStatusBreakdown.at_ms < Math.max(0, ttlMs)) {
    return cachedLinuxStatusBreakdown.value;
  }
  let value = null;
  try {
    value = parseLinuxStatusRssBreakdown(readFileSync2("/proc/self/status", "utf8"));
  } catch {
    value = null;
  }
  cachedLinuxStatusBreakdown = {
    at_ms: now,
    pid: process.pid,
    value
  };
  return value;
}
function buildProcessMemoryBreakdown(args) {
  const rssBreakdown = readLinuxStatusRssBreakdown();
  const jsManagedBytes = Math.max(0, Math.floor(args.process.heap_used_bytes + args.process.external_bytes));
  const jsExternalNonArrayBuffersBytes = Math.max(0, Math.floor(args.process.external_bytes - args.process.array_buffers_bytes));
  const mappedFileBytes = Math.max(0, Math.floor(args.mappedFileBytes));
  const sqliteRuntimeBytes = Math.max(0, Math.floor(args.sqliteRuntimeBytes));
  const unattributedRssBytes = Math.max(0, Math.floor(args.process.rss_bytes - jsManagedBytes - mappedFileBytes - sqliteRuntimeBytes));
  const unattributedAnonBytes = rssBreakdown == null ? null : Math.max(0, Math.floor(rssBreakdown.rss_anon_bytes - jsManagedBytes - sqliteRuntimeBytes));
  return {
    source: rssBreakdown ? "linux_proc_status" : "process_memory_usage_only",
    rss_anon_bytes: rssBreakdown?.rss_anon_bytes ?? null,
    rss_file_bytes: rssBreakdown?.rss_file_bytes ?? null,
    rss_shmem_bytes: rssBreakdown?.rss_shmem_bytes ?? null,
    js_managed_bytes: jsManagedBytes,
    js_external_non_array_buffers_bytes: jsExternalNonArrayBuffersBytes,
    mapped_file_bytes: mappedFileBytes,
    sqlite_runtime_bytes: sqliteRuntimeBytes,
    unattributed_anon_bytes: unattributedAnonBytes,
    unattributed_rss_bytes: unattributedRssBytes
  };
}

// src/runtime_memory_sampler.ts
function isPromiseLike(value) {
  return typeof value === "object" && value != null && "then" in value && typeof value.then === "function";
}
function insertScopeSuffix(path, scope) {
  if (scope === "main")
    return path;
  const extension = extname(path);
  if (extension === "")
    return `${path}.${scope}`;
  return `${path.slice(0, -extension.length)}.${scope}${extension}`;
}

class RuntimeMemorySampler {
  outputPath;
  intervalMs;
  scope;
  stream = null;
  timer = null;
  activePhases = new Map;
  nextPhaseKey = 0;
  jscModule;
  sampling = false;
  subsystemProvider = null;
  constructor(path, opts = {}) {
    this.scope = opts.scope?.trim() || "main";
    this.outputPath = insertScopeSuffix(path, this.scope);
    this.intervalMs = Math.max(100, opts.intervalMs ?? 1000);
  }
  start() {
    if (this.stream)
      return;
    mkdirSync(dirname(this.outputPath), { recursive: true });
    this.stream = createWriteStream(this.outputPath, { flags: "a" });
    this.writeLine({
      ts: new Date().toISOString(),
      kind: "sampler_start",
      scope: this.scope,
      pid: process.pid,
      thread_id: threadId,
      is_main_thread: isMainThread
    });
    this.sample("startup");
    this.timer = setInterval(() => {
      this.sample("interval");
    }, this.intervalMs);
  }
  stop() {
    if (this.timer)
      clearInterval(this.timer);
    this.timer = null;
    this.sample("shutdown");
    this.writeLine({
      ts: new Date().toISOString(),
      kind: "sampler_stop",
      scope: this.scope,
      pid: process.pid,
      thread_id: threadId,
      is_main_thread: isMainThread
    });
    this.stream?.end();
    this.stream = null;
  }
  enter(label, meta = {}) {
    if (!this.stream)
      return () => {};
    const key = ++this.nextPhaseKey;
    const phase = {
      key,
      label,
      startedAtMs: Date.now(),
      meta
    };
    this.activePhases.set(key, phase);
    this.writeLine({
      ts: new Date().toISOString(),
      kind: "phase_enter",
      scope: this.scope,
      pid: process.pid,
      thread_id: threadId,
      label,
      meta,
      active_phase_count: this.activePhases.size
    });
    this.sample("phase_enter", { label, meta });
    return () => {
      const current = this.activePhases.get(key);
      if (!current)
        return;
      this.activePhases.delete(key);
      this.writeLine({
        ts: new Date().toISOString(),
        kind: "phase_exit",
        scope: this.scope,
        pid: process.pid,
        thread_id: threadId,
        label: current.label,
        meta: current.meta,
        duration_ms: Date.now() - current.startedAtMs,
        active_phase_count: this.activePhases.size
      });
      this.sample("phase_exit", { label: current.label, meta: current.meta });
    };
  }
  capture(reason, data = {}) {
    if (!this.stream)
      return;
    this.writeLine({
      ts: new Date().toISOString(),
      kind: "marker",
      scope: this.scope,
      pid: process.pid,
      thread_id: threadId,
      reason,
      data
    });
    this.sample(reason, data);
  }
  setSubsystemProvider(provider) {
    this.subsystemProvider = provider;
  }
  track(label, meta, fn) {
    const leave = this.enter(label, meta);
    try {
      const result = fn();
      if (isPromiseLike(result)) {
        return Promise.resolve(result).finally(() => leave());
      }
      leave();
      return result;
    } catch (error) {
      leave();
      throw error;
    }
  }
  async sample(reason, data = {}) {
    if (!this.stream || this.sampling)
      return;
    this.sampling = true;
    try {
      const activePhases = Array.from(this.activePhases.values()).map((phase) => ({
        key: phase.key,
        label: phase.label,
        started_at: new Date(phase.startedAtMs).toISOString(),
        duration_ms: Date.now() - phase.startedAtMs,
        meta: phase.meta
      }));
      const primary = activePhases.length > 0 ? activePhases[activePhases.length - 1] : null;
      this.writeLine({
        ts: new Date().toISOString(),
        kind: "sample",
        scope: this.scope,
        pid: process.pid,
        thread_id: threadId,
        is_main_thread: isMainThread,
        reason,
        data,
        process_memory_usage: process.memoryUsage(),
        linux_status_rss: readLinuxStatusRssBreakdown(0),
        jsc_heap_stats: await this.readJscHeapStats(),
        jsc_memory_usage: await this.readJscMemoryUsage(),
        memory_subsystems: this.readSubsystems(),
        active_phases: activePhases,
        primary_phase: primary ? { label: primary.label, duration_ms: primary.duration_ms, meta: primary.meta } : null
      });
    } finally {
      this.sampling = false;
    }
  }
  async readJscHeapStats() {
    const jsc = await this.loadJscModule();
    if (!jsc || typeof jsc.heapStats !== "function")
      return null;
    try {
      return jsc.heapStats();
    } catch {
      return null;
    }
  }
  async readJscMemoryUsage() {
    const jsc = await this.loadJscModule();
    if (!jsc || typeof jsc.memoryUsage !== "function")
      return null;
    try {
      return jsc.memoryUsage();
    } catch {
      return null;
    }
  }
  async loadJscModule() {
    if (this.jscModule !== undefined)
      return this.jscModule;
    if (typeof globalThis.Bun === "undefined") {
      this.jscModule = null;
      return this.jscModule;
    }
    try {
      this.jscModule = await import("bun:jsc");
    } catch {
      this.jscModule = null;
    }
    return this.jscModule;
  }
  writeLine(payload) {
    if (!this.stream)
      return;
    this.stream.write(`${JSON.stringify(payload)}
`);
  }
  readSubsystems() {
    if (!this.subsystemProvider)
      return null;
    try {
      return this.subsystemProvider();
    } catch {
      return null;
    }
  }
}

// src/profiles/index.ts
import { Result as Result28 } from "better-result";

// src/profiles/generic.ts
import { Result as Result15 } from "better-result";
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
    if (Result15.isError(objRes))
      return objRes;
    if (objRes.value.kind !== "generic") {
      return Result15.err({ message: `${path}.kind must be generic` });
    }
    const keyCheck = rejectUnknownKeysResult(objRes.value, ["kind"], path);
    if (Result15.isError(keyCheck))
      return keyCheck;
    return Result15.ok(cloneGenericProfile());
  },
  readProfileResult() {
    return Result15.ok({ profile: cloneGenericProfile(), cache: null });
  },
  persistProfileResult({ db, stream }) {
    db.updateStreamProfile(stream, "generic");
    db.deleteStreamProfile(stream);
    db.deleteStreamTouchState(stream);
    const profile = cloneStreamProfileSpec(cloneGenericProfile());
    return Result15.ok({ profile, cache: null, schemaRegistry: null });
  }
};

// src/profiles/evlog.ts
import { Result as Result16 } from "better-result";

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
    return Result16.ok(undefined);
  if (!Array.isArray(raw))
    return Result16.err({ message: `${path} must be an array of strings` });
  if (raw.length > 64)
    return Result16.err({ message: `${path} too large (max 64)` });
  const normalized = [];
  const seen = new Set;
  for (const item of raw) {
    if (typeof item !== "string")
      return Result16.err({ message: `${path} must be an array of strings` });
    const value = item.trim().toLowerCase();
    if (value === "")
      return Result16.err({ message: `${path} must not contain empty strings` });
    if (seen.has(value))
      continue;
    seen.add(value);
    normalized.push(value);
  }
  return Result16.ok(normalized);
}
function parseStringListResult(raw, path, maxItems) {
  if (raw === undefined)
    return Result16.ok(undefined);
  if (!Array.isArray(raw))
    return Result16.err({ message: `${path} must be an array of strings` });
  if (raw.length > maxItems)
    return Result16.err({ message: `${path} too large (max ${maxItems})` });
  const out = [];
  const seen = new Set;
  for (const item of raw) {
    if (typeof item !== "string")
      return Result16.err({ message: `${path} must be an array of strings` });
    const value = item.trim();
    if (value === "")
      return Result16.err({ message: `${path} must not contain empty strings` });
    if (seen.has(value))
      continue;
    seen.add(value);
    out.push(value);
  }
  return Result16.ok(out);
}
function parseEvlogCorrelationResult(raw, path) {
  if (raw === undefined)
    return Result16.ok(undefined);
  const objRes = expectPlainObjectResult(raw, path);
  if (Result16.isError(objRes))
    return objRes;
  const keyCheck = rejectUnknownKeysResult(objRes.value, ["requestIdFields", "traceContextFields", "parseTraceparent"], path);
  if (Result16.isError(keyCheck))
    return keyCheck;
  const requestIdFieldsRes = parseStringListResult(objRes.value.requestIdFields, `${path}.requestIdFields`, 64);
  if (Result16.isError(requestIdFieldsRes))
    return requestIdFieldsRes;
  const traceContextFieldsRes = parseStringListResult(objRes.value.traceContextFields, `${path}.traceContextFields`, 64);
  if (Result16.isError(traceContextFieldsRes))
    return traceContextFieldsRes;
  if (objRes.value.parseTraceparent !== undefined && typeof objRes.value.parseTraceparent !== "boolean") {
    return Result16.err({ message: `${path}.parseTraceparent must be boolean` });
  }
  const correlation = {};
  if (requestIdFieldsRes.value)
    correlation.requestIdFields = requestIdFieldsRes.value;
  if (traceContextFieldsRes.value)
    correlation.traceContextFields = traceContextFieldsRes.value;
  if (objRes.value.parseTraceparent !== undefined)
    correlation.parseTraceparent = objRes.value.parseTraceparent;
  return Result16.ok(Object.keys(correlation).length > 0 ? correlation : undefined);
}
function parseStreamNameResult(raw, path) {
  if (raw === undefined)
    return Result16.ok(undefined);
  if (typeof raw !== "string")
    return Result16.err({ message: `${path} must be a string` });
  const value = raw.trim();
  if (value === "")
    return Result16.err({ message: `${path} must not be empty` });
  return Result16.ok(value);
}
function parseEvlogObservabilityResult(raw, path) {
  if (raw === undefined)
    return Result16.ok(undefined);
  const objRes = expectPlainObjectResult(raw, path);
  if (Result16.isError(objRes))
    return objRes;
  const keyCheck = rejectUnknownKeysResult(objRes.value, ["request"], path);
  if (Result16.isError(keyCheck))
    return keyCheck;
  if (objRes.value.request === undefined)
    return Result16.ok(undefined);
  const requestRes = expectPlainObjectResult(objRes.value.request, `${path}.request`);
  if (Result16.isError(requestRes))
    return requestRes;
  const requestKeyCheck = rejectUnknownKeysResult(requestRes.value, ["tracesStream"], `${path}.request`);
  if (Result16.isError(requestKeyCheck))
    return requestKeyCheck;
  const tracesStreamRes = parseStreamNameResult(requestRes.value.tracesStream, `${path}.request.tracesStream`);
  if (Result16.isError(tracesStreamRes))
    return tracesStreamRes;
  if (!tracesStreamRes.value)
    return Result16.ok(undefined);
  return Result16.ok({
    request: {
      tracesStream: tracesStreamRes.value
    }
  });
}
function validateEvlogProfileResult(raw, path) {
  const objRes = expectPlainObjectResult(raw, path);
  if (Result16.isError(objRes))
    return objRes;
  if (objRes.value.kind !== "evlog") {
    return Result16.err({ message: `${path}.kind must be evlog` });
  }
  const keyCheck = rejectUnknownKeysResult(objRes.value, ["kind", "redactKeys", "correlation", "observability"], path);
  if (Result16.isError(keyCheck))
    return keyCheck;
  const redactKeysRes = parseRedactKeysResult(objRes.value.redactKeys, `${path}.redactKeys`);
  if (Result16.isError(redactKeysRes))
    return redactKeysRes;
  const correlationRes = parseEvlogCorrelationResult(objRes.value.correlation, `${path}.correlation`);
  if (Result16.isError(correlationRes))
    return correlationRes;
  const observabilityRes = parseEvlogObservabilityResult(objRes.value.observability, `${path}.observability`);
  if (Result16.isError(observabilityRes))
    return observabilityRes;
  const profile = { kind: "evlog" };
  if (redactKeysRes.value)
    profile.redactKeys = redactKeysRes.value;
  if (correlationRes.value)
    profile.correlation = correlationRes.value;
  if (observabilityRes.value)
    profile.observability = observabilityRes.value;
  return Result16.ok(profile);
}
function normalizeString2(value) {
  if (typeof value !== "string")
    return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}
function normalizeTraceField(input, field) {
  const direct = normalizeString2(input[field]);
  if (direct)
    return direct;
  const traceContext = isPlainObject(input.traceContext) ? input.traceContext : null;
  return traceContext ? normalizeString2(traceContext[field]) : null;
}
function readDottedString(input, path) {
  let cur = input;
  for (const part of path.split(".")) {
    if (!isPlainObject(cur))
      return null;
    cur = cur[part];
  }
  return normalizeString2(cur);
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
  const direct = normalizeString2(input.level)?.toLowerCase();
  if (direct === "debug" || direct === "info" || direct === "warn" || direct === "error") {
    return direct;
  }
  if (normalizeString2(input.why) || normalizeString2(input.fix) || normalizeString2(input.link))
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
  if (Result16.isError(objRes))
    return objRes;
  const input = objRes.value;
  const status = normalizeOptionalInteger(input.status);
  const duration = normalizeOptionalNumber(input.duration);
  const timestamp = normalizeString2(input.timestamp) ?? new Date().toISOString();
  const requestId = normalizeRequestId(input, profile);
  const traceparent = profile.correlation?.parseTraceparent === false ? null : parseTraceparent(input);
  const traceId = normalizeConfiguredTraceField(input, profile, "traceId") ?? traceparent?.traceId ?? null;
  const spanId = normalizeConfiguredTraceField(input, profile, "spanId") ?? traceparent?.spanId ?? null;
  const contextRes = redactValue(buildContext(input), new Set([...DEFAULT_REDACT_KEYS, ...profile.redactKeys ?? []]));
  const normalized = {
    timestamp,
    level: deriveLevel(input, status),
    service: normalizeString2(input.service),
    environment: normalizeString2(input.environment),
    version: normalizeString2(input.version),
    region: normalizeString2(input.region),
    requestId,
    traceId,
    spanId,
    method: normalizeString2(input.method),
    path: normalizeString2(input.path),
    status,
    duration,
    message: normalizeString2(input.message),
    why: normalizeString2(input.why),
    fix: normalizeString2(input.fix),
    link: normalizeString2(input.link),
    sampling: Object.prototype.hasOwnProperty.call(input, "sampling") ? structuredClone(input.sampling) : null,
    redaction: { keys: contextRes.paths },
    context: contextRes.value
  };
  return Result16.ok({
    value: normalized,
    routingKey: requestId ?? traceId ?? null
  });
}
function evlogSeverity(record) {
  const level = normalizeString2(record.level)?.toLowerCase();
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
  const timestamp = normalizeString2(record.timestamp);
  if (!timestamp)
    return [];
  const message = normalizeString2(record.message);
  const method = normalizeString2(record.method);
  const path = normalizeString2(record.path);
  const title = message ?? ([method, path].filter(Boolean).join(" ") || "evlog event");
  return [
    {
      kind: "evlog.event",
      time: timestamp,
      duration: normalizeOptionalNumber(record.duration),
      service: normalizeString2(record.service),
      title,
      severity: evlogSeverity(record),
      ids: {
        requestId: normalizeString2(record.requestId),
        traceId: normalizeString2(record.traceId),
        spanId: normalizeString2(record.spanId)
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
      return Result16.ok({ profile: { kind: "evlog" }, cache: null });
    const cachedCopy = cloneEvlogCache(cached);
    if (cachedCopy && cachedCopy.updatedAtMs === row.updated_at_ms) {
      return Result16.ok({
        profile: cloneEvlogProfile(cachedCopy.profile),
        cache: cachedCopy
      });
    }
    const parsedRes = parseStoredProfileJsonResult(row.profile_json);
    if (Result16.isError(parsedRes))
      return parsedRes;
    const profileRes = validateEvlogProfileResult(parsedRes.value, "profile");
    if (Result16.isError(profileRes))
      return profileRes;
    const profile = cloneEvlogProfile(profileRes.value);
    return Result16.ok({
      profile: cloneEvlogProfile(profile),
      cache: { profile, updatedAtMs: row.updated_at_ms }
    });
  },
  persistProfileResult({ db, registry, stream, streamRow, profile }) {
    if (!isEvlogProfile(profile)) {
      return Result16.err({ kind: "bad_request", message: "invalid evlog profile" });
    }
    const contentType = normalizeProfileContentType(streamRow.content_type);
    if (contentType !== "application/json") {
      return Result16.err({
        kind: "bad_request",
        message: "evlog profile requires application/json stream content-type"
      });
    }
    if (streamRow.profile !== "evlog" && streamRow.next_offset > 0n) {
      return Result16.err({
        kind: "bad_request",
        message: "evlog profile must be installed before appending data"
      });
    }
    const persistedProfile = cloneEvlogProfile(profile);
    const registryRes = registry.replaceRegistryResult(stream, buildEvlogDefaultRegistry(stream));
    if (Result16.isError(registryRes)) {
      return Result16.err({ kind: "bad_request", message: registryRes.error.message });
    }
    db.updateStreamProfile(stream, persistedProfile.kind);
    db.upsertStreamProfile(stream, JSON.stringify(persistedProfile));
    db.deleteStreamTouchState(stream);
    const row = db.getStreamProfile(stream);
    return Result16.ok({
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
        return Result16.err({ message: "invalid evlog profile" });
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
import { Result as Result17 } from "better-result";

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

// src/profiles/metrics.ts
var INTERNAL_METRICS_STREAM = "__stream_metrics__";
function cloneMetricsProfile() {
  return { kind: "metrics" };
}
function validateMetricsProfileResult(raw, path) {
  const objRes = expectPlainObjectResult(raw, path);
  if (Result17.isError(objRes))
    return objRes;
  if (objRes.value.kind !== "metrics")
    return Result17.err({ message: `${path}.kind must be metrics` });
  const keyCheck = rejectUnknownKeysResult(objRes.value, ["kind"], path);
  if (Result17.isError(keyCheck))
    return keyCheck;
  return Result17.ok(cloneMetricsProfile());
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
    return Result17.ok({ profile: cloneMetricsProfile(), cache: null });
  },
  persistProfileResult({ db, registry, stream, streamRow, profile }) {
    if (profile.kind !== "metrics")
      return Result17.err({ kind: "bad_request", message: "invalid metrics profile" });
    const contentType = normalizeProfileContentType(streamRow.content_type);
    if (contentType !== "application/json") {
      return Result17.err({
        kind: "bad_request",
        message: "metrics profile requires application/json stream content-type"
      });
    }
    const desiredRegistry = stream === INTERNAL_METRICS_STREAM ? buildInternalMetricsRegistry(stream) : buildMetricsDefaultRegistry(stream);
    const registryRes = registry.replaceRegistryResult(stream, desiredRegistry);
    if (Result17.isError(registryRes))
      return Result17.err({ kind: "bad_request", message: registryRes.error.message });
    db.updateStreamProfile(stream, "metrics");
    db.deleteStreamProfile(stream);
    db.deleteStreamTouchState(stream);
    return Result17.ok({
      profile: cloneStreamProfileSpec(cloneMetricsProfile()),
      cache: null,
      schemaRegistry: registryRes.value
    });
  },
  jsonIngest: {
    prepareRecordResult({ value }) {
      const normalizedRes = normalizeMetricsRecordResult(value);
      if (Result17.isError(normalizedRes))
        return normalizedRes;
      return Result17.ok({
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
import { Result as Result20 } from "better-result";

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
import { createHash as createHash2 } from "node:crypto";
import { Result as Result18 } from "better-result";
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
    return Result18.ok(null);
  const start = BigInt(startUnixNano);
  const end = BigInt(endUnixNano);
  if (end < start)
    return Result18.err({ message: "endTimeUnixNano must be greater than or equal to startTimeUnixNano" });
  return Result18.ok(Number(end - start) / 1e6);
}
function normalizeHexIdResult(raw, chars, field) {
  const value = normalizeString3(raw)?.toLowerCase() ?? "";
  if (!new RegExp(`^[0-9a-f]{${chars}}$`).test(value)) {
    return Result18.err({ message: `${field} must be ${chars} lowercase hex characters` });
  }
  if (/^0+$/.test(value))
    return Result18.err({ message: `${field} must not be all zeroes` });
  return Result18.ok(value);
}
function normalizeParentSpanIdResult(raw) {
  const value = normalizeString3(raw);
  if (!value)
    return Result18.ok(null);
  const lowered = value.toLowerCase();
  if (/^0+$/.test(lowered))
    return Result18.ok(null);
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
function sha256Hex2(value) {
  return createHash2("sha256").update(value).digest("hex");
}
function normalizeOtelDecodedSpanResult(profile, input) {
  const traceIdRes = normalizeHexIdResult(input.traceId, 32, "traceId");
  if (Result18.isError(traceIdRes))
    return traceIdRes;
  const spanIdRes = normalizeHexIdResult(input.spanId, 16, "spanId");
  if (Result18.isError(spanIdRes))
    return spanIdRes;
  const parentSpanIdRes = normalizeParentSpanIdResult(input.parentSpanId);
  if (Result18.isError(parentSpanIdRes))
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
  if (Result18.isError(durationRes))
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
    if (Result18.isError(linkTraceIdRes)) {
      droppedLinks += 1;
      continue;
    }
    const linkSpanIdRes = normalizeHexIdResult(link.spanId, 16, "links.spanId");
    if (Result18.isError(linkSpanIdRes)) {
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
      dedupeKey: sha256Hex2(`${traceIdRes.value}\x00${spanIdRes.value}\x00${startUnixNano ?? ""}\x00${service ?? ""}\x00${normalizeString3(input.name) ?? ""}`)
    }
  };
  return Result18.ok(canonical);
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
    dedupeKey: sha256Hex2(`${out.traceId}\x00${out.spanId}\x00${out.startUnixNano ?? ""}\x00${out.service ?? ""}\x00${out.name}`)
  };
  return out;
}
function decodedSpanFromCanonicalLikeResult(value) {
  const objRes = expectPlainObjectResult(value, "otel-traces record");
  if (Result18.isError(objRes))
    return objRes;
  const obj = objRes.value;
  const traceId = normalizeString3(obj.traceId);
  const spanId = normalizeString3(obj.spanId);
  if (!traceId)
    return Result18.err({ message: "traceId is required" });
  if (!spanId)
    return Result18.err({ message: "spanId is required" });
  const resource = isPlainObject(obj.resource) ? obj.resource : {};
  const scope = isPlainObject(obj.instrumentationScope) ? obj.instrumentationScope : {};
  const status = isPlainObject(obj.status) ? obj.status : {};
  const traceFlags = isPlainObject(obj.traceFlags) ? obj.traceFlags : {};
  return Result18.ok({
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
  if (Result18.isError(decodedRes))
    return decodedRes;
  const normalizedRes = normalizeOtelDecodedSpanResult(profile, decodedRes.value);
  if (Result18.isError(normalizedRes))
    return normalizedRes;
  const limits = { ...DEFAULT_ATTRIBUTE_LIMITS, ...profile.attributeLimits ?? {} };
  const normalized = preserveCanonicalDerivedFields(normalizedRes.value, isPlainObject(value) ? value : {}, profile, limits);
  return Result18.ok({
    value: normalized,
    routingKey: normalized.traceId
  });
}

// src/profiles/otelTraces/otlp.ts
import { gunzipSync } from "node:zlib";
import { Result as Result19 } from "better-result";
var JSON_TEXT_DECODER = new TextDecoder;
var JSON_CONTENT_TYPE = "application/json";
var PROTOBUF_CONTENT_TYPE = "application/x-protobuf";
function baseContentType(value) {
  return value.split(";")[0]?.trim().toLowerCase() ?? "";
}
function hexFromBytes(bytes) {
  return Array.from(bytes).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
function isPlainObject3(value) {
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
    return Result19.err({ message: `OTLP AnyValue nesting too deep (max ${limits.maxAnyValueDepth})` });
  }
  return Result19.ok(undefined);
}
function anyValueFromJsonResult(raw, limits, depth = 0) {
  const depthRes = checkAnyValueDepthResult(depth, limits);
  if (Result19.isError(depthRes))
    return depthRes;
  if (!isPlainObject3(raw))
    return Result19.ok(structuredClone(raw));
  if (Object.prototype.hasOwnProperty.call(raw, "stringValue"))
    return Result19.ok(normalizeString4(raw.stringValue) ?? "");
  if (Object.prototype.hasOwnProperty.call(raw, "boolValue"))
    return Result19.ok(raw.boolValue === true);
  if (Object.prototype.hasOwnProperty.call(raw, "intValue")) {
    const value = raw.intValue;
    if (typeof value === "string" && /^-?(0|[1-9][0-9]*)$/.test(value.trim()))
      return Result19.ok(value.trim());
    if (typeof value === "number" && Number.isFinite(value))
      return Result19.ok(Math.trunc(value));
    return Result19.ok(null);
  }
  if (Object.prototype.hasOwnProperty.call(raw, "doubleValue")) {
    return Result19.ok(typeof raw.doubleValue === "number" ? raw.doubleValue : Number(raw.doubleValue));
  }
  if (Object.prototype.hasOwnProperty.call(raw, "bytesValue"))
    return Result19.ok(normalizeString4(raw.bytesValue) ?? "");
  if (isPlainObject3(raw.arrayValue) && Array.isArray(raw.arrayValue.values)) {
    if (raw.arrayValue.values.length > limits.maxArrayValuesPerAnyValue) {
      return Result19.err({ message: `OTLP AnyValue array too large (max ${limits.maxArrayValuesPerAnyValue})` });
    }
    const out = [];
    for (const item of raw.arrayValue.values) {
      const valueRes = anyValueFromJsonResult(item, limits, depth + 1);
      if (Result19.isError(valueRes))
        return valueRes;
      out.push(valueRes.value);
    }
    return Result19.ok(out);
  }
  if (isPlainObject3(raw.kvlistValue) && Array.isArray(raw.kvlistValue.values)) {
    return keyValuesFromJsonResult(raw.kvlistValue.values, limits, depth + 1, true);
  }
  return Result19.ok(structuredClone(raw));
}
function keyValuesFromJsonResult(raw, limits, depth, enforceCollectionLimit) {
  const depthRes = checkAnyValueDepthResult(depth, limits);
  if (Result19.isError(depthRes))
    return depthRes;
  const out = {};
  if (!Array.isArray(raw))
    return Result19.ok(out);
  if (enforceCollectionLimit && raw.length > limits.maxKvListValuesPerAnyValue) {
    return Result19.err({ message: `OTLP AnyValue kvlist too large (max ${limits.maxKvListValuesPerAnyValue})` });
  }
  for (const item of raw) {
    if (!isPlainObject3(item))
      continue;
    const key = normalizeString4(item.key);
    if (!key)
      continue;
    const valueRes = anyValueFromJsonResult(item.value, limits, depth);
    if (Result19.isError(valueRes))
      return valueRes;
    out[key] = valueRes.value;
  }
  return Result19.ok(out);
}
function eventFromJsonResult(raw, limits) {
  if (!isPlainObject3(raw))
    return Result19.ok(null);
  const attrsRes = keyValuesFromJsonResult(raw.attributes, limits, 0, false);
  if (Result19.isError(attrsRes))
    return attrsRes;
  return Result19.ok({
    timeUnixNano: normalizeNanoString2(raw.timeUnixNano),
    name: normalizeString4(raw.name) ?? "",
    attributes: attrsRes.value,
    droppedAttributesCount: typeof raw.droppedAttributesCount === "number" ? raw.droppedAttributesCount : Number(raw.droppedAttributesCount ?? 0)
  });
}
function linkFromJsonResult(raw, limits) {
  if (!isPlainObject3(raw))
    return Result19.ok(null);
  const traceId = normalizeString4(raw.traceId);
  const spanId = normalizeString4(raw.spanId);
  if (!traceId || !spanId)
    return Result19.ok(null);
  const attrsRes = keyValuesFromJsonResult(raw.attributes, limits, 0, false);
  if (Result19.isError(attrsRes))
    return attrsRes;
  return Result19.ok({
    traceId,
    spanId,
    traceState: normalizeString4(raw.traceState),
    attributes: attrsRes.value,
    droppedAttributesCount: typeof raw.droppedAttributesCount === "number" ? raw.droppedAttributesCount : Number(raw.droppedAttributesCount ?? 0)
  });
}
function spanFromJsonResult(raw, limits) {
  if (!isPlainObject3(raw))
    return Result19.ok(null);
  const traceId = normalizeString4(raw.traceId);
  const spanId = normalizeString4(raw.spanId);
  if (!traceId || !spanId)
    return Result19.ok(null);
  const status = isPlainObject3(raw.status) ? raw.status : {};
  const attrsRes = keyValuesFromJsonResult(raw.attributes, limits, 0, false);
  if (Result19.isError(attrsRes))
    return attrsRes;
  const events = [];
  if (Array.isArray(raw.events)) {
    for (const eventRaw of raw.events) {
      const eventRes = eventFromJsonResult(eventRaw, limits);
      if (Result19.isError(eventRes))
        return eventRes;
      if (eventRes.value)
        events.push(eventRes.value);
    }
  }
  const links = [];
  if (Array.isArray(raw.links)) {
    for (const linkRaw of raw.links) {
      const linkRes = linkFromJsonResult(linkRaw, limits);
      if (Result19.isError(linkRes))
        return linkRes;
      if (linkRes.value)
        links.push(linkRes.value);
    }
  }
  return Result19.ok({
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
    return Result19.err({ message: `too many ${label} in OTLP request (max ${max})` });
  return Result19.ok(undefined);
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
    return Result19.err({ message: "invalid OTLP JSON" });
  }
  if (!isPlainObject3(parsed))
    return Result19.err({ message: "OTLP JSON request must be an object" });
  const out = [];
  const counters = { resourceSpans: 0, scopeSpans: 0, spans: 0, rejectedSpans: 0, warnings: [] };
  const resourceSpans = Array.isArray(parsed.resourceSpans) ? parsed.resourceSpans : [];
  for (const resourceSpanRaw of resourceSpans) {
    const resourceLimitRes = incrementLimitCounter(counters, "resourceSpans", limits.maxResourceSpansPerRequest, "resourceSpans");
    if (Result19.isError(resourceLimitRes))
      return resourceLimitRes;
    if (!isPlainObject3(resourceSpanRaw))
      continue;
    const resource = isPlainObject3(resourceSpanRaw.resource) ? resourceSpanRaw.resource : {};
    const resourceAttributesRes = keyValuesFromJsonResult(resource.attributes, limits, 0, false);
    if (Result19.isError(resourceAttributesRes))
      return resourceAttributesRes;
    const resourceAttributes = resourceAttributesRes.value;
    const resourceSchemaUrl = normalizeString4(resourceSpanRaw.schemaUrl);
    const scopeSpans = [
      ...Array.isArray(resourceSpanRaw.scopeSpans) ? resourceSpanRaw.scopeSpans : [],
      ...Array.isArray(resourceSpanRaw.instrumentationLibrarySpans) ? resourceSpanRaw.instrumentationLibrarySpans : []
    ];
    for (const scopeSpanRaw of scopeSpans) {
      const scopeLimitRes = incrementLimitCounter(counters, "scopeSpans", limits.maxScopeSpansPerRequest, "scopeSpans");
      if (Result19.isError(scopeLimitRes))
        return scopeLimitRes;
      if (!isPlainObject3(scopeSpanRaw))
        continue;
      const scopeRaw = isPlainObject3(scopeSpanRaw.scope) ? scopeSpanRaw.scope : isPlainObject3(scopeSpanRaw.instrumentationLibrary) ? scopeSpanRaw.instrumentationLibrary : {};
      const scopeAttrsRes = keyValuesFromJsonResult(scopeRaw.attributes, limits, 0, false);
      if (Result19.isError(scopeAttrsRes))
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
        if (Result19.isError(spanRes))
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
  return Result19.ok({ spans: out, rejectedSpans: counters.rejectedSpans, warnings: counters.warnings });
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
    if (Result19.isError(tagRes))
      return tagRes;
    const tag = Number(tagRes.value);
    if (tag === 0)
      return Result19.err({ message: "invalid protobuf tag" });
    return Result19.ok({ field: tag >>> 3, wire: tag & 7 });
  }
  readVarint() {
    let shift = 0n;
    let out = 0n;
    while (shift <= 63n) {
      if (this.pos >= this.bytes.byteLength)
        return Result19.err({ message: "truncated protobuf varint" });
      const byte = this.bytes[this.pos++];
      out |= BigInt(byte & 127) << shift;
      if ((byte & 128) === 0)
        return Result19.ok(out);
      shift += 7n;
    }
    return Result19.err({ message: "protobuf varint too long" });
  }
  readFixed32() {
    if (this.pos + 4 > this.bytes.byteLength)
      return Result19.err({ message: "truncated protobuf fixed32" });
    const view = new DataView(this.bytes.buffer, this.bytes.byteOffset + this.pos, 4);
    this.pos += 4;
    return Result19.ok(view.getUint32(0, true));
  }
  readFixed64() {
    if (this.pos + 8 > this.bytes.byteLength)
      return Result19.err({ message: "truncated protobuf fixed64" });
    const view = new DataView(this.bytes.buffer, this.bytes.byteOffset + this.pos, 8);
    this.pos += 8;
    return Result19.ok(view.getBigUint64(0, true));
  }
  readDouble() {
    if (this.pos + 8 > this.bytes.byteLength)
      return Result19.err({ message: "truncated protobuf double" });
    const view = new DataView(this.bytes.buffer, this.bytes.byteOffset + this.pos, 8);
    this.pos += 8;
    return Result19.ok(view.getFloat64(0, true));
  }
  readBytes() {
    const lenRes = this.readVarint();
    if (Result19.isError(lenRes))
      return lenRes;
    const len = Number(lenRes.value);
    if (!Number.isSafeInteger(len) || len < 0 || this.pos + len > this.bytes.byteLength) {
      return Result19.err({ message: "truncated protobuf bytes" });
    }
    const out = this.bytes.slice(this.pos, this.pos + len);
    this.pos += len;
    return Result19.ok(out);
  }
  readString() {
    const bytesRes = this.readBytes();
    if (Result19.isError(bytesRes))
      return bytesRes;
    return Result19.ok(JSON_TEXT_DECODER.decode(bytesRes.value));
  }
  skip(wire) {
    if (wire === 0) {
      const res = this.readVarint();
      return Result19.isError(res) ? res : Result19.ok(undefined);
    }
    if (wire === 1) {
      const res = this.readFixed64();
      return Result19.isError(res) ? res : Result19.ok(undefined);
    }
    if (wire === 2) {
      const res = this.readBytes();
      return Result19.isError(res) ? res : Result19.ok(undefined);
    }
    if (wire === 5) {
      const res = this.readFixed32();
      return Result19.isError(res) ? res : Result19.ok(undefined);
    }
    return Result19.err({ message: `unsupported protobuf wire type ${wire}` });
  }
}
function signedInt64(value) {
  return value > 9223372036854775807n ? (value - 18446744073709551616n).toString() : value.toString();
}
function decodeAnyValue(bytes, limits, depth = 0) {
  const depthRes = checkAnyValueDepthResult(depth, limits);
  if (Result19.isError(depthRes))
    return depthRes;
  const reader = new ProtoReader(bytes);
  let value = null;
  while (!reader.eof()) {
    const tagRes = reader.readTag();
    if (Result19.isError(tagRes))
      return tagRes;
    const { field, wire } = tagRes.value;
    if (field === 1 && wire === 2) {
      const res = reader.readString();
      if (Result19.isError(res))
        return res;
      value = res.value;
    } else if (field === 2 && wire === 0) {
      const res = reader.readVarint();
      if (Result19.isError(res))
        return res;
      value = res.value !== 0n;
    } else if (field === 3 && wire === 0) {
      const res = reader.readVarint();
      if (Result19.isError(res))
        return res;
      value = signedInt64(res.value);
    } else if (field === 4 && wire === 1) {
      const res = reader.readDouble();
      if (Result19.isError(res))
        return res;
      value = res.value;
    } else if (field === 5 && wire === 2) {
      const bytesRes = reader.readBytes();
      if (Result19.isError(bytesRes))
        return bytesRes;
      const arrayRes = decodeArrayValue(bytesRes.value, limits, depth + 1);
      if (Result19.isError(arrayRes))
        return arrayRes;
      value = arrayRes.value;
    } else if (field === 6 && wire === 2) {
      const bytesRes = reader.readBytes();
      if (Result19.isError(bytesRes))
        return bytesRes;
      const kvRes = decodeKeyValueList(bytesRes.value, limits, depth + 1, true);
      if (Result19.isError(kvRes))
        return kvRes;
      value = kvRes.value;
    } else if (field === 7 && wire === 2) {
      const bytesRes = reader.readBytes();
      if (Result19.isError(bytesRes))
        return bytesRes;
      value = Buffer.from(bytesRes.value).toString("base64");
    } else {
      const skipRes = reader.skip(wire);
      if (Result19.isError(skipRes))
        return skipRes;
    }
  }
  return Result19.ok(value);
}
function decodeArrayValue(bytes, limits, depth) {
  const depthRes = checkAnyValueDepthResult(depth, limits);
  if (Result19.isError(depthRes))
    return depthRes;
  const reader = new ProtoReader(bytes);
  const out = [];
  while (!reader.eof()) {
    const tagRes = reader.readTag();
    if (Result19.isError(tagRes))
      return tagRes;
    if (tagRes.value.field === 1 && tagRes.value.wire === 2) {
      if (out.length >= limits.maxArrayValuesPerAnyValue) {
        return Result19.err({ message: `OTLP AnyValue array too large (max ${limits.maxArrayValuesPerAnyValue})` });
      }
      const bytesRes = reader.readBytes();
      if (Result19.isError(bytesRes))
        return bytesRes;
      const valueRes = decodeAnyValue(bytesRes.value, limits, depth);
      if (Result19.isError(valueRes))
        return valueRes;
      out.push(valueRes.value);
    } else {
      const skipRes = reader.skip(tagRes.value.wire);
      if (Result19.isError(skipRes))
        return skipRes;
    }
  }
  return Result19.ok(out);
}
function decodeKeyValue(bytes, limits, depth) {
  const reader = new ProtoReader(bytes);
  let key = "";
  let value = null;
  while (!reader.eof()) {
    const tagRes = reader.readTag();
    if (Result19.isError(tagRes))
      return tagRes;
    const { field, wire } = tagRes.value;
    if (field === 1 && wire === 2) {
      const keyRes = reader.readString();
      if (Result19.isError(keyRes))
        return keyRes;
      key = keyRes.value;
    } else if (field === 2 && wire === 2) {
      const bytesRes = reader.readBytes();
      if (Result19.isError(bytesRes))
        return bytesRes;
      const valueRes = decodeAnyValue(bytesRes.value, limits, depth);
      if (Result19.isError(valueRes))
        return valueRes;
      value = valueRes.value;
    } else {
      const skipRes = reader.skip(wire);
      if (Result19.isError(skipRes))
        return skipRes;
    }
  }
  return Result19.ok(key === "" ? null : { key, value });
}
function decodeKeyValueList(bytes, limits, depth, enforceCollectionLimit) {
  const depthRes = checkAnyValueDepthResult(depth, limits);
  if (Result19.isError(depthRes))
    return depthRes;
  const reader = new ProtoReader(bytes);
  const out = {};
  let count = 0;
  while (!reader.eof()) {
    const tagRes = reader.readTag();
    if (Result19.isError(tagRes))
      return tagRes;
    if (tagRes.value.field === 1 && tagRes.value.wire === 2) {
      count += 1;
      if (enforceCollectionLimit && count > limits.maxKvListValuesPerAnyValue) {
        return Result19.err({ message: `OTLP AnyValue kvlist too large (max ${limits.maxKvListValuesPerAnyValue})` });
      }
      const bytesRes = reader.readBytes();
      if (Result19.isError(bytesRes))
        return bytesRes;
      const kvRes = decodeKeyValue(bytesRes.value, limits, depth);
      if (Result19.isError(kvRes))
        return kvRes;
      if (kvRes.value)
        out[kvRes.value.key] = kvRes.value.value;
    } else {
      const skipRes = reader.skip(tagRes.value.wire);
      if (Result19.isError(skipRes))
        return skipRes;
    }
  }
  return Result19.ok(out);
}
function decodeResource(bytes, limits) {
  return decodeKeyValueList(bytes, limits, 0, false);
}
function decodeScope(bytes, limits) {
  const reader = new ProtoReader(bytes);
  const scope = { name: null, version: null, schemaUrl: null, attributes: {} };
  while (!reader.eof()) {
    const tagRes = reader.readTag();
    if (Result19.isError(tagRes))
      return tagRes;
    const { field, wire } = tagRes.value;
    if (field === 1 && wire === 2) {
      const res = reader.readString();
      if (Result19.isError(res))
        return res;
      scope.name = res.value;
    } else if (field === 2 && wire === 2) {
      const res = reader.readString();
      if (Result19.isError(res))
        return res;
      scope.version = res.value;
    } else if (field === 3 && wire === 2) {
      const bytesRes = reader.readBytes();
      if (Result19.isError(bytesRes))
        return bytesRes;
      const kvRes = decodeKeyValue(bytesRes.value, limits, 0);
      if (Result19.isError(kvRes))
        return kvRes;
      if (kvRes.value)
        scope.attributes[kvRes.value.key] = kvRes.value.value;
    } else {
      const skipRes = reader.skip(wire);
      if (Result19.isError(skipRes))
        return skipRes;
    }
  }
  return Result19.ok(scope);
}
function decodeStatus(bytes) {
  const reader = new ProtoReader(bytes);
  const status = {};
  while (!reader.eof()) {
    const tagRes = reader.readTag();
    if (Result19.isError(tagRes))
      return tagRes;
    const { field, wire } = tagRes.value;
    if ((field === 1 || field === 3) && wire === 0) {
      const res = reader.readVarint();
      if (Result19.isError(res))
        return res;
      status.code = Number(res.value);
    } else if (field === 2 && wire === 2) {
      const res = reader.readString();
      if (Result19.isError(res))
        return res;
      status.message = res.value;
    } else {
      const skipRes = reader.skip(wire);
      if (Result19.isError(skipRes))
        return skipRes;
    }
  }
  return Result19.ok(status);
}
function decodeEvent(bytes, limits) {
  const reader = new ProtoReader(bytes);
  const event = { timeUnixNano: null, name: "", attributes: {}, droppedAttributesCount: 0 };
  while (!reader.eof()) {
    const tagRes = reader.readTag();
    if (Result19.isError(tagRes))
      return tagRes;
    const { field, wire } = tagRes.value;
    if (field === 1 && (wire === 1 || wire === 0)) {
      const res = wire === 1 ? reader.readFixed64() : reader.readVarint();
      if (Result19.isError(res))
        return res;
      event.timeUnixNano = res.value.toString();
    } else if (field === 2 && wire === 2) {
      const res = reader.readString();
      if (Result19.isError(res))
        return res;
      event.name = res.value;
    } else if (field === 3 && wire === 2) {
      const bytesRes = reader.readBytes();
      if (Result19.isError(bytesRes))
        return bytesRes;
      const kvRes = decodeKeyValue(bytesRes.value, limits, 0);
      if (Result19.isError(kvRes))
        return kvRes;
      if (kvRes.value)
        event.attributes[kvRes.value.key] = kvRes.value.value;
    } else if (field === 4 && wire === 0) {
      const res = reader.readVarint();
      if (Result19.isError(res))
        return res;
      event.droppedAttributesCount = Number(res.value);
    } else {
      const skipRes = reader.skip(wire);
      if (Result19.isError(skipRes))
        return skipRes;
    }
  }
  return Result19.ok(event);
}
function decodeLink(bytes, limits) {
  const reader = new ProtoReader(bytes);
  const link = { traceId: "", spanId: "", traceState: null, attributes: {}, droppedAttributesCount: 0 };
  while (!reader.eof()) {
    const tagRes = reader.readTag();
    if (Result19.isError(tagRes))
      return tagRes;
    const { field, wire } = tagRes.value;
    if (field === 1 && wire === 2) {
      const res = reader.readBytes();
      if (Result19.isError(res))
        return res;
      link.traceId = hexFromBytes(res.value);
    } else if (field === 2 && wire === 2) {
      const res = reader.readBytes();
      if (Result19.isError(res))
        return res;
      link.spanId = hexFromBytes(res.value);
    } else if (field === 3 && wire === 2) {
      const res = reader.readString();
      if (Result19.isError(res))
        return res;
      link.traceState = res.value;
    } else if (field === 4 && wire === 2) {
      const bytesRes = reader.readBytes();
      if (Result19.isError(bytesRes))
        return bytesRes;
      const kvRes = decodeKeyValue(bytesRes.value, limits, 0);
      if (Result19.isError(kvRes))
        return kvRes;
      if (kvRes.value)
        link.attributes[kvRes.value.key] = kvRes.value.value;
    } else if (field === 5 && wire === 0) {
      const res = reader.readVarint();
      if (Result19.isError(res))
        return res;
      link.droppedAttributesCount = Number(res.value);
    } else {
      const skipRes = reader.skip(wire);
      if (Result19.isError(skipRes))
        return skipRes;
    }
  }
  return Result19.ok(link);
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
    if (Result19.isError(tagRes))
      return tagRes;
    const { field, wire } = tagRes.value;
    if (field === 1 && wire === 2) {
      const res = reader.readBytes();
      if (Result19.isError(res))
        return res;
      span.traceId = hexFromBytes(res.value);
    } else if (field === 2 && wire === 2) {
      const res = reader.readBytes();
      if (Result19.isError(res))
        return res;
      span.spanId = hexFromBytes(res.value);
    } else if (field === 3 && wire === 2) {
      const res = reader.readString();
      if (Result19.isError(res))
        return res;
      span.traceState = res.value;
    } else if (field === 4 && wire === 2) {
      const res = reader.readBytes();
      if (Result19.isError(res))
        return res;
      span.parentSpanId = res.value.byteLength === 0 ? null : hexFromBytes(res.value);
    } else if (field === 5 && wire === 2) {
      const res = reader.readString();
      if (Result19.isError(res))
        return res;
      span.name = res.value;
    } else if (field === 6 && wire === 0) {
      const res = reader.readVarint();
      if (Result19.isError(res))
        return res;
      span.kind = Number(res.value);
    } else if ((field === 7 || field === 8) && (wire === 1 || wire === 0)) {
      const res = wire === 1 ? reader.readFixed64() : reader.readVarint();
      if (Result19.isError(res))
        return res;
      if (field === 7)
        span.startUnixNano = res.value.toString();
      else
        span.endUnixNano = res.value.toString();
    } else if (field === 9 && wire === 2) {
      const bytesRes = reader.readBytes();
      if (Result19.isError(bytesRes))
        return bytesRes;
      const kvRes = decodeKeyValue(bytesRes.value, limits, 0);
      if (Result19.isError(kvRes))
        return kvRes;
      if (kvRes.value)
        span.attributes[kvRes.value.key] = kvRes.value.value;
    } else if (field === 10 && wire === 0) {
      const res = reader.readVarint();
      if (Result19.isError(res))
        return res;
      span.droppedAttributesCount = Number(res.value);
    } else if (field === 11 && wire === 2) {
      const bytesRes = reader.readBytes();
      if (Result19.isError(bytesRes))
        return bytesRes;
      const eventRes = decodeEvent(bytesRes.value, limits);
      if (Result19.isError(eventRes))
        return eventRes;
      span.events.push(eventRes.value);
    } else if (field === 12 && wire === 0) {
      const res = reader.readVarint();
      if (Result19.isError(res))
        return res;
      span.droppedEventsCount = Number(res.value);
    } else if (field === 13 && wire === 2) {
      const bytesRes = reader.readBytes();
      if (Result19.isError(bytesRes))
        return bytesRes;
      const linkRes = decodeLink(bytesRes.value, limits);
      if (Result19.isError(linkRes))
        return linkRes;
      span.links.push(linkRes.value);
    } else if (field === 14 && wire === 0) {
      const res = reader.readVarint();
      if (Result19.isError(res))
        return res;
      span.droppedLinksCount = Number(res.value);
    } else if (field === 15 && wire === 2) {
      const bytesRes = reader.readBytes();
      if (Result19.isError(bytesRes))
        return bytesRes;
      const statusRes = decodeStatus(bytesRes.value);
      if (Result19.isError(statusRes))
        return statusRes;
      span.status = statusRes.value;
    } else if (field === 16 && (wire === 5 || wire === 0)) {
      if (wire === 5) {
        const res = reader.readFixed32();
        if (Result19.isError(res))
          return res;
        span.traceFlags = res.value;
      } else {
        const res = reader.readVarint();
        if (Result19.isError(res))
          return res;
        span.traceFlags = Number(res.value);
      }
    } else {
      const skipRes = reader.skip(wire);
      if (Result19.isError(skipRes))
        return skipRes;
    }
  }
  return Result19.ok(span);
}
function decodeScopeSpans(bytes, limits, counters) {
  const reader = new ProtoReader(bytes);
  const out = {
    scope: { name: null, version: null, schemaUrl: null, attributes: {} },
    spans: []
  };
  while (!reader.eof()) {
    const tagRes = reader.readTag();
    if (Result19.isError(tagRes))
      return tagRes;
    const { field, wire } = tagRes.value;
    if ((field === 1 || field === 1000) && wire === 2) {
      const bytesRes = reader.readBytes();
      if (Result19.isError(bytesRes))
        return bytesRes;
      const scopeRes = decodeScope(bytesRes.value, limits);
      if (Result19.isError(scopeRes))
        return scopeRes;
      out.scope = { ...out.scope, ...scopeRes.value };
    } else if (field === 2 && wire === 2) {
      const bytesRes = reader.readBytes();
      if (Result19.isError(bytesRes))
        return bytesRes;
      if (!acceptSpanForDecode(counters, limits))
        continue;
      const spanRes = decodeSpan(bytesRes.value, limits);
      if (Result19.isError(spanRes))
        return spanRes;
      out.spans.push(spanRes.value);
    } else if (field === 3 && wire === 2) {
      const res = reader.readString();
      if (Result19.isError(res))
        return res;
      out.scope.schemaUrl = res.value;
    } else {
      const skipRes = reader.skip(wire);
      if (Result19.isError(skipRes))
        return skipRes;
    }
  }
  return Result19.ok(out);
}
function decodeResourceSpans(bytes, limits, counters) {
  const reader = new ProtoReader(bytes);
  const out = { resourceAttributes: {}, resourceSchemaUrl: null, scopeSpans: [] };
  while (!reader.eof()) {
    const tagRes = reader.readTag();
    if (Result19.isError(tagRes))
      return tagRes;
    const { field, wire } = tagRes.value;
    if (field === 1 && wire === 2) {
      const bytesRes = reader.readBytes();
      if (Result19.isError(bytesRes))
        return bytesRes;
      const resourceRes = decodeResource(bytesRes.value, limits);
      if (Result19.isError(resourceRes))
        return resourceRes;
      out.resourceAttributes = resourceRes.value;
    } else if ((field === 2 || field === 1000) && wire === 2) {
      const scopeLimitRes = incrementLimitCounter(counters, "scopeSpans", limits.maxScopeSpansPerRequest, "scopeSpans");
      if (Result19.isError(scopeLimitRes))
        return scopeLimitRes;
      const bytesRes = reader.readBytes();
      if (Result19.isError(bytesRes))
        return bytesRes;
      const scopeRes = decodeScopeSpans(bytesRes.value, limits, counters);
      if (Result19.isError(scopeRes))
        return scopeRes;
      out.scopeSpans.push(scopeRes.value);
    } else if (field === 3 && wire === 2) {
      const res = reader.readString();
      if (Result19.isError(res))
        return res;
      out.resourceSchemaUrl = res.value;
    } else {
      const skipRes = reader.skip(wire);
      if (Result19.isError(skipRes))
        return skipRes;
    }
  }
  return Result19.ok(out);
}
function decodeProtobufExportResult(body, limits) {
  const reader = new ProtoReader(body);
  const out = [];
  const counters = { resourceSpans: 0, scopeSpans: 0, spans: 0, rejectedSpans: 0, warnings: [] };
  while (!reader.eof()) {
    const tagRes = reader.readTag();
    if (Result19.isError(tagRes))
      return tagRes;
    if (tagRes.value.field === 1 && tagRes.value.wire === 2) {
      const resourceLimitRes = incrementLimitCounter(counters, "resourceSpans", limits.maxResourceSpansPerRequest, "resourceSpans");
      if (Result19.isError(resourceLimitRes))
        return resourceLimitRes;
      const bytesRes = reader.readBytes();
      if (Result19.isError(bytesRes))
        return bytesRes;
      const resourceSpansRes = decodeResourceSpans(bytesRes.value, limits, counters);
      if (Result19.isError(resourceSpansRes))
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
      if (Result19.isError(skipRes))
        return skipRes;
    }
  }
  return Result19.ok({ spans: out, rejectedSpans: counters.rejectedSpans, warnings: counters.warnings });
}
function decodeBody(args) {
  let body = args.body;
  const maxDecodedBytes = Math.min(args.maxDecodedBytes, args.limits.maxDecodedBytes);
  const encoding = args.contentEncoding?.trim().toLowerCase() ?? "";
  if (encoding !== "" && encoding !== "identity" && encoding !== "gzip") {
    return Result19.err({ status: 415, message: "unsupported content-encoding" });
  }
  if (encoding === "gzip") {
    if (body.byteLength > args.limits.maxCompressedBytes) {
      return Result19.err({ status: 413, message: `compressed OTLP body too large (max ${args.limits.maxCompressedBytes})` });
    }
    try {
      body = new Uint8Array(gunzipSync(body, { maxOutputLength: maxDecodedBytes }));
    } catch (error) {
      const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
      if (code === "ERR_BUFFER_TOO_LARGE") {
        return Result19.err({ status: 413, message: `decoded OTLP body too large (max ${maxDecodedBytes})` });
      }
      return Result19.err({ status: 400, message: "invalid gzip body" });
    }
  }
  if (body.byteLength > maxDecodedBytes) {
    return Result19.err({ status: 413, message: `decoded OTLP body too large (max ${maxDecodedBytes})` });
  }
  const contentType = baseContentType(args.contentType);
  if (contentType === JSON_CONTENT_TYPE) {
    const spansRes = decodeJsonExportResult(body, args.limits);
    if (Result19.isError(spansRes))
      return Result19.err({ status: 400, message: spansRes.error.message });
    return Result19.ok({ ...spansRes.value, responseEncoding: "json" });
  }
  if (contentType === PROTOBUF_CONTENT_TYPE) {
    const spansRes = decodeProtobufExportResult(body, args.limits);
    if (Result19.isError(spansRes))
      return Result19.err({ status: 400, message: spansRes.error.message });
    return Result19.ok({ ...spansRes.value, responseEncoding: "protobuf" });
  }
  return Result19.err({ status: 415, message: "OTLP traces require application/x-protobuf or application/json" });
}
function decodeOtlpTraceExportRequestResult(args) {
  const limits = { ...DEFAULT_OTLP_LIMITS, ...args.profile.otlpLimits ?? {} };
  const decodedRes = decodeBody({ ...args, limits });
  if (Result19.isError(decodedRes))
    return decodedRes;
  const records = [];
  const warnings = [...decodedRes.value.warnings];
  let rejectedSpans = decodedRes.value.rejectedSpans;
  for (const span of decodedRes.value.spans) {
    const normalizedRes = normalizeOtelDecodedSpanResult(args.profile, span);
    if (Result19.isError(normalizedRes)) {
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
  return Result19.ok({
    records,
    acceptedSpans: records.length,
    rejectedSpans,
    warnings,
    responseEncoding: decodedRes.value.responseEncoding
  });
}
function writeVarint(out, value) {
  let n = value;
  while (n >= 0x80n) {
    out.push(Number(n & 0x7fn | 0x80n));
    n >>= 7n;
  }
  out.push(Number(n));
}
function writeTag(out, field, wire) {
  writeVarint(out, BigInt(field << 3 | wire));
}
function writeString(out, field, value) {
  const bytes = new TextEncoder().encode(value);
  writeTag(out, field, 2);
  writeVarint(out, BigInt(bytes.byteLength));
  out.push(...bytes);
}
function writeInt64(out, field, value) {
  writeTag(out, field, 0);
  writeVarint(out, value);
}
function writeMessage(out, field, body) {
  writeTag(out, field, 2);
  writeVarint(out, BigInt(body.length));
  out.push(...body);
}
function encodeOtlpTraceExportResponse(result) {
  const message = result.rejectedSpans > 0 ? `${result.rejectedSpans} spans rejected${result.warnings.length > 0 ? `: ${result.warnings.join("; ")}` : ""}` : "";
  if (result.responseEncoding === "json") {
    if (result.rejectedSpans === 0)
      return { contentType: "application/json; charset=utf-8", body: "{}" };
    return {
      contentType: "application/json; charset=utf-8",
      body: JSON.stringify({
        partialSuccess: {
          rejectedSpans: result.rejectedSpans,
          errorMessage: message
        }
      })
    };
  }
  if (result.rejectedSpans === 0)
    return { contentType: PROTOBUF_CONTENT_TYPE, body: new Uint8Array };
  const partial = [];
  writeInt64(partial, 1, BigInt(result.rejectedSpans));
  writeString(partial, 2, message);
  const response = [];
  writeMessage(response, 1, partial);
  return { contentType: PROTOBUF_CONTENT_TYPE, body: new Uint8Array(response) };
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
    return Result20.ok(undefined);
  if (!Array.isArray(raw))
    return Result20.err({ message: `${path} must be an array of strings` });
  if (raw.length > maxItems)
    return Result20.err({ message: `${path} too large (max ${maxItems})` });
  const out = [];
  const seen = new Set;
  for (const item of raw) {
    if (typeof item !== "string")
      return Result20.err({ message: `${path} must be an array of strings` });
    const value = item.trim();
    if (value === "")
      return Result20.err({ message: `${path} must not contain empty strings` });
    const key = value.toLowerCase();
    if (seen.has(key))
      continue;
    seen.add(key);
    out.push(path.endsWith("redactKeys") ? key : value);
  }
  return Result20.ok(out);
}
function parsePositiveIntResult(raw, path, fallback) {
  if (raw === undefined)
    return Result20.ok(fallback);
  if (typeof raw !== "number" || !Number.isFinite(raw) || !Number.isInteger(raw) || raw <= 0) {
    return Result20.err({ message: `${path} must be a positive integer` });
  }
  return Result20.ok(raw);
}
function parseAttributeLimitsResult(raw, path) {
  if (raw === undefined)
    return Result20.ok(undefined);
  const objRes = expectPlainObjectResult(raw, path);
  if (Result20.isError(objRes))
    return objRes;
  const keyCheck = rejectUnknownKeysResult(objRes.value, ["maxAttributeValueBytes", "maxAttributesPerSpan", "maxEventsPerSpan", "maxLinksPerSpan", "maxStatementBytes"], path);
  if (Result20.isError(keyCheck))
    return keyCheck;
  const out = {};
  for (const key of Object.keys(DEFAULT_ATTRIBUTE_LIMITS)) {
    const valueRes = parsePositiveIntResult(objRes.value[key], `${path}.${key}`, DEFAULT_ATTRIBUTE_LIMITS[key]);
    if (Result20.isError(valueRes))
      return valueRes;
    if (objRes.value[key] !== undefined)
      out[key] = valueRes.value;
  }
  return Result20.ok(Object.keys(out).length > 0 ? out : undefined);
}
function parseOtlpLimitsResult(raw, path) {
  if (raw === undefined)
    return Result20.ok(undefined);
  const objRes = expectPlainObjectResult(raw, path);
  if (Result20.isError(objRes))
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
  if (Result20.isError(keyCheck))
    return keyCheck;
  const out = {};
  for (const key of Object.keys(DEFAULT_OTLP_LIMITS)) {
    const valueRes = parsePositiveIntResult(objRes.value[key], `${path}.${key}`, DEFAULT_OTLP_LIMITS[key]);
    if (Result20.isError(valueRes))
      return valueRes;
    if (objRes.value[key] !== undefined)
      out[key] = valueRes.value;
  }
  return Result20.ok(Object.keys(out).length > 0 ? out : undefined);
}
function parseStoreResult(raw, path) {
  if (raw === undefined)
    return Result20.ok(undefined);
  const objRes = expectPlainObjectResult(raw, path);
  if (Result20.isError(objRes))
    return objRes;
  const keyCheck = rejectUnknownKeysResult(objRes.value, ["rawResourceAttributes", "rawSpanAttributes", "rawEvents", "rawLinks"], path);
  if (Result20.isError(keyCheck))
    return keyCheck;
  const out = {};
  for (const key of Object.keys(DEFAULT_STORE_CONFIG)) {
    const value = objRes.value[key];
    if (value === undefined)
      continue;
    if (typeof value !== "boolean")
      return Result20.err({ message: `${path}.${key} must be boolean` });
    out[key] = value;
  }
  return Result20.ok(Object.keys(out).length > 0 ? out : undefined);
}
function parseDbStatementModeResult(raw, path) {
  if (raw === undefined)
    return Result20.ok(undefined);
  if (raw === "drop" || raw === "raw")
    return Result20.ok(raw);
  return Result20.err({ message: `${path} must be drop or raw` });
}
function parseUrlModeResult(raw, path) {
  if (raw === undefined)
    return Result20.ok(undefined);
  if (raw === "drop_query" || raw === "raw")
    return Result20.ok(raw);
  return Result20.err({ message: `${path} must be drop_query or raw` });
}
function parseStreamNameResult2(raw, path) {
  if (raw === undefined)
    return Result20.ok(undefined);
  if (typeof raw !== "string")
    return Result20.err({ message: `${path} must be a string` });
  const value = raw.trim();
  if (value === "")
    return Result20.err({ message: `${path} must not be empty` });
  return Result20.ok(value);
}
function parseOtelTracesObservabilityResult(raw, path) {
  if (raw === undefined)
    return Result20.ok(undefined);
  const objRes = expectPlainObjectResult(raw, path);
  if (Result20.isError(objRes))
    return objRes;
  const keyCheck = rejectUnknownKeysResult(objRes.value, ["request"], path);
  if (Result20.isError(keyCheck))
    return keyCheck;
  if (objRes.value.request === undefined)
    return Result20.ok(undefined);
  const requestRes = expectPlainObjectResult(objRes.value.request, `${path}.request`);
  if (Result20.isError(requestRes))
    return requestRes;
  const requestKeyCheck = rejectUnknownKeysResult(requestRes.value, ["eventsStream"], `${path}.request`);
  if (Result20.isError(requestKeyCheck))
    return requestKeyCheck;
  const eventsStreamRes = parseStreamNameResult2(requestRes.value.eventsStream, `${path}.request.eventsStream`);
  if (Result20.isError(eventsStreamRes))
    return eventsStreamRes;
  if (!eventsStreamRes.value)
    return Result20.ok(undefined);
  return Result20.ok({
    request: {
      eventsStream: eventsStreamRes.value
    }
  });
}
function validateOtelTracesProfileResult(raw, path) {
  const objRes = expectPlainObjectResult(raw, path);
  if (Result20.isError(objRes))
    return objRes;
  if (objRes.value.kind !== "otel-traces")
    return Result20.err({ message: `${path}.kind must be otel-traces` });
  const keyCheck = rejectUnknownKeysResult(objRes.value, ["kind", "redactKeys", "requestIdAttributes", "attributeLimits", "store", "dbStatementMode", "urlMode", "otlpLimits", "observability"], path);
  if (Result20.isError(keyCheck))
    return keyCheck;
  const redactKeysRes = parseStringArrayResult(objRes.value.redactKeys, `${path}.redactKeys`, 64);
  if (Result20.isError(redactKeysRes))
    return redactKeysRes;
  const requestIdAttributesRes = parseStringArrayResult(objRes.value.requestIdAttributes, `${path}.requestIdAttributes`, 64);
  if (Result20.isError(requestIdAttributesRes))
    return requestIdAttributesRes;
  const limitsRes = parseAttributeLimitsResult(objRes.value.attributeLimits, `${path}.attributeLimits`);
  if (Result20.isError(limitsRes))
    return limitsRes;
  const storeRes = parseStoreResult(objRes.value.store, `${path}.store`);
  if (Result20.isError(storeRes))
    return storeRes;
  const dbStatementModeRes = parseDbStatementModeResult(objRes.value.dbStatementMode, `${path}.dbStatementMode`);
  if (Result20.isError(dbStatementModeRes))
    return dbStatementModeRes;
  const urlModeRes = parseUrlModeResult(objRes.value.urlMode, `${path}.urlMode`);
  if (Result20.isError(urlModeRes))
    return urlModeRes;
  const otlpLimitsRes = parseOtlpLimitsResult(objRes.value.otlpLimits, `${path}.otlpLimits`);
  if (Result20.isError(otlpLimitsRes))
    return otlpLimitsRes;
  const observabilityRes = parseOtelTracesObservabilityResult(objRes.value.observability, `${path}.observability`);
  if (Result20.isError(observabilityRes))
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
  return Result20.ok(profile);
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
      return Result20.ok({ profile: { kind: "otel-traces" }, cache: null });
    const cachedCopy = cloneOtelTracesCache(cached);
    if (cachedCopy && cachedCopy.updatedAtMs === row.updated_at_ms) {
      return Result20.ok({
        profile: cloneOtelTracesProfile(cachedCopy.profile),
        cache: cachedCopy
      });
    }
    const parsedRes = parseStoredProfileJsonResult(row.profile_json);
    if (Result20.isError(parsedRes))
      return parsedRes;
    const profileRes = validateOtelTracesProfileResult(parsedRes.value, "profile");
    if (Result20.isError(profileRes))
      return profileRes;
    const profile = cloneOtelTracesProfile(profileRes.value);
    return Result20.ok({
      profile: cloneOtelTracesProfile(profile),
      cache: { profile, updatedAtMs: row.updated_at_ms }
    });
  },
  persistProfileResult({ db, registry, stream, streamRow, profile }) {
    if (!isOtelTracesProfile(profile))
      return Result20.err({ kind: "bad_request", message: "invalid otel-traces profile" });
    const contentType = normalizeProfileContentType(streamRow.content_type);
    if (contentType !== "application/json") {
      return Result20.err({
        kind: "bad_request",
        message: "otel-traces profile requires application/json stream content-type"
      });
    }
    if (streamRow.profile !== "otel-traces" && streamRow.next_offset > 0n) {
      return Result20.err({
        kind: "bad_request",
        message: "otel-traces profile must be installed before appending data"
      });
    }
    const persistedProfile = cloneOtelTracesProfile(profile);
    const registryRes = registry.replaceRegistryResult(stream, buildOtelTracesDefaultRegistry(stream));
    if (Result20.isError(registryRes)) {
      return Result20.err({ kind: "bad_request", message: registryRes.error.message });
    }
    db.updateStreamProfile(stream, persistedProfile.kind);
    db.upsertStreamProfile(stream, JSON.stringify(persistedProfile));
    db.deleteStreamTouchState(stream);
    const row = db.getStreamProfile(stream);
    return Result20.ok({
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
        return Result20.err({ message: "invalid otel-traces profile" });
      return normalizeOtelTraceRecordResult(profile, value);
    }
  },
  otlpTraces: {
    decodeExportRequestResult({ profile, stream, contentType, contentEncoding, body, maxDecodedBytes }) {
      if (!isOtelTracesProfile(profile))
        return Result20.err({ status: 400, message: "invalid otel-traces profile" });
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
import { Result as Result27 } from "better-result";

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
import { Result as Result25 } from "better-result";

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
import { Result as Result22 } from "better-result";

// src/runtime/hash.ts
import { Result as Result21 } from "better-result";
import { createRequire as createRequire3 } from "node:module";
import { fileURLToPath } from "node:url";
var xxh3Hasher = null;
var xxh64Hasher = null;
var xxh32Hasher = null;
var isBunRuntime = typeof globalThis.Bun !== "undefined";
var require3 = createRequire3(import.meta.url);
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
    return Result21.err({ kind: "hasher_not_initialized", message: `${label} hasher not initialized` });
  hasher.init();
  hasher.update(input);
  const digest = hasher.digest("hex");
  return Result21.ok(toBigIntDigest(digest));
}
function nodeHash32Result(input) {
  if (!xxh32Hasher)
    return Result21.err({ kind: "hasher_not_initialized", message: "xxh32 hasher not initialized" });
  xxh32Hasher.init();
  xxh32Hasher.update(input);
  const digest = xxh32Hasher.digest("hex");
  if (typeof digest === "number")
    return Result21.ok(digest >>> 0);
  const asBigInt = toBigIntDigest(digest);
  return Result21.ok(Number(asBigInt & 0xffff_ffffn) >>> 0);
}
function xxh3BigIntResult(input) {
  if (isBunRuntime)
    return Result21.ok(bunHash64(input, (x) => Bun.hash.xxHash3(x)));
  return nodeHash64Result(input, xxh3Hasher, "xxh3");
}
function xxh3HexResult(input) {
  const res = xxh3BigIntResult(input);
  if (Result21.isError(res))
    return res;
  return Result21.ok(toHex16(res.value));
}
function xxh32Result(input) {
  if (isBunRuntime)
    return Result21.ok(Bun.hash.xxHash32(input) >>> 0);
  return nodeHash32Result(input);
}
function xxh3BigInt(input) {
  const res = xxh3BigIntResult(input);
  if (Result21.isError(res))
    throw dsError(res.error.message);
  return res.value;
}
function xxh3Hex(input) {
  const res = xxh3HexResult(input);
  if (Result21.isError(res))
    throw dsError(res.error.message);
  return res.value;
}

// src/touch/touch_key_id.ts
function touchKeyIdFromRoutingKeyResult(key) {
  const s = key.trim().toLowerCase();
  if (/^[0-9a-f]{16}$/.test(s)) {
    return Result22.ok(Number.parseInt(s.slice(8), 16) >>> 0);
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
function canonicalizeTemplateFields(fields) {
  const out = [...fields].map((f) => ({ name: f.name, encoding: f.encoding }));
  out.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  return out;
}
function templateIdFor(entity, fieldNamesSorted) {
  const parts = [utf8("tpl\x00"), utf8(entity), utf8("\x00")];
  for (let i = 0;i < fieldNamesSorted.length; i++) {
    if (i > 0)
      parts.push(utf8("\x00"));
    parts.push(utf8(fieldNamesSorted[i]));
  }
  return xxh3Hex(concat(parts));
}
function tableKeyIdFor(entity) {
  return xxh3Low32(concat([utf8("tbl\x00"), utf8(entity)]));
}
function templateKeyIdFor(templateIdHex16) {
  const tplBytes = encodeU64Be(BigInt(`0x${templateIdHex16}`));
  return xxh3Low32(concat([utf8("tpl\x00"), tplBytes]));
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
import { Result as Result24 } from "better-result";

// src/touch/spec.ts
import { Result as Result23 } from "better-result";
function isPlainObject4(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function rejectUnknownKeysResult3(obj, allowed, path) {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(obj)) {
    if (!allowedSet.has(key))
      return invalidTouch(`${path}.${key} is not supported`);
  }
  return Result23.ok(undefined);
}
function invalidTouch(message) {
  return Result23.err({ kind: "invalid_touch", message });
}
function parseNumberField(value, defaultValue, message, predicate) {
  const n = value === undefined ? defaultValue : Number(value);
  if (!Number.isFinite(n) || !predicate(n))
    return invalidTouch(message);
  return Result23.ok(n);
}
function parseIntegerField(value, defaultValue, message, predicate) {
  const n = value === undefined ? defaultValue : Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n) || !predicate(n))
    return invalidTouch(message);
  return Result23.ok(n);
}
function validateTouchConfigResult(raw, fieldPath = "touch") {
  if (!isPlainObject4(raw))
    return invalidTouch(`${fieldPath} must be an object`);
  const topLevelCheck = rejectUnknownKeysResult3(raw, [
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
  if (Result23.isError(topLevelCheck))
    return topLevelCheck;
  const enabled = !!raw.enabled;
  if (!enabled) {
    return Result23.ok({ enabled: false });
  }
  const coarseIntervalMsRes = parseNumberField(raw.coarseIntervalMs, 100, `${fieldPath}.coarseIntervalMs must be > 0`, (n) => n > 0);
  if (Result23.isError(coarseIntervalMsRes))
    return coarseIntervalMsRes;
  const touchCoalesceWindowMsRes = parseNumberField(raw.touchCoalesceWindowMs, 100, `${fieldPath}.touchCoalesceWindowMs must be > 0`, (n) => n > 0);
  if (Result23.isError(touchCoalesceWindowMsRes))
    return touchCoalesceWindowMsRes;
  const onMissingBefore = raw.onMissingBefore === undefined ? "coarse" : raw.onMissingBefore;
  if (onMissingBefore !== "coarse" && onMissingBefore !== "skipBefore" && onMissingBefore !== "error") {
    return invalidTouch(`${fieldPath}.onMissingBefore must be coarse|skipBefore|error`);
  }
  const templates = raw.templates === undefined ? {} : isPlainObject4(raw.templates) ? raw.templates : null;
  if (templates == null)
    return invalidTouch(`${fieldPath}.templates must be an object`);
  const templatesCheck = rejectUnknownKeysResult3(templates, ["defaultInactivityTtlMs", "lastSeenPersistIntervalMs", "gcIntervalMs", "maxActiveTemplatesPerEntity", "maxActiveTemplatesPerStream", "activationRateLimitPerMinute"], `${fieldPath}.templates`);
  if (Result23.isError(templatesCheck))
    return templatesCheck;
  const defaultInactivityTtlMsRes = parseNumberField(templates.defaultInactivityTtlMs, 60 * 60 * 1000, `${fieldPath}.templates.defaultInactivityTtlMs must be >= 0`, (n) => n >= 0);
  if (Result23.isError(defaultInactivityTtlMsRes))
    return defaultInactivityTtlMsRes;
  const lastSeenPersistIntervalMsRes = parseNumberField(templates.lastSeenPersistIntervalMs, 5 * 60 * 1000, `${fieldPath}.templates.lastSeenPersistIntervalMs must be > 0`, (n) => n > 0);
  if (Result23.isError(lastSeenPersistIntervalMsRes))
    return lastSeenPersistIntervalMsRes;
  const gcIntervalMsRes = parseNumberField(templates.gcIntervalMs, 60000, `${fieldPath}.templates.gcIntervalMs must be > 0`, (n) => n > 0);
  if (Result23.isError(gcIntervalMsRes))
    return gcIntervalMsRes;
  const maxActiveTemplatesPerEntityRes = parseNumberField(templates.maxActiveTemplatesPerEntity, 256, `${fieldPath}.templates.maxActiveTemplatesPerEntity must be > 0`, (n) => n > 0);
  if (Result23.isError(maxActiveTemplatesPerEntityRes))
    return maxActiveTemplatesPerEntityRes;
  const maxActiveTemplatesPerStreamRes = parseNumberField(templates.maxActiveTemplatesPerStream, 2048, `${fieldPath}.templates.maxActiveTemplatesPerStream must be > 0`, (n) => n > 0);
  if (Result23.isError(maxActiveTemplatesPerStreamRes))
    return maxActiveTemplatesPerStreamRes;
  const activationRateLimitPerMinuteRes = parseNumberField(templates.activationRateLimitPerMinute, 100, `${fieldPath}.templates.activationRateLimitPerMinute must be >= 0`, (n) => n >= 0);
  if (Result23.isError(activationRateLimitPerMinuteRes))
    return activationRateLimitPerMinuteRes;
  const memoryRaw = raw.memory === undefined ? {} : isPlainObject4(raw.memory) ? raw.memory : null;
  if (memoryRaw == null)
    return invalidTouch(`${fieldPath}.memory must be an object`);
  const memoryCheck = rejectUnknownKeysResult3(memoryRaw, ["bucketMs", "filterPow2", "k", "pendingMaxKeys", "keyIndexMaxKeys", "hotKeyTtlMs", "hotTemplateTtlMs", "hotMaxKeys", "hotMaxTemplates"], `${fieldPath}.memory`);
  if (Result23.isError(memoryCheck))
    return memoryCheck;
  const bucketMsRes = parseIntegerField(memoryRaw.bucketMs, 100, `${fieldPath}.memory.bucketMs must be an integer > 0`, (n) => n > 0);
  if (Result23.isError(bucketMsRes))
    return bucketMsRes;
  const filterPow2Res = parseIntegerField(memoryRaw.filterPow2, 22, `${fieldPath}.memory.filterPow2 must be an integer in [10,30]`, (n) => n >= 10 && n <= 30);
  if (Result23.isError(filterPow2Res))
    return filterPow2Res;
  const kRes = parseIntegerField(memoryRaw.k, 4, `${fieldPath}.memory.k must be an integer in [1,8]`, (n) => n >= 1 && n <= 8);
  if (Result23.isError(kRes))
    return kRes;
  const pendingMaxKeysRes = parseIntegerField(memoryRaw.pendingMaxKeys, 1e5, `${fieldPath}.memory.pendingMaxKeys must be an integer > 0`, (n) => n > 0);
  if (Result23.isError(pendingMaxKeysRes))
    return pendingMaxKeysRes;
  const keyIndexMaxKeysRes = parseIntegerField(memoryRaw.keyIndexMaxKeys, 32, `${fieldPath}.memory.keyIndexMaxKeys must be an integer in [1,1024]`, (n) => n >= 1 && n <= 1024);
  if (Result23.isError(keyIndexMaxKeysRes))
    return keyIndexMaxKeysRes;
  const hotKeyTtlMsRes = parseIntegerField(memoryRaw.hotKeyTtlMs, 1e4, `${fieldPath}.memory.hotKeyTtlMs must be an integer > 0`, (n) => n > 0);
  if (Result23.isError(hotKeyTtlMsRes))
    return hotKeyTtlMsRes;
  const hotTemplateTtlMsRes = parseIntegerField(memoryRaw.hotTemplateTtlMs, 1e4, `${fieldPath}.memory.hotTemplateTtlMs must be an integer > 0`, (n) => n > 0);
  if (Result23.isError(hotTemplateTtlMsRes))
    return hotTemplateTtlMsRes;
  const hotMaxKeysRes = parseIntegerField(memoryRaw.hotMaxKeys, 1e6, `${fieldPath}.memory.hotMaxKeys must be an integer > 0`, (n) => n > 0);
  if (Result23.isError(hotMaxKeysRes))
    return hotMaxKeysRes;
  const hotMaxTemplatesRes = parseIntegerField(memoryRaw.hotMaxTemplates, 4096, `${fieldPath}.memory.hotMaxTemplates must be an integer > 0`, (n) => n > 0);
  if (Result23.isError(hotMaxTemplatesRes))
    return hotMaxTemplatesRes;
  const lagDegradeFineTouchesAtSourceOffsetsRes = parseIntegerField(raw.lagDegradeFineTouchesAtSourceOffsets, 5000, `${fieldPath}.lagDegradeFineTouchesAtSourceOffsets must be an integer >= 0`, (n) => n >= 0);
  if (Result23.isError(lagDegradeFineTouchesAtSourceOffsetsRes))
    return lagDegradeFineTouchesAtSourceOffsetsRes;
  const lagRecoverFineTouchesAtSourceOffsetsRes = parseIntegerField(raw.lagRecoverFineTouchesAtSourceOffsets, 1000, `${fieldPath}.lagRecoverFineTouchesAtSourceOffsets must be an integer >= 0`, (n) => n >= 0);
  if (Result23.isError(lagRecoverFineTouchesAtSourceOffsetsRes))
    return lagRecoverFineTouchesAtSourceOffsetsRes;
  const fineTouchBudgetPerBatchRes = parseIntegerField(raw.fineTouchBudgetPerBatch, 2000, `${fieldPath}.fineTouchBudgetPerBatch must be an integer >= 0`, (n) => n >= 0);
  if (Result23.isError(fineTouchBudgetPerBatchRes))
    return fineTouchBudgetPerBatchRes;
  const fineTokensPerSecondRes = parseIntegerField(raw.fineTokensPerSecond, 200000, `${fieldPath}.fineTokensPerSecond must be an integer >= 0`, (n) => n >= 0);
  if (Result23.isError(fineTokensPerSecondRes))
    return fineTokensPerSecondRes;
  const fineBurstTokensRes = parseIntegerField(raw.fineBurstTokens, 400000, `${fieldPath}.fineBurstTokens must be an integer >= 0`, (n) => n >= 0);
  if (Result23.isError(fineBurstTokensRes))
    return fineBurstTokensRes;
  const lagReservedFineTouchBudgetPerBatchRes = parseIntegerField(raw.lagReservedFineTouchBudgetPerBatch, 200, `${fieldPath}.lagReservedFineTouchBudgetPerBatch must be an integer >= 0`, (n) => n >= 0);
  if (Result23.isError(lagReservedFineTouchBudgetPerBatchRes))
    return lagReservedFineTouchBudgetPerBatchRes;
  return Result23.ok({
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
  if (Result24.isError(objRes))
    return objRes;
  if (objRes.value.kind !== "state-protocol") {
    return Result24.err({ message: `${path}.kind must be state-protocol` });
  }
  const keyCheck = rejectUnknownKeysResult(objRes.value, ["kind", "touch"], path);
  if (Result24.isError(keyCheck))
    return keyCheck;
  let touch = undefined;
  if (objRes.value.touch !== undefined) {
    const touchRes = validateTouchConfigResult(objRes.value.touch, `${path}.touch`);
    if (Result24.isError(touchRes))
      return Result24.err({ message: touchRes.error.message });
    touch = touchRes.value;
  }
  return Result24.ok(touch ? { kind: "state-protocol", touch } : { kind: "state-protocol" });
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
    return Result25.ok(defaultValue);
  if (typeof raw === "number" && Number.isFinite(raw) && raw >= 0) {
    return Result25.ok(Math.floor(raw));
  }
  return Result25.err({ message: `${fieldPath} must be a non-negative number (ms)` });
}
function parseTemplateDeclsResult(raw, fieldPath) {
  if (!Array.isArray(raw) || raw.length === 0) {
    return Result25.err({ message: `${fieldPath} must be a non-empty array` });
  }
  if (raw.length > 256)
    return Result25.err({ message: `${fieldPath} too large (max 256)` });
  const templates = [];
  for (const t of raw) {
    const entity = typeof t?.entity === "string" ? t.entity.trim() : "";
    const fieldsRaw = t?.fields;
    if (entity === "" || !Array.isArray(fieldsRaw) || fieldsRaw.length === 0 || fieldsRaw.length > 3) {
      return Result25.err({ message: `${fieldPath} contains invalid template definitions` });
    }
    const fields = [];
    for (const f of fieldsRaw) {
      const name = typeof f?.name === "string" ? f.name.trim() : "";
      const encoding = f?.encoding;
      if (name === "") {
        return Result25.err({ message: `${fieldPath} contains invalid template definitions` });
      }
      fields.push({ name, encoding });
    }
    if (fields.length !== fieldsRaw.length) {
      return Result25.err({ message: `${fieldPath} contains invalid template definitions` });
    }
    templates.push({ entity, fields });
  }
  return Result25.ok(templates);
}
function parseWaitTimeoutMsQueryResult(raw, defaultValue, fieldPath) {
  if (raw == null || raw.trim() === "")
    return Result25.ok(defaultValue);
  const n = Number(raw);
  if (!Number.isFinite(n))
    return Result25.err({ message: `${fieldPath} must be a number (ms)` });
  return Result25.ok(Math.max(0, Math.min(120000, Math.floor(n))));
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
  if (Result25.isError(templatesRes))
    return respond.badRequest(templatesRes.error.message);
  const inactivityTtlRes = parseInactivityTtlResult(body?.inactivityTtlMs, touchCfg.templates?.defaultInactivityTtlMs ?? 60 * 60 * 1000, "activate.inactivityTtlMs");
  if (Result25.isError(inactivityTtlRes))
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
  if (Result25.isError(timeoutMsRes))
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
    if (Result25.isError(templatesRes))
      return respond.badRequest(templatesRes.error.message);
    const inactivityTtlRes = parseInactivityTtlResult(body?.inactivityTtlMs, touchCfg.templates?.defaultInactivityTtlMs ?? 60 * 60 * 1000, "wait.inactivityTtlMs");
    if (Result25.isError(inactivityTtlRes))
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
      if (Result25.isError(keyIdRes))
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
import { Result as Result26 } from "better-result";
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
    return Result26.err({ message: `${path} must be a non-empty string` });
  }
  return Result26.ok(value);
}
function validateChangeRecordResult(record, headers) {
  const keyCheck = rejectUnknownKeysResult(record, CHANGE_KEYS, "state-protocol record");
  if (Result26.isError(keyCheck))
    return keyCheck;
  const headerKeyCheck = rejectUnknownKeysResult(headers, CHANGE_HEADER_KEYS, "state-protocol record.headers");
  if (Result26.isError(headerKeyCheck))
    return headerKeyCheck;
  const typeRes = nonEmptyStringFieldResult(record.type, "state-protocol record.type");
  if (Result26.isError(typeRes))
    return typeRes;
  const keyRes = nonEmptyStringFieldResult(record.key, "state-protocol record.key");
  if (Result26.isError(keyRes))
    return keyRes;
  const operation = headers.operation;
  if (operation !== "insert" && operation !== "update" && operation !== "delete") {
    return Result26.err({ message: "state-protocol record.headers.operation must be insert, update, or delete" });
  }
  if ((operation === "insert" || operation === "update") && !Object.prototype.hasOwnProperty.call(record, "value")) {
    return Result26.err({ message: `state-protocol ${operation} records must include value` });
  }
  if (Object.prototype.hasOwnProperty.call(headers, "txid")) {
    const txidRes = nonEmptyStringFieldResult(headers.txid, "state-protocol record.headers.txid");
    if (Result26.isError(txidRes))
      return txidRes;
  }
  if (Object.prototype.hasOwnProperty.call(headers, "timestamp")) {
    if (typeof headers.timestamp !== "string" || !isDateTimeString2(headers.timestamp)) {
      return Result26.err({ message: "state-protocol record.headers.timestamp must be a valid RFC 3339 timestamp" });
    }
  }
  return Result26.ok({ value: record, routingKey: null });
}
function validateControlRecordResult(record, headers) {
  const keyCheck = rejectUnknownKeysResult(record, CONTROL_KEYS, "state-protocol record");
  if (Result26.isError(keyCheck))
    return keyCheck;
  const headerKeyCheck = rejectUnknownKeysResult(headers, CONTROL_HEADER_KEYS, "state-protocol record.headers");
  if (Result26.isError(headerKeyCheck))
    return headerKeyCheck;
  const control = headers.control;
  if (control !== "snapshot-start" && control !== "snapshot-end" && control !== "reset") {
    return Result26.err({ message: "state-protocol record.headers.control must be snapshot-start, snapshot-end, or reset" });
  }
  if (Object.prototype.hasOwnProperty.call(headers, "offset")) {
    if (typeof headers.offset !== "string") {
      return Result26.err({ message: "state-protocol record.headers.offset must be a valid stream offset string" });
    }
    const offsetRes = parseOffsetResult(headers.offset);
    if (Result26.isError(offsetRes)) {
      return Result26.err({ message: "state-protocol record.headers.offset must be a valid stream offset string" });
    }
  }
  return Result26.ok({ value: record, routingKey: null });
}
function validateStateProtocolRecordResult(value) {
  const recordRes = expectPlainObjectResult(value, "state-protocol record");
  if (Result26.isError(recordRes)) {
    return Result26.err({ message: "state-protocol records must be JSON objects" });
  }
  const headersRes = expectPlainObjectResult(recordRes.value.headers, "state-protocol record.headers");
  if (Result26.isError(headersRes)) {
    return Result26.err({ message: "state-protocol record.headers must be an object" });
  }
  const hasControl = Object.prototype.hasOwnProperty.call(headersRes.value, "control");
  const hasOperation = Object.prototype.hasOwnProperty.call(headersRes.value, "operation");
  if (hasControl && hasOperation) {
    return Result26.err({ message: "state-protocol record.headers cannot mix control and operation" });
  }
  if (hasControl)
    return validateControlRecordResult(recordRes.value, headersRes.value);
  if (hasOperation)
    return validateChangeRecordResult(recordRes.value, headersRes.value);
  return Result26.err({ message: "state-protocol record.headers must contain operation or control" });
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
      return Result27.ok({ profile: { kind: "state-protocol" }, cache: null });
    }
    const cachedCopy = cloneStateProtocolCache(cached);
    if (cachedCopy && cachedCopy.updatedAtMs === row.updated_at_ms) {
      return Result27.ok({
        profile: cloneStateProtocolProfile(cachedCopy.profile),
        cache: cachedCopy
      });
    }
    const parsedRes = parseStoredProfileJsonResult(row.profile_json);
    if (Result27.isError(parsedRes))
      return parsedRes;
    const profileRes = validateStateProtocolProfileResult(parsedRes.value, "profile");
    if (Result27.isError(profileRes))
      return profileRes;
    const profile = cloneStateProtocolProfile(profileRes.value);
    return Result27.ok({
      profile: cloneStateProtocolProfile(profile),
      cache: { profile, updatedAtMs: row.updated_at_ms }
    });
  },
  persistProfileResult({ db, stream, streamRow, profile }) {
    if (!isStateProtocolProfile(profile)) {
      return Result27.err({ kind: "bad_request", message: "invalid state-protocol profile" });
    }
    const contentType = normalizeProfileContentType(streamRow.content_type);
    if (contentType !== "application/json") {
      return Result27.err({
        kind: "bad_request",
        message: "state-protocol profile requires application/json stream content-type"
      });
    }
    const persistedProfile = cloneStateProtocolProfile(profile);
    db.updateStreamProfile(stream, persistedProfile.kind);
    db.upsertStreamProfile(stream, JSON.stringify(persistedProfile));
    STATE_PROTOCOL_TOUCH_CAPABILITY.syncState({ db, stream, profile: persistedProfile });
    const row = db.getStreamProfile(stream);
    return Result27.ok({
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
        return Result27.err({ message: "invalid state-protocol profile" });
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
function supportedProfileKindsMessage() {
  return listSupportedStreamProfileKinds().join("|");
}
function listSupportedStreamProfileKinds() {
  return Object.keys(STREAM_PROFILE_DEFINITIONS);
}
function resolveStreamProfileDefinition(kind) {
  const normalized = typeof kind === "string" && kind !== "" ? kind : DEFAULT_STREAM_PROFILE;
  return STREAM_PROFILE_DEFINITIONS[normalized] ?? null;
}
function resolveStreamProfileDefinitionResult(kind) {
  const normalized = typeof kind === "string" && kind !== "" ? kind : DEFAULT_STREAM_PROFILE;
  const definition = resolveStreamProfileDefinition(normalized);
  if (!definition) {
    return Result28.err({ kind: "invalid_profile", message: `unknown stream profile: ${normalized}` });
  }
  return Result28.ok(definition);
}
function cloneCachedProfile(cache) {
  if (!cache)
    return null;
  return {
    profile: cloneStreamProfileSpec(cache.profile),
    updatedAtMs: cache.updatedAtMs
  };
}
function parseProfileUpdateResult(body) {
  const envelopeRes = parseProfileUpdateEnvelopeResult(body);
  if (Result28.isError(envelopeRes))
    return envelopeRes;
  const kindRes = readProfileKindResult(envelopeRes.value, "profile");
  if (Result28.isError(kindRes))
    return kindRes;
  const definition = resolveStreamProfileDefinition(kindRes.value);
  if (!definition) {
    return Result28.err({ message: `profile.kind must be ${supportedProfileKindsMessage()}` });
  }
  return definition.validateResult(envelopeRes.value, "profile");
}
function resolveTouchCapability(profile2) {
  if (!profile2)
    return null;
  return resolveStreamProfileDefinition(profile2.kind)?.touch ?? null;
}
function resolveJsonIngestCapability(profile2) {
  if (!profile2)
    return null;
  return resolveStreamProfileDefinition(profile2.kind)?.jsonIngest ?? null;
}
function resolveOtlpTracesCapability(profile2) {
  if (!profile2)
    return null;
  return resolveStreamProfileDefinition(profile2.kind)?.otlpTraces ?? null;
}
function resolveCorrelationCapability(profile2) {
  if (!profile2)
    return null;
  return resolveStreamProfileDefinition(profile2.kind)?.correlation ?? null;
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
function listTouchCapableProfileKinds() {
  return Object.values(STREAM_PROFILE_DEFINITIONS).filter((definition) => !!definition.touch).map((definition) => definition.kind);
}

class StreamProfileStore {
  db;
  registry;
  cache;
  constructor(db, registry, opts) {
    this.db = db;
    this.registry = registry;
    this.cache = new LruCache(opts?.cacheEntries ?? 1024);
  }
  loadRow(stream) {
    return this.db.getStreamProfile(stream);
  }
  getProfile(stream, streamRow) {
    const res = this.getProfileResult(stream, streamRow);
    if (Result28.isError(res))
      throw dsError(res.error.message, { code: res.error.code });
    return res.value;
  }
  getProfileResult(stream, streamRow) {
    const srow = streamRow ?? this.db.getStream(stream);
    if (!srow)
      return Result28.ok(GENERIC_STREAM_PROFILE_DEFINITION.defaultProfile());
    const definitionRes = resolveStreamProfileDefinitionResult(srow.profile);
    if (Result28.isError(definitionRes))
      return definitionRes;
    const row = definitionRes.value.usesStoredProfileRow ? this.loadRow(stream) : null;
    const cached = cloneCachedProfile(this.cache.get(stream) ?? null);
    const readRes = definitionRes.value.readProfileResult({
      row,
      cached: cached && cached.profile.kind === definitionRes.value.kind ? cached : null
    });
    if (Result28.isError(readRes)) {
      return Result28.err({ kind: "invalid_profile", message: readRes.error.message });
    }
    if (readRes.value.cache)
      this.cache.set(stream, cloneCachedProfile(readRes.value.cache));
    else
      this.cache.delete(stream);
    return Result28.ok(cloneStreamProfileSpec(readRes.value.profile));
  }
  getProfileResource(stream, streamRow) {
    const res = this.getProfileResourceResult(stream, streamRow);
    if (Result28.isError(res))
      throw dsError(res.error.message, { code: res.error.code });
    return res.value;
  }
  getProfileResourceResult(stream, streamRow) {
    const profileRes = this.getProfileResult(stream, streamRow);
    if (Result28.isError(profileRes))
      return profileRes;
    return Result28.ok(buildStreamProfileResource(profileRes.value));
  }
  updateProfile(stream, streamRow, profile2) {
    const res = this.updateProfileResult(stream, streamRow, profile2);
    if (Result28.isError(res))
      throw dsError(res.error.message, { code: res.error.code });
    return res.value.resource;
  }
  updateProfileResult(stream, streamRow, profile2) {
    const definition = resolveStreamProfileDefinition(profile2.kind);
    if (!definition) {
      return Result28.err({ kind: "bad_request", message: `profile.kind must be ${supportedProfileKindsMessage()}` });
    }
    const persistRes = definition.persistProfileResult({ db: this.db, registry: this.registry, stream, streamRow, profile: profile2 });
    if (Result28.isError(persistRes))
      return persistRes;
    if (persistRes.value.cache)
      this.cache.set(stream, cloneCachedProfile(persistRes.value.cache));
    else
      this.cache.delete(stream);
    return Result28.ok({
      resource: buildStreamProfileResource(cloneStreamProfileSpec(persistRes.value.profile)),
      schemaRegistry: persistRes.value.schemaRegistry ?? null
    });
  }
}

// src/touch/worker_pool.ts
import { Worker } from "node:worker_threads";
import { Result as Result29 } from "better-result";

// src/compute/worker_module_url.ts
function resolveWorkerModuleUrl(currentModuleUrl, sourceRelativePath, builtRelativePath = sourceRelativePath.endsWith(".ts") ? `${sourceRelativePath.slice(0, -3)}.js` : sourceRelativePath) {
  return new URL(currentModuleUrl.endsWith(".js") ? builtRelativePath : sourceRelativePath, currentModuleUrl);
}

// src/touch/worker_pool.ts
class TouchProcessorWorkerPool {
  cfg;
  workerCount;
  workers = [];
  started = false;
  generation = 0;
  nextId = 1;
  pending = new Map;
  queue = [];
  constructor(cfg, workerCount) {
    this.cfg = cfg;
    this.workerCount = Math.max(0, Math.floor(workerCount));
  }
  start() {
    if (this.started)
      return;
    this.started = true;
    this.generation += 1;
    const generation = this.generation;
    for (let i = 0;i < this.workerCount; i++)
      this.spawnWorker(i, generation);
  }
  async stop() {
    if (!this.started)
      return;
    this.started = false;
    this.generation += 1;
    const workers = this.workers.slice();
    this.workers.length = 0;
    this.queue.length = 0;
    for (const [id, p] of this.pending.entries()) {
      p.resolve(Result29.err({ kind: "worker_pool_failure", message: "worker pool stopped" }));
      this.pending.delete(id);
    }
    await Promise.all(workers.map((w) => {
      try {
        w.worker.postMessage({ type: "stop" });
      } catch {}
      return w.worker.terminate();
    }));
  }
  async restart() {
    await this.stop();
    this.start();
  }
  async processResult(req) {
    if (!this.started) {
      return Result29.err({ kind: "worker_pool_unavailable", message: "worker pool not started" });
    }
    if (this.workerCount === 0) {
      return Result29.err({ kind: "worker_pool_unavailable", message: "worker pool disabled" });
    }
    const id = this.nextId++;
    const queued = { ...req, id };
    const value = await new Promise((resolve) => {
      this.pending.set(id, { resolve });
      this.queue.push(queued);
      this.pump();
    });
    return value;
  }
  async process(req) {
    const res = await this.processResult(req);
    if (Result29.isError(res))
      throw dsError(res.error.message);
    return res.value;
  }
  pump() {
    if (!this.started)
      return;
    if (this.queue.length === 0)
      return;
    const slot = this.workers.find((w) => !w.busy);
    if (!slot)
      return;
    const next = this.queue.shift();
    if (!next)
      return;
    slot.busy = true;
    slot.currentId = next.id;
    slot.worker.postMessage({
      type: "process",
      id: next.id,
      stream: next.stream,
      fromOffset: next.fromOffset,
      toOffset: next.toOffset,
      profile: next.profile,
      maxRows: next.maxRows,
      maxBytes: next.maxBytes,
      emitFineTouches: next.emitFineTouches,
      fineTouchBudget: next.fineTouchBudget,
      fineGranularity: next.fineGranularity,
      processingMode: next.processingMode,
      filterHotTemplates: next.filterHotTemplates,
      hotTemplateIds: next.hotTemplateIds
    });
  }
  spawnWorker(idx, generation = this.generation) {
    const workerSpec = resolveWorkerModuleUrl(import.meta.url, "./processor_worker.ts", "../touch/processor_worker.js");
    const worker = new Worker(workerSpec, {
      workerData: { config: this.cfg, hostRuntime: detectHostRuntime() },
      type: "module",
      smol: true
    });
    const slot = { worker, busy: false, currentId: null };
    this.workers.push(slot);
    worker.on("message", (msg) => {
      if (generation !== this.generation)
        return;
      if (!msg || typeof msg !== "object")
        return;
      if (msg.type === "result") {
        const p = this.pending.get(msg.id);
        if (p) {
          this.pending.delete(msg.id);
          slot.busy = false;
          slot.currentId = null;
          p.resolve(Result29.ok(msg));
        }
        this.pump();
        return;
      }
      if (msg.type === "error") {
        const p = this.pending.get(msg.id);
        if (p) {
          this.pending.delete(msg.id);
          slot.busy = false;
          slot.currentId = null;
          p.resolve(Result29.err({ kind: "worker_pool_failure", message: msg.message }));
        }
        this.pump();
      }
    });
    worker.on("error", (err) => {
      if (generation !== this.generation)
        return;
      console.error(`touch processor worker ${idx} error`, err);
    });
    worker.on("exit", (code) => {
      if (generation !== this.generation || !this.started)
        return;
      console.error(`touch processor worker ${idx} exited with code ${code}, respawning`);
      if (slot.currentId != null) {
        const p = this.pending.get(slot.currentId);
        if (p) {
          this.pending.delete(slot.currentId);
          p.resolve(Result29.err({ kind: "worker_pool_failure", message: "worker exited" }));
        }
      }
      slot.busy = false;
      slot.currentId = null;
      try {
        const widx = this.workers.indexOf(slot);
        if (widx >= 0)
          this.workers.splice(widx, 1);
      } catch {}
      this.spawnWorker(idx, generation);
      this.pump();
    });
  }
}

// src/touch/live_templates.ts
function nowIso(ms) {
  return new Date(ms).toISOString();
}
function parseTemplateRow(row) {
  return {
    stream: String(row.stream),
    template_id: String(row.template_id),
    entity: String(row.entity),
    fields_json: String(row.fields_json),
    encodings_json: String(row.encodings_json),
    state: String(row.state),
    created_at_ms: typeof row.created_at_ms === "bigint" ? row.created_at_ms : BigInt(row.created_at_ms),
    last_seen_at_ms: typeof row.last_seen_at_ms === "bigint" ? row.last_seen_at_ms : BigInt(row.last_seen_at_ms),
    inactivity_ttl_ms: typeof row.inactivity_ttl_ms === "bigint" ? row.inactivity_ttl_ms : BigInt(row.inactivity_ttl_ms),
    active_from_source_offset: typeof row.active_from_source_offset === "bigint" ? row.active_from_source_offset : BigInt(row.active_from_source_offset),
    retired_at_ms: row.retired_at_ms == null ? null : typeof row.retired_at_ms === "bigint" ? row.retired_at_ms : BigInt(row.retired_at_ms),
    retired_reason: row.retired_reason == null ? null : String(row.retired_reason)
  };
}

class LiveTemplateRegistry {
  db;
  lastSeenMem = new Map;
  dirtyLastSeen = new Set;
  rate = new Map;
  constructor(db) {
    this.db = db;
  }
  key(stream, templateId) {
    return `${stream}
${templateId}`;
  }
  getMemoryStats() {
    return {
      lastSeenEntries: this.lastSeenMem.size,
      dirtyLastSeenEntries: this.dirtyLastSeen.size,
      rateStateStreams: this.rate.size
    };
  }
  allowActivation(stream, nowMs, limitPerMinute) {
    if (limitPerMinute <= 0)
      return true;
    const ratePerMs = limitPerMinute / 60000;
    const st = this.rate.get(stream) ?? { tokens: limitPerMinute, lastRefillMs: nowMs };
    const elapsed = Math.max(0, nowMs - st.lastRefillMs);
    st.tokens = Math.min(limitPerMinute, st.tokens + elapsed * ratePerMs);
    st.lastRefillMs = nowMs;
    if (st.tokens < 1) {
      this.rate.set(stream, st);
      return false;
    }
    st.tokens -= 1;
    this.rate.set(stream, st);
    return true;
  }
  getActiveTemplateCount(stream) {
    try {
      const row = this.db.db.query(`SELECT COUNT(*) as cnt FROM live_templates WHERE stream=? AND state='active';`).get(stream);
      return Number(row?.cnt ?? 0);
    } catch {
      return 0;
    }
  }
  listActiveTemplates(stream) {
    try {
      const rows = this.db.db.query(`SELECT template_id, entity, fields_json, encodings_json, last_seen_at_ms
           FROM live_templates
           WHERE stream=? AND state='active'
           ORDER BY entity ASC, template_id ASC;`).all(stream);
      const out = [];
      for (const row of rows) {
        const templateId = String(row.template_id);
        const entity = String(row.entity);
        const fields = JSON.parse(String(row.fields_json));
        const encodings = JSON.parse(String(row.encodings_json));
        if (!Array.isArray(fields) || !Array.isArray(encodings) || fields.length !== encodings.length)
          continue;
        const lastSeenAtMs = Number(row.last_seen_at_ms);
        out.push({ templateId, entity, fields: fields.map(String), encodings: encodings.map(String), lastSeenAtMs });
      }
      return out;
    } catch {
      return [];
    }
  }
  activate(args) {
    const { stream, templates, inactivityTtlMs, nowMs } = args;
    const { maxActiveTemplatesPerStream, maxActiveTemplatesPerEntity, activationRateLimitPerMinute } = args.limits;
    const activated = [];
    const denied = [];
    const lifecycle = [];
    const protectedIds = new Set;
    for (const t of templates) {
      const entity = typeof t?.entity === "string" ? t.entity.trim() : "";
      if (entity === "") {
        denied.push({ templateId: "0000000000000000", reason: "invalid" });
        continue;
      }
      if (!Array.isArray(t.fields) || t.fields.length === 0 || t.fields.length > 3) {
        denied.push({ templateId: "0000000000000000", reason: "invalid" });
        continue;
      }
      const rawFields = [];
      for (const f of t.fields) {
        const name = typeof f?.name === "string" ? String(f.name).trim() : "";
        const encoding = f?.encoding;
        if (name === "")
          continue;
        if (encoding !== "string" && encoding !== "int64" && encoding !== "bool" && encoding !== "datetime" && encoding !== "bytes")
          continue;
        rawFields.push({ name, encoding });
      }
      if (rawFields.length !== t.fields.length) {
        denied.push({ templateId: "0000000000000000", reason: "invalid" });
        continue;
      }
      {
        const seen = new Set;
        let ok = true;
        for (const f of rawFields) {
          if (seen.has(f.name))
            ok = false;
          seen.add(f.name);
        }
        if (!ok) {
          denied.push({ templateId: "0000000000000000", reason: "invalid" });
          continue;
        }
      }
      const fields = canonicalizeTemplateFields(rawFields);
      const fieldNames = fields.map((f) => f.name);
      const encodings = fields.map((f) => f.encoding);
      const templateId = templateIdFor(entity, fieldNames);
      const existing = this.db.db.query(`SELECT stream, template_id, entity, fields_json, encodings_json, state, created_at_ms, last_seen_at_ms,
                  inactivity_ttl_ms, active_from_source_offset, retired_at_ms, retired_reason
           FROM live_templates
           WHERE stream=? AND template_id=? LIMIT 1;`).get(stream, templateId);
      const alreadyActive = existing && String(existing.state) === "active";
      const needsToken = !alreadyActive;
      if (needsToken && !this.allowActivation(stream, nowMs, activationRateLimitPerMinute)) {
        denied.push({ templateId, reason: "rate_limited" });
        continue;
      }
      if (existing) {
        const row = parseTemplateRow(existing);
        if (row.entity !== entity) {
          denied.push({ templateId, reason: "invalid" });
          continue;
        }
        let storedFields;
        let storedEnc;
        try {
          storedFields = JSON.parse(row.fields_json);
          storedEnc = JSON.parse(row.encodings_json);
        } catch {
          denied.push({ templateId, reason: "invalid" });
          continue;
        }
        if (!Array.isArray(storedFields) || !Array.isArray(storedEnc) || storedFields.length !== storedEnc.length) {
          denied.push({ templateId, reason: "invalid" });
          continue;
        }
        const sf = storedFields.map(String);
        const se = storedEnc.map(String);
        if (sf.join("\x00") !== fieldNames.join("\x00")) {
          denied.push({ templateId, reason: "invalid" });
          continue;
        }
        if (se.join("\x00") !== encodings.join("\x00")) {
          denied.push({ templateId, reason: "invalid" });
          continue;
        }
        if (row.state === "active") {
          this.db.db.query(`UPDATE live_templates
               SET last_seen_at_ms=?, inactivity_ttl_ms=?
               WHERE stream=? AND template_id=?;`).run(nowMs, inactivityTtlMs, stream, templateId);
        } else {
          this.db.db.query(`UPDATE live_templates
               SET state='active',
                   last_seen_at_ms=?,
                   inactivity_ttl_ms=?,
                   active_from_source_offset=?,
                   retired_at_ms=NULL,
                   retired_reason=NULL
               WHERE stream=? AND template_id=?;`).run(nowMs, inactivityTtlMs, args.baseStreamNextOffset, stream, templateId);
        }
      } else {
        this.db.db.query(`INSERT INTO live_templates(
               stream, template_id, entity, fields_json, encodings_json,
               state, created_at_ms, last_seen_at_ms, inactivity_ttl_ms, active_from_source_offset,
               retired_at_ms, retired_reason
             ) VALUES(?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, NULL, NULL);`).run(stream, templateId, entity, JSON.stringify(fieldNames), JSON.stringify(encodings), nowMs, nowMs, inactivityTtlMs, args.baseStreamNextOffset);
      }
      protectedIds.add(templateId);
      activated.push({ templateId, state: "active", activeFromTouchOffset: args.activeFromTouchOffset });
      lifecycle.push({
        type: "live.template_activated",
        ts: nowIso(nowMs),
        stream,
        templateId,
        entity,
        fields: fieldNames,
        encodings,
        reason: "declared",
        activeFromTouchOffset: args.activeFromTouchOffset,
        inactivityTtlMs
      });
      this.markSeen(stream, templateId, nowMs);
    }
    const evicted = this.evictToCaps(stream, nowMs, { maxActiveTemplatesPerStream, maxActiveTemplatesPerEntity }, protectedIds);
    for (const e of evicted)
      lifecycle.push(e);
    return { activated, denied, lifecycle };
  }
  heartbeat(stream, templateIdsUsed, nowMs) {
    for (const id of templateIdsUsed) {
      const templateId = typeof id === "string" ? id.trim() : "";
      if (!/^[0-9a-f]{16}$/.test(templateId))
        continue;
      this.markSeen(stream, templateId, nowMs);
    }
  }
  flushLastSeen(nowMs, persistIntervalMs) {
    if (this.dirtyLastSeen.size === 0)
      return;
    const stmt = this.db.db.query(`UPDATE live_templates
       SET last_seen_at_ms=?
       WHERE stream=? AND template_id=? AND state='active';`);
    try {
      for (const k of this.dirtyLastSeen) {
        const item = this.lastSeenMem.get(k);
        if (!item) {
          this.dirtyLastSeen.delete(k);
          continue;
        }
        if (nowMs - item.lastPersistMs < persistIntervalMs)
          continue;
        const [stream, templateId] = k.split(`
`);
        stmt.run(item.lastSeenMs, stream, templateId);
        item.lastPersistMs = nowMs;
        this.dirtyLastSeen.delete(k);
      }
    } finally {
      try {
        stmt.finalize?.();
      } catch {}
    }
  }
  gcRetireExpired(stream, nowMs) {
    const expired = [];
    try {
      const rows = this.db.db.query(`SELECT template_id, entity, fields_json, encodings_json, last_seen_at_ms, inactivity_ttl_ms
           FROM live_templates
           WHERE stream=? AND state='active' AND (last_seen_at_ms + inactivity_ttl_ms) < ?
           ORDER BY last_seen_at_ms ASC
           LIMIT 1000;`).all(stream, nowMs);
      expired.push(...rows);
    } catch {
      return { retired: [] };
    }
    if (expired.length === 0)
      return { retired: [] };
    const effectiveExpired = [];
    const refreshLastSeen = this.db.db.query(`UPDATE live_templates
       SET last_seen_at_ms=?
       WHERE stream=? AND template_id=? AND state='active';`);
    try {
      for (const row of expired) {
        const templateId = String(row.template_id);
        const dbLastSeenAtMs = Number(row.last_seen_at_ms);
        const ttlMs = Number(row.inactivity_ttl_ms);
        const mem = this.lastSeenMem.get(this.key(stream, templateId));
        const memLastSeen = mem ? mem.lastSeenMs : 0;
        const lastSeenAtMs = Math.max(dbLastSeenAtMs, memLastSeen);
        if (lastSeenAtMs + ttlMs >= nowMs) {
          if (mem && memLastSeen > dbLastSeenAtMs) {
            refreshLastSeen.run(memLastSeen, stream, templateId);
            mem.lastPersistMs = nowMs;
            this.dirtyLastSeen.delete(this.key(stream, templateId));
          }
          continue;
        }
        effectiveExpired.push(row);
      }
    } finally {
      try {
        refreshLastSeen.finalize?.();
      } catch {}
    }
    if (effectiveExpired.length === 0)
      return { retired: [] };
    const retired = [];
    const update = this.db.db.query(`UPDATE live_templates
       SET state='retired', retired_reason='inactivity', retired_at_ms=?
       WHERE stream=? AND template_id=? AND state='active';`);
    try {
      for (const row of effectiveExpired) {
        const templateId = String(row.template_id);
        const entity = String(row.entity);
        let fields = [];
        let encodings = [];
        try {
          const f = JSON.parse(String(row.fields_json));
          const e = JSON.parse(String(row.encodings_json));
          if (Array.isArray(f))
            fields = f.map(String);
          if (Array.isArray(e))
            encodings = e.map(String);
        } catch {}
        const dbLastSeenAtMs = Number(row.last_seen_at_ms);
        const mem = this.lastSeenMem.get(this.key(stream, templateId));
        const memLastSeen = mem ? mem.lastSeenMs : 0;
        const lastSeenAtMs = Math.max(dbLastSeenAtMs, memLastSeen);
        const inactiveForMs = Math.max(0, nowMs - lastSeenAtMs);
        update.run(nowMs, stream, templateId);
        retired.push({
          type: "live.template_retired",
          ts: nowIso(nowMs),
          stream,
          templateId,
          entity,
          fields,
          encodings,
          lastSeenAt: nowIso(lastSeenAtMs),
          inactiveForMs,
          reason: "inactivity"
        });
        this.lastSeenMem.delete(this.key(stream, templateId));
        this.dirtyLastSeen.delete(this.key(stream, templateId));
      }
    } finally {
      try {
        update.finalize?.();
      } catch {}
    }
    return { retired };
  }
  markSeen(stream, templateId, nowMs) {
    const k = this.key(stream, templateId);
    const item = this.lastSeenMem.get(k) ?? { lastSeenMs: 0, lastPersistMs: 0 };
    if (nowMs > item.lastSeenMs)
      item.lastSeenMs = nowMs;
    this.lastSeenMem.set(k, item);
    this.dirtyLastSeen.add(k);
  }
  evictToCaps(stream, nowMs, caps, protectedIds) {
    const out = [];
    const { maxActiveTemplatesPerStream, maxActiveTemplatesPerEntity } = caps;
    let entities = [];
    try {
      const rows = this.db.db.query(`SELECT entity, COUNT(*) as cnt
           FROM live_templates
           WHERE stream=? AND state='active'
           GROUP BY entity;`).all(stream);
      entities = rows.map((r) => ({ entity: String(r.entity), cnt: Number(r.cnt) }));
    } catch {}
    for (const e of entities) {
      if (e.cnt <= maxActiveTemplatesPerEntity)
        continue;
      const extra = e.cnt - maxActiveTemplatesPerEntity;
      const evicted = this.evictLru(stream, nowMs, extra, { entity: e.entity, cap: maxActiveTemplatesPerEntity }, protectedIds);
      out.push(...evicted);
    }
    let activeCount = 0;
    try {
      const row = this.db.db.query(`SELECT COUNT(*) as cnt FROM live_templates WHERE stream=? AND state='active';`).get(stream);
      activeCount = Number(row?.cnt ?? 0);
    } catch {
      activeCount = 0;
    }
    if (activeCount > maxActiveTemplatesPerStream) {
      const extra = activeCount - maxActiveTemplatesPerStream;
      const evicted = this.evictLru(stream, nowMs, extra, { cap: maxActiveTemplatesPerStream }, protectedIds);
      out.push(...evicted);
    }
    return out;
  }
  evictLru(stream, nowMs, count, scope, protectedIds) {
    if (count <= 0)
      return [];
    const out = [];
    const pick = (excludeProtected) => {
      const params = [stream];
      let where = `stream=? AND state='active'`;
      if (scope.entity) {
        where += ` AND entity=?`;
        params.push(scope.entity);
      }
      if (excludeProtected && protectedIds.size > 0) {
        const placeholders = Array.from(protectedIds).map(() => "?").join(", ");
        where += ` AND template_id NOT IN (${placeholders})`;
        params.push(...Array.from(protectedIds));
      }
      const q = `SELECT template_id FROM live_templates WHERE ${where} ORDER BY last_seen_at_ms ASC, template_id ASC LIMIT ?;`;
      params.push(count);
      try {
        const rows = this.db.db.query(q).all(...params);
        return rows.map((r) => String(r.template_id));
      } catch {
        return [];
      }
    };
    let ids = pick(true);
    if (ids.length < count) {
      const extra = pick(false);
      const merged = [];
      const seen = new Set;
      for (const id of [...ids, ...extra]) {
        if (seen.has(id))
          continue;
        seen.add(id);
        merged.push(id);
        if (merged.length >= count)
          break;
      }
      ids = merged;
    }
    if (ids.length === 0)
      return [];
    const update = this.db.db.query(`UPDATE live_templates
       SET state='retired', retired_reason='cap_exceeded', retired_at_ms=?
       WHERE stream=? AND template_id=? AND state='active';`);
    try {
      for (const id of ids) {
        update.run(nowMs, stream, id);
        out.push({
          type: "live.template_evicted",
          ts: nowIso(nowMs),
          stream,
          templateId: id,
          reason: "cap_exceeded",
          cap: scope.cap
        });
        this.lastSeenMem.delete(this.key(stream, id));
        this.dirtyLastSeen.delete(this.key(stream, id));
      }
    } finally {
      try {
        update.finalize?.();
      } catch {}
    }
    return out;
  }
}

// src/touch/live_metrics.ts
import { Result as Result30 } from "better-result";
function makeLatencyHistogram() {
  const bounds = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 1e4, 30000, 120000];
  const counts = new Array(bounds.length + 1).fill(0);
  const record = (ms) => {
    const x = Math.max(0, Math.floor(ms));
    let i = 0;
    while (i < bounds.length && x > bounds[i])
      i++;
    counts[i] += 1;
  };
  const quantile = (q) => {
    const total = counts.reduce((a, b) => a + b, 0);
    if (total === 0)
      return 0;
    const target = Math.ceil(total * q);
    let acc = 0;
    for (let i = 0;i < counts.length; i++) {
      acc += counts[i];
      if (acc >= target) {
        return i < bounds.length ? bounds[i] : bounds[bounds.length - 1];
      }
    }
    return bounds[bounds.length - 1];
  };
  const reset = () => {
    for (let i = 0;i < counts.length; i++)
      counts[i] = 0;
  };
  return { bounds, counts, record, p50: () => quantile(0.5), p95: () => quantile(0.95), p99: () => quantile(0.99), reset };
}
function nowIso2(ms) {
  return new Date(ms).toISOString();
}
function envString(name) {
  const v = process.env[name];
  return v && v.trim() !== "" ? v.trim() : null;
}
function getInstanceId() {
  return envString("DS_INSTANCE_ID") ?? envString("HOSTNAME") ?? "local";
}
function getRegion() {
  return envString("DS_REGION") ?? "local";
}
function defaultCounters(touchCfg) {
  return {
    touch: {
      coarseIntervalMs: touchCfg.coarseIntervalMs ?? 100,
      coalesceWindowMs: touchCfg.touchCoalesceWindowMs ?? 100,
      mode: "idle",
      hotFineKeys: 0,
      hotTemplates: 0,
      hotFineKeysActive: 0,
      hotFineKeysGrace: 0,
      hotTemplatesActive: 0,
      hotTemplatesGrace: 0,
      fineWaitersActive: 0,
      coarseWaitersActive: 0,
      broadFineWaitersActive: 0,
      touchesEmitted: 0,
      uniqueKeysTouched: 0,
      tableTouchesEmitted: 0,
      templateTouchesEmitted: 0,
      staleResponses: 0,
      fineTouchesDroppedDueToBudget: 0,
      fineTouchesSkippedColdTemplate: 0,
      fineTouchesSkippedColdKey: 0,
      fineTouchesSkippedTemplateBucket: 0,
      fineTouchesSuppressedBatchesDueToLag: 0,
      fineTouchesSuppressedMsDueToLag: 0,
      fineTouchesSuppressedBatchesDueToBudget: 0
    },
    gc: {
      baseWalGcCalls: 0,
      baseWalGcDeletedRows: 0,
      baseWalGcDeletedBytes: 0,
      baseWalGcMsSum: 0,
      baseWalGcMsMax: 0
    },
    templates: { activated: 0, retired: 0, evicted: 0, activationDenied: 0 },
    wait: { calls: 0, keysWatchedTotal: 0, touched: 0, timeout: 0, stale: 0, latencySumMs: 0, latencyHist: makeLatencyHistogram() },
    processor: {
      eventsIn: 0,
      changesOut: 0,
      errors: 0,
      lagSourceOffsets: 0,
      scannedBatches: 0,
      scannedButEmitted0Batches: 0,
      noInterestFastForwardBatches: 0,
      processedThroughDelta: 0,
      touchesEmittedDelta: 0,
      commitLagSamples: 0,
      commitLagMsSum: 0,
      commitLagHist: makeLatencyHistogram()
    }
  };
}

class LiveMetricsV2 {
  db;
  ingest;
  profiles;
  metricsStream;
  enabled;
  intervalMs;
  snapshotIntervalMs;
  snapshotChunkSize;
  retentionMs;
  getTouchJournal;
  onAppended;
  timer = null;
  snapshotTimer = null;
  retentionTimer = null;
  lagTimer = null;
  instanceId = getInstanceId();
  region = getRegion();
  counters = new Map;
  lagExpectedMs = 0;
  lagMaxMs = 0;
  lagSumMs = 0;
  lagSamples = 0;
  constructor(db, ingest, profiles, opts) {
    this.db = db;
    this.ingest = ingest;
    this.profiles = profiles;
    this.enabled = opts?.enabled !== false;
    this.metricsStream = opts?.stream ?? "live.metrics";
    this.intervalMs = opts?.intervalMs ?? 1000;
    this.snapshotIntervalMs = opts?.snapshotIntervalMs ?? 60000;
    this.snapshotChunkSize = opts?.snapshotChunkSize ?? 200;
    this.retentionMs = opts?.retentionMs ?? 7 * 24 * 60 * 60 * 1000;
    this.getTouchJournal = opts?.getTouchJournal;
    this.onAppended = opts?.onAppended;
  }
  start() {
    if (!this.enabled)
      return;
    if (this.timer)
      return;
    this.timer = setInterval(() => {
      this.flushTick();
    }, this.intervalMs);
    this.snapshotTimer = setInterval(() => {
      this.emitSnapshots();
    }, this.snapshotIntervalMs);
    this.retentionTimer = setInterval(() => {
      try {
        this.db.trimWalByAge(this.metricsStream, this.retentionMs);
      } catch {}
    }, 60000);
    const lagIntervalMs = 100;
    this.lagExpectedMs = Date.now() + lagIntervalMs;
    this.lagMaxMs = 0;
    this.lagSumMs = 0;
    this.lagSamples = 0;
    this.lagTimer = setInterval(() => {
      const now = Date.now();
      const lag = Math.max(0, now - this.lagExpectedMs);
      this.lagMaxMs = Math.max(this.lagMaxMs, lag);
      this.lagSumMs += lag;
      this.lagSamples += 1;
      this.lagExpectedMs += lagIntervalMs;
      if (this.lagExpectedMs < now - 5 * lagIntervalMs)
        this.lagExpectedMs = now + lagIntervalMs;
    }, lagIntervalMs);
  }
  stop() {
    if (this.timer)
      clearInterval(this.timer);
    if (this.snapshotTimer)
      clearInterval(this.snapshotTimer);
    if (this.retentionTimer)
      clearInterval(this.retentionTimer);
    if (this.lagTimer)
      clearInterval(this.lagTimer);
    this.timer = null;
    this.snapshotTimer = null;
    this.retentionTimer = null;
    this.lagTimer = null;
  }
  ensureStreamResult() {
    if (!this.enabled)
      return Result30.ok(undefined);
    const existing = this.db.getStream(this.metricsStream);
    if (existing) {
      if (String(existing.content_type) !== "application/json") {
        return Result30.err({
          kind: "live_metrics_stream_content_type_mismatch",
          message: `live metrics stream content-type mismatch: ${existing.content_type}`
        });
      }
      if ((existing.stream_flags & STREAM_FLAG_TOUCH) === 0)
        this.db.addStreamFlags(this.metricsStream, STREAM_FLAG_TOUCH);
      return Result30.ok(undefined);
    }
    this.db.ensureStream(this.metricsStream, { contentType: "application/json", streamFlags: STREAM_FLAG_TOUCH });
    return Result30.ok(undefined);
  }
  get(stream, touchCfg) {
    const existing = this.counters.get(stream);
    if (existing)
      return existing;
    const c = defaultCounters(touchCfg);
    this.counters.set(stream, c);
    return c;
  }
  ensure(stream) {
    const existing = this.counters.get(stream);
    if (existing)
      return existing;
    const c = defaultCounters({ enabled: true });
    this.counters.set(stream, c);
    return c;
  }
  getMemoryStats() {
    return { counterStreams: this.counters.size };
  }
  recordProcessorError(stream, touchCfg) {
    const c = this.get(stream, touchCfg);
    c.processor.errors += 1;
  }
  recordProcessorBatch(args) {
    const c = this.get(args.stream, args.touchCfg);
    c.touch.coarseIntervalMs = args.touchCfg.coarseIntervalMs ?? c.touch.coarseIntervalMs;
    c.touch.coalesceWindowMs = args.touchCfg.touchCoalesceWindowMs ?? c.touch.coalesceWindowMs;
    c.touch.mode = args.touchMode;
    c.touch.hotFineKeys = Math.max(c.touch.hotFineKeys, Math.max(0, Math.floor(args.hotFineKeys ?? 0)));
    c.touch.hotTemplates = Math.max(c.touch.hotTemplates, Math.max(0, Math.floor(args.hotTemplates ?? 0)));
    c.touch.hotFineKeysActive = Math.max(c.touch.hotFineKeysActive, Math.max(0, Math.floor(args.hotFineKeysActive ?? 0)));
    c.touch.hotFineKeysGrace = Math.max(c.touch.hotFineKeysGrace, Math.max(0, Math.floor(args.hotFineKeysGrace ?? 0)));
    c.touch.hotTemplatesActive = Math.max(c.touch.hotTemplatesActive, Math.max(0, Math.floor(args.hotTemplatesActive ?? 0)));
    c.touch.hotTemplatesGrace = Math.max(c.touch.hotTemplatesGrace, Math.max(0, Math.floor(args.hotTemplatesGrace ?? 0)));
    c.touch.fineWaitersActive = Math.max(c.touch.fineWaitersActive, Math.max(0, Math.floor(args.fineWaitersActive ?? 0)));
    c.touch.coarseWaitersActive = Math.max(c.touch.coarseWaitersActive, Math.max(0, Math.floor(args.coarseWaitersActive ?? 0)));
    c.touch.broadFineWaitersActive = Math.max(c.touch.broadFineWaitersActive, Math.max(0, Math.floor(args.broadFineWaitersActive ?? 0)));
    c.processor.eventsIn += Math.max(0, args.rowsRead);
    c.processor.changesOut += Math.max(0, args.changes);
    c.processor.lagSourceOffsets = Math.max(c.processor.lagSourceOffsets, Math.max(0, args.lagSourceOffsets));
    c.processor.scannedBatches += 1;
    if (args.scannedButEmitted0)
      c.processor.scannedButEmitted0Batches += 1;
    if (args.noInterestFastForward)
      c.processor.noInterestFastForwardBatches += 1;
    c.processor.processedThroughDelta += Math.max(0, Math.floor(args.processedThroughDelta ?? 0));
    c.processor.touchesEmittedDelta += Math.max(0, Math.floor(args.touchesEmittedDelta ?? 0));
    if (args.commitLagMs != null && Number.isFinite(args.commitLagMs) && args.commitLagMs >= 0) {
      c.processor.commitLagSamples += 1;
      c.processor.commitLagMsSum += args.commitLagMs;
      c.processor.commitLagHist.record(args.commitLagMs);
    }
    c.touch.fineTouchesDroppedDueToBudget += Math.max(0, args.fineTouchesDroppedDueToBudget ?? 0);
    c.touch.fineTouchesSkippedColdTemplate += Math.max(0, args.fineTouchesSkippedColdTemplate ?? 0);
    c.touch.fineTouchesSkippedColdKey += Math.max(0, args.fineTouchesSkippedColdKey ?? 0);
    c.touch.fineTouchesSkippedTemplateBucket += Math.max(0, args.fineTouchesSkippedTemplateBucket ?? 0);
    if (args.fineTouchesSuppressedDueToLag)
      c.touch.fineTouchesSuppressedBatchesDueToLag += 1;
    c.touch.fineTouchesSuppressedMsDueToLag += Math.max(0, args.fineTouchesSuppressedDueToLagMs ?? 0);
    if (args.fineTouchesSuppressedDueToBudget)
      c.touch.fineTouchesSuppressedBatchesDueToBudget += 1;
    const unique = new Set;
    let table = 0;
    let tpl = 0;
    for (const t of args.touches) {
      unique.add(t.keyId >>> 0);
      if (t.kind === "table")
        table++;
      else
        tpl++;
    }
    c.touch.touchesEmitted += args.touches.length;
    c.touch.uniqueKeysTouched += unique.size;
    c.touch.tableTouchesEmitted += table;
    c.touch.templateTouchesEmitted += tpl;
  }
  recordWait(stream, touchCfg, keysCount, outcome, latencyMs) {
    const c = this.get(stream, touchCfg);
    c.wait.calls += 1;
    c.wait.keysWatchedTotal += Math.max(0, keysCount);
    c.wait.latencySumMs += Math.max(0, latencyMs);
    c.wait.latencyHist.record(latencyMs);
    if (outcome === "touched")
      c.wait.touched += 1;
    else if (outcome === "timeout")
      c.wait.timeout += 1;
    else
      c.wait.stale += 1;
    if (outcome === "stale")
      c.touch.staleResponses += 1;
  }
  recordBaseWalGc(stream, args) {
    const c = this.ensure(stream);
    c.gc.baseWalGcCalls += 1;
    c.gc.baseWalGcDeletedRows += Math.max(0, args.deletedRows);
    c.gc.baseWalGcDeletedBytes += Math.max(0, args.deletedBytes);
    c.gc.baseWalGcMsSum += Math.max(0, args.durationMs);
    c.gc.baseWalGcMsMax = Math.max(c.gc.baseWalGcMsMax, Math.max(0, args.durationMs));
  }
  async emitLifecycle(events) {
    if (!this.enabled)
      return;
    if (events.length === 0)
      return;
    const rows = events.map((e) => ({
      routingKey: new TextEncoder().encode(`${e.stream}|${e.type}`),
      contentType: "application/json",
      payload: new TextEncoder().encode(JSON.stringify({
        ...e,
        liveSystemVersion: "v2",
        instanceId: this.instanceId,
        region: this.region
      }))
    }));
    for (const e of events) {
      const c = this.ensure(e.stream);
      if (e.type === "live.template_activated")
        c.templates.activated += 1;
      else if (e.type === "live.template_retired")
        c.templates.retired += 1;
      else if (e.type === "live.template_evicted")
        c.templates.evicted += 1;
    }
    try {
      const appendRes = await this.ingest.appendInternal({
        stream: this.metricsStream,
        baseAppendMs: BigInt(Date.now()),
        rows,
        contentType: "application/json"
      });
      if (!Result30.isError(appendRes)) {
        this.onAppended?.({
          lastOffset: appendRes.value.lastOffset,
          stream: this.metricsStream
        });
      }
    } catch {}
  }
  recordActivationDenied(stream, touchCfg, n = 1) {
    const c = this.get(stream, touchCfg);
    c.templates.activationDenied += Math.max(0, n);
  }
  async flushTick() {
    if (!this.enabled)
      return;
    const nowMs = Date.now();
    const clampBigInt = (v) => {
      if (v <= 0n)
        return 0;
      const max = BigInt(Number.MAX_SAFE_INTEGER);
      return v > max ? Number.MAX_SAFE_INTEGER : Number(v);
    };
    const states = this.db.listStreamTouchStates();
    if (states.length === 0)
      return;
    const rows = [];
    const encoder = new TextEncoder;
    const loopLagMax = this.lagMaxMs;
    const loopLagAvg = this.lagSamples > 0 ? this.lagSumMs / this.lagSamples : 0;
    this.lagMaxMs = 0;
    this.lagSumMs = 0;
    this.lagSamples = 0;
    for (const st of states) {
      const stream = st.stream;
      const regRow = this.db.getStream(stream);
      if (!regRow)
        continue;
      const touchCfg = (() => {
        const profileRes = this.profiles.getProfileResult(stream, regRow);
        if (Result30.isError(profileRes))
          return null;
        return resolveEnabledTouchCapability(profileRes.value)?.touchCfg ?? null;
      })();
      if (!touchCfg)
        continue;
      const c = this.get(stream, touchCfg);
      const journal = this.getTouchJournal?.(stream) ?? null;
      const waitActive = journal?.meta.activeWaiters ?? 0;
      const tailSeq = regRow.next_offset > 0n ? regRow.next_offset - 1n : -1n;
      const processedThrough = st.processed_through;
      const gcThrough = processedThrough < regRow.uploaded_through ? processedThrough : regRow.uploaded_through;
      const backlog = tailSeq >= processedThrough ? tailSeq - processedThrough : 0n;
      const backlogNum = backlog > BigInt(Number.MAX_SAFE_INTEGER) ? Number.MAX_SAFE_INTEGER : Number(backlog);
      let walOldestOffset = null;
      try {
        const oldest = this.db.getWalOldestOffset(stream);
        walOldestOffset = oldest == null ? null : encodeOffset(regRow.epoch, oldest);
      } catch {
        walOldestOffset = null;
      }
      const activeTemplates = (() => {
        try {
          const row = this.db.db.query(`SELECT COUNT(*) as cnt FROM live_templates WHERE stream=? AND state='active';`).get(stream);
          return Number(row?.cnt ?? 0);
        } catch {
          return 0;
        }
      })();
      const tick = {
        type: "live.tick",
        ts: nowIso2(nowMs),
        stream,
        liveSystemVersion: "v2",
        instanceId: this.instanceId,
        region: this.region,
        touch: {
          coarseIntervalMs: c.touch.coarseIntervalMs,
          coalesceWindowMs: c.touch.coalesceWindowMs,
          mode: c.touch.mode,
          hotFineKeys: c.touch.hotFineKeys,
          hotTemplates: c.touch.hotTemplates,
          hotFineKeysActive: c.touch.hotFineKeysActive,
          hotFineKeysGrace: c.touch.hotFineKeysGrace,
          hotTemplatesActive: c.touch.hotTemplatesActive,
          hotTemplatesGrace: c.touch.hotTemplatesGrace,
          fineWaitersActive: c.touch.fineWaitersActive,
          coarseWaitersActive: c.touch.coarseWaitersActive,
          broadFineWaitersActive: c.touch.broadFineWaitersActive,
          touchesEmitted: c.touch.touchesEmitted,
          uniqueKeysTouched: c.touch.uniqueKeysTouched,
          tableTouchesEmitted: c.touch.tableTouchesEmitted,
          templateTouchesEmitted: c.touch.templateTouchesEmitted,
          staleResponses: c.touch.staleResponses,
          fineTouchesDroppedDueToBudget: c.touch.fineTouchesDroppedDueToBudget,
          fineTouchesSkippedColdTemplate: c.touch.fineTouchesSkippedColdTemplate,
          fineTouchesSkippedColdKey: c.touch.fineTouchesSkippedColdKey,
          fineTouchesSkippedTemplateBucket: c.touch.fineTouchesSkippedTemplateBucket,
          fineTouchesSuppressedBatchesDueToLag: c.touch.fineTouchesSuppressedBatchesDueToLag,
          fineTouchesSuppressedSecondsDueToLag: c.touch.fineTouchesSuppressedMsDueToLag / 1000,
          fineTouchesSuppressedBatchesDueToBudget: c.touch.fineTouchesSuppressedBatchesDueToBudget,
          cursor: journal?.meta.cursor ?? null,
          epoch: journal?.meta.epoch ?? null,
          generation: journal?.meta.generation ?? null,
          pendingKeys: journal?.meta.pendingKeys ?? 0,
          overflowBuckets: journal?.meta.overflowBuckets ?? 0
        },
        templates: {
          active: activeTemplates,
          activated: c.templates.activated,
          retired: c.templates.retired,
          evicted: c.templates.evicted,
          activationDenied: c.templates.activationDenied
        },
        wait: {
          calls: c.wait.calls,
          keysWatchedTotal: c.wait.keysWatchedTotal,
          avgKeysPerCall: c.wait.calls > 0 ? c.wait.keysWatchedTotal / c.wait.calls : 0,
          touched: c.wait.touched,
          timeout: c.wait.timeout,
          stale: c.wait.stale,
          avgLatencyMs: c.wait.calls > 0 ? c.wait.latencySumMs / c.wait.calls : 0,
          p95LatencyMs: c.wait.latencyHist.p95(),
          activeWaiters: waitActive,
          timeoutsFired: journal?.interval.timeoutsFired ?? 0,
          timeoutSweeps: journal?.interval.timeoutSweeps ?? 0,
          timeoutSweepMsSum: journal?.interval.timeoutSweepMsSum ?? 0,
          timeoutSweepMsMax: journal?.interval.timeoutSweepMsMax ?? 0,
          notifyWakeups: journal?.interval.notifyWakeups ?? 0,
          notifyFlushes: journal?.interval.notifyFlushes ?? 0,
          notifyWakeMsSum: journal?.interval.notifyWakeMsSum ?? 0,
          notifyWakeMsMax: journal?.interval.notifyWakeMsMax ?? 0,
          timeoutHeapSize: journal?.interval.heapSize ?? 0
        },
        processor: {
          eventsIn: c.processor.eventsIn,
          changesOut: c.processor.changesOut,
          errors: c.processor.errors,
          lagSourceOffsets: c.processor.lagSourceOffsets,
          scannedBatches: c.processor.scannedBatches,
          scannedButEmitted0Batches: c.processor.scannedButEmitted0Batches,
          noInterestFastForwardBatches: c.processor.noInterestFastForwardBatches,
          processedThroughDelta: c.processor.processedThroughDelta,
          touchesEmittedDelta: c.processor.touchesEmittedDelta,
          commitLagMsAvg: c.processor.commitLagSamples > 0 ? c.processor.commitLagMsSum / c.processor.commitLagSamples : 0,
          commitLagMsP50: c.processor.commitLagHist.p50(),
          commitLagMsP95: c.processor.commitLagHist.p95(),
          commitLagMsP99: c.processor.commitLagHist.p99()
        },
        base: {
          tailOffset: encodeOffset(regRow.epoch, tailSeq),
          nextOffset: encodeOffset(regRow.epoch, regRow.next_offset),
          sealedThrough: encodeOffset(regRow.epoch, regRow.sealed_through),
          uploadedThrough: encodeOffset(regRow.epoch, regRow.uploaded_through),
          processedThrough: encodeOffset(regRow.epoch, processedThrough),
          gcThrough: encodeOffset(regRow.epoch, gcThrough),
          walOldestOffset,
          walRetainedRows: clampBigInt(regRow.wal_rows),
          walRetainedBytes: clampBigInt(regRow.wal_bytes),
          gc: {
            calls: c.gc.baseWalGcCalls,
            deletedRows: c.gc.baseWalGcDeletedRows,
            deletedBytes: c.gc.baseWalGcDeletedBytes,
            msSum: c.gc.baseWalGcMsSum,
            msMax: c.gc.baseWalGcMsMax
          },
          backlogSourceOffsets: backlogNum
        },
        process: {
          eventLoopLagMsMax: loopLagMax,
          eventLoopLagMsAvg: loopLagAvg
        }
      };
      rows.push({
        routingKey: encoder.encode(`${stream}|live.tick`),
        contentType: "application/json",
        payload: encoder.encode(JSON.stringify(tick))
      });
      c.touch.hotFineKeys = 0;
      c.touch.hotTemplates = 0;
      c.touch.hotFineKeysActive = 0;
      c.touch.hotFineKeysGrace = 0;
      c.touch.hotTemplatesActive = 0;
      c.touch.hotTemplatesGrace = 0;
      c.touch.fineWaitersActive = 0;
      c.touch.coarseWaitersActive = 0;
      c.touch.broadFineWaitersActive = 0;
      c.touch.touchesEmitted = 0;
      c.touch.uniqueKeysTouched = 0;
      c.touch.tableTouchesEmitted = 0;
      c.touch.templateTouchesEmitted = 0;
      c.touch.staleResponses = 0;
      c.touch.fineTouchesDroppedDueToBudget = 0;
      c.touch.fineTouchesSkippedColdTemplate = 0;
      c.touch.fineTouchesSkippedColdKey = 0;
      c.touch.fineTouchesSkippedTemplateBucket = 0;
      c.touch.fineTouchesSuppressedBatchesDueToLag = 0;
      c.touch.fineTouchesSuppressedMsDueToLag = 0;
      c.touch.fineTouchesSuppressedBatchesDueToBudget = 0;
      c.touch.mode = "idle";
      c.templates.activated = 0;
      c.templates.retired = 0;
      c.templates.evicted = 0;
      c.templates.activationDenied = 0;
      c.wait.calls = 0;
      c.wait.keysWatchedTotal = 0;
      c.wait.touched = 0;
      c.wait.timeout = 0;
      c.wait.stale = 0;
      c.wait.latencySumMs = 0;
      c.wait.latencyHist.reset();
      c.processor.eventsIn = 0;
      c.processor.changesOut = 0;
      c.processor.errors = 0;
      c.processor.lagSourceOffsets = 0;
      c.processor.scannedBatches = 0;
      c.processor.scannedButEmitted0Batches = 0;
      c.processor.noInterestFastForwardBatches = 0;
      c.processor.processedThroughDelta = 0;
      c.processor.touchesEmittedDelta = 0;
      c.processor.commitLagSamples = 0;
      c.processor.commitLagMsSum = 0;
      c.processor.commitLagHist.reset();
      c.gc.baseWalGcCalls = 0;
      c.gc.baseWalGcDeletedRows = 0;
      c.gc.baseWalGcDeletedBytes = 0;
      c.gc.baseWalGcMsSum = 0;
      c.gc.baseWalGcMsMax = 0;
    }
    if (rows.length === 0)
      return;
    try {
      const appendRes = await this.ingest.appendInternal({
        stream: this.metricsStream,
        baseAppendMs: BigInt(nowMs),
        rows,
        contentType: "application/json"
      });
      if (!Result30.isError(appendRes)) {
        this.onAppended?.({
          lastOffset: appendRes.value.lastOffset,
          stream: this.metricsStream
        });
      }
    } catch {}
  }
  async emitSnapshots() {
    if (!this.enabled)
      return;
    const nowMs = Date.now();
    const streams = this.db.listStreamTouchStates().map((r) => r.stream);
    if (streams.length === 0)
      return;
    const encoder = new TextEncoder;
    const rows = [];
    for (const stream of streams) {
      let templates = [];
      try {
        templates = this.db.db.query(`SELECT template_id, entity, fields_json, last_seen_at_ms, state
             FROM live_templates
             WHERE stream=? AND state='active'
             ORDER BY entity ASC, template_id ASC;`).all(stream);
      } catch {
        continue;
      }
      const snapshotId = `s-${stream}-${nowMs}`;
      const activeTemplates = templates.length;
      rows.push({
        routingKey: encoder.encode(`${stream}|live.templates_snapshot_start`),
        contentType: "application/json",
        payload: encoder.encode(JSON.stringify({
          type: "live.templates_snapshot_start",
          ts: nowIso2(nowMs),
          stream,
          liveSystemVersion: "v2",
          instanceId: this.instanceId,
          region: this.region,
          snapshotId,
          activeTemplates,
          chunkSize: this.snapshotChunkSize
        }))
      });
      let chunkIndex = 0;
      for (let i = 0;i < templates.length; i += this.snapshotChunkSize) {
        const slice = templates.slice(i, i + this.snapshotChunkSize);
        const payloadTemplates = slice.map((t) => {
          const templateId = String(t.template_id);
          const entity = String(t.entity);
          let fields = [];
          try {
            const f = JSON.parse(String(t.fields_json));
            if (Array.isArray(f))
              fields = f.map(String);
          } catch {}
          const lastSeenAgoMs = Math.max(0, nowMs - Number(t.last_seen_at_ms));
          return { templateId, entity, fields, lastSeenAgoMs, state: "active" };
        });
        rows.push({
          routingKey: encoder.encode(`${stream}|live.templates_snapshot_chunk`),
          contentType: "application/json",
          payload: encoder.encode(JSON.stringify({
            type: "live.templates_snapshot_chunk",
            ts: nowIso2(nowMs),
            stream,
            liveSystemVersion: "v2",
            instanceId: this.instanceId,
            region: this.region,
            snapshotId,
            chunkIndex,
            templates: payloadTemplates
          }))
        });
        chunkIndex++;
      }
      rows.push({
        routingKey: encoder.encode(`${stream}|live.templates_snapshot_end`),
        contentType: "application/json",
        payload: encoder.encode(JSON.stringify({
          type: "live.templates_snapshot_end",
          ts: nowIso2(nowMs),
          stream,
          liveSystemVersion: "v2",
          instanceId: this.instanceId,
          region: this.region,
          snapshotId
        }))
      });
    }
    if (rows.length === 0)
      return;
    try {
      const appendRes = await this.ingest.appendInternal({
        stream: this.metricsStream,
        baseAppendMs: BigInt(nowMs),
        rows,
        contentType: "application/json"
      });
      if (!Result30.isError(appendRes)) {
        this.onAppended?.({
          lastOffset: appendRes.value.lastOffset,
          stream: this.metricsStream
        });
      }
    } catch {}
  }
}

// src/touch/manager.ts
import { Result as Result31 } from "better-result";
var BASE_WAL_GC_INTERVAL_MS = (() => {
  const raw = process.env.DS_BASE_WAL_GC_INTERVAL_MS;
  if (raw == null || raw.trim() === "")
    return 1000;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) {
    console.error(`invalid DS_BASE_WAL_GC_INTERVAL_MS: ${raw}`);
    return 1000;
  }
  return Math.floor(n);
})();
var BASE_WAL_GC_CHUNK_OFFSETS2 = (() => {
  const raw = process.env.DS_BASE_WAL_GC_CHUNK_OFFSETS;
  if (raw == null || raw.trim() === "")
    return 1e6;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    console.error(`invalid DS_BASE_WAL_GC_CHUNK_OFFSETS: ${raw}`);
    return 1e6;
  }
  return Math.floor(n);
})();
var HOT_INTEREST_MAX_KEYS = 64;

class TouchProcessorManager {
  cfg;
  db;
  profiles;
  pool;
  timer = null;
  running = false;
  stopping = false;
  dirty = new Set;
  failures = new FailureTracker(1024);
  lastBaseWalGc = new LruCache(1024);
  templates;
  liveMetrics;
  lastTemplateGcMsByStream = new LruCache(1024);
  journals = new Map;
  fineLagCoarseOnlyByStream = new Map;
  touchModeByStream = new Map;
  fineTokenBucketsByStream = new Map;
  hotFineByStream = new Map;
  lagSourceOffsetsByStream = new Map;
  restrictedTemplateBucketStateByStream = new Map;
  runtimeTotalsByStream = new Map;
  zeroRowBacklogStreakByStream = new Map;
  journalsCreatedTotal = 0;
  streamScanCursor = 0;
  restartWorkerPoolRequested = false;
  lastWorkerPoolRestartAtMs = 0;
  constructor(cfg, db, ingest, notifier, profiles, backpressure) {
    this.cfg = cfg;
    this.db = db;
    this.profiles = profiles;
    this.pool = new TouchProcessorWorkerPool(cfg, cfg.touchWorkers);
    this.templates = new LiveTemplateRegistry(db);
    this.liveMetrics = new LiveMetricsV2(db, ingest, profiles, {
      getTouchJournal: (stream) => {
        const j = this.journals.get(stream);
        if (!j)
          return null;
        return { meta: j.getMeta(), interval: j.snapshotAndResetIntervalStats() };
      },
      onAppended: ({ lastOffset, stream }) => {
        notifier.notify(stream, lastOffset);
        notifier.notifyDetailsChanged(stream);
      }
    });
  }
  start() {
    if (this.timer)
      return;
    this.stopping = false;
    this.seedTouchStateFromProfiles();
    const liveMetricsRes = this.liveMetrics.ensureStreamResult();
    if (Result31.isError(liveMetricsRes)) {
      console.error("touch live metrics stream validation failed", liveMetricsRes.error.message);
    } else {
      this.liveMetrics.start();
    }
    if (this.cfg.touchCheckIntervalMs > 0) {
      this.timer = setInterval(() => {
        this.tick();
      }, this.cfg.touchCheckIntervalMs);
    }
  }
  async stop() {
    this.stopping = true;
    if (this.timer)
      clearInterval(this.timer);
    this.timer = null;
    await this.pool.stop();
    this.liveMetrics.stop();
    for (const j of this.journals.values())
      j.stop();
    this.journals.clear();
    this.fineLagCoarseOnlyByStream.clear();
    this.touchModeByStream.clear();
    this.fineTokenBucketsByStream.clear();
    this.hotFineByStream.clear();
    this.lagSourceOffsetsByStream.clear();
    this.restrictedTemplateBucketStateByStream.clear();
    this.runtimeTotalsByStream.clear();
    this.zeroRowBacklogStreakByStream.clear();
    this.restartWorkerPoolRequested = false;
    this.lastWorkerPoolRestartAtMs = 0;
  }
  getMemoryStats() {
    let journalFilterBytesTotal = 0;
    for (const journal of this.journals.values())
      journalFilterBytesTotal += journal.getFilterBytes();
    const templateStats = this.templates.getMemoryStats();
    const liveMetricsStats = this.liveMetrics.getMemoryStats();
    return {
      dirtyStreams: this.dirty.size,
      journals: this.journals.size,
      journalsCreatedTotal: this.journalsCreatedTotal,
      journalFilterBytesTotal,
      fineLagCoarseOnlyStreams: this.fineLagCoarseOnlyByStream.size,
      touchModeStreams: this.touchModeByStream.size,
      fineTokenBucketStreams: this.fineTokenBucketsByStream.size,
      hotFineStreams: this.hotFineByStream.size,
      lagSourceOffsetStreams: this.lagSourceOffsetsByStream.size,
      restrictedTemplateBucketStreams: this.restrictedTemplateBucketStateByStream.size,
      runtimeTotalsStreams: this.runtimeTotalsByStream.size,
      zeroRowBacklogStreakStreams: this.zeroRowBacklogStreakByStream.size,
      templateLastSeenEntries: templateStats.lastSeenEntries,
      templateDirtyLastSeenEntries: templateStats.dirtyLastSeenEntries,
      templateRateStateStreams: templateStats.rateStateStreams,
      liveMetricsCounterStreams: liveMetricsStats.counterStreams
    };
  }
  getTopStreams(limit = 5) {
    const rows = [];
    for (const [stream, journal] of this.journals) {
      rows.push({
        stream,
        journal_filter_bytes: journal.getFilterBytes(),
        dirty: this.dirty.has(stream),
        touch_mode: this.touchModeByStream.get(stream) ?? null
      });
    }
    return rows.sort((a, b) => b.journal_filter_bytes - a.journal_filter_bytes || a.stream.localeCompare(b.stream)).slice(0, Math.max(0, Math.floor(limit)));
  }
  notify(stream) {
    this.dirty.add(stream);
  }
  async tick() {
    if (this.stopping)
      return;
    if (this.running)
      return;
    if (this.cfg.touchWorkers <= 0)
      return;
    this.running = true;
    try {
      const nowMs = Date.now();
      const dirtyNow = new Set(this.dirty);
      this.dirty.clear();
      const states = this.db.listStreamTouchStates();
      if (states.length === 0)
        return;
      this.pool.start();
      const stateByStream = new Map(states.map((s) => [s.stream, s]));
      const ordered = [];
      for (const s of dirtyNow)
        if (stateByStream.has(s))
          ordered.push(s);
      for (const s of stateByStream.keys())
        if (!dirtyNow.has(s))
          ordered.push(s);
      const prioritized = this.prioritizeStreamsForProcessing(ordered, nowMs);
      const maxConcurrent = Math.max(1, this.cfg.touchWorkers);
      const tasks = [];
      if (prioritized.length > 0) {
        const total = prioritized.length;
        const start = this.streamScanCursor % total;
        for (let i = 0;i < total && tasks.length < maxConcurrent; i++) {
          if (this.stopping)
            break;
          const stream = prioritized[(start + i) % total];
          if (this.failures.shouldSkip(stream))
            continue;
          const st = stateByStream.get(stream);
          if (!st)
            continue;
          const p = this.processOne(stream, st.processed_through).catch((e) => {
            this.failures.recordFailure(stream);
            console.error("touch processor failed", stream, e);
          });
          tasks.push(p);
        }
        this.streamScanCursor = (start + Math.max(1, tasks.length)) % total;
      }
      await Promise.all(tasks);
      if (this.restartWorkerPoolRequested) {
        this.restartWorkerPoolRequested = false;
        try {
          await this.pool.restart();
          this.lastWorkerPoolRestartAtMs = Date.now();
        } catch (e) {
          console.error("touch processor worker-pool restart failed", e);
        }
      }
      for (const stream of stateByStream.keys()) {
        if (this.stopping)
          break;
        const srow = this.db.getStream(stream);
        if (!srow || this.db.isDeleted(srow))
          continue;
        const touchState = this.db.getStreamTouchState(stream);
        if (!touchState)
          continue;
        this.maybeGcBaseWal(stream, srow.uploaded_through, touchState.processed_through);
      }
      const touchCfgByStream = new Map;
      let persistIntervalMin = Number.POSITIVE_INFINITY;
      for (const stream of stateByStream.keys()) {
        if (this.stopping)
          break;
        const profileRes = this.profiles.getProfileResult(stream);
        if (Result31.isError(profileRes)) {
          console.error("touch profile read failed", stream, profileRes.error.message);
          continue;
        }
        const profile2 = profileRes.value;
        const enabledTouch = resolveEnabledTouchCapability(profile2);
        if (!enabledTouch)
          continue;
        const touchCfg = enabledTouch.touchCfg;
        touchCfgByStream.set(stream, touchCfg);
        const persistInterval = touchCfg.templates?.lastSeenPersistIntervalMs ?? 5 * 60 * 1000;
        if (persistInterval < persistIntervalMin)
          persistIntervalMin = persistInterval;
      }
      if (touchCfgByStream.size > 0 && Number.isFinite(persistIntervalMin)) {
        this.templates.flushLastSeen(nowMs, persistIntervalMin);
      }
      for (const [stream, touchCfg] of touchCfgByStream.entries()) {
        if (this.stopping)
          break;
        const gcInterval = touchCfg.templates?.gcIntervalMs ?? 60000;
        const last = this.lastTemplateGcMsByStream.get(stream) ?? 0;
        if (nowMs - last < gcInterval)
          continue;
        this.lastTemplateGcMsByStream.set(stream, nowMs);
        const retired = this.templates.gcRetireExpired(stream, nowMs);
        if (retired.retired.length > 0) {
          this.liveMetrics.emitLifecycle(retired.retired);
        }
      }
    } finally {
      this.running = false;
    }
  }
  async processOne(stream, processedThroughAtStart) {
    const srow = this.db.getStream(stream);
    if (!srow || this.db.isDeleted(srow)) {
      this.db.deleteStreamTouchState(stream);
      return;
    }
    const next = srow.next_offset;
    if (next <= 0n)
      return;
    const fromOffset = processedThroughAtStart + 1n;
    const toOffset = next - 1n;
    if (fromOffset > toOffset)
      return;
    const profileRes = this.profiles.getProfileResult(stream, srow);
    if (Result31.isError(profileRes)) {
      console.error("touch profile read failed", stream, profileRes.error.message);
      this.db.deleteStreamTouchState(stream);
      return;
    }
    const profile2 = profileRes.value;
    const enabledTouch = resolveEnabledTouchCapability(profile2);
    if (!enabledTouch) {
      this.db.deleteStreamTouchState(stream);
      return;
    }
    const touchCfg = enabledTouch.touchCfg;
    const failProcessing = (message) => {
      this.failures.recordFailure(stream);
      this.liveMetrics.recordProcessorError(stream, touchCfg);
      console.error("touch processor failed", stream, message);
    };
    const nowMs = Date.now();
    const hotFine = this.getHotFineSnapshot(stream, touchCfg, nowMs);
    const fineWaitersActive = hotFine?.fineWaitersActive ?? 0;
    const coarseWaitersActive = hotFine?.coarseWaitersActive ?? 0;
    const hasAnyWaiters = fineWaitersActive + coarseWaitersActive > 0;
    const hasFineDemand = fineWaitersActive > 0 || (hotFine?.broadFineWaitersActive ?? 0) > 0 || (hotFine?.hotKeyCount ?? 0) > 0 || (hotFine?.hotTemplateCount ?? 0) > 0;
    const lagAtStart = toOffset >= processedThroughAtStart ? toOffset - processedThroughAtStart : 0n;
    const suppressFineDueToLag = this.computeSuppressFineDueToLag(stream, touchCfg, lagAtStart, hasFineDemand);
    const j = this.getOrCreateJournal(stream, touchCfg);
    j.setCoalesceMs(this.computeAdaptiveCoalesceMs(touchCfg, lagAtStart, hasAnyWaiters));
    const fineBudgetPerBatch = Math.max(0, Math.floor(touchCfg.fineTouchBudgetPerBatch ?? 2000));
    const lagReservedFineBudgetPerBatch = Math.max(0, Math.floor(touchCfg.lagReservedFineTouchBudgetPerBatch ?? 200));
    let fineBudget = !hasFineDemand ? 0 : suppressFineDueToLag ? lagReservedFineBudgetPerBatch : fineBudgetPerBatch;
    let tokenLimited = false;
    let refundFineTokens = null;
    if (fineBudget > 0) {
      const tokenGrant = this.reserveFineTokens(stream, touchCfg, fineBudget, nowMs);
      fineBudget = tokenGrant.granted;
      tokenLimited = tokenGrant.tokenLimited;
      refundFineTokens = tokenGrant.refund;
    }
    let emitFineTouches = hasFineDemand && fineBudget > 0;
    let fineGranularity = "key";
    const batchStartMs = Date.now();
    if (emitFineTouches && hotFine && hotFine.hotKeyCount === 0 && hotFine.hotTemplateCount === 0 && hotFine.broadFineWaitersActive === 0 && hotFine.keyFilteringEnabled && !hotFine.templateFilteringEnabled) {
      emitFineTouches = false;
    }
    if (emitFineTouches && suppressFineDueToLag)
      fineGranularity = "template";
    if (fineGranularity !== "template") {
      this.restrictedTemplateBucketStateByStream.delete(stream);
    }
    const processingMode = fineGranularity === "template" ? "hotTemplatesOnly" : "full";
    const touchMode = !hasAnyWaiters ? "idle" : emitFineTouches ? suppressFineDueToLag ? "restricted" : "fine" : "coarseOnly";
    this.touchModeByStream.set(stream, touchMode);
    const processRes = await this.pool.processResult({
      stream,
      fromOffset,
      toOffset,
      profile: profile2,
      maxRows: Math.max(1, this.cfg.touchMaxBatchRows),
      maxBytes: Math.max(1, this.cfg.touchMaxBatchBytes),
      emitFineTouches,
      fineTouchBudget: emitFineTouches ? fineBudget : 0,
      fineGranularity,
      processingMode,
      filterHotTemplates: !!(hotFine && hotFine.templateFilteringEnabled),
      hotTemplateIds: hotFine?.hotTemplateIdsForWorker ?? null
    });
    if (Result31.isError(processRes)) {
      failProcessing(processRes.error.message);
      return;
    }
    const res = processRes.value;
    if (res.stats.rowsRead === 0 && toOffset >= fromOffset && this.rangeLikelyHasRows(stream, fromOffset, toOffset)) {
      const nextStreak = (this.zeroRowBacklogStreakByStream.get(stream) ?? 0) + 1;
      this.zeroRowBacklogStreakByStream.set(stream, nextStreak);
      if (nextStreak >= 5) {
        const now = Date.now();
        if (now - this.lastWorkerPoolRestartAtMs >= 30000) {
          this.restartWorkerPoolRequested = true;
          console.error("touch processor produced zero-row batch despite WAL backlog; scheduling worker-pool restart", stream, `from=${fromOffset.toString()}`, `to=${toOffset.toString()}`);
        }
      }
    } else {
      this.zeroRowBacklogStreakByStream.delete(stream);
    }
    if (refundFineTokens) {
      refundFineTokens(Math.max(0, res.stats.templateTouchesEmitted ?? 0));
    }
    const batchDurationMs = Math.max(0, Date.now() - batchStartMs);
    let touches = res.touches;
    const fineDroppedDueToBudget = Math.max(0, res.stats.fineTouchesDroppedDueToBudget ?? 0);
    let fineSkippedColdKey = 0;
    let fineSkippedTemplateBucket = 0;
    if (hotFine && hotFine.keyFilteringEnabled && fineGranularity !== "template") {
      const keyActiveSet = hotFine.hotKeyActiveSet;
      const keyGraceSet = hotFine.hotKeyGraceSet;
      const keyCount = (keyActiveSet?.size ?? 0) + (keyGraceSet?.size ?? 0);
      if (keyCount === 0) {
        for (const t of touches)
          if (t.kind === "template")
            fineSkippedColdKey += 1;
        touches = touches.filter((t) => t.kind === "table");
      } else {
        const filtered = [];
        for (const t of touches) {
          if (t.kind !== "template") {
            filtered.push(t);
            continue;
          }
          const keyId = t.keyId >>> 0;
          if (keyActiveSet && keyActiveSet.has(keyId) || keyGraceSet && keyGraceSet.has(keyId)) {
            filtered.push(t);
          } else
            fineSkippedColdKey += 1;
        }
        touches = filtered;
      }
    }
    if (fineGranularity === "template" && touches.length > 0) {
      const coalesced = this.coalesceRestrictedTemplateTouches(stream, touchCfg, touches);
      touches = coalesced.touches;
      fineSkippedTemplateBucket = coalesced.dropped;
    }
    if (touches.length > 0) {
      const j2 = this.getOrCreateJournal(stream, touchCfg);
      for (const t of touches) {
        let sourceOffsetSeq;
        try {
          sourceOffsetSeq = BigInt(t.watermark);
        } catch {
          sourceOffsetSeq = undefined;
        }
        j2.touch(t.keyId >>> 0, sourceOffsetSeq, t.routingKey);
      }
    }
    try {
      const lag = toOffset >= res.processedThrough ? toOffset - res.processedThrough : 0n;
      const lagNum = lag > BigInt(Number.MAX_SAFE_INTEGER) ? Number.MAX_SAFE_INTEGER : Number(lag);
      const effectiveLag = hasFineDemand ? lagNum : 0;
      this.lagSourceOffsetsByStream.set(stream, effectiveLag);
      const maxSourceTsMs = Number(res.stats.maxSourceTsMs ?? 0);
      const commitLagMs = maxSourceTsMs > 0 ? Math.max(0, Date.now() - maxSourceTsMs) : undefined;
      this.liveMetrics.recordProcessorBatch({
        stream,
        touchCfg,
        rowsRead: res.stats.rowsRead,
        changes: res.stats.changes,
        touches: touches.map((t) => ({ keyId: t.keyId >>> 0, kind: t.kind })),
        lagSourceOffsets: effectiveLag,
        commitLagMs,
        fineTouchesDroppedDueToBudget: fineDroppedDueToBudget,
        fineTouchesSkippedColdTemplate: Math.max(0, res.stats.fineTouchesSkippedColdTemplate ?? 0),
        fineTouchesSkippedColdKey: fineSkippedColdKey,
        fineTouchesSkippedTemplateBucket: fineSkippedTemplateBucket,
        fineTouchesSuppressedDueToLag: suppressFineDueToLag,
        fineTouchesSuppressedDueToLagMs: suppressFineDueToLag ? batchDurationMs : 0,
        fineTouchesSuppressedDueToBudget: !!res.stats.fineTouchesSuppressedDueToBudget || tokenLimited,
        touchMode,
        hotFineKeys: hotFine?.hotKeyCount ?? 0,
        hotTemplates: hotFine?.hotTemplateCount ?? 0,
        hotFineKeysActive: hotFine?.hotKeyActiveCount ?? 0,
        hotFineKeysGrace: hotFine?.hotKeyGraceCount ?? 0,
        hotTemplatesActive: hotFine?.hotTemplateActiveCount ?? 0,
        hotTemplatesGrace: hotFine?.hotTemplateGraceCount ?? 0,
        fineWaitersActive,
        coarseWaitersActive,
        broadFineWaitersActive: hotFine?.broadFineWaitersActive ?? 0,
        scannedButEmitted0: res.stats.rowsRead > 0 && touches.length === 0,
        noInterestFastForward: false,
        processedThroughDelta: res.processedThrough >= processedThroughAtStart ? Number(res.processedThrough - processedThroughAtStart > BigInt(Number.MAX_SAFE_INTEGER) ? BigInt(Number.MAX_SAFE_INTEGER) : res.processedThrough - processedThroughAtStart) : 0,
        touchesEmittedDelta: touches.length
      });
    } catch {}
    const processedDelta = res.processedThrough >= processedThroughAtStart ? Number(res.processedThrough - processedThroughAtStart > BigInt(Number.MAX_SAFE_INTEGER) ? BigInt(Number.MAX_SAFE_INTEGER) : res.processedThrough - processedThroughAtStart) : 0;
    const totals = this.getOrCreateRuntimeTotals(stream);
    totals.scanBatchesTotal += 1;
    totals.scanRowsTotal += Math.max(0, res.stats.rowsRead);
    if (res.stats.rowsRead > 0 && touches.length === 0)
      totals.scannedButEmitted0BatchesTotal += 1;
    totals.processedThroughDeltaTotal += processedDelta;
    totals.touchesEmittedTotal += touches.length;
    let tableTouches = 0;
    let templateTouches = 0;
    for (const t of touches) {
      if (t.kind === "table")
        tableTouches += 1;
      else
        templateTouches += 1;
    }
    totals.touchesTableTotal += tableTouches;
    totals.touchesTemplateTotal += templateTouches;
    totals.fineTouchesDroppedDueToBudgetTotal += fineDroppedDueToBudget;
    totals.fineTouchesSkippedColdTemplateTotal += Math.max(0, res.stats.fineTouchesSkippedColdTemplate ?? 0);
    totals.fineTouchesSkippedColdKeyTotal += fineSkippedColdKey;
    totals.fineTouchesSkippedTemplateBucketTotal += fineSkippedTemplateBucket;
    this.db.updateStreamTouchStateThrough(stream, res.processedThrough);
    if (res.processedThrough < toOffset)
      this.dirty.add(stream);
    this.failures.recordSuccess(stream);
  }
  maybeGcBaseWal(stream, uploadedThrough, processedThrough) {
    const gcTargetThrough = processedThrough < uploadedThrough ? processedThrough : uploadedThrough;
    if (gcTargetThrough < 0n)
      return;
    const now = Date.now();
    const last = this.lastBaseWalGc.get(stream) ?? { atMs: 0, through: -1n };
    if (now - last.atMs < BASE_WAL_GC_INTERVAL_MS)
      return;
    if (gcTargetThrough <= last.through) {
      this.lastBaseWalGc.set(stream, { atMs: now, through: last.through });
      return;
    }
    const chunk = BigInt(BASE_WAL_GC_CHUNK_OFFSETS2);
    const maxThroughThisSweep = chunk > 0n ? last.through + chunk : gcTargetThrough;
    const gcThrough = gcTargetThrough > maxThroughThisSweep ? maxThroughThisSweep : gcTargetThrough;
    try {
      const start = Date.now();
      const res = this.db.deleteWalThrough(stream, gcThrough);
      const durationMs2 = Date.now() - start;
      if (res.deletedRows > 0 || res.deletedBytes > 0) {
        this.liveMetrics.recordBaseWalGc(stream, { deletedRows: res.deletedRows, deletedBytes: res.deletedBytes, durationMs: durationMs2 });
      }
      this.lastBaseWalGc.set(stream, { atMs: now, through: gcThrough });
    } catch (e) {
      console.error("base WAL gc failed", stream, e);
      this.lastBaseWalGc.set(stream, { atMs: now, through: last.through });
    }
  }
  seedTouchStateFromProfiles() {
    try {
      for (const kind of listTouchCapableProfileKinds()) {
        const streams = this.db.listStreamsByProfile(kind);
        for (const stream of streams) {
          const profileRes = this.profiles.getProfileResult(stream);
          if (Result31.isError(profileRes))
            continue;
          const touchCapability = resolveTouchCapability(profileRes.value);
          if (!touchCapability)
            continue;
          touchCapability.syncState({ db: this.db, stream, profile: profileRes.value });
        }
      }
    } catch {}
  }
  activateTemplates(args) {
    const nowMs = Date.now();
    const limits = {
      maxActiveTemplatesPerStream: args.touchCfg.templates?.maxActiveTemplatesPerStream ?? 2048,
      maxActiveTemplatesPerEntity: args.touchCfg.templates?.maxActiveTemplatesPerEntity ?? 256,
      activationRateLimitPerMinute: args.touchCfg.templates?.activationRateLimitPerMinute ?? 100
    };
    const res = this.templates.activate({
      stream: args.stream,
      activeFromTouchOffset: args.activeFromTouchOffset,
      baseStreamNextOffset: args.baseStreamNextOffset,
      templates: args.templates,
      inactivityTtlMs: args.inactivityTtlMs,
      limits,
      nowMs
    });
    const deniedRate = res.denied.filter((d) => d.reason === "rate_limited").length;
    if (deniedRate > 0)
      this.liveMetrics.recordActivationDenied(args.stream, args.touchCfg, deniedRate);
    if (res.lifecycle.length > 0)
      this.liveMetrics.emitLifecycle(res.lifecycle);
    return { activated: res.activated, denied: res.denied };
  }
  heartbeatTemplates(args) {
    const nowMs = Date.now();
    this.templates.heartbeat(args.stream, args.templateIdsUsed, nowMs);
    const persistInterval = args.touchCfg.templates?.lastSeenPersistIntervalMs ?? 5 * 60 * 1000;
    this.templates.flushLastSeen(nowMs, persistInterval);
  }
  beginHotWaitInterest(args) {
    const nowMs = Date.now();
    const limits = this.getHotFineLimits(args.touchCfg);
    const state = this.getOrCreateHotFineState(args.stream);
    const isFine = args.interestMode === "fine";
    if (isFine)
      state.fineWaitersActive += 1;
    else
      state.coarseWaitersActive += 1;
    const trackedKeyIds = [];
    const trackedTemplateIds = [];
    const broad = isFine && args.keyIds.length > HOT_INTEREST_MAX_KEYS;
    if (!isFine) {} else if (broad) {
      state.broadFineWaitersActive += 1;
    } else {
      const uniqueKeys = new Set(args.keyIds.map((raw) => Number(raw) >>> 0));
      for (const keyId of uniqueKeys) {
        if (this.acquireHotKey(state, keyId, limits.maxKeys))
          trackedKeyIds.push(keyId);
      }
    }
    if (isFine) {
      const uniqueTemplates = new Set;
      for (const raw of args.templateIdsUsed) {
        const templateId = String(raw).trim();
        if (!/^[0-9a-f]{16}$/.test(templateId))
          continue;
        uniqueTemplates.add(templateId);
      }
      for (const templateId of uniqueTemplates) {
        if (this.acquireHotTemplate(state, templateId, limits.maxTemplates))
          trackedTemplateIds.push(templateId);
      }
    }
    this.sweepHotFineState(args.stream, args.touchCfg, nowMs, true);
    let released = false;
    return () => {
      if (released)
        return;
      released = true;
      const st = this.hotFineByStream.get(args.stream);
      if (!st)
        return;
      const releaseNowMs = Date.now();
      if (isFine)
        st.fineWaitersActive = Math.max(0, st.fineWaitersActive - 1);
      else
        st.coarseWaitersActive = Math.max(0, st.coarseWaitersActive - 1);
      if (broad)
        st.broadFineWaitersActive = Math.max(0, st.broadFineWaitersActive - 1);
      for (const keyId of trackedKeyIds) {
        this.releaseHotKey(st, keyId, releaseNowMs, limits.keyGraceMs, limits.maxKeys);
      }
      for (const templateId of trackedTemplateIds) {
        this.releaseHotTemplate(st, templateId, releaseNowMs, limits.templateGraceMs, limits.maxTemplates);
      }
      this.sweepHotFineState(args.stream, args.touchCfg, releaseNowMs, true);
    };
  }
  getTouchRuntimeSnapshot(args) {
    const nowMs = Date.now();
    const hot = this.getHotFineSnapshot(args.stream, args.touchCfg, nowMs);
    const totals = this.getOrCreateRuntimeTotals(args.stream);
    const journal = this.journals.get(args.stream) ?? null;
    const journalTotals = journal?.getTotalStats();
    return {
      lagSourceOffsets: this.lagSourceOffsetsByStream.get(args.stream) ?? 0,
      touchMode: this.touchModeByStream.get(args.stream) ?? (this.fineLagCoarseOnlyByStream.get(args.stream) ? "coarseOnly" : "fine"),
      hotFineKeys: hot?.hotKeyCount ?? 0,
      hotTemplates: hot?.hotTemplateCount ?? 0,
      hotFineKeysActive: hot?.hotKeyActiveCount ?? 0,
      hotFineKeysGrace: hot?.hotKeyGraceCount ?? 0,
      hotTemplatesActive: hot?.hotTemplateActiveCount ?? 0,
      hotTemplatesGrace: hot?.hotTemplateGraceCount ?? 0,
      fineWaitersActive: hot?.fineWaitersActive ?? 0,
      coarseWaitersActive: hot?.coarseWaitersActive ?? 0,
      broadFineWaitersActive: hot?.broadFineWaitersActive ?? 0,
      hotKeyFilteringEnabled: hot?.keyFilteringEnabled ?? false,
      hotTemplateFilteringEnabled: hot?.templateFilteringEnabled ?? false,
      scanRowsTotal: totals.scanRowsTotal,
      scanBatchesTotal: totals.scanBatchesTotal,
      scannedButEmitted0BatchesTotal: totals.scannedButEmitted0BatchesTotal,
      processedThroughDeltaTotal: totals.processedThroughDeltaTotal,
      touchesEmittedTotal: totals.touchesEmittedTotal,
      touchesTableTotal: totals.touchesTableTotal,
      touchesTemplateTotal: totals.touchesTemplateTotal,
      fineTouchesDroppedDueToBudgetTotal: totals.fineTouchesDroppedDueToBudgetTotal,
      fineTouchesSkippedColdTemplateTotal: totals.fineTouchesSkippedColdTemplateTotal,
      fineTouchesSkippedColdKeyTotal: totals.fineTouchesSkippedColdKeyTotal,
      fineTouchesSkippedTemplateBucketTotal: totals.fineTouchesSkippedTemplateBucketTotal,
      waitTouchedTotal: totals.waitTouchedTotal,
      waitTimeoutTotal: totals.waitTimeoutTotal,
      waitStaleTotal: totals.waitStaleTotal,
      journalFlushesTotal: journalTotals?.flushes ?? 0,
      journalNotifyWakeupsTotal: journalTotals?.notifyWakeups ?? 0,
      journalNotifyWakeMsTotal: journalTotals?.notifyWakeMsSum ?? 0,
      journalNotifyWakeMsMax: journalTotals?.notifyWakeMsMax ?? 0,
      journalTimeoutsFiredTotal: journalTotals?.timeoutsFired ?? 0,
      journalTimeoutSweepMsTotal: journalTotals?.timeoutSweepMsSum ?? 0
    };
  }
  recordWaitMetrics(args) {
    this.liveMetrics.recordWait(args.stream, args.touchCfg, args.keysCount, args.outcome, args.latencyMs);
    const totals = this.getOrCreateRuntimeTotals(args.stream);
    if (args.outcome === "touched")
      totals.waitTouchedTotal += 1;
    else if (args.outcome === "timeout")
      totals.waitTimeoutTotal += 1;
    else
      totals.waitStaleTotal += 1;
  }
  resolveTemplateEntitiesForWait(args) {
    const ids = Array.from(new Set(args.templateIdsUsed.map((x) => String(x).trim()).filter((x) => /^[0-9a-f]{16}$/.test(x))));
    if (ids.length === 0)
      return [];
    const entities = new Set;
    const chunkSize = 200;
    for (let i = 0;i < ids.length; i += chunkSize) {
      const chunk = ids.slice(i, i + chunkSize);
      const placeholders = chunk.map(() => "?").join(",");
      const rows = this.db.db.query(`SELECT DISTINCT entity
           FROM live_templates
           WHERE stream=? AND state='active' AND template_id IN (${placeholders});`).all(args.stream, ...chunk);
      for (const row of rows) {
        const entity = String(row?.entity ?? "").trim();
        if (entity !== "")
          entities.add(entity);
      }
    }
    return Array.from(entities);
  }
  getOrCreateJournal(stream, touchCfg) {
    const existing = this.journals.get(stream);
    if (existing)
      return existing;
    const mem = touchCfg.memory ?? {};
    const j = new TouchJournal({
      bucketMs: mem.bucketMs ?? 100,
      filterPow2: mem.filterPow2 ?? 22,
      k: mem.k ?? 4,
      pendingMaxKeys: mem.pendingMaxKeys ?? 1e5,
      keyIndexMaxKeys: mem.keyIndexMaxKeys ?? 32
    });
    this.journals.set(stream, j);
    this.journalsCreatedTotal += 1;
    return j;
  }
  computeAdaptiveCoalesceMs(touchCfg, lagAtStart, hasAnyWaiters) {
    const maxCoalesceMs = Math.max(1, Math.floor(touchCfg.memory?.bucketMs ?? 100));
    if (!hasAnyWaiters)
      return maxCoalesceMs;
    const lagNum = lagAtStart > BigInt(Number.MAX_SAFE_INTEGER) ? Number.MAX_SAFE_INTEGER : Number(lagAtStart);
    if (lagNum <= 0)
      return Math.min(maxCoalesceMs, 10);
    if (lagNum <= 5000)
      return Math.min(maxCoalesceMs, 50);
    return maxCoalesceMs;
  }
  getJournalIfExists(stream) {
    return this.journals.get(stream) ?? null;
  }
  computeSuppressFineDueToLag(stream, touchCfg, lagAtStart, hasFineDemand) {
    if (!hasFineDemand) {
      this.fineLagCoarseOnlyByStream.set(stream, false);
      return false;
    }
    const degradeRaw = Math.max(0, Math.floor(touchCfg.lagDegradeFineTouchesAtSourceOffsets ?? 5000));
    if (degradeRaw <= 0) {
      this.fineLagCoarseOnlyByStream.set(stream, false);
      return false;
    }
    const recoverRaw = Math.max(0, Math.floor(touchCfg.lagRecoverFineTouchesAtSourceOffsets ?? 1000));
    const recover = Math.min(degradeRaw, recoverRaw);
    const lag = lagAtStart > BigInt(Number.MAX_SAFE_INTEGER) ? Number.MAX_SAFE_INTEGER : Number(lagAtStart);
    const prev = this.fineLagCoarseOnlyByStream.get(stream) ?? false;
    let next = prev;
    if (!prev && lag >= degradeRaw)
      next = true;
    else if (prev && lag <= recover)
      next = false;
    this.fineLagCoarseOnlyByStream.set(stream, next);
    return next;
  }
  prioritizeStreamsForProcessing(ordered, nowMs) {
    if (ordered.length <= 1)
      return ordered;
    const hot = [];
    const cold = [];
    for (const stream of ordered) {
      let hasActiveWaiters = false;
      const profileRes = this.profiles.getProfileResult(stream);
      if (Result31.isError(profileRes)) {
        hasActiveWaiters = false;
      } else {
        const enabledTouch = resolveEnabledTouchCapability(profileRes.value);
        if (enabledTouch) {
          const snap = this.getHotFineSnapshot(stream, enabledTouch.touchCfg, nowMs);
          hasActiveWaiters = snap.fineWaitersActive + snap.coarseWaitersActive > 0;
        }
      }
      if (hasActiveWaiters)
        hot.push(stream);
      else
        cold.push(stream);
    }
    if (hot.length === 0)
      return ordered;
    return hot.concat(cold);
  }
  coalesceRestrictedTemplateTouches(stream, touchCfg, touches) {
    const bucketMs = Math.max(1, Math.floor(touchCfg.memory?.bucketMs ?? 100));
    const bucketId = Math.floor(Date.now() / bucketMs);
    let state = this.restrictedTemplateBucketStateByStream.get(stream);
    if (!state || state.bucketId !== bucketId) {
      state = { bucketId, templateKeyIds: new Set };
      this.restrictedTemplateBucketStateByStream.set(stream, state);
    }
    const out = [];
    let dropped = 0;
    for (const touch of touches) {
      if (touch.kind !== "template") {
        out.push(touch);
        continue;
      }
      const keyId = touch.keyId >>> 0;
      if (state.templateKeyIds.has(keyId)) {
        dropped += 1;
        continue;
      }
      state.templateKeyIds.add(keyId);
      out.push(touch);
    }
    return { touches: out, dropped };
  }
  getHotFineSnapshot(stream, touchCfg, nowMs) {
    const state = this.sweepHotFineState(stream, touchCfg, nowMs, false);
    if (!state) {
      return {
        hotTemplateIdsForWorker: null,
        hotKeyActiveSet: null,
        hotKeyGraceSet: null,
        hotTemplateActiveCount: 0,
        hotTemplateGraceCount: 0,
        hotKeyActiveCount: 0,
        hotKeyGraceCount: 0,
        hotTemplateCount: 0,
        hotKeyCount: 0,
        fineWaitersActive: 0,
        coarseWaitersActive: 0,
        broadFineWaitersActive: 0,
        templateFilteringEnabled: false,
        keyFilteringEnabled: true
      };
    }
    const hotTemplateActiveCount = state.templateActiveCountsById.size;
    const hotTemplateGraceCount = state.templateGraceExpiryMsById.size;
    const hotKeyActiveCount = state.keyActiveCountsById.size;
    const hotKeyGraceCount = state.keyGraceExpiryMsById.size;
    const hotTemplateCount = hotTemplateActiveCount + hotTemplateGraceCount;
    const hotKeyCount = hotKeyActiveCount + hotKeyGraceCount;
    const templateFilteringEnabled = !state.templatesOverCapacity && hotTemplateCount > 0;
    const keyFilteringEnabled = !state.keysOverCapacity && state.broadFineWaitersActive === 0;
    const hotTemplateIdsForWorker = templateFilteringEnabled ? Array.from(new Set([...state.templateActiveCountsById.keys(), ...state.templateGraceExpiryMsById.keys()])) : null;
    return {
      hotTemplateIdsForWorker,
      hotKeyActiveSet: keyFilteringEnabled ? state.keyActiveCountsById : null,
      hotKeyGraceSet: keyFilteringEnabled ? state.keyGraceExpiryMsById : null,
      hotTemplateActiveCount,
      hotTemplateGraceCount,
      hotKeyActiveCount,
      hotKeyGraceCount,
      hotTemplateCount,
      hotKeyCount,
      fineWaitersActive: state.fineWaitersActive,
      coarseWaitersActive: state.coarseWaitersActive,
      broadFineWaitersActive: state.broadFineWaitersActive,
      templateFilteringEnabled,
      keyFilteringEnabled
    };
  }
  getOrCreateHotFineState(stream) {
    const existing = this.hotFineByStream.get(stream);
    if (existing)
      return existing;
    const created = {
      keyActiveCountsById: new Map,
      keyGraceExpiryMsById: new Map,
      templateActiveCountsById: new Map,
      templateGraceExpiryMsById: new Map,
      fineWaitersActive: 0,
      coarseWaitersActive: 0,
      broadFineWaitersActive: 0,
      nextSweepAtMs: 0,
      keysOverCapacity: false,
      templatesOverCapacity: false
    };
    this.hotFineByStream.set(stream, created);
    return created;
  }
  sweepHotFineState(stream, touchCfg, nowMs, force) {
    const state = this.hotFineByStream.get(stream);
    if (!state)
      return null;
    if (!force && nowMs < state.nextSweepAtMs)
      return state;
    const limits = this.getHotFineLimits(touchCfg);
    for (const [k, exp] of state.keyGraceExpiryMsById.entries()) {
      if (exp <= nowMs)
        state.keyGraceExpiryMsById.delete(k);
    }
    for (const [tpl, exp] of state.templateGraceExpiryMsById.entries()) {
      if (exp <= nowMs)
        state.templateGraceExpiryMsById.delete(tpl);
    }
    if (state.keyActiveCountsById.size + state.keyGraceExpiryMsById.size < limits.maxKeys)
      state.keysOverCapacity = false;
    if (state.templateActiveCountsById.size + state.templateGraceExpiryMsById.size < limits.maxTemplates)
      state.templatesOverCapacity = false;
    if (state.keyActiveCountsById.size === 0 && state.keyGraceExpiryMsById.size === 0 && state.templateActiveCountsById.size === 0 && state.templateGraceExpiryMsById.size === 0 && state.fineWaitersActive <= 0 && state.coarseWaitersActive <= 0 && state.broadFineWaitersActive <= 0) {
      this.hotFineByStream.delete(stream);
      return null;
    }
    const sweepEveryMs = Math.max(250, Math.min(limits.keyGraceMs, limits.templateGraceMs, 2000));
    state.nextSweepAtMs = nowMs + sweepEveryMs;
    return state;
  }
  getHotFineLimits(touchCfg) {
    const mem = touchCfg.memory ?? {};
    return {
      keyGraceMs: Math.max(1, Math.floor(mem.hotKeyTtlMs ?? 1e4)),
      templateGraceMs: Math.max(1, Math.floor(mem.hotTemplateTtlMs ?? 1e4)),
      maxKeys: Math.max(1, Math.floor(mem.hotMaxKeys ?? 1e6)),
      maxTemplates: Math.max(1, Math.floor(mem.hotMaxTemplates ?? 4096))
    };
  }
  acquireHotKey(state, keyId, maxKeys) {
    const prev = state.keyActiveCountsById.get(keyId);
    if (prev != null) {
      state.keyActiveCountsById.set(keyId, prev + 1);
      state.keyGraceExpiryMsById.delete(keyId);
      return true;
    }
    if (state.keyActiveCountsById.size + state.keyGraceExpiryMsById.size >= maxKeys) {
      state.keysOverCapacity = true;
      return false;
    }
    state.keyActiveCountsById.set(keyId, 1);
    state.keyGraceExpiryMsById.delete(keyId);
    return true;
  }
  acquireHotTemplate(state, templateId, maxTemplates) {
    const prev = state.templateActiveCountsById.get(templateId);
    if (prev != null) {
      state.templateActiveCountsById.set(templateId, prev + 1);
      state.templateGraceExpiryMsById.delete(templateId);
      return true;
    }
    if (state.templateActiveCountsById.size + state.templateGraceExpiryMsById.size >= maxTemplates) {
      state.templatesOverCapacity = true;
      return false;
    }
    state.templateActiveCountsById.set(templateId, 1);
    state.templateGraceExpiryMsById.delete(templateId);
    return true;
  }
  releaseHotKey(state, keyId, nowMs, keyGraceMs, maxKeys) {
    const prev = state.keyActiveCountsById.get(keyId);
    if (prev == null)
      return;
    if (prev > 1) {
      state.keyActiveCountsById.set(keyId, prev - 1);
      return;
    }
    state.keyActiveCountsById.delete(keyId);
    if (keyGraceMs <= 0) {
      state.keyGraceExpiryMsById.delete(keyId);
      return;
    }
    if (state.keyActiveCountsById.size + state.keyGraceExpiryMsById.size >= maxKeys) {
      state.keysOverCapacity = true;
      return;
    }
    state.keyGraceExpiryMsById.set(keyId, nowMs + keyGraceMs);
  }
  releaseHotTemplate(state, templateId, nowMs, templateGraceMs, maxTemplates) {
    const prev = state.templateActiveCountsById.get(templateId);
    if (prev == null)
      return;
    if (prev > 1) {
      state.templateActiveCountsById.set(templateId, prev - 1);
      return;
    }
    state.templateActiveCountsById.delete(templateId);
    if (templateGraceMs <= 0) {
      state.templateGraceExpiryMsById.delete(templateId);
      return;
    }
    if (state.templateActiveCountsById.size + state.templateGraceExpiryMsById.size >= maxTemplates) {
      state.templatesOverCapacity = true;
      return;
    }
    state.templateGraceExpiryMsById.set(templateId, nowMs + templateGraceMs);
  }
  reserveFineTokens(stream, touchCfg, wanted, nowMs) {
    const rate = Math.max(0, Math.floor(touchCfg.fineTokensPerSecond ?? 200000));
    const burst = Math.max(0, Math.floor(touchCfg.fineBurstTokens ?? 400000));
    if (wanted <= 0)
      return { granted: 0, tokenLimited: false, refund: () => {} };
    if (rate <= 0 || burst <= 0)
      return { granted: 0, tokenLimited: true, refund: () => {} };
    const b = this.fineTokenBucketsByStream.get(stream) ?? { tokens: burst, lastRefillMs: nowMs };
    const elapsedMs = Math.max(0, nowMs - b.lastRefillMs);
    if (elapsedMs > 0) {
      const refill = elapsedMs * rate / 1000;
      b.tokens = Math.min(burst, b.tokens + refill);
      b.lastRefillMs = nowMs;
    }
    const granted = Math.max(0, Math.min(wanted, Math.floor(b.tokens)));
    b.tokens = Math.max(0, b.tokens - granted);
    this.fineTokenBucketsByStream.set(stream, b);
    return {
      granted,
      tokenLimited: granted < wanted,
      refund: (used) => {
        const u = Math.max(0, Math.floor(used));
        if (u >= granted)
          return;
        const addBack = granted - u;
        const cur = this.fineTokenBucketsByStream.get(stream);
        if (!cur)
          return;
        cur.tokens = Math.min(burst, cur.tokens + addBack);
        this.fineTokenBucketsByStream.set(stream, cur);
      }
    };
  }
  getOrCreateRuntimeTotals(stream) {
    const existing = this.runtimeTotalsByStream.get(stream);
    if (existing)
      return existing;
    const created = {
      scanRowsTotal: 0,
      scanBatchesTotal: 0,
      scannedButEmitted0BatchesTotal: 0,
      processedThroughDeltaTotal: 0,
      touchesEmittedTotal: 0,
      touchesTableTotal: 0,
      touchesTemplateTotal: 0,
      fineTouchesDroppedDueToBudgetTotal: 0,
      fineTouchesSkippedColdTemplateTotal: 0,
      fineTouchesSkippedColdKeyTotal: 0,
      fineTouchesSkippedTemplateBucketTotal: 0,
      waitTouchedTotal: 0,
      waitTimeoutTotal: 0,
      waitStaleTotal: 0
    };
    this.runtimeTotalsByStream.set(stream, created);
    return created;
  }
  rangeLikelyHasRows(stream, fromOffset, toOffset) {
    try {
      const it = this.db.iterWalRange(stream, fromOffset, toOffset);
      const first = it.next();
      return !first.done;
    } catch {
      return false;
    }
  }
}

class FailureTracker {
  cache;
  constructor(maxEntries) {
    this.cache = new LruCache(maxEntries);
  }
  shouldSkip(stream) {
    const item = this.cache.get(stream);
    if (!item)
      return false;
    if (Date.now() >= item.untilMs) {
      this.cache.delete(stream);
      return false;
    }
    return true;
  }
  recordFailure(stream) {
    const now = Date.now();
    const item = this.cache.get(stream) ?? { attempts: 0, untilMs: now };
    item.attempts += 1;
    const backoff = Math.min(60000, 500 * 2 ** (item.attempts - 1));
    item.untilMs = now + backoff;
    this.cache.set(stream, item);
  }
  recordSuccess(stream) {
    this.cache.delete(stream);
  }
}

// src/stream_size_reconciler.ts
import { existsSync as existsSync3 } from "node:fs";
import { readFile } from "node:fs/promises";
import { Result as Result33 } from "better-result";

// src/segment/cached_segment.ts
import { existsSync as existsSync2, readFileSync as readFileSync3 } from "node:fs";

// src/util/retry.ts
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function withTimeout(p, ms) {
  if (ms <= 0)
    return p;
  return Promise.race([
    p,
    new Promise((_, reject) => setTimeout(() => reject(dsError("timeout")), ms))
  ]);
}
async function retry(fn, opts) {
  let attempt = 0;
  let delay = opts.baseDelayMs;
  for (;; ) {
    try {
      return await withTimeout(fn(), opts.timeoutMs);
    } catch (e) {
      attempt++;
      if (attempt > opts.retries)
        throw e;
      const jitter = Math.random() * 0.2 + 0.9;
      await sleep(Math.min(opts.maxDelayMs, Math.floor(delay * jitter)));
      delay = Math.min(opts.maxDelayMs, delay * 2);
    }
  }
}

// src/util/stream_paths.ts
import { createHash as createHash3 } from "node:crypto";
function streamHash16Hex(stream) {
  const full = createHash3("sha256").update(stream).digest();
  return full.subarray(0, 16).toString("hex");
}
function pad16(n) {
  const s = String(n);
  return s.padStart(16, "0");
}
function segmentObjectKey(streamHash, segmentIndex) {
  return `streams/${streamHash}/segments/${pad16(segmentIndex)}.bin`;
}

// src/segment/cached_segment.ts
function readRangeFromBytes(bytes, start, end) {
  const boundedStart = Math.max(0, Math.min(start, bytes.byteLength));
  const boundedEnd = Math.max(boundedStart, Math.min(end + 1, bytes.byteLength));
  return bytes.subarray(boundedStart, boundedEnd);
}
function readRangeFromSource(source, start, end) {
  return readRangeFromBytes(source.bytes, start, end);
}
async function loadSegmentSource(os2, seg, diskCache, retryOpts) {
  if (seg.local_path && seg.local_path.length > 0 && existsSync2(seg.local_path)) {
    try {
      const bytes2 = Bun.mmap(seg.local_path, { shared: true });
      return { kind: "mapped", path: seg.local_path, bytes: bytes2 };
    } catch {
      return { kind: "bytes", bytes: readFileSync3(seg.local_path) };
    }
  }
  const objectKey = segmentObjectKey(streamHash16Hex(seg.stream), seg.segment_index);
  if (diskCache && diskCache.has(objectKey)) {
    diskCache.recordHit();
    diskCache.touch(objectKey);
    const mapped = diskCache.getMapped(objectKey);
    if (mapped)
      return { kind: "mapped", path: mapped.path, bytes: mapped.bytes };
    const cachedPath = diskCache.getPath(objectKey);
    if (existsSync2(cachedPath))
      return { kind: "bytes", bytes: readFileSync3(cachedPath) };
    diskCache.remove(objectKey);
  }
  if (diskCache)
    diskCache.recordMiss();
  const bytes = await retry(async () => {
    const res = await os2.get(objectKey);
    if (!res)
      throw dsError(`object store missing segment: ${objectKey}`);
    return res;
  }, retryOpts ?? { retries: 0, baseDelayMs: 0, maxDelayMs: 0, timeoutMs: 0 });
  if (diskCache?.put(objectKey, bytes)) {
    const mapped = diskCache.getMapped(objectKey);
    if (mapped)
      return { kind: "mapped", path: mapped.path, bytes: mapped.bytes };
    return { kind: "bytes", bytes: readFileSync3(diskCache.getPath(objectKey)) };
  }
  return { kind: "bytes", bytes };
}
async function loadSegmentBytesCached(os2, seg, diskCache, retryOpts) {
  const source = await loadSegmentSource(os2, seg, diskCache, retryOpts);
  return source.bytes;
}

// src/segment/format.ts
import { Result as Result32 } from "better-result";

// src/util/bloom256.ts
var BITS = 256n;
var MASK64 = (1n << 64n) - 1n;
function fnv1a64(data) {
  let h = 14695981039346656037n;
  for (const b of data) {
    h ^= BigInt(b);
    h = h * 1099511628211n & MASK64;
  }
  return h;
}
function mix64(x) {
  x = x + 0x9e3779b97f4a7c15n & MASK64;
  x = (x ^ x >> 30n) * 0xbf58476d1ce4e5b9n & MASK64;
  x = (x ^ x >> 27n) * 0x94d049bb133111ebn & MASK64;
  x = x ^ x >> 31n;
  return x & MASK64;
}

class Bloom256 {
  bits;
  constructor(bits) {
    if (bits && bits.byteLength !== 32)
      throw dsError("bloom must be 32 bytes");
    this.bits = bits ? new Uint8Array(bits) : new Uint8Array(32);
  }
  toBytes() {
    return new Uint8Array(this.bits);
  }
  add(keyUtf8) {
    if (keyUtf8.byteLength === 0)
      return;
    const h1 = fnv1a64(keyUtf8);
    const h2 = mix64(h1 ^ 0xa0761d6478bd642fn);
    for (let i = 0;i < 3; i++) {
      const idx = Number((h1 + BigInt(i) * h2) % BITS);
      const byte = idx >> 3;
      const bit = idx & 7;
      this.bits[byte] |= 1 << bit;
    }
  }
  maybeHas(keyUtf8) {
    if (keyUtf8.byteLength === 0)
      return true;
    const h1 = fnv1a64(keyUtf8);
    const h2 = mix64(h1 ^ 0xa0761d6478bd642fn);
    for (let i = 0;i < 3; i++) {
      const idx = Number((h1 + BigInt(i) * h2) % BITS);
      const byte = idx >> 3;
      const bit = idx & 7;
      if ((this.bits[byte] & 1 << bit) === 0)
        return false;
    }
    return true;
  }
}

// src/util/crc32c.ts
var POLY = 2197175160;
var TABLE = null;
function makeTable() {
  const t = new Uint32Array(256);
  for (let i = 0;i < 256; i++) {
    let c = i;
    for (let k = 0;k < 8; k++) {
      c = c & 1 ? POLY ^ c >>> 1 : c >>> 1;
    }
    t[i] = c >>> 0;
  }
  return t;
}
function crc32c(buf) {
  if (!TABLE)
    TABLE = makeTable();
  let c = 4294967295;
  for (const b of buf) {
    c = TABLE[(c ^ b) & 255] ^ c >>> 8;
  }
  return (c ^ 4294967295) >>> 0;
}

// src/util/zstd.ts
import * as zlib from "node:zlib";
function getZstdOperation(name) {
  const operation = zlib[name];
  if (typeof operation !== "function") {
    throw dsError(`${name} is not available in this runtime. Prisma Streams local requires node:zlib zstd support.`);
  }
  return operation;
}
function zstdDecompressSync(bytes) {
  return getZstdOperation("zstdDecompressSync")(bytes);
}

// src/segment/format.ts
function invalidSegment(message) {
  return Result32.err({ kind: "invalid_segment_format", message });
}
var DSB3_HEADER_BYTES = 68;
var FOOTER_MAGIC = "DSF1";
var FOOTER_ENTRY_BYTES = 40;
var FOOTER_TRAILER_BYTES = 8;
function decodeBlockResult(blockBytes) {
  const headerRes = parseBlockHeaderResult(blockBytes);
  if (Result32.isError(headerRes))
    return headerRes;
  const header = headerRes.value;
  const uncompressedRes = decompressBlockPayloadResult(blockBytes, header);
  if (Result32.isError(uncompressedRes))
    return uncompressedRes;
  const uncompressed = uncompressedRes.value;
  const records = [];
  let off = 0;
  for (let i = 0;i < header.recordCount; i++) {
    if (off + 8 + 4 > uncompressed.byteLength)
      return invalidSegment("truncated record");
    const appendNs = readU64BE(uncompressed, off);
    off += 8;
    const keyLen = readU32BE(uncompressed, off);
    off += 4;
    if (off + keyLen + 4 > uncompressed.byteLength)
      return invalidSegment("truncated key");
    const routingKey = uncompressed.subarray(off, off + keyLen);
    off += keyLen;
    const dataLen = readU32BE(uncompressed, off);
    off += 4;
    if (off + dataLen > uncompressed.byteLength)
      return invalidSegment("truncated payload");
    const payload = uncompressed.subarray(off, off + dataLen);
    off += dataLen;
    records.push({ appendNs, routingKey, payload });
  }
  return Result32.ok({
    recordCount: header.recordCount,
    firstAppendNs: header.firstAppendNs,
    lastAppendNs: header.lastAppendNs,
    bloom: header.bloom.slice(),
    records
  });
}
function parseFooter(segmentBytes) {
  if (segmentBytes.byteLength < FOOTER_TRAILER_BYTES)
    return null;
  const tail = segmentBytes.slice(segmentBytes.byteLength - 4);
  const tailMagic = String.fromCharCode(tail[0], tail[1], tail[2], tail[3]);
  if (tailMagic !== FOOTER_MAGIC)
    return null;
  const footerLen = readU32BE(segmentBytes, segmentBytes.byteLength - 8);
  if (footerLen <= 0 || footerLen + FOOTER_TRAILER_BYTES > segmentBytes.byteLength)
    return null;
  const footerStart = segmentBytes.byteLength - FOOTER_TRAILER_BYTES - footerLen;
  if (footerStart < 0)
    return null;
  const footer = segmentBytes.slice(footerStart, footerStart + footerLen);
  const parsed = parseFooterBytes(footer);
  return { footer: parsed, footerStart };
}
function* iterateBlocksResult(segmentBytes) {
  const parsed = parseFooter(segmentBytes);
  const limit = parsed ? parsed.footerStart : segmentBytes.byteLength;
  let off = 0;
  while (off < limit) {
    if (off + DSB3_HEADER_BYTES > limit) {
      yield invalidSegment("truncated segment (block header)");
      return;
    }
    const header = segmentBytes.slice(off, off + DSB3_HEADER_BYTES);
    const compressedLen = readU32BE(header, 8);
    const totalLen = DSB3_HEADER_BYTES + compressedLen;
    if (off + totalLen > limit) {
      yield invalidSegment("truncated segment (block payload)");
      return;
    }
    const blockBytes = segmentBytes.slice(off, off + totalLen);
    const decodedRes = decodeBlockResult(blockBytes);
    if (Result32.isError(decodedRes)) {
      yield decodedRes;
      return;
    }
    yield Result32.ok({ blockOffset: off, blockBytes, decoded: decodedRes.value });
    off += totalLen;
  }
}
function parseFooterBytes(footer) {
  if (footer.byteLength < 12)
    return null;
  const magic = String.fromCharCode(footer[0], footer[1], footer[2], footer[3]);
  if (magic !== FOOTER_MAGIC)
    return null;
  const version = readU32BE(footer, 4);
  const blockCount = readU32BE(footer, 8);
  const expectedLen = 12 + blockCount * FOOTER_ENTRY_BYTES;
  if (footer.byteLength !== expectedLen)
    return null;
  const blocks = [];
  let off = 12;
  for (let i = 0;i < blockCount; i++) {
    const blockOffset = Number(readU64BE(footer, off));
    off += 8;
    const firstOffset = readU64BE(footer, off);
    off += 8;
    const recordCount = readU32BE(footer, off);
    off += 4;
    const compressedLen = readU32BE(footer, off);
    off += 4;
    const firstAppendNs = readU64BE(footer, off);
    off += 8;
    const lastAppendNs = readU64BE(footer, off);
    off += 8;
    blocks.push({ blockOffset, firstOffset, recordCount, compressedLen, firstAppendNs, lastAppendNs });
  }
  return { version, blocks };
}
function parseBlockHeaderResult(header) {
  if (header.byteLength < DSB3_HEADER_BYTES)
    return invalidSegment("block header too small");
  if (header[0] !== 68 || header[1] !== 83 || header[2] !== 66 || header[3] !== 51) {
    return invalidSegment("bad block magic");
  }
  const uncompressedLen = readU32BE(header, 4);
  const compressedLen = readU32BE(header, 8);
  const recordCount = readU32BE(header, 12);
  const bloom = header.slice(16, 48);
  const firstAppendNs = readU64BE(header, 48);
  const lastAppendNs = readU64BE(header, 56);
  const crc32cVal = readU32BE(header, 64);
  return Result32.ok({
    uncompressedLen,
    compressedLen,
    recordCount,
    bloom,
    firstAppendNs,
    lastAppendNs,
    crc32c: crc32cVal
  });
}
function decompressBlockPayloadResult(blockBytes, header) {
  const payload = blockBytes.subarray(DSB3_HEADER_BYTES, DSB3_HEADER_BYTES + header.compressedLen);
  if (payload.byteLength !== header.compressedLen)
    return invalidSegment("truncated block");
  const actualCrc = crc32c(payload);
  if (actualCrc !== header.crc32c)
    return invalidSegment("crc mismatch");
  let uncompressed;
  try {
    uncompressed = new Uint8Array(zstdDecompressSync(payload));
  } catch (e) {
    return invalidSegment(String(e?.message ?? e));
  }
  if (uncompressed.byteLength !== header.uncompressedLen) {
    return invalidSegment(`bad uncompressed len: got=${uncompressed.byteLength} expected=${header.uncompressedLen}`);
  }
  return Result32.ok(uncompressed);
}

// src/util/yield.ts
async function yieldToEventLoop() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

// src/stream_size_reconciler.ts
class StreamSizeReconciler {
  db;
  os;
  segmentCache;
  onMetadataChanged;
  stopped = false;
  running = null;
  constructor(db, os2, segmentCache, onMetadataChanged) {
    this.db = db;
    this.os = os2;
    this.segmentCache = segmentCache;
    this.onMetadataChanged = onMetadataChanged;
  }
  start() {
    if (this.running)
      return;
    this.running = this.run().finally(() => {
      this.running = null;
    });
  }
  stop() {
    this.stopped = true;
  }
  async run() {
    while (!this.stopped) {
      const streams = this.db.listStreamsMissingLogicalSize(8);
      if (streams.length === 0)
        return;
      for (const stream of streams) {
        if (this.stopped)
          return;
        try {
          await this.reconcileStream(stream);
        } catch (e) {
          const msg = String(e?.message ?? e);
          if (!this.stopped && !msg.includes("Statement has finalized")) {
            console.error("stream size reconcile failed", stream, e);
          }
        }
      }
    }
  }
  async reconcileStream(stream) {
    for (let attempt = 0;attempt < 3 && !this.stopped; attempt++) {
      const before = this.db.getStream(stream);
      if (!before || this.db.isDeleted(before) || before.next_offset <= 0n)
        return;
      if (before.logical_size_bytes > 0n)
        return;
      const segments = this.db.listSegmentsForStream(stream);
      let total = 0n;
      for (const segment of segments) {
        if (this.stopped)
          return;
        total += await this.sumSegmentPayloadBytes(segment);
        await yieldToEventLoop();
      }
      const after = this.db.getStream(stream);
      if (!after || this.db.isDeleted(after))
        return;
      if (after.logical_size_bytes > 0n)
        return;
      if (segments.length !== this.db.countSegmentsForStream(stream))
        continue;
      const finalTotal = total + after.wal_bytes;
      if (finalTotal > after.logical_size_bytes) {
        this.db.setStreamLogicalSizeBytes(stream, finalTotal);
        this.onMetadataChanged?.(stream);
      }
      return;
    }
  }
  async sumSegmentPayloadBytes(segment) {
    const bytes = await this.loadSegmentBytes(segment);
    let total = 0n;
    for (const blockRes of iterateBlocksResult(bytes)) {
      if (Result33.isError(blockRes))
        throw dsError(blockRes.error.message);
      for (const record of blockRes.value.decoded.records) {
        total += BigInt(record.payload.byteLength);
      }
    }
    return total;
  }
  async loadSegmentBytes(segment) {
    if (existsSync3(segment.local_path)) {
      return new Uint8Array(await readFile(segment.local_path));
    }
    return loadSegmentBytesCached(this.os, segment, this.segmentCache);
  }
}

// src/concurrency_gate.ts
function abortError() {
  const err = new Error("operation aborted");
  err.name = "AbortError";
  return err;
}

class ConcurrencyGate {
  limit;
  active = 0;
  waiters = [];
  constructor(limit) {
    this.limit = Math.max(1, Math.floor(limit));
  }
  getLimit() {
    return this.limit;
  }
  getActive() {
    return this.active;
  }
  getQueued() {
    return this.waiters.length;
  }
  setLimit(nextLimit) {
    this.limit = Math.max(1, Math.floor(nextLimit));
    this.drain();
  }
  async acquire(signal) {
    if (signal?.aborted)
      throw abortError();
    if (this.active < this.limit) {
      this.active += 1;
      return this.releaseFactory();
    }
    return await new Promise((resolve, reject) => {
      const waiter = {
        resolve,
        reject,
        signal: signal ?? null,
        onAbort: null
      };
      if (signal) {
        waiter.onAbort = () => {
          this.removeWaiter(waiter);
          reject(abortError());
        };
        signal.addEventListener("abort", waiter.onAbort, { once: true });
      }
      this.waiters.push(waiter);
    });
  }
  async run(fn, signal) {
    const release = await this.acquire(signal);
    try {
      return await fn();
    } finally {
      release();
    }
  }
  releaseFactory() {
    let released = false;
    return () => {
      if (released)
        return;
      released = true;
      this.active = Math.max(0, this.active - 1);
      this.drain();
    };
  }
  removeWaiter(waiter) {
    const idx = this.waiters.indexOf(waiter);
    if (idx >= 0)
      this.waiters.splice(idx, 1);
    if (waiter.signal && waiter.onAbort) {
      waiter.signal.removeEventListener("abort", waiter.onAbort);
      waiter.onAbort = null;
    }
  }
  drain() {
    while (this.active < this.limit && this.waiters.length > 0) {
      const waiter = this.waiters.shift();
      if (waiter.signal?.aborted) {
        if (waiter.signal && waiter.onAbort)
          waiter.signal.removeEventListener("abort", waiter.onAbort);
        waiter.reject(abortError());
        continue;
      }
      if (waiter.signal && waiter.onAbort)
        waiter.signal.removeEventListener("abort", waiter.onAbort);
      waiter.onAbort = null;
      this.active += 1;
      waiter.resolve(this.releaseFactory());
    }
  }
}

// src/foreground_activity.ts
class ForegroundActivityTracker {
  active = 0;
  lastActivityAt = 0;
  idleResolvers = new Set;
  enter() {
    this.lastActivityAt = Date.now();
    this.active += 1;
    let released = false;
    return () => {
      if (released)
        return;
      released = true;
      this.lastActivityAt = Date.now();
      this.active = Math.max(0, this.active - 1);
      if (this.active !== 0)
        return;
      const resolvers = Array.from(this.idleResolvers);
      this.idleResolvers.clear();
      for (const resolve of resolvers)
        resolve();
    };
  }
  isActive() {
    return this.active > 0;
  }
  getActive() {
    return this.active;
  }
  wasActiveWithin(windowMs) {
    return Date.now() - this.lastActivityAt <= windowMs;
  }
  async yieldBackgroundWork(maxPauseMs = 5) {
    if (this.active === 0) {
      await yieldToEventLoop();
      return;
    }
    let idleResolve;
    const idlePromise = new Promise((resolve) => {
      idleResolve = resolve;
      this.idleResolvers.add(resolve);
    });
    try {
      await Promise.race([
        idlePromise,
        new Promise((resolve) => setTimeout(resolve, maxPauseMs))
      ]);
    } finally {
      this.idleResolvers.delete(idleResolve);
    }
  }
}

// src/app_core.ts
import { Result as Result41 } from "better-result";

// src/read_filter.ts
import { Result as Result35 } from "better-result";

// src/search/schema.ts
import { Result as Result34 } from "better-result";
function resolveSearchAlias(search, fieldName) {
  return search?.aliases?.[fieldName] ?? fieldName;
}
function getSearchFieldBinding(config, version) {
  let selected = null;
  for (const binding of config.bindings) {
    if (binding.version <= version && (!selected || binding.version > selected.version)) {
      selected = binding;
    }
  }
  return selected;
}
function normalizeKeywordValue(value, normalizer) {
  if (typeof value !== "string")
    return null;
  return normalizer === "lowercase_v1" ? value.toLowerCase() : value;
}
function canonicalizeExactValue(config, value) {
  switch (config.kind) {
    case "keyword":
      return normalizeKeywordValue(value, config.normalizer);
    case "integer":
      if (typeof value === "bigint")
        return value.toString();
      if (typeof value === "number" && Number.isFinite(value) && Number.isInteger(value))
        return String(value);
      if (typeof value === "string" && /^-?(0|[1-9][0-9]*)$/.test(value.trim()))
        return String(BigInt(value.trim()));
      return null;
    case "float":
      if (typeof value === "bigint")
        return value.toString();
      if (typeof value === "number" && Number.isFinite(value))
        return String(value);
      if (typeof value === "string" && value.trim() !== "") {
        const n = Number(value);
        if (Number.isFinite(n))
          return String(n);
      }
      return null;
    case "date":
      if (typeof value === "number" && Number.isFinite(value))
        return String(Math.trunc(value));
      if (typeof value === "bigint")
        return value.toString();
      if (typeof value === "string" && value.trim() !== "") {
        const parsed = Date.parse(value);
        if (Number.isFinite(parsed))
          return String(Math.trunc(parsed));
        if (/^-?(0|[1-9][0-9]*)$/.test(value.trim()))
          return String(BigInt(value.trim()));
      }
      return null;
    case "bool":
      if (typeof value === "boolean")
        return value ? "true" : "false";
      if (typeof value === "string") {
        const lowered = value.trim().toLowerCase();
        if (lowered === "true" || lowered === "false")
          return lowered;
      }
      return null;
    default:
      return null;
  }
}
function canonicalizeColumnValue(config, value) {
  switch (config.kind) {
    case "integer": {
      const canonical = canonicalizeExactValue(config, value);
      return canonical == null ? null : BigInt(canonical);
    }
    case "date": {
      const canonical = canonicalizeExactValue(config, value);
      return canonical == null ? null : BigInt(canonical);
    }
    case "float": {
      const canonical = canonicalizeExactValue(config, value);
      if (canonical == null)
        return null;
      const parsed = Number(canonical);
      return Number.isFinite(parsed) ? parsed : null;
    }
    case "bool":
      return canonicalizeExactValue(config, value) === "true" ? true : canonicalizeExactValue(config, value) === "false" ? false : null;
    default:
      return null;
  }
}
function analyzeTextValue(value, analyzer) {
  if (analyzer !== "unicode_word_v1")
    return [];
  const matches = value.toLowerCase().match(/[\p{L}\p{N}]+/gu);
  return matches ? matches.filter((token) => token.length > 0) : [];
}
function addRawValues(out, value) {
  if (Array.isArray(value)) {
    for (const item of value)
      addRawValues(out, item);
    return;
  }
  out.push(value);
}
function extractRawSearchValuesForFieldsResult(reg, offset, value, fieldNames) {
  if (!reg.search)
    return Result34.ok(new Map);
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return Result34.err({ message: "search fields require JSON object records" });
  }
  const version = schemaVersionForOffset(reg, offset);
  const out = new Map;
  for (const fieldName of fieldNames) {
    const config = reg.search.fields[fieldName];
    if (!config)
      continue;
    const binding = getSearchFieldBinding(config, version);
    if (!binding)
      continue;
    const resolvedRes = resolvePointerResult(value, binding.jsonPointer);
    if (Result34.isError(resolvedRes))
      return Result34.err({ message: resolvedRes.error.message });
    if (!resolvedRes.value.exists)
      continue;
    const values = [];
    addRawValues(values, resolvedRes.value.value);
    if (values.length > 0)
      out.set(fieldName, values);
  }
  return Result34.ok(out);
}
function extractRawSearchValuesResult(reg, offset, value) {
  return extractRawSearchValuesForFieldsResult(reg, offset, value, Object.keys(reg.search?.fields ?? {}));
}
function extractSearchExactValuesResult(reg, offset, value) {
  const rawValuesRes = extractRawSearchValuesResult(reg, offset, value);
  if (Result34.isError(rawValuesRes))
    return rawValuesRes;
  const out = new Map;
  for (const [fieldName, values] of rawValuesRes.value) {
    const config = reg.search?.fields[fieldName];
    if (!config)
      continue;
    const exactValues = [];
    for (const rawValue of values) {
      const canonical = canonicalizeExactValue(config, rawValue);
      if (canonical != null)
        exactValues.push(canonical);
    }
    if (exactValues.length > 0)
      out.set(fieldName, exactValues);
  }
  return Result34.ok(out);
}
function extractSearchTextValuesResult(reg, offset, value) {
  const rawValuesRes = extractRawSearchValuesResult(reg, offset, value);
  if (Result34.isError(rawValuesRes))
    return rawValuesRes;
  const out = new Map;
  for (const [fieldName, values] of rawValuesRes.value) {
    const config = reg.search?.fields[fieldName];
    if (!config)
      continue;
    const textValues = [];
    for (const rawValue of values) {
      if (config.kind === "keyword") {
        const normalized = normalizeKeywordValue(rawValue, config.normalizer);
        if (normalized != null)
          textValues.push(normalized);
      } else if (config.kind === "text" && typeof rawValue === "string") {
        textValues.push(rawValue);
      }
    }
    if (textValues.length > 0)
      out.set(fieldName, textValues);
  }
  return Result34.ok(out);
}

// src/read_filter.ts
function tokenizeResult(input) {
  const tokens = [];
  let i = 0;
  while (i < input.length) {
    const ch = input[i];
    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }
    if (ch === "(") {
      tokens.push({ kind: "lparen" });
      i += 1;
      continue;
    }
    if (ch === ")") {
      tokens.push({ kind: "rparen" });
      i += 1;
      continue;
    }
    if (ch === ":") {
      tokens.push({ kind: "colon" });
      i += 1;
      continue;
    }
    if (ch === "-") {
      tokens.push({ kind: "minus" });
      i += 1;
      continue;
    }
    if (ch === ">" || ch === "<" || ch === "=") {
      if ((ch === ">" || ch === "<") && input[i + 1] === "=") {
        tokens.push({ kind: "op", value: `${ch}=` });
        i += 2;
        continue;
      }
      tokens.push({ kind: "op", value: ch });
      i += 1;
      continue;
    }
    if (ch === '"') {
      let out = "";
      i += 1;
      while (i < input.length) {
        const cur = input[i];
        if (cur === "\\") {
          if (i + 1 >= input.length)
            return Result35.err({ message: "unterminated escape in filter string" });
          out += input[i + 1];
          i += 2;
          continue;
        }
        if (cur === '"')
          break;
        out += cur;
        i += 1;
      }
      if (i >= input.length || input[i] !== '"')
        return Result35.err({ message: "unterminated quoted string in filter" });
      i += 1;
      tokens.push({ kind: "string", value: out });
      continue;
    }
    let j = i;
    while (j < input.length) {
      const cur = input[j];
      if (/\s/.test(cur) || cur === "(" || cur === ")" || cur === ":" || cur === ">" || cur === "<" || cur === "=")
        break;
      j += 1;
    }
    const word = input.slice(i, j);
    if (word === "")
      return Result35.err({ message: "invalid filter syntax" });
    tokens.push({ kind: "word", value: word });
    i = j;
  }
  return Result35.ok(tokens);
}

class Parser {
  tokens;
  pos;
  constructor(tokens, pos = 0) {
    this.tokens = tokens;
    this.pos = pos;
  }
  parseResult() {
    const exprRes = this.parseOrResult();
    if (Result35.isError(exprRes))
      return exprRes;
    if (!this.isAtEnd())
      return Result35.err({ message: "unexpected token in filter" });
    return exprRes;
  }
  parseOrResult() {
    let leftRes = this.parseAndResult();
    if (Result35.isError(leftRes))
      return leftRes;
    let left = leftRes.value;
    while (this.peekWord("OR")) {
      this.pos += 1;
      const rightRes = this.parseAndResult();
      if (Result35.isError(rightRes))
        return rightRes;
      left = { kind: "or", left, right: rightRes.value };
    }
    return Result35.ok(left);
  }
  parseAndResult() {
    let leftRes = this.parseUnaryResult();
    if (Result35.isError(leftRes))
      return leftRes;
    let left = leftRes.value;
    while (!this.isAtEnd() && !this.peekKind("rparen") && !this.peekWord("OR")) {
      if (this.peekWord("AND"))
        this.pos += 1;
      const rightRes = this.parseUnaryResult();
      if (Result35.isError(rightRes))
        return rightRes;
      left = { kind: "and", left, right: rightRes.value };
    }
    return Result35.ok(left);
  }
  parseUnaryResult() {
    if (this.peekWord("NOT")) {
      this.pos += 1;
      const innerRes = this.parseUnaryResult();
      if (Result35.isError(innerRes))
        return innerRes;
      return Result35.ok({ kind: "not", expr: innerRes.value });
    }
    if (this.peekKind("minus")) {
      this.pos += 1;
      const innerRes = this.parseUnaryResult();
      if (Result35.isError(innerRes))
        return innerRes;
      return Result35.ok({ kind: "not", expr: innerRes.value });
    }
    return this.parsePrimaryResult();
  }
  parsePrimaryResult() {
    if (this.peekKind("lparen")) {
      this.pos += 1;
      const exprRes = this.parseOrResult();
      if (Result35.isError(exprRes))
        return exprRes;
      if (!this.peekKind("rparen"))
        return Result35.err({ message: "missing ')' in filter" });
      this.pos += 1;
      return exprRes;
    }
    const token = this.consumeWordOrString();
    if (!token)
      return Result35.err({ message: "expected clause in filter" });
    if (token.kind !== "word")
      return Result35.err({ message: "expected field name in filter" });
    const fieldOrKeyword = token.value;
    if (!this.peekKind("colon"))
      return Result35.err({ message: "expected ':' in filter clause" });
    this.pos += 1;
    if (fieldOrKeyword === "has") {
      const fieldToken = this.consumeWordOrString();
      if (!fieldToken || fieldToken.kind !== "word")
        return Result35.err({ message: "has: requires a field name" });
      return Result35.ok({ kind: "has", field: fieldToken.value });
    }
    let op = "eq";
    if (this.peekKind("op")) {
      const raw = this.tokens[this.pos].value;
      this.pos += 1;
      op = raw === "=" ? "eq" : raw === ">" ? "gt" : raw === ">=" ? "gte" : raw === "<" ? "lt" : "lte";
    }
    const valueToken = this.consumeWordOrString();
    if (!valueToken)
      return Result35.err({ message: "expected value in filter clause" });
    return Result35.ok({
      kind: "compare",
      field: fieldOrKeyword,
      op,
      rawValue: valueToken.value
    });
  }
  consumeWordOrString() {
    const token = this.tokens[this.pos];
    if (!token || token.kind !== "word" && token.kind !== "string")
      return null;
    this.pos += 1;
    return token;
  }
  peekKind(kind) {
    return this.tokens[this.pos]?.kind === kind;
  }
  peekWord(value) {
    const token = this.tokens[this.pos];
    return token?.kind === "word" && token.value.toUpperCase() === value;
  }
  isAtEnd() {
    return this.pos >= this.tokens.length;
  }
}
function canonicalizeFilterValue(index, rawValue) {
  switch (index.kind) {
    case "keyword":
      return index.normalizer === "lowercase_v1" ? rawValue.toLowerCase() : rawValue;
    case "integer":
      return /^-?(0|[1-9][0-9]*)$/.test(rawValue.trim()) ? String(BigInt(rawValue.trim())) : null;
    case "float": {
      const parsed = Number(rawValue);
      return Number.isFinite(parsed) ? String(parsed) : null;
    }
    case "date": {
      if (rawValue.trim() === "")
        return null;
      const parsed = Date.parse(rawValue);
      if (Number.isFinite(parsed))
        return String(Math.trunc(parsed));
      return /^-?(0|[1-9][0-9]*)$/.test(rawValue.trim()) ? String(BigInt(rawValue.trim())) : null;
    }
    case "bool": {
      const lowered = rawValue.trim().toLowerCase();
      return lowered === "true" || lowered === "false" ? lowered : null;
    }
    default:
      return null;
  }
}
function compileCompareValueResult(index, rawValue, op) {
  const canonical = canonicalizeFilterValue(index, rawValue);
  if (canonical == null)
    return Result35.err({ message: "invalid value for filter field" });
  if (op === "eq") {
    if (index.kind === "integer" || index.kind === "date") {
      return Result35.ok({ canonicalValue: canonical, compareValue: BigInt(canonical) });
    }
    if (index.kind === "float") {
      const parsed = Number(canonical);
      if (!Number.isFinite(parsed))
        return Result35.err({ message: "invalid numeric value for filter field" });
      return Result35.ok({ canonicalValue: canonical, compareValue: parsed });
    }
    if (index.kind === "bool") {
      return Result35.ok({ canonicalValue: canonical, compareValue: canonical === "true" });
    }
    return Result35.ok({ canonicalValue: canonical, compareValue: canonical });
  }
  if (index.kind === "integer" || index.kind === "date") {
    return Result35.ok({ canonicalValue: canonical, compareValue: BigInt(canonical) });
  }
  if (index.kind === "float") {
    const parsed = Number(canonical);
    if (!Number.isFinite(parsed))
      return Result35.err({ message: "invalid numeric value for filter field" });
    return Result35.ok({ canonicalValue: canonical, compareValue: parsed });
  }
  return Result35.err({ message: "comparison operator not supported for filter field" });
}
function compileExprResult(expr, indexByName) {
  if (expr.kind === "and") {
    const leftRes = compileExprResult(expr.left, indexByName);
    if (Result35.isError(leftRes))
      return leftRes;
    const rightRes = compileExprResult(expr.right, indexByName);
    if (Result35.isError(rightRes))
      return rightRes;
    return Result35.ok({ kind: "and", left: leftRes.value, right: rightRes.value });
  }
  if (expr.kind === "or") {
    const leftRes = compileExprResult(expr.left, indexByName);
    if (Result35.isError(leftRes))
      return leftRes;
    const rightRes = compileExprResult(expr.right, indexByName);
    if (Result35.isError(rightRes))
      return rightRes;
    return Result35.ok({ kind: "or", left: leftRes.value, right: rightRes.value });
  }
  if (expr.kind === "not") {
    const innerRes = compileExprResult(expr.expr, indexByName);
    if (Result35.isError(innerRes))
      return innerRes;
    return Result35.ok({ kind: "not", expr: innerRes.value });
  }
  const resolved = indexByName.get(expr.field);
  if (!resolved)
    return Result35.err({ message: `filter field ${expr.field} is not indexed` });
  const index = resolved.config;
  if (expr.kind === "has" && !index.exists && !index.exact && !index.column) {
    return Result35.err({ message: `filter field ${expr.field} does not support has:` });
  }
  if (expr.kind === "has") {
    return Result35.ok({ kind: "has", field: resolved.field, index });
  }
  const compareRes = compileCompareValueResult(index, expr.rawValue, expr.op);
  if (Result35.isError(compareRes))
    return compareRes;
  if (expr.op !== "eq" && !index.column) {
    return Result35.err({ message: `filter field ${expr.field} does not support comparisons` });
  }
  if (expr.op === "eq" && !index.exact && !index.column) {
    return Result35.err({ message: `filter field ${expr.field} does not support equality filters` });
  }
  return Result35.ok({
    kind: "compare",
    field: resolved.field,
    index,
    op: expr.op,
    canonicalValue: compareRes.value.canonicalValue,
    compareValue: compareRes.value.compareValue
  });
}
function parseReadFilterResult(registry, input) {
  const trimmed = input.trim();
  if (trimmed === "")
    return Result35.err({ message: "filter must not be empty" });
  const tokensRes = tokenizeResult(trimmed);
  if (Result35.isError(tokensRes))
    return tokensRes;
  const parser = new Parser(tokensRes.value);
  const exprRes = parser.parseResult();
  if (Result35.isError(exprRes))
    return exprRes;
  const fields = registry.search?.fields ?? {};
  const indexByName = new Map;
  for (const [fieldName, config] of Object.entries(fields))
    indexByName.set(fieldName, { field: fieldName, config });
  for (const alias of Object.keys(registry.search?.aliases ?? {})) {
    const resolved = resolveSearchAlias(registry.search, alias);
    const config = fields[resolved];
    if (config)
      indexByName.set(alias, { field: resolved, config });
  }
  return compileExprResult(exprRes.value, indexByName);
}
function compareCanonicals(left, right, kind) {
  if (kind === "integer" || kind === "date") {
    const l = BigInt(left);
    const r2 = right;
    return l < r2 ? -1 : l > r2 ? 1 : 0;
  }
  if (kind === "float") {
    const l = Number(left);
    const r2 = right;
    return l < r2 ? -1 : l > r2 ? 1 : 0;
  }
  if (kind === "bool") {
    const l = left === "true";
    const r2 = right === true || right === "true";
    return l === r2 ? 0 : l ? 1 : -1;
  }
  const r = String(right);
  return left < r ? -1 : left > r ? 1 : 0;
}
function evaluateClause(filter, values) {
  if (filter.kind === "has")
    return !!values && values.length > 0;
  if (!values || values.length === 0)
    return false;
  if (filter.op === "eq")
    return values.includes(filter.canonicalValue);
  for (const value of values) {
    const cmp = compareCanonicals(value, filter.compareValue, filter.index.kind);
    if (filter.op === "gt" && cmp > 0)
      return true;
    if (filter.op === "gte" && cmp >= 0)
      return true;
    if (filter.op === "lt" && cmp < 0)
      return true;
    if (filter.op === "lte" && cmp <= 0)
      return true;
  }
  return false;
}
function evaluateReadFilterResult(registry, offset, filter, value) {
  const valuesRes = extractSearchExactValuesResult(registry, offset, value);
  if (Result35.isError(valuesRes))
    return valuesRes;
  const values = valuesRes.value;
  const evalNode = (node) => {
    if (node.kind === "and")
      return evalNode(node.left) && evalNode(node.right);
    if (node.kind === "or")
      return evalNode(node.left) || evalNode(node.right);
    if (node.kind === "not")
      return !evalNode(node.expr);
    return evaluateClause(node, values.get(node.field));
  };
  return Result35.ok(evalNode(filter));
}
function collectPositiveExactFilterClauses(filter) {
  const out = [];
  const visit = (node, negated) => {
    if (node.kind === "and") {
      visit(node.left, negated);
      visit(node.right, negated);
      return;
    }
    if (node.kind === "not") {
      visit(node.expr, !negated);
      return;
    }
    if (negated || node.kind !== "compare" || node.op !== "eq" || !node.canonicalValue)
      return;
    out.push({ field: node.field, canonicalValue: node.canonicalValue });
  };
  visit(filter, false);
  return out;
}
function collectPositiveColumnFilterClauses(filter) {
  const out = [];
  const supportsColumn = (node) => node.index.column === true && (node.index.kind === "integer" || node.index.kind === "float" || node.index.kind === "date" || node.index.kind === "bool");
  const visit = (node, negated) => {
    if (node.kind === "and") {
      visit(node.left, negated);
      visit(node.right, negated);
      return;
    }
    if (node.kind === "not") {
      visit(node.expr, !negated);
      return;
    }
    if (negated)
      return;
    if (node.kind === "has") {
      if (supportsColumn(node))
        out.push({ field: node.field, op: "has" });
      return;
    }
    if (node.kind === "compare" && supportsColumn(node)) {
      out.push({
        field: node.field,
        op: node.op,
        compareValue: typeof node.compareValue === "bigint" || typeof node.compareValue === "number" || typeof node.compareValue === "boolean" ? node.compareValue : undefined
      });
    }
  };
  visit(filter, false);
  return out;
}

// src/index/secondary_schema.ts
import { createHash as createHash4 } from "node:crypto";
import { Result as Result36 } from "better-result";
function hashSecondaryIndexField(index) {
  return createHash4("sha256").update(JSON.stringify({
    name: index.name,
    kind: index.config.kind,
    bindings: index.config.bindings,
    normalizer: index.config.normalizer ?? null,
    analyzer: index.config.analyzer ?? null,
    exact: index.config.exact === true
  })).digest("hex");
}

// src/search/companion_plan.ts
import { createHash as createHash5 } from "node:crypto";
import { Result as Result37 } from "better-result";
function buildDesiredSearchCompanionPlan(registry) {
  const search = registry.search;
  const families = {
    exact: false,
    col: false,
    fts: false,
    agg: false,
    mblk: false
  };
  if (!search) {
    return { families, fields: [], rollups: [], summary: { search: null } };
  }
  const wantedFieldNames = new Set;
  for (const [name, field] of Object.entries(search.fields)) {
    if (field.exact === true && field.kind !== "text")
      wantedFieldNames.add(name);
    if (field.column === true)
      wantedFieldNames.add(name);
    if (field.kind === "text" || field.kind === "keyword" && field.prefix === true)
      wantedFieldNames.add(name);
  }
  for (const rollup of Object.values(search.rollups ?? {})) {
    const timestampField = rollup.timestampField ?? search.primaryTimestampField;
    if (timestampField)
      wantedFieldNames.add(timestampField);
    for (const dimension of rollup.dimensions ?? [])
      wantedFieldNames.add(dimension);
    for (const measure of Object.values(rollup.measures)) {
      if (measure.kind === "summary")
        wantedFieldNames.add(measure.field);
    }
  }
  const orderedFieldNames = Array.from(wantedFieldNames).sort((a, b) => a.localeCompare(b));
  const fieldOrdinalByName = new Map;
  const fields = orderedFieldNames.map((name, ordinal) => {
    const field = search.fields[name];
    fieldOrdinalByName.set(name, ordinal);
    return {
      ordinal,
      name,
      kind: field.kind,
      bindings: field.bindings.map((binding) => ({ version: binding.version, jsonPointer: binding.jsonPointer })),
      normalizer: field.normalizer ?? null,
      analyzer: field.analyzer ?? null,
      exact: field.exact === true,
      prefix: field.prefix === true,
      column: field.column === true,
      exists: field.exists === true,
      sortable: field.sortable === true,
      aggregatable: field.aggregatable === true,
      contains: field.contains === true,
      positions: field.positions === true
    };
  });
  const colFields = fields.filter((field) => field.column);
  const exactFields = fields.filter((field) => field.exact && field.kind !== "text");
  const ftsFields = fields.filter((field) => field.kind === "text" || field.kind === "keyword" && field.prefix);
  const rollups = Object.entries(search.rollups ?? {}).sort((a, b) => a[0].localeCompare(b[0])).map(([name, rollup], rollupOrdinal) => {
    const intervals = [...rollup.intervals].sort().map((intervalName, intervalOrdinal) => {
      const parsed = parseDurationMsResult(intervalName);
      if (Result37.isError(parsed)) {
        throw dsError(parsed.error.message);
      }
      return {
        ordinal: intervalOrdinal,
        name: intervalName,
        ms: parsed.value
      };
    });
    const measures = Object.entries(rollup.measures).sort((a, b) => a[0].localeCompare(b[0])).map(([measureName, measure], measureOrdinal) => ({
      ordinal: measureOrdinal,
      name: measureName,
      kind: measure.kind,
      field_ordinal: measure.kind === "summary" ? fieldOrdinalByName.get(measure.field) ?? null : null,
      histogram: measure.kind === "summary" ? measure.histogram ?? null : null
    }));
    return {
      ordinal: rollupOrdinal,
      name,
      timestamp_field_ordinal: fieldOrdinalByName.get(rollup.timestampField ?? search.primaryTimestampField) ?? null,
      dimension_ordinals: [...rollup.dimensions ?? []].sort((a, b) => a.localeCompare(b)).map((dimension) => fieldOrdinalByName.get(dimension)).filter((value) => typeof value === "number"),
      intervals,
      measures
    };
  });
  families.exact = exactFields.length > 0;
  families.col = colFields.length > 0;
  families.fts = ftsFields.length > 0;
  families.agg = rollups.length > 0;
  families.mblk = search.profile === "metrics";
  return {
    families,
    fields,
    rollups,
    summary: {
      primaryTimestampField: search.primaryTimestampField ?? null,
      primaryTimestampFieldOrdinal: fieldOrdinalByName.get(search.primaryTimestampField) ?? null,
      profile: search.profile ?? null,
      exactFields: exactFields.map((field) => ({
        ordinal: field.ordinal,
        name: field.name,
        kind: field.kind,
        bindings: field.bindings,
        normalizer: field.normalizer
      })),
      colFields: colFields.map((field) => ({
        ordinal: field.ordinal,
        name: field.name,
        kind: field.kind,
        bindings: field.bindings,
        exists: field.exists,
        sortable: field.sortable
      })),
      ftsFields: ftsFields.map((field) => ({
        ordinal: field.ordinal,
        name: field.name,
        kind: field.kind,
        bindings: field.bindings,
        exact: field.exact,
        prefix: field.prefix,
        positions: field.positions,
        analyzer: field.analyzer,
        normalizer: field.normalizer
      })),
      aggRollups: rollups.map((rollup) => ({
        ordinal: rollup.ordinal,
        name: rollup.name,
        timestampFieldOrdinal: rollup.timestamp_field_ordinal,
        dimensions: rollup.dimension_ordinals,
        intervals: rollup.intervals.map((interval) => ({ ordinal: interval.ordinal, name: interval.name, ms: interval.ms })),
        measures: rollup.measures.map((measure) => ({
          ordinal: measure.ordinal,
          name: measure.name,
          kind: measure.kind,
          fieldOrdinal: measure.field_ordinal,
          histogram: measure.histogram
        }))
      }))
    }
  };
}
function hashSearchCompanionPlan(plan) {
  return createHash5("sha256").update(JSON.stringify(plan)).digest("hex");
}

// src/search/query.ts
import { Result as Result38 } from "better-result";
function isPlainObject5(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function tokenizeResult2(input) {
  const tokens = [];
  let i = 0;
  while (i < input.length) {
    const ch = input[i];
    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }
    if (ch === "(") {
      tokens.push({ kind: "lparen" });
      i += 1;
      continue;
    }
    if (ch === ")") {
      tokens.push({ kind: "rparen" });
      i += 1;
      continue;
    }
    if (ch === ":") {
      tokens.push({ kind: "colon" });
      i += 1;
      continue;
    }
    if (ch === "-") {
      tokens.push({ kind: "minus" });
      i += 1;
      continue;
    }
    if (ch === ">" || ch === "<" || ch === "=") {
      if ((ch === ">" || ch === "<") && input[i + 1] === "=") {
        tokens.push({ kind: "op", value: `${ch}=` });
        i += 2;
        continue;
      }
      tokens.push({ kind: "op", value: ch });
      i += 1;
      continue;
    }
    if (ch === '"') {
      let out = "";
      i += 1;
      while (i < input.length) {
        const cur = input[i];
        if (cur === "\\") {
          if (i + 1 >= input.length)
            return Result38.err({ message: "unterminated escape in query string" });
          out += input[i + 1];
          i += 2;
          continue;
        }
        if (cur === '"')
          break;
        out += cur;
        i += 1;
      }
      if (i >= input.length || input[i] !== '"')
        return Result38.err({ message: "unterminated quoted string in search query" });
      i += 1;
      tokens.push({ kind: "string", value: out });
      continue;
    }
    let j = i;
    while (j < input.length) {
      const cur = input[j];
      if (/\s/.test(cur) || cur === "(" || cur === ")" || cur === ":" || cur === ">" || cur === "<" || cur === "=")
        break;
      j += 1;
    }
    const word = input.slice(i, j);
    if (word === "")
      return Result38.err({ message: "invalid search query syntax" });
    tokens.push({ kind: "word", value: word });
    i = j;
  }
  return Result38.ok(tokens);
}

class Parser2 {
  tokens;
  pos;
  constructor(tokens, pos = 0) {
    this.tokens = tokens;
    this.pos = pos;
  }
  parseResult() {
    const exprRes = this.parseOrResult();
    if (Result38.isError(exprRes))
      return exprRes;
    if (!this.isAtEnd())
      return Result38.err({ message: "unexpected token in search query" });
    return exprRes;
  }
  parseOrResult() {
    let leftRes = this.parseAndResult();
    if (Result38.isError(leftRes))
      return leftRes;
    let left = leftRes.value;
    while (this.peekWord("OR")) {
      this.pos += 1;
      const rightRes = this.parseAndResult();
      if (Result38.isError(rightRes))
        return rightRes;
      left = { kind: "or", left, right: rightRes.value };
    }
    return Result38.ok(left);
  }
  parseAndResult() {
    let leftRes = this.parseUnaryResult();
    if (Result38.isError(leftRes))
      return leftRes;
    let left = leftRes.value;
    while (!this.isAtEnd() && !this.peekKind("rparen") && !this.peekWord("OR")) {
      if (this.peekWord("AND"))
        this.pos += 1;
      const rightRes = this.parseUnaryResult();
      if (Result38.isError(rightRes))
        return rightRes;
      left = { kind: "and", left, right: rightRes.value };
    }
    return Result38.ok(left);
  }
  parseUnaryResult() {
    if (this.peekWord("NOT")) {
      this.pos += 1;
      const innerRes = this.parseUnaryResult();
      if (Result38.isError(innerRes))
        return innerRes;
      return Result38.ok({ kind: "not", expr: innerRes.value });
    }
    if (this.peekKind("minus")) {
      this.pos += 1;
      const innerRes = this.parseUnaryResult();
      if (Result38.isError(innerRes))
        return innerRes;
      return Result38.ok({ kind: "not", expr: innerRes.value });
    }
    return this.parsePrimaryResult();
  }
  parsePrimaryResult() {
    if (this.peekKind("lparen")) {
      this.pos += 1;
      const exprRes = this.parseOrResult();
      if (Result38.isError(exprRes))
        return exprRes;
      if (!this.peekKind("rparen"))
        return Result38.err({ message: "missing ')' in search query" });
      this.pos += 1;
      return exprRes;
    }
    const token = this.consumeWordOrString();
    if (!token)
      return Result38.err({ message: "expected clause in search query" });
    const quoted = token.kind === "string";
    if (token.kind === "word" && this.peekKind("colon")) {
      this.pos += 1;
      if (token.value === "has") {
        const fieldToken = this.consumeWordOrString();
        if (!fieldToken || fieldToken.kind !== "word")
          return Result38.err({ message: "has: requires a field name" });
        return Result38.ok({ kind: "has", field: fieldToken.value });
      }
      if (token.value === "contains") {
        return Result38.err({ message: "contains: is not supported on _search yet" });
      }
      let op = "eq";
      if (this.peekKind("op")) {
        const raw = this.tokens[this.pos].value;
        this.pos += 1;
        op = raw === "=" ? "eq" : raw === ">" ? "gt" : raw === ">=" ? "gte" : raw === "<" ? "lt" : "lte";
      }
      const valueToken = this.consumeWordOrString();
      if (!valueToken)
        return Result38.err({ message: "expected value in fielded search clause" });
      return Result38.ok({
        kind: "field",
        field: token.value,
        op,
        value: valueToken.value,
        quoted: valueToken.kind === "string"
      });
    }
    return Result38.ok({ kind: "bare", value: token.value, quoted });
  }
  consumeWordOrString() {
    const token = this.tokens[this.pos];
    if (!token || token.kind !== "word" && token.kind !== "string")
      return null;
    this.pos += 1;
    return token;
  }
  peekKind(kind) {
    return this.tokens[this.pos]?.kind === kind;
  }
  peekWord(value) {
    const token = this.tokens[this.pos];
    return token?.kind === "word" && token.value.toUpperCase() === value;
  }
  isAtEnd() {
    return this.pos >= this.tokens.length;
  }
}
function resolveDefaultFieldsResult(search) {
  if (!search)
    return Result38.err({ message: "search is not configured for this stream" });
  const out = [];
  if (Array.isArray(search.defaultFields) && search.defaultFields.length > 0) {
    for (const entry of search.defaultFields) {
      const resolved = resolveSearchAlias(search, entry.field);
      const config = search.fields[resolved];
      if (!config)
        return Result38.err({ message: `search default field ${entry.field} is not defined` });
      if (config.kind !== "text" && config.kind !== "keyword") {
        return Result38.err({ message: `search default field ${entry.field} must be text or keyword` });
      }
      out.push({ field: resolved, config, boost: entry.boost ?? 1 });
    }
    return Result38.ok(out);
  }
  for (const [field, config] of Object.entries(search.fields)) {
    if (config.kind === "text")
      out.push({ field, config, boost: 1 });
  }
  if (out.length === 0)
    return Result38.err({ message: "search.defaultFields must include at least one text or keyword field" });
  return Result38.ok(out);
}
function compileCompareValueResult2(config, rawValue, op) {
  const canonical = canonicalizeExactValue(config, rawValue);
  if (canonical == null)
    return Result38.err({ message: "invalid value for search field" });
  if (op === "eq") {
    const compareValue2 = canonicalizeColumnValue(config, rawValue);
    return Result38.ok({ canonicalValue: canonical, compareValue: compareValue2 ?? undefined });
  }
  const compareValue = canonicalizeColumnValue(config, rawValue);
  if (compareValue == null)
    return Result38.err({ message: "comparison operator is only supported on typed column fields" });
  return Result38.ok({ canonicalValue: canonical, compareValue });
}
function compileTextClauseResult(fields, rawValue, quoted) {
  const prefix = rawValue.endsWith("*") && rawValue.length > 1;
  const text = prefix ? rawValue.slice(0, -1) : rawValue;
  const normalized = text.trim();
  if (normalized === "")
    return Result38.err({ message: "search text clause must not be empty" });
  let tokens = [];
  for (const field of fields) {
    if (field.config.kind === "keyword") {
      const canonical = canonicalizeExactValue(field.config, normalized);
      if (canonical)
        tokens = [canonical];
      break;
    }
    tokens = analyzeTextValue(normalized, field.config.analyzer);
    if (tokens.length > 0)
      break;
  }
  if (tokens.length === 0)
    return Result38.err({ message: "search text clause did not produce any searchable tokens" });
  return Result38.ok({
    kind: "text",
    fields,
    tokens,
    phrase: quoted,
    prefix,
    rawText: normalized
  });
}
function compileFieldClauseResult(search, fieldName, op, rawValue, quoted) {
  const resolvedField = resolveSearchAlias(search, fieldName);
  const config = search.fields[resolvedField];
  if (!config)
    return Result38.err({ message: `unknown search field ${fieldName}` });
  if (config.kind === "integer" || config.kind === "float" || config.kind === "date" || config.kind === "bool") {
    if (!config.column && op !== "eq") {
      return Result38.err({ message: `search field ${fieldName} does not support comparisons` });
    }
    if (!config.column && !config.exact) {
      return Result38.err({ message: `search field ${fieldName} does not support equality` });
    }
    const valueRes = compileCompareValueResult2(config, rawValue, op);
    if (Result38.isError(valueRes))
      return valueRes;
    return Result38.ok({
      kind: "compare",
      field: resolvedField,
      config,
      op,
      canonicalValue: valueRes.value.canonicalValue,
      compareValue: valueRes.value.compareValue
    });
  }
  if (config.kind === "keyword") {
    if (op !== "eq")
      return Result38.err({ message: `search field ${fieldName} does not support comparisons` });
    const prefix = rawValue.endsWith("*") && rawValue.length > 1;
    if (prefix && !config.prefix)
      return Result38.err({ message: `search field ${fieldName} does not support prefix queries` });
    if (!prefix && !config.exact)
      return Result38.err({ message: `search field ${fieldName} does not support exact queries` });
    const canonical = canonicalizeExactValue(config, prefix ? rawValue.slice(0, -1) : rawValue);
    if (canonical == null)
      return Result38.err({ message: `invalid keyword value for ${fieldName}` });
    return Result38.ok({
      kind: "keyword",
      field: resolvedField,
      config,
      canonicalValue: canonical,
      prefix
    });
  }
  if (config.kind === "text") {
    if (op !== "eq")
      return Result38.err({ message: `search field ${fieldName} does not support comparisons` });
    return compileTextClauseResult([{ field: resolvedField, config, boost: 1 }], rawValue, quoted);
  }
  return Result38.err({ message: `unsupported search field ${fieldName}` });
}
function compileQueryResult(search, node) {
  if (node.kind === "and") {
    const leftRes = compileQueryResult(search, node.left);
    if (Result38.isError(leftRes))
      return leftRes;
    const rightRes = compileQueryResult(search, node.right);
    if (Result38.isError(rightRes))
      return rightRes;
    return Result38.ok({ kind: "and", left: leftRes.value, right: rightRes.value });
  }
  if (node.kind === "or") {
    const leftRes = compileQueryResult(search, node.left);
    if (Result38.isError(leftRes))
      return leftRes;
    const rightRes = compileQueryResult(search, node.right);
    if (Result38.isError(rightRes))
      return rightRes;
    return Result38.ok({ kind: "or", left: leftRes.value, right: rightRes.value });
  }
  if (node.kind === "not") {
    const innerRes = compileQueryResult(search, node.expr);
    if (Result38.isError(innerRes))
      return innerRes;
    return Result38.ok({ kind: "not", expr: innerRes.value });
  }
  if (node.kind === "has") {
    const resolvedField = resolveSearchAlias(search, node.field);
    const config = search.fields[resolvedField];
    if (!config)
      return Result38.err({ message: `unknown search field ${node.field}` });
    if (!config.exists && !config.exact && !config.column && config.kind !== "text") {
      return Result38.err({ message: `search field ${node.field} does not support has:` });
    }
    return Result38.ok({ kind: "has", field: resolvedField, config });
  }
  if (node.kind === "field") {
    return compileFieldClauseResult(search, node.field, node.op, node.value, node.quoted);
  }
  const defaultsRes = resolveDefaultFieldsResult(search);
  if (Result38.isError(defaultsRes))
    return defaultsRes;
  return compileTextClauseResult(defaultsRes.value, node.value, node.quoted);
}
function parseSortItemResult(search, raw) {
  const trimmed = raw.trim();
  if (trimmed === "")
    return Result38.err({ message: "sort entries must not be empty" });
  const idx = trimmed.indexOf(":");
  const fieldName = idx >= 0 ? trimmed.slice(0, idx) : trimmed;
  const directionRaw = idx >= 0 ? trimmed.slice(idx + 1) : "desc";
  const direction = directionRaw === "asc" || directionRaw === "desc" ? directionRaw : null;
  if (!direction)
    return Result38.err({ message: `invalid sort direction for ${fieldName}` });
  if (fieldName === "_score")
    return Result38.ok({ kind: "score", direction });
  if (fieldName === "offset")
    return Result38.ok({ kind: "offset", direction });
  const resolvedField = resolveSearchAlias(search, fieldName);
  const config = search.fields[resolvedField];
  if (!config)
    return Result38.err({ message: `unknown sort field ${fieldName}` });
  if (!config.sortable && resolvedField !== search.primaryTimestampField) {
    return Result38.err({ message: `search field ${fieldName} is not sortable` });
  }
  return Result38.ok({ kind: "field", direction, field: resolvedField, config });
}
function hasScoringTextClause(query) {
  if (query.kind === "and" || query.kind === "or")
    return hasScoringTextClause(query.left) || hasScoringTextClause(query.right);
  if (query.kind === "not")
    return hasScoringTextClause(query.expr);
  return query.kind === "text";
}
function normalizeSortWithTieBreaker(search, query, explicit) {
  const timestampSort = {
    kind: "field",
    direction: "desc",
    field: search.primaryTimestampField,
    config: search.fields[search.primaryTimestampField]
  };
  const sorts = explicit.length > 0 ? [...explicit] : hasScoringTextClause(query) ? [{ kind: "score", direction: "desc" }, timestampSort, { kind: "offset", direction: "desc" }] : [{ kind: "offset", direction: "desc" }];
  if (!sorts.some((sort) => sort.kind === "offset")) {
    sorts.push({ kind: "offset", direction: "desc" });
  }
  return sorts;
}
function parseSearchAfterResult(raw) {
  if (raw == null)
    return Result38.ok(null);
  if (!Array.isArray(raw))
    return Result38.err({ message: "search_after must be an array" });
  return Result38.ok(raw.map((value) => structuredClone(value)));
}
function parseSearchQueryResult(registry, input) {
  const search = registry.search;
  if (!search)
    return Result38.err({ message: "search is not configured for this stream" });
  const trimmed = input.trim();
  if (trimmed === "")
    return Result38.err({ message: "q must not be empty" });
  const tokensRes = tokenizeResult2(trimmed);
  if (Result38.isError(tokensRes))
    return tokensRes;
  const parser = new Parser2(tokensRes.value);
  const parsedRes = parser.parseResult();
  if (Result38.isError(parsedRes))
    return parsedRes;
  return compileQueryResult(search, parsedRes.value);
}
function parseSearchRequestBodyResult(registry, raw) {
  if (!isPlainObject5(raw))
    return Result38.err({ message: "search request must be an object" });
  if (typeof raw.q !== "string")
    return Result38.err({ message: "q must be a string" });
  const queryRes = parseSearchQueryResult(registry, raw.q);
  if (Result38.isError(queryRes))
    return queryRes;
  const size = raw.size === undefined ? 50 : Number(raw.size);
  if (!Number.isFinite(size) || size <= 0 || !Number.isInteger(size) || size > 500) {
    return Result38.err({ message: "size must be an integer between 1 and 500" });
  }
  if ("track_total_hits" in raw) {
    return Result38.err({ message: "track_total_hits is no longer supported" });
  }
  const timeoutMs = raw.timeout_ms === undefined || raw.timeout_ms === null ? null : typeof raw.timeout_ms === "number" && Number.isFinite(raw.timeout_ms) && raw.timeout_ms >= 0 ? Math.trunc(raw.timeout_ms) : null;
  if (raw.timeout_ms !== undefined && raw.timeout_ms !== null && timeoutMs == null) {
    return Result38.err({ message: "timeout_ms must be a non-negative number" });
  }
  const search = registry.search;
  const sortItems = raw.sort === undefined ? [] : Array.isArray(raw.sort) ? raw.sort : null;
  if (raw.sort !== undefined && !sortItems)
    return Result38.err({ message: "sort must be an array of strings" });
  const parsedSorts = [];
  for (const entry of sortItems ?? []) {
    if (typeof entry !== "string")
      return Result38.err({ message: "sort entries must be strings" });
    const sortRes = parseSortItemResult(search, entry);
    if (Result38.isError(sortRes))
      return sortRes;
    parsedSorts.push(sortRes.value);
  }
  const searchAfterRes = parseSearchAfterResult(raw.search_after);
  if (Result38.isError(searchAfterRes))
    return searchAfterRes;
  const sort = normalizeSortWithTieBreaker(search, queryRes.value, parsedSorts);
  return Result38.ok({
    q: queryRes.value,
    size,
    timeoutMs,
    sort,
    searchAfter: searchAfterRes.value
  });
}
function parseSearchRequestQueryResult(registry, params) {
  const q = params.get("q");
  if (!q)
    return Result38.err({ message: "missing q" });
  if (params.has("track_total_hits")) {
    return Result38.err({ message: "track_total_hits is no longer supported" });
  }
  const sortValues = params.getAll("sort");
  const splitSorts = sortValues.flatMap((value) => value.split(",")).map((value) => value.trim()).filter((value) => value !== "");
  let searchAfter = null;
  const searchAfterParam = params.get("search_after");
  if (searchAfterParam) {
    try {
      const parsed = JSON.parse(searchAfterParam);
      if (!Array.isArray(parsed))
        return Result38.err({ message: "search_after must be a JSON array" });
      searchAfter = parsed;
    } catch {
      return Result38.err({ message: "search_after must be a JSON array" });
    }
  }
  return parseSearchRequestBodyResult(registry, {
    q,
    size: params.get("size") ? Number(params.get("size")) : undefined,
    timeout_ms: params.get("timeout_ms") ? Number(params.get("timeout_ms")) : undefined,
    sort: splitSorts.length > 0 ? splitSorts : undefined,
    search_after: searchAfter
  });
}
function collectPositiveSearchExactClauses(query) {
  const out = [];
  const visit = (node, negated) => {
    if (node.kind === "and") {
      visit(node.left, negated);
      visit(node.right, negated);
      return;
    }
    if (node.kind === "not") {
      visit(node.expr, !negated);
      return;
    }
    if (negated)
      return;
    if (node.kind === "keyword" && !node.prefix && node.config.exact) {
      out.push({ field: node.field, canonicalValue: node.canonicalValue });
      return;
    }
    if (node.kind === "compare" && node.op === "eq" && node.config.exact && node.canonicalValue) {
      out.push({ field: node.field, canonicalValue: node.canonicalValue });
    }
  };
  visit(query, false);
  return out;
}
function collectPositiveSearchColumnClauses(query) {
  const out = [];
  const supportsColumn = (config) => config.column === true && (config.kind === "integer" || config.kind === "float" || config.kind === "date" || config.kind === "bool");
  const visit = (node, negated) => {
    if (node.kind === "and") {
      visit(node.left, negated);
      visit(node.right, negated);
      return;
    }
    if (node.kind === "not") {
      visit(node.expr, !negated);
      return;
    }
    if (negated)
      return;
    if (node.kind === "has") {
      if (supportsColumn(node.config))
        out.push({ field: node.field, op: "has" });
      return;
    }
    if (node.kind === "compare" && supportsColumn(node.config)) {
      out.push({ field: node.field, op: node.op, compareValue: node.compareValue });
    }
  };
  visit(query, false);
  return out;
}
function collectPositiveSearchFtsClauses(query) {
  const out = [];
  const visit = (node, negated) => {
    if (node.kind === "and") {
      visit(node.left, negated);
      visit(node.right, negated);
      return;
    }
    if (node.kind === "not") {
      visit(node.expr, !negated);
      return;
    }
    if (negated)
      return;
    if (node.kind === "has") {
      if (node.config.kind === "text" || node.config.kind === "keyword" && node.config.prefix === true) {
        out.push({ kind: "has", field: node.field });
      }
      return;
    }
    if (node.kind === "keyword") {
      if (node.config.kind === "keyword" && node.config.prefix === true) {
        out.push({ kind: "keyword", field: node.field, canonicalValue: node.canonicalValue, prefix: node.prefix });
      }
      return;
    }
    if (node.kind === "text") {
      out.push({ kind: "text", fields: node.fields, tokens: node.tokens, phrase: node.phrase, prefix: node.prefix });
    }
  };
  visit(query, false);
  return out;
}
function buildSearchDocumentResult(registry, offset, value) {
  const exactRes = extractSearchExactValuesResult(registry, offset, value);
  if (Result38.isError(exactRes))
    return exactRes;
  const textRes = extractSearchTextValuesResult(registry, offset, value);
  if (Result38.isError(textRes))
    return textRes;
  const rawRes = extractRawSearchValuesResult(registry, offset, value);
  if (Result38.isError(rawRes))
    return rawRes;
  return Result38.ok({
    exactValues: exactRes.value,
    textValues: textRes.value,
    rawValues: rawRes.value
  });
}
function compareCanonical(left, right, kind) {
  if (kind === "integer" || kind === "date") {
    const l = BigInt(left);
    const r2 = right;
    return l < r2 ? -1 : l > r2 ? 1 : 0;
  }
  if (kind === "float") {
    const l = Number(left);
    const r2 = right;
    return l < r2 ? -1 : l > r2 ? 1 : 0;
  }
  if (kind === "bool") {
    const l = left === "true";
    const r2 = right === true || right === "true";
    return l === r2 ? 0 : l ? 1 : -1;
  }
  const r = String(right);
  return left < r ? -1 : left > r ? 1 : 0;
}
function matchPhraseTokens(docTokens, queryTokens, prefix) {
  if (queryTokens.length === 0)
    return false;
  for (let start = 0;start < docTokens.length; start++) {
    let matched = true;
    for (let i = 0;i < queryTokens.length; i++) {
      const docToken = docTokens[start + i];
      if (docToken == null) {
        matched = false;
        break;
      }
      const queryToken = queryTokens[i];
      const isLast = i === queryTokens.length - 1;
      if (prefix && isLast) {
        if (!docToken.startsWith(queryToken)) {
          matched = false;
          break;
        }
      } else if (docToken !== queryToken) {
        matched = false;
        break;
      }
    }
    if (matched)
      return true;
  }
  return false;
}
function scoreTextTokens(docTokens, queryTokens, boost, phrase, prefix) {
  if (queryTokens.length === 0)
    return 0;
  let matches = 0;
  for (let i = 0;i < queryTokens.length; i++) {
    const token = queryTokens[i];
    const isLast = i === queryTokens.length - 1;
    matches += docTokens.filter((docToken) => prefix && isLast ? docToken.startsWith(token) : docToken === token).length;
  }
  if (matches === 0)
    return 0;
  const phraseBonus = phrase ? queryTokens.length * 2 : 0;
  return (matches + phraseBonus) * boost;
}
function evaluateTextClause(node, doc) {
  let matched = false;
  let score = 0;
  for (const target of node.fields) {
    const values = doc.textValues.get(target.field) ?? [];
    if (values.length === 0)
      continue;
    for (const value of values) {
      if (target.config.kind === "keyword") {
        if (node.phrase) {
          const ok3 = node.prefix ? value.startsWith(node.tokens[0]) : value === node.tokens[0];
          if (!ok3)
            continue;
          matched = true;
          score = Math.max(score, target.boost);
          continue;
        }
        const ok2 = node.prefix ? value.startsWith(node.tokens[0]) : value === node.tokens[0];
        if (!ok2)
          continue;
        matched = true;
        score = Math.max(score, target.boost);
        continue;
      }
      const docTokens = analyzeTextValue(value, target.config.analyzer);
      const ok = node.phrase ? matchPhraseTokens(docTokens, node.tokens, node.prefix) : node.prefix && node.tokens.length === 1 ? docTokens.some((token) => token.startsWith(node.tokens[0])) : node.tokens.every((token) => docTokens.includes(token));
      if (!ok)
        continue;
      matched = true;
      score = Math.max(score, scoreTextTokens(docTokens, node.tokens, target.boost, node.phrase, node.prefix));
    }
  }
  return { matched, score };
}
function evaluateSearchQueryResult(registry, offset, query, value) {
  const docRes = buildSearchDocumentResult(registry, offset, value);
  if (Result38.isError(docRes))
    return docRes;
  const doc = docRes.value;
  const evalNode = (node) => {
    if (node.kind === "and") {
      const left = evalNode(node.left);
      if (!left.matched)
        return { matched: false, score: 0, matchedText: false };
      const right = evalNode(node.right);
      if (!right.matched)
        return { matched: false, score: 0, matchedText: false };
      return { matched: true, score: left.score + right.score, matchedText: left.matchedText || right.matchedText };
    }
    if (node.kind === "or") {
      const left = evalNode(node.left);
      const right = evalNode(node.right);
      if (!left.matched && !right.matched)
        return { matched: false, score: 0, matchedText: false };
      return {
        matched: true,
        score: left.score + right.score,
        matchedText: left.matchedText || right.matchedText
      };
    }
    if (node.kind === "not") {
      const inner = evalNode(node.expr);
      return { matched: !inner.matched, score: 0, matchedText: false };
    }
    if (node.kind === "has") {
      const values = doc.rawValues.get(node.field);
      return { matched: !!values && values.length > 0, score: 0, matchedText: false };
    }
    if (node.kind === "compare") {
      const values = doc.exactValues.get(node.field) ?? [];
      if (values.length === 0)
        return { matched: false, score: 0, matchedText: false };
      if (node.op === "eq") {
        return { matched: !!node.canonicalValue && values.includes(node.canonicalValue), score: 0, matchedText: false };
      }
      for (const value2 of values) {
        const cmp = compareCanonical(value2, node.compareValue, node.config.kind);
        if (node.op === "gt" && cmp > 0)
          return { matched: true, score: 0, matchedText: false };
        if (node.op === "gte" && cmp >= 0)
          return { matched: true, score: 0, matchedText: false };
        if (node.op === "lt" && cmp < 0)
          return { matched: true, score: 0, matchedText: false };
        if (node.op === "lte" && cmp <= 0)
          return { matched: true, score: 0, matchedText: false };
      }
      return { matched: false, score: 0, matchedText: false };
    }
    if (node.kind === "keyword") {
      const values = doc.exactValues.get(node.field) ?? [];
      const matched = node.prefix ? values.some((value2) => value2.startsWith(node.canonicalValue)) : values.includes(node.canonicalValue);
      return { matched, score: 0, matchedText: false };
    }
    const textEval = evaluateTextClause(node, doc);
    return { matched: textEval.matched, score: textEval.score, matchedText: textEval.matched };
  };
  return Result38.ok(evalNode(query));
}
function extractSearchHitFieldsResult(registry, offset, value) {
  const rawRes = extractRawSearchValuesResult(registry, offset, value);
  if (Result38.isError(rawRes))
    return rawRes;
  const out = {};
  for (const [field, values] of rawRes.value) {
    if (values.length === 1)
      out[field] = structuredClone(values[0]);
    else if (values.length > 1)
      out[field] = structuredClone(values);
  }
  return Result38.ok(out);
}

// src/search/aggregate.ts
import { Result as Result39 } from "better-result";
function isPlainObject6(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function parseTimeValueResult(raw, path) {
  if (typeof raw === "string") {
    const parsedRes = parseTimestampMsResult(raw);
    if (Result39.isError(parsedRes))
      return Result39.err({ message: `${path} must be a valid timestamp` });
    return Result39.ok(parsedRes.value);
  }
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return Result39.ok(BigInt(Math.trunc(raw)));
  }
  return Result39.err({ message: `${path} must be a timestamp string or unix milliseconds` });
}
function parseIntervalMsResult(search, rollupName, interval) {
  const rollup = search.rollups?.[rollupName];
  if (!rollup)
    return Result39.err({ message: `unknown rollup ${rollupName}` });
  if (!rollup.intervals.includes(interval))
    return Result39.err({ message: `interval ${interval} is not configured for rollup ${rollupName}` });
  const parsed = interval.trim();
  const match = /^(\d+)(ms|s|m|h|d)$/.exec(parsed);
  if (!match)
    return Result39.err({ message: `interval ${interval} is not a supported duration` });
  const value = Number(match[1]);
  const unit = match[2];
  const multiplier = unit === "ms" ? 1 : unit === "s" ? 1000 : unit === "m" ? 60000 : unit === "h" ? 3600000 : 86400000;
  return Result39.ok(value * multiplier);
}
function resolveRollupConfigResult(registry, rollupName) {
  const search = registry.search;
  if (!search)
    return Result39.err({ message: "search is not configured for this stream" });
  const rollup = search.rollups?.[rollupName];
  if (!rollup)
    return Result39.err({ message: `unknown rollup ${rollupName}` });
  return Result39.ok(rollup);
}
function parseAggregateRequestBodyResult(registry, raw) {
  if (!isPlainObject6(raw))
    return Result39.err({ message: "aggregate request must be an object" });
  const search = registry.search;
  if (!search)
    return Result39.err({ message: "search is not configured for this stream" });
  if (typeof raw.rollup !== "string" || raw.rollup.trim() === "")
    return Result39.err({ message: "rollup must be a string" });
  const rollupName = raw.rollup.trim();
  const rollupRes = resolveRollupConfigResult(registry, rollupName);
  if (Result39.isError(rollupRes))
    return rollupRes;
  const fromRes = parseTimeValueResult(raw.from, "from");
  if (Result39.isError(fromRes))
    return fromRes;
  const toRes = parseTimeValueResult(raw.to, "to");
  if (Result39.isError(toRes))
    return toRes;
  if (toRes.value <= fromRes.value)
    return Result39.err({ message: "to must be greater than from" });
  if (typeof raw.interval !== "string" || raw.interval.trim() === "")
    return Result39.err({ message: "interval must be a string" });
  const interval = raw.interval.trim();
  const intervalMsRes = parseIntervalMsResult(search, rollupName, interval);
  if (Result39.isError(intervalMsRes))
    return intervalMsRes;
  let q = null;
  if (raw.q !== undefined && raw.q !== null) {
    if (typeof raw.q !== "string")
      return Result39.err({ message: "q must be a string" });
    const queryRes = parseSearchQueryResult(registry, raw.q);
    if (Result39.isError(queryRes))
      return queryRes;
    q = queryRes.value;
  }
  const configuredDimensions = new Set(rollupRes.value.dimensions ?? []);
  let groupBy = [];
  if (raw.group_by !== undefined) {
    if (!Array.isArray(raw.group_by))
      return Result39.err({ message: "group_by must be an array of strings" });
    const seen = new Set;
    for (let i = 0;i < raw.group_by.length; i++) {
      if (typeof raw.group_by[i] !== "string")
        return Result39.err({ message: `group_by[${i}] must be a string` });
      const field = raw.group_by[i].trim();
      if (!configuredDimensions.has(field))
        return Result39.err({ message: `group_by field ${field} is not configured on rollup ${rollupName}` });
      if (!seen.has(field)) {
        seen.add(field);
        groupBy.push(field);
      }
    }
    groupBy.sort((a, b) => a.localeCompare(b));
  }
  let measures = null;
  if (raw.measures !== undefined) {
    if (!Array.isArray(raw.measures) || raw.measures.length === 0) {
      return Result39.err({ message: "measures must be a non-empty array of strings" });
    }
    const seen = new Set;
    measures = [];
    for (let i = 0;i < raw.measures.length; i++) {
      if (typeof raw.measures[i] !== "string")
        return Result39.err({ message: `measures[${i}] must be a string` });
      const measure = raw.measures[i].trim();
      if (!Object.prototype.hasOwnProperty.call(rollupRes.value.measures, measure)) {
        return Result39.err({ message: `unknown measure ${measure} on rollup ${rollupName}` });
      }
      if (!seen.has(measure)) {
        seen.add(measure);
        measures.push(measure);
      }
    }
    measures.sort((a, b) => a.localeCompare(b));
  }
  return Result39.ok({
    rollup: rollupName,
    fromMs: fromRes.value,
    toMs: toRes.value,
    interval,
    intervalMs: intervalMsRes.value,
    q,
    groupBy,
    measures
  });
}
function extractRollupEligibility(query, dimensions) {
  if (!query)
    return { eligible: true, exactFilters: {} };
  const clauses = collectPositiveSearchExactClauses(query);
  const exactFilters = {};
  const visit = (node) => {
    if (node.kind === "and")
      return visit(node.left) && visit(node.right);
    if (node.kind === "keyword") {
      if (node.prefix || !dimensions.has(node.field))
        return false;
      exactFilters[node.field] = node.canonicalValue;
      return true;
    }
    if (node.kind === "compare") {
      if (node.op !== "eq" || !node.canonicalValue || !dimensions.has(node.field))
        return false;
      exactFilters[node.field] = node.canonicalValue;
      return true;
    }
    return false;
  };
  if (!visit(query))
    return { eligible: false, exactFilters: {} };
  for (const clause of clauses) {
    if (!dimensions.has(clause.field))
      return { eligible: false, exactFilters: {} };
    exactFilters[clause.field] = clause.canonicalValue;
  }
  return { eligible: true, exactFilters };
}
function toFiniteNumber(value) {
  if (typeof value === "number" && Number.isFinite(value))
    return value;
  if (typeof value === "bigint")
    return Number(value);
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}
function extractHistogramObject(value) {
  if (!isPlainObject6(value))
    return;
  const out = {};
  for (const [key, raw] of Object.entries(value)) {
    const num = toFiniteNumber(raw);
    if (num == null)
      continue;
    out[key] = (out[key] ?? 0) + num;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}
function cloneAggMeasureState(state) {
  if (state.kind === "count")
    return { kind: "count", value: state.value };
  return {
    kind: "summary",
    summary: {
      count: state.summary.count,
      sum: state.summary.sum,
      min: state.summary.min,
      max: state.summary.max,
      histogram: state.summary.histogram ? { ...state.summary.histogram } : undefined
    }
  };
}
function mergeHistogram(target, next) {
  if (!target && !next)
    return;
  const out = { ...target ?? {} };
  for (const [bucket, value] of Object.entries(next ?? {})) {
    out[bucket] = (out[bucket] ?? 0) + value;
  }
  return out;
}
function mergeAggMeasureState(target, next) {
  if (target.kind === "count" && next.kind === "count") {
    target.value += next.value;
    return target;
  }
  if (target.kind === "summary" && next.kind === "summary") {
    target.summary.count += next.summary.count;
    target.summary.sum += next.summary.sum;
    target.summary.min = target.summary.min == null ? next.summary.min : next.summary.min == null ? target.summary.min : Math.min(target.summary.min, next.summary.min);
    target.summary.max = target.summary.max == null ? next.summary.max : next.summary.max == null ? target.summary.max : Math.max(target.summary.max, next.summary.max);
    target.summary.histogram = mergeHistogram(target.summary.histogram, next.summary.histogram);
    return target;
  }
  return target;
}
function computeHistogramPercentile(histogram, percentile2) {
  if (!histogram)
    return null;
  const entries = Object.entries(histogram).map(([bucket, count]) => ({ bucket: Number(bucket), count })).filter((entry) => Number.isFinite(entry.bucket) && Number.isFinite(entry.count) && entry.count > 0).sort((a, b) => a.bucket - b.bucket);
  if (entries.length === 0)
    return null;
  const total = entries.reduce((sum, entry) => sum + entry.count, 0);
  if (total <= 0)
    return null;
  const threshold = total * percentile2;
  let seen = 0;
  for (const entry of entries) {
    seen += entry.count;
    if (seen >= threshold)
      return entry.bucket;
  }
  return entries[entries.length - 1]?.bucket ?? null;
}
function formatAggMeasureState(state) {
  if (state.kind === "count") {
    return { count: state.value };
  }
  const histogram = state.summary.histogram ? { ...state.summary.histogram } : undefined;
  const avg = state.summary.count > 0 ? state.summary.sum / state.summary.count : null;
  return {
    count: state.summary.count,
    sum: state.summary.sum,
    min: state.summary.min,
    max: state.summary.max,
    avg,
    p50: computeHistogramPercentile(histogram, 0.5),
    p95: computeHistogramPercentile(histogram, 0.95),
    p99: computeHistogramPercentile(histogram, 0.99),
    histogram
  };
}
function rollupRequiredFieldNames(registry, rollup) {
  const fields = new Set;
  const timestampField = rollup.timestampField ?? registry.search?.primaryTimestampField;
  if (timestampField)
    fields.add(timestampField);
  for (const dimension of rollup.dimensions ?? [])
    fields.add(dimension);
  for (const measure of Object.values(rollup.measures)) {
    if (measure.kind === "summary")
      fields.add(measure.field);
  }
  return Array.from(fields);
}
function matchesRollupIncludeResult(registry, offset, value, include) {
  if (!include)
    return Result39.ok(true);
  const queryRes = parseSearchQueryResult(registry, include);
  if (Result39.isError(queryRes))
    return queryRes;
  const evalRes = evaluateSearchQueryResult(registry, offset, queryRes.value, value);
  if (Result39.isError(evalRes))
    return evalRes;
  return Result39.ok(evalRes.value.matched);
}
function extractRollupContributionResult(registry, rollup, offset, value, precomputedRawValues) {
  if (!isPlainObject6(value))
    return Result39.ok(null);
  const rollupIncludeRes = matchesRollupIncludeResult(registry, offset, value, rollup.include);
  if (Result39.isError(rollupIncludeRes))
    return rollupIncludeRes;
  if (!rollupIncludeRes.value)
    return Result39.ok(null);
  const rawValuesRes = precomputedRawValues ? Result39.ok(precomputedRawValues) : extractRawSearchValuesForFieldsResult(registry, offset, value, rollupRequiredFieldNames(registry, rollup));
  if (Result39.isError(rawValuesRes))
    return rawValuesRes;
  const rawValues = rawValuesRes.value;
  const timestampField = rollup.timestampField ?? registry.search?.primaryTimestampField;
  if (!timestampField)
    return Result39.ok(null);
  const timestampConfig = registry.search?.fields[timestampField];
  if (!timestampConfig)
    return Result39.ok(null);
  const timestampValues = rawValues.get(timestampField) ?? [];
  if (timestampValues.length !== 1)
    return Result39.ok(null);
  const timestampValue = canonicalizeColumnValue(timestampConfig, timestampValues[0]);
  if (typeof timestampValue !== "bigint" && typeof timestampValue !== "number")
    return Result39.ok(null);
  const timestampMs = typeof timestampValue === "bigint" ? Number(timestampValue) : Math.trunc(timestampValue);
  if (!Number.isFinite(timestampMs))
    return Result39.ok(null);
  const dimensions = {};
  for (const dimension of rollup.dimensions ?? []) {
    const config = registry.search?.fields[dimension];
    if (!config)
      return Result39.ok(null);
    const values = rawValues.get(dimension) ?? [];
    if (values.length > 1)
      return Result39.ok(null);
    if (values.length === 0) {
      dimensions[dimension] = null;
      continue;
    }
    const exactCanonical = canonicalizeExactValue(config, values[0]);
    dimensions[dimension] = exactCanonical == null ? null : exactCanonical;
  }
  const measures = {};
  for (const [measureName, measure] of Object.entries(rollup.measures)) {
    if (measure.kind === "count") {
      const includeRes = matchesRollupIncludeResult(registry, offset, value, measure.include);
      if (Result39.isError(includeRes))
        return includeRes;
      measures[measureName] = { kind: "count", value: includeRes.value ? 1 : 0 };
      continue;
    }
    if (measure.kind === "summary") {
      const config = registry.search?.fields[measure.field];
      if (!config)
        return Result39.ok(null);
      const values = rawValues.get(measure.field) ?? [];
      if (values.length !== 1)
        return Result39.ok(null);
      const numeric = toFiniteNumber(canonicalizeColumnValue(config, values[0]));
      if (numeric == null)
        return Result39.ok(null);
      measures[measureName] = {
        kind: "summary",
        summary: {
          count: 1,
          sum: numeric,
          min: numeric,
          max: numeric,
          histogram: measure.histogram === "log2_v1" ? { [String(2 ** Math.floor(Math.log2(Math.max(1, Math.abs(numeric) || 1))))]: 1 } : undefined
        }
      };
      continue;
    }
    const countResolved = resolvePointerResult(value, measure.countJsonPointer);
    if (Result39.isError(countResolved) || !countResolved.value.exists)
      return Result39.ok(null);
    const sumResolved = resolvePointerResult(value, measure.sumJsonPointer);
    if (Result39.isError(sumResolved) || !sumResolved.value.exists)
      return Result39.ok(null);
    const minResolved = resolvePointerResult(value, measure.minJsonPointer);
    if (Result39.isError(minResolved) || !minResolved.value.exists)
      return Result39.ok(null);
    const maxResolved = resolvePointerResult(value, measure.maxJsonPointer);
    if (Result39.isError(maxResolved) || !maxResolved.value.exists)
      return Result39.ok(null);
    const count = toFiniteNumber(countResolved.value.value);
    const sum = toFiniteNumber(sumResolved.value.value);
    const min = toFiniteNumber(minResolved.value.value);
    const max = toFiniteNumber(maxResolved.value.value);
    if (count == null || sum == null || min == null || max == null)
      return Result39.ok(null);
    let histogram;
    if (measure.histogramJsonPointer) {
      const histResolved = resolvePointerResult(value, measure.histogramJsonPointer);
      if (!Result39.isError(histResolved) && histResolved.value.exists) {
        histogram = extractHistogramObject(histResolved.value.value);
      }
    }
    measures[measureName] = {
      kind: "summary",
      summary: {
        count,
        sum,
        min,
        max,
        histogram
      }
    };
  }
  return Result39.ok({ timestampMs, dimensions, measures });
}

// src/observe/request.ts
import { Result as Result40 } from "better-result";
function isPlainObject7(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function stringField(record, field) {
  const value = record[field];
  return typeof value === "string" && value.trim() !== "" ? value : null;
}
function numberField(record, field) {
  const value = record[field];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
function nestedObject(record, field) {
  const value = record[field];
  return isPlainObject7(value) ? value : {};
}
function pickFields(record, fields) {
  const out = {};
  for (const field of fields) {
    if (Object.prototype.hasOwnProperty.call(record, field))
      out[field] = structuredClone(record[field]);
  }
  return out;
}
function nonEmptyRecord(record) {
  return Object.keys(record).length === 0 ? null : record;
}
function compactNested(record, field, fields) {
  const nested = nestedObject(record, field);
  return nonEmptyRecord(pickFields(nested, fields));
}
function parseOptionalString(raw, path) {
  if (raw === undefined || raw === null)
    return Result40.ok(null);
  if (typeof raw !== "string")
    return Result40.err({ message: `${path} must be a string` });
  const trimmed = raw.trim();
  return Result40.ok(trimmed === "" ? null : trimmed);
}
function parseBoolean(raw, fallback, path) {
  if (raw === undefined)
    return Result40.ok(fallback);
  if (typeof raw !== "boolean")
    return Result40.err({ message: `${path} must be boolean` });
  return Result40.ok(raw);
}
function parseLimit(raw, fallback, max, path) {
  if (raw === undefined)
    return Result40.ok(fallback);
  if (typeof raw !== "number" || !Number.isFinite(raw) || !Number.isInteger(raw) || raw <= 0 || raw > max) {
    return Result40.err({ message: `${path} must be an integer between 1 and ${max}` });
  }
  return Result40.ok(raw);
}
function parseTime(raw) {
  if (raw === undefined)
    return Result40.ok({ from: null, to: null, paddingMs: 0 });
  if (!isPlainObject7(raw))
    return Result40.err({ message: "time must be an object" });
  const fromRes = parseOptionalString(raw.from, "time.from");
  if (Result40.isError(fromRes))
    return fromRes;
  const toRes = parseOptionalString(raw.to, "time.to");
  if (Result40.isError(toRes))
    return toRes;
  for (const [path, value] of [
    ["time.from", fromRes.value],
    ["time.to", toRes.value]
  ]) {
    if (value != null && Number.isNaN(Date.parse(value)))
      return Result40.err({ message: `${path} must be an ISO timestamp` });
  }
  const paddingRaw = raw.paddingMs ?? raw.padding_ms;
  if (paddingRaw === undefined)
    return Result40.ok({ from: fromRes.value, to: toRes.value, paddingMs: 0 });
  if (typeof paddingRaw !== "number" || !Number.isFinite(paddingRaw) || paddingRaw < 0 || paddingRaw > 86400000) {
    return Result40.err({ message: "time.paddingMs must be a non-negative number no greater than 86400000" });
  }
  return Result40.ok({ from: fromRes.value, to: toRes.value, paddingMs: Math.trunc(paddingRaw) });
}
function parseObserveRequestResult(raw) {
  if (!isPlainObject7(raw))
    return Result40.err({ message: "observe request must be an object" });
  const streamsRaw = raw.streams;
  if (!isPlainObject7(streamsRaw))
    return Result40.err({ message: "streams must be an object" });
  const eventsStreamRes = parseOptionalString(streamsRaw.events, "streams.events");
  if (Result40.isError(eventsStreamRes))
    return eventsStreamRes;
  const tracesStreamRes = parseOptionalString(streamsRaw.traces, "streams.traces");
  if (Result40.isError(tracesStreamRes))
    return tracesStreamRes;
  const lookupRaw = raw.lookup;
  if (!isPlainObject7(lookupRaw))
    return Result40.err({ message: "lookup must be an object" });
  const requestIdRes = parseOptionalString(lookupRaw.requestId, "lookup.requestId");
  if (Result40.isError(requestIdRes))
    return requestIdRes;
  const traceIdRes = parseOptionalString(lookupRaw.traceId, "lookup.traceId");
  if (Result40.isError(traceIdRes))
    return traceIdRes;
  const spanIdRes = parseOptionalString(lookupRaw.spanId, "lookup.spanId");
  if (Result40.isError(spanIdRes))
    return spanIdRes;
  const lookupCount = [requestIdRes.value, traceIdRes.value, spanIdRes.value].filter((value) => value != null).length;
  if (lookupCount !== 1)
    return Result40.err({ message: "lookup must include exactly one of requestId, traceId, or spanId" });
  const includeRaw = isPlainObject7(raw.include) ? raw.include : {};
  const includeEventsRes = parseBoolean(includeRaw.events, true, "include.events");
  if (Result40.isError(includeEventsRes))
    return includeEventsRes;
  const includeTraceRes = parseBoolean(includeRaw.trace, true, "include.trace");
  if (Result40.isError(includeTraceRes))
    return includeTraceRes;
  const includeTimelineRes = parseBoolean(includeRaw.timeline, true, "include.timeline");
  if (Result40.isError(includeTimelineRes))
    return includeTimelineRes;
  const includeRawRes = parseBoolean(includeRaw.raw, false, "include.raw");
  if (Result40.isError(includeRawRes))
    return includeRawRes;
  if (includeEventsRes.value && !eventsStreamRes.value)
    return Result40.err({ message: "streams.events is required when include.events is true" });
  if (includeTraceRes.value && !tracesStreamRes.value)
    return Result40.err({ message: "streams.traces is required when include.trace is true" });
  const limitsRaw = isPlainObject7(raw.limits) ? raw.limits : {};
  const eventLimitRes = parseLimit(limitsRaw.events, 100, 500, "limits.events");
  if (Result40.isError(eventLimitRes))
    return eventLimitRes;
  const spanLimitRes = parseLimit(limitsRaw.spans, 5000, 1e4, "limits.spans");
  if (Result40.isError(spanLimitRes))
    return spanLimitRes;
  const timeRes = parseTime(raw.time);
  if (Result40.isError(timeRes))
    return timeRes;
  return Result40.ok({
    streams: {
      events: eventsStreamRes.value ?? undefined,
      traces: tracesStreamRes.value ?? undefined
    },
    lookup: {
      requestId: requestIdRes.value,
      traceId: traceIdRes.value,
      spanId: spanIdRes.value
    },
    time: timeRes.value,
    include: {
      events: includeEventsRes.value,
      trace: includeTraceRes.value,
      timeline: includeTimelineRes.value,
      raw: includeRawRes.value
    },
    limits: {
      events: eventLimitRes.value,
      spans: spanLimitRes.value
    }
  });
}
function quoteSearchValue(value) {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, "\\\"")}"`;
}
function buildTimeSearchClauses(time) {
  const out = [];
  if (time.from) {
    const from = new Date(Date.parse(time.from) - time.paddingMs).toISOString();
    out.push(`timestamp:>=${quoteSearchValue(from)}`);
  }
  if (time.to) {
    const to = new Date(Date.parse(time.to) + time.paddingMs).toISOString();
    out.push(`timestamp:<=${quoteSearchValue(to)}`);
  }
  return out;
}
function combineSearchClauses(...clauses) {
  return clauses.filter((clause) => !!clause && clause.trim() !== "").join(" ");
}
function statusCode(record) {
  const status = nestedObject(record, "status");
  const code = stringField(status, "code");
  return code === "ok" || code === "error" ? code : "unset";
}
function spanIsError(record) {
  if (statusCode(record) === "error")
    return true;
  const error = nestedObject(record, "error");
  return error.isError === true;
}
function toTraceNode(record, depth) {
  return {
    spanId: stringField(record, "spanId") ?? "",
    parentSpanId: stringField(record, "parentSpanId"),
    children: [],
    depth,
    service: stringField(record, "service"),
    name: stringField(record, "name") ?? "",
    kind: stringField(record, "kind") ?? "unspecified",
    startTime: stringField(record, "timestamp") ?? "",
    endTime: stringField(record, "endTimestamp"),
    duration: numberField(record, "duration"),
    statusCode: statusCode(record)
  };
}
function compareSpans(left, right) {
  const leftTs = stringField(left, "timestamp") ?? "";
  const rightTs = stringField(right, "timestamp") ?? "";
  if (leftTs !== rightTs)
    return leftTs < rightTs ? -1 : 1;
  const leftDuration = numberField(left, "duration") ?? -1;
  const rightDuration = numberField(right, "duration") ?? -1;
  if (leftDuration !== rightDuration)
    return rightDuration - leftDuration;
  return (stringField(left, "name") ?? "").localeCompare(stringField(right, "name") ?? "");
}
function sortTree(nodes) {
  nodes.sort((left, right) => {
    if (left.startTime !== right.startTime)
      return left.startTime < right.startTime ? -1 : 1;
    if ((left.duration ?? -1) !== (right.duration ?? -1))
      return (right.duration ?? -1) - (left.duration ?? -1);
    return left.name.localeCompare(right.name);
  });
  for (const node of nodes)
    sortTree(node.children);
}
function cloneNodeAtDepth(node, depth) {
  return {
    ...node,
    depth,
    children: node.children.map((child) => cloneNodeAtDepth(child, depth + 1))
  };
}
function parseTimeMs(value) {
  if (!value)
    return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}
function intervalDurationMs(node) {
  const start = parseTimeMs(node.startTime);
  const end = parseTimeMs(node.endTime);
  if (start == null || end == null || end < start)
    return node.duration;
  return end - start;
}
function exclusiveDurationMs(node) {
  const total = intervalDurationMs(node) ?? node.duration ?? 0;
  const start = parseTimeMs(node.startTime);
  const end = parseTimeMs(node.endTime);
  if (start == null || end == null || end <= start || node.children.length === 0)
    return Math.max(0, total);
  const intervals = node.children.map((child) => {
    const childStart = parseTimeMs(child.startTime);
    const childEnd = parseTimeMs(child.endTime);
    if (childStart == null || childEnd == null || childEnd <= childStart)
      return null;
    return [Math.max(start, childStart), Math.min(end, childEnd)];
  }).filter((interval) => !!interval && interval[1] > interval[0]).sort((left, right) => left[0] - right[0]);
  let covered = 0;
  let currentStart = null;
  let currentEnd = null;
  for (const [left, right] of intervals) {
    if (currentStart == null || currentEnd == null) {
      currentStart = left;
      currentEnd = right;
      continue;
    }
    if (left <= currentEnd) {
      currentEnd = Math.max(currentEnd, right);
      continue;
    }
    covered += currentEnd - currentStart;
    currentStart = left;
    currentEnd = right;
  }
  if (currentStart != null && currentEnd != null)
    covered += currentEnd - currentStart;
  return Math.max(0, total - covered);
}
function criticalPathScore(node, memo) {
  const cached = memo.get(node.spanId);
  if (cached != null)
    return cached;
  const score = node.children.length === 0 ? exclusiveDurationMs(node) : exclusiveDurationMs(node) + Math.max(...node.children.map((child) => criticalPathScore(child, memo)));
  memo.set(node.spanId, score);
  return score;
}
function rootSelectionScore(node, record) {
  const http = record ? nestedObject(record, "http") : {};
  const hasHttp = stringField(http, "method") != null || stringField(http, "route") != null || stringField(http, "path") != null || numberField(http, "statusCode") != null;
  return (node.parentSpanId == null ? 1e4 : 0) + (node.kind === "server" ? 2000 : 0) + (hasHttp ? 1000 : 0) + (record && stringField(record, "requestId") ? 500 : 0) + Math.min(node.duration ?? 0, 60000) / 10;
}
function selectRootSpanId(rootNodes, bySpanId) {
  if (rootNodes.length === 0)
    return null;
  return [...rootNodes].sort((left, right) => {
    const scoreDiff = rootSelectionScore(right, bySpanId.get(right.spanId)) - rootSelectionScore(left, bySpanId.get(left.spanId));
    if (scoreDiff !== 0)
      return scoreDiff;
    if (left.startTime !== right.startTime)
      return left.startTime < right.startTime ? -1 : 1;
    return left.spanId.localeCompare(right.spanId);
  })[0]?.spanId ?? null;
}
function buildCriticalPath(rootNodes, rootSpanId) {
  if (rootNodes.length === 0)
    return [];
  const memo = new Map;
  let current = rootNodes.find((node) => node.spanId === rootSpanId) ?? [...rootNodes].sort((a, b) => criticalPathScore(b, memo) - criticalPathScore(a, memo))[0];
  const out = [];
  while (current) {
    out.push(current.spanId);
    if (current.children.length === 0)
      break;
    current = [...current.children].sort((a, b) => criticalPathScore(b, memo) - criticalPathScore(a, memo))[0];
  }
  return out;
}
function buildServiceMap(spans, bySpanId) {
  const edges = new Map;
  for (const span of spans) {
    const parentSpanId = stringField(span, "parentSpanId");
    if (!parentSpanId)
      continue;
    const parent = bySpanId.get(parentSpanId);
    if (!parent)
      continue;
    const from = stringField(parent, "service");
    const to = stringField(span, "service");
    if (!from || !to || from === to)
      continue;
    const key = `${from}\x00${to}`;
    let edge = edges.get(key);
    if (!edge) {
      edge = {
        from,
        to,
        count: 0,
        errorCount: 0,
        latency: { count: 0, sum: 0, min: null, max: null }
      };
      edges.set(key, edge);
    }
    edge.count += 1;
    if (spanIsError(span))
      edge.errorCount += 1;
    const duration = numberField(span, "duration");
    if (duration != null) {
      edge.latency.count += 1;
      edge.latency.sum += duration;
      edge.latency.min = edge.latency.min == null ? duration : Math.min(edge.latency.min, duration);
      edge.latency.max = edge.latency.max == null ? duration : Math.max(edge.latency.max, duration);
    }
  }
  return Array.from(edges.values()).sort((a, b) => `${a.from}:${a.to}`.localeCompare(`${b.from}:${b.to}`));
}
function buildTraceErrors(spans) {
  const errors = [];
  for (const span of spans) {
    if (!spanIsError(span))
      continue;
    const error = nestedObject(span, "error");
    errors.push({
      spanId: stringField(span, "spanId") ?? "",
      service: stringField(span, "service"),
      name: stringField(span, "name") ?? "",
      time: stringField(span, "timestamp"),
      type: stringField(error, "type"),
      message: stringField(error, "message") ?? (isPlainObject7(span.status) ? stringField(span.status, "message") : null)
    });
  }
  return errors;
}
function buildTraceDetails(spansRaw, args) {
  const input = spansRaw.filter(isPlainObject7).sort(compareSpans);
  const unique = new Map;
  let duplicateSpans = 0;
  for (const span of input) {
    const traceId = stringField(span, "traceId");
    const spanId = stringField(span, "spanId");
    if (!traceId || !spanId)
      continue;
    const key = `${traceId}:${spanId}`;
    if (unique.has(key)) {
      duplicateSpans += 1;
      continue;
    }
    unique.set(key, span);
  }
  const spans = Array.from(unique.values()).sort(compareSpans);
  const bySpanId = new Map;
  for (const span of spans) {
    const spanId = stringField(span, "spanId");
    if (spanId)
      bySpanId.set(spanId, span);
  }
  const nodeBySpanId = new Map;
  for (const span of spans) {
    const spanId = stringField(span, "spanId");
    if (spanId)
      nodeBySpanId.set(spanId, toTraceNode(span, 0));
  }
  const roots = [];
  const missingParents = new Set;
  for (const span of spans) {
    const spanId = stringField(span, "spanId");
    if (!spanId)
      continue;
    const node = nodeBySpanId.get(spanId);
    if (!node)
      continue;
    const parentSpanId = stringField(span, "parentSpanId");
    if (!parentSpanId) {
      roots.push(node);
      continue;
    }
    const parent = nodeBySpanId.get(parentSpanId);
    if (!parent) {
      missingParents.add(parentSpanId);
      roots.push(node);
      continue;
    }
    parent.children.push(node);
  }
  const setDepth = (node, depth) => {
    node.depth = depth;
    node.children = node.children.map((child) => setDepth(child, depth + 1));
    return node;
  };
  const tree = roots.map((root) => setDepth(root, 0)).map((root) => cloneNodeAtDepth(root, 0));
  sortTree(tree);
  const rootSpanId = selectRootSpanId(tree, bySpanId);
  return {
    traceId: spans.length > 0 ? stringField(spans[0], "traceId") : null,
    rootSpanId,
    spans,
    tree,
    serviceMap: buildServiceMap(spans, bySpanId),
    criticalPath: buildCriticalPath(tree, rootSpanId),
    errors: buildTraceErrors(spans),
    partial: (args?.spanLimitReached ?? false) || args?.coverageComplete === false || missingParents.size > 0,
    missingParents: Array.from(missingParents).sort(),
    duplicateSpans
  };
}
function summarizeSearchQueryCoverage(q, batches, hits, limitReached) {
  let complete = batches.length > 0;
  let timedOut = false;
  let totalValue = 0;
  let totalRelation = "eq";
  for (const batch of batches) {
    complete = complete && batch.coverage.complete;
    timedOut = timedOut || batch.timedOut;
    totalValue = Math.max(totalValue, batch.total.value);
    if (batch.total.relation === "gte")
      totalRelation = "gte";
  }
  if (batches.length === 0)
    complete = true;
  return {
    q,
    hits: hits.length,
    total: { value: totalValue, relation: totalRelation },
    pages: batches.length,
    complete: complete && !timedOut && !limitReached,
    timed_out: timedOut,
    limit_reached: limitReached
  };
}
function summarizeSearchCoverage(batches, hits, limitReached, queries = []) {
  const families = new Set;
  const uniqueHitKeys = new Set;
  let complete = batches.length > 0;
  let timedOut = false;
  let scannedTailDocs = 0;
  let scannedSegments = 0;
  let possibleMissing = 0;
  let totalRelation = "eq";
  const batchStreams = new Set(batches.map((batch) => batch.stream));
  const fallbackStream = batchStreams.size === 1 ? Array.from(batchStreams)[0] : "";
  for (const hit of hits) {
    const stream = typeof hit.stream === "string" ? hit.stream : fallbackStream;
    uniqueHitKeys.add(`${stream}\x00${hit.offset}`);
  }
  for (const batch of batches) {
    complete = complete && batch.coverage.complete;
    timedOut = timedOut || batch.timedOut;
    scannedTailDocs += batch.coverage.scannedTailDocs;
    scannedSegments += batch.coverage.scannedSegments;
    possibleMissing += batch.coverage.possibleMissingEventsUpperBound;
    if (batch.total.relation === "gte")
      totalRelation = "gte";
    for (const family of batch.coverage.indexFamiliesUsed)
      families.add(family);
  }
  if (batches.length === 0)
    complete = true;
  const exactUniqueTotal = !limitReached && !timedOut && complete && totalRelation === "eq";
  return {
    searched: batches.length > 0,
    complete: complete && !timedOut && !limitReached,
    timed_out: timedOut,
    limit_reached: limitReached,
    hits: uniqueHitKeys.size,
    unique_hits: uniqueHitKeys.size,
    query_count: batches.length,
    batch_count: batches.length,
    total: { value: uniqueHitKeys.size, relation: exactUniqueTotal ? "eq" : "gte" },
    index_families_used: Array.from(families).sort(),
    scanned_tail_docs: scannedTailDocs,
    scanned_segments: scannedSegments,
    possible_missing_events_upper_bound: possibleMissing,
    queries
  };
}
function sortTimeline(items) {
  return [...items].sort((left, right) => {
    if (left.time !== right.time)
      return left.time < right.time ? -1 : 1;
    return left.kind.localeCompare(right.kind);
  });
}
function evlogLevel(record) {
  const level = stringField(record, "level");
  return level === "debug" || level === "info" || level === "warn" || level === "error" ? level : null;
}
function firstString(...values) {
  return values.find((value) => value != null) ?? null;
}
function firstNumber(...values) {
  return values.find((value) => value != null) ?? null;
}
function buildObserveSummary(args) {
  const rootSpan = args.trace.spans.find((span) => stringField(span, "spanId") === args.trace.rootSpanId) ?? args.trace.spans[0] ?? null;
  const event = args.primaryEvent;
  const http = rootSpan ? nestedObject(rootSpan, "http") : {};
  const error = rootSpan ? nestedObject(rootSpan, "error") : {};
  const eventStatus = event ? numberField(event, "status") : null;
  const spanStatus = numberField(http, "statusCode");
  const level = event ? evlogLevel(event) : null;
  const method = firstString(event ? stringField(event, "method") : null, stringField(http, "method"));
  const path = firstString(event ? stringField(event, "path") : null, stringField(http, "path"));
  const route = stringField(http, "route");
  const rootStart = rootSpan ? stringField(rootSpan, "timestamp") : null;
  const rootEnd = rootSpan ? stringField(rootSpan, "endTimestamp") : null;
  const eventMessage = event ? stringField(event, "message") : null;
  const spanName = rootSpan ? stringField(rootSpan, "name") : null;
  return {
    title: eventMessage ?? ([method, route ?? path].filter(Boolean).join(" ") || spanName || args.lookup.requestId || args.lookup.traceId || args.lookup.spanId || "request"),
    service: firstString(event ? stringField(event, "service") : null, rootSpan ? stringField(rootSpan, "service") : null),
    environment: firstString(event ? stringField(event, "environment") : null, rootSpan ? stringField(rootSpan, "environment") : null),
    method,
    path,
    route,
    status: firstNumber(eventStatus, spanStatus),
    level,
    duration: firstNumber(event ? numberField(event, "duration") : null, rootSpan ? numberField(rootSpan, "duration") : null),
    startTime: firstString(event ? stringField(event, "timestamp") : null, rootStart),
    endTime: rootEnd,
    error: {
      isError: level === "error" || eventStatus != null && eventStatus >= 500 || args.trace.errors.length > 0 || error.isError === true,
      type: stringField(error, "type"),
      message: firstString(stringField(error, "message"), event ? stringField(event, "message") : null),
      why: event ? stringField(event, "why") : null,
      fix: event ? stringField(event, "fix") : null,
      link: event ? stringField(event, "link") : null
    }
  };
}
function choosePrimaryEvent(events, traceId) {
  if (events.length === 0)
    return null;
  if (traceId) {
    const matching = events.find((hit) => isPlainObject7(hit.source) && stringField(hit.source, "traceId") === traceId);
    if (matching)
      return matching;
  }
  return events[0];
}
function compactEvlogRecord(record) {
  if (!isPlainObject7(record))
    return record;
  return pickFields(record, [
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
    "link"
  ]);
}
function compactTraceSpanRecord(record) {
  if (!isPlainObject7(record))
    return record;
  const out = pickFields(record, [
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
    "name",
    "kind",
    "service",
    "serviceNamespace",
    "serviceInstanceId",
    "environment",
    "version",
    "region",
    "requestId",
    "eventNames",
    "dropped"
  ]);
  const traceFlags = nestedObject(record, "traceFlags");
  if (Object.prototype.hasOwnProperty.call(traceFlags, "sampled"))
    out.traceFlags = { sampled: traceFlags.sampled };
  const status = compactNested(record, "status", ["code", "message"]);
  if (status)
    out.status = status;
  const http = compactNested(record, "http", ["method", "route", "path", "statusCode"]);
  if (http)
    out.http = http;
  const db = compactNested(record, "db", ["system", "name", "operation"]);
  if (db)
    out.db = db;
  const rpc = compactNested(record, "rpc", ["system", "service", "method"]);
  if (rpc)
    out.rpc = rpc;
  const messaging = compactNested(record, "messaging", ["system", "destination", "operation"]);
  if (messaging)
    out.messaging = messaging;
  const error = compactNested(record, "error", ["isError", "type", "message"]);
  if (error)
    out.error = error;
  return out;
}
function compactTimelineItem(item) {
  if (!isPlainObject7(item))
    return item;
  const { data: _data, ...rest } = item;
  return rest;
}

// src/observe/pairing.ts
function readRequestPairing(profile2) {
  const observability = profile2.observability;
  if (!observability || typeof observability !== "object" || Array.isArray(observability)) {
    return null;
  }
  const request = observability.request;
  return request && typeof request === "object" && !Array.isArray(request) ? request : null;
}
function nonEmptyString(value) {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}
function buildRequestObservabilityPairingDescriptor(stream, profile2) {
  const request = readRequestPairing(profile2);
  if (!request)
    return null;
  if (profile2.kind === "evlog") {
    const tracesStream = nonEmptyString(request.tracesStream);
    if (!tracesStream)
      return null;
    return {
      request: {
        events_stream: stream,
        traces_stream: tracesStream
      }
    };
  }
  if (profile2.kind === "otel-traces") {
    const eventsStream = nonEmptyString(request.eventsStream);
    if (!eventsStream)
      return null;
    return {
      request: {
        events_stream: eventsStream,
        traces_stream: stream
      }
    };
  }
  return null;
}

// src/app_core.ts
function withNosniff(headers = {}) {
  return {
    "x-content-type-options": "nosniff",
    ...headers
  };
}
function json(status, body, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...withNosniff(headers)
    }
  });
}
var OVERLOAD_RETRY_AFTER_SECONDS = "1";
var UNAVAILABLE_RETRY_AFTER_SECONDS = "5";
var APPEND_REQUEST_TIMEOUT_MS = 3000;
var HTTP_RESOLVER_TIMEOUT_MS = 5000;
var SEARCH_REQUEST_TIMEOUT_MS = 3000;
var TIMEOUT_SENTINEL = Symbol("request-timeout");
var DEFAULT_TOUCH_JOURNAL_FILTER_BYTES = 4 * (1 << 22);
function retryAfterHeaders(seconds, headers = {}) {
  return {
    "retry-after": seconds,
    ...headers
  };
}
function clampSearchRequestTimeoutMs(timeoutMs) {
  return timeoutMs == null ? SEARCH_REQUEST_TIMEOUT_MS : Math.min(timeoutMs, SEARCH_REQUEST_TIMEOUT_MS);
}
async function awaitWithCooperativeTimeout(promise, timeoutMs) {
  let timer = null;
  try {
    return await Promise.race([
      promise,
      new Promise((resolve) => {
        timer = setTimeout(() => resolve(TIMEOUT_SENTINEL), timeoutMs);
      })
    ]);
  } finally {
    if (timer != null)
      clearTimeout(timer);
  }
}
function isAbortLikeError(error) {
  return typeof error === "object" && error != null && "name" in error && error.name === "AbortError";
}
function searchResponseHeaders(search) {
  return {
    "search-timed-out": search.timedOut ? "true" : "false",
    "search-timeout-ms": String(search.timeoutMs ?? SEARCH_REQUEST_TIMEOUT_MS),
    "search-took-ms": String(search.tookMs),
    "search-total-relation": search.total.relation,
    "search-coverage-complete": search.coverage.complete ? "true" : "false",
    "search-indexed-segments": String(search.coverage.indexedSegments),
    "search-indexed-segment-time-ms": String(search.coverage.indexedSegmentTimeMs),
    "search-fts-section-get-ms": String(search.coverage.ftsSectionGetMs),
    "search-fts-decode-ms": String(search.coverage.ftsDecodeMs),
    "search-fts-clause-estimate-ms": String(search.coverage.ftsClauseEstimateMs),
    "search-scanned-segments": String(search.coverage.scannedSegments),
    "search-scanned-segment-time-ms": String(search.coverage.scannedSegmentTimeMs),
    "search-scanned-tail-docs": String(search.coverage.scannedTailDocs),
    "search-scanned-tail-time-ms": String(search.coverage.scannedTailTimeMs),
    "search-exact-candidate-time-ms": String(search.coverage.exactCandidateTimeMs),
    "search-candidate-doc-ids": String(search.coverage.candidateDocIds),
    "search-decoded-records": String(search.coverage.decodedRecords),
    "search-json-parse-time-ms": String(search.coverage.jsonParseTimeMs),
    "search-segment-payload-bytes-fetched": String(search.coverage.segmentPayloadBytesFetched),
    "search-sort-time-ms": String(search.coverage.sortTimeMs),
    "search-peak-hits-held": String(search.coverage.peakHitsHeld),
    "search-index-families-used": search.coverage.indexFamiliesUsed.join(",")
  };
}
function internalError(message = "internal server error") {
  return json(500, { error: { code: "internal", message } });
}
function badRequest(msg) {
  return json(400, { error: { code: "bad_request", message: msg } });
}
function unsupportedMediaType(msg) {
  return json(415, { error: { code: "unsupported_media_type", message: msg } });
}
function notFound(msg = "not_found") {
  return json(404, { error: { code: "not_found", message: msg } });
}
function readerErrorResponse(err) {
  if (err.kind === "not_found")
    return notFound();
  if (err.kind === "gone")
    return notFound("stream expired");
  if (err.kind === "internal")
    return internalError();
  return badRequest(err.message);
}
function schemaMutationErrorResponse(err) {
  if (err.kind === "version_mismatch")
    return conflict(err.message);
  return badRequest(err.message);
}
function schemaReadErrorResponse(_err) {
  return internalError();
}
function conflict(msg, headers = {}) {
  return json(409, { error: { code: "conflict", message: msg } }, headers);
}
function tooLarge(msg) {
  return json(413, { error: { code: "payload_too_large", message: msg } });
}
function unavailable(msg = "server shutting down") {
  return json(503, { error: { code: "unavailable", message: msg } }, retryAfterHeaders(UNAVAILABLE_RETRY_AFTER_SECONDS));
}
function overloaded(msg = "ingest queue full", code = "overloaded") {
  return json(429, { error: { code, message: msg } }, retryAfterHeaders(OVERLOAD_RETRY_AFTER_SECONDS));
}
function requestTimeout(msg = "request timed out") {
  return json(408, { error: { code: "request_timeout", message: msg } });
}
function appendTimeout() {
  return json(408, {
    error: {
      code: "append_timeout",
      message: "append timed out; append outcome is unknown, check Stream-Next-Offset before retrying"
    }
  });
}
async function cancelRequestBody(req) {
  const body = req.body;
  if (!body)
    return;
  try {
    await body.cancel("request rejected");
    return;
  } catch {}
  try {
    const reader = body.getReader();
    await reader.cancel("request rejected");
  } catch {}
}
function normalizeContentType(value) {
  if (!value)
    return null;
  const base = value.split(";")[0]?.trim().toLowerCase();
  return base ? base : null;
}
function isRecord(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function isJsonContentType(value) {
  return normalizeContentType(value) === "application/json";
}
function isTextContentType(value) {
  const norm = normalizeContentType(value);
  return norm === "application/json" || norm != null && norm.startsWith("text/");
}
function parseStreamClosedHeader(value) {
  return value != null && value.trim().toLowerCase() === "true";
}
function parseStreamSeqHeader(value) {
  if (value == null)
    return Result41.ok(null);
  const v = value.trim();
  if (v.length === 0)
    return Result41.err({ message: "invalid Stream-Seq" });
  return Result41.ok(v);
}
function parseStreamTtlSeconds(value) {
  const s = value.trim();
  if (/^(0|[1-9][0-9]*)$/.test(s))
    return Result41.ok(Number(s));
  if (/^(0|[1-9][0-9]*)(ms|s|m|h|d)$/.test(s)) {
    const msRes = parseDurationMsResult(s);
    if (Result41.isError(msRes))
      return Result41.err({ message: msRes.error.message });
    const ms = msRes.value;
    if (ms % 1000 !== 0)
      return Result41.err({ message: "invalid Stream-TTL" });
    return Result41.ok(Math.floor(ms / 1000));
  }
  return Result41.err({ message: "invalid Stream-TTL" });
}
function parseNonNegativeInt(value) {
  if (!/^[0-9]+$/.test(value))
    return null;
  const n = Number(value);
  if (!Number.isFinite(n))
    return null;
  return n;
}
function splitSseLines(data) {
  if (data === "")
    return [""];
  return data.split(/\r\n|\r|\n/);
}
function encodeSseEvent(eventType, data) {
  const lines = splitSseLines(data);
  let out = `event: ${eventType}
`;
  for (const line of lines) {
    out += `data:${line}
`;
  }
  out += `
`;
  return out;
}
var INTERNAL_METRICS_STREAM2 = "__stream_metrics__";
function clearInternalMetricsAccelerationState(db) {
  db.deleteAccelerationState(INTERNAL_METRICS_STREAM2);
}
function reconcileDeletedStreamAccelerationState(db) {
  let offset = 0;
  const pageSize = 1000;
  for (;; ) {
    const streams = db.listDeletedStreams(pageSize, offset);
    for (const stream of streams) {
      db.deleteAccelerationState(stream);
    }
    if (streams.length < pageSize)
      break;
    offset += streams.length;
  }
}
function computeCursor(nowMs, provided) {
  let cursor = Math.floor(nowMs / 1000);
  if (provided && /^[0-9]+$/.test(provided)) {
    const n = Number(provided);
    if (Number.isFinite(n) && n >= cursor)
      cursor = n + 1;
  }
  return String(cursor);
}
function concatPayloads(parts) {
  return Buffer.concat(parts.map((part) => Buffer.from(part.buffer, part.byteOffset, part.byteLength)));
}
function bodyBufferFromBytes(bytes) {
  const buffer = bytes.buffer;
  if (bytes.byteOffset === 0 && bytes.byteLength === buffer.byteLength) {
    return buffer;
  }
  return buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}
var JSON_TEXT_DECODER2 = new TextDecoder;
var JSON_TEXT_ENCODER = new TextEncoder;
function keyBytesFromString(s) {
  if (s == null)
    return null;
  return JSON_TEXT_ENCODER.encode(s);
}
function extractRoutingKey(reg, value) {
  if (!reg.routingKey)
    return Result41.ok(null);
  const { jsonPointer, required } = reg.routingKey;
  const resolvedRes = resolvePointerResult(value, jsonPointer);
  if (Result41.isError(resolvedRes))
    return Result41.err({ message: resolvedRes.error.message });
  const resolved = resolvedRes.value;
  if (!resolved.exists) {
    if (required)
      return Result41.err({ message: "routing key missing" });
    return Result41.ok(null);
  }
  if (typeof resolved.value !== "string")
    return Result41.err({ message: "routing key must be string" });
  return Result41.ok(keyBytesFromString(resolved.value));
}
function timestampToIsoString(value) {
  return value == null ? null : new Date(Number(value)).toISOString();
}
function weakEtag(namespace, body) {
  const hash = createHash6("sha1").update(body).digest("hex");
  return `W/"${namespace}:${hash}"`;
}
function configuredExactIndexes(search) {
  if (!search)
    return [];
  return Object.entries(search.fields).filter(([, field]) => field.exact === true && field.kind !== "text").map(([name, field]) => ({
    name,
    kind: field.kind,
    configHash: hashSecondaryIndexField({ name, config: field })
  })).sort((a, b) => a.name.localeCompare(b.name));
}
function configuredSearchFamilies(search) {
  if (!search)
    return [];
  const out = [];
  const exactFields = Object.entries(search.fields).filter(([, field]) => field.exact === true && field.kind !== "text").map(([name]) => name).sort((a, b) => a.localeCompare(b));
  if (exactFields.length > 0)
    out.push({ family: "exact", fields: exactFields });
  const colFields = Object.entries(search.fields).filter(([, field]) => field.column === true).map(([name]) => name).sort((a, b) => a.localeCompare(b));
  if (colFields.length > 0)
    out.push({ family: "col", fields: colFields });
  const ftsFields = Object.entries(search.fields).filter(([, field]) => field.kind === "text" || field.kind === "keyword" && field.prefix === true).map(([name]) => name).sort((a, b) => a.localeCompare(b));
  if (ftsFields.length > 0)
    out.push({ family: "fts", fields: ftsFields });
  const aggRollups = Object.keys(search.rollups ?? {}).sort((a, b) => a.localeCompare(b));
  if (aggRollups.length > 0)
    out.push({ family: "agg", fields: aggRollups });
  if (search.profile === "metrics")
    out.push({ family: "mblk", fields: ["metrics"] });
  return out;
}
function parseCompanionSections(value) {
  try {
    const parsed = JSON.parse(value);
    return new Set(Array.isArray(parsed) ? parsed.filter((entry) => typeof entry === "string") : []);
  } catch {
    return new Set;
  }
}
function parseCompanionSectionSizes(value) {
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== "object")
      return {};
    const out = {};
    for (const [key, raw] of Object.entries(parsed)) {
      if (typeof raw === "number" && Number.isFinite(raw) && raw >= 0)
        out[key] = raw;
    }
    return out;
  } catch {
    return {};
  }
}
function contiguousCoveredSegmentCount(rows, family) {
  let expected = 0;
  for (const row of rows) {
    if (row.segment_index < expected)
      continue;
    if (row.segment_index > expected)
      break;
    if (!parseCompanionSections(row.sections_json).has(family))
      break;
    expected += 1;
  }
  return expected;
}
function reduceConcurrencyLimit(limit) {
  return Math.max(1, Math.ceil(Math.max(1, limit) / 2));
}
function gateSnapshot(configuredLimit, gate) {
  return {
    configured_limit: configuredLimit,
    current_limit: gate.getLimit(),
    active: gate.getActive(),
    queued: gate.getQueued()
  };
}
function createAppCore(cfg, opts) {
  mkdirSync2(cfg.rootDir, { recursive: true });
  cleanupTempSegments(cfg.rootDir);
  const db = new SqliteDurableStore(cfg.dbPath, { cacheBytes: cfg.sqliteCacheBytes });
  db.resetSegmentInProgress();
  reconcileDeletedStreamAccelerationState(db);
  const stats = opts.stats;
  const metrics = new Metrics;
  const backpressure = cfg.localBacklogMaxBytes > 0 ? new BackpressureGate(cfg.localBacklogMaxBytes, db.sumPendingBytes() + db.sumPendingSegmentBytes()) : undefined;
  const memorySampler = cfg.memorySamplerPath != null ? new RuntimeMemorySampler(cfg.memorySamplerPath, {
    intervalMs: cfg.memorySamplerIntervalMs,
    scope: "main"
  }) : undefined;
  memorySampler?.start();
  const ingestGate = new ConcurrencyGate(cfg.ingestConcurrency);
  const readGate = new ConcurrencyGate(cfg.readConcurrency);
  const searchGate = new ConcurrencyGate(cfg.searchConcurrency);
  const asyncIndexGate = new ConcurrencyGate(cfg.asyncIndexConcurrency);
  const foregroundActivity = new ForegroundActivityTracker;
  const memory = new MemoryPressureMonitor(cfg.memoryLimitBytes, {
    onSample: (rss, overLimit) => {
      metrics.record("process.rss.bytes", rss, "bytes");
      if (overLimit)
        metrics.record("process.rss.over_limit", 1, "count");
      searchGate.setLimit(overLimit ? reduceConcurrencyLimit(cfg.searchConcurrency) : cfg.searchConcurrency);
      asyncIndexGate.setLimit(overLimit ? reduceConcurrencyLimit(cfg.asyncIndexConcurrency) : cfg.asyncIndexConcurrency);
    },
    heapSnapshotPath: cfg.heapSnapshotPath ?? undefined
  });
  memory.start();
  let httpAppendGcBytesSinceLast = 0;
  let httpAppendGcLastMs = 0;
  const maybeCollectAfterHttpAppend = (bodyBytes) => {
    if (cfg.memoryLimitBytes <= 0 || bodyBytes <= 0)
      return;
    const limit = cfg.memoryLimitBytes;
    httpAppendGcBytesSinceLast += Math.max(0, Math.floor(bodyBytes));
    const usage = process.memoryUsage();
    const smallMemoryPreset = limit <= 1024 * 1024 * 1024;
    const byteCadence = smallMemoryPreset ? 8 * 1024 * 1024 : 64 * 1024 * 1024;
    const abovePressureBand = usage.rss > limit * 0.55 || usage.external > limit * 0.2 || usage.arrayBuffers > limit * 0.15;
    if (!abovePressureBand && httpAppendGcBytesSinceLast < byteCadence)
      return;
    const now = Date.now();
    if (now - httpAppendGcLastMs < 1000)
      return;
    const gc = globalThis.Bun?.gc;
    if (typeof gc !== "function")
      return;
    httpAppendGcLastMs = now;
    httpAppendGcBytesSinceLast = 0;
    try {
      gc(true);
    } catch {
      try {
        gc();
      } catch {
        return;
      }
    }
  };
  const appendResponseHeaders = (headers = {}) => {
    if (cfg.memoryLimitBytes > 0 && cfg.memoryLimitBytes <= 1024 * 1024 * 1024) {
      return withNosniff({
        ...headers,
        connection: "close"
      });
    }
    return withNosniff(headers);
  };
  const ingest = new IngestQueue(cfg, db, stats, backpressure, metrics);
  const notifier = new StreamNotifier;
  const registry = new SchemaRegistryStore(db);
  const profiles = new StreamProfileStore(db, registry);
  const touch = new TouchProcessorManager(cfg, db, ingest, notifier, profiles, backpressure);
  const runtime = opts.createRuntime({
    config: cfg,
    db,
    ingest,
    notifier,
    registry,
    profiles,
    touch,
    stats,
    backpressure,
    memory,
    asyncIndexGate,
    foregroundActivity,
    metrics,
    memorySampler
  });
  const { store, reader, segmenter, uploader, indexer, uploadSchemaRegistry, getRuntimeMemorySnapshot, getLocalStorageUsage } = runtime;
  const runtimeHighWater = {
    process: {},
    process_breakdown: {},
    sqlite: {},
    runtime_bytes: {},
    runtime_totals: {}
  };
  const observeHighWaterValue = (target, key, value, at) => {
    const next = Math.max(0, Math.floor(value));
    const existing = target[key];
    if (!existing || next > existing.value) {
      target[key] = {
        value: next,
        at
      };
    }
  };
  const buildRuntimeBytes = (runtimeMemory) => {
    const groups = {};
    for (const [kind, values] of Object.entries(runtimeMemory.subsystems)) {
      if (kind === "counts")
        continue;
      groups[kind] = values;
    }
    return groups;
  };
  const buildTopStreamContributors = (limit = 5) => {
    const safeLimit = Math.max(1, Math.min(limit, 20));
    const localStorageRows = [];
    const pendingWalRows = [];
    let offset = 0;
    const pageSize = 1000;
    for (;; ) {
      const rows = db.listStreams(pageSize, offset);
      if (rows.length === 0)
        break;
      for (const row of rows) {
        if (db.isDeleted(row))
          continue;
        const usage = getLocalStorageUsage?.(row.stream) ?? { segment_cache_bytes: 0 };
        const walRetainedBytes = Number(row.pending_bytes);
        const segmentCacheBytes = Math.max(0, Math.floor(Number(usage.segment_cache_bytes ?? 0)));
        const indexCacheBytes = Math.max(0, Math.floor(Number(usage.routing_index_cache_bytes ?? 0) + Number(usage.exact_index_cache_bytes ?? 0) + Number(usage.lexicon_index_cache_bytes ?? 0) + Number(usage.companion_cache_bytes ?? 0)));
        localStorageRows.push({
          stream: row.stream,
          bytes: Math.max(0, walRetainedBytes + segmentCacheBytes + indexCacheBytes),
          wal_retained_bytes: Math.max(0, walRetainedBytes),
          segment_cache_bytes: segmentCacheBytes,
          index_cache_bytes: indexCacheBytes
        });
        pendingWalRows.push({
          stream: row.stream,
          pending_wal_bytes: Math.max(0, walRetainedBytes),
          pending_rows: Math.max(0, Number(row.pending_rows))
        });
      }
      if (rows.length < pageSize)
        break;
      offset += rows.length;
    }
    localStorageRows.sort((a, b) => b.bytes - a.bytes || a.stream.localeCompare(b.stream));
    pendingWalRows.sort((a, b) => b.pending_wal_bytes - a.pending_wal_bytes || a.stream.localeCompare(b.stream));
    return {
      local_storage_bytes: localStorageRows.slice(0, safeLimit),
      pending_wal_bytes: pendingWalRows.slice(0, safeLimit),
      touch_journal_filter_bytes: touch.getTopStreams(safeLimit),
      notifier_waiters: notifier.getTopStreams(safeLimit)
    };
  };
  const buildRuntimeMemorySnapshot = () => {
    const processUsage = process.memoryUsage();
    const subsystemSnapshot = getRuntimeMemorySnapshot?.() ?? {
      subsystems: {
        heap_estimates: {},
        mapped_files: {},
        disk_caches: {},
        configured_budgets: {},
        pipeline_buffers: {},
        sqlite_runtime: {},
        counts: {}
      },
      totals: {
        heap_estimate_bytes: 0,
        mapped_file_bytes: 0,
        disk_cache_bytes: 0,
        configured_budget_bytes: 0,
        pipeline_buffer_bytes: 0,
        sqlite_runtime_bytes: 0
      }
    };
    const sqliteRuntimeBytes = subsystemSnapshot.subsystems.sqlite_runtime ?? {};
    const runtimeCounts = subsystemSnapshot.subsystems.counts ?? {};
    const snapshot = {
      process: {
        rss_bytes: processUsage.rss,
        heap_total_bytes: processUsage.heapTotal,
        heap_used_bytes: processUsage.heapUsed,
        external_bytes: processUsage.external,
        array_buffers_bytes: processUsage.arrayBuffers
      },
      process_breakdown: buildProcessMemoryBreakdown({
        process: {
          rss_bytes: processUsage.rss,
          heap_total_bytes: processUsage.heapTotal,
          heap_used_bytes: processUsage.heapUsed,
          external_bytes: processUsage.external,
          array_buffers_bytes: processUsage.arrayBuffers
        },
        mappedFileBytes: subsystemSnapshot.totals.mapped_file_bytes,
        sqliteRuntimeBytes: Number(sqliteRuntimeBytes["sqlite_memory_used_bytes"] ?? 0)
      }),
      sqlite: {
        available: Number(runtimeCounts["sqlite_open_connections"] ?? 0) > 0 || Number(sqliteRuntimeBytes["sqlite_memory_used_bytes"] ?? 0) > 0,
        source: Number(runtimeCounts["sqlite_open_connections"] ?? 0) > 0 || Number(sqliteRuntimeBytes["sqlite_memory_used_bytes"] ?? 0) > 0 ? "sqlite3_status64" : "unavailable",
        memory_used_bytes: Math.max(0, Math.floor(Number(sqliteRuntimeBytes["sqlite_memory_used_bytes"] ?? 0))),
        memory_highwater_bytes: Math.max(0, Math.floor(Number(sqliteRuntimeBytes["sqlite_memory_highwater_bytes"] ?? 0))),
        pagecache_used_slots: Math.max(0, Math.floor(Number(runtimeCounts["sqlite_pagecache_used_slots"] ?? 0))),
        pagecache_used_slots_highwater: Math.max(0, Math.floor(Number(runtimeCounts["sqlite_pagecache_used_slots_highwater"] ?? 0))),
        pagecache_overflow_bytes: Math.max(0, Math.floor(Number(sqliteRuntimeBytes["sqlite_pagecache_overflow_bytes"] ?? 0))),
        pagecache_overflow_highwater_bytes: Math.max(0, Math.floor(Number(sqliteRuntimeBytes["sqlite_pagecache_overflow_highwater_bytes"] ?? 0))),
        malloc_count: Math.max(0, Math.floor(Number(runtimeCounts["sqlite_malloc_count"] ?? 0))),
        malloc_count_highwater: Math.max(0, Math.floor(Number(runtimeCounts["sqlite_malloc_count_highwater"] ?? 0))),
        open_connections: Math.max(0, Math.floor(Number(runtimeCounts["sqlite_open_connections"] ?? 0))),
        prepared_statements: Math.max(0, Math.floor(Number(runtimeCounts["sqlite_prepared_statements"] ?? 0)))
      },
      gc: memory.getGcStats(),
      subsystems: subsystemSnapshot.subsystems,
      totals: subsystemSnapshot.totals
    };
    const ts = new Date().toISOString();
    for (const [key, value] of Object.entries(snapshot.process))
      observeHighWaterValue(runtimeHighWater.process, key, value, ts);
    for (const [key, value] of Object.entries(snapshot.process_breakdown)) {
      if (typeof value === "number")
        observeHighWaterValue(runtimeHighWater.process_breakdown, key, value, ts);
    }
    for (const [key, value] of Object.entries(snapshot.sqlite)) {
      if (typeof value === "number")
        observeHighWaterValue(runtimeHighWater.sqlite, key, value, ts);
    }
    for (const [kind, values] of Object.entries(buildRuntimeBytes(snapshot))) {
      const bucket = runtimeHighWater.runtime_bytes[kind] ??= {};
      for (const [key, value] of Object.entries(values))
        observeHighWaterValue(bucket, key, value, ts);
    }
    for (const [key, value] of Object.entries(snapshot.totals))
      observeHighWaterValue(runtimeHighWater.runtime_totals, key, value, ts);
    if (snapshot.sqlite.memory_used_bytes > 0)
      observeHighWaterValue(runtimeHighWater.sqlite, "memory_used_bytes", snapshot.sqlite.memory_used_bytes, ts);
    if (snapshot.sqlite.pagecache_overflow_bytes > 0)
      observeHighWaterValue(runtimeHighWater.sqlite, "pagecache_overflow_bytes", snapshot.sqlite.pagecache_overflow_bytes, ts);
    if (snapshot.sqlite.pagecache_used_slots > 0)
      observeHighWaterValue(runtimeHighWater.sqlite, "pagecache_used_slots", snapshot.sqlite.pagecache_used_slots, ts);
    if (snapshot.sqlite.malloc_count > 0)
      observeHighWaterValue(runtimeHighWater.sqlite, "malloc_count", snapshot.sqlite.malloc_count, ts);
    return snapshot;
  };
  const buildLeakCandidateCounters = () => {
    const runtimeMemory = buildRuntimeMemorySnapshot();
    const runtimeCounts = runtimeMemory.subsystems.counts ?? {};
    const countValue = (name) => {
      const raw = Number(runtimeCounts[name] ?? 0);
      if (!Number.isFinite(raw))
        return 0;
      return Math.max(0, Math.floor(raw));
    };
    const touchMemory = touch.getMemoryStats();
    const notifierMemory = notifier.getMemoryStats();
    const metricsMemory = metrics.getMemoryStats();
    return {
      "tieredstore.mem.leak_candidate.segment_cache.pinned_entries": countValue("segment_pinned_files"),
      "tieredstore.mem.leak_candidate.lexicon_file_cache.pinned_entries": countValue("lexicon_pinned_files"),
      "tieredstore.mem.leak_candidate.companion_file_cache.pinned_entries": countValue("companion_pinned_files"),
      "tieredstore.mem.leak_candidate.routing_run_disk_cache.pinned_entries": countValue("routing_run_disk_cache_pinned_entries"),
      "tieredstore.mem.leak_candidate.exact_run_disk_cache.pinned_entries": countValue("exact_run_disk_cache_pinned_entries"),
      "tieredstore.mem.leak_candidate.touch.journals.active_count": touchMemory.journals,
      "tieredstore.mem.leak_candidate.touch.journals.created_total": touchMemory.journalsCreatedTotal,
      "tieredstore.mem.leak_candidate.touch.journals.filter_bytes_total": touchMemory.journalFilterBytesTotal,
      "tieredstore.mem.leak_candidate.touch.journal.default_filter_bytes": DEFAULT_TOUCH_JOURNAL_FILTER_BYTES,
      "tieredstore.mem.leak_candidate.touch.maps.fine_lag_coarse_only_streams": touchMemory.fineLagCoarseOnlyStreams,
      "tieredstore.mem.leak_candidate.touch.maps.touch_mode_streams": touchMemory.touchModeStreams,
      "tieredstore.mem.leak_candidate.touch.maps.fine_token_bucket_streams": touchMemory.fineTokenBucketStreams,
      "tieredstore.mem.leak_candidate.touch.maps.hot_fine_streams": touchMemory.hotFineStreams,
      "tieredstore.mem.leak_candidate.touch.maps.lag_source_offset_streams": touchMemory.lagSourceOffsetStreams,
      "tieredstore.mem.leak_candidate.touch.maps.restricted_template_bucket_streams": touchMemory.restrictedTemplateBucketStreams,
      "tieredstore.mem.leak_candidate.touch.maps.runtime_totals_streams": touchMemory.runtimeTotalsStreams,
      "tieredstore.mem.leak_candidate.touch.maps.zero_row_backlog_streams": touchMemory.zeroRowBacklogStreakStreams,
      "tieredstore.mem.leak_candidate.live_template.last_seen_entries": touchMemory.templateLastSeenEntries,
      "tieredstore.mem.leak_candidate.live_template.dirty_last_seen_entries": touchMemory.templateDirtyLastSeenEntries,
      "tieredstore.mem.leak_candidate.live_template.rate_state_streams": touchMemory.templateRateStateStreams,
      "tieredstore.mem.leak_candidate.live_metrics.counter_streams": touchMemory.liveMetricsCounterStreams,
      "tieredstore.mem.leak_candidate.notifier.latest_seq_streams": notifierMemory.latestSeqStreams,
      "tieredstore.mem.leak_candidate.notifier.details_version_streams": notifierMemory.detailsVersionStreams,
      "tieredstore.mem.leak_candidate.metrics.series": metricsMemory.seriesCount,
      "tieredstore.mem.leak_candidate.secondary_index.stream_idle_ticks_streams": countValue("secondary_index_stream_idle_ticks"),
      "tieredstore.mem.leak_candidate.mock_r2.in_memory_bytes": countValue("mock_r2_in_memory_bytes"),
      "tieredstore.mem.leak_candidate.mock_r2.object_count": countValue("mock_r2_object_count")
    };
  };
  const buildServerMem = () => {
    const runtimeMemory = buildRuntimeMemorySnapshot();
    return {
      ts: new Date().toISOString(),
      process: runtimeMemory.process,
      process_breakdown: runtimeMemory.process_breakdown,
      sqlite: runtimeMemory.sqlite,
      gc: runtimeMemory.gc,
      high_water: runtimeHighWater,
      counters: buildLeakCandidateCounters(),
      runtime_counts: runtimeMemory.subsystems.counts,
      runtime_bytes: buildRuntimeBytes(runtimeMemory),
      runtime_totals: runtimeMemory.totals,
      top_streams: buildTopStreamContributors()
    };
  };
  memorySampler?.setSubsystemProvider(() => buildRuntimeMemorySnapshot().subsystems);
  const buildServerDetails = () => {
    const runtimeMemory = buildRuntimeMemorySnapshot();
    return {
      auto_tune: {
        enabled: cfg.autoTunePresetMb != null,
        requested_memory_mb: cfg.autoTuneRequestedMemoryMb,
        preset_mb: cfg.autoTunePresetMb,
        effective_memory_limit_mb: cfg.autoTuneEffectiveMemoryLimitMb
      },
      configured_limits: {
        caches: {
          sqlite_cache_bytes: cfg.sqliteCacheBytes,
          worker_sqlite_cache_bytes: cfg.workerSqliteCacheBytes,
          index_run_memory_cache_bytes: cfg.indexRunMemoryCacheBytes,
          index_run_disk_cache_bytes: cfg.indexRunCacheMaxBytes,
          lexicon_index_cache_bytes: cfg.lexiconIndexCacheMaxBytes,
          segment_cache_bytes: cfg.segmentCacheMaxBytes,
          companion_toc_cache_bytes: cfg.searchCompanionTocCacheBytes,
          companion_section_cache_bytes: cfg.searchCompanionSectionCacheBytes,
          companion_file_cache_bytes: cfg.searchCompanionFileCacheMaxBytes
        },
        concurrency: {
          ingest: cfg.ingestConcurrency,
          read: cfg.readConcurrency,
          search: cfg.searchConcurrency,
          async_index: cfg.asyncIndexConcurrency,
          upload: cfg.uploadConcurrency,
          index_build: cfg.indexBuildConcurrency,
          index_compact: cfg.indexCompactionConcurrency
        },
        ingest: {
          max_batch_requests: cfg.ingestMaxBatchRequests,
          max_batch_bytes: cfg.ingestMaxBatchBytes,
          max_queue_requests: cfg.ingestMaxQueueRequests,
          max_queue_bytes: cfg.ingestMaxQueueBytes,
          busy_timeout_ms: cfg.ingestBusyTimeoutMs,
          local_backlog_max_bytes: cfg.localBacklogMaxBytes
        },
        search: {
          companion_batch_segments: cfg.searchCompanionBuildBatchSegments,
          companion_yield_blocks: cfg.searchCompanionYieldBlocks,
          wal_overlay_quiet_period_ms: cfg.searchWalOverlayQuietPeriodMs,
          wal_overlay_max_bytes: cfg.searchWalOverlayMaxBytes
        },
        segmenting: {
          segment_max_bytes: cfg.segmentMaxBytes,
          segment_target_rows: cfg.segmentTargetRows,
          segmenter_workers: cfg.segmenterWorkers
        },
        timeouts: {
          append_request_timeout_ms: APPEND_REQUEST_TIMEOUT_MS,
          search_request_timeout_ms: SEARCH_REQUEST_TIMEOUT_MS,
          resolver_timeout_ms: HTTP_RESOLVER_TIMEOUT_MS,
          object_store_timeout_ms: cfg.objectStoreTimeoutMs
        },
        memory: {
          pressure_limit_bytes: cfg.memoryLimitBytes
        }
      },
      runtime: {
        memory: {
          pressure_active: memory.isOverLimit(),
          pressure_limit_bytes: memory.getLimitBytes(),
          last_rss_bytes: memory.getLastRssBytes(),
          max_rss_bytes: memory.getMaxRssBytes(),
          process: runtimeMemory.process,
          process_breakdown: runtimeMemory.process_breakdown,
          sqlite: runtimeMemory.sqlite,
          gc: runtimeMemory.gc,
          subsystems: runtimeMemory.subsystems,
          totals: runtimeMemory.totals,
          high_water: runtimeHighWater
        },
        ingest_queue: {
          requests: ingest.getQueueStats().requests,
          bytes: ingest.getQueueStats().bytes,
          full: ingest.isQueueFull()
        },
        local_backpressure: {
          enabled: backpressure?.enabled() ?? false,
          current_bytes: backpressure?.getCurrentBytes() ?? 0,
          max_bytes: backpressure?.getMaxBytes() ?? 0,
          over_limit: backpressure?.isOverLimit() ?? false
        },
        uploads: {
          pending_segments: uploader.countSegmentsWaiting()
        },
        concurrency: {
          ingest: gateSnapshot(cfg.ingestConcurrency, ingestGate),
          read: gateSnapshot(cfg.readConcurrency, readGate),
          search: gateSnapshot(cfg.searchConcurrency, searchGate),
          async_index: gateSnapshot(cfg.asyncIndexConcurrency, asyncIndexGate)
        },
        top_streams: buildTopStreamContributors()
      }
    };
  };
  const collectRuntimeMetrics = () => {
    const queue = ingest.getQueueStats();
    const emitGate = (name, configuredLimit, gate) => {
      metrics.record("tieredstore.concurrency.limit", configuredLimit, "count", { gate: name, kind: "configured" });
      metrics.record("tieredstore.concurrency.limit", gate.getLimit(), "count", { gate: name, kind: "effective" });
      metrics.record("tieredstore.concurrency.active", gate.getActive(), "count", { gate: name });
      metrics.record("tieredstore.concurrency.queued", gate.getQueued(), "count", { gate: name });
    };
    emitGate("ingest", cfg.ingestConcurrency, ingestGate);
    emitGate("read", cfg.readConcurrency, readGate);
    emitGate("search", cfg.searchConcurrency, searchGate);
    emitGate("async_index", cfg.asyncIndexConcurrency, asyncIndexGate);
    metrics.record("tieredstore.ingest.queue.capacity.requests", cfg.ingestMaxQueueRequests, "count");
    metrics.record("tieredstore.ingest.queue.capacity.bytes", cfg.ingestMaxQueueBytes, "bytes");
    metrics.record("tieredstore.upload.pending_segments", uploader.countSegmentsWaiting(), "count");
    metrics.record("tieredstore.upload.concurrency.limit", cfg.uploadConcurrency, "count");
    if (cfg.memoryLimitBytes > 0)
      metrics.record("process.memory.limit.bytes", cfg.memoryLimitBytes, "bytes");
    const lastRss = memory.getLastRssBytes();
    if (lastRss > 0)
      metrics.record("process.rss.current.bytes", lastRss, "bytes");
    const maxRss = memory.snapshotMaxRssBytes();
    if (maxRss > 0)
      metrics.record("process.rss.max_interval.bytes", maxRss, "bytes");
    const runtimeMemory = buildRuntimeMemorySnapshot();
    metrics.record("process.heap.total.bytes", runtimeMemory.process.heap_total_bytes, "bytes");
    metrics.record("process.heap.used.bytes", runtimeMemory.process.heap_used_bytes, "bytes");
    metrics.record("process.external.bytes", runtimeMemory.process.external_bytes, "bytes");
    metrics.record("process.array_buffers.bytes", runtimeMemory.process.array_buffers_bytes, "bytes");
    if (runtimeMemory.process_breakdown.rss_anon_bytes != null) {
      metrics.record("process.memory.rss.anon.bytes", runtimeMemory.process_breakdown.rss_anon_bytes, "bytes");
    }
    if (runtimeMemory.process_breakdown.rss_file_bytes != null) {
      metrics.record("process.memory.rss.file.bytes", runtimeMemory.process_breakdown.rss_file_bytes, "bytes");
    }
    if (runtimeMemory.process_breakdown.rss_shmem_bytes != null) {
      metrics.record("process.memory.rss.shmem.bytes", runtimeMemory.process_breakdown.rss_shmem_bytes, "bytes");
    }
    if (runtimeMemory.process_breakdown.unattributed_anon_bytes != null) {
      metrics.record("process.memory.unattributed_anon.bytes", runtimeMemory.process_breakdown.unattributed_anon_bytes, "bytes");
    }
    metrics.record("process.memory.js_managed.bytes", runtimeMemory.process_breakdown.js_managed_bytes, "bytes");
    metrics.record("process.memory.js_external_non_array_buffers.bytes", runtimeMemory.process_breakdown.js_external_non_array_buffers_bytes, "bytes");
    metrics.record("process.memory.unattributed.bytes", runtimeMemory.process_breakdown.unattributed_rss_bytes, "bytes");
    metrics.record("tieredstore.sqlite.memory.used.bytes", runtimeMemory.sqlite.memory_used_bytes, "bytes");
    metrics.record("tieredstore.sqlite.memory.high_water.bytes", runtimeMemory.sqlite.memory_highwater_bytes, "bytes");
    metrics.record("tieredstore.sqlite.pagecache.used", runtimeMemory.sqlite.pagecache_used_slots, "count");
    metrics.record("tieredstore.sqlite.pagecache.high_water", runtimeMemory.sqlite.pagecache_used_slots_highwater, "count");
    metrics.record("tieredstore.sqlite.pagecache.overflow.bytes", runtimeMemory.sqlite.pagecache_overflow_bytes, "bytes");
    metrics.record("tieredstore.sqlite.pagecache.overflow.high_water.bytes", runtimeMemory.sqlite.pagecache_overflow_highwater_bytes, "bytes");
    metrics.record("tieredstore.sqlite.malloc.count", runtimeMemory.sqlite.malloc_count, "count");
    metrics.record("tieredstore.sqlite.malloc.high_water.count", runtimeMemory.sqlite.malloc_count_highwater, "count");
    metrics.record("tieredstore.sqlite.open_connections", runtimeMemory.sqlite.open_connections, "count");
    metrics.record("tieredstore.sqlite.prepared_statements", runtimeMemory.sqlite.prepared_statements, "count");
    for (const [kind, values] of Object.entries(runtimeMemory.subsystems)) {
      if (kind === "counts")
        continue;
      for (const [subsystem, value] of Object.entries(values)) {
        metrics.record("tieredstore.memory.subsystem.bytes", value, "bytes", { kind, subsystem });
      }
    }
    for (const [subsystem, value] of Object.entries(runtimeMemory.subsystems.counts)) {
      metrics.record("tieredstore.memory.subsystem.count", value, "count", { subsystem });
    }
    metrics.record("tieredstore.memory.tracked.bytes", runtimeMemory.totals.heap_estimate_bytes, "bytes", { kind: "heap_estimate" });
    metrics.record("tieredstore.memory.tracked.bytes", runtimeMemory.totals.mapped_file_bytes, "bytes", { kind: "mapped_file" });
    metrics.record("tieredstore.memory.tracked.bytes", runtimeMemory.totals.disk_cache_bytes, "bytes", { kind: "disk_cache" });
    metrics.record("tieredstore.memory.tracked.bytes", runtimeMemory.totals.configured_budget_bytes, "bytes", { kind: "configured_budget" });
    metrics.record("tieredstore.memory.tracked.bytes", runtimeMemory.totals.pipeline_buffer_bytes, "bytes", { kind: "pipeline_buffer" });
    metrics.record("tieredstore.memory.tracked.bytes", runtimeMemory.totals.sqlite_runtime_bytes, "bytes", { kind: "sqlite_runtime" });
    const memLeakCounters = buildLeakCandidateCounters();
    for (const [metricName, value] of Object.entries(memLeakCounters)) {
      const unit = metricName.endsWith("_bytes") ? "bytes" : "count";
      metrics.record(metricName, value, unit);
    }
    metrics.record("process.gc.forced.count", runtimeMemory.gc.forced_gc_count, "count");
    metrics.record("process.gc.reclaimed.bytes", runtimeMemory.gc.forced_gc_reclaimed_bytes_total, "bytes", { kind: "total" });
    if (runtimeMemory.gc.last_forced_gc_reclaimed_bytes != null) {
      metrics.record("process.gc.reclaimed.bytes", runtimeMemory.gc.last_forced_gc_reclaimed_bytes, "bytes", { kind: "last" });
    }
    if (runtimeMemory.gc.last_forced_gc_at_ms != null) {
      metrics.record("process.gc.last_forced_at_ms", runtimeMemory.gc.last_forced_gc_at_ms, "count");
    }
    metrics.record("process.heap.snapshot.count", runtimeMemory.gc.heap_snapshots_written, "count");
    if (runtimeMemory.gc.last_heap_snapshot_at_ms != null) {
      metrics.record("process.heap.snapshot.last_at_ms", runtimeMemory.gc.last_heap_snapshot_at_ms, "count");
    }
    for (const [metricName, entry] of Object.entries(runtimeHighWater.process)) {
      metrics.record("process.memory.high_water.bytes", entry.value, "bytes", { metric: metricName });
    }
    for (const [metricName, entry] of Object.entries(runtimeHighWater.process_breakdown)) {
      metrics.record("process.memory.high_water.bytes", entry.value, "bytes", { metric: metricName });
    }
    for (const [metricName, entry] of Object.entries(runtimeHighWater.runtime_totals)) {
      metrics.record("tieredstore.memory.high_water.bytes", entry.value, "bytes", { kind: "runtime_total", metric: metricName });
    }
    for (const [kind, entries] of Object.entries(runtimeHighWater.runtime_bytes)) {
      for (const [metricName, entry] of Object.entries(entries)) {
        metrics.record("tieredstore.memory.high_water.bytes", entry.value, "bytes", {
          kind: "runtime_subsystem",
          subsystem_kind: kind,
          metric: metricName
        });
      }
    }
    for (const [metricName, entry] of Object.entries(runtimeHighWater.sqlite)) {
      const unit = metricName.includes("bytes") || metricName.includes("memory") || metricName.includes("overflow") ? "bytes" : "count";
      metrics.record("tieredstore.sqlite.high_water", entry.value, unit, { metric: metricName });
    }
    metrics.record("process.memory.pressure", memory.isOverLimit() ? 1 : 0, "count");
    if (backpressure) {
      metrics.record("tieredstore.backpressure.current.bytes", backpressure.getCurrentBytes(), "bytes");
      metrics.record("tieredstore.backpressure.limit.bytes", backpressure.getMaxBytes(), "bytes");
      metrics.record("tieredstore.backpressure.pressure", backpressure.isOverLimit() ? 1 : 0, "count");
    }
    if (cfg.autoTunePresetMb != null) {
      metrics.record("tieredstore.auto_tune.preset_mb", cfg.autoTunePresetMb, "count");
    }
    if (cfg.autoTuneEffectiveMemoryLimitMb != null) {
      metrics.record("tieredstore.auto_tune.effective_memory_limit_mb", cfg.autoTuneEffectiveMemoryLimitMb, "count");
    }
  };
  const metricsEmitter = new MetricsEmitter(metrics, ingest, cfg.metricsFlushIntervalMs, {
    onAppended: ({ lastOffset, stream }) => {
      notifier.notify(stream, lastOffset);
      notifier.notifyDetailsChanged(stream);
    },
    collectRuntimeMetrics
  });
  const expirySweeper = new ExpirySweeper(cfg, db);
  const streamSizeReconciler = new StreamSizeReconciler(db, store, runtime.segmentDiskCache, (stream) => notifier.notifyDetailsChanged(stream));
  const metricsStreamRow = db.ensureStream(INTERNAL_METRICS_STREAM2, { contentType: "application/json", profile: "metrics" });
  const metricsProfileRes = profiles.updateProfileResult(INTERNAL_METRICS_STREAM2, metricsStreamRow, { kind: "metrics" });
  if (Result41.isError(metricsProfileRes)) {
    throw dsError(`failed to initialize ${INTERNAL_METRICS_STREAM2} profile: ${metricsProfileRes.error.message}`);
  }
  clearInternalMetricsAccelerationState(db);
  runtime.start();
  if (metricsProfileRes.value.schemaRegistry) {
    (async () => {
      try {
        await uploadSchemaRegistry(INTERNAL_METRICS_STREAM2, metricsProfileRes.value.schemaRegistry);
        await uploader.publishManifest(INTERNAL_METRICS_STREAM2);
      } catch {}
    })();
  }
  metricsEmitter.start();
  expirySweeper.start();
  touch.start();
  streamSizeReconciler.start();
  const buildJsonRows = (stream, bodyBytes, routingKeyHeader, allowEmptyArray) => {
    const regRes = registry.getRegistryResult(stream);
    if (Result41.isError(regRes)) {
      return Result41.err({ status: 500, message: regRes.error.message });
    }
    const profileRes = profiles.getProfileResult(stream);
    if (Result41.isError(profileRes)) {
      return Result41.err({ status: 500, message: profileRes.error.message });
    }
    const reg = regRes.value;
    const jsonIngest = resolveJsonIngestCapability(profileRes.value);
    const text = JSON_TEXT_DECODER2.decode(bodyBytes);
    let arr;
    try {
      arr = JSON.parse(text);
    } catch {
      return Result41.err({ status: 400, message: "invalid JSON" });
    }
    if (!Array.isArray(arr))
      arr = [arr];
    if (arr.length === 0 && !allowEmptyArray)
      return Result41.err({ status: 400, message: "empty JSON array" });
    if (reg.routingKey && routingKeyHeader) {
      return Result41.err({ status: 400, message: "Stream-Key not allowed when routingKey is configured" });
    }
    const validator = reg.currentVersion > 0 ? registry.getValidatorForVersion(reg, reg.currentVersion) : null;
    if (reg.currentVersion > 0 && !validator) {
      return Result41.err({ status: 500, message: "schema validator missing" });
    }
    const rows = [];
    for (const v of arr) {
      let value = v;
      let profileRoutingKey = null;
      if (jsonIngest) {
        const preparedRes = jsonIngest.prepareRecordResult({ stream, profile: profileRes.value, value: v });
        if (Result41.isError(preparedRes))
          return Result41.err({ status: 400, message: preparedRes.error.message });
        value = preparedRes.value.value;
        profileRoutingKey = keyBytesFromString(preparedRes.value.routingKey);
      }
      if (validator && !validator(value)) {
        const msg = validator.errors ? validator.errors.map((e) => e.message).join("; ") : "schema validation failed";
        return Result41.err({ status: 400, message: msg });
      }
      const rkRes = reg.routingKey ? extractRoutingKey(reg, value) : Result41.ok(routingKeyHeader != null ? keyBytesFromString(routingKeyHeader) : profileRoutingKey);
      if (Result41.isError(rkRes))
        return Result41.err({ status: 400, message: rkRes.error.message });
      rows.push({
        routingKey: rkRes.value,
        contentType: "application/json",
        payload: JSON_TEXT_ENCODER.encode(JSON.stringify(value))
      });
    }
    return Result41.ok({ rows });
  };
  const buildPreparedJsonRows = (stream, records) => {
    const regRes = registry.getRegistryResult(stream);
    if (Result41.isError(regRes))
      return Result41.err({ status: 500, message: regRes.error.message });
    const reg = regRes.value;
    const validator = reg.currentVersion > 0 ? registry.getValidatorForVersion(reg, reg.currentVersion) : null;
    if (reg.currentVersion > 0 && !validator) {
      return Result41.err({ status: 500, message: "schema validator missing" });
    }
    const rows = [];
    for (const record of records) {
      if (validator && !validator(record.value)) {
        const msg = validator.errors ? validator.errors.map((e) => e.message).join("; ") : "schema validation failed";
        return Result41.err({ status: 400, message: msg });
      }
      rows.push({
        routingKey: keyBytesFromString(record.routingKey),
        contentType: "application/json",
        payload: JSON_TEXT_ENCODER.encode(JSON.stringify(record.value))
      });
    }
    return Result41.ok({ rows });
  };
  const buildAppendRowsResult = (stream, bodyBytes, contentType, routingKeyHeader, allowEmptyJsonArray) => {
    if (isJsonContentType(contentType)) {
      return buildJsonRows(stream, bodyBytes, routingKeyHeader, allowEmptyJsonArray);
    }
    const regRes = registry.getRegistryResult(stream);
    if (Result41.isError(regRes))
      return Result41.err({ status: 500, message: regRes.error.message });
    const reg = regRes.value;
    if (reg.currentVersion > 0)
      return Result41.err({ status: 400, message: "stream requires JSON" });
    return Result41.ok({
      rows: [
        {
          routingKey: keyBytesFromString(routingKeyHeader),
          contentType,
          payload: bodyBytes
        }
      ]
    });
  };
  const enqueueAppend = (args) => ingest.append({
    stream: args.stream,
    baseAppendMs: args.baseAppendMs,
    rows: args.rows,
    contentType: args.contentType,
    streamSeq: args.streamSeq,
    producer: args.producer,
    close: args.close
  });
  const awaitAppendWithTimeout = async (appendPromise) => {
    const appendResult = await awaitWithCooperativeTimeout(appendPromise, APPEND_REQUEST_TIMEOUT_MS);
    return appendResult === TIMEOUT_SENTINEL ? appendTimeout() : appendResult;
  };
  const recordAppendOutcome = (args) => {
    if (args.appendedRows > 0) {
      metrics.recordAppend(args.metricsBytes, args.appendedRows);
      notifier.notify(args.stream, args.lastOffset);
      notifier.notifyDetailsChanged(args.stream);
      touch.notify(args.stream);
    }
    if (stats) {
      if (args.touched)
        stats.recordStreamTouched(args.stream);
      if (args.appendedRows > 0)
        stats.recordIngested(args.ingestedBytes);
    }
    if (args.closed) {
      notifier.notifyDetailsChanged(args.stream);
      notifier.notifyClose(args.stream);
    }
  };
  const decodeJsonRecords = (stream, records) => {
    const values = [];
    for (const r of records) {
      const valueRes = decodeJsonPayloadResult(registry, stream, r.offset, r.payload);
      if (Result41.isError(valueRes))
        return valueRes;
      values.push(valueRes.value);
    }
    return Result41.ok({ values });
  };
  const encodeStoredJsonArrayResult = (stream, records) => {
    const regRes = registry.getRegistryResult(stream);
    if (Result41.isError(regRes))
      return Result41.err({ status: 500, message: regRes.error.message });
    if (regRes.value.currentVersion !== 0)
      return Result41.ok(null);
    const parts = [Buffer.from("[")];
    for (let i = 0;i < records.length; i++) {
      if (i > 0)
        parts.push(Buffer.from(","));
      const payload = records[i].payload;
      parts.push(Buffer.from(payload.buffer, payload.byteOffset, payload.byteLength));
    }
    parts.push(Buffer.from("]"));
    return Result41.ok(Buffer.concat(parts));
  };
  const buildStreamSummary = (stream, row, profile2) => {
    const observability = buildRequestObservabilityPairingDescriptor(stream, profile2);
    return {
      name: stream,
      content_type: normalizeContentType(row.content_type) ?? row.content_type,
      profile: profile2.kind,
      ...observability ? { observability } : {},
      created_at: timestampToIsoString(row.created_at_ms),
      updated_at: timestampToIsoString(row.updated_at_ms),
      expires_at: timestampToIsoString(row.expires_at_ms),
      ttl_seconds: row.ttl_seconds,
      stream_seq: row.stream_seq,
      closed: row.closed !== 0,
      epoch: row.epoch,
      next_offset: row.next_offset.toString(),
      sealed_through: row.sealed_through.toString(),
      uploaded_through: row.uploaded_through.toString(),
      segment_count: db.countSegmentsForStream(stream),
      uploaded_segment_count: db.countUploadedSegments(stream),
      pending_rows: row.pending_rows.toString(),
      pending_bytes: row.pending_bytes.toString(),
      total_size_bytes: row.logical_size_bytes.toString(),
      wal_rows: row.wal_rows.toString(),
      wal_bytes: row.wal_bytes.toString(),
      last_append_at: timestampToIsoString(row.last_append_ms),
      last_segment_cut_at: timestampToIsoString(row.last_segment_cut_ms)
    };
  };
  const buildIndexLagMs = (stream, headRow, coveredSegmentCount) => {
    if (coveredSegmentCount <= 0)
      return null;
    const coveredLastAppendMs = db.getSegmentLastAppendMsFromMeta(stream, coveredSegmentCount - 1);
    if (coveredLastAppendMs == null)
      return null;
    const lagMs = headRow.last_append_ms > coveredLastAppendMs ? headRow.last_append_ms - coveredLastAppendMs : 0n;
    return lagMs.toString();
  };
  const buildStorageBreakdown = (stream, row, currentCompanionRows, indexStatus) => {
    const manifest = db.getManifestRow(stream);
    const schemaRow = db.getSchemaRegistry(stream);
    const uploadedSegmentBytes = db.getUploadedSegmentBytes(stream);
    const pendingSealedSegmentBytes = db.getPendingSealedSegmentBytes(stream);
    const routingIndexStorage = db.getRoutingIndexStorage(stream);
    const routingLexiconStorage = db.getLexiconIndexStorage(stream).find((entry) => entry.source_kind === "routing_key" && entry.source_name === "") ?? { object_count: 0, bytes: 0n };
    const secondaryIndexStorage = new Map(db.getSecondaryIndexStorage(stream).map((entry) => [entry.index_name, entry]));
    const companionStorage = db.getBundledCompanionStorage(stream);
    const localStorageUsage = {
      segment_cache_bytes: 0,
      routing_index_cache_bytes: 0,
      exact_index_cache_bytes: 0,
      lexicon_index_cache_bytes: 0,
      companion_cache_bytes: 0,
      ...getLocalStorageUsage?.(stream) ?? {}
    };
    const sqliteSharedBytes = BigInt(db.getWalDbSizeBytes() + db.getMetaDbSizeBytes());
    const exactIndexBytes = indexStatus.exact_indexes.reduce((sum, entry) => sum + BigInt(entry.bytes_at_rest ?? 0), 0n);
    const familyBytes = new Map;
    for (const row2 of currentCompanionRows) {
      const sizes = parseCompanionSectionSizes(row2.section_sizes_json);
      for (const [kind, size] of Object.entries(sizes)) {
        familyBytes.set(kind, (familyBytes.get(kind) ?? 0n) + BigInt(size));
      }
    }
    return {
      object_storage: {
        total_bytes: (uploadedSegmentBytes + routingIndexStorage.bytes + routingLexiconStorage.bytes + exactIndexBytes + companionStorage.bytes + (manifest.last_uploaded_size_bytes ?? 0n) + (schemaRow?.uploaded_size_bytes ?? 0n)).toString(),
        segments_bytes: uploadedSegmentBytes.toString(),
        indexes_bytes: (routingIndexStorage.bytes + routingLexiconStorage.bytes + exactIndexBytes + companionStorage.bytes).toString(),
        manifest_and_meta_bytes: ((manifest.last_uploaded_size_bytes ?? 0n) + (schemaRow?.uploaded_size_bytes ?? 0n)).toString(),
        manifest_bytes: (manifest.last_uploaded_size_bytes ?? 0n).toString(),
        schema_registry_bytes: (schemaRow?.uploaded_size_bytes ?? 0n).toString(),
        segment_object_count: indexStatus.segments.uploaded_count,
        routing_index_object_count: routingIndexStorage.object_count,
        routing_lexicon_object_count: routingLexiconStorage.object_count,
        exact_index_object_count: indexStatus.exact_indexes.reduce((sum, entry) => sum + Number(entry.object_count ?? 0), 0),
        bundled_companion_object_count: companionStorage.object_count
      },
      local_storage: {
        total_bytes: (row.wal_bytes + pendingSealedSegmentBytes + BigInt(localStorageUsage.segment_cache_bytes) + BigInt(localStorageUsage.routing_index_cache_bytes) + BigInt(localStorageUsage.exact_index_cache_bytes) + BigInt(localStorageUsage.lexicon_index_cache_bytes) + BigInt(localStorageUsage.companion_cache_bytes)).toString(),
        wal_retained_bytes: row.wal_bytes.toString(),
        pending_tail_bytes: row.pending_bytes.toString(),
        pending_sealed_segment_bytes: pendingSealedSegmentBytes.toString(),
        segment_cache_bytes: String(localStorageUsage.segment_cache_bytes),
        routing_index_cache_bytes: String(localStorageUsage.routing_index_cache_bytes),
        exact_index_cache_bytes: String(localStorageUsage.exact_index_cache_bytes),
        lexicon_index_cache_bytes: String(localStorageUsage.lexicon_index_cache_bytes),
        companion_cache_bytes: String(localStorageUsage.companion_cache_bytes),
        sqlite_shared_total_bytes: sqliteSharedBytes.toString()
      },
      companion_families: {
        exact_bytes: String(familyBytes.get("exact") ?? 0n),
        col_bytes: String(familyBytes.get("col") ?? 0n),
        fts_bytes: String(familyBytes.get("fts") ?? 0n),
        agg_bytes: String(familyBytes.get("agg") ?? 0n),
        mblk_bytes: String(familyBytes.get("mblk") ?? 0n)
      }
    };
  };
  const buildObjectStoreRequestSummary = (stream) => {
    const summary = db.getObjectStoreRequestSummaryByHash(streamHash16Hex(stream));
    return {
      puts: summary.puts.toString(),
      reads: summary.reads.toString(),
      gets: summary.gets.toString(),
      heads: summary.heads.toString(),
      lists: summary.lists.toString(),
      deletes: summary.deletes.toString(),
      by_artifact: summary.by_artifact.map((entry) => ({
        artifact: entry.artifact,
        puts: entry.puts.toString(),
        gets: entry.gets.toString(),
        heads: entry.heads.toString(),
        lists: entry.lists.toString(),
        deletes: entry.deletes.toString(),
        reads: entry.reads.toString()
      }))
    };
  };
  const buildIndexStatus = (stream, row, reg, profileKind) => {
    const segmentCount = db.countSegmentsForStream(stream);
    const uploadedSegmentCount = db.countUploadedSegments(stream);
    const manifest = db.getManifestRow(stream);
    const routingState = db.getIndexState(stream);
    const routingRuns = db.listIndexRuns(stream);
    const retiredRoutingRuns = db.listRetiredIndexRuns(stream);
    const routingStorage = db.getRoutingIndexStorage(stream);
    const routingLexiconState = db.getLexiconIndexState(stream, "routing_key", "");
    const routingLexiconRuns = db.listLexiconIndexRuns(stream, "routing_key", "");
    const retiredRoutingLexiconRuns = db.listRetiredLexiconIndexRuns(stream, "routing_key", "");
    const routingLexiconStorage = db.getLexiconIndexStorage(stream).find((entry) => entry.source_kind === "routing_key" && entry.source_name === "") ?? { object_count: 0, bytes: 0n };
    const secondaryIndexStorage = new Map(db.getSecondaryIndexStorage(stream).map((entry) => [entry.index_name, entry]));
    const exactIndexes = configuredExactIndexes(reg.search).map(({ name, kind, configHash }) => {
      const state = db.getSecondaryIndexState(stream, name);
      const configMatches = state?.config_hash === configHash;
      const indexedSegmentCount = configMatches ? state?.indexed_through ?? 0 : 0;
      const storage = secondaryIndexStorage.get(name);
      return {
        name,
        kind,
        indexed_segment_count: indexedSegmentCount,
        lag_segments: Math.max(0, uploadedSegmentCount - indexedSegmentCount),
        lag_ms: buildIndexLagMs(stream, row, indexedSegmentCount),
        bytes_at_rest: String(storage?.bytes ?? 0n),
        object_count: storage?.object_count ?? 0,
        active_run_count: db.listSecondaryIndexRuns(stream, name).length,
        retired_run_count: db.listRetiredSecondaryIndexRuns(stream, name).length,
        fully_indexed_uploaded_segments: configMatches && indexedSegmentCount >= uploadedSegmentCount,
        stale_configuration: !configMatches,
        updated_at: timestampToIsoString(state?.updated_at_ms ?? null)
      };
    });
    const desiredCompanionPlan = buildDesiredSearchCompanionPlan(reg);
    const desiredCompanionHash = hashSearchCompanionPlan(desiredCompanionPlan);
    const companionPlanRow = db.getSearchCompanionPlan(stream);
    const desiredIndexPlanGeneration = Object.values(desiredCompanionPlan.families).some(Boolean) ? companionPlanRow ? companionPlanRow.plan_hash === desiredCompanionHash ? companionPlanRow.generation : companionPlanRow.generation + 1 : 1 : 0;
    const companionRows = db.listSearchSegmentCompanions(stream);
    const currentCompanionRows = companionRows.filter((row2) => row2.plan_generation === desiredIndexPlanGeneration);
    const currentCompanionBytes = currentCompanionRows.reduce((sum, entry) => sum + BigInt(entry.size_bytes), 0n);
    const searchFamilies = configuredSearchFamilies(reg.search).map(({ family, fields }) => {
      const coveredSegmentCount = currentCompanionRows.filter((row2) => parseCompanionSections(row2.sections_json).has(family)).length;
      const contiguousCoveredCount = contiguousCoveredSegmentCount(currentCompanionRows, family);
      let familyBytes = 0n;
      let familyObjectCount = 0;
      for (const row2 of currentCompanionRows) {
        const size = parseCompanionSectionSizes(row2.section_sizes_json)[family];
        if (size == null)
          continue;
        familyBytes += BigInt(size);
        familyObjectCount += 1;
      }
      return {
        family,
        fields,
        plan_generation: desiredIndexPlanGeneration,
        covered_segment_count: coveredSegmentCount,
        contiguous_covered_segment_count: contiguousCoveredCount,
        lag_segments: Math.max(0, uploadedSegmentCount - contiguousCoveredCount),
        lag_ms: buildIndexLagMs(stream, row, contiguousCoveredCount),
        bytes_at_rest: familyBytes.toString(),
        object_count: familyObjectCount,
        stale_segment_count: Math.max(0, uploadedSegmentCount - coveredSegmentCount),
        fully_indexed_uploaded_segments: coveredSegmentCount >= uploadedSegmentCount,
        updated_at: timestampToIsoString(companionPlanRow?.updated_at_ms ?? null)
      };
    });
    return {
      stream,
      profile: profileKind,
      desired_index_plan_generation: desiredIndexPlanGeneration,
      segments: {
        total_count: segmentCount,
        uploaded_count: uploadedSegmentCount
      },
      manifest: {
        generation: manifest.generation,
        uploaded_generation: manifest.uploaded_generation,
        last_uploaded_at: timestampToIsoString(manifest.last_uploaded_at_ms),
        last_uploaded_etag: manifest.last_uploaded_etag,
        last_uploaded_size_bytes: manifest.last_uploaded_size_bytes?.toString() ?? null
      },
      routing_key_index: {
        configured: reg.routingKey != null,
        indexed_segment_count: routingState?.indexed_through ?? 0,
        lag_segments: Math.max(0, uploadedSegmentCount - (routingState?.indexed_through ?? 0)),
        lag_ms: buildIndexLagMs(stream, row, routingState?.indexed_through ?? 0),
        bytes_at_rest: routingStorage.bytes.toString(),
        object_count: routingStorage.object_count,
        active_run_count: routingRuns.length,
        retired_run_count: retiredRoutingRuns.length,
        fully_indexed_uploaded_segments: reg.routingKey == null ? true : (routingState?.indexed_through ?? 0) >= uploadedSegmentCount,
        updated_at: timestampToIsoString(routingState?.updated_at_ms ?? null)
      },
      routing_key_lexicon: {
        configured: reg.routingKey != null,
        indexed_segment_count: routingLexiconState?.indexed_through ?? 0,
        lag_segments: Math.max(0, uploadedSegmentCount - (routingLexiconState?.indexed_through ?? 0)),
        lag_ms: buildIndexLagMs(stream, row, routingLexiconState?.indexed_through ?? 0),
        bytes_at_rest: routingLexiconStorage.bytes.toString(),
        object_count: routingLexiconStorage.object_count,
        active_run_count: routingLexiconRuns.length,
        retired_run_count: retiredRoutingLexiconRuns.length,
        fully_indexed_uploaded_segments: reg.routingKey == null ? true : (routingLexiconState?.indexed_through ?? 0) >= uploadedSegmentCount,
        updated_at: timestampToIsoString(routingLexiconState?.updated_at_ms ?? null)
      },
      exact_indexes: exactIndexes,
      bundled_companions: {
        object_count: currentCompanionRows.length,
        bytes_at_rest: currentCompanionBytes.toString(),
        fully_indexed_uploaded_segments: currentCompanionRows.length >= uploadedSegmentCount
      },
      search_families: searchFamilies,
      current_companion_rows: currentCompanionRows
    };
  };
  const buildDetailsSnapshotResult = (stream, mode) => {
    for (let attempt = 0;attempt < 3; attempt++) {
      const beforeVersion = notifier.currentDetailsVersion(stream);
      const srow = db.getStream(stream);
      if (!srow || db.isDeleted(srow))
        return Result41.err({ status: 404, message: "not_found" });
      if (srow.expires_at_ms != null && db.nowMs() > srow.expires_at_ms)
        return Result41.err({ status: 404, message: "stream expired" });
      const regRes = registry.getRegistryResult(stream);
      if (Result41.isError(regRes))
        return Result41.err({ status: 500, message: regRes.error.message });
      const profileRes = profiles.getProfileResourceResult(stream, srow);
      if (Result41.isError(profileRes))
        return Result41.err({ status: 500, message: profileRes.error.message });
      const profileKind = profileRes.value.profile.kind;
      const indexStatus = buildIndexStatus(stream, srow, regRes.value, profileKind);
      const storage = buildStorageBreakdown(stream, srow, indexStatus.current_companion_rows, indexStatus);
      const objectStoreRequests = buildObjectStoreRequestSummary(stream);
      delete indexStatus.current_companion_rows;
      const payload = mode === "index_status" ? indexStatus : {
        stream: buildStreamSummary(stream, srow, profileRes.value.profile),
        profile: profileRes.value,
        schema: regRes.value,
        index_status: indexStatus,
        storage,
        object_store_requests: objectStoreRequests
      };
      const body = JSON.stringify(payload);
      const afterVersion = notifier.currentDetailsVersion(stream);
      if (beforeVersion === afterVersion) {
        return Result41.ok({
          etag: weakEtag(mode, body),
          body,
          version: afterVersion
        });
      }
    }
    return Result41.err({ status: 500, message: "details changed too quickly" });
  };
  let closing = false;
  const fetch2 = async (req) => {
    if (closing) {
      return unavailable();
    }
    const requestAbortController = new AbortController;
    const abortFromClient = () => requestAbortController.abort(req.signal.reason);
    let timedOut = false;
    if (req.signal.aborted)
      requestAbortController.abort(req.signal.reason);
    else
      req.signal.addEventListener("abort", abortFromClient, { once: true });
    try {
      const runWithGate = async (gate, fn) => gate.run(fn, requestAbortController.signal);
      const runForeground = async (fn) => {
        const leaveForeground = foregroundActivity.enter();
        try {
          return await fn();
        } finally {
          leaveForeground();
        }
      };
      const runForegroundWithGate = async (gate, fn) => runForeground(() => runWithGate(gate, fn));
      const requestPromise = (async () => {
        let url;
        try {
          url = new URL(req.url, "http://localhost");
        } catch {
          return badRequest("invalid url");
        }
        const path = url.pathname;
        const handleOtlpTracesIngest = async (stream, autoCreate) => {
          if (req.method !== "POST")
            return badRequest("unsupported method");
          const contentType = req.headers.get("content-type");
          if (!contentType)
            return badRequest("missing content-type");
          const leaveAppendPhase = memorySampler?.enter("append", {
            route: "otlp_traces",
            stream,
            content_type: normalizeContentType(contentType) ?? contentType
          });
          try {
            return await runWithGate(ingestGate, async () => {
              let srow = db.getStream(stream);
              if (!srow && autoCreate) {
                srow = db.ensureStream(stream, { contentType: "application/json" });
                const profileRes2 = profiles.updateProfileResult(stream, srow, { kind: "otel-traces" });
                if (Result41.isError(profileRes2))
                  return badRequest(profileRes2.error.message);
                try {
                  if (profileRes2.value.schemaRegistry) {
                    await uploadSchemaRegistry(stream, profileRes2.value.schemaRegistry);
                  }
                  await uploader.publishManifest(stream);
                } catch {
                  return json(500, { error: { code: "internal", message: "profile upload failed" } });
                }
                indexer?.enqueue(stream);
                notifier.notifyDetailsChanged(stream);
                srow = db.getStream(stream);
              }
              if (!srow || db.isDeleted(srow))
                return notFound();
              if (srow.expires_at_ms != null && db.nowMs() > srow.expires_at_ms)
                return notFound("stream expired");
              const profileRes = profiles.getProfileResult(stream, srow);
              if (Result41.isError(profileRes))
                return internalError("invalid stream profile");
              const capability = resolveOtlpTracesCapability(profileRes.value);
              if (!capability)
                return badRequest("stream profile does not support OTLP traces");
              const ab = await req.arrayBuffer();
              if (ab.byteLength > cfg.appendMaxBodyBytes)
                return tooLarge(`body too large (max ${cfg.appendMaxBodyBytes})`);
              const bodyBytes = new Uint8Array(ab);
              const decodedRes = capability.decodeExportRequestResult({
                stream,
                profile: profileRes.value,
                contentType,
                contentEncoding: req.headers.get("content-encoding"),
                body: bodyBytes,
                maxDecodedBytes: cfg.appendMaxBodyBytes
              });
              if (Result41.isError(decodedRes)) {
                if (decodedRes.error.status === 415)
                  return unsupportedMediaType(decodedRes.error.message);
                if (decodedRes.error.status === 413)
                  return tooLarge(decodedRes.error.message);
                return badRequest(decodedRes.error.message);
              }
              const rowsRes = buildPreparedJsonRows(stream, decodedRes.value.records);
              if (Result41.isError(rowsRes)) {
                if (rowsRes.error.status === 500)
                  return internalError(rowsRes.error.message);
                return badRequest(rowsRes.error.message);
              }
              const rows = rowsRes.value.rows;
              let appendHeaders = {};
              if (rows.length > 0) {
                const appendResOrResponse = await awaitAppendWithTimeout(enqueueAppend({
                  stream,
                  baseAppendMs: db.nowMs(),
                  rows,
                  contentType: "application/json",
                  close: false
                }));
                if (appendResOrResponse instanceof Response)
                  return appendResOrResponse;
                const appendRes = appendResOrResponse;
                if (Result41.isError(appendRes)) {
                  if (appendRes.error.kind === "overloaded")
                    return overloaded();
                  if (appendRes.error.kind === "gone")
                    return notFound("stream expired");
                  if (appendRes.error.kind === "not_found")
                    return notFound();
                  if (appendRes.error.kind === "content_type_mismatch")
                    return conflict("content-type mismatch");
                  return json(500, { error: { code: "internal", message: "append failed" } });
                }
                const appendBytes = rows.reduce((acc, row) => acc + row.payload.byteLength, 0);
                recordAppendOutcome({
                  stream,
                  lastOffset: appendRes.value.lastOffset,
                  appendedRows: appendRes.value.appendedRows,
                  metricsBytes: appendBytes,
                  ingestedBytes: bodyBytes.byteLength,
                  touched: true,
                  closed: appendRes.value.closed
                });
                appendHeaders = {
                  "stream-next-offset": encodeOffset(srow.epoch, appendRes.value.lastOffset)
                };
              }
              const encoded = encodeOtlpTraceExportResponse(decodedRes.value);
              const responseBody = encoded.body instanceof Uint8Array ? bodyBufferFromBytes(encoded.body) : encoded.body;
              return new Response(responseBody, {
                status: 200,
                headers: withNosniff({
                  "content-type": encoded.contentType,
                  "cache-control": "no-store",
                  ...appendHeaders
                })
              });
            });
          } finally {
            leaveAppendPhase?.();
          }
        };
        const handleObserveRequest = async () => {
          if (req.method !== "POST")
            return badRequest("unsupported method");
          let body;
          try {
            body = await req.json();
          } catch {
            return badRequest("observe request must be valid JSON");
          }
          const requestRes = parseObserveRequestResult(body);
          if (Result41.isError(requestRes))
            return badRequest(requestRes.error.message);
          const observeReq = requestRes.value;
          const loadCorrelationCapability = (stream, role) => {
            const srow = db.getStream(stream);
            if (!srow || db.isDeleted(srow))
              return notFound();
            if (srow.expires_at_ms != null && db.nowMs() > srow.expires_at_ms)
              return notFound("stream expired");
            const profileRes = profiles.getProfileResult(stream, srow);
            if (Result41.isError(profileRes))
              return internalError("invalid stream profile");
            if (role === "events" && profileRes.value.kind !== "evlog") {
              return badRequest(`streams.events must reference an evlog stream; ${stream} has profile ${profileRes.value.kind}`);
            }
            if (role === "traces" && profileRes.value.kind !== "otel-traces") {
              return badRequest(`streams.traces must reference an otel-traces stream; ${stream} has profile ${profileRes.value.kind}`);
            }
            const capability = resolveCorrelationCapability(profileRes.value);
            if (!capability)
              return badRequest(`stream ${stream} profile does not support observability correlation`);
            const regRes = registry.getRegistryResult(stream);
            if (Result41.isError(regRes))
              return internalError(regRes.error.message);
            if (!regRes.value.search)
              return badRequest(`stream ${stream} does not have search configured`);
            return capability;
          };
          const eventCorrelation = observeReq.include.events && observeReq.streams.events ? loadCorrelationCapability(observeReq.streams.events, "events") : null;
          if (eventCorrelation instanceof Response)
            return eventCorrelation;
          const traceCorrelation = observeReq.include.trace && observeReq.streams.traces ? loadCorrelationCapability(observeReq.streams.traces, "traces") : null;
          if (traceCorrelation instanceof Response)
            return traceCorrelation;
          const runPagedSearch = async (stream, q, limit, sort) => {
            const regRes = registry.getRegistryResult(stream);
            if (Result41.isError(regRes))
              return internalError(regRes.error.message);
            const hits = [];
            const batches = [];
            const seenOffsets = new Set;
            let searchAfter = null;
            let limitReached = false;
            while (hits.length < limit) {
              const size = Math.min(500, limit - hits.length);
              const requestBody = {
                q,
                size,
                sort,
                timeout_ms: SEARCH_REQUEST_TIMEOUT_MS
              };
              if (searchAfter)
                requestBody.search_after = searchAfter;
              const parsedRes = parseSearchRequestBodyResult(regRes.value, requestBody);
              if (Result41.isError(parsedRes))
                return badRequest(parsedRes.error.message);
              const request = {
                ...parsedRes.value,
                timeoutMs: clampSearchRequestTimeoutMs(parsedRes.value.timeoutMs)
              };
              const searchRes = await runForegroundWithGate(searchGate, () => reader.searchResult({ stream, request }));
              if (Result41.isError(searchRes))
                return readerErrorResponse(searchRes.error);
              batches.push(searchRes.value);
              for (const hit of searchRes.value.hits) {
                if (seenOffsets.has(hit.offset))
                  continue;
                seenOffsets.add(hit.offset);
                hits.push(hit);
                if (hits.length >= limit)
                  break;
              }
              if (!searchRes.value.nextSearchAfter || searchRes.value.hits.length === 0)
                break;
              searchAfter = searchRes.value.nextSearchAfter;
              if (hits.length >= limit) {
                limitReached = true;
                break;
              }
            }
            return { hits, batches, limitReached, query: summarizeSearchQueryCoverage(q, batches, hits, limitReached) };
          };
          const timeClauses = buildTimeSearchClauses(observeReq.time);
          const lookupClause = (field, value) => `${field}:${quoteSearchValue(value)}`;
          const eventSort = ["timestamp:desc", "offset:desc"];
          const traceSort = ["timestamp:asc", "spanId:asc"];
          let eventHits = [];
          let eventBatches = [];
          const eventQueries = [];
          let eventLimitReached = false;
          let traceHits = [];
          let traceBatches = [];
          const traceQueries = [];
          let traceLimitReached = false;
          const candidateTraceIds = new Set;
          const addTraceIdsFromHits = (hits) => {
            for (const hit of hits) {
              if (!isRecord(hit.source))
                continue;
              const traceId = typeof hit.source.traceId === "string" ? hit.source.traceId : null;
              if (traceId)
                candidateTraceIds.add(traceId);
            }
          };
          const appendSearch = (target, result) => {
            const stream = result.batches[0]?.stream ?? "";
            if (target === "events") {
              const seen = new Set(eventHits.map((hit) => `${hit.stream ?? ""}\x00${hit.offset}`));
              for (const hit of result.hits) {
                const key = `${stream}\x00${hit.offset}`;
                if (seen.has(key))
                  continue;
                seen.add(key);
                eventHits.push({ ...hit, stream });
              }
              eventBatches.push(...result.batches);
              eventQueries.push(result.query);
              eventLimitReached = eventLimitReached || result.limitReached || eventHits.length >= observeReq.limits.events && !!result.batches.at(-1)?.nextSearchAfter;
            } else {
              const seen = new Set(traceHits.map((hit) => `${hit.stream ?? ""}\x00${hit.offset}`));
              for (const hit of result.hits) {
                const key = `${stream}\x00${hit.offset}`;
                if (seen.has(key))
                  continue;
                seen.add(key);
                traceHits.push({ ...hit, stream });
              }
              traceBatches.push(...result.batches);
              traceQueries.push(result.query);
              traceLimitReached = traceLimitReached || result.limitReached || traceHits.length >= observeReq.limits.spans && !!result.batches.at(-1)?.nextSearchAfter;
            }
          };
          const searchEvents = async (field, value) => {
            if (!observeReq.include.events || !observeReq.streams.events)
              return null;
            if (eventHits.length >= observeReq.limits.events)
              return null;
            const q = combineSearchClauses(lookupClause(field, value), ...timeClauses);
            const result = await runPagedSearch(observeReq.streams.events, q, observeReq.limits.events - eventHits.length, eventSort);
            if (result instanceof Response)
              return result;
            appendSearch("events", result);
            addTraceIdsFromHits(result.hits);
            return null;
          };
          const searchTraces = async (field, value) => {
            if (!observeReq.include.trace || !observeReq.streams.traces)
              return null;
            if (traceHits.length >= observeReq.limits.spans)
              return null;
            const q = combineSearchClauses(lookupClause(field, value), ...timeClauses);
            const result = await runPagedSearch(observeReq.streams.traces, q, observeReq.limits.spans - traceHits.length, traceSort);
            if (result instanceof Response)
              return result;
            appendSearch("traces", result);
            addTraceIdsFromHits(result.hits);
            return null;
          };
          if (observeReq.lookup.requestId) {
            const eventResponse = await searchEvents("req", observeReq.lookup.requestId);
            if (eventResponse)
              return eventResponse;
            if (candidateTraceIds.size > 0) {
              for (const traceId of candidateTraceIds) {
                const traceResponse = await searchTraces("trace", traceId);
                if (traceResponse)
                  return traceResponse;
              }
            } else {
              const traceResponse = await searchTraces("req", observeReq.lookup.requestId);
              if (traceResponse)
                return traceResponse;
            }
          } else if (observeReq.lookup.traceId) {
            candidateTraceIds.add(observeReq.lookup.traceId);
            const traceResponse = await searchTraces("trace", observeReq.lookup.traceId);
            if (traceResponse)
              return traceResponse;
            const eventResponse = await searchEvents("trace", observeReq.lookup.traceId);
            if (eventResponse)
              return eventResponse;
          } else if (observeReq.lookup.spanId) {
            const traceResponse = await searchTraces("span", observeReq.lookup.spanId);
            if (traceResponse)
              return traceResponse;
            if (candidateTraceIds.size > 0) {
              for (const traceId of Array.from(candidateTraceIds)) {
                const fullTraceResponse = await searchTraces("trace", traceId);
                if (fullTraceResponse)
                  return fullTraceResponse;
                const eventResponse = await searchEvents("trace", traceId);
                if (eventResponse)
                  return eventResponse;
              }
            } else {
              const eventResponse = await searchEvents("span", observeReq.lookup.spanId);
              if (eventResponse)
                return eventResponse;
            }
          }
          const eventCoverage = summarizeSearchCoverage(eventBatches, eventHits, eventLimitReached, eventQueries);
          const traceCoverage = summarizeSearchCoverage(traceBatches, traceHits, traceLimitReached, traceQueries);
          const trace = buildTraceDetails(traceHits.map((hit) => hit.source), { spanLimitReached: traceCoverage.limit_reached, coverageComplete: traceCoverage.complete });
          const primaryEventHit = choosePrimaryEvent(eventHits, trace.traceId ?? observeReq.lookup.traceId);
          const primaryEvent = primaryEventHit && isRecord(primaryEventHit.source) ? primaryEventHit.source : null;
          const timeline = [];
          if (observeReq.include.timeline) {
            const items = [];
            if (eventCorrelation && observeReq.streams.events) {
              for (const hit of eventHits) {
                items.push(...eventCorrelation.toTimelineItems({ stream: observeReq.streams.events, offset: hit.offset, record: hit.source }));
              }
            }
            if (traceCorrelation && observeReq.streams.traces) {
              for (const hit of traceHits) {
                items.push(...traceCorrelation.toTimelineItems({ stream: observeReq.streams.traces, offset: hit.offset, record: hit.source }));
              }
            }
            timeline.push(...sortTimeline(items));
          }
          const responsePrimaryEvent = observeReq.include.raw ? primaryEvent : compactEvlogRecord(primaryEvent);
          const responseEventMatches = eventHits.map((hit) => ({
            offset: hit.offset,
            source: observeReq.include.raw ? hit.source : compactEvlogRecord(hit.source)
          }));
          const responseTraceSpans = observeReq.include.raw ? trace.spans : trace.spans.map((span) => compactTraceSpanRecord(span));
          const responseTimeline = observeReq.include.raw ? timeline : timeline.map((item) => compactTimelineItem(item));
          const warnings = [];
          if (observeReq.include.trace && traceHits.length === 0)
            warnings.push("no trace spans found");
          if (observeReq.include.events && eventHits.length === 0)
            warnings.push("no evlog events found");
          if (eventCoverage.limit_reached)
            warnings.push("event limit reached");
          if (traceCoverage.limit_reached)
            warnings.push("span limit reached");
          if (!eventCoverage.complete && eventCoverage.searched)
            warnings.push("event search coverage incomplete");
          if (!traceCoverage.complete && traceCoverage.searched)
            warnings.push("trace search coverage incomplete");
          if (trace.missingParents.length > 0)
            warnings.push("trace has missing parent spans");
          return json(200, {
            lookup: {
              requestId: observeReq.lookup.requestId ?? (primaryEvent && typeof primaryEvent.requestId === "string" ? primaryEvent.requestId : null) ?? null,
              traceId: observeReq.lookup.traceId ?? trace.traceId,
              spanId: observeReq.lookup.spanId
            },
            summary: buildObserveSummary({ lookup: observeReq.lookup, primaryEvent, trace }),
            evlog: observeReq.include.events ? {
              stream: observeReq.streams.events ?? null,
              primary: responsePrimaryEvent,
              matches: responseEventMatches
            } : null,
            trace: observeReq.include.trace ? {
              stream: observeReq.streams.traces ?? null,
              traceId: trace.traceId,
              rootSpanId: trace.rootSpanId,
              spans: responseTraceSpans,
              tree: trace.tree,
              serviceMap: trace.serviceMap,
              criticalPath: trace.criticalPath,
              errors: trace.errors,
              partial: trace.partial,
              missingParents: trace.missingParents,
              duplicateSpans: trace.duplicateSpans
            } : null,
            timeline: responseTimeline,
            coverage: {
              events: eventCoverage,
              traces: traceCoverage,
              warnings
            }
          });
        };
        if (path === "/health") {
          return json(200, { ok: true });
        }
        if (path === "/metrics") {
          return json(200, metrics.snapshot());
        }
        if (req.method === "GET" && path === "/v1/server/_details") {
          return json(200, buildServerDetails());
        }
        if (req.method === "GET" && path === "/v1/server/_mem") {
          return json(200, buildServerMem());
        }
        if (path === "/v1/traces") {
          const stream = cfg.otlpTracesStream;
          if (!stream)
            return badRequest("DS_OTLP_TRACES_STREAM is not configured");
          return handleOtlpTracesIngest(stream, cfg.otlpAutoCreate);
        }
        if (path === "/v1/observe/request") {
          return handleObserveRequest();
        }
        if (req.method === "GET" && path === "/v1/streams") {
          const limit = Number(url.searchParams.get("limit") ?? "100");
          const offset = Number(url.searchParams.get("offset") ?? "0");
          const rows = db.listStreams(Math.max(0, Math.min(limit, 1000)), Math.max(0, offset));
          const out = [];
          for (const r of rows) {
            const profileRes = profiles.getProfileResult(r.stream, r);
            if (Result41.isError(profileRes))
              return internalError("invalid stream profile");
            const profile2 = profileRes.value;
            const observability = buildRequestObservabilityPairingDescriptor(r.stream, profile2);
            out.push({
              name: r.stream,
              created_at: new Date(Number(r.created_at_ms)).toISOString(),
              expires_at: r.expires_at_ms == null ? null : new Date(Number(r.expires_at_ms)).toISOString(),
              epoch: r.epoch,
              next_offset: r.next_offset.toString(),
              sealed_through: r.sealed_through.toString(),
              uploaded_through: r.uploaded_through.toString(),
              profile: profile2.kind,
              ...observability ? { observability } : {}
            });
          }
          return json(200, out);
        }
        const streamPrefix = "/v1/stream/";
        if (path.startsWith(streamPrefix)) {
          const rawRest = path.slice(streamPrefix.length);
          const rest = rawRest.replace(/\/+$/, "");
          if (rest.length === 0)
            return badRequest("missing stream name");
          const segments = rest.split("/");
          let isSchema = false;
          let isProfile = false;
          let isSearch = false;
          let isAggregate = false;
          let isDetails = false;
          let isIndexStatus = false;
          let isRoutingKeys = false;
          let isOtlpTraces = false;
          let pathKeyParam = null;
          let touchMode = null;
          if (segments.length >= 3 && segments[segments.length - 3] === "_otlp" && segments[segments.length - 2] === "v1" && segments[segments.length - 1] === "traces") {
            isOtlpTraces = true;
            segments.splice(segments.length - 3, 3);
          } else if (segments[segments.length - 1] === "_schema") {
            isSchema = true;
            segments.pop();
          } else if (segments[segments.length - 1] === "_profile") {
            isProfile = true;
            segments.pop();
          } else if (segments[segments.length - 1] === "_search") {
            isSearch = true;
            segments.pop();
          } else if (segments[segments.length - 1] === "_aggregate") {
            isAggregate = true;
            segments.pop();
          } else if (segments[segments.length - 1] === "_details") {
            isDetails = true;
            segments.pop();
          } else if (segments[segments.length - 1] === "_index_status") {
            isIndexStatus = true;
            segments.pop();
          } else if (segments[segments.length - 1] === "_routing_keys") {
            isRoutingKeys = true;
            segments.pop();
          } else if (segments.length >= 3 && segments[segments.length - 3] === "touch" && segments[segments.length - 2] === "templates" && segments[segments.length - 1] === "activate") {
            touchMode = { kind: "templates_activate" };
            segments.splice(segments.length - 3, 3);
          } else if (segments.length >= 2 && segments[segments.length - 2] === "touch" && segments[segments.length - 1] === "meta") {
            touchMode = { kind: "meta" };
            segments.splice(segments.length - 2, 2);
          } else if (segments.length >= 2 && segments[segments.length - 2] === "touch" && segments[segments.length - 1] === "wait") {
            touchMode = { kind: "wait" };
            segments.splice(segments.length - 2, 2);
          } else if (segments.length >= 2 && segments[segments.length - 2] === "pk") {
            pathKeyParam = decodeURIComponent(segments[segments.length - 1]);
            segments.splice(segments.length - 2, 2);
          }
          const streamPart = segments.join("/");
          if (streamPart.length === 0)
            return badRequest("missing stream name");
          const stream = decodeURIComponent(streamPart);
          if (isOtlpTraces) {
            return handleOtlpTracesIngest(stream, false);
          }
          if (isSchema) {
            const srow = db.getStream(stream);
            if (!srow || db.isDeleted(srow))
              return notFound();
            if (srow.expires_at_ms != null && db.nowMs() > srow.expires_at_ms)
              return notFound("stream expired");
            if (req.method === "GET") {
              const regRes = registry.getRegistryResult(stream);
              if (Result41.isError(regRes))
                return schemaReadErrorResponse(regRes.error);
              return json(200, regRes.value);
            }
            if (req.method === "POST") {
              let body;
              try {
                body = await req.json();
              } catch {
                return badRequest("schema update must be valid JSON");
              }
              const updateRes = parseSchemaUpdateResult(body);
              if (Result41.isError(updateRes))
                return badRequest(updateRes.error.message);
              const update = updateRes.value;
              if (update.schema === undefined && update.routingKey !== undefined && update.search === undefined) {
                const regRes2 = registry.updateRoutingKeyResult(stream, update.routingKey ?? null);
                if (Result41.isError(regRes2))
                  return schemaMutationErrorResponse(regRes2.error);
                try {
                  await uploadSchemaRegistry(stream, regRes2.value);
                } catch {
                  return json(500, { error: { code: "internal", message: "schema upload failed" } });
                }
                indexer?.enqueue(stream);
                notifier.notifyDetailsChanged(stream);
                return json(200, regRes2.value);
              }
              if (update.schema === undefined && update.search !== undefined && update.routingKey === undefined) {
                const regRes2 = registry.updateSearchResult(stream, update.search ?? null);
                if (Result41.isError(regRes2))
                  return schemaMutationErrorResponse(regRes2.error);
                try {
                  await uploadSchemaRegistry(stream, regRes2.value);
                } catch {
                  return json(500, { error: { code: "internal", message: "schema upload failed" } });
                }
                indexer?.enqueue(stream);
                notifier.notifyDetailsChanged(stream);
                return json(200, regRes2.value);
              }
              const regRes = registry.updateRegistryResult(stream, srow, {
                schema: update.schema,
                lens: update.lens,
                routingKey: update.routingKey ?? undefined,
                search: update.search
              });
              if (Result41.isError(regRes))
                return schemaMutationErrorResponse(regRes.error);
              try {
                await uploadSchemaRegistry(stream, regRes.value);
              } catch {
                return json(500, { error: { code: "internal", message: "schema upload failed" } });
              }
              indexer?.enqueue(stream);
              notifier.notifyDetailsChanged(stream);
              return json(200, regRes.value);
            }
            return badRequest("unsupported method");
          }
          if (isProfile) {
            const srow = db.getStream(stream);
            if (!srow || db.isDeleted(srow))
              return notFound();
            if (srow.expires_at_ms != null && db.nowMs() > srow.expires_at_ms)
              return notFound("stream expired");
            if (req.method === "GET") {
              const profileRes = profiles.getProfileResourceResult(stream, srow);
              if (Result41.isError(profileRes))
                return internalError("invalid stream profile");
              return json(200, profileRes.value);
            }
            if (req.method === "POST") {
              let body;
              try {
                body = await req.json();
              } catch {
                return badRequest("profile update must be valid JSON");
              }
              const nextProfileRes = parseProfileUpdateResult(body);
              if (Result41.isError(nextProfileRes))
                return badRequest(nextProfileRes.error.message);
              const profileRes = profiles.updateProfileResult(stream, srow, nextProfileRes.value);
              if (Result41.isError(profileRes))
                return badRequest(profileRes.error.message);
              try {
                if (profileRes.value.schemaRegistry) {
                  await uploadSchemaRegistry(stream, profileRes.value.schemaRegistry);
                }
                await uploader.publishManifest(stream);
              } catch {
                return json(500, { error: { code: "internal", message: "profile upload failed" } });
              }
              indexer?.enqueue(stream);
              notifier.notifyDetailsChanged(stream);
              return json(200, profileRes.value.resource);
            }
            return badRequest("unsupported method");
          }
          if (isDetails || isIndexStatus) {
            if (req.method !== "GET")
              return badRequest("unsupported method");
            const liveParam = url.searchParams.get("live") ?? "";
            let longPoll = false;
            if (liveParam === "" || liveParam === "false" || liveParam === "0")
              longPoll = false;
            else if (liveParam === "long-poll" || liveParam === "true" || liveParam === "1")
              longPoll = true;
            else
              return badRequest("invalid live mode");
            const timeout = url.searchParams.get("timeout") ?? url.searchParams.get("timeout_ms");
            let timeoutMs = null;
            if (timeout) {
              if (/^[0-9]+$/.test(timeout)) {
                timeoutMs = Number(timeout);
              } else {
                const timeoutRes = parseDurationMsResult(timeout);
                if (Result41.isError(timeoutRes))
                  return badRequest("invalid timeout");
                timeoutMs = timeoutRes.value;
              }
            }
            const loadSnapshot = () => {
              const snapshotRes = buildDetailsSnapshotResult(stream, isIndexStatus ? "index_status" : "details");
              if (Result41.isError(snapshotRes)) {
                if (snapshotRes.error.status === 404) {
                  return snapshotRes.error.message === "stream expired" ? notFound("stream expired") : notFound();
                }
                return internalError(snapshotRes.error.message);
              }
              return snapshotRes.value;
            };
            let snapshotOrResponse = loadSnapshot();
            if (snapshotOrResponse instanceof Response)
              return snapshotOrResponse;
            let snapshot = snapshotOrResponse;
            const ifNoneMatch = req.headers.get("if-none-match");
            if (!longPoll) {
              if (ifNoneMatch && ifNoneMatch === snapshot.etag) {
                return new Response(null, {
                  status: 304,
                  headers: withNosniff({ "cache-control": "no-store", etag: snapshot.etag })
                });
              }
              return new Response(snapshot.body, {
                status: 200,
                headers: withNosniff({
                  "content-type": "application/json; charset=utf-8",
                  "cache-control": "no-store",
                  etag: snapshot.etag
                })
              });
            }
            if (!ifNoneMatch || ifNoneMatch !== snapshot.etag) {
              return new Response(snapshot.body, {
                status: 200,
                headers: withNosniff({
                  "content-type": "application/json; charset=utf-8",
                  "cache-control": "no-store",
                  etag: snapshot.etag
                })
              });
            }
            const deadline = Date.now() + (timeoutMs ?? 3000);
            while (ifNoneMatch === snapshot.etag) {
              const remaining = deadline - Date.now();
              if (remaining <= 0) {
                return new Response(null, {
                  status: 304,
                  headers: withNosniff({ "cache-control": "no-store", etag: snapshot.etag })
                });
              }
              await notifier.waitForDetailsChange(stream, snapshot.version, remaining, req.signal);
              if (req.signal.aborted)
                return new Response(null, { status: 204 });
              snapshotOrResponse = loadSnapshot();
              if (snapshotOrResponse instanceof Response)
                return snapshotOrResponse;
              snapshot = snapshotOrResponse;
            }
            return new Response(snapshot.body, {
              status: 200,
              headers: withNosniff({
                "content-type": "application/json; charset=utf-8",
                "cache-control": "no-store",
                etag: snapshot.etag
              })
            });
          }
          if (isRoutingKeys) {
            const srow = db.getStream(stream);
            if (!srow || db.isDeleted(srow))
              return notFound();
            if (srow.expires_at_ms != null && db.nowMs() > srow.expires_at_ms)
              return notFound("stream expired");
            if (req.method !== "GET")
              return badRequest("unsupported method");
            const regRes = registry.getRegistryResult(stream);
            if (Result41.isError(regRes))
              return internalError();
            if (regRes.value.routingKey == null)
              return badRequest("routing key not configured");
            const limitRaw = url.searchParams.get("limit");
            const limit = limitRaw == null ? 100 : Number(limitRaw);
            if (!Number.isFinite(limit) || limit <= 0 || !Number.isInteger(limit) || limit > 500)
              return badRequest("invalid limit");
            const after = url.searchParams.get("after");
            const listRes = indexer?.listRoutingKeysResult ? await runForeground(() => indexer.listRoutingKeysResult(stream, after, limit)) : Result41.err({ kind: "invalid_lexicon_index", message: "routing key lexicon unavailable" });
            if (Result41.isError(listRes))
              return internalError(listRes.error.message);
            return json(200, {
              stream,
              source: {
                kind: "routing_key",
                name: ""
              },
              took_ms: listRes.value.tookMs,
              coverage: {
                complete: listRes.value.coverage.complete,
                indexed_segments: listRes.value.coverage.indexedSegments,
                scanned_uploaded_segments: listRes.value.coverage.scannedUploadedSegments,
                scanned_local_segments: listRes.value.coverage.scannedLocalSegments,
                scanned_wal_rows: listRes.value.coverage.scannedWalRows,
                possible_missing_uploaded_segments: listRes.value.coverage.possibleMissingUploadedSegments,
                possible_missing_local_segments: listRes.value.coverage.possibleMissingLocalSegments
              },
              timing: {
                lexicon_run_get_ms: listRes.value.timing.lexiconRunGetMs,
                lexicon_decode_ms: listRes.value.timing.lexiconDecodeMs,
                lexicon_enumerate_ms: listRes.value.timing.lexiconEnumerateMs,
                lexicon_merge_ms: listRes.value.timing.lexiconMergeMs,
                fallback_scan_ms: listRes.value.timing.fallbackScanMs,
                fallback_segment_get_ms: listRes.value.timing.fallbackSegmentGetMs,
                fallback_wal_scan_ms: listRes.value.timing.fallbackWalScanMs,
                lexicon_runs_loaded: listRes.value.timing.lexiconRunsLoaded
              },
              keys: listRes.value.keys,
              next_after: listRes.value.nextAfter
            });
          }
          if (isSearch) {
            const srow = db.getStream(stream);
            if (!srow || db.isDeleted(srow))
              return notFound();
            if (srow.expires_at_ms != null && db.nowMs() > srow.expires_at_ms)
              return notFound("stream expired");
            const regRes = registry.getRegistryResult(stream);
            if (Result41.isError(regRes))
              return internalError();
            const respondSearch = async (requestBody, fromQuery) => {
              const requestRes = fromQuery ? parseSearchRequestQueryResult(regRes.value, url.searchParams) : parseSearchRequestBodyResult(regRes.value, requestBody);
              if (Result41.isError(requestRes))
                return badRequest(requestRes.error.message);
              const request = {
                ...requestRes.value,
                timeoutMs: clampSearchRequestTimeoutMs(requestRes.value.timeoutMs)
              };
              const searchRes = await runForegroundWithGate(searchGate, () => reader.searchResult({ stream, request }));
              if (Result41.isError(searchRes))
                return readerErrorResponse(searchRes.error);
              const status = searchRes.value.timedOut ? 408 : 200;
              return json(status, {
                stream,
                snapshot_end_offset: searchRes.value.snapshotEndOffset,
                took_ms: searchRes.value.tookMs,
                timed_out: searchRes.value.timedOut,
                timeout_ms: searchRes.value.timeoutMs,
                coverage: {
                  mode: searchRes.value.coverage.mode,
                  complete: searchRes.value.coverage.complete,
                  stream_head_offset: searchRes.value.coverage.streamHeadOffset,
                  visible_through_offset: searchRes.value.coverage.visibleThroughOffset,
                  visible_through_primary_timestamp_max: searchRes.value.coverage.visibleThroughPrimaryTimestampMax,
                  oldest_omitted_append_at: searchRes.value.coverage.oldestOmittedAppendAt,
                  possible_missing_events_upper_bound: searchRes.value.coverage.possibleMissingEventsUpperBound,
                  possible_missing_uploaded_segments: searchRes.value.coverage.possibleMissingUploadedSegments,
                  possible_missing_sealed_rows: searchRes.value.coverage.possibleMissingSealedRows,
                  possible_missing_wal_rows: searchRes.value.coverage.possibleMissingWalRows,
                  indexed_segments: searchRes.value.coverage.indexedSegments,
                  indexed_segment_time_ms: searchRes.value.coverage.indexedSegmentTimeMs,
                  fts_section_get_ms: searchRes.value.coverage.ftsSectionGetMs,
                  fts_decode_ms: searchRes.value.coverage.ftsDecodeMs,
                  fts_clause_estimate_ms: searchRes.value.coverage.ftsClauseEstimateMs,
                  scanned_segments: searchRes.value.coverage.scannedSegments,
                  scanned_segment_time_ms: searchRes.value.coverage.scannedSegmentTimeMs,
                  scanned_tail_docs: searchRes.value.coverage.scannedTailDocs,
                  scanned_tail_time_ms: searchRes.value.coverage.scannedTailTimeMs,
                  exact_candidate_time_ms: searchRes.value.coverage.exactCandidateTimeMs,
                  candidate_doc_ids: searchRes.value.coverage.candidateDocIds,
                  decoded_records: searchRes.value.coverage.decodedRecords,
                  json_parse_time_ms: searchRes.value.coverage.jsonParseTimeMs,
                  segment_payload_bytes_fetched: searchRes.value.coverage.segmentPayloadBytesFetched,
                  sort_time_ms: searchRes.value.coverage.sortTimeMs,
                  peak_hits_held: searchRes.value.coverage.peakHitsHeld,
                  index_families_used: searchRes.value.coverage.indexFamiliesUsed
                },
                total: searchRes.value.total,
                hits: searchRes.value.hits,
                next_search_after: searchRes.value.nextSearchAfter
              }, searchResponseHeaders(searchRes.value));
            };
            if (req.method === "GET") {
              return respondSearch(null, true);
            }
            if (req.method === "POST") {
              let body;
              try {
                body = await req.json();
              } catch {
                return badRequest("search request must be valid JSON");
              }
              return respondSearch(body, false);
            }
            return badRequest("unsupported method");
          }
          if (isAggregate) {
            const srow = db.getStream(stream);
            if (!srow || db.isDeleted(srow))
              return notFound();
            if (srow.expires_at_ms != null && db.nowMs() > srow.expires_at_ms)
              return notFound("stream expired");
            if (req.method !== "POST")
              return badRequest("unsupported method");
            const regRes = registry.getRegistryResult(stream);
            if (Result41.isError(regRes))
              return internalError();
            let body;
            try {
              body = await req.json();
            } catch {
              return badRequest("aggregate request must be valid JSON");
            }
            const requestRes = parseAggregateRequestBodyResult(regRes.value, body);
            if (Result41.isError(requestRes))
              return badRequest(requestRes.error.message);
            const aggregateRes = await runForegroundWithGate(searchGate, () => reader.aggregateResult({ stream, request: requestRes.value }));
            if (Result41.isError(aggregateRes))
              return readerErrorResponse(aggregateRes.error);
            return json(200, {
              stream,
              rollup: aggregateRes.value.rollup,
              from: aggregateRes.value.from,
              to: aggregateRes.value.to,
              interval: aggregateRes.value.interval,
              coverage: {
                mode: aggregateRes.value.coverage.mode,
                complete: aggregateRes.value.coverage.complete,
                stream_head_offset: aggregateRes.value.coverage.streamHeadOffset,
                visible_through_offset: aggregateRes.value.coverage.visibleThroughOffset,
                visible_through_primary_timestamp_max: aggregateRes.value.coverage.visibleThroughPrimaryTimestampMax,
                oldest_omitted_append_at: aggregateRes.value.coverage.oldestOmittedAppendAt,
                possible_missing_events_upper_bound: aggregateRes.value.coverage.possibleMissingEventsUpperBound,
                possible_missing_uploaded_segments: aggregateRes.value.coverage.possibleMissingUploadedSegments,
                possible_missing_sealed_rows: aggregateRes.value.coverage.possibleMissingSealedRows,
                possible_missing_wal_rows: aggregateRes.value.coverage.possibleMissingWalRows,
                used_rollups: aggregateRes.value.coverage.usedRollups,
                indexed_segments: aggregateRes.value.coverage.indexedSegments,
                scanned_segments: aggregateRes.value.coverage.scannedSegments,
                scanned_tail_docs: aggregateRes.value.coverage.scannedTailDocs,
                index_families_used: aggregateRes.value.coverage.indexFamiliesUsed
              },
              buckets: aggregateRes.value.buckets
            });
          }
          if (touchMode) {
            const srow = db.getStream(stream);
            if (!srow || db.isDeleted(srow))
              return notFound();
            if (srow.expires_at_ms != null && db.nowMs() > srow.expires_at_ms)
              return notFound("stream expired");
            const profileRes = profiles.getProfileResult(stream, srow);
            if (Result41.isError(profileRes))
              return internalError("invalid stream profile");
            const touchCapability = resolveTouchCapability(profileRes.value);
            if (!touchCapability?.handleRoute)
              return notFound("touch not enabled");
            return touchCapability.handleRoute({
              route: touchMode,
              req,
              stream,
              streamRow: srow,
              profile: profileRes.value,
              db,
              touchManager: touch,
              respond: { json, badRequest, internalError, notFound }
            });
          }
          if (req.method === "PUT") {
            const streamClosed = parseStreamClosedHeader(req.headers.get("stream-closed"));
            const ttlHeader = req.headers.get("stream-ttl");
            const expiresHeader = req.headers.get("stream-expires-at");
            if (ttlHeader && expiresHeader)
              return badRequest("only one of Stream-TTL or Stream-Expires-At is allowed");
            let ttlSeconds = null;
            let expiresAtMs = null;
            if (ttlHeader) {
              const ttlRes = parseStreamTtlSeconds(ttlHeader);
              if (Result41.isError(ttlRes))
                return badRequest(ttlRes.error.message);
              ttlSeconds = ttlRes.value;
              expiresAtMs = db.nowMs() + BigInt(ttlSeconds) * 1000n;
            } else if (expiresHeader) {
              const expiresRes = parseTimestampMsResult(expiresHeader);
              if (Result41.isError(expiresRes))
                return badRequest(expiresRes.error.message);
              expiresAtMs = expiresRes.value;
            }
            const contentType = normalizeContentType(req.headers.get("content-type")) ?? "application/octet-stream";
            const routingKeyHeader = req.headers.get("stream-key");
            const leaveAppendPhase = memorySampler?.enter("append", {
              route: "put",
              stream,
              content_type: contentType
            });
            try {
              return await runWithGate(ingestGate, async () => {
                const ab = await req.arrayBuffer();
                if (ab.byteLength > cfg.appendMaxBodyBytes)
                  return tooLarge(`body too large (max ${cfg.appendMaxBodyBytes})`);
                const bodyBytes = new Uint8Array(ab);
                let srow = db.getStream(stream);
                if (srow && db.isDeleted(srow)) {
                  db.hardDeleteStream(stream);
                  srow = null;
                }
                if (srow && srow.expires_at_ms != null && db.nowMs() > srow.expires_at_ms) {
                  db.hardDeleteStream(stream);
                  srow = null;
                }
                if (srow) {
                  const existingClosed = srow.closed !== 0;
                  const existingContentType = normalizeContentType(srow.content_type) ?? srow.content_type;
                  const ttlMatch = ttlSeconds != null ? srow.ttl_seconds != null && srow.ttl_seconds === ttlSeconds : expiresAtMs != null ? srow.ttl_seconds == null && srow.expires_at_ms != null && srow.expires_at_ms === expiresAtMs : srow.ttl_seconds == null && srow.expires_at_ms == null;
                  if (existingContentType !== contentType || existingClosed !== streamClosed || !ttlMatch) {
                    return conflict("stream config mismatch");
                  }
                  const tailOffset2 = encodeOffset(srow.epoch, srow.next_offset - 1n);
                  const headers2 = {
                    "content-type": existingContentType,
                    "stream-next-offset": tailOffset2
                  };
                  if (existingClosed)
                    headers2["stream-closed"] = "true";
                  if (srow.expires_at_ms != null)
                    headers2["stream-expires-at"] = new Date(Number(srow.expires_at_ms)).toISOString();
                  return new Response(null, { status: 200, headers: appendResponseHeaders(headers2) });
                }
                db.ensureStream(stream, { contentType, expiresAtMs, ttlSeconds, closed: false });
                notifier.notifyDetailsChanged(stream);
                let lastOffset = -1n;
                let appendedRows = 0;
                let closedNow = false;
                if (bodyBytes.byteLength > 0) {
                  const rowsRes = buildAppendRowsResult(stream, bodyBytes, contentType, routingKeyHeader, true);
                  if (Result41.isError(rowsRes)) {
                    if (rowsRes.error.status === 500)
                      return internalError();
                    return badRequest(rowsRes.error.message);
                  }
                  const rows = rowsRes.value.rows;
                  appendedRows = rows.length;
                  if (rows.length > 0 || streamClosed) {
                    const appendResOrResponse = await awaitAppendWithTimeout(enqueueAppend({
                      stream,
                      baseAppendMs: db.nowMs(),
                      rows,
                      contentType,
                      close: streamClosed
                    }));
                    if (appendResOrResponse instanceof Response)
                      return appendResOrResponse;
                    const appendRes = appendResOrResponse;
                    if (Result41.isError(appendRes)) {
                      if (appendRes.error.kind === "overloaded")
                        return overloaded();
                      return json(500, { error: { code: "internal", message: "append failed" } });
                    }
                    lastOffset = appendRes.value.lastOffset;
                    closedNow = appendRes.value.closed;
                  }
                } else if (streamClosed) {
                  const appendResOrResponse = await awaitAppendWithTimeout(enqueueAppend({
                    stream,
                    baseAppendMs: db.nowMs(),
                    rows: [],
                    contentType,
                    close: true
                  }));
                  if (appendResOrResponse instanceof Response)
                    return appendResOrResponse;
                  const appendRes = appendResOrResponse;
                  if (Result41.isError(appendRes)) {
                    if (appendRes.error.kind === "overloaded")
                      return overloaded();
                    return json(500, { error: { code: "internal", message: "close failed" } });
                  }
                  lastOffset = appendRes.value.lastOffset;
                  closedNow = appendRes.value.closed;
                }
                recordAppendOutcome({
                  stream,
                  lastOffset,
                  appendedRows,
                  metricsBytes: bodyBytes.byteLength,
                  ingestedBytes: bodyBytes.byteLength,
                  touched: bodyBytes.byteLength > 0 || streamClosed,
                  closed: closedNow
                });
                const createdRow = db.getStream(stream);
                const tailOffset = encodeOffset(createdRow.epoch, createdRow.next_offset - 1n);
                const headers = {
                  "content-type": contentType,
                  "stream-next-offset": appendedRows > 0 || streamClosed ? encodeOffset(createdRow.epoch, lastOffset) : tailOffset,
                  location: req.url
                };
                if (streamClosed || closedNow)
                  headers["stream-closed"] = "true";
                if (createdRow.expires_at_ms != null)
                  headers["stream-expires-at"] = new Date(Number(createdRow.expires_at_ms)).toISOString();
                return new Response(null, { status: 201, headers: appendResponseHeaders(headers) });
              });
            } finally {
              leaveAppendPhase?.();
            }
          }
          if (req.method === "DELETE") {
            const deleted = db.deleteStream(stream);
            if (!deleted)
              return notFound();
            notifier.notifyDetailsChanged(stream);
            notifier.notifyClose(stream);
            await uploader.publishManifest(stream);
            return new Response(null, { status: 204, headers: withNosniff() });
          }
          if (req.method === "HEAD") {
            const srow = db.getStream(stream);
            if (!srow || db.isDeleted(srow))
              return notFound();
            if (srow.expires_at_ms != null && db.nowMs() > srow.expires_at_ms)
              return notFound("stream expired");
            const tailOffset = encodeOffset(srow.epoch, srow.next_offset - 1n);
            const headers = {
              "content-type": normalizeContentType(srow.content_type) ?? srow.content_type,
              "stream-next-offset": tailOffset,
              "stream-end-offset": tailOffset,
              "cache-control": "no-store"
            };
            if (srow.closed !== 0)
              headers["stream-closed"] = "true";
            if (srow.ttl_seconds != null && srow.expires_at_ms != null) {
              const remainingMs = Number(srow.expires_at_ms - db.nowMs());
              const remaining = Math.max(0, Math.ceil(remainingMs / 1000));
              headers["stream-ttl"] = String(remaining);
            }
            if (srow.expires_at_ms != null)
              headers["stream-expires-at"] = new Date(Number(srow.expires_at_ms)).toISOString();
            return new Response(null, { status: 200, headers: withNosniff(headers) });
          }
          if (req.method === "POST") {
            const srow = db.getStream(stream);
            if (!srow || db.isDeleted(srow))
              return notFound();
            if (srow.expires_at_ms != null && db.nowMs() > srow.expires_at_ms)
              return notFound("stream expired");
            const streamClosed = parseStreamClosedHeader(req.headers.get("stream-closed"));
            const streamContentType = normalizeContentType(srow.content_type) ?? srow.content_type;
            const producerId = req.headers.get("producer-id");
            const producerEpochHeader = req.headers.get("producer-epoch");
            const producerSeqHeader = req.headers.get("producer-seq");
            let producer = null;
            if (producerId != null || producerEpochHeader != null || producerSeqHeader != null) {
              if (!producerId || producerId.trim() === "")
                return badRequest("invalid Producer-Id");
              if (!producerEpochHeader || !producerSeqHeader)
                return badRequest("missing producer headers");
              const epoch = parseNonNegativeInt(producerEpochHeader);
              const seq = parseNonNegativeInt(producerSeqHeader);
              if (epoch == null || seq == null)
                return badRequest("invalid producer headers");
              producer = { id: producerId, epoch, seq };
            }
            let streamSeq = null;
            const streamSeqRes = parseStreamSeqHeader(req.headers.get("stream-seq"));
            if (Result41.isError(streamSeqRes))
              return badRequest(streamSeqRes.error.message);
            streamSeq = streamSeqRes.value;
            const tsHdr = req.headers.get("stream-timestamp");
            let baseAppendMs = db.nowMs();
            if (tsHdr) {
              const tsRes = parseTimestampMsResult(tsHdr);
              if (Result41.isError(tsRes))
                return badRequest(tsRes.error.message);
              baseAppendMs = tsRes.value;
            }
            const leaveAppendPhase = memorySampler?.enter("append", {
              route: "post",
              stream,
              stream_content_type: streamContentType
            });
            let appendBodyBytesForGc = 0;
            try {
              const response = await runWithGate(ingestGate, async () => {
                const ab = await req.arrayBuffer();
                if (ab.byteLength > cfg.appendMaxBodyBytes)
                  return tooLarge(`body too large (max ${cfg.appendMaxBodyBytes})`);
                const bodyBytes = new Uint8Array(ab);
                appendBodyBytesForGc = bodyBytes.byteLength;
                const isCloseOnly = streamClosed && bodyBytes.byteLength === 0;
                if (bodyBytes.byteLength === 0 && !streamClosed)
                  return badRequest("empty body");
                let reqContentType = normalizeContentType(req.headers.get("content-type"));
                if (!isCloseOnly && !reqContentType)
                  return badRequest("missing content-type");
                const routingKeyHeader = req.headers.get("stream-key");
                let rows = [];
                if (!isCloseOnly) {
                  const rowsRes = buildAppendRowsResult(stream, bodyBytes, reqContentType, routingKeyHeader, false);
                  if (Result41.isError(rowsRes)) {
                    if (rowsRes.error.status === 500)
                      return internalError();
                    return badRequest(rowsRes.error.message);
                  }
                  rows = rowsRes.value.rows;
                }
                const appendResOrResponse = await awaitAppendWithTimeout(enqueueAppend({
                  stream,
                  baseAppendMs,
                  rows,
                  contentType: reqContentType ?? streamContentType,
                  streamSeq,
                  producer,
                  close: streamClosed
                }));
                if (appendResOrResponse instanceof Response)
                  return appendResOrResponse;
                const appendRes = appendResOrResponse;
                if (Result41.isError(appendRes)) {
                  const err = appendRes.error;
                  if (err.kind === "overloaded")
                    return overloaded();
                  if (err.kind === "gone")
                    return notFound("stream expired");
                  if (err.kind === "not_found")
                    return notFound();
                  if (err.kind === "content_type_mismatch")
                    return conflict("content-type mismatch");
                  if (err.kind === "stream_seq") {
                    return conflict("sequence mismatch", {
                      "stream-expected-seq": err.expected,
                      "stream-received-seq": err.received
                    });
                  }
                  if (err.kind === "closed") {
                    const headers2 = {
                      "stream-next-offset": encodeOffset(srow.epoch, err.lastOffset),
                      "stream-closed": "true"
                    };
                    return new Response(null, { status: 409, headers: appendResponseHeaders(headers2) });
                  }
                  if (err.kind === "producer_stale_epoch") {
                    return new Response(null, {
                      status: 403,
                      headers: appendResponseHeaders({ "producer-epoch": String(err.producerEpoch) })
                    });
                  }
                  if (err.kind === "producer_gap") {
                    return new Response(null, {
                      status: 409,
                      headers: appendResponseHeaders({
                        "producer-expected-seq": String(err.expected),
                        "producer-received-seq": String(err.received)
                      })
                    });
                  }
                  if (err.kind === "producer_epoch_seq")
                    return badRequest("invalid producer sequence");
                  return json(500, { error: { code: "internal", message: "append failed" } });
                }
                const res = appendRes.value;
                const appendBytes = rows.reduce((acc, r) => acc + r.payload.byteLength, 0);
                recordAppendOutcome({
                  stream,
                  lastOffset: res.lastOffset,
                  appendedRows: res.appendedRows,
                  metricsBytes: appendBytes,
                  ingestedBytes: bodyBytes.byteLength,
                  touched: true,
                  closed: res.closed
                });
                const headers = {
                  "stream-next-offset": encodeOffset(srow.epoch, res.lastOffset)
                };
                if (res.closed)
                  headers["stream-closed"] = "true";
                if (producer && res.producer) {
                  headers["producer-epoch"] = String(res.producer.epoch);
                  headers["producer-seq"] = String(res.producer.seq);
                }
                const status = producer && res.appendedRows > 0 ? 200 : 204;
                return new Response(null, { status, headers: appendResponseHeaders(headers) });
              });
              maybeCollectAfterHttpAppend(appendBodyBytesForGc);
              return response;
            } finally {
              leaveAppendPhase?.();
            }
          }
          if (req.method === "GET") {
            const srow = db.getStream(stream);
            if (!srow || db.isDeleted(srow))
              return notFound();
            if (srow.expires_at_ms != null && db.nowMs() > srow.expires_at_ms)
              return notFound("stream expired");
            const streamContentType = normalizeContentType(srow.content_type) ?? srow.content_type;
            const isJsonStream = streamContentType === "application/json";
            const fmtParam = url.searchParams.get("format");
            let format = isJsonStream ? "json" : "raw";
            if (fmtParam) {
              if (fmtParam !== "raw" && fmtParam !== "json")
                return badRequest("invalid format");
              format = fmtParam;
            }
            if (format === "json" && !isJsonStream)
              return badRequest("invalid format");
            const pathKey = pathKeyParam ?? null;
            const key = pathKey ?? url.searchParams.get("key");
            const rawFilter = url.searchParams.get("filter");
            let filterInput = null;
            let filter = null;
            if (rawFilter != null) {
              if (!isJsonStream)
                return badRequest("filter requires application/json stream content-type");
              filterInput = rawFilter.trim();
              const regRes = registry.getRegistryResult(stream);
              if (Result41.isError(regRes))
                return internalError();
              const filterRes = parseReadFilterResult(regRes.value, filterInput);
              if (Result41.isError(filterRes))
                return badRequest(filterRes.error.message);
              filter = filterRes.value;
            }
            const liveParam = url.searchParams.get("live") ?? "";
            const cursorParam = url.searchParams.get("cursor");
            let mode;
            if (liveParam === "" || liveParam === "false" || liveParam === "0")
              mode = "catchup";
            else if (liveParam === "long-poll" || liveParam === "true" || liveParam === "1")
              mode = "long-poll";
            else if (liveParam === "sse")
              mode = "sse";
            else
              return badRequest("invalid live mode");
            if (filter && mode === "sse")
              return badRequest("filter does not support live=sse");
            const timeout = url.searchParams.get("timeout") ?? url.searchParams.get("timeout_ms");
            let timeoutMs = null;
            if (timeout) {
              if (/^[0-9]+$/.test(timeout)) {
                timeoutMs = Number(timeout);
              } else {
                const timeoutRes = parseDurationMsResult(timeout);
                if (Result41.isError(timeoutRes))
                  return badRequest("invalid timeout");
                timeoutMs = timeoutRes.value;
              }
            }
            const hasOffsetParam = url.searchParams.has("offset");
            let offset = url.searchParams.get("offset");
            if (hasOffsetParam && (!offset || offset.trim() === ""))
              return badRequest("missing offset");
            const sinceParam = url.searchParams.get("since");
            if (!offset && sinceParam) {
              const sinceRes = parseTimestampMsResult(sinceParam);
              if (Result41.isError(sinceRes))
                return badRequest(sinceRes.error.message);
              const seekRes = await reader.seekOffsetByTimestampResult(stream, sinceRes.value, key ?? null);
              if (Result41.isError(seekRes))
                return readerErrorResponse(seekRes.error);
              offset = seekRes.value;
            }
            if (!offset) {
              if (mode === "catchup")
                offset = "-1";
              else
                return badRequest("missing offset");
            }
            let parsedOffset = null;
            if (offset !== "now") {
              const offsetRes = parseOffsetResult(offset);
              if (Result41.isError(offsetRes))
                return badRequest(offsetRes.error.message);
              parsedOffset = offsetRes.value;
            }
            const ifNoneMatch = req.headers.get("if-none-match");
            const sendBatch = async (batch2, cacheControl2, includeEtag) => {
              const upToDate = batch2.nextOffsetSeq === batch2.endOffsetSeq;
              const closedAtTail = srow.closed !== 0 && upToDate;
              const etag = includeEtag ? `W/"slice:${canonicalizeOffset(offset)}:${batch2.nextOffset}:key=${key ?? ""}:fmt=${format}:filter=${filterInput ? encodeURIComponent(filterInput) : ""}"` : null;
              const baseHeaders = {
                "stream-next-offset": batch2.nextOffset,
                "stream-end-offset": batch2.endOffset,
                "cross-origin-resource-policy": "cross-origin"
              };
              if (upToDate)
                baseHeaders["stream-up-to-date"] = "true";
              if (closedAtTail)
                baseHeaders["stream-closed"] = "true";
              if (cacheControl2)
                baseHeaders["cache-control"] = cacheControl2;
              if (etag)
                baseHeaders["etag"] = etag;
              if (srow.expires_at_ms != null)
                baseHeaders["stream-expires-at"] = new Date(Number(srow.expires_at_ms)).toISOString();
              if (batch2.filterScanLimitReached) {
                baseHeaders["stream-filter-scan-limit-reached"] = "true";
                baseHeaders["stream-filter-scan-limit-bytes"] = String(batch2.filterScanLimitBytes ?? 0);
                baseHeaders["stream-filter-scanned-bytes"] = String(batch2.filterScannedBytes ?? 0);
              }
              if (etag && ifNoneMatch && ifNoneMatch === etag) {
                return new Response(null, { status: 304, headers: withNosniff(baseHeaders) });
              }
              if (format === "json") {
                const encodedRes = encodeStoredJsonArrayResult(stream, batch2.records);
                if (Result41.isError(encodedRes)) {
                  if (encodedRes.error.status === 500)
                    return internalError();
                  return badRequest(encodedRes.error.message);
                }
                if (encodedRes.value) {
                  metrics.recordRead(encodedRes.value.byteLength, batch2.records.length);
                  const headers3 = {
                    "content-type": "application/json",
                    ...baseHeaders
                  };
                  return new Response(bodyBufferFromBytes(encodedRes.value), { status: 200, headers: withNosniff(headers3) });
                }
                const decoded = decodeJsonRecords(stream, batch2.records);
                if (Result41.isError(decoded)) {
                  if (decoded.error.status === 500)
                    return internalError();
                  return badRequest(decoded.error.message);
                }
                const body = JSON.stringify(decoded.value.values);
                metrics.recordRead(body.length, decoded.value.values.length);
                const headers2 = {
                  "content-type": "application/json",
                  ...baseHeaders
                };
                return new Response(body, { status: 200, headers: withNosniff(headers2) });
              }
              const outBytes = concatPayloads(batch2.records.map((r) => r.payload));
              metrics.recordRead(outBytes.byteLength, batch2.records.length);
              const headers = {
                "content-type": streamContentType,
                ...baseHeaders
              };
              return new Response(bodyBufferFromBytes(outBytes), { status: 200, headers: withNosniff(headers) });
            };
            if (mode === "sse") {
              const baseCursor = srow.closed !== 0 ? null : computeCursor(Date.now(), cursorParam);
              const dataEncoding = isTextContentType(streamContentType) ? "text" : "base64";
              const startOffsetSeq = offset === "now" ? srow.next_offset - 1n : offsetToSeqOrNeg1(parsedOffset);
              const startOffset = offset === "now" ? encodeOffset(srow.epoch, startOffsetSeq) : canonicalizeOffset(offset);
              const encoder = new TextEncoder;
              let aborted = false;
              const abortController = new AbortController;
              const streamBody = new ReadableStream({
                start(controller) {
                  (async () => {
                    const fail = (message) => {
                      if (aborted)
                        return;
                      aborted = true;
                      abortController.abort();
                      controller.error(new Error(message));
                    };
                    let currentOffset = startOffset;
                    let currentSeq = startOffsetSeq;
                    let first = true;
                    while (!aborted) {
                      let batch2;
                      if (offset === "now" && first) {
                        batch2 = {
                          stream,
                          format,
                          key: key ?? null,
                          requestOffset: startOffset,
                          endOffset: startOffset,
                          nextOffset: startOffset,
                          endOffsetSeq: currentSeq,
                          nextOffsetSeq: currentSeq,
                          records: []
                        };
                      } else {
                        const batchRes2 = await runForegroundWithGate(readGate, () => reader.readResult({ stream, offset: currentOffset, key: key ?? null, format, filter }));
                        if (Result41.isError(batchRes2)) {
                          fail(batchRes2.error.message);
                          return;
                        }
                        batch2 = batchRes2.value;
                      }
                      first = false;
                      let ssePayload = "";
                      if (batch2.records.length > 0) {
                        let dataPayload = "";
                        if (format === "json") {
                          const encodedRes = encodeStoredJsonArrayResult(stream, batch2.records);
                          if (Result41.isError(encodedRes)) {
                            fail(encodedRes.error.message);
                            return;
                          }
                          if (encodedRes.value) {
                            dataPayload = new TextDecoder().decode(encodedRes.value);
                          } else {
                            const decoded = decodeJsonRecords(stream, batch2.records);
                            if (Result41.isError(decoded)) {
                              fail(decoded.error.message);
                              return;
                            }
                            dataPayload = JSON.stringify(decoded.value.values);
                          }
                        } else {
                          const outBytes = concatPayloads(batch2.records.map((r) => r.payload));
                          dataPayload = dataEncoding === "base64" ? Buffer.from(outBytes).toString("base64") : new TextDecoder().decode(outBytes);
                        }
                        ssePayload += encodeSseEvent("data", dataPayload);
                      }
                      const upToDate = batch2.nextOffsetSeq === batch2.endOffsetSeq;
                      const latest = db.getStream(stream);
                      const closedNow = !!latest && latest.closed !== 0 && upToDate;
                      const control = { streamNextOffset: batch2.nextOffset };
                      if (upToDate)
                        control.upToDate = true;
                      if (closedNow)
                        control.streamClosed = true;
                      if (!closedNow && baseCursor)
                        control.streamCursor = baseCursor;
                      ssePayload += encodeSseEvent("control", JSON.stringify(control));
                      controller.enqueue(encoder.encode(ssePayload));
                      if (closedNow)
                        break;
                      currentOffset = batch2.nextOffset;
                      currentSeq = batch2.nextOffsetSeq;
                      if (!upToDate)
                        continue;
                      const sseWaitMs = timeoutMs == null ? 30000 : timeoutMs;
                      await notifier.waitFor(stream, currentSeq, sseWaitMs, abortController.signal);
                    }
                    if (!aborted)
                      controller.close();
                  })().catch((err) => {
                    if (!aborted)
                      controller.error(err);
                  });
                },
                cancel() {
                  aborted = true;
                  abortController.abort();
                }
              });
              const headers = {
                "content-type": "text/event-stream",
                "cache-control": "no-cache",
                "cross-origin-resource-policy": "cross-origin",
                "stream-next-offset": startOffset,
                "stream-end-offset": encodeOffset(srow.epoch, srow.next_offset - 1n)
              };
              if (dataEncoding === "base64")
                headers["stream-sse-data-encoding"] = "base64";
              return new Response(streamBody, { status: 200, headers: withNosniff(headers) });
            }
            const defaultLongPollTimeoutMs = 3000;
            if (offset === "now") {
              const tailOffset = encodeOffset(srow.epoch, srow.next_offset - 1n);
              if (srow.closed !== 0) {
                if (mode === "long-poll") {
                  const headers3 = {
                    "stream-next-offset": tailOffset,
                    "stream-end-offset": tailOffset,
                    "stream-up-to-date": "true",
                    "stream-closed": "true",
                    "cache-control": "no-store"
                  };
                  if (srow.expires_at_ms != null)
                    headers3["stream-expires-at"] = new Date(Number(srow.expires_at_ms)).toISOString();
                  return new Response(null, { status: 204, headers: withNosniff(headers3) });
                }
                const headers2 = {
                  "content-type": streamContentType,
                  "stream-next-offset": tailOffset,
                  "stream-end-offset": tailOffset,
                  "stream-up-to-date": "true",
                  "stream-closed": "true",
                  "cache-control": "no-store",
                  "cross-origin-resource-policy": "cross-origin"
                };
                if (srow.expires_at_ms != null)
                  headers2["stream-expires-at"] = new Date(Number(srow.expires_at_ms)).toISOString();
                const body2 = format === "json" ? "[]" : "";
                return new Response(body2, { status: 200, headers: withNosniff(headers2) });
              }
              if (mode === "long-poll") {
                const deadline = Date.now() + (timeoutMs ?? defaultLongPollTimeoutMs);
                let currentOffset = tailOffset;
                while (true) {
                  const batchRes2 = await runForegroundWithGate(readGate, () => reader.readResult({ stream, offset: currentOffset, key: key ?? null, format, filter }));
                  if (Result41.isError(batchRes2))
                    return readerErrorResponse(batchRes2.error);
                  const batch2 = batchRes2.value;
                  if (batch2.records.length > 0 || batch2.filterScanLimitReached) {
                    const cursor = computeCursor(Date.now(), cursorParam);
                    const resp = await sendBatch(batch2, "no-store", false);
                    const headers3 = new Headers(resp.headers);
                    headers3.set("stream-cursor", cursor);
                    return new Response(resp.body, { status: resp.status, headers: headers3 });
                  }
                  const latest2 = db.getStream(stream);
                  if (latest2 && latest2.closed !== 0 && batch2.nextOffsetSeq === batch2.endOffsetSeq) {
                    const latestTail2 = encodeOffset(latest2.epoch, latest2.next_offset - 1n);
                    const headers3 = {
                      "stream-next-offset": latestTail2,
                      "stream-end-offset": latestTail2,
                      "stream-up-to-date": "true",
                      "stream-closed": "true",
                      "cache-control": "no-store"
                    };
                    if (latest2.expires_at_ms != null)
                      headers3["stream-expires-at"] = new Date(Number(latest2.expires_at_ms)).toISOString();
                    return new Response(null, { status: 204, headers: withNosniff(headers3) });
                  }
                  const remaining = deadline - Date.now();
                  if (remaining <= 0)
                    break;
                  currentOffset = batch2.nextOffset;
                  await notifier.waitFor(stream, batch2.endOffsetSeq, remaining, req.signal);
                  if (req.signal.aborted)
                    return new Response(null, { status: 204 });
                }
                const latest = db.getStream(stream);
                const latestTail = latest ? encodeOffset(latest.epoch, latest.next_offset - 1n) : tailOffset;
                const headers2 = {
                  "stream-next-offset": latestTail,
                  "stream-end-offset": latestTail,
                  "stream-up-to-date": "true",
                  "cache-control": "no-store"
                };
                if (latest && latest.closed !== 0)
                  headers2["stream-closed"] = "true";
                else
                  headers2["stream-cursor"] = computeCursor(Date.now(), cursorParam);
                if (latest && latest.expires_at_ms != null)
                  headers2["stream-expires-at"] = new Date(Number(latest.expires_at_ms)).toISOString();
                return new Response(null, { status: 204, headers: withNosniff(headers2) });
              }
              const headers = {
                "content-type": streamContentType,
                "stream-next-offset": tailOffset,
                "stream-end-offset": tailOffset,
                "stream-up-to-date": "true",
                "cache-control": "no-store",
                "cross-origin-resource-policy": "cross-origin"
              };
              const body = format === "json" ? "[]" : "";
              return new Response(body, { status: 200, headers: withNosniff(headers) });
            }
            if (mode === "long-poll") {
              const deadline = Date.now() + (timeoutMs ?? defaultLongPollTimeoutMs);
              let currentOffset = offset;
              while (true) {
                const batchRes2 = await runForegroundWithGate(readGate, () => reader.readResult({ stream, offset: currentOffset, key: key ?? null, format, filter }));
                if (Result41.isError(batchRes2))
                  return readerErrorResponse(batchRes2.error);
                const batch2 = batchRes2.value;
                if (batch2.records.length > 0 || batch2.filterScanLimitReached) {
                  const cursor = computeCursor(Date.now(), cursorParam);
                  const resp = await sendBatch(batch2, "no-store", false);
                  const headers2 = new Headers(resp.headers);
                  headers2.set("stream-cursor", cursor);
                  return new Response(resp.body, { status: resp.status, headers: headers2 });
                }
                const latest2 = db.getStream(stream);
                if (latest2 && latest2.closed !== 0 && batch2.nextOffsetSeq === batch2.endOffsetSeq) {
                  const latestTail2 = encodeOffset(latest2.epoch, latest2.next_offset - 1n);
                  const headers2 = {
                    "stream-next-offset": latestTail2,
                    "stream-end-offset": latestTail2,
                    "stream-up-to-date": "true",
                    "stream-closed": "true",
                    "cache-control": "no-store"
                  };
                  if (latest2.expires_at_ms != null)
                    headers2["stream-expires-at"] = new Date(Number(latest2.expires_at_ms)).toISOString();
                  return new Response(null, { status: 204, headers: withNosniff(headers2) });
                }
                const remaining = deadline - Date.now();
                if (remaining <= 0)
                  break;
                currentOffset = batch2.nextOffset;
                await notifier.waitFor(stream, batch2.endOffsetSeq, remaining, req.signal);
                if (req.signal.aborted)
                  return new Response(null, { status: 204 });
              }
              const latest = db.getStream(stream);
              const latestTail = latest ? encodeOffset(latest.epoch, latest.next_offset - 1n) : currentOffset;
              const headers = {
                "stream-next-offset": latestTail,
                "stream-end-offset": latestTail,
                "stream-up-to-date": "true",
                "cache-control": "no-store"
              };
              if (latest && latest.closed !== 0)
                headers["stream-closed"] = "true";
              else
                headers["stream-cursor"] = computeCursor(Date.now(), cursorParam);
              if (latest && latest.expires_at_ms != null)
                headers["stream-expires-at"] = new Date(Number(latest.expires_at_ms)).toISOString();
              return new Response(null, { status: 204, headers: withNosniff(headers) });
            }
            const batchRes = await runForegroundWithGate(readGate, () => reader.readResult({ stream, offset, key: key ?? null, format, filter }));
            if (Result41.isError(batchRes))
              return readerErrorResponse(batchRes.error);
            const batch = batchRes.value;
            const cacheControl = "immutable, max-age=31536000";
            return sendBatch(batch, cacheControl, true);
          }
          return badRequest("unsupported method");
        }
        return notFound();
      })();
      const resolved = await awaitWithCooperativeTimeout(requestPromise, HTTP_RESOLVER_TIMEOUT_MS);
      if (resolved === TIMEOUT_SENTINEL) {
        timedOut = true;
        requestAbortController.abort(new Error("request timed out"));
        requestPromise.catch(() => {});
        await cancelRequestBody(req);
        return requestTimeout();
      }
      return resolved;
    } catch (e) {
      if (isAbortLikeError(e)) {
        if (timedOut)
          return requestTimeout();
        return new Response(null, { status: 204 });
      }
      const msg = String(e?.message ?? e);
      if (!closing && !msg.includes("Statement has finalized")) {
        console.error("request failed", e);
      }
      return internalError();
    } finally {
      req.signal.removeEventListener("abort", abortFromClient);
    }
  };
  const close = async () => {
    closing = true;
    await touch.stop();
    await segmenter.stop(true);
    uploader.stop(true);
    await indexer?.stop();
    metricsEmitter.stop();
    expirySweeper.stop();
    streamSizeReconciler.stop();
    ingest.stop();
    memorySampler?.stop();
    memory.stop();
    db.close();
  };
  return {
    fetch: fetch2,
    close,
    deps: {
      config: cfg,
      db,
      os: store,
      ingest,
      notifier,
      reader,
      segmenter,
      uploader,
      indexer,
      metrics,
      registry,
      profiles,
      touch,
      stats,
      backpressure,
      memory,
      concurrency: {
        ingest: ingestGate,
        read: readGate,
        search: searchGate,
        asyncIndex: asyncIndexGate
      },
      memorySampler
    }
  };
}

// src/objectstore/null.ts
function disabled(op, key) {
  throw dsError(`object store disabled in local mode (${op}${key ? `: ${key}` : ""})`);
}

class NullObjectStore {
  async put(key, _data, _opts) {
    return disabled("put", key);
  }
  async putFile(key, _path, _size, _opts) {
    return disabled("putFile", key);
  }
  async get(key, _opts) {
    return disabled("get", key);
  }
  async head(key) {
    return disabled("head", key);
  }
  async delete(key) {
    return disabled("delete", key);
  }
  async list(prefix) {
    return disabled("list", prefix);
  }
}

// src/reader.ts
import { Result as Result46 } from "better-result";

// src/search/col_runtime.ts
import { Result as Result43 } from "better-result";

// src/search/col_format.ts
import { Result as Result42 } from "better-result";
var FLAG_HAS_MINMAX = 1 << 0;
var FLAG_HAS_PAGE_INDEX = 1 << 1;
class ColSectionView {
  docCount;
  primaryTimestampField;
  fields;
  fieldByName = new Map;
  constructor(docCount, primaryTimestampField, fields) {
    this.docCount = docCount;
    this.primaryTimestampField = primaryTimestampField;
    this.fields = fields;
    for (const field of fields)
      this.fieldByName.set(field.name, field);
  }
  getField(fieldName) {
    return this.fieldByName.get(fieldName) ?? null;
  }
  minTimestampMs() {
    const field = this.primaryTimestampField ? this.getField(this.primaryTimestampField) : null;
    const value = field?.minValue();
    return typeof value === "bigint" ? value : null;
  }
  maxTimestampMs() {
    const field = this.primaryTimestampField ? this.getField(this.primaryTimestampField) : null;
    const value = field?.maxValue();
    return typeof value === "bigint" ? value : null;
  }
}
function compareColScalars(left, right) {
  if (typeof left === "bigint" && typeof right === "bigint")
    return left < right ? -1 : left > right ? 1 : 0;
  if (typeof left === "number" && typeof right === "number")
    return left < right ? -1 : left > right ? 1 : 0;
  if (typeof left === "boolean" && typeof right === "boolean")
    return left === right ? 0 : left ? 1 : -1;
  return String(left).localeCompare(String(right));
}

// src/search/col_runtime.ts
function pageMayMatch(page, op, target) {
  if (op === "eq")
    return compareColScalars(page.min, target) <= 0 && compareColScalars(page.max, target) >= 0;
  if (op === "gt")
    return compareColScalars(page.max, target) > 0;
  if (op === "gte")
    return compareColScalars(page.max, target) >= 0;
  if (op === "lt")
    return compareColScalars(page.min, target) < 0;
  return compareColScalars(page.min, target) <= 0;
}
function compareCurrent(op, current, target) {
  const cmp = compareColScalars(current, target);
  if (op === "eq")
    return cmp === 0;
  if (op === "gt")
    return cmp > 0;
  if (op === "gte")
    return cmp >= 0;
  if (op === "lt")
    return cmp < 0;
  return cmp <= 0;
}
function filterDocIdsByColumnResult(args) {
  const field = args.companion.getField(args.field);
  if (!field)
    return Result43.err({ message: `missing .col2 field ${args.field}` });
  if (args.op === "has")
    return Result43.ok(new Set(field.docIds()));
  const target = args.value;
  const op = args.op;
  const min = field.minValue();
  const max = field.maxValue();
  if (min != null && max != null) {
    if ((op === "gt" || op === "gte") && compareColScalars(max, target) < (op === "gt" ? 1 : 0))
      return Result43.ok(new Set);
    if ((op === "lt" || op === "lte") && compareColScalars(min, target) > (op === "lt" ? -1 : 0))
      return Result43.ok(new Set);
    if (op === "eq" && (compareColScalars(min, target) > 0 || compareColScalars(max, target) < 0))
      return Result43.ok(new Set);
  }
  const matches = new Set;
  if (!field.hasPageIndex()) {
    field.forEachValue((docId, value) => {
      if (compareCurrent(op, value, target))
        matches.add(docId);
    });
    return Result43.ok(matches);
  }
  const pages = field.pageEntries();
  for (let pageIndex = 0;pageIndex < pages.length; pageIndex++) {
    const page = pages[pageIndex];
    if (!pageMayMatch(page, op, target))
      continue;
    const start = page.valueStartIndex;
    const end = pageIndex === pages.length - 1 ? field.docIds().length : pages[pageIndex + 1].valueStartIndex;
    field.forEachValueRange(start, end, (docId, value) => {
      if (compareCurrent(op, value, target))
        matches.add(docId);
    });
  }
  return Result43.ok(matches);
}

// src/search/exact_runtime.ts
import { Result as Result44 } from "better-result";
function intersectInto(target, next) {
  if (target == null)
    return next;
  for (const docId of Array.from(target)) {
    if (!next.has(docId))
      target.delete(docId);
  }
  return target;
}
function docsForClauseResult(companion, clause, candidateDocIds = null) {
  const field = companion.getField(clause.field);
  if (!field)
    return Result44.err({ message: `missing .exact2 field ${clause.field}`, docFreq: Number.MAX_SAFE_INTEGER });
  const termOrdinal = field.lookupTerm(clause.canonicalValue);
  if (termOrdinal == null)
    return Result44.ok(new Set);
  const docs = new Set;
  for (const docId of field.docIds(termOrdinal)) {
    if (!candidateDocIds || candidateDocIds.has(docId))
      docs.add(docId);
  }
  return Result44.ok(docs);
}
function filterDocIdsByExactClausesResult(args) {
  if (args.clauses.length === 0)
    return Result44.ok(new Set);
  const planned = [];
  for (const clause of args.clauses) {
    const field = args.companion.getField(clause.field);
    if (!field)
      return Result44.err({ message: `missing .exact2 field ${clause.field}` });
    const termOrdinal = field.lookupTerm(clause.canonicalValue);
    planned.push({ clause, docFreq: termOrdinal == null ? 0 : field.docFreq(termOrdinal) });
  }
  planned.sort((left, right) => left.docFreq - right.docFreq);
  let intersection = null;
  for (const plan of planned) {
    const clauseRes = docsForClauseResult(args.companion, plan.clause, intersection);
    if (Result44.isError(clauseRes))
      return Result44.err({ message: clauseRes.error.message });
    intersection = intersectInto(intersection, clauseRes.value);
    if (intersection.size === 0)
      break;
  }
  return Result44.ok(intersection ?? new Set);
}

// src/search/fts_runtime.ts
import { Result as Result45 } from "better-result";
var SEARCH_PREFIX_TERM_LIMIT = 1024;
function intersectInto2(target, next) {
  if (target == null)
    return next;
  for (const docId of Array.from(target)) {
    if (!next.has(docId))
      target.delete(docId);
  }
  return target;
}
function unionInto(target, next) {
  for (const docId of next)
    target.add(docId);
}
function unionDocIdsInto(target, docIds) {
  for (let index = 0;index < docIds.length; index++)
    target.add(docIds[index]);
}
function postingDocs(field, termOrdinal) {
  const docs = new Map;
  const iterator = field.postings(termOrdinal);
  for (;; ) {
    const block = iterator.nextBlock();
    if (!block)
      break;
    for (let index = 0;index < block.docIds.length; index++) {
      const docId = block.docIds[index];
      if (!block.positions || !block.posOffsets) {
        docs.set(docId, { docId });
        continue;
      }
      const start = block.posOffsets[index];
      const end = block.posOffsets[index + 1];
      docs.set(docId, {
        docId,
        positions: Array.from(block.positions.subarray(start, end))
      });
    }
  }
  return docs;
}
function docsForTerm(field, termOrdinal, candidateDocIds = null) {
  if (candidateDocIds && candidateDocIds.size === 0)
    return new Set;
  const docs = new Set;
  const iterator = field.postings(termOrdinal);
  for (;; ) {
    const block = iterator.nextBlock();
    if (!block)
      break;
    if (!candidateDocIds) {
      unionDocIdsInto(docs, block.docIds);
      continue;
    }
    for (let index = 0;index < block.docIds.length; index++) {
      const docId = block.docIds[index];
      if (candidateDocIds.has(docId))
        docs.add(docId);
    }
    if (docs.size === candidateDocIds.size)
      break;
  }
  return docs;
}
function docsForOrdinals(field, ordinals, candidateDocIds = null) {
  if (candidateDocIds && candidateDocIds.size === 0)
    return new Set;
  const docs = new Set;
  for (const ordinal of ordinals) {
    unionInto(docs, docsForTerm(field, ordinal, candidateDocIds));
    if (candidateDocIds && docs.size === candidateDocIds.size)
      break;
  }
  return docs;
}
function totalDocFreq(field, ordinals) {
  let total = 0;
  for (const ordinal of ordinals)
    total += field.docFreq(ordinal);
  return total;
}
function sortBySelectivity(groups) {
  return [...groups].sort((left, right) => left.docFreq - right.docFreq);
}
function phraseDocsForFieldResult(field, tokens, prefix, candidateDocIds = null) {
  if (!field.positions)
    return Result45.err({ message: "field does not support phrase queries" });
  if (tokens.length === 0)
    return Result45.ok(new Set);
  const expandedTokens = [];
  for (let index = 0;index < tokens.length; index++) {
    const token = tokens[index];
    const isLast = index === tokens.length - 1;
    if (prefix && isLast) {
      const expansionRes = field.expandPrefixResult(token, SEARCH_PREFIX_TERM_LIMIT);
      if (Result45.isError(expansionRes))
        return expansionRes;
      expandedTokens.push({ ordinals: expansionRes.value, docFreq: totalDocFreq(field, expansionRes.value) });
      continue;
    }
    const termOrdinal = field.lookupTerm(token);
    const ordinals = termOrdinal == null ? [] : [termOrdinal];
    expandedTokens.push({ ordinals, docFreq: totalDocFreq(field, ordinals) });
  }
  let candidateDocs = candidateDocIds ? new Set(candidateDocIds) : null;
  for (const group of sortBySelectivity(expandedTokens)) {
    const docs = docsForOrdinals(field, group.ordinals, candidateDocs);
    candidateDocs = intersectInto2(candidateDocs, docs);
    if (candidateDocs.size === 0)
      return Result45.ok(candidateDocs);
  }
  const positionsByToken = expandedTokens.map((group) => group.ordinals.map((ordinal) => postingDocs(field, ordinal)));
  const matches = new Set;
  for (const docId of candidateDocs ?? []) {
    const positionSets = [];
    for (const tokenMaps of positionsByToken) {
      const variants = [];
      for (const tokenMap of tokenMaps) {
        const posting = tokenMap.get(docId);
        if (posting?.positions)
          variants.push(new Set(posting.positions));
      }
      positionSets.push(variants);
    }
    let found = false;
    for (const startPositions of positionSets[0] ?? []) {
      for (const start of startPositions) {
        let ok = true;
        for (let tokenIndex = 1;tokenIndex < positionSets.length; tokenIndex++) {
          const needed = start + tokenIndex;
          const any = positionSets[tokenIndex].some((positions) => positions.has(needed));
          if (!any) {
            ok = false;
            break;
          }
        }
        if (ok) {
          found = true;
          break;
        }
      }
      if (found)
        break;
    }
    if (found)
      matches.add(docId);
  }
  return Result45.ok(matches);
}
function docsForTextFieldResult(field, tokens, phrase, prefix, candidateDocIds = null) {
  if (phrase)
    return phraseDocsForFieldResult(field, tokens, prefix, candidateDocIds);
  if (tokens.length === 0)
    return Result45.ok(new Set);
  const groups = [];
  for (let index = 0;index < tokens.length; index++) {
    const token = tokens[index];
    const isLast = index === tokens.length - 1;
    if (prefix && isLast) {
      const expansionRes = field.expandPrefixResult(token, SEARCH_PREFIX_TERM_LIMIT);
      if (Result45.isError(expansionRes))
        return expansionRes;
      groups.push({ ordinals: expansionRes.value, docFreq: totalDocFreq(field, expansionRes.value) });
    } else {
      const termOrdinal = field.lookupTerm(token);
      const ordinals = termOrdinal == null ? [] : [termOrdinal];
      groups.push({ ordinals, docFreq: totalDocFreq(field, ordinals) });
    }
  }
  let intersection = candidateDocIds ? new Set(candidateDocIds) : null;
  for (const group of sortBySelectivity(groups)) {
    const docs = docsForOrdinals(field, group.ordinals, intersection);
    intersection = intersectInto2(intersection, docs);
    if (intersection.size === 0)
      return Result45.ok(intersection);
  }
  return Result45.ok(intersection ?? new Set);
}
function docsForTargetFieldResult(field, target, tokens, phrase, prefix, candidateDocIds = null) {
  if (target.config.kind === "keyword") {
    const docs = new Set;
    if (tokens.length === 0)
      return Result45.ok(docs);
    if (prefix) {
      const expansionRes = field.expandPrefixResult(tokens[0], SEARCH_PREFIX_TERM_LIMIT);
      if (Result45.isError(expansionRes))
        return expansionRes;
      for (const termOrdinal2 of expansionRes.value) {
        unionInto(docs, docsForTerm(field, termOrdinal2, candidateDocIds));
        if (candidateDocIds && docs.size === candidateDocIds.size)
          break;
      }
      return Result45.ok(docs);
    }
    const termOrdinal = field.lookupTerm(tokens[0]);
    if (termOrdinal != null)
      unionInto(docs, docsForTerm(field, termOrdinal, candidateDocIds));
    return Result45.ok(docs);
  }
  return docsForTextFieldResult(field, tokens, phrase, prefix, candidateDocIds);
}
function filterDocIdsByFtsClauseResult(args) {
  const candidateDocIds = args.candidateDocIds ?? null;
  if (args.clause.kind === "has") {
    const field = args.companion.getField(args.clause.field);
    if (!field)
      return Result45.err({ message: `missing .fts2 field ${args.clause.field}` });
    const docs2 = new Set;
    for (const docId of field.existsDocIds()) {
      if (!candidateDocIds || candidateDocIds.has(docId))
        docs2.add(docId);
    }
    return Result45.ok(docs2);
  }
  if (args.clause.kind === "keyword") {
    const field = args.companion.getField(args.clause.field);
    if (!field)
      return Result45.err({ message: `missing .fts2 field ${args.clause.field}` });
    if (args.clause.prefix) {
      const expansionRes = field.expandPrefixResult(args.clause.canonicalValue, SEARCH_PREFIX_TERM_LIMIT);
      if (Result45.isError(expansionRes))
        return expansionRes;
      const docs2 = new Set;
      for (const termOrdinal2 of expansionRes.value) {
        unionInto(docs2, docsForTerm(field, termOrdinal2, candidateDocIds));
        if (candidateDocIds && docs2.size === candidateDocIds.size)
          break;
      }
      return Result45.ok(docs2);
    }
    const termOrdinal = field.lookupTerm(args.clause.canonicalValue);
    return Result45.ok(termOrdinal == null ? new Set : docsForTerm(field, termOrdinal, candidateDocIds));
  }
  const docs = new Set;
  for (const target of args.clause.fields) {
    const field = args.companion.getField(target.field);
    if (!field)
      return Result45.err({ message: `missing .fts2 field ${target.field}` });
    const fieldDocsRes = docsForTargetFieldResult(field, target, args.clause.tokens, args.clause.phrase, args.clause.prefix, candidateDocIds);
    if (Result45.isError(fieldDocsRes))
      return fieldDocsRes;
    unionInto(docs, fieldDocsRes.value);
    if (candidateDocIds && docs.size === candidateDocIds.size)
      break;
  }
  return Result45.ok(docs);
}
function estimateDocFreqForFtsClauseResult(args) {
  if (args.clause.kind === "has") {
    const field = args.companion.getField(args.clause.field);
    if (!field)
      return Result45.err({ message: `missing .fts2 field ${args.clause.field}` });
    return Result45.ok(field.existsDocIds().length);
  }
  if (args.clause.kind === "keyword") {
    const field = args.companion.getField(args.clause.field);
    if (!field)
      return Result45.err({ message: `missing .fts2 field ${args.clause.field}` });
    if (args.clause.prefix) {
      const expansionRes = field.expandPrefixResult(args.clause.canonicalValue, SEARCH_PREFIX_TERM_LIMIT);
      if (Result45.isError(expansionRes))
        return expansionRes;
      return Result45.ok(totalDocFreq(field, expansionRes.value));
    }
    const termOrdinal = field.lookupTerm(args.clause.canonicalValue);
    return Result45.ok(termOrdinal == null ? 0 : field.docFreq(termOrdinal));
  }
  return Result45.ok(Number.MAX_SAFE_INTEGER);
}
function filterDocIdsByFtsClausesResult(args) {
  if (args.clauses.length === 0)
    return Result45.ok(new Set);
  const planned = [];
  const estimateStartedAt = Date.now();
  for (const clause of args.clauses) {
    const docFreqRes = estimateDocFreqForFtsClauseResult({ companion: args.companion, clause });
    if (Result45.isError(docFreqRes))
      return docFreqRes;
    planned.push({ clause, docFreq: docFreqRes.value });
  }
  args.onEstimateMs?.(Date.now() - estimateStartedAt);
  planned.sort((left, right) => left.docFreq - right.docFreq);
  let intersection = null;
  for (const plan of planned) {
    const clauseRes = filterDocIdsByFtsClauseResult({
      companion: args.companion,
      clause: plan.clause,
      candidateDocIds: intersection
    });
    if (Result45.isError(clauseRes))
      return clauseRes;
    intersection = intersection == null ? clauseRes.value : intersectInto2(intersection, clauseRes.value);
    if (intersection.size === 0)
      break;
  }
  return Result45.ok(intersection ?? new Set);
}

// src/search/column_encoding.ts
var INT64_SIGN = 0x8000_0000_0000_0000n;
var UINT64_MASK = 0xffff_ffff_ffff_ffffn;
function encodeSortableInt64(value) {
  const signed = BigInt.asIntN(64, value);
  const sortable = BigInt.asUintN(64, signed ^ INT64_SIGN);
  const out = new Uint8Array(8);
  const dv = new DataView(out.buffer, out.byteOffset, out.byteLength);
  dv.setBigUint64(0, sortable, false);
  return out;
}
function encodeSortableFloat64(value) {
  const out = new Uint8Array(8);
  const dv = new DataView(out.buffer, out.byteOffset, out.byteLength);
  dv.setFloat64(0, value, false);
  const raw = dv.getBigUint64(0, false);
  const sortable = (raw & INT64_SIGN) !== 0n ? ~raw & UINT64_MASK : raw ^ INT64_SIGN;
  dv.setBigUint64(0, sortable, false);
  return out;
}
function encodeSortableBool(value) {
  return new Uint8Array([value ? 1 : 0]);
}

// src/reader.ts
var READ_FILTER_SCAN_LIMIT_BYTES = 100 * 1024 * 1024;
function errorMessage(e) {
  return String(e?.message ?? e);
}
function utf8Bytes(s) {
  return new TextEncoder().encode(s);
}
function parseCompanionSections2(value) {
  try {
    const parsed = JSON.parse(value);
    return new Set(Array.isArray(parsed) ? parsed.filter((entry) => typeof entry === "string") : []);
  } catch {
    return new Set;
  }
}
async function loadSegmentBytes(os2, seg, diskCache, retryOpts) {
  return loadSegmentBytesCached(os2, seg, diskCache, retryOpts);
}
function loadSegmentDataLimitFromSource(seg, source) {
  if (seg.size_bytes < 8)
    return seg.size_bytes;
  const tail = readRangeFromSource(source, seg.size_bytes - 8, seg.size_bytes - 1);
  const magic = String.fromCharCode(tail[4], tail[5], tail[6], tail[7]);
  if (magic !== "DSF1")
    return seg.size_bytes;
  const footerLen = readU32BE(tail, 0);
  const footerStart = seg.size_bytes - 8 - footerLen;
  return footerStart >= 0 ? footerStart : seg.size_bytes;
}
function findFirstRelevantBlockIndex(blocks, seq) {
  if (blocks.length <= 1)
    return 0;
  let lo = 0;
  let hi = blocks.length - 1;
  let best = 0;
  while (lo <= hi) {
    const mid = lo + hi >>> 1;
    if (blocks[mid].firstOffset <= seq) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return best;
}
function loadSegmentFooterBlocksFromSource(seg, source) {
  if (seg.size_bytes < 8)
    return null;
  const tail = readRangeFromSource(source, seg.size_bytes - 8, seg.size_bytes - 1);
  const magic = String.fromCharCode(tail[4], tail[5], tail[6], tail[7]);
  if (magic !== "DSF1")
    return null;
  const footerLen = readU32BE(tail, 0);
  const footerStart = seg.size_bytes - 8 - footerLen;
  if (footerStart < 0)
    return null;
  const footerBytes = readRangeFromSource(source, footerStart, footerStart + footerLen - 1);
  const footer = parseFooterBytes(footerBytes);
  return footer?.blocks ?? null;
}

class StreamReader {
  config;
  db;
  os;
  registry;
  diskCache;
  index;
  memorySampler;
  memory;
  hotWalExact = new Map;
  constructor(config, db, os2, registry, diskCache, index, memorySampler, memory) {
    this.config = config;
    this.db = db;
    this.os = os2;
    this.registry = registry;
    this.diskCache = diskCache;
    this.index = index;
    this.memorySampler = memorySampler;
    this.memory = memory;
  }
  planSealedReadSegments(stream, startSeq, sealedEndSeq, candidateSegments, indexedThrough, order = "asc") {
    if (startSeq > sealedEndSeq)
      return { segments: [], sealedEndSeq };
    if (candidateSegments == null)
      return null;
    const startSeg = this.db.findSegmentForOffset(stream, startSeq);
    const endSeg = this.db.findSegmentForOffset(stream, sealedEndSeq);
    if (!startSeg || !endSeg)
      return null;
    const startIndex = startSeg.segment_index;
    const endIndex = endSeg.segment_index;
    const plannedIndexes = [];
    const seenIndexes = new Set;
    const indexedPrefixEnd = Math.min(endIndex, indexedThrough - 1);
    if (order === "asc") {
      if (startIndex <= indexedPrefixEnd) {
        const sortedCandidateIndexes = Array.from(candidateSegments).filter((segmentIndex) => segmentIndex >= startIndex && segmentIndex <= indexedPrefixEnd).sort((a, b) => a - b);
        for (const segmentIndex of sortedCandidateIndexes) {
          if (seenIndexes.has(segmentIndex))
            continue;
          plannedIndexes.push(segmentIndex);
          seenIndexes.add(segmentIndex);
        }
      }
      const tailStartIndex = Math.max(startIndex, indexedThrough);
      for (let segmentIndex = tailStartIndex;segmentIndex <= endIndex; segmentIndex++) {
        if (seenIndexes.has(segmentIndex))
          continue;
        plannedIndexes.push(segmentIndex);
        seenIndexes.add(segmentIndex);
      }
    } else {
      for (let segmentIndex = endIndex;segmentIndex >= Math.max(startIndex, indexedThrough); segmentIndex--) {
        if (seenIndexes.has(segmentIndex))
          continue;
        plannedIndexes.push(segmentIndex);
        seenIndexes.add(segmentIndex);
      }
      if (startIndex <= indexedPrefixEnd) {
        const sortedCandidateIndexes = Array.from(candidateSegments).filter((segmentIndex) => segmentIndex >= startIndex && segmentIndex <= indexedPrefixEnd).sort((a, b) => b - a);
        for (const segmentIndex of sortedCandidateIndexes) {
          if (seenIndexes.has(segmentIndex))
            continue;
          plannedIndexes.push(segmentIndex);
          seenIndexes.add(segmentIndex);
        }
      }
    }
    const plannedSegments = [];
    for (const segmentIndex of plannedIndexes) {
      const seg = this.db.getSegmentByIndex(stream, segmentIndex);
      if (!seg)
        return null;
      plannedSegments.push(seg);
    }
    return { segments: plannedSegments, sealedEndSeq };
  }
  planAllSealedReadSegments(stream, startSeq, sealedEndSeq, order = "asc") {
    if (startSeq > sealedEndSeq)
      return { segments: [], sealedEndSeq };
    const startSeg = this.db.findSegmentForOffset(stream, startSeq);
    const endSeg = this.db.findSegmentForOffset(stream, sealedEndSeq);
    if (!startSeg || !endSeg)
      return null;
    const plannedSegments = [];
    if (order === "asc") {
      for (let segmentIndex = startSeg.segment_index;segmentIndex <= endSeg.segment_index; segmentIndex++) {
        const seg = this.db.getSegmentByIndex(stream, segmentIndex);
        if (!seg)
          return null;
        plannedSegments.push(seg);
      }
    } else {
      for (let segmentIndex = endSeg.segment_index;segmentIndex >= startSeg.segment_index; segmentIndex--) {
        const seg = this.db.getSegmentByIndex(stream, segmentIndex);
        if (!seg)
          return null;
        plannedSegments.push(seg);
      }
    }
    return { segments: plannedSegments, sealedEndSeq };
  }
  currentSearchCompanionRowsBySegment(stream, registry) {
    const desiredPlan = buildDesiredSearchCompanionPlan(registry);
    const desiredHash = hashSearchCompanionPlan(desiredPlan);
    const companionPlanRow = this.db.getSearchCompanionPlan(stream);
    const desiredGeneration = companionPlanRow == null ? 1 : companionPlanRow.plan_hash === desiredHash ? companionPlanRow.generation : companionPlanRow.generation + 1;
    const rowsBySegment = new Map;
    for (const row of this.db.listSearchSegmentCompanions(stream)) {
      if (row.plan_generation === desiredGeneration)
        rowsBySegment.set(row.segment_index, row);
    }
    return rowsBySegment;
  }
  cacheStats() {
    return this.diskCache ? this.diskCache.stats() : null;
  }
  retryOpts() {
    return {
      retries: this.config.objectStoreRetries,
      baseDelayMs: this.config.objectStoreBaseDelayMs,
      maxDelayMs: this.config.objectStoreMaxDelayMs,
      timeoutMs: this.config.objectStoreTimeoutMs
    };
  }
  isoTimestampFromMs(value) {
    if (value == null)
      return null;
    const ms = Number(value);
    if (!Number.isFinite(ms) || ms < 0)
      return null;
    return new Date(ms).toISOString();
  }
  shouldSearchWalTail(srow, hasOutstandingPublishedSegments, hasOutstandingCompanions) {
    if (srow.pending_rows <= 0n)
      return false;
    if (hasOutstandingPublishedSegments || hasOutstandingCompanions)
      return false;
    if (srow.segment_in_progress !== 0)
      return false;
    const quietPeriodMs = Math.max(0, this.config.searchWalOverlayQuietPeriodMs);
    const quietForMs = Number(this.db.nowMs() - srow.last_append_ms);
    if (!Number.isFinite(quietForMs) || quietForMs < quietPeriodMs)
      return false;
    if (srow.pending_bytes > BigInt(this.config.searchWalOverlayMaxBytes))
      return false;
    if (srow.pending_rows > BigInt(this.config.segmentTargetRows))
      return false;
    return true;
  }
  computeOldestOmittedAppendAt(stream, srow, visiblePublishedSegmentCount, publishedSegmentCount, shouldSearchWalTail) {
    if (visiblePublishedSegmentCount < publishedSegmentCount) {
      const firstOmittedSegment = this.db.getSegmentByIndex(stream, visiblePublishedSegmentCount);
      return this.isoTimestampFromMs(firstOmittedSegment?.last_append_ms ?? null);
    }
    if (srow.sealed_through > srow.uploaded_through) {
      const firstSealedOmitted = this.db.findSegmentForOffset(stream, srow.uploaded_through + 1n);
      return this.isoTimestampFromMs(firstSealedOmitted?.last_append_ms ?? null);
    }
    if (srow.pending_rows > 0n && !shouldSearchWalTail) {
      return this.isoTimestampFromMs(this.db.getWalOldestTimestampMs(stream));
    }
    return null;
  }
  computePublishedCoverageState(stream, srow, registry) {
    const totalSegmentCount = this.db.countSegmentsForStream(stream);
    const publishedSegmentCount = srow.uploaded_through >= 0n ? (this.db.findSegmentForOffset(stream, srow.uploaded_through)?.segment_index ?? -1) + 1 : 0;
    const desiredPlan = buildDesiredSearchCompanionPlan(registry);
    const planHasFamilies = Object.values(desiredPlan.families).some(Boolean);
    let visiblePublishedSegmentCount = publishedSegmentCount;
    let visibleThroughPrimaryTimestampMax = null;
    if (planHasFamilies) {
      const desiredHash = hashSearchCompanionPlan(desiredPlan);
      const companionPlanRow = this.db.getSearchCompanionPlan(stream);
      const desiredGeneration = companionPlanRow == null ? 1 : companionPlanRow.plan_hash === desiredHash ? companionPlanRow.generation : companionPlanRow.generation + 1;
      const currentCompanions = this.db.listSearchSegmentCompanions(stream).filter((row) => row.plan_generation === desiredGeneration);
      const currentSegments = new Set;
      for (const row of currentCompanions) {
        const sections = parseCompanionSections2(row.sections_json);
        const hasEnabledFamily = Object.entries(desiredPlan.families).some(([family, enabled]) => enabled && sections.has(family));
        if (hasEnabledFamily)
          currentSegments.add(row.segment_index);
      }
      visiblePublishedSegmentCount = 0;
      while (visiblePublishedSegmentCount < publishedSegmentCount && currentSegments.has(visiblePublishedSegmentCount)) {
        visiblePublishedSegmentCount += 1;
      }
      if (visiblePublishedSegmentCount > 0) {
        const visibleCompanionRow = currentCompanions.find((row) => row.segment_index === visiblePublishedSegmentCount - 1) ?? null;
        visibleThroughPrimaryTimestampMax = this.isoTimestampFromMs(visibleCompanionRow?.primary_timestamp_max_ms ?? null);
      }
    }
    const hasOutstandingPublishedSegments = publishedSegmentCount < totalSegmentCount;
    const hasOutstandingCompanions = planHasFamilies && visiblePublishedSegmentCount < publishedSegmentCount;
    const canSearchWalTail = this.shouldSearchWalTail(srow, hasOutstandingPublishedSegments, hasOutstandingCompanions);
    const omitWalTail = srow.pending_rows > 0n && !canSearchWalTail;
    let visibleThroughSeq = srow.next_offset - 1n;
    if (hasOutstandingPublishedSegments || hasOutstandingCompanions || omitWalTail) {
      if (visiblePublishedSegmentCount > 0) {
        visibleThroughSeq = this.db.getSegmentByIndex(stream, visiblePublishedSegmentCount - 1)?.end_offset ?? -1n;
      } else {
        visibleThroughSeq = -1n;
      }
    }
    const possibleMissingUploadedSegments = Math.max(0, publishedSegmentCount - visiblePublishedSegmentCount);
    const hasOmittedPublishedSuffix = hasOutstandingPublishedSegments || hasOutstandingCompanions;
    const possibleMissingUploadedRows = hasOmittedPublishedSuffix && srow.uploaded_through > visibleThroughSeq ? Number(srow.uploaded_through - visibleThroughSeq) : 0;
    const possibleMissingSealedRows = hasOmittedPublishedSuffix && srow.sealed_through > srow.uploaded_through ? Number(srow.sealed_through - srow.uploaded_through) : 0;
    const possibleMissingWalRows = omitWalTail ? Number(srow.pending_rows) : 0;
    const possibleMissingEventsUpperBound = possibleMissingUploadedRows + possibleMissingSealedRows + possibleMissingWalRows;
    const streamHeadOffset = encodeOffset(srow.epoch, srow.next_offset - 1n);
    const oldestOmittedAppendAt = this.computeOldestOmittedAppendAt(stream, srow, visiblePublishedSegmentCount, publishedSegmentCount, canSearchWalTail);
    return {
      mode: possibleMissingEventsUpperBound === 0 ? "complete" : "published",
      complete: possibleMissingEventsUpperBound === 0,
      canSearchWalTail,
      publishedSegmentCount,
      visiblePublishedSegmentCount,
      streamHeadOffset,
      visibleThroughSeq,
      visibleThroughOffset: encodeOffset(srow.epoch, visibleThroughSeq),
      visibleThroughPrimaryTimestampMax,
      oldestOmittedAppendAt,
      possibleMissingEventsUpperBound,
      possibleMissingUploadedSegments,
      possibleMissingSealedRows,
      possibleMissingWalRows
    };
  }
  async seekOffsetByTimestampResult(stream, sinceMs, key) {
    const srow = this.db.getStream(stream);
    if (!srow || this.db.isDeleted(srow))
      return Result46.err({ kind: "not_found", message: "not_found" });
    if (srow.expires_at_ms != null && this.db.nowMs() > srow.expires_at_ms) {
      return Result46.err({ kind: "gone", message: "stream expired" });
    }
    try {
      const sinceNs = sinceMs * 1000000n;
      const keyBytes = key ? utf8Bytes(key) : null;
      const candidateInfo = await this.resolveCandidateSegments(stream, keyBytes, null);
      const plannedSealedSegments = this.planSealedReadSegments(stream, 0n, srow.sealed_through, candidateInfo.segments, candidateInfo.indexedThrough, "asc");
      for (const seg of plannedSealedSegments?.segments ?? this.db.listSegmentsForStream(stream)) {
        const segBytes = await loadSegmentBytes(this.os, seg, this.diskCache, this.retryOpts());
        let curOffset = seg.start_offset;
        for (const blockRes of iterateBlocksResult(segBytes)) {
          if (Result46.isError(blockRes))
            return Result46.err({ kind: "internal", message: blockRes.error.message });
          const { decoded } = blockRes.value;
          if (decoded.lastAppendNs < sinceNs) {
            curOffset += BigInt(decoded.recordCount);
            continue;
          }
          for (const r of decoded.records) {
            if (keyBytes && !bytesEqual(r.routingKey, keyBytes)) {
              curOffset += 1n;
              continue;
            }
            if (r.appendNs >= sinceNs) {
              const prev = curOffset - 1n;
              return Result46.ok(encodeOffset(srow.epoch, prev));
            }
            curOffset += 1n;
          }
        }
      }
      const start = srow.sealed_through + 1n;
      const end = srow.next_offset - 1n;
      if (start <= end) {
        for (const rec of this.db.iterWalRange(stream, start, end, keyBytes ?? undefined)) {
          const tsNs = BigInt(rec.ts_ms) * 1000000n;
          if (tsNs >= sinceNs) {
            const off = BigInt(rec.offset) - 1n;
            return Result46.ok(encodeOffset(srow.epoch, off));
          }
        }
      }
      const endOffsetNum = srow.next_offset - 1n;
      return Result46.ok(encodeOffset(srow.epoch, endOffsetNum));
    } catch (e) {
      return Result46.err({ kind: "internal", message: errorMessage(e) });
    }
  }
  async seekOffsetByTimestamp(stream, sinceMs, key) {
    const res = await this.seekOffsetByTimestampResult(stream, sinceMs, key);
    if (Result46.isError(res))
      throw dsError(res.error.message);
    return res.value;
  }
  async readResult(args) {
    const { stream, offset, key, format, filter = null } = args;
    const srow = this.db.getStream(stream);
    if (!srow || this.db.isDeleted(srow))
      return Result46.err({ kind: "not_found", message: "not_found" });
    if (srow.expires_at_ms != null && this.db.nowMs() > srow.expires_at_ms) {
      return Result46.err({ kind: "gone", message: "stream expired" });
    }
    const epoch = srow.epoch;
    try {
      let finalize = function() {
        const scannedThrough = seq - 1n;
        const nextOffset = encodeOffset(epoch, scannedThrough);
        return {
          stream,
          format,
          key,
          requestOffset: offset,
          endOffset,
          nextOffset,
          endOffsetSeq: endOffsetNum,
          nextOffsetSeq: scannedThrough,
          records: results,
          ...filter ? {
            filterScannedBytes,
            filterScanLimitBytes: READ_FILTER_SCAN_LIMIT_BYTES,
            filterScanLimitReached
          } : {}
        };
      };
      const parsed = parseOffsetResult(offset);
      if (Result46.isError(parsed)) {
        return Result46.err({ kind: "invalid_offset", message: parsed.error.message });
      }
      const startOffsetExclusive = offsetToSeqOrNeg1(parsed.value);
      const desiredOffset = startOffsetExclusive + 1n;
      const endOffsetNum = srow.next_offset - 1n;
      const endOffset = encodeOffset(srow.epoch, endOffsetNum);
      const results = [];
      let bytesOut = 0;
      let filterScannedBytes = 0;
      let filterScanLimitReached = false;
      if (desiredOffset > endOffsetNum) {
        return Result46.ok({
          stream,
          format,
          key,
          requestOffset: offset,
          endOffset,
          nextOffset: encodeOffset(srow.epoch, startOffsetExclusive),
          endOffsetSeq: endOffsetNum,
          nextOffsetSeq: startOffsetExclusive,
          records: [],
          ...filter ? {
            filterScannedBytes,
            filterScanLimitBytes: READ_FILTER_SCAN_LIMIT_BYTES,
            filterScanLimitReached
          } : {}
        });
      }
      let seq = desiredOffset;
      const keyBytes = key ? utf8Bytes(key) : null;
      const candidateInfo = await this.resolveCandidateSegments(stream, keyBytes, filter);
      const candidateSegments = candidateInfo.segments;
      const indexedThrough = candidateInfo.indexedThrough;
      const columnClauses = filter ? collectPositiveColumnFilterClauses(filter) : [];
      const filterRegistryRes = filter ? this.registry.getRegistryResult(stream) : Result46.ok(null);
      if (Result46.isError(filterRegistryRes))
        return Result46.err({ kind: "internal", message: filterRegistryRes.error.message });
      const filterRegistry = filterRegistryRes.value;
      const evaluateRecordResult = (offset2, routingKey, payload) => {
        if (filter) {
          filterScannedBytes += payload.byteLength;
        }
        if (keyBytes && (!routingKey || !bytesEqual(routingKey, keyBytes))) {
          return Result46.ok({
            matched: false,
            stop: !!filter && filterScannedBytes >= READ_FILTER_SCAN_LIMIT_BYTES
          });
        }
        if (!filter)
          return Result46.ok({ matched: true, stop: false });
        const valueRes = decodeJsonPayloadResult(this.registry, stream, offset2, payload);
        if (Result46.isError(valueRes)) {
          return Result46.err({ kind: "internal", message: valueRes.error.message });
        }
        const matchesRes = evaluateReadFilterResult(filterRegistry, offset2, filter, valueRes.value);
        if (Result46.isError(matchesRes))
          return Result46.err({ kind: "internal", message: matchesRes.error.message });
        return Result46.ok({
          matched: matchesRes.value,
          stop: filterScannedBytes >= READ_FILTER_SCAN_LIMIT_BYTES
        });
      };
      const scanSegmentBytes = async (segBytes, seg, allowedDocIds) => {
        const footer = parseFooter(segBytes)?.footer;
        if (footer) {
          for (let blockIndex = findFirstRelevantBlockIndex(footer.blocks, seq);blockIndex < footer.blocks.length; blockIndex++) {
            const block = footer.blocks[blockIndex];
            const blockStart = block.firstOffset;
            const blockEnd = blockStart + BigInt(block.recordCount) - 1n;
            if (blockEnd < seq)
              continue;
            if (blockStart > endOffsetNum)
              break;
            if (keyBytes) {
              const headerBytes = segBytes.subarray(block.blockOffset, block.blockOffset + DSB3_HEADER_BYTES);
              const headerRes = parseBlockHeaderResult(headerBytes);
              if (Result46.isError(headerRes))
                return Result46.err({ kind: "internal", message: headerRes.error.message });
              const bloom = new Bloom256(headerRes.value.bloom);
              if (!bloom.maybeHas(keyBytes))
                continue;
            }
            const totalLen = DSB3_HEADER_BYTES + block.compressedLen;
            const blockBytes = segBytes.subarray(block.blockOffset, block.blockOffset + totalLen);
            const decodedRes = decodeBlockResult(blockBytes);
            if (Result46.isError(decodedRes))
              return Result46.err({ kind: "internal", message: decodedRes.error.message });
            const decoded = decodedRes.value;
            let curOffset2 = blockStart;
            for (const r of decoded.records) {
              if (curOffset2 < seq) {
                curOffset2 += 1n;
                continue;
              }
              if (curOffset2 > endOffsetNum)
                break;
              const localDocId = Number(curOffset2 - seg.start_offset);
              if (allowedDocIds && !allowedDocIds.has(localDocId)) {
                curOffset2 += 1n;
                continue;
              }
              const matchRes = evaluateRecordResult(curOffset2, r.routingKey, r.payload);
              if (Result46.isError(matchRes))
                return matchRes;
              if (matchRes.value.matched) {
                results.push({ offset: curOffset2, payload: r.payload });
                bytesOut += r.payload.byteLength;
              }
              curOffset2 += 1n;
              if (matchRes.value.stop) {
                filterScanLimitReached = true;
                seq = curOffset2;
                return Result46.ok(undefined);
              }
              if (results.length >= this.config.readMaxRecords || bytesOut >= this.config.readMaxBytes) {
                seq = curOffset2;
                return Result46.ok(undefined);
              }
            }
          }
          return Result46.ok(undefined);
        }
        let curOffset = seg.start_offset;
        for (const blockRes of iterateBlocksResult(segBytes)) {
          if (Result46.isError(blockRes))
            return Result46.err({ kind: "internal", message: blockRes.error.message });
          const { decoded } = blockRes.value;
          if (keyBytes) {
            const bloom = new Bloom256(decoded.bloom);
            if (!bloom.maybeHas(keyBytes)) {
              curOffset += BigInt(decoded.recordCount);
              continue;
            }
          }
          for (const r of decoded.records) {
            if (curOffset < seq) {
              curOffset += 1n;
              continue;
            }
            if (curOffset > endOffsetNum)
              break;
            const localDocId = Number(curOffset - seg.start_offset);
            if (allowedDocIds && !allowedDocIds.has(localDocId)) {
              curOffset += 1n;
              continue;
            }
            const matchRes = evaluateRecordResult(curOffset, r.routingKey, r.payload);
            if (Result46.isError(matchRes))
              return matchRes;
            if (matchRes.value.matched) {
              results.push({ offset: curOffset, payload: r.payload });
              bytesOut += r.payload.byteLength;
            }
            curOffset += 1n;
            if (matchRes.value.stop) {
              filterScanLimitReached = true;
              seq = curOffset;
              return Result46.ok(undefined);
            }
            if (results.length >= this.config.readMaxRecords || bytesOut >= this.config.readMaxBytes) {
              seq = curOffset;
              return Result46.ok(undefined);
            }
          }
        }
        return Result46.ok(undefined);
      };
      const scanSegmentSource = async (source, seg, allowedDocIds) => {
        const footerBlocks = loadSegmentFooterBlocksFromSource(seg, source);
        if (footerBlocks) {
          for (let blockIndex = findFirstRelevantBlockIndex(footerBlocks, seq);blockIndex < footerBlocks.length; blockIndex++) {
            const block = footerBlocks[blockIndex];
            const blockStart = block.firstOffset;
            const blockEnd = blockStart + BigInt(block.recordCount) - 1n;
            if (blockEnd < seq)
              continue;
            if (blockStart > endOffsetNum)
              break;
            const headerBytes = readRangeFromSource(source, block.blockOffset, block.blockOffset + DSB3_HEADER_BYTES - 1);
            const headerRes = parseBlockHeaderResult(headerBytes);
            if (Result46.isError(headerRes))
              return Result46.err({ kind: "internal", message: headerRes.error.message });
            if (keyBytes) {
              const bloom = new Bloom256(headerRes.value.bloom);
              if (!bloom.maybeHas(keyBytes))
                continue;
            }
            const totalLen = DSB3_HEADER_BYTES + block.compressedLen;
            const blockBytes = readRangeFromSource(source, block.blockOffset, block.blockOffset + totalLen - 1);
            const decodedRes = decodeBlockResult(blockBytes);
            if (Result46.isError(decodedRes))
              return Result46.err({ kind: "internal", message: decodedRes.error.message });
            const decoded = decodedRes.value;
            let curOffset = blockStart;
            for (const r of decoded.records) {
              if (curOffset < seq) {
                curOffset += 1n;
                continue;
              }
              if (curOffset > endOffsetNum)
                break;
              const localDocId = Number(curOffset - seg.start_offset);
              if (allowedDocIds && !allowedDocIds.has(localDocId)) {
                curOffset += 1n;
                continue;
              }
              const matchRes = evaluateRecordResult(curOffset, r.routingKey, r.payload);
              if (Result46.isError(matchRes))
                return matchRes;
              if (matchRes.value.matched) {
                results.push({ offset: curOffset, payload: r.payload });
                bytesOut += r.payload.byteLength;
              }
              curOffset += 1n;
              if (matchRes.value.stop) {
                filterScanLimitReached = true;
                seq = curOffset;
                return Result46.ok(undefined);
              }
              if (results.length >= this.config.readMaxRecords || bytesOut >= this.config.readMaxBytes) {
                seq = curOffset;
                return Result46.ok(undefined);
              }
            }
          }
          return Result46.ok(undefined);
        }
        const limit = loadSegmentDataLimitFromSource(seg, source);
        let blockOffset = 0;
        let blockFirstOffset = seg.start_offset;
        while (blockOffset < limit) {
          const headerBytes = readRangeFromSource(source, blockOffset, blockOffset + DSB3_HEADER_BYTES - 1);
          const headerRes = parseBlockHeaderResult(headerBytes);
          if (Result46.isError(headerRes))
            return Result46.err({ kind: "internal", message: headerRes.error.message });
          const header = headerRes.value;
          const totalLen = DSB3_HEADER_BYTES + header.compressedLen;
          const blockStart = blockFirstOffset;
          const blockEnd = blockStart + BigInt(header.recordCount) - 1n;
          if (blockEnd < seq) {
            blockOffset += totalLen;
            blockFirstOffset = blockEnd + 1n;
            continue;
          }
          if (blockStart > endOffsetNum)
            break;
          if (keyBytes) {
            const bloom = new Bloom256(header.bloom);
            if (!bloom.maybeHas(keyBytes)) {
              blockOffset += totalLen;
              blockFirstOffset = blockEnd + 1n;
              continue;
            }
          }
          const blockBytes = readRangeFromSource(source, blockOffset, blockOffset + totalLen - 1);
          const decodedRes = decodeBlockResult(blockBytes);
          if (Result46.isError(decodedRes))
            return Result46.err({ kind: "internal", message: decodedRes.error.message });
          const decoded = decodedRes.value;
          let curOffset = blockStart;
          for (const r of decoded.records) {
            if (curOffset < seq) {
              curOffset += 1n;
              continue;
            }
            if (curOffset > endOffsetNum)
              break;
            const localDocId = Number(curOffset - seg.start_offset);
            if (allowedDocIds && !allowedDocIds.has(localDocId)) {
              curOffset += 1n;
              continue;
            }
            const matchRes = evaluateRecordResult(curOffset, r.routingKey, r.payload);
            if (Result46.isError(matchRes))
              return matchRes;
            if (matchRes.value.matched) {
              results.push({ offset: curOffset, payload: r.payload });
              bytesOut += r.payload.byteLength;
            }
            curOffset += 1n;
            if (matchRes.value.stop) {
              filterScanLimitReached = true;
              seq = curOffset;
              return Result46.ok(undefined);
            }
            if (results.length >= this.config.readMaxRecords || bytesOut >= this.config.readMaxBytes) {
              seq = curOffset;
              return Result46.ok(undefined);
            }
          }
          blockOffset += totalLen;
          blockFirstOffset = blockEnd + 1n;
        }
        return Result46.ok(undefined);
      };
      const sealedEndSeq = endOffsetNum < srow.sealed_through ? endOffsetNum : srow.sealed_through;
      const plannedSealedSegments = this.planSealedReadSegments(stream, seq, sealedEndSeq, candidateSegments, indexedThrough, "asc");
      if (plannedSealedSegments) {
        for (const seg of plannedSealedSegments.segments) {
          if (seg.end_offset < seq)
            continue;
          if (seg.start_offset > sealedEndSeq)
            break;
          let allowedDocIds = null;
          if (columnClauses.length > 0) {
            const docIdsRes = await this.resolveColumnCandidateDocIdsResult(stream, seg.segment_index, columnClauses);
            if (Result46.isError(docIdsRes))
              return Result46.err({ kind: "internal", message: docIdsRes.error.message });
            if (docIdsRes.value) {
              allowedDocIds = docIdsRes.value;
              if (allowedDocIds.size === 0) {
                seq = seg.end_offset + 1n;
                continue;
              }
            }
          }
          const preferFull = !keyBytes && this.config.readMaxBytes >= seg.size_bytes;
          if (preferFull) {
            const segBytes = await loadSegmentBytes(this.os, seg, this.diskCache, this.retryOpts());
            const scanRes = await scanSegmentBytes(segBytes, seg, allowedDocIds);
            if (Result46.isError(scanRes))
              return scanRes;
            if (filterScanLimitReached)
              return Result46.ok(finalize());
            if (results.length >= this.config.readMaxRecords || bytesOut >= this.config.readMaxBytes)
              return Result46.ok(finalize());
          } else {
            const source = await loadSegmentSource(this.os, seg, this.diskCache, this.retryOpts());
            const scanRes = await scanSegmentSource(source, seg, allowedDocIds);
            if (Result46.isError(scanRes))
              return scanRes;
            if (filterScanLimitReached)
              return Result46.ok(finalize());
            if (results.length >= this.config.readMaxRecords || bytesOut >= this.config.readMaxBytes)
              return Result46.ok(finalize());
          }
          seq = seg.end_offset + 1n;
        }
        if (seq <= plannedSealedSegments.sealedEndSeq) {
          seq = plannedSealedSegments.sealedEndSeq + 1n;
        }
      } else {
        while (seq <= endOffsetNum && seq <= srow.sealed_through) {
          const seg = this.db.findSegmentForOffset(stream, seq);
          if (!seg) {
            break;
          }
          if (candidateSegments && seg.segment_index < indexedThrough && !candidateSegments.has(seg.segment_index)) {
            seq = seg.end_offset + 1n;
            continue;
          }
          let allowedDocIds = null;
          if (columnClauses.length > 0) {
            const docIdsRes = await this.resolveColumnCandidateDocIdsResult(stream, seg.segment_index, columnClauses);
            if (Result46.isError(docIdsRes))
              return Result46.err({ kind: "internal", message: docIdsRes.error.message });
            if (docIdsRes.value) {
              allowedDocIds = docIdsRes.value;
              if (allowedDocIds.size === 0) {
                seq = seg.end_offset + 1n;
                continue;
              }
            }
          }
          const preferFull = !keyBytes && this.config.readMaxBytes >= seg.size_bytes;
          if (preferFull) {
            const segBytes = await loadSegmentBytes(this.os, seg, this.diskCache, this.retryOpts());
            const scanRes = await scanSegmentBytes(segBytes, seg, allowedDocIds);
            if (Result46.isError(scanRes))
              return scanRes;
            if (filterScanLimitReached)
              return Result46.ok(finalize());
            if (results.length >= this.config.readMaxRecords || bytesOut >= this.config.readMaxBytes)
              return Result46.ok(finalize());
          } else {
            const source = await loadSegmentSource(this.os, seg, this.diskCache, this.retryOpts());
            const scanRes = await scanSegmentSource(source, seg, allowedDocIds);
            if (Result46.isError(scanRes))
              return scanRes;
            if (filterScanLimitReached)
              return Result46.ok(finalize());
            if (results.length >= this.config.readMaxRecords || bytesOut >= this.config.readMaxBytes)
              return Result46.ok(finalize());
          }
          seq = seg.end_offset + 1n;
        }
      }
      if (seq <= endOffsetNum) {
        let hitLimit = false;
        for (const rec of this.db.iterWalRange(stream, seq, endOffsetNum, keyBytes ?? undefined)) {
          const s = BigInt(rec.offset);
          const payload = rec.payload;
          const routingKey = rec.routing_key == null ? null : rec.routing_key instanceof Uint8Array ? rec.routing_key : new Uint8Array(rec.routing_key);
          const matchRes = evaluateRecordResult(s, routingKey, payload);
          if (Result46.isError(matchRes))
            return matchRes;
          if (matchRes.value.matched) {
            results.push({ offset: s, payload });
            bytesOut += payload.byteLength;
          }
          if (matchRes.value.stop) {
            filterScanLimitReached = true;
            hitLimit = true;
            seq = s + 1n;
            break;
          }
          if (results.length >= this.config.readMaxRecords || bytesOut >= this.config.readMaxBytes) {
            hitLimit = true;
            seq = s + 1n;
            break;
          }
        }
        if (!hitLimit) {
          seq = endOffsetNum + 1n;
        }
      }
      return Result46.ok(finalize());
    } catch (e) {
      return Result46.err({ kind: "internal", message: errorMessage(e) });
    }
  }
  async read(args) {
    const res = await this.readResult(args);
    if (Result46.isError(res))
      throw dsError(res.error.message);
    return res.value;
  }
  async searchResult(args) {
    const startedAt = Date.now();
    const { stream, request } = args;
    const leaveSearchPhase = this.memorySampler?.enter("search", {
      stream,
      has_query: request.q != null,
      over_limit: this.memory?.isOverLimit() === true
    });
    const srow = this.db.getStream(stream);
    try {
      if (!srow || this.db.isDeleted(srow))
        return Result46.err({ kind: "not_found", message: "not_found" });
      if (srow.expires_at_ms != null && this.db.nowMs() > srow.expires_at_ms) {
        return Result46.err({ kind: "gone", message: "stream expired" });
      }
      const regRes = this.registry.getRegistryResult(stream);
      if (Result46.isError(regRes))
        return Result46.err({ kind: "internal", message: regRes.error.message });
      const registry = regRes.value;
      if (!registry.search)
        return Result46.err({ kind: "internal", message: "search is not configured for this stream" });
      const snapshotEndSeq = srow.next_offset - 1n;
      const snapshotEndOffset = encodeOffset(srow.epoch, snapshotEndSeq);
      const coverageState = this.computePublishedCoverageState(stream, srow, registry);
      const visibleSnapshotEndSeq = coverageState.canSearchWalTail ? snapshotEndSeq : coverageState.visibleThroughSeq < snapshotEndSeq ? coverageState.visibleThroughSeq : snapshotEndSeq;
      const visibleSealedThrough = coverageState.canSearchWalTail ? srow.sealed_through : coverageState.visibleThroughSeq < srow.sealed_through ? coverageState.visibleThroughSeq : srow.sealed_through;
      const deadline = request.timeoutMs == null ? null : Date.now() + request.timeoutMs;
      const leadingSort = request.sort[0] ?? null;
      const offsetSearchAfter = request.searchAfter && leadingSort?.kind === "offset" ? normalizeSearchAfterValue(leadingSort, request.searchAfter[0]) : null;
      const cursorFieldBound = resolveSearchCursorFieldBound(request);
      const primaryTimestampTopKSort = resolvePrimaryTimestampTopKSort(registry, request);
      const primaryTimestampRowsBySegment = primaryTimestampTopKSort && request.size > 0 ? this.currentSearchCompanionRowsBySegment(stream, registry) : null;
      const hits = [];
      let timedOut = false;
      const markTimedOutIfNeeded = () => {
        if (deadline == null || Date.now() < deadline)
          return false;
        timedOut = true;
        return true;
      };
      let indexedSegments = 0;
      let indexedSegmentTimeMs = 0;
      let ftsSectionGetMs = 0;
      let ftsDecodeMs = 0;
      let ftsClauseEstimateMs = 0;
      let scannedSegments = 0;
      let scannedSegmentTimeMs = 0;
      let scannedTailDocs = 0;
      let scannedTailTimeMs = 0;
      let candidateDocIds = 0;
      let decodedRecords = 0;
      let jsonParseTimeMs = 0;
      let segmentPayloadBytesFetched = 0;
      let sortTimeMs = 0;
      let peakHitsHeld = 0;
      const indexFamiliesUsed = new Set;
      const exactClauses = collectPositiveSearchExactClauses(request.q);
      const columnClauses = collectPositiveSearchColumnClauses(request.q);
      const ftsClauses = collectPositiveSearchFtsClauses(request.q);
      let exactCandidateInfo = { segments: null, indexedThrough: 0 };
      let exactCandidateTimeMs = 0;
      if (!markTimedOutIfNeeded()) {
        const exactCandidateStartedAt = Date.now();
        exactCandidateInfo = await this.resolveSearchExactCandidateSegments(stream, request.q);
        exactCandidateTimeMs = Date.now() - exactCandidateStartedAt;
        markTimedOutIfNeeded();
      }
      const collectSearchMatchResult = (offsetSeq, payload) => {
        const parseStartedAt = Date.now();
        const parsedRes = decodeJsonPayloadResult(this.registry, stream, offsetSeq, payload);
        jsonParseTimeMs += Date.now() - parseStartedAt;
        if (Result46.isError(parsedRes))
          return Result46.err({ kind: "internal", message: parsedRes.error.message });
        const evalRes = evaluateSearchQueryResult(registry, offsetSeq, request.q, parsedRes.value);
        if (Result46.isError(evalRes))
          return Result46.err({ kind: "internal", message: evalRes.error.message });
        if (!evalRes.value.matched)
          return Result46.ok(undefined);
        const fieldsRes = extractSearchHitFieldsResult(registry, offsetSeq, parsedRes.value);
        if (Result46.isError(fieldsRes))
          return Result46.err({ kind: "internal", message: fieldsRes.error.message });
        const sortInternal = buildSearchSortInternalValues(request.sort, fieldsRes.value, evalRes.value, offsetSeq);
        if (request.searchAfter && compareSearchAfterValues(sortInternal, request.sort, request.searchAfter) <= 0) {
          return Result46.ok(undefined);
        }
        const hit = {
          offsetSeq,
          offset: encodeOffset(srow.epoch, offsetSeq),
          score: evalRes.value.score,
          sortInternal,
          sortResponse: buildSearchSortResponseValues(request.sort, sortInternal, encodeOffset(srow.epoch, offsetSeq)),
          fields: fieldsRes.value,
          source: parsedRes.value
        };
        hits.push(hit);
        if (primaryTimestampTopKSort && request.size > 0 && hits.length > request.size) {
          hits.splice(worstSearchHitIndex(hits, request.sort), 1);
        }
        if (hits.length > peakHitsHeld)
          peakHitsHeld = hits.length;
        return Result46.ok(undefined);
      };
      const primaryTimestampTopKCutoff = () => {
        if (!primaryTimestampTopKSort || hits.length < request.size)
          return null;
        const worstHit = hits[worstSearchHitIndex(hits, request.sort)];
        const value = worstHit?.sortInternal[0];
        return typeof value === "bigint" ? value : null;
      };
      const primaryTimestampSegmentMayBeatTopK = (seg) => {
        if (!primaryTimestampTopKSort || !primaryTimestampRowsBySegment)
          return true;
        const cutoff = primaryTimestampTopKCutoff();
        if (cutoff == null)
          return true;
        const row = primaryTimestampRowsBySegment.get(seg.segment_index);
        if (row?.primary_timestamp_min_ms == null || row.primary_timestamp_max_ms == null)
          return true;
        if (primaryTimestampTopKSort.direction === "desc")
          return row.primary_timestamp_max_ms >= cutoff;
        return row.primary_timestamp_min_ms <= cutoff;
      };
      const scanSegmentForSearchResult = async (seg, allowedDocIds, rangeStartSeq, rangeEndSeq) => {
        if (markTimedOutIfNeeded())
          return Result46.ok(undefined);
        const segBytes = await loadSegmentBytes(this.os, seg, this.diskCache, this.retryOpts());
        segmentPayloadBytesFetched += seg.size_bytes;
        if (markTimedOutIfNeeded())
          return Result46.ok(undefined);
        let curOffset = seg.start_offset;
        for (const blockRes of iterateBlocksResult(segBytes)) {
          if (Result46.isError(blockRes))
            return Result46.err({ kind: "internal", message: blockRes.error.message });
          decodedRecords += blockRes.value.decoded.recordCount;
          for (const record of blockRes.value.decoded.records) {
            if (curOffset > rangeEndSeq)
              return Result46.ok(undefined);
            if (curOffset < rangeStartSeq) {
              curOffset += 1n;
              continue;
            }
            const localDocId = Number(curOffset - seg.start_offset);
            if (!allowedDocIds || allowedDocIds.has(localDocId)) {
              const matchRes = collectSearchMatchResult(curOffset, record.payload);
              if (Result46.isError(matchRes))
                return matchRes;
            }
            curOffset += 1n;
            if (markTimedOutIfNeeded())
              return Result46.ok(undefined);
          }
        }
        return Result46.ok(undefined);
      };
      const scanSegmentWithFamiliesResult = async (seg, rangeStartSeq, rangeEndSeq) => {
        const segmentStartedAt = Date.now();
        if (markTimedOutIfNeeded())
          return Result46.ok(undefined);
        if (exactCandidateInfo.segments && seg.segment_index < exactCandidateInfo.indexedThrough && !exactCandidateInfo.segments.has(seg.segment_index)) {
          return Result46.ok(undefined);
        }
        if (cursorFieldBound) {
          const overlapsCursor = await this.segmentMayOverlapSearchCursor(stream, seg.segment_index, cursorFieldBound);
          if (!overlapsCursor) {
            indexFamiliesUsed.add("col");
            indexedSegments += 1;
            indexedSegmentTimeMs += Date.now() - segmentStartedAt;
            return Result46.ok(undefined);
          }
        }
        if (markTimedOutIfNeeded())
          return Result46.ok(undefined);
        const familyCandidatesRes = await this.resolveSearchFamilyCandidatesResult(stream, seg.segment_index, exactClauses, columnClauses, ftsClauses, {
          addFtsSectionGetMs: (deltaMs) => {
            ftsSectionGetMs += deltaMs;
          },
          addFtsDecodeMs: (deltaMs) => {
            ftsDecodeMs += deltaMs;
          },
          addFtsClauseEstimateMs: (deltaMs) => {
            ftsClauseEstimateMs += deltaMs;
          }
        });
        if (Result46.isError(familyCandidatesRes))
          return Result46.err({ kind: "internal", message: familyCandidatesRes.error.message });
        if (markTimedOutIfNeeded())
          return Result46.ok(undefined);
        const familyCandidates = familyCandidatesRes.value;
        if (familyCandidates.docIds)
          candidateDocIds += familyCandidates.docIds.size;
        if (familyCandidates.docIds && familyCandidates.docIds.size === 0) {
          indexedSegments += familyCandidates.usedFamilies.size > 0 ? 1 : 0;
          for (const family of familyCandidates.usedFamilies)
            indexFamiliesUsed.add(family);
          if (familyCandidates.usedFamilies.size > 0)
            indexedSegmentTimeMs += Date.now() - segmentStartedAt;
          return Result46.ok(undefined);
        }
        const usedIndexedFamilies = familyCandidates.usedFamilies.size > 0;
        if (familyCandidates.usedFamilies.size > 0) {
          indexedSegments += 1;
          for (const family of familyCandidates.usedFamilies)
            indexFamiliesUsed.add(family);
        } else {
          scannedSegments += 1;
        }
        const scanRes = await scanSegmentForSearchResult(seg, familyCandidates.docIds, rangeStartSeq, rangeEndSeq);
        if (Result46.isError(scanRes))
          return scanRes;
        if (usedIndexedFamilies)
          indexedSegmentTimeMs += Date.now() - segmentStartedAt;
        else
          scannedSegmentTimeMs += Date.now() - segmentStartedAt;
        return Result46.ok(undefined);
      };
      const stopIfPageComplete = () => hits.length >= request.size;
      const scanWalTailResult = (startSeq, endSeq, direction, stopOnPageComplete) => {
        const tailStartedAt = Date.now();
        const hotOffsetsRes = this.hotWalExactOffsetsResult(stream, startSeq, endSeq, exactClauses, registry);
        if (Result46.isError(hotOffsetsRes))
          return hotOffsetsRes;
        const hotOffsets = hotOffsetsRes.value;
        if (hotOffsets) {
          candidateDocIds += hotOffsets.length;
          const orderedOffsets = direction === "desc" ? [...hotOffsets].reverse() : hotOffsets;
          for (const offsetSeq of orderedOffsets) {
            const record = this.walRecordAt(stream, offsetSeq);
            if (!record)
              continue;
            scannedTailDocs += 1;
            const matchRes = collectSearchMatchResult(record.offset, record.payload);
            if (Result46.isError(matchRes))
              return matchRes;
            if (markTimedOutIfNeeded())
              break;
            if (stopOnPageComplete && stopIfPageComplete())
              break;
          }
          scannedTailTimeMs += Date.now() - tailStartedAt;
          return Result46.ok(undefined);
        }
        const rows = direction === "desc" ? this.db.iterWalRangeDesc(stream, startSeq, endSeq) : this.db.iterWalRange(stream, startSeq, endSeq);
        for (const record of rows) {
          scannedTailDocs += 1;
          const matchRes = collectSearchMatchResult(BigInt(record.offset), record.payload);
          if (Result46.isError(matchRes))
            return matchRes;
          if (markTimedOutIfNeeded())
            break;
          if (stopOnPageComplete && stopIfPageComplete())
            break;
        }
        scannedTailTimeMs += Date.now() - tailStartedAt;
        return Result46.ok(undefined);
      };
      if (leadingSort?.kind === "offset") {
        const descending = leadingSort.direction === "desc";
        const rangeStartSeq = descending ? 0n : typeof offsetSearchAfter === "bigint" ? offsetSearchAfter + 1n : 0n;
        const requestedRangeEndSeq = descending ? typeof offsetSearchAfter === "bigint" ? offsetSearchAfter - 1n : snapshotEndSeq : snapshotEndSeq;
        const rangeEndSeq = requestedRangeEndSeq < visibleSnapshotEndSeq ? requestedRangeEndSeq : visibleSnapshotEndSeq;
        if (rangeStartSeq <= rangeEndSeq) {
          if (descending) {
            const tailStart = srow.sealed_through + 1n;
            if (coverageState.canSearchWalTail && tailStart <= rangeEndSeq) {
              const walStart = rangeStartSeq > tailStart ? rangeStartSeq : tailStart;
              const walEnd = rangeEndSeq;
              if (walStart <= walEnd) {
                const tailRes = scanWalTailResult(walStart, walEnd, "desc", true);
                if (Result46.isError(tailRes))
                  return tailRes;
              }
            }
            if (!timedOut && !stopIfPageComplete()) {
              const sealedEnd2 = rangeEndSeq < visibleSealedThrough ? rangeEndSeq : visibleSealedThrough;
              if (sealedEnd2 >= rangeStartSeq) {
                const plannedSealedSegments2 = this.planSealedReadSegments(stream, rangeStartSeq, sealedEnd2, exactCandidateInfo.segments, exactCandidateInfo.indexedThrough, "desc");
                if (plannedSealedSegments2) {
                  for (const seg of plannedSealedSegments2.segments) {
                    const scanRes = await this.scanSegmentReverseForSearchResult(stream, seg, exactCandidateInfo, cursorFieldBound, exactClauses, columnClauses, ftsClauses, rangeStartSeq, sealedEnd2, {
                      indexFamiliesUsed,
                      collectSearchMatchResult,
                      deadline,
                      isTimedOut: () => timedOut,
                      setTimedOut: (next) => {
                        timedOut = next;
                      },
                      stopIfPageComplete,
                      addIndexedSegment: () => {
                        indexedSegments += 1;
                      },
                      addScannedSegment: () => {
                        scannedSegments += 1;
                      },
                      addIndexedSegmentTimeMs: (deltaMs) => {
                        indexedSegmentTimeMs += deltaMs;
                      },
                      addFtsSectionGetMs: (deltaMs) => {
                        ftsSectionGetMs += deltaMs;
                      },
                      addFtsDecodeMs: (deltaMs) => {
                        ftsDecodeMs += deltaMs;
                      },
                      addFtsClauseEstimateMs: (deltaMs) => {
                        ftsClauseEstimateMs += deltaMs;
                      },
                      addScannedSegmentTimeMs: (deltaMs) => {
                        scannedSegmentTimeMs += deltaMs;
                      },
                      addCandidateDocIds: (count) => {
                        candidateDocIds += count;
                      },
                      addDecodedRecords: (count) => {
                        decodedRecords += count;
                      },
                      addSegmentPayloadBytesFetched: (count) => {
                        segmentPayloadBytesFetched += count;
                      }
                    });
                    if (Result46.isError(scanRes))
                      return scanRes;
                    if (timedOut || stopIfPageComplete())
                      break;
                  }
                } else {
                  const startSeg = this.db.findSegmentForOffset(stream, sealedEnd2);
                  let segmentIndex = startSeg?.segment_index ?? this.db.countSegmentsForStream(stream) - 1;
                  while (segmentIndex >= 0) {
                    const seg = this.db.getSegmentByIndex(stream, segmentIndex);
                    if (!seg) {
                      segmentIndex -= 1;
                      continue;
                    }
                    if (seg.end_offset < rangeStartSeq)
                      break;
                    if (seg.start_offset > sealedEnd2) {
                      segmentIndex -= 1;
                      continue;
                    }
                    const scanRes = await this.scanSegmentReverseForSearchResult(stream, seg, exactCandidateInfo, cursorFieldBound, exactClauses, columnClauses, ftsClauses, rangeStartSeq, sealedEnd2, {
                      indexFamiliesUsed,
                      collectSearchMatchResult,
                      deadline,
                      isTimedOut: () => timedOut,
                      setTimedOut: (next) => {
                        timedOut = next;
                      },
                      stopIfPageComplete,
                      addIndexedSegment: () => {
                        indexedSegments += 1;
                      },
                      addScannedSegment: () => {
                        scannedSegments += 1;
                      },
                      addIndexedSegmentTimeMs: (deltaMs) => {
                        indexedSegmentTimeMs += deltaMs;
                      },
                      addFtsSectionGetMs: (deltaMs) => {
                        ftsSectionGetMs += deltaMs;
                      },
                      addFtsDecodeMs: (deltaMs) => {
                        ftsDecodeMs += deltaMs;
                      },
                      addFtsClauseEstimateMs: (deltaMs) => {
                        ftsClauseEstimateMs += deltaMs;
                      },
                      addScannedSegmentTimeMs: (deltaMs) => {
                        scannedSegmentTimeMs += deltaMs;
                      },
                      addCandidateDocIds: (count) => {
                        candidateDocIds += count;
                      },
                      addDecodedRecords: (count) => {
                        decodedRecords += count;
                      },
                      addSegmentPayloadBytesFetched: (count) => {
                        segmentPayloadBytesFetched += count;
                      }
                    });
                    if (Result46.isError(scanRes))
                      return scanRes;
                    if (timedOut || stopIfPageComplete())
                      break;
                    segmentIndex -= 1;
                  }
                }
              }
            }
          } else {
            let seq2 = rangeStartSeq;
            const sealedEnd2 = rangeEndSeq < visibleSealedThrough ? rangeEndSeq : visibleSealedThrough;
            const plannedSealedSegments2 = this.planSealedReadSegments(stream, rangeStartSeq, sealedEnd2, exactCandidateInfo.segments, exactCandidateInfo.indexedThrough, "asc");
            if (plannedSealedSegments2) {
              for (const seg of plannedSealedSegments2.segments) {
                const scanRes = await scanSegmentWithFamiliesResult(seg, rangeStartSeq, rangeEndSeq);
                if (Result46.isError(scanRes))
                  return scanRes;
                seq2 = seg.end_offset + 1n;
                if (timedOut || stopIfPageComplete())
                  break;
              }
              if (seq2 <= plannedSealedSegments2.sealedEndSeq)
                seq2 = plannedSealedSegments2.sealedEndSeq + 1n;
            } else {
              while (seq2 <= rangeEndSeq && seq2 <= visibleSealedThrough) {
                const seg = this.db.findSegmentForOffset(stream, seq2);
                if (!seg)
                  break;
                const scanRes = await scanSegmentWithFamiliesResult(seg, rangeStartSeq, rangeEndSeq);
                if (Result46.isError(scanRes))
                  return scanRes;
                seq2 = seg.end_offset + 1n;
                if (timedOut || stopIfPageComplete())
                  break;
              }
            }
            if (!timedOut && !stopIfPageComplete() && coverageState.canSearchWalTail && seq2 <= rangeEndSeq) {
              const tailRes = scanWalTailResult(seq2, rangeEndSeq, "asc", true);
              if (Result46.isError(tailRes))
                return tailRes;
            }
          }
        }
        const pageHits2 = hits.slice(0, request.size);
        const nextSearchAfter2 = pageHits2.length === request.size ? pageHits2[pageHits2.length - 1].sortResponse : null;
        const exactTotalKnown2 = !timedOut && coverageState.complete && nextSearchAfter2 == null;
        return Result46.ok({
          stream,
          snapshotEndOffset,
          tookMs: Date.now() - startedAt,
          timedOut,
          timeoutMs: request.timeoutMs,
          coverage: {
            mode: coverageState.mode,
            complete: coverageState.complete && !timedOut,
            streamHeadOffset: coverageState.streamHeadOffset,
            visibleThroughOffset: coverageState.visibleThroughOffset,
            visibleThroughPrimaryTimestampMax: coverageState.visibleThroughPrimaryTimestampMax,
            oldestOmittedAppendAt: coverageState.oldestOmittedAppendAt,
            possibleMissingEventsUpperBound: coverageState.possibleMissingEventsUpperBound,
            possibleMissingUploadedSegments: coverageState.possibleMissingUploadedSegments,
            possibleMissingSealedRows: coverageState.possibleMissingSealedRows,
            possibleMissingWalRows: coverageState.possibleMissingWalRows,
            indexedSegments,
            indexedSegmentTimeMs,
            ftsSectionGetMs,
            ftsDecodeMs,
            ftsClauseEstimateMs,
            scannedSegments,
            scannedSegmentTimeMs,
            scannedTailDocs,
            scannedTailTimeMs,
            exactCandidateTimeMs,
            candidateDocIds,
            decodedRecords,
            jsonParseTimeMs,
            segmentPayloadBytesFetched,
            sortTimeMs,
            peakHitsHeld,
            indexFamiliesUsed: Array.from(indexFamiliesUsed).sort()
          },
          total: {
            value: pageHits2.length,
            relation: exactTotalKnown2 ? "eq" : "gte"
          },
          hits: pageHits2.map((hit) => ({
            offset: hit.offset,
            score: hit.score,
            sort: hit.sortResponse,
            fields: hit.fields,
            source: hit.source
          })),
          nextSearchAfter: nextSearchAfter2
        });
      }
      let seq = 0n;
      const sealedEnd = visibleSnapshotEndSeq < visibleSealedThrough ? visibleSnapshotEndSeq : visibleSealedThrough;
      const plannedSealedSegments = this.planSealedReadSegments(stream, 0n, sealedEnd, exactCandidateInfo.segments, exactCandidateInfo.indexedThrough, "asc");
      const allSealedSegments = primaryTimestampTopKSort && !plannedSealedSegments ? this.planAllSealedReadSegments(stream, 0n, sealedEnd, "asc") : null;
      const sealedSegmentPlan = plannedSealedSegments ?? allSealedSegments;
      if (sealedSegmentPlan) {
        const sealedSegments = primaryTimestampTopKSort && primaryTimestampRowsBySegment ? orderSegmentsByPrimaryTimestampBounds(sealedSegmentPlan.segments, primaryTimestampRowsBySegment, primaryTimestampTopKSort.direction) : sealedSegmentPlan.segments;
        for (const seg of sealedSegments) {
          if (!primaryTimestampSegmentMayBeatTopK(seg))
            break;
          const scanRes = await scanSegmentWithFamiliesResult(seg, 0n, snapshotEndSeq);
          if (Result46.isError(scanRes))
            return scanRes;
          if (seg.end_offset >= seq)
            seq = seg.end_offset + 1n;
          if (timedOut)
            break;
        }
        if (seq <= sealedSegmentPlan.sealedEndSeq)
          seq = sealedSegmentPlan.sealedEndSeq + 1n;
      } else {
        while (seq <= visibleSnapshotEndSeq && seq <= visibleSealedThrough) {
          const seg = this.db.findSegmentForOffset(stream, seq);
          if (!seg)
            break;
          if (!primaryTimestampSegmentMayBeatTopK(seg))
            break;
          const scanRes = await scanSegmentWithFamiliesResult(seg, 0n, snapshotEndSeq);
          if (Result46.isError(scanRes))
            return scanRes;
          seq = seg.end_offset + 1n;
          if (timedOut)
            break;
        }
      }
      if (!timedOut && coverageState.canSearchWalTail && seq <= snapshotEndSeq) {
        const tailRes = scanWalTailResult(seq, snapshotEndSeq, "asc", false);
        if (Result46.isError(tailRes))
          return tailRes;
      }
      const sortStartedAt = Date.now();
      hits.sort((left, right) => compareSearchHits(left, right, request.sort));
      sortTimeMs += Date.now() - sortStartedAt;
      const pageHits = hits.slice(0, request.size);
      const nextSearchAfter = pageHits.length === request.size ? pageHits[pageHits.length - 1].sortResponse : null;
      const exactTotalKnown = !timedOut && coverageState.complete && nextSearchAfter == null;
      return Result46.ok({
        stream,
        snapshotEndOffset,
        tookMs: Date.now() - startedAt,
        timedOut,
        timeoutMs: request.timeoutMs,
        coverage: {
          mode: coverageState.mode,
          complete: coverageState.complete && !timedOut,
          streamHeadOffset: coverageState.streamHeadOffset,
          visibleThroughOffset: coverageState.visibleThroughOffset,
          visibleThroughPrimaryTimestampMax: coverageState.visibleThroughPrimaryTimestampMax,
          oldestOmittedAppendAt: coverageState.oldestOmittedAppendAt,
          possibleMissingEventsUpperBound: coverageState.possibleMissingEventsUpperBound,
          possibleMissingUploadedSegments: coverageState.possibleMissingUploadedSegments,
          possibleMissingSealedRows: coverageState.possibleMissingSealedRows,
          possibleMissingWalRows: coverageState.possibleMissingWalRows,
          indexedSegments,
          indexedSegmentTimeMs,
          ftsSectionGetMs,
          ftsDecodeMs,
          ftsClauseEstimateMs,
          scannedSegments,
          scannedSegmentTimeMs,
          scannedTailDocs,
          scannedTailTimeMs,
          exactCandidateTimeMs,
          candidateDocIds,
          decodedRecords,
          jsonParseTimeMs,
          segmentPayloadBytesFetched,
          sortTimeMs,
          peakHitsHeld,
          indexFamiliesUsed: Array.from(indexFamiliesUsed).sort()
        },
        total: {
          value: pageHits.length,
          relation: exactTotalKnown ? "eq" : "gte"
        },
        hits: pageHits.map((hit) => ({
          offset: hit.offset,
          score: hit.score,
          sort: hit.sortResponse,
          fields: hit.fields,
          source: hit.source
        })),
        nextSearchAfter
      });
    } catch (e) {
      return Result46.err({ kind: "internal", message: errorMessage(e) });
    } finally {
      leaveSearchPhase?.();
    }
  }
  async search(args) {
    const res = await this.searchResult(args);
    if (Result46.isError(res))
      throw dsError(res.error.message);
    return res.value;
  }
  async aggregateResult(args) {
    const { stream, request } = args;
    const leaveAggregatePhase = this.memorySampler?.enter("aggregate", {
      stream,
      rollup: request.rollup,
      over_limit: this.memory?.isOverLimit() === true
    });
    const srow = this.db.getStream(stream);
    try {
      if (!srow || this.db.isDeleted(srow))
        return Result46.err({ kind: "not_found", message: "not_found" });
      if (srow.expires_at_ms != null && this.db.nowMs() > srow.expires_at_ms) {
        return Result46.err({ kind: "gone", message: "stream expired" });
      }
      const regRes = this.registry.getRegistryResult(stream);
      if (Result46.isError(regRes))
        return Result46.err({ kind: "internal", message: regRes.error.message });
      const registry = regRes.value;
      const rollup = registry.search?.rollups?.[request.rollup];
      if (!registry.search || !rollup) {
        return Result46.err({ kind: "internal", message: "rollup is not configured for this stream" });
      }
      const coverageState = this.computePublishedCoverageState(stream, srow, registry);
      const intervalMs = request.intervalMs;
      const intervalBig = BigInt(intervalMs);
      const fromMs = Number(request.fromMs);
      const toMs = Number(request.toMs);
      const fullStartMs = Number((request.fromMs + intervalBig - 1n) / intervalBig * intervalBig);
      const fullEndMs = Number(request.toMs / intervalBig * intervalBig);
      const hasFullWindows = fullEndMs > fullStartMs;
      const dimensions = new Set(rollup.dimensions ?? []);
      const eligibility = extractRollupEligibility(request.q, dimensions);
      const selectedMeasures = new Set(request.measures ?? Object.keys(rollup.measures));
      const timestampField = rollup.timestampField ?? registry.search.primaryTimestampField;
      const primaryTimestampField = registry.search.primaryTimestampField;
      const usesPrimaryTimestampBounds = timestampField === primaryTimestampField;
      const buckets = new Map;
      const indexedSegmentSet = new Set;
      const scannedSegmentSet = new Set;
      let scannedTailDocs = 0;
      const indexFamiliesUsed = new Set;
      const metricsProfile = registry.search.profile === "metrics";
      let usedRollups = false;
      const mergeBucketMeasures = (bucketStartMs, dimensionsKey, measures) => {
        let groups = buckets.get(bucketStartMs);
        if (!groups) {
          groups = new Map;
          buckets.set(bucketStartMs, groups);
        }
        const projectedKey = {};
        for (const field of request.groupBy)
          projectedKey[field] = dimensionsKey[field] ?? null;
        const groupKey = JSON.stringify(projectedKey);
        let group = groups.get(groupKey);
        if (!group) {
          group = { key: projectedKey, measures: {} };
          groups.set(groupKey, group);
        }
        for (const [measureName, state] of Object.entries(measures)) {
          if (!selectedMeasures.has(measureName))
            continue;
          const existing = group.measures[measureName];
          if (!existing) {
            group.measures[measureName] = cloneAggMeasureState(state);
            continue;
          }
          group.measures[measureName] = mergeAggMeasureState(existing, state);
        }
      };
      const matchesExactFilters = (dimensionsKey) => {
        for (const [field, value] of Object.entries(eligibility.exactFilters)) {
          if ((dimensionsKey[field] ?? null) !== value)
            return false;
        }
        return true;
      };
      const partialRanges = [];
      if (!eligibility.eligible || !hasFullWindows) {
        partialRanges.push({ startMs: fromMs, endMs: toMs });
      } else {
        if (fromMs < fullStartMs)
          partialRanges.push({ startMs: fromMs, endMs: fullStartMs });
        if (fullEndMs < toMs)
          partialRanges.push({ startMs: fullEndMs, endMs: toMs });
      }
      const scanSegmentForAggregateResult = async (seg, scanRanges) => {
        const segBytes = await loadSegmentBytes(this.os, seg, this.diskCache, this.retryOpts());
        let curOffset = seg.start_offset;
        for (const blockRes of iterateBlocksResult(segBytes)) {
          if (Result46.isError(blockRes))
            return Result46.err({ kind: "internal", message: blockRes.error.message });
          for (const record of blockRes.value.decoded.records) {
            const parsedRes = decodeJsonPayloadResult(this.registry, stream, curOffset, record.payload);
            if (Result46.isError(parsedRes))
              return Result46.err({ kind: "internal", message: parsedRes.error.message });
            const contributionRes = extractRollupContributionResult(registry, rollup, curOffset, parsedRes.value);
            if (Result46.isError(contributionRes))
              return Result46.err({ kind: "internal", message: contributionRes.error.message });
            const contribution = contributionRes.value;
            if (!contribution) {
              curOffset += 1n;
              continue;
            }
            const inRange = scanRanges.some((range) => contribution.timestampMs >= range.startMs && contribution.timestampMs < range.endMs);
            if (!inRange) {
              curOffset += 1n;
              continue;
            }
            if (request.q) {
              const evalRes = evaluateSearchQueryResult(registry, curOffset, request.q, parsedRes.value);
              if (Result46.isError(evalRes))
                return Result46.err({ kind: "internal", message: evalRes.error.message });
              if (!evalRes.value.matched) {
                curOffset += 1n;
                continue;
              }
            }
            const bucketStartMs = Math.floor(contribution.timestampMs / intervalMs) * intervalMs;
            mergeBucketMeasures(bucketStartMs, contribution.dimensions, contribution.measures);
            curOffset += 1n;
          }
        }
        scannedSegmentSet.add(seg.segment_index);
        return Result46.ok(undefined);
      };
      const segmentMayOverlapAggregateRange = async (seg, startMs, endMs) => {
        if (usesPrimaryTimestampBounds) {
          const companionRow = this.db.getSearchSegmentCompanion(stream, seg.segment_index);
          if (companionRow?.primary_timestamp_min_ms != null && companionRow.primary_timestamp_max_ms != null) {
            return companionRow.primary_timestamp_max_ms >= BigInt(startMs) && companionRow.primary_timestamp_min_ms < BigInt(endMs);
          }
        }
        return this.segmentMayOverlapTimeRange(stream, seg.segment_index, startMs, endMs, timestampField);
      };
      const scanMetricsBlockForAggregateResult = async (seg, companion, scanRanges) => {
        for (const record of companion.records()) {
          const offsetSeq = seg.start_offset + BigInt(record.doc_id);
          const timestampMs = record.windowStartMs;
          const inRange = scanRanges.some((range) => timestampMs >= range.startMs && timestampMs < range.endMs);
          if (!inRange)
            continue;
          const materialized = materializeMetricsBlockRecord(record);
          if (request.q) {
            const evalRes = evaluateSearchQueryResult(registry, offsetSeq, request.q, materialized);
            if (Result46.isError(evalRes))
              return Result46.err({ kind: "internal", message: evalRes.error.message });
            if (!evalRes.value.matched)
              continue;
          }
          const contributionRes = extractRollupContributionResult(registry, rollup, offsetSeq, materialized);
          if (Result46.isError(contributionRes))
            return Result46.err({ kind: "internal", message: contributionRes.error.message });
          const contribution = contributionRes.value;
          if (!contribution)
            continue;
          const bucketStartMs = Math.floor(contribution.timestampMs / intervalMs) * intervalMs;
          mergeBucketMeasures(bucketStartMs, contribution.dimensions, contribution.measures);
        }
        indexedSegmentSet.add(seg.segment_index);
        indexFamiliesUsed.add("mblk");
        return Result46.ok(undefined);
      };
      for (const seg of this.db.listSegmentsForStream(stream)) {
        if (seg.segment_index >= coverageState.visiblePublishedSegmentCount)
          break;
        let coveredAlignedWindows = false;
        if (eligibility.eligible && this.index && hasFullWindows) {
          const overlapsAlignedWindow = await segmentMayOverlapAggregateRange(seg, fullStartMs, fullEndMs);
          if (overlapsAlignedWindow) {
            const companion = await this.index.getAggSegmentCompanion(stream, seg.segment_index);
            const intervalCompanion = companion?.getInterval(request.rollup, intervalMs);
            if (intervalCompanion) {
              coveredAlignedWindows = true;
              indexedSegmentSet.add(seg.segment_index);
              indexFamiliesUsed.add("agg");
              usedRollups = true;
              intervalCompanion.forEachGroupInRange(fullStartMs, fullEndMs, (windowStartMs, group) => {
                if (!matchesExactFilters(group.dimensions))
                  return;
                mergeBucketMeasures(windowStartMs, group.dimensions, group.measures);
              });
            }
          }
        }
        const scanRanges = !eligibility.eligible || !hasFullWindows ? [{ startMs: fromMs, endMs: toMs }] : coveredAlignedWindows ? partialRanges : [{ startMs: fromMs, endMs: toMs }];
        if (scanRanges.length === 0)
          continue;
        let overlaps = false;
        for (const range of scanRanges) {
          if (await segmentMayOverlapAggregateRange(seg, range.startMs, range.endMs)) {
            overlaps = true;
            break;
          }
        }
        if (!overlaps)
          continue;
        let scanRes;
        if (metricsProfile && this.index) {
          const companion = await this.index.getMetricsBlockSegmentCompanion(stream, seg.segment_index);
          if (companion) {
            scanRes = await scanMetricsBlockForAggregateResult(seg, companion, scanRanges);
          } else {
            scanRes = await scanSegmentForAggregateResult(seg, scanRanges);
          }
        } else {
          scanRes = await scanSegmentForAggregateResult(seg, scanRanges);
        }
        if (Result46.isError(scanRes))
          return scanRes;
      }
      const tailStart = srow.sealed_through + 1n;
      const tailEnd = srow.next_offset - 1n;
      if (coverageState.canSearchWalTail && tailStart <= tailEnd) {
        for (const record of this.db.iterWalRange(stream, tailStart, tailEnd)) {
          scannedTailDocs += 1;
          const parsedRes = decodeJsonPayloadResult(this.registry, stream, BigInt(record.offset), record.payload);
          if (Result46.isError(parsedRes))
            return Result46.err({ kind: "internal", message: parsedRes.error.message });
          const contributionRes = extractRollupContributionResult(registry, rollup, BigInt(record.offset), parsedRes.value);
          if (Result46.isError(contributionRes))
            return Result46.err({ kind: "internal", message: contributionRes.error.message });
          const contribution = contributionRes.value;
          if (!contribution || contribution.timestampMs < fromMs || contribution.timestampMs >= toMs)
            continue;
          if (request.q) {
            const evalRes = evaluateSearchQueryResult(registry, BigInt(record.offset), request.q, parsedRes.value);
            if (Result46.isError(evalRes))
              return Result46.err({ kind: "internal", message: evalRes.error.message });
            if (!evalRes.value.matched)
              continue;
          }
          const bucketStartMs = Math.floor(contribution.timestampMs / intervalMs) * intervalMs;
          mergeBucketMeasures(bucketStartMs, contribution.dimensions, contribution.measures);
        }
      }
      const bucketList = Array.from(buckets.entries()).sort((a, b) => a[0] - b[0]).map(([startMs, groups]) => ({
        start: new Date(startMs).toISOString(),
        end: new Date(startMs + intervalMs).toISOString(),
        groups: Array.from(groups.values()).sort((a, b) => JSON.stringify(a.key).localeCompare(JSON.stringify(b.key))).map((group) => ({
          key: group.key,
          measures: Object.fromEntries(Object.entries(group.measures).sort((a, b) => a[0].localeCompare(b[0])).map(([name, state]) => [name, formatAggMeasureState(state)]))
        }))
      }));
      return Result46.ok({
        stream,
        rollup: request.rollup,
        from: new Date(fromMs).toISOString(),
        to: new Date(toMs).toISOString(),
        interval: request.interval,
        coverage: {
          mode: coverageState.mode,
          complete: coverageState.complete,
          streamHeadOffset: coverageState.streamHeadOffset,
          visibleThroughOffset: coverageState.visibleThroughOffset,
          visibleThroughPrimaryTimestampMax: coverageState.visibleThroughPrimaryTimestampMax,
          oldestOmittedAppendAt: coverageState.oldestOmittedAppendAt,
          possibleMissingEventsUpperBound: coverageState.possibleMissingEventsUpperBound,
          possibleMissingUploadedSegments: coverageState.possibleMissingUploadedSegments,
          possibleMissingSealedRows: coverageState.possibleMissingSealedRows,
          possibleMissingWalRows: coverageState.possibleMissingWalRows,
          usedRollups,
          indexedSegments: indexedSegmentSet.size,
          scannedSegments: scannedSegmentSet.size,
          scannedTailDocs,
          indexFamiliesUsed: Array.from(indexFamiliesUsed).sort()
        },
        buckets: bucketList
      });
    } catch (e) {
      return Result46.err({ kind: "internal", message: errorMessage(e) });
    } finally {
      leaveAggregatePhase?.();
    }
  }
  async aggregate(args) {
    const res = await this.aggregateResult(args);
    if (Result46.isError(res))
      throw dsError(res.error.message);
    return res.value;
  }
  async loadSegmentRangeBlockReaderResult(seg) {
    const objectKey = segmentObjectKey(streamHash16Hex(seg.stream), seg.segment_index);
    let fetchedBytes = 0;
    const readRange = async (start, end) => {
      const bytes = await retry(async () => {
        const res = await this.os.get(objectKey, { range: { start, end } });
        if (!res)
          throw dsError(`object store missing segment: ${objectKey}`);
        return res;
      }, this.retryOpts());
      fetchedBytes += bytes.byteLength;
      return Result46.ok(bytes);
    };
    if (seg.size_bytes < 8)
      return Result46.ok(null);
    const tailRes = await readRange(seg.size_bytes - 8, seg.size_bytes - 1);
    if (Result46.isError(tailRes))
      return tailRes;
    const tail = tailRes.value;
    if (tail.byteLength < 8)
      return Result46.ok(null);
    const magic = String.fromCharCode(tail[4], tail[5], tail[6], tail[7]);
    if (magic !== "DSF1")
      return Result46.ok(null);
    const footerLen = readU32BE(tail, 0);
    const footerStart = seg.size_bytes - 8 - footerLen;
    if (footerStart < 0)
      return Result46.ok(null);
    const footerRes = await readRange(footerStart, footerStart + footerLen - 1);
    if (Result46.isError(footerRes))
      return footerRes;
    const footer = parseFooterBytes(footerRes.value);
    if (!footer?.blocks)
      return Result46.ok(null);
    return Result46.ok({
      blocks: footer.blocks,
      readBlock: async (block) => {
        const totalLen = DSB3_HEADER_BYTES + block.compressedLen;
        return readRange(block.blockOffset, block.blockOffset + totalLen - 1);
      },
      fetchedBytes: () => fetchedBytes
    });
  }
  async scanSegmentReverseForSearchResult(stream, seg, exactCandidateInfo, cursorFieldBound, exactClauses, columnClauses, ftsClauses, rangeStartSeq, rangeEndSeq, state) {
    const segmentStartedAt = Date.now();
    const markTimedOutIfNeeded = () => {
      if (state.deadline == null || Date.now() < state.deadline)
        return false;
      state.setTimedOut(true);
      return true;
    };
    if (markTimedOutIfNeeded())
      return Result46.ok(undefined);
    if (exactCandidateInfo.segments && seg.segment_index < exactCandidateInfo.indexedThrough && !exactCandidateInfo.segments.has(seg.segment_index)) {
      return Result46.ok(undefined);
    }
    if (cursorFieldBound) {
      const overlapsCursor = await this.segmentMayOverlapSearchCursor(stream, seg.segment_index, cursorFieldBound);
      if (!overlapsCursor) {
        state.indexFamiliesUsed.add("col");
        state.addIndexedSegment();
        state.addIndexedSegmentTimeMs(Date.now() - segmentStartedAt);
        return Result46.ok(undefined);
      }
    }
    if (markTimedOutIfNeeded())
      return Result46.ok(undefined);
    const familyCandidatesRes = await this.resolveSearchFamilyCandidatesResult(stream, seg.segment_index, exactClauses, columnClauses, ftsClauses, {
      addFtsSectionGetMs: state.addFtsSectionGetMs,
      addFtsDecodeMs: state.addFtsDecodeMs,
      addFtsClauseEstimateMs: state.addFtsClauseEstimateMs
    });
    if (Result46.isError(familyCandidatesRes))
      return Result46.err({ kind: "internal", message: familyCandidatesRes.error.message });
    if (markTimedOutIfNeeded())
      return Result46.ok(undefined);
    const familyCandidates = familyCandidatesRes.value;
    if (familyCandidates.docIds)
      state.addCandidateDocIds(familyCandidates.docIds.size);
    if (familyCandidates.docIds && familyCandidates.docIds.size === 0) {
      if (familyCandidates.usedFamilies.size > 0)
        state.addIndexedSegment();
      for (const family of familyCandidates.usedFamilies)
        state.indexFamiliesUsed.add(family);
      if (familyCandidates.usedFamilies.size > 0)
        state.addIndexedSegmentTimeMs(Date.now() - segmentStartedAt);
      return Result46.ok(undefined);
    }
    const usedIndexedFamilies = familyCandidates.usedFamilies.size > 0;
    if (familyCandidates.usedFamilies.size > 0) {
      state.addIndexedSegment();
      for (const family of familyCandidates.usedFamilies)
        state.indexFamiliesUsed.add(family);
    } else {
      state.addScannedSegment();
    }
    const addSegmentTime = () => {
      if (usedIndexedFamilies)
        state.addIndexedSegmentTimeMs(Date.now() - segmentStartedAt);
      else
        state.addScannedSegmentTimeMs(Date.now() - segmentStartedAt);
    };
    const scanCandidateDocIdsWithBlocksResult = async (blocks, readBlock) => {
      const candidateDocIds = Array.from(familyCandidates.docIds).filter((docId) => {
        const offsetSeq = seg.start_offset + BigInt(docId);
        return offsetSeq >= rangeStartSeq && offsetSeq <= rangeEndSeq;
      }).sort((left, right) => right - left);
      let currentBlockIndex = -1;
      let currentBlockStartOffset = 0n;
      let currentRecords = [];
      for (const docId of candidateDocIds) {
        const offsetSeq = seg.start_offset + BigInt(docId);
        const blockIndex = findFirstRelevantBlockIndex(blocks, offsetSeq);
        const block = blocks[blockIndex];
        const blockStartOffset = block.firstOffset;
        const blockEndOffset2 = blockStartOffset + BigInt(block.recordCount) - 1n;
        if (offsetSeq < blockStartOffset || offsetSeq > blockEndOffset2)
          continue;
        if (blockIndex !== currentBlockIndex) {
          const blockBytesRes = await readBlock(block);
          if (Result46.isError(blockBytesRes))
            return blockBytesRes;
          const decodedRes = decodeBlockResult(blockBytesRes.value);
          if (Result46.isError(decodedRes))
            return Result46.err({ kind: "internal", message: decodedRes.error.message });
          currentBlockIndex = blockIndex;
          currentBlockStartOffset = blockStartOffset;
          currentRecords = decodedRes.value.records;
          state.addDecodedRecords(decodedRes.value.recordCount);
        }
        const recordIndex = Number(offsetSeq - currentBlockStartOffset);
        const record = currentRecords[recordIndex];
        if (!record)
          continue;
        const matchRes = state.collectSearchMatchResult(offsetSeq, record.payload);
        if (Result46.isError(matchRes))
          return matchRes;
        if (markTimedOutIfNeeded())
          return Result46.ok(undefined);
        if (state.stopIfPageComplete())
          return Result46.ok(undefined);
      }
      return Result46.ok(undefined);
    };
    if (markTimedOutIfNeeded())
      return Result46.ok(undefined);
    if (familyCandidates.docIds) {
      const rangeReaderRes = await this.loadSegmentRangeBlockReaderResult(seg);
      if (Result46.isError(rangeReaderRes))
        return rangeReaderRes;
      if (rangeReaderRes.value) {
        const rangeReader = rangeReaderRes.value;
        const scanRes = await scanCandidateDocIdsWithBlocksResult(rangeReader.blocks, rangeReader.readBlock);
        state.addSegmentPayloadBytesFetched(rangeReader.fetchedBytes());
        addSegmentTime();
        return scanRes;
      }
    }
    const source = await loadSegmentSource(this.os, seg, this.diskCache, this.retryOpts());
    state.addSegmentPayloadBytesFetched(seg.size_bytes);
    if (markTimedOutIfNeeded())
      return Result46.ok(undefined);
    const footerBlocks = loadSegmentFooterBlocksFromSource(seg, source);
    if (footerBlocks) {
      if (familyCandidates.docIds) {
        const scanRes = await scanCandidateDocIdsWithBlocksResult(footerBlocks, async (block) => {
          const totalLen = DSB3_HEADER_BYTES + block.compressedLen;
          return Result46.ok(readRangeFromSource(source, block.blockOffset, block.blockOffset + totalLen - 1));
        });
        addSegmentTime();
        return scanRes;
      }
      for (let blockIndex = findFirstRelevantBlockIndex(footerBlocks, rangeEndSeq);blockIndex >= 0; blockIndex--) {
        const block = footerBlocks[blockIndex];
        const blockStartOffset = block.firstOffset;
        const blockEndOffset2 = blockStartOffset + BigInt(block.recordCount) - 1n;
        if (blockStartOffset > rangeEndSeq)
          continue;
        if (blockEndOffset2 < rangeStartSeq)
          break;
        const totalLen = DSB3_HEADER_BYTES + block.compressedLen;
        const blockBytes = readRangeFromSource(source, block.blockOffset, block.blockOffset + totalLen - 1);
        const decodedRes = decodeBlockResult(blockBytes);
        if (Result46.isError(decodedRes))
          return Result46.err({ kind: "internal", message: decodedRes.error.message });
        const decoded = decodedRes.value;
        state.addDecodedRecords(decoded.recordCount);
        for (let recordIndex = decoded.records.length - 1;recordIndex >= 0; recordIndex--) {
          const offsetSeq = blockStartOffset + BigInt(recordIndex);
          if (offsetSeq > rangeEndSeq)
            continue;
          if (offsetSeq < rangeStartSeq) {
            addSegmentTime();
            return Result46.ok(undefined);
          }
          const matchRes = state.collectSearchMatchResult(offsetSeq, decoded.records[recordIndex].payload);
          if (Result46.isError(matchRes))
            return matchRes;
          if (markTimedOutIfNeeded()) {
            addSegmentTime();
            return Result46.ok(undefined);
          }
          if (state.stopIfPageComplete()) {
            addSegmentTime();
            return Result46.ok(undefined);
          }
        }
      }
      addSegmentTime();
      return Result46.ok(undefined);
    }
    const decodedBlocks = [];
    for (const blockRes of iterateBlocksResult(source.bytes)) {
      if (Result46.isError(blockRes))
        return Result46.err({ kind: "internal", message: blockRes.error.message });
      decodedBlocks.push({ records: blockRes.value.decoded.records });
      state.addDecodedRecords(blockRes.value.decoded.recordCount);
      if (markTimedOutIfNeeded()) {
        addSegmentTime();
        return Result46.ok(undefined);
      }
    }
    let blockEndOffset = seg.end_offset;
    for (let blockIndex = decodedBlocks.length - 1;blockIndex >= 0; blockIndex--) {
      const decoded = decodedBlocks[blockIndex];
      const blockStartOffset = blockEndOffset - BigInt(decoded.records.length) + 1n;
      for (let recordIndex = decoded.records.length - 1;recordIndex >= 0; recordIndex--) {
        const offsetSeq = blockStartOffset + BigInt(recordIndex);
        if (offsetSeq > rangeEndSeq)
          continue;
        if (offsetSeq < rangeStartSeq) {
          addSegmentTime();
          return Result46.ok(undefined);
        }
        const localDocId = Number(offsetSeq - seg.start_offset);
        if (!familyCandidates.docIds || familyCandidates.docIds.has(localDocId)) {
          const matchRes = state.collectSearchMatchResult(offsetSeq, decoded.records[recordIndex].payload);
          if (Result46.isError(matchRes))
            return matchRes;
        }
        if (markTimedOutIfNeeded()) {
          addSegmentTime();
          return Result46.ok(undefined);
        }
        if (state.stopIfPageComplete()) {
          addSegmentTime();
          return Result46.ok(undefined);
        }
      }
      blockEndOffset = blockStartOffset - 1n;
    }
    addSegmentTime();
    return Result46.ok(undefined);
  }
  searchSchemaKey(registry) {
    return `${registry.currentVersion}:${JSON.stringify(registry.search ?? null)}`;
  }
  buildHotWalExactCacheResult(stream, startSeq, endSeq, registry) {
    const schemaKey = this.searchSchemaKey(registry);
    const cached = this.hotWalExact.get(stream);
    if (cached && cached.startSeq === startSeq && cached.endSeq === endSeq && cached.schemaKey === schemaKey) {
      return Result46.ok(cached);
    }
    const values = new Map;
    if (startSeq <= endSeq) {
      for (const record of this.db.iterWalRange(stream, startSeq, endSeq)) {
        const offsetSeq = BigInt(record.offset);
        const parsedRes = decodeJsonPayloadResult(this.registry, stream, offsetSeq, record.payload);
        if (Result46.isError(parsedRes))
          return Result46.err({ kind: "internal", message: parsedRes.error.message });
        const docRes = buildSearchDocumentResult(registry, offsetSeq, parsedRes.value);
        if (Result46.isError(docRes))
          return Result46.err({ kind: "internal", message: docRes.error.message });
        for (const [field, fieldValues] of docRes.value.exactValues) {
          let byValue = values.get(field);
          if (!byValue) {
            byValue = new Map;
            values.set(field, byValue);
          }
          for (const value of fieldValues) {
            let offsets = byValue.get(value);
            if (!offsets) {
              offsets = [];
              byValue.set(value, offsets);
            }
            offsets.push(offsetSeq);
          }
        }
      }
    }
    const next = { startSeq, endSeq, schemaKey, values };
    this.hotWalExact.set(stream, next);
    return Result46.ok(next);
  }
  hotWalExactOffsetsResult(stream, startSeq, endSeq, clauses, registry) {
    if (clauses.length === 0 || startSeq > endSeq)
      return Result46.ok(null);
    const cacheRes = this.buildHotWalExactCacheResult(stream, startSeq, endSeq, registry);
    if (Result46.isError(cacheRes))
      return cacheRes;
    const postings = clauses.map((clause) => cacheRes.value.values.get(clause.field)?.get(clause.canonicalValue) ?? []);
    if (postings.some((offsets) => offsets.length === 0))
      return Result46.ok([]);
    postings.sort((left, right) => left.length - right.length);
    const [smallest, ...rest] = postings;
    const restSets = rest.map((offsets) => new Set(offsets));
    return Result46.ok(smallest.filter((offset) => restSets.every((set) => set.has(offset))));
  }
  walRecordAt(stream, offsetSeq) {
    for (const record of this.db.iterWalRange(stream, offsetSeq, offsetSeq)) {
      return { offset: BigInt(record.offset), payload: record.payload };
    }
    return null;
  }
  async segmentMayOverlapSearchCursor(stream, segmentIndex, bound) {
    if (!this.index || bound.encoded == null)
      return true;
    const companion = await this.index.getColSegmentCompanion(stream, segmentIndex);
    if (!companion)
      return true;
    if (companion.primaryTimestampField === bound.sort.field && companion.minTimestampMs() != null && companion.maxTimestampMs() != null) {
      const target = bound.after;
      if (typeof target !== "bigint")
        return true;
      const minMs = companion.minTimestampMs();
      const maxMs = companion.maxTimestampMs();
      return bound.sort.direction === "desc" ? minMs <= target : maxMs >= target;
    }
    const field = companion.getField(bound.sort.field);
    if (!field)
      return true;
    const minValue = field.minValue();
    const maxValue = field.maxValue();
    if (minValue == null || maxValue == null)
      return true;
    const boundValue = bound.after;
    const cmpMin = compareComparableValues(minValue, boundValue);
    const cmpMax = compareComparableValues(maxValue, boundValue);
    return bound.sort.direction === "desc" ? cmpMin <= 0 : cmpMax >= 0;
  }
  async segmentMayOverlapTimeRange(stream, segmentIndex, startMs, endMs, timestampField) {
    if (!this.index)
      return true;
    const companion = await this.index.getColSegmentCompanion(stream, segmentIndex);
    if (companion && companion.primaryTimestampField === timestampField) {
      const minMs2 = companion.minTimestampMs() == null ? null : Number(companion.minTimestampMs());
      const maxMs2 = companion.maxTimestampMs() == null ? null : Number(companion.maxTimestampMs());
      if (Number.isFinite(minMs2) && Number.isFinite(maxMs2)) {
        return maxMs2 >= startMs && minMs2 < endMs;
      }
    }
    const metricsBlock = await this.index.getMetricsBlockSegmentCompanion(stream, segmentIndex);
    if (!metricsBlock)
      return true;
    const minMs = metricsBlock.minWindowStartMs;
    const maxMs = metricsBlock.maxWindowEndMs;
    if (!Number.isFinite(minMs) || !Number.isFinite(maxMs))
      return true;
    return maxMs >= startMs && minMs < endMs;
  }
  async resolveCandidateSegments(stream, keyBytes, filter) {
    if (!this.index)
      return { segments: null, indexedThrough: 0 };
    const candidates = [];
    if (keyBytes) {
      const keyCandidate = await this.index.candidateSegmentsForRoutingKey(stream, keyBytes);
      if (keyCandidate)
        candidates.push(keyCandidate);
    }
    if (filter) {
      for (const clause of collectPositiveExactFilterClauses(filter)) {
        const filterCandidate = await this.index.candidateSegmentsForSecondaryIndex(stream, clause.field, utf8Bytes(clause.canonicalValue));
        if (filterCandidate)
          candidates.push(filterCandidate);
      }
    }
    if (candidates.length === 0)
      return { segments: null, indexedThrough: 0 };
    const indexedThrough = candidates.reduce((min, candidate) => Math.min(min, candidate.indexedThrough), Number.MAX_SAFE_INTEGER);
    if (!Number.isFinite(indexedThrough) || indexedThrough <= 0) {
      return { segments: null, indexedThrough: 0 };
    }
    let intersection = null;
    for (const candidate of candidates) {
      const covered = new Set;
      for (const segmentIndex of candidate.segments) {
        if (segmentIndex < indexedThrough)
          covered.add(segmentIndex);
      }
      if (intersection == null) {
        intersection = covered;
        continue;
      }
      for (const segmentIndex of Array.from(intersection)) {
        if (!covered.has(segmentIndex))
          intersection.delete(segmentIndex);
      }
    }
    return { segments: intersection ?? new Set, indexedThrough };
  }
  async resolveSearchExactCandidateSegments(stream, query) {
    if (!this.index)
      return { segments: null, indexedThrough: 0 };
    const clauses = collectPositiveSearchExactClauses(query);
    if (clauses.length === 0)
      return { segments: null, indexedThrough: 0 };
    const candidates = [];
    for (const clause of clauses) {
      const candidate = await this.index.candidateSegmentsForSecondaryIndex(stream, clause.field, utf8Bytes(clause.canonicalValue));
      if (candidate)
        candidates.push(candidate);
    }
    if (candidates.length === 0)
      return { segments: null, indexedThrough: 0 };
    const indexedThrough = candidates.reduce((min, candidate) => Math.min(min, candidate.indexedThrough), Number.MAX_SAFE_INTEGER);
    if (!Number.isFinite(indexedThrough) || indexedThrough <= 0)
      return { segments: null, indexedThrough: 0 };
    let intersection = null;
    for (const candidate of candidates) {
      const covered = new Set;
      for (const segmentIndex of candidate.segments) {
        if (segmentIndex < indexedThrough)
          covered.add(segmentIndex);
      }
      if (intersection == null) {
        intersection = covered;
        continue;
      }
      for (const segmentIndex of Array.from(intersection)) {
        if (!covered.has(segmentIndex))
          intersection.delete(segmentIndex);
      }
    }
    return { segments: intersection ?? new Set, indexedThrough };
  }
  async resolveColumnCandidateDocIdsResult(stream, segmentIndex, clauses) {
    if (!this.index || clauses.length === 0)
      return Result46.ok(null);
    const companion = await this.index.getColSegmentCompanion(stream, segmentIndex);
    if (!companion)
      return Result46.ok(null);
    let intersection = null;
    for (const clause of clauses) {
      const clauseRes = filterDocIdsByColumnResult({
        companion,
        field: clause.field,
        op: clause.op,
        value: clause.compareValue
      });
      if (Result46.isError(clauseRes))
        return Result46.ok(null);
      if (intersection == null) {
        intersection = clauseRes.value;
        continue;
      }
      for (const docId of Array.from(intersection)) {
        if (!clauseRes.value.has(docId))
          intersection.delete(docId);
      }
      if (intersection.size === 0)
        break;
    }
    return Result46.ok(intersection ?? new Set);
  }
  async resolveSearchColumnCandidateDocIdsResult(stream, segmentIndex, clauses) {
    if (!this.index || clauses.length === 0)
      return Result46.ok(null);
    const companion = await this.index.getColSegmentCompanion(stream, segmentIndex);
    if (!companion)
      return Result46.ok(null);
    let intersection = null;
    for (const clause of clauses) {
      const clauseRes = filterDocIdsByColumnResult({
        companion,
        field: clause.field,
        op: clause.op,
        value: clause.compareValue
      });
      if (Result46.isError(clauseRes))
        return Result46.ok(null);
      if (intersection == null) {
        intersection = clauseRes.value;
        continue;
      }
      for (const docId of Array.from(intersection)) {
        if (!clauseRes.value.has(docId))
          intersection.delete(docId);
      }
      if (intersection.size === 0)
        break;
    }
    return Result46.ok(intersection ?? new Set);
  }
  async resolveSearchFtsCandidateDocIdsResult(stream, segmentIndex, clauses, stats) {
    if (!this.index || clauses.length === 0)
      return Result46.ok(null);
    const companionRes = this.index.getFtsSegmentCompanionWithStats ? await this.index.getFtsSegmentCompanionWithStats(stream, segmentIndex) : { companion: await this.index.getFtsSegmentCompanion(stream, segmentIndex), stats: { sectionGetMs: 0, decodeMs: 0 } };
    stats?.addFtsSectionGetMs?.(companionRes.stats.sectionGetMs);
    stats?.addFtsDecodeMs?.(companionRes.stats.decodeMs);
    const companion = companionRes.companion;
    if (!companion)
      return Result46.ok(null);
    const clausesRes = filterDocIdsByFtsClausesResult({
      companion,
      clauses,
      onEstimateMs: (deltaMs) => {
        stats?.addFtsClauseEstimateMs?.(deltaMs);
      }
    });
    if (Result46.isError(clausesRes))
      return clausesRes;
    return Result46.ok(clausesRes.value);
  }
  async resolveSearchFamilyCandidatesResult(stream, segmentIndex, exactClauses, columnClauses, ftsClauses, stats) {
    let intersection = null;
    const usedFamilies = new Set;
    if (exactClauses.length > 0) {
      const exactCompanion = await this.index?.getExactSegmentCompanion(stream, segmentIndex);
      if (exactCompanion) {
        const exactRes = filterDocIdsByExactClausesResult({ companion: exactCompanion, clauses: exactClauses });
        if (Result46.isError(exactRes))
          return exactRes;
        intersection = exactRes.value;
        usedFamilies.add("exact");
      }
    }
    if (columnClauses.length > 0) {
      const columnRes = await this.resolveSearchColumnCandidateDocIdsResult(stream, segmentIndex, columnClauses);
      if (Result46.isError(columnRes))
        return columnRes;
      if (columnRes.value) {
        if (intersection == null)
          intersection = columnRes.value;
        else {
          for (const docId of Array.from(intersection)) {
            if (!columnRes.value.has(docId))
              intersection.delete(docId);
          }
        }
        usedFamilies.add("col");
      }
    }
    if (ftsClauses.length > 0) {
      const ftsRes = await this.resolveSearchFtsCandidateDocIdsResult(stream, segmentIndex, ftsClauses, stats);
      if (Result46.isError(ftsRes))
        return ftsRes;
      if (ftsRes.value) {
        if (intersection == null)
          intersection = ftsRes.value;
        else {
          for (const docId of Array.from(intersection)) {
            if (!ftsRes.value.has(docId))
              intersection.delete(docId);
          }
        }
        usedFamilies.add("fts");
      }
    }
    return Result46.ok({ docIds: intersection, usedFamilies });
  }
}
function bytesEqual(a, b) {
  if (a.byteLength !== b.byteLength)
    return false;
  for (let i = 0;i < a.byteLength; i++)
    if (a[i] !== b[i])
      return false;
  return true;
}
function buildSearchSortInternalValues(sorts, fields, evaluation, offsetSeq) {
  return sorts.map((sort) => {
    if (sort.kind === "score")
      return evaluation.score;
    if (sort.kind === "offset")
      return offsetSeq;
    const rawValue = fields[sort.field];
    const scalar = Array.isArray(rawValue) ? rawValue[0] : rawValue;
    if (scalar == null)
      return null;
    if (sort.config.kind === "integer" || sort.config.kind === "float" || sort.config.kind === "date" || sort.config.kind === "bool") {
      return canonicalizeColumnValue(sort.config, scalar);
    }
    return canonicalizeExactValue(sort.config, scalar);
  });
}
function buildSearchSortResponseValues(sorts, sortInternal, offset) {
  return sorts.map((sort, index) => {
    const value = sortInternal[index];
    if (sort.kind === "offset")
      return offset;
    if (typeof value === "bigint")
      return Number(value);
    return value;
  });
}
function compareComparableValues(left, right) {
  if (left == null && right == null)
    return 0;
  if (left == null)
    return 1;
  if (right == null)
    return -1;
  if (typeof left === "bigint" && typeof right === "bigint")
    return left < right ? -1 : left > right ? 1 : 0;
  if (typeof left === "number" && typeof right === "number")
    return left < right ? -1 : left > right ? 1 : 0;
  if (typeof left === "boolean" && typeof right === "boolean")
    return left === right ? 0 : left ? 1 : -1;
  const ls = String(left);
  const rs = String(right);
  return ls < rs ? -1 : ls > rs ? 1 : 0;
}
function compareSearchHits(left, right, sorts) {
  for (let i = 0;i < sorts.length; i++) {
    const cmp = compareComparableValues(left.sortInternal[i] ?? null, right.sortInternal[i] ?? null);
    if (cmp === 0)
      continue;
    return sorts[i].direction === "asc" ? cmp : -cmp;
  }
  return 0;
}
function compareSearchAfterValues(sortInternal, sorts, searchAfter) {
  for (let i = 0;i < sorts.length; i++) {
    const after = normalizeSearchAfterValue(sorts[i], searchAfter[i]);
    const cmp = compareComparableValues(sortInternal[i] ?? null, after);
    if (cmp === 0)
      continue;
    return sorts[i].direction === "asc" ? cmp : -cmp;
  }
  return 0;
}
function encodeSearchCursorValue(sort, value) {
  if (value == null)
    return null;
  if (sort.config.kind === "integer" || sort.config.kind === "date") {
    return typeof value === "bigint" ? encodeSortableInt64(value) : null;
  }
  if (sort.config.kind === "float") {
    return typeof value === "number" ? encodeSortableFloat64(value) : null;
  }
  if (sort.config.kind === "bool") {
    return typeof value === "boolean" ? encodeSortableBool(value) : null;
  }
  return null;
}
function resolveSearchCursorFieldBound(request) {
  if (!request.searchAfter || request.searchAfter.length === 0)
    return null;
  const leadingSort = request.sort[0];
  if (!leadingSort || leadingSort.kind !== "field")
    return null;
  if (leadingSort.config.kind !== "integer" && leadingSort.config.kind !== "float" && leadingSort.config.kind !== "date" && leadingSort.config.kind !== "bool") {
    return null;
  }
  const after = normalizeSearchAfterValue(leadingSort, request.searchAfter[0]);
  return {
    kind: "field",
    sort: leadingSort,
    after,
    encoded: encodeSearchCursorValue(leadingSort, after)
  };
}
function normalizeSearchAfterValue(sort, raw) {
  if (raw == null)
    return null;
  if (sort.kind === "offset") {
    if (typeof raw !== "string")
      return null;
    const parsed = parseOffsetResult(raw);
    if (Result46.isError(parsed))
      return null;
    return offsetToSeqOrNeg1(parsed.value);
  }
  if (sort.kind === "score") {
    return typeof raw === "number" && Number.isFinite(raw) ? raw : null;
  }
  if (sort.config.kind === "integer" || sort.config.kind === "date") {
    if (typeof raw === "number" && Number.isFinite(raw))
      return BigInt(Math.trunc(raw));
    if (typeof raw === "string" && raw.trim() !== "") {
      try {
        return BigInt(raw.trim());
      } catch {
        return null;
      }
    }
    return null;
  }
  if (sort.config.kind === "float")
    return typeof raw === "number" && Number.isFinite(raw) ? raw : null;
  if (sort.config.kind === "bool")
    return typeof raw === "boolean" ? raw : null;
  return typeof raw === "string" ? raw : null;
}
function resolvePrimaryTimestampTopKSort(registry, request) {
  const leadingSort = request.sort[0];
  if (!leadingSort || leadingSort.kind !== "field")
    return null;
  if (registry.search?.primaryTimestampField !== leadingSort.field)
    return null;
  if (leadingSort.config.kind !== "date")
    return null;
  return leadingSort;
}
function worstSearchHitIndex(hits, sorts) {
  let worstIndex = 0;
  for (let index = 1;index < hits.length; index++) {
    if (compareSearchHits(hits[index], hits[worstIndex], sorts) > 0)
      worstIndex = index;
  }
  return worstIndex;
}
function orderSegmentsByPrimaryTimestampBounds(segments, rowsBySegment, direction) {
  const unknown = [];
  const known = [];
  for (const seg of segments) {
    const row = rowsBySegment.get(seg.segment_index);
    if (row?.primary_timestamp_min_ms == null || row.primary_timestamp_max_ms == null)
      unknown.push(seg);
    else
      known.push(seg);
  }
  known.sort((left, right) => {
    const leftRow = rowsBySegment.get(left.segment_index);
    const rightRow = rowsBySegment.get(right.segment_index);
    if (direction === "desc") {
      if (leftRow.primary_timestamp_max_ms !== rightRow.primary_timestamp_max_ms) {
        return leftRow.primary_timestamp_max_ms > rightRow.primary_timestamp_max_ms ? -1 : 1;
      }
      return right.segment_index - left.segment_index;
    }
    if (leftRow.primary_timestamp_min_ms !== rightRow.primary_timestamp_min_ms) {
      return leftRow.primary_timestamp_min_ms < rightRow.primary_timestamp_min_ms ? -1 : 1;
    }
    return left.segment_index - right.segment_index;
  });
  return [...unknown, ...known];
}

// src/sqlite/runtime_stats.ts
import { createRequire as createRequire4 } from "node:module";
var SQLITE_STATUS_MEMORY_USED = 0;
var SQLITE_STATUS_PAGECACHE_USED = 1;
var SQLITE_STATUS_PAGECACHE_OVERFLOW = 2;
var SQLITE_STATUS_MALLOC_COUNT = 9;
var ffiModule;
var sqliteLibrary;
var cachedRuntimeStats = null;
var require4 = createRequire4(import.meta.url);
function sqliteLibraryNames() {
  if (process.platform === "darwin") {
    return ["libsqlite3.dylib", "/usr/lib/libsqlite3.dylib"];
  }
  if (process.platform === "linux") {
    return ["libsqlite3.so.0", "libsqlite3.so", "/usr/lib/x86_64-linux-gnu/libsqlite3.so.0", "/lib/x86_64-linux-gnu/libsqlite3.so.0"];
  }
  return ["libsqlite3.so", "libsqlite3.dylib"];
}
function loadBunFfi() {
  if (ffiModule !== undefined)
    return ffiModule;
  if (detectHostRuntime() !== "bun") {
    ffiModule = null;
    return ffiModule;
  }
  try {
    ffiModule = require4("bun:ffi");
  } catch {
    ffiModule = null;
  }
  return ffiModule;
}
function loadSqliteLibrary() {
  if (sqliteLibrary !== undefined)
    return sqliteLibrary;
  const ffi = loadBunFfi();
  if (!ffi) {
    sqliteLibrary = null;
    return sqliteLibrary;
  }
  for (const name of sqliteLibraryNames()) {
    try {
      const lib = ffi.dlopen(name, {
        sqlite3_status64: {
          args: ["i32", "ptr", "ptr", "i32"],
          returns: "i32"
        }
      });
      sqliteLibrary = {
        sqlite3_status64: lib.symbols.sqlite3_status64,
        close: () => lib.close()
      };
      return sqliteLibrary;
    } catch {}
  }
  sqliteLibrary = null;
  return sqliteLibrary;
}
function readStatus64(lib, ffi, op) {
  const current = new BigInt64Array(1);
  const highwater = new BigInt64Array(1);
  try {
    const rc = lib.sqlite3_status64(op, ffi.ptr(current), ffi.ptr(highwater), 0);
    if (rc !== 0)
      return null;
    return {
      current: Number(current[0]),
      highwater: Number(highwater[0])
    };
  } catch {
    return null;
  }
}
function readSqliteRuntimeMemoryStats(ttlMs = 1000) {
  const now = Date.now();
  if (cachedRuntimeStats && now - cachedRuntimeStats.at_ms < Math.max(0, ttlMs)) {
    return cachedRuntimeStats.value;
  }
  const adapterCounts = getSqliteAdapterRuntimeCounts();
  const unavailable2 = {
    available: false,
    source: "unavailable",
    memory_used_bytes: 0,
    memory_highwater_bytes: 0,
    pagecache_used_slots: 0,
    pagecache_used_slots_highwater: 0,
    pagecache_overflow_bytes: 0,
    pagecache_overflow_highwater_bytes: 0,
    malloc_count: 0,
    malloc_count_highwater: 0,
    open_connections: adapterCounts.open_connections,
    prepared_statements: adapterCounts.prepared_statements
  };
  const ffi = loadBunFfi();
  const lib = loadSqliteLibrary();
  if (!ffi || !lib) {
    cachedRuntimeStats = { at_ms: now, value: unavailable2 };
    return unavailable2;
  }
  const memoryUsed = readStatus64(lib, ffi, SQLITE_STATUS_MEMORY_USED);
  const pagecacheUsed = readStatus64(lib, ffi, SQLITE_STATUS_PAGECACHE_USED);
  const pagecacheOverflow = readStatus64(lib, ffi, SQLITE_STATUS_PAGECACHE_OVERFLOW);
  const mallocCount = readStatus64(lib, ffi, SQLITE_STATUS_MALLOC_COUNT);
  const stats = {
    available: memoryUsed != null,
    source: memoryUsed != null ? "sqlite3_status64" : "unavailable",
    memory_used_bytes: Math.max(0, Math.floor(memoryUsed?.current ?? 0)),
    memory_highwater_bytes: Math.max(0, Math.floor(memoryUsed?.highwater ?? 0)),
    pagecache_used_slots: Math.max(0, Math.floor(pagecacheUsed?.current ?? 0)),
    pagecache_used_slots_highwater: Math.max(0, Math.floor(pagecacheUsed?.highwater ?? 0)),
    pagecache_overflow_bytes: Math.max(0, Math.floor(pagecacheOverflow?.current ?? 0)),
    pagecache_overflow_highwater_bytes: Math.max(0, Math.floor(pagecacheOverflow?.highwater ?? 0)),
    malloc_count: Math.max(0, Math.floor(mallocCount?.current ?? 0)),
    malloc_count_highwater: Math.max(0, Math.floor(mallocCount?.highwater ?? 0)),
    open_connections: adapterCounts.open_connections,
    prepared_statements: adapterCounts.prepared_statements
  };
  cachedRuntimeStats = { at_ms: now, value: stats };
  return stats;
}

// src/app_local.ts
import { Result as Result47 } from "better-result";
var TEXT_DECODER2 = new TextDecoder;

class NoopUploader {
  start() {}
  stop(_hard) {}
  countSegmentsWaiting() {
    return 0;
  }
  setHooks(_hooks) {}
  async publishManifest(_stream) {}
}
var noopSegmenter = {
  start() {},
  stop(_hard) {}
};

class LocalIndexLookup {
  db;
  constructor(db) {
    this.db = db;
  }
  start() {}
  async stop() {}
  enqueue(_stream) {}
  async candidateSegmentsForRoutingKey(_stream, _keyBytes) {
    return null;
  }
  async candidateSegmentsForSecondaryIndex(_stream, _indexName, _keyBytes) {
    return null;
  }
  async getAggSegmentCompanion(_stream, _segmentIndex) {
    return null;
  }
  async getColSegmentCompanion(_stream, _segmentIndex) {
    return null;
  }
  async getExactSegmentCompanion(_stream, _segmentIndex) {
    return null;
  }
  async getFtsSegmentCompanion(_stream, _segmentIndex) {
    return null;
  }
  async getMetricsBlockSegmentCompanion(_stream, _segmentIndex) {
    return null;
  }
  async listRoutingKeysResult(stream, after, limit) {
    const srow = this.db.getStream(stream);
    if (!srow || this.db.isDeleted(srow)) {
      return Result47.err({ kind: "invalid_lexicon_index", message: "stream not found" });
    }
    const safeLimit = Math.max(1, Math.min(limit, 500));
    const keys = new Set;
    let scannedWalRows = 0;
    for (const rec of this.db.iterWalRange(stream, 0n, srow.next_offset - 1n)) {
      scannedWalRows += 1;
      const rawKey = rec.routing_key == null ? null : rec.routing_key instanceof Uint8Array ? rec.routing_key : new Uint8Array(rec.routing_key);
      if (!rawKey || rawKey.byteLength === 0)
        continue;
      keys.add(TEXT_DECODER2.decode(rawKey));
    }
    const sorted = Array.from(keys).sort();
    const filtered = after == null ? sorted : sorted.filter((key) => key > after);
    const page = filtered.slice(0, safeLimit);
    const nextAfter = filtered.length > safeLimit ? page[page.length - 1] ?? null : null;
    return Result47.ok({
      keys: page,
      nextAfter,
      tookMs: 0,
      coverage: {
        complete: true,
        indexedSegments: 0,
        scannedUploadedSegments: 0,
        scannedLocalSegments: 0,
        scannedWalRows,
        possibleMissingUploadedSegments: 0,
        possibleMissingLocalSegments: 0
      },
      timing: {
        lexiconRunGetMs: 0,
        lexiconDecodeMs: 0,
        lexiconEnumerateMs: 0,
        lexiconMergeMs: 0,
        fallbackScanMs: 0,
        fallbackSegmentGetMs: 0,
        fallbackWalScanMs: 0,
        lexiconRunsLoaded: 0
      }
    });
  }
  getLocalStorageUsage(_stream) {
    return {
      routing_index_cache_bytes: 0,
      exact_index_cache_bytes: 0,
      companion_cache_bytes: 0,
      lexicon_index_cache_bytes: 0
    };
  }
}
function createLocalApp(cfg, os2, opts = {}) {
  return createAppCore(cfg, {
    stats: opts.stats,
    createRuntime: ({ config, db, registry, memorySampler, memory }) => {
      const store = os2 ?? new NullObjectStore;
      const indexer = new LocalIndexLookup(db);
      const reader = new StreamReader(config, db, store, registry, undefined, indexer, memorySampler, memory);
      return {
        store,
        reader,
        segmenter: noopSegmenter,
        uploader: new NoopUploader,
        indexer,
        uploadSchemaRegistry: async () => {},
        getRuntimeMemorySnapshot: () => {
          const sqliteRuntime = readSqliteRuntimeMemoryStats();
          return {
            subsystems: {
              heap_estimates: {
                ingest_queue_payload_bytes: 0
              },
              mapped_files: {},
              disk_caches: {},
              configured_budgets: {
                sqlite_cache_budget_bytes: config.sqliteCacheBytes,
                worker_sqlite_cache_budget_bytes: config.workerSqliteCacheBytes
              },
              pipeline_buffers: {},
              sqlite_runtime: {
                sqlite_memory_used_bytes: sqliteRuntime.memory_used_bytes,
                sqlite_memory_highwater_bytes: sqliteRuntime.memory_highwater_bytes,
                sqlite_pagecache_overflow_bytes: sqliteRuntime.pagecache_overflow_bytes,
                sqlite_pagecache_overflow_highwater_bytes: sqliteRuntime.pagecache_overflow_highwater_bytes
              },
              counts: {
                ingest_queue_requests: 0,
                pending_upload_segments: 0,
                sqlite_pagecache_used_slots: sqliteRuntime.pagecache_used_slots,
                sqlite_pagecache_used_slots_highwater: sqliteRuntime.pagecache_used_slots_highwater,
                sqlite_malloc_count: sqliteRuntime.malloc_count,
                sqlite_malloc_count_highwater: sqliteRuntime.malloc_count_highwater,
                sqlite_open_connections: sqliteRuntime.open_connections,
                sqlite_prepared_statements: sqliteRuntime.prepared_statements
              }
            },
            totals: {
              heap_estimate_bytes: 0,
              mapped_file_bytes: 0,
              disk_cache_bytes: 0,
              configured_budget_bytes: config.sqliteCacheBytes + config.workerSqliteCacheBytes,
              pipeline_buffer_bytes: 0,
              sqlite_runtime_bytes: sqliteRuntime.memory_used_bytes + sqliteRuntime.pagecache_overflow_bytes
            }
          };
        },
        start: () => {}
      };
    }
  });
}

// src/config.ts
var KNOWN_DS_ENVS = new Set([
  "DS_ROOT",
  "DS_HOST",
  "DS_DB_PATH",
  "DS_SEGMENT_MAX_BYTES",
  "DS_BLOCK_MAX_BYTES",
  "DS_SEGMENT_TARGET_ROWS",
  "DS_SEGMENT_MAX_INTERVAL_MS",
  "DS_SEGMENT_CHECK_MS",
  "DS_SEGMENTER_WORKERS",
  "DS_UPLOAD_CHECK_MS",
  "DS_UPLOAD_CONCURRENCY",
  "DS_BASE_WAL_GC_CHUNK_OFFSETS",
  "DS_BASE_WAL_GC_INTERVAL_MS",
  "DS_SEGMENT_CACHE_MAX_BYTES",
  "DS_SEGMENT_FOOTER_CACHE_ENTRIES",
  "DS_INDEX_RUN_CACHE_MAX_BYTES",
  "DS_INDEX_RUN_MEM_CACHE_BYTES",
  "DS_LEXICON_INDEX_CACHE_MAX_BYTES",
  "DS_LEXICON_MMAP_CACHE_ENTRIES",
  "DS_INDEX_L0_SPAN",
  "DS_INDEX_BUILD_CONCURRENCY",
  "DS_INDEX_CHECK_MS",
  "DS_SEARCH_COMPANION_BATCH_SEGMENTS",
  "DS_SEARCH_COMPANION_YIELD_BLOCKS",
  "DS_SEARCH_COMPANION_FILE_CACHE_MAX_BYTES",
  "DS_SEARCH_COMPANION_FILE_CACHE_MAX_AGE_MS",
  "DS_SEARCH_COMPANION_MMAP_CACHE_ENTRIES",
  "DS_SEARCH_COMPANION_TOC_CACHE_BYTES",
  "DS_SEARCH_COMPANION_SECTION_CACHE_BYTES",
  "DS_SEARCH_WAL_OVERLAY_QUIET_MS",
  "DS_SEARCH_WAL_OVERLAY_MAX_BYTES",
  "DS_INDEX_COMPACTION_FANOUT",
  "DS_INDEX_MAX_LEVEL",
  "DS_INDEX_COMPACT_CONCURRENCY",
  "DS_INDEX_RETIRE_GEN_WINDOW",
  "DS_INDEX_RETIRE_MIN_MS",
  "DS_READ_MAX_BYTES",
  "DS_READ_MAX_RECORDS",
  "DS_APPEND_MAX_BODY_BYTES",
  "DS_INGEST_FLUSH_MS",
  "DS_INGEST_MAX_BATCH_REQS",
  "DS_INGEST_MAX_BATCH_BYTES",
  "DS_INGEST_MAX_QUEUE_REQS",
  "DS_INGEST_MAX_QUEUE_BYTES",
  "DS_INGEST_CONCURRENCY",
  "DS_INGEST_BUSY_MS",
  "DS_LOCAL_BACKLOG_MAX_BYTES",
  "DS_MEMORY_LIMIT_BYTES",
  "DS_MEMORY_LIMIT_MB",
  "DS_SQLITE_CACHE_BYTES",
  "DS_SQLITE_CACHE_MB",
  "DS_WORKER_SQLITE_CACHE_BYTES",
  "DS_WORKER_SQLITE_CACHE_MB",
  "DS_READ_CONCURRENCY",
  "DS_SEARCH_CONCURRENCY",
  "DS_ASYNC_INDEX_CONCURRENCY",
  "DS_HEAP_SNAPSHOT_PATH",
  "DS_MEMORY_SAMPLER_PATH",
  "DS_MEMORY_SAMPLER_INTERVAL_MS",
  "DS_OBJECTSTORE_TIMEOUT_MS",
  "DS_OBJECTSTORE_RETRIES",
  "DS_OBJECTSTORE_RETRY_BASE_MS",
  "DS_OBJECTSTORE_RETRY_MAX_MS",
  "DS_LOCAL_DATA_ROOT",
  "DS_EXPIRY_SWEEP_MS",
  "DS_EXPIRY_SWEEP_LIMIT",
  "DS_METRICS_FLUSH_MS",
  "DS_TOUCH_WORKERS",
  "DS_TOUCH_CHECK_MS",
  "DS_TOUCH_MAX_BATCH_ROWS",
  "DS_TOUCH_MAX_BATCH_BYTES",
  "DS_OTLP_TRACES_STREAM",
  "DS_OTLP_AUTO_CREATE",
  "DS_AUTO_TUNE_REQUESTED_MB",
  "DS_AUTO_TUNE_PRESET_MB",
  "DS_AUTO_TUNE_EFFECTIVE_MEMORY_LIMIT_MB",
  "DS_STATS_INTERVAL_MS",
  "DS_BACKPRESSURE_BUDGET_MS",
  "DS_MOCK_R2_MAX_INMEM_BYTES",
  "DS_MOCK_R2_MAX_INMEM_MB",
  "DS_MOCK_R2_SPILL_DIR",
  "DS_MOCK_R2_PUT_DELAY_MS",
  "DS_MOCK_R2_GET_DELAY_MS",
  "DS_MOCK_R2_HEAD_DELAY_MS",
  "DS_MOCK_R2_LIST_DELAY_MS",
  "DS_BENCH_URL",
  "DS_BENCH_DURATION_MS",
  "DS_BENCH_INTERVAL_MS",
  "DS_BENCH_PAYLOAD_BYTES",
  "DS_BENCH_CONCURRENCY",
  "DS_BENCH_REQUEST_TIMEOUT_MS",
  "DS_BENCH_DRAIN_TIMEOUT_MS",
  "DS_BENCH_PAUSE_BACKGROUND",
  "DS_BENCH_YIELD_EVERY",
  "DS_BENCH_DEBUG",
  "DS_BENCH_SCENARIOS",
  "DS_MEMORY_STRESS_LIMITS_MB",
  "DS_MEMORY_STRESS_STATS_MS",
  "DS_MEMORY_STRESS_PORT_BASE",
  "DS_RK_EVENTS_MAX",
  "DS_RK_EVENTS_STEP",
  "DS_RK_PAYLOAD_BYTES",
  "DS_RK_APPEND_BATCH",
  "DS_RK_KEYS",
  "DS_RK_HOT_KEYS",
  "DS_RK_HOT_PCT",
  "DS_RK_PAYLOAD_POOL",
  "DS_RK_READ_ENTRIES",
  "DS_RK_WARM_READS",
  "DS_RK_SEGMENT_BYTES",
  "DS_RK_BLOCK_BYTES",
  "DS_RK_SEED",
  "DS_RK_R2_GET_DELAY_MS",
  "DS_LARGE_INDEX_FILTER",
  "DS_LARGE_INDEX_FILTER_TOTAL_BYTES",
  "DS_LARGE_INDEX_FILTER_PAYLOAD_BYTES",
  "DS_LARGE_INDEX_FILTER_BATCH_ROWS",
  "DS_LARGE_INDEX_FILTER_SEGMENT_BYTES",
  "DS_LARGE_INDEX_FILTER_INDEX_SPAN",
  "DS_LARGE_INDEX_FILTER_TIMEOUT_MS",
  "DS_LARGE_INDEX_FILTER_R2_MAX_INMEM_BYTES"
]);
var warnedUnknownEnv = false;
function warnUnknownEnv() {
  if (warnedUnknownEnv)
    return;
  warnedUnknownEnv = true;
  const unknown = [];
  for (const key of Object.keys(process.env)) {
    if (!key.startsWith("DS_"))
      continue;
    if (KNOWN_DS_ENVS.has(key))
      continue;
    unknown.push(key);
  }
  if (unknown.length > 0) {
    unknown.sort();
    console.warn(`[config] unknown DS_* environment variables: ${unknown.join(", ")}`);
  }
}
function envNum(name, def) {
  const v = process.env[name];
  if (!v)
    return def;
  const n = Number(v);
  if (!Number.isFinite(n))
    throw dsError(`invalid ${name}: ${v}`);
  return n;
}
function envBool(name, def) {
  const v = process.env[name];
  if (v == null || v === "")
    return def;
  const normalized = v.trim().toLowerCase();
  if (normalized === "1" || normalized === "true" || normalized === "yes")
    return true;
  if (normalized === "0" || normalized === "false" || normalized === "no")
    return false;
  throw dsError(`invalid ${name}: ${v}`);
}
function envBytes(name) {
  const v = process.env[name];
  if (!v)
    return null;
  const n = Number(v);
  if (!Number.isFinite(n))
    throw dsError(`invalid ${name}: ${v}`);
  return Math.max(0, Math.floor(n));
}
function clampBytes(value, min, max) {
  if (!Number.isFinite(value))
    return min;
  if (value < min)
    return min;
  if (value > max)
    return max;
  return value;
}
function loadConfig() {
  warnUnknownEnv();
  const rootDir = process.env.DS_ROOT ?? "./ds-data";
  const host = process.env.DS_HOST?.trim() || "127.0.0.1";
  const autoTuneRequestedMemoryMb = envBytes("DS_AUTO_TUNE_REQUESTED_MB");
  const autoTunePresetMb = envBytes("DS_AUTO_TUNE_PRESET_MB");
  const autoTuneEffectiveMemoryLimitMb = envBytes("DS_AUTO_TUNE_EFFECTIVE_MEMORY_LIMIT_MB");
  const bytesOverride = envBytes("DS_MEMORY_LIMIT_BYTES");
  const mbOverride = envBytes("DS_MEMORY_LIMIT_MB");
  const memoryLimitBytes = bytesOverride ?? (mbOverride != null ? mbOverride * 1024 * 1024 : 0);
  const backlogOverride = envBytes("DS_LOCAL_BACKLOG_MAX_BYTES");
  const sqliteCacheBytesOverride = envBytes("DS_SQLITE_CACHE_BYTES");
  const sqliteCacheMbOverride = envBytes("DS_SQLITE_CACHE_MB");
  const workerSqliteCacheBytesOverride = envBytes("DS_WORKER_SQLITE_CACHE_BYTES");
  const workerSqliteCacheMbOverride = envBytes("DS_WORKER_SQLITE_CACHE_MB");
  const indexMemOverride = envBytes("DS_INDEX_RUN_MEM_CACHE_BYTES");
  const indexDiskOverride = envBytes("DS_INDEX_RUN_CACHE_MAX_BYTES");
  const lexiconDiskOverride = envBytes("DS_LEXICON_INDEX_CACHE_MAX_BYTES");
  const localBacklogMaxBytes = backlogOverride ?? 10 * 1024 * 1024 * 1024;
  const sqliteCacheBytes = sqliteCacheBytesOverride ?? (sqliteCacheMbOverride != null ? sqliteCacheMbOverride * 1024 * 1024 : memoryLimitBytes > 0 ? Math.floor(memoryLimitBytes * 0.25) : 0);
  const workerSqliteCacheBytes = workerSqliteCacheBytesOverride ?? (workerSqliteCacheMbOverride != null ? workerSqliteCacheMbOverride * 1024 * 1024 : sqliteCacheBytes > 0 ? clampBytes(Math.floor(sqliteCacheBytes / 8), 8 * 1024 * 1024, 32 * 1024 * 1024) : 0);
  const tunedIndexMem = indexMemOverride ?? (memoryLimitBytes > 0 ? clampBytes(Math.floor(memoryLimitBytes * 0.05), 8 * 1024 * 1024, 128 * 1024 * 1024) : 64 * 1024 * 1024);
  const companionSectionCacheBytes = envBytes("DS_SEARCH_COMPANION_SECTION_CACHE_BYTES") ?? (memoryLimitBytes > 0 ? clampBytes(Math.floor(memoryLimitBytes * 0.02), 8 * 1024 * 1024, 128 * 1024 * 1024) : 32 * 1024 * 1024);
  const companionFileCacheBytes = envBytes("DS_SEARCH_COMPANION_FILE_CACHE_MAX_BYTES") ?? clampBytes(Math.max(512 * 1024 * 1024, Math.floor(localBacklogMaxBytes * 0.1)), 256 * 1024 * 1024, 4 * 1024 * 1024 * 1024);
  const segmentMaxBytes = envNum("DS_SEGMENT_MAX_BYTES", 16 * 1024 * 1024);
  const searchWalOverlayMaxBytes = envBytes("DS_SEARCH_WAL_OVERLAY_MAX_BYTES") ?? segmentMaxBytes;
  return {
    autoTuneRequestedMemoryMb,
    autoTunePresetMb,
    autoTuneEffectiveMemoryLimitMb,
    host,
    rootDir,
    dbPath: process.env.DS_DB_PATH ?? `${rootDir}/wal.sqlite`,
    segmentMaxBytes,
    blockMaxBytes: envNum("DS_BLOCK_MAX_BYTES", 256 * 1024),
    segmentTargetRows: envNum("DS_SEGMENT_TARGET_ROWS", 1e5),
    segmentMaxIntervalMs: envNum("DS_SEGMENT_MAX_INTERVAL_MS", 0),
    segmentCheckIntervalMs: envNum("DS_SEGMENT_CHECK_MS", 250),
    segmenterWorkers: envNum("DS_SEGMENTER_WORKERS", 0),
    uploadIntervalMs: envNum("DS_UPLOAD_CHECK_MS", 250),
    uploadConcurrency: envNum("DS_UPLOAD_CONCURRENCY", 4),
    segmentCacheMaxBytes: envNum("DS_SEGMENT_CACHE_MAX_BYTES", 256 * 1024 * 1024),
    segmentFooterCacheEntries: envNum("DS_SEGMENT_FOOTER_CACHE_ENTRIES", 2048),
    indexRunCacheMaxBytes: indexDiskOverride ?? 256 * 1024 * 1024,
    indexRunMemoryCacheBytes: tunedIndexMem,
    lexiconIndexCacheMaxBytes: lexiconDiskOverride ?? (memoryLimitBytes > 0 ? clampBytes(Math.floor(memoryLimitBytes * 0.03), 8 * 1024 * 1024, 256 * 1024 * 1024) : 64 * 1024 * 1024),
    lexiconMappedCacheEntries: envNum("DS_LEXICON_MMAP_CACHE_ENTRIES", 64),
    indexL0SpanSegments: envNum("DS_INDEX_L0_SPAN", 16),
    indexBuildConcurrency: envNum("DS_INDEX_BUILD_CONCURRENCY", 4),
    indexCheckIntervalMs: envNum("DS_INDEX_CHECK_MS", 1000),
    searchCompanionBuildBatchSegments: envNum("DS_SEARCH_COMPANION_BATCH_SEGMENTS", 4),
    searchCompanionYieldBlocks: envNum("DS_SEARCH_COMPANION_YIELD_BLOCKS", 4),
    searchCompanionFileCacheMaxBytes: companionFileCacheBytes,
    searchCompanionFileCacheMaxAgeMs: envNum("DS_SEARCH_COMPANION_FILE_CACHE_MAX_AGE_MS", 24 * 60 * 60 * 1000),
    searchCompanionMappedCacheEntries: envNum("DS_SEARCH_COMPANION_MMAP_CACHE_ENTRIES", 64),
    searchCompanionTocCacheBytes: envNum("DS_SEARCH_COMPANION_TOC_CACHE_BYTES", 1 * 1024 * 1024),
    searchCompanionSectionCacheBytes: companionSectionCacheBytes,
    searchWalOverlayQuietPeriodMs: envNum("DS_SEARCH_WAL_OVERLAY_QUIET_MS", 5000),
    searchWalOverlayMaxBytes,
    indexCompactionFanout: envNum("DS_INDEX_COMPACTION_FANOUT", 16),
    indexMaxLevel: envNum("DS_INDEX_MAX_LEVEL", 4),
    indexCompactionConcurrency: envNum("DS_INDEX_COMPACT_CONCURRENCY", 4),
    indexRetireGenWindow: envNum("DS_INDEX_RETIRE_GEN_WINDOW", 2),
    indexRetireMinMs: envNum("DS_INDEX_RETIRE_MIN_MS", 5 * 60 * 1000),
    readMaxBytes: envNum("DS_READ_MAX_BYTES", 1 * 1024 * 1024),
    readMaxRecords: envNum("DS_READ_MAX_RECORDS", 1000),
    appendMaxBodyBytes: envNum("DS_APPEND_MAX_BODY_BYTES", 10 * 1024 * 1024),
    ingestFlushIntervalMs: envNum("DS_INGEST_FLUSH_MS", 10),
    ingestMaxBatchRequests: envNum("DS_INGEST_MAX_BATCH_REQS", 200),
    ingestMaxBatchBytes: envNum("DS_INGEST_MAX_BATCH_BYTES", 8 * 1024 * 1024),
    ingestMaxQueueRequests: envNum("DS_INGEST_MAX_QUEUE_REQS", 50000),
    ingestMaxQueueBytes: envNum("DS_INGEST_MAX_QUEUE_BYTES", 64 * 1024 * 1024),
    ingestConcurrency: envNum("DS_INGEST_CONCURRENCY", 2),
    ingestBusyTimeoutMs: envNum("DS_INGEST_BUSY_MS", 5000),
    localBacklogMaxBytes,
    memoryLimitBytes,
    sqliteCacheBytes,
    workerSqliteCacheBytes,
    readConcurrency: envNum("DS_READ_CONCURRENCY", 4),
    searchConcurrency: envNum("DS_SEARCH_CONCURRENCY", 2),
    asyncIndexConcurrency: envNum("DS_ASYNC_INDEX_CONCURRENCY", 1),
    heapSnapshotPath: process.env.DS_HEAP_SNAPSHOT_PATH?.trim() || null,
    memorySamplerPath: process.env.DS_MEMORY_SAMPLER_PATH?.trim() || null,
    memorySamplerIntervalMs: envNum("DS_MEMORY_SAMPLER_INTERVAL_MS", 1000),
    objectStoreTimeoutMs: envNum("DS_OBJECTSTORE_TIMEOUT_MS", 5000),
    objectStoreRetries: envNum("DS_OBJECTSTORE_RETRIES", 3),
    objectStoreBaseDelayMs: envNum("DS_OBJECTSTORE_RETRY_BASE_MS", 50),
    objectStoreMaxDelayMs: envNum("DS_OBJECTSTORE_RETRY_MAX_MS", 2000),
    expirySweepIntervalMs: envNum("DS_EXPIRY_SWEEP_MS", 60000),
    expirySweepBatchLimit: envNum("DS_EXPIRY_SWEEP_LIMIT", 100),
    metricsFlushIntervalMs: envNum("DS_METRICS_FLUSH_MS", 1e4),
    touchWorkers: envNum("DS_TOUCH_WORKERS", 1),
    touchCheckIntervalMs: envNum("DS_TOUCH_CHECK_MS", 250),
    touchMaxBatchRows: envNum("DS_TOUCH_MAX_BATCH_ROWS", 500),
    touchMaxBatchBytes: envNum("DS_TOUCH_MAX_BATCH_BYTES", 4 * 1024 * 1024),
    otlpTracesStream: process.env.DS_OTLP_TRACES_STREAM?.trim() || null,
    otlpAutoCreate: envBool("DS_OTLP_AUTO_CREATE", false),
    port: envNum("PORT", 8080)
  };
}

// src/auto_tune.ts
function memoryLimitForPreset(preset) {
  return preset === 256 ? 300 : preset;
}
function tuneForPreset(p) {
  return {
    segmentMaxMiB: p <= 1024 ? 8 : 16,
    segmentTargetRows: p <= 1024 ? 50000 : 1e5,
    segmentCacheMb: p >= 2048 ? 256 : 0,
    indexCheckMs: p >= 2048 ? 1000 : 3600000,
    sqliteCacheMb: Math.max(8, Math.floor(p / 16)),
    workerSqliteCacheMb: Math.max(8, Math.min(32, Math.floor(p / 128))),
    indexMemMb: Math.max(4, Math.floor(p / 64)),
    lexiconIndexCacheMb: p >= 8192 ? 256 : p >= 4096 ? 128 : p >= 2048 ? 64 : p >= 1024 ? 32 : p >= 512 ? 16 : 8,
    searchCompanionTocCacheMb: p >= 8192 ? 4 : p >= 4096 ? 2 : 1,
    searchCompanionSectionCacheMb: p >= 8192 ? 128 : p >= 4096 ? 64 : p >= 2048 ? 32 : p >= 1024 ? 16 : 8,
    ingestBatchMb: p >= 8192 ? 64 : p >= 4096 ? 16 : p >= 2048 ? 8 : p >= 1024 ? 4 : 2,
    ingestQueueMb: p >= 8192 ? 128 : p >= 4096 ? 64 : p >= 2048 ? 32 : p >= 1024 ? 16 : 8,
    ingestConcurrency: p >= 8192 ? 8 : p >= 4096 ? 4 : p >= 1024 ? 2 : 1,
    readConcurrency: p >= 8192 ? 16 : p >= 4096 ? 8 : p >= 1024 ? 4 : 2,
    searchConcurrency: p >= 8192 ? 8 : p >= 4096 ? 4 : p >= 1024 ? 2 : 1,
    asyncIndexConcurrency: p >= 8192 ? 4 : p >= 4096 ? 2 : 1,
    indexBuildConcurrency: p >= 8192 ? 4 : p >= 4096 ? 2 : 1,
    indexCompactConcurrency: p >= 8192 ? 4 : p >= 4096 ? 2 : 1,
    segmenterWorkers: p >= 8192 ? 4 : p >= 4096 ? 2 : p >= 2048 ? 1 : 0,
    uploadConcurrency: p >= 8192 ? 8 : p >= 4096 ? 4 : p >= 2048 ? 2 : 1,
    searchCompanionBatchSegments: p >= 8192 ? 4 : p >= 4096 ? 2 : 1,
    searchCompanionYieldBlocks: p >= 8192 ? 4 : p >= 4096 ? 2 : 1
  };
}

// src/local/state.ts
import { closeSync, existsSync as existsSync4, mkdirSync as mkdirSync3, openSync, readFileSync as readFileSync4, readdirSync as readdirSync2, writeFileSync } from "node:fs";
import { join as join3 } from "node:path";
import lockfile from "proper-lockfile";

// src/local/paths.ts
import envPaths from "env-paths";
import { join as join2, resolve } from "node:path";
function normalizeServerName(name) {
  const trimmed = (name ?? "default").trim();
  if (trimmed.length === 0)
    return "default";
  if (!/^[A-Za-z0-9._-]+$/.test(trimmed)) {
    throw dsError(`invalid server name: ${name}`);
  }
  return trimmed;
}
function getDurableStreamsDataRoot() {
  const override = process.env.DS_LOCAL_DATA_ROOT;
  if (override && override.trim().length > 0)
    return resolve(override);
  const root = envPaths("prisma-dev").data;
  return join2(root, "durable-streams");
}
function getServerDataDir(name) {
  return join2(getDurableStreamsDataRoot(), normalizeServerName(name));
}

// src/local/state.ts
function getDataDir(name) {
  return getServerDataDir(name);
}
function getDbPath(name) {
  return join3(getDataDir(name), "durable-streams.sqlite");
}
function getServerDumpPath(name) {
  return join3(getDataDir(name), "server.json");
}
function getLockPath(name) {
  return join3(getDataDir(name), "server.lock");
}
function ensureFile(path) {
  const fd = openSync(path, "a");
  closeSync(fd);
}
async function acquireLock(name) {
  const normalized = normalizeServerName(name);
  const dataDir = getDataDir(normalized);
  mkdirSync3(dataDir, { recursive: true });
  const lockPath = getLockPath(normalized);
  ensureFile(lockPath);
  const release = await lockfile.lock(lockPath, {
    realpath: false,
    stale: 30000,
    retries: { retries: 0 }
  });
  return async () => {
    try {
      await release();
    } catch {}
  };
}
function writeServerDump(name, dump) {
  const normalized = normalizeServerName(name);
  const dataDir = getDataDir(normalized);
  mkdirSync3(dataDir, { recursive: true });
  writeFileSync(getServerDumpPath(normalized), `${JSON.stringify(dump, null, 2)}
`, "utf8");
}

// src/local/config.ts
var LOCAL_AUTO_TUNE_PRESET_MB = 1024;
function buildLocalConfig(args) {
  const name = normalizeServerName(args.name);
  const dataDir = getDataDir(name);
  const dbPath = getDbPath(name);
  const base = loadConfig();
  const tune = tuneForPreset(LOCAL_AUTO_TUNE_PRESET_MB);
  const effectiveMemoryLimitMb = memoryLimitForPreset(LOCAL_AUTO_TUNE_PRESET_MB);
  const port = args.port == null ? 0 : Math.max(0, Math.floor(args.port));
  return {
    ...base,
    autoTuneRequestedMemoryMb: LOCAL_AUTO_TUNE_PRESET_MB,
    autoTunePresetMb: LOCAL_AUTO_TUNE_PRESET_MB,
    autoTuneEffectiveMemoryLimitMb: effectiveMemoryLimitMb,
    rootDir: dataDir,
    dbPath,
    memoryLimitBytes: 0,
    segmentMaxBytes: tune.segmentMaxMiB * 1024 * 1024,
    segmentTargetRows: tune.segmentTargetRows,
    sqliteCacheBytes: tune.sqliteCacheMb * 1024 * 1024,
    workerSqliteCacheBytes: tune.workerSqliteCacheMb * 1024 * 1024,
    indexRunMemoryCacheBytes: tune.indexMemMb * 1024 * 1024,
    ingestMaxBatchBytes: tune.ingestBatchMb * 1024 * 1024,
    ingestMaxQueueBytes: tune.ingestQueueMb * 1024 * 1024,
    ingestConcurrency: tune.ingestConcurrency,
    readConcurrency: tune.readConcurrency,
    searchConcurrency: tune.searchConcurrency,
    asyncIndexConcurrency: tune.asyncIndexConcurrency,
    indexBuildConcurrency: tune.indexBuildConcurrency,
    indexCompactionConcurrency: tune.indexCompactConcurrency,
    uploadConcurrency: tune.uploadConcurrency,
    searchCompanionBuildBatchSegments: tune.searchCompanionBatchSegments,
    searchCompanionYieldBlocks: tune.searchCompanionYieldBlocks,
    port,
    segmentCacheMaxBytes: 0,
    segmentFooterCacheEntries: 0,
    segmenterWorkers: 0,
    lexiconIndexCacheMaxBytes: 0,
    lexiconMappedCacheEntries: 0,
    searchCompanionFileCacheMaxBytes: 0,
    searchCompanionTocCacheBytes: 0,
    searchCompanionSectionCacheBytes: 0,
    touchCheckIntervalMs: Math.min(base.touchCheckIntervalMs, 5)
  };
}

// src/local/http.ts
import { createServer } from "node:http";
import { Readable } from "node:stream";
function hasBody(method) {
  const upper = method.toUpperCase();
  return upper !== "GET" && upper !== "HEAD";
}
function requestFromNode(req, opts) {
  const method = (req.method ?? "GET").toUpperCase();
  const host = req.headers.host ?? `${opts.hostname ?? "127.0.0.1"}:${opts.port}`;
  const url = `http://${host}${req.url ?? "/"}`;
  const init = {
    method,
    headers: req.headers
  };
  if (hasBody(method)) {
    init.body = Readable.toWeb(req);
    init.duplex = "half";
  }
  return new Request(url, init);
}
async function writeNodeResponse(req, res, response) {
  res.statusCode = response.status;
  response.headers.forEach((value, key) => {
    res.setHeader(key, value);
  });
  if (!response.body || req.method?.toUpperCase() === "HEAD") {
    res.end();
    return;
  }
  const body = Readable.fromWeb(response.body);
  await new Promise((resolve2, reject) => {
    body.on("error", reject);
    res.on("error", reject);
    res.on("finish", () => resolve2());
    body.pipe(res);
  });
}
async function serveFetchHandler(fetchHandler, opts) {
  if (typeof globalThis.Bun !== "undefined") {
    const server2 = Bun.serve({
      hostname: opts.hostname,
      port: opts.port,
      idleTimeout: 65,
      fetch: fetchHandler
    });
    return {
      port: server2.port ?? opts.port,
      close: async () => {
        server2.stop(true);
      }
    };
  }
  const hostname = opts.hostname ?? "127.0.0.1";
  const server = createServer(async (req, res) => {
    try {
      const request = requestFromNode(req, { hostname, port: opts.port });
      const response = await fetchHandler(request);
      await writeNodeResponse(req, res, response);
    } catch (err) {
      console.error("local fetch handler failed", err);
      res.statusCode = 500;
      res.setHeader("content-type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ error: { code: "internal", message: "internal server error" } }));
    }
  });
  await new Promise((resolve2, reject) => {
    server.once("error", reject);
    server.listen(opts.port, hostname, () => {
      server.off("error", reject);
      resolve2();
    });
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : opts.port;
  return {
    port,
    close: async () => {
      await new Promise((resolve2, reject) => {
        server.close((err) => err ? reject(err) : resolve2());
      });
    }
  };
}

// src/local/server.ts
async function startLocalDurableStreamsServer(opts = {}) {
  const name = normalizeServerName(opts.name);
  const hostname = opts.hostname ?? "127.0.0.1";
  const releaseLock = await acquireLock(name);
  let app = null;
  let http = null;
  let closed = false;
  try {
    const cfg = buildLocalConfig({ name, port: opts.port });
    app = createLocalApp(cfg);
    http = await serveFetchHandler(app.fetch, { hostname, port: cfg.port });
    const exportsPayload = {
      name,
      pid: process.pid,
      http: {
        port: http.port,
        url: `http://${hostname}:${http.port}`
      },
      sqlite: {
        path: getDbPath(name)
      }
    };
    const dump = {
      version: 1,
      name,
      pid: process.pid,
      startedAt: new Date().toISOString(),
      http: exportsPayload.http,
      sqlite: exportsPayload.sqlite
    };
    writeServerDump(name, dump);
    return {
      exports: exportsPayload,
      close: async () => {
        if (closed)
          return;
        closed = true;
        try {
          if (http)
            await http.close();
        } finally {
          try {
            await app?.close();
          } finally {
            await releaseLock();
          }
        }
      }
    };
  } catch (err) {
    try {
      if (http)
        await http.close();
    } catch {}
    try {
      await app?.close();
    } catch {}
    await releaseLock();
    throw err;
  }
}

export { parseLocalProcessOptions, startLocalDurableStreamsServer };
