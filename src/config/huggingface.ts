import { HfInference } from '@huggingface/inference';
import './env';

const hfToken = process.env.HF_TOKEN;

console.log('[HuggingFace] Initializing...', {
    hasToken: !!hfToken,
    tokenPrefix: hfToken ? hfToken.substring(0, 5) : 'none',
    model: 'Qwen/Qwen2.5-7B-Instruct'
});

export const hf = new HfInference(hfToken);

// Qwen 2.5 7B Instruct - Using Chat Completion for better JSON support
export const HF_MODEL = 'Qwen/Qwen2.5-7B-Instruct';

