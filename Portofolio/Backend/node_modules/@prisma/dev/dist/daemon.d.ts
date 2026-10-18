import { ReadonlyServer } from './index.js';
import { E as ExperimentalQueryInsightsMetadata, a as ExperimentalStreams } from './state-CNKFAMiX.js';
import './db-HU7BFiFV.js';
import '@electric-sql/pglite';
import './runtime-assets.js';
import 'valibot';

type DaemonServer = Omit<ReadonlyServer, "experimental"> & {
    experimental?: {
        queryInsights?: ExperimentalQueryInsightsMetadata;
        streams?: ExperimentalStreams;
    };
};
interface DaemonMessageStarted {
    type: "started";
    server: DaemonServer;
}
interface DaemonMessageError {
    type: "error";
    error: string;
}
type DaemonMessage = DaemonMessageStarted | DaemonMessageError;

export type { DaemonMessage, DaemonMessageError, DaemonMessageStarted };
