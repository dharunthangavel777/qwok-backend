export const PARSE_PROMPT = `
You are a professional resume parser AI. Extract all relevant information from the resume text below.
Return ONLY valid JSON — no explanation, no markdown fences, no extra text.

Output format:
{
  "name": "Full Name or null",
  "email": "Email or null",
  "phone": "Phone number or null",
  "location": "City, State or null",
  "bio": "2-3 sentence professional summary focusing on expertise",
  "category": "Primary job title or category (e.g. Flutter Developer, UI Designer)",
  "skills": {
    "technical": [{"name": "Skill", "confidence": <float 0-1>}],
    "tools": [{"name": "Tool", "confidence": <float 0-1>}],
    "soft": [{"name": "Skill", "confidence": <float 0-1>}]
  },
  "experience": <total years of experience as a number or null>,
  "education": [
    {"degree": "Degree Name", "institution": "School Name", "year": "Year"}
  ],
  "workExperience": [
    {"title": "Role Name", "company": "Company Name", "duration": "e.g. 2021-2023", "description": "Quantifiable achievements"}
  ],
  "projects": [
    {"title": "Project Title", "description": "Technologies used and impact"}
  ],
  "certifications": [
    {"name": "Cert Name", "issuer": "Issuer", "date": "Date"}
  ]
}

Guidelines:
1. Categorize skills specifically into technical, tools, and soft.
2. If text is messy or contains multiple languages, prioritize English extraction.
3. For categories, use standard titles (e.g., 'Backend Engineer' instead of 'Server side guy').

Resume Text:
`;

export const SCORE_PROMPT = `
You are a professional resume evaluator. Analyze the resume text below and return a quality score.
Return ONLY valid JSON — no explanation, no markdown fences, no extra text.

Output format:
{
  "score": <integer 0-100>,
  "strengths": ["Strength 1", "Strength 2"],
  "weaknesses": ["Weakness 1", "Weakness 2"],
  "suggestions": ["Suggestion 1", "Suggestion 2", "Suggestion 3"]
}

Evaluation criteria:
- Skills depth and relevance (30%)
- Work experience clarity and impact (30%)
- Project quality (20%)
- Profile completeness (20%)

Resume Text:
`;
