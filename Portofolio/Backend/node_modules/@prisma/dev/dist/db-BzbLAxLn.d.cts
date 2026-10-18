import { PGlite } from '@electric-sql/pglite';
import { E as ExperimentalQueryInsightsMetadata, d as ServerState } from './state-CNKFAMiX.cjs';

interface PrismaQueryInfo {
    action: string;
    isRaw: boolean;
    model?: string;
    payload?: unknown;
}
interface QueryInsightsEvent {
    applicationName: string | null;
    durationMs: number;
    groupKey: string | null;
    prismaQueryInfo: PrismaQueryInfo | null;
    query: string;
    queryId: string;
    reads: number;
    rowsReturned: number;
    tables: string[];
    timestamp: string;
}
interface QueryInsightsSnapshotRequest {
    excludeApplications?: string[];
    limit?: number;
    since?: number;
}
interface QueryInsightsSnapshotQuery {
    count: number;
    duration: number;
    groupKey?: string | null;
    id: string;
    lastSeen: number;
    maxDurationMs?: number | null;
    minDurationMs?: number | null;
    prismaQueryInfo?: PrismaQueryInfo | null;
    query: string;
    queryId?: string | null;
    reads: number;
    rowsReturned: number;
    tables: string[];
}
interface QueryInsightsSnapshot {
    generatedAt: number;
    queries: QueryInsightsSnapshotQuery[];
}
interface ExperimentalQueryInsights extends ExperimentalQueryInsightsMetadata {
    snapshot(input?: QueryInsightsSnapshotRequest): Promise<QueryInsightsSnapshot>;
}

type QueryInsightsSubscriber = (events: readonly QueryInsightsEvent[]) => void;
interface QueryInsightsBridge {
    close(): Promise<void>;
    subscribe(callback: QueryInsightsSubscriber): () => void;
}

interface WalEvent {
    oldRecord: Record<string, unknown> | null;
    record: Record<string, unknown> | null;
    schema: string;
    table: string;
    txid: string;
    type: "delete" | "insert" | "update";
}
interface WalEventBridge {
    close(): Promise<void>;
    poll(): Promise<void>;
    subscribe(callback: WalEventSubscriber): () => void;
}
interface WalEventBridgeOptions {
    database?: string;
    host?: string;
    password?: string;
    port?: number;
    username?: string;
}
type WalEventSubscriber = (events: WalEvent[]) => void;
type PolledMessage = {
    name: string;
    text?: string;
};
declare function attachWalEventBridge(db: PGlite, _options?: WalEventBridgeOptions): Promise<WalEventBridge>;
declare function shouldPollWalAfterMessages(messages: PolledMessage[]): boolean;
declare function shouldPollWalAfterResponse(response: Uint8Array): boolean;

interface DBServer {
    attachQueryInsightsBridge(): Promise<QueryInsightsBridge>;
    attachWalEventBridge(): Promise<WalEventBridge>;
    close(): Promise<void>;
    readonly connectionLimit: number;
    readonly connectionString: string;
    readonly connectTimeout: number;
    readonly database: string;
    dump(destinationPath: string): Promise<void>;
    readonly maxIdleConnectionLifetime: number;
    readonly password: string;
    readonly poolTimeout: number;
    readonly port: number;
    readonly prismaORMConnectionString: string;
    getPrimaryKeyColumns(schema: string, table: string): Promise<readonly string[]>;
    readonly socketTimeout: number;
    readonly sslMode: string;
    readonly terminalCommand: string;
    readonly username: string;
}
interface DBDump {
    dumpPath: string;
}
type DBServerPurpose = "database" | "shadow_database";
declare function startDBServer(purpose: DBServerPurpose, serverState: ServerState): Promise<DBServer>;
declare function startLazyShadowDBServer(serverState: Pick<ServerState, "debug" | "shadowDatabasePort" | "shadowDatabaseIdleTimeoutMillis"> & {
    pgliteDataDirPath?: string;
}, startBackend?: () => Promise<DBServer>): Promise<DBServer>;
type DumpDBOptions<D extends string> = {
    dataDir: string;
    db?: never;
    debug?: boolean;
    destinationPath?: D;
} | {
    dataDir?: never;
    db: PGlite;
    debug?: boolean;
    destinationPath?: D;
};
declare function dumpDB<D extends string = never>(options: DumpDBOptions<D>): Promise<[D] extends [never] ? string : void>;

export { type DBServerPurpose as D, type ExperimentalQueryInsights as E, type PrismaQueryInfo as P, type QueryInsightsSnapshot as Q, type WalEvent as W, type QueryInsightsSnapshotQuery as a, type QueryInsightsSnapshotRequest as b, type DBDump as c, type DBServer as d, type DumpDBOptions as e, type WalEventBridge as f, attachWalEventBridge as g, dumpDB as h, shouldPollWalAfterResponse as i, startDBServer as j, startLazyShadowDBServer as k, shouldPollWalAfterMessages as s };
