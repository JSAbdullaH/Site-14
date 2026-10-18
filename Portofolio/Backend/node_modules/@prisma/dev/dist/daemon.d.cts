import { ReadonlyServer } from './index.cjs';
import { E as ExperimentalQueryInsightsMetadata, a as ExperimentalStreams } from './state-CNKFAMiX.cjs';
import './db-BzbLAxLn.cjs';
import '@electric-sql/pglite';
import './runtime-assets.cjs';
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
