import { DatabaseSync } from 'node:sqlite';
import { N as Executor } from '../../adapter-j-hUrs7K.js';
import 'kysely';

declare function createNodeSQLiteExecutor(database: DatabaseSync): Executor;

export { createNodeSQLiteExecutor };
