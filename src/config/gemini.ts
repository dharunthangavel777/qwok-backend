import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import './env';

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
    console.warn('[Gemini] GEMINI_API_KEY is not set. Resume parsing will fail.');
}

const genAI = new GoogleGenerativeAI(apiKey || '');

// Using Gemini 2.0 Flash - Ultra fast and multimodal
export const geminiModel: GenerativeModel = genAI.getGenerativeModel({
    model: 'gemini-2.0-flash',
    generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 2048,
    },
});
