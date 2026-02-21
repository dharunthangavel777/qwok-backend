import { Worker, Job } from 'bullmq';
import * as admin from 'firebase-admin';
import crypto from 'crypto';
import { queueRedisClient, redisClient } from '../config/redis';
import { geminiModel } from '../config/gemini';
import { getIO, userSocketMap } from '../config/socket';
import { PARSE_PROMPT, SCORE_PROMPT } from '../modules/resume/resume.prompts';
import { safeParseResume, safeParseScore } from '../modules/resume/resume.parser';

const CACHE_PREFIX = 'resume:cache:';
const CACHE_TTL_SECONDS = 60 * 60 * 24; // 24 hours

interface ResumeJobData {
    userId: string;
    resumeText: string;
}

async function callGeminiWithTimeout(prompt: string, timeoutMs = 20000): Promise<string> {
    const geminiCall = geminiModel.generateContent(prompt);
    const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Gemini timeout after 20s')), timeoutMs)
    );
    const result = await Promise.race([geminiCall, timeout]);
    const text = (await result.response).text();
    if (!text) throw new Error('Empty response from Gemini');
    return text;
}

new Worker<ResumeJobData>(
    'resume-parsing',
    async (job: Job<ResumeJobData>) => {
        const { userId, resumeText } = job.data;

        // Truncate to prevent token overflow
        const safeText = resumeText.slice(0, 4500);

        // --- Cache check (by content hash) ---
        const hash = crypto.createHash('sha256').update(safeText).digest('hex');
        const cacheKey = `${CACHE_PREFIX}${hash}`;
        const cachedResult = await redisClient.get(cacheKey);

        if (cachedResult) {
            console.log(`[ResumeWorker] Cache hit for job ${job.id}`);
            const cached = JSON.parse(cachedResult);
            emitToUser(userId, cached);
            return cached;
        }

        // --- Parse Resume ---
        console.log(`[ResumeWorker] Parsing resume for userId=${userId}, job=${job.id}`);
        const parseText = await callGeminiWithTimeout(PARSE_PROMPT + safeText);
        const parsedData = safeParseResume(parseText);

        // --- Score Resume ---
        const scoreText = await callGeminiWithTimeout(SCORE_PROMPT + safeText);
        const scoreData = safeParseScore(scoreText);

        const finalResult = { ...parsedData, ...scoreData };

        // --- Save to Firestore ---
        try {
            await admin.firestore()
                .collection('users')
                .doc(userId)
                .set({
                    resumeParsed: finalResult,
                    resumeUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
                }, { merge: true });
            console.log(`[ResumeWorker] Saved parsed resume to Firestore for userId=${userId}`);
        } catch (firestoreError) {
            console.error(`[ResumeWorker] Firestore save error:`, firestoreError);
            // Don't fail the job — client still gets the result via socket
        }

        // --- Cache result ---
        await redisClient.setex(cacheKey, CACHE_TTL_SECONDS, JSON.stringify(finalResult));

        // --- Emit via WebSocket ---
        emitToUser(userId, finalResult);

        return finalResult;
    },
    {
        connection: queueRedisClient,
        concurrency: 3,
    }
);

function emitToUser(userId: string, data: any) {
    try {
        const socketId = userSocketMap.get(userId);
        if (socketId) {
            getIO().to(socketId).emit('resume:done', { success: true, data });
            console.log(`[ResumeWorker] Emitted resume:done to socketId=${socketId}`);
        } else {
            console.log(`[ResumeWorker] No active socket for userId=${userId}. Client will poll.`);
        }
    } catch (_) {
        // Socket not initialized yet (e.g., during tests) — ignore
    }
}

console.log('[ResumeWorker] Started — listening on "resume-parsing" queue');
