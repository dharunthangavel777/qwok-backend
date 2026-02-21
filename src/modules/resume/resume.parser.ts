import { ResumeParseResultSchema, ResumeScoreSchema, ResumeParseResult, ResumeScore } from './resume.schema';

/**
 * Strips markdown code fences (```json ... ```) and extracts the raw JSON string.
 */
function extractJson(text: string): string {
    // Remove markdown fences if present
    const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) return fenceMatch[1].trim();

    // Find the outermost JSON object
    const objMatch = text.match(/\{[\s\S]*\}/);
    if (objMatch) return objMatch[0].trim();

    return text.trim();
}

export function safeParseResume(aiText: string): ResumeParseResult {
    const jsonStr = extractJson(aiText);
    const raw = JSON.parse(jsonStr);
    return ResumeParseResultSchema.parse(raw);
}

export function safeParseScore(aiText: string): ResumeScore {
    const jsonStr = extractJson(aiText);
    const raw = JSON.parse(jsonStr);
    return ResumeScoreSchema.parse(raw);
}
