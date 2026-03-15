import { z } from 'zod';

export const EducationSchema = z.object({
    degree: z.string().nullable().optional(),
    institution: z.string().nullable().optional(),
    year: z.string().nullable().optional(),
});

export const WorkExperienceSchema = z.object({
    title: z.string().nullable().optional(),
    company: z.string().nullable().optional(),
    duration: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
});

export const ProjectSchema = z.object({
    title: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
});

export const CertificationSchema = z.object({
    name: z.string().nullable().optional(),
    issuer: z.string().nullable().optional(),
    date: z.string().nullable().optional(),
});

export const SkillWithConfidenceSchema = z.object({
    name: z.string(),
    confidence: z.number().min(0).max(1),
});

export const ResumeParseResultSchema = z.object({
    name: z.string().nullable().optional(),
    email: z.string().nullable().optional(),
    phone: z.string().nullable().optional(),
    location: z.string().nullable().optional(),
    bio: z.string().nullable().optional(),
    category: z.string().nullable().optional(),
    skills: z.object({
        technical: z.array(SkillWithConfidenceSchema).default([]),
        tools: z.array(SkillWithConfidenceSchema).default([]),
        soft: z.array(SkillWithConfidenceSchema).default([]),
    }),
    experience: z.number().nullable().optional(),
    education: z.array(EducationSchema).default([]),
    workExperience: z.array(WorkExperienceSchema).default([]),
    projects: z.array(ProjectSchema).default([]),
    certifications: z.array(CertificationSchema).default([]),
});

export const ResumeScoreSchema = z.object({
    score: z.number().min(0).max(100),
    strengths: z.array(z.string()).default([]),
    weaknesses: z.array(z.string()).default([]),
    suggestions: z.array(z.string()).default([]),
});

export type ResumeParseResult = z.infer<typeof ResumeParseResultSchema>;
export type ResumeScore = z.infer<typeof ResumeScoreSchema>;
