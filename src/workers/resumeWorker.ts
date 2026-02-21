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

async function callGeminiWithTimeout(prompt: string, timeoutMs = 25000): Promise<string> {
    try {
        const result = await geminiModel.generateContent(prompt);
        const response = await result.response;
        const text = response.text();
        if (!text) throw new Error('Empty response from Gemini');
        return text;
    } catch (e: any) {
        if (e.message?.includes('404')) {
            throw new Error(`Gemini 2.0 Flash error (404). This often happens if the model name is incorrect or your API key is restricted. Details: ${e.message}`);
        }
        throw e;
    }
}

new Worker<ResumeJobData>(
    'resume-parsing',
    async (job: Job<ResumeJobData>) => {
        const { userId, resumeText } = job.data;

        // Truncate to prevent token overflow
        const safeText = resumeText.slice(0, 5000);

        // --- Cache check ---
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
        console.log(`[ResumeWorker] Parsing resume for userId=${userId}, job=${job.id} using Gemini 2.0 Flash`);
        const parseText = await callGeminiWithTimeout(PARSE_PROMPT + safeText);
        const parsedData = safeParseResume(parseText);

        // --- Score Resume ---
        console.log(`[ResumeWorker] Scoring resume for userId=${userId}, job=${job.id}`);
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
        } catch (firestoreError) {
            console.error(`[ResumeWorker] Firestore save error:`, firestoreError);
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
        }
    } catch (_) { }
}

console.log('[ResumeWorker] Listening on Gemini 2.0 Flash...');
