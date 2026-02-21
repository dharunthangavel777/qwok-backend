import { HfInference } from '@huggingface/inference';
import './env';

const hfToken = process.env.HF_TOKEN;

if (!hfToken) {
    console.warn('[HuggingFace] HF_TOKEN is not set. Resume parsing will fail.');
}

export const hf = new HfInference(hfToken);

// Using Qwen 2.5 7B Instruct - great for JSON and extraction
export const HF_MODEL = 'Qwen/Qwen2.5-7B-Instruct';
