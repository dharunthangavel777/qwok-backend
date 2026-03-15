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

async function callGemini(prompt: string, text: string): Promise<string> {
    const result = await geminiModel.generateContent(prompt + text);
    const response = await result.response;
    return response.text();
}

new Worker<ResumeJobData>(
    'resume-parsing',
    async (job: Job<ResumeJobData>) => {
        const { userId, resumeText } = job.data;

        // Truncate to prevent token overflow
        const safeText = resumeText.slice(0, 10000); // Gemini handles larger contexts than HF

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

        // --- Parse & Score Resume in Parallel ---
        console.log(`[ResumeWorker] Processing resume for userId=${userId}, job=${job.id} using Gemini 2.0 Flash`);
        
        try {
            const [parseText, scoreText] = await Promise.all([
                callGemini(PARSE_PROMPT, safeText),
                callGemini(SCORE_PROMPT, safeText)
            ]);

            const parsedData = safeParseResume(parseText);
            const scoreData = safeParseScore(scoreText);

            const finalResult = { ...parsedData, ...scoreData };

            // --- Save to Firestore ---
            await admin.firestore()
                .collection('users')
                .doc(userId)
                .set({
                    resumeParsed: finalResult,
                    resumeUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
                }, { merge: true });

            // --- Cache result ---
            await redisClient.setex(cacheKey, CACHE_TTL_SECONDS, JSON.stringify(finalResult));

            // --- Emit via WebSocket ---
            emitToUser(userId, finalResult);

            return finalResult;
        } catch (error: any) {
            console.error(`[ResumeWorker] Error processing job ${job.id}:`, error);
            throw error;
        }
    },
    {
        connection: queueRedisClient,
        concurrency: 5, // Gemini 2.0 Flash can handle higher concurrency
    }
);

function emitToUser(userId: string, data: any) {
    try {
        const socketId = userSocketMap.get(userId);
        if (socketId) {
            getIO().to(socketId).emit('resume:done', { success: true, data });
        }
    } catch (_) { }
}

console.log(`[ResumeWorker] Running with Gemini 2.0 Flash API`);
