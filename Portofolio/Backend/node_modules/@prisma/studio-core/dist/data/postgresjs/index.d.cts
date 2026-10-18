import { Sql } from 'postgres';
import { N as Executor } from '../../adapter-j-hUrs7K.cjs';
import 'kysely';

declare function createPostgresJSExecutor(postgresjs: Sql): Executor;

export { createPostgresJSExecutor };
