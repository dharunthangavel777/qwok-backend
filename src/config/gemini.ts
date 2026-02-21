import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import dotenv from 'dotenv';

dotenv.config();

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
    console.warn('[Gemini] GEMINI_API_KEY is not set. Resume parsing will fail.');
}

const genAI = new GoogleGenerativeAI(apiKey || '');

export const geminiModel: GenerativeModel = genAI.getGenerativeModel({
    model: 'gemini-1.5-flash',
    generationConfig: {
        temperature: 0.1, // Low temp for consistent JSON output
        maxOutputTokens: 2048,
    },
});
