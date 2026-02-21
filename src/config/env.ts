import dotenv from 'dotenv';
dotenv.config();

console.log('[Env] Variables loaded. Check:', {
    NODE_ENV: process.env.NODE_ENV,
    HAS_REDIS_URL: !!process.env.REDIS_URL,
    HAS_HF_TOKEN: !!process.env.HF_TOKEN,
    HAS_FIREBASE: !!process.env.FIREBASE_SERVICE_ACCOUNT,
});

export default process.env;
