import { Pool } from 'mysql2/promise';
import { V as SequenceExecutor } from '../../adapter-j-hUrs7K.cjs';
import 'kysely';

declare function createMySQL2Executor(pool: Pool): SequenceExecutor;

export { createMySQL2Executor };
