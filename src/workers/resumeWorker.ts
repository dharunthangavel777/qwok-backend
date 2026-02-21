import { Worker, Job } from 'bullmq';
import * as admin from 'firebase-admin';
import crypto from 'crypto';
import { queueRedisClient, redisClient } from '../config/redis';
import { hf, HF_MODEL } from '../config/huggingface';
import { getIO, userSocketMap } from '../config/socket';
import { PARSE_PROMPT, SCORE_PROMPT } from '../modules/resume/resume.prompts';
import { safeParseResume, safeParseScore } from '../modules/resume/resume.parser';

const CACHE_PREFIX = 'resume:cache:';
const CACHE_TTL_SECONDS = 60 * 60 * 24; // 24 hours

interface ResumeJobData {
    userId: string;
    resumeText: string;
}

async function callHuggingFaceChatWithTimeout(prompt: string, timeoutMs = 45000): Promise<string> {
    const hfCall = hf.chatCompletion({
        model: HF_MODEL,
        messages: [
            { role: 'user', content: prompt }
        ],
        max_tokens: 2048,
        temperature: 0.1,
    });

    const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Hugging Face timeout after 45s')), timeoutMs)
    );

    const result = await Promise.race([hfCall, timeout]);
    const text = result.choices[0].message.content;

    if (!text) throw new Error('Empty response from Hugging Face');
    return text;
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
        console.log(`[ResumeWorker] Parsing resume for userId=${userId}, job=${job.id} using Hugging Face (${HF_MODEL})`);
        const parseText = await callHuggingFaceChatWithTimeout(PARSE_PROMPT + safeText);
        const parsedData = safeParseResume(parseText);

        // --- Score Resume ---
        console.log(`[ResumeWorker] Scoring resume for userId=${userId}, job=${job.id}`);
        const scoreText = await callHuggingFaceChatWithTimeout(SCORE_PROMPT + safeText);
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
        concurrency: 2, // Slightly lower concurrency for better HF stability
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

console.log(`[ResumeWorker] Running with Hugging Face Chat API (${HF_MODEL})`);
