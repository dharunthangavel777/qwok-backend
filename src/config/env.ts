import dotenv from 'dotenv';
dotenv.config();

console.log('[Env] Variables loaded. Check:', {
    NODE_ENV: process.env.NODE_ENV,
    HAS_REDIS_URL: !!process.env.REDIS_URL,
    HAS_REDIS_HOST: !!process.env.REDIS_HOST,
    REDIS_HOST: process.env.REDIS_HOST,
});

export default process.env;
