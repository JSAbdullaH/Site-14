import { Database } from 'sql.js';
import { N as Executor } from '../../adapter-j-hUrs7K.js';
import 'kysely';

declare function createSQLJSExecutor(database: Database): Executor;

export { createSQLJSExecutor };
