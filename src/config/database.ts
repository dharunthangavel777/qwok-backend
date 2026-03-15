import { Pool } from 'pg';
import env from './env';

const pool = new Pool({
    connectionString: env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/qwok',
});

pool.on('error', (err) => {
    console.error('Unexpected error on idle client', err);
});

export default pool;
