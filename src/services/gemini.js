import { GoogleGenAI } from '@google/genai';
import 'dotenv/config';
import { prisma } from '../utils/db.js';

async function getAiClient() {
  const config = await prisma.configuration.findUnique({ where: { id: 1 } });
  const dbKey = config?.geminiApiKey?.trim();
  const apiKey = dbKey ? dbKey : process.env.GEMINI_API_KEY;
  
  if (!apiKey) {
    throw new Error('Gemini API Key is not configured. Please add it via the settings dashboard.');
  }
  return new GoogleGenAI({ apiKey });
}

/**
 * Attempts to answer a screening question using the user's resume profile and custom fields.
 * @param {string} question The question text
 * @param {string[]} options Choice options (if any)
 * @param {object} profileContext Complete user profile data
 * @returns {Promise<{canAnswer: boolean, answer?: string, reasoning?: string}>}
 */
export async function answerScreeningQuestion(question, options = [], profileContext = {}) {
  try {
    const ai = await getAiClient();
    
    const prompt = `
You are an advanced AI assistant filling out a job application. Your goal is to answer a screening question honestly and accurately using the applicant's profile details.

APPLICANT PROFILE DATA:
- Headline: ${profileContext.headline || 'N/A'}
- Professional Summary: ${profileContext.profileSummary || 'N/A'}
- Key Skills: ${Array.isArray(profileContext.keySkills) ? profileContext.keySkills.join(', ') : 'N/A'}
- Calculated Experience: ${profileContext.calculatedExperience?.text || 'N/A'}
- Career Start Date: ${profileContext.careerStartDate || 'N/A'}
- Custom Profile Fields (Manual Fields): ${JSON.stringify(profileContext.customFields || {})}
- Master Resume Text: ${profileContext.resumeText || 'N/A'}

SCREENING QUESTION DETAILS:
- Question: "${question}"
- Options (if multiple choice): ${JSON.stringify(options)}

INSTRUCTIONS:
1. Review the question and options.
2. Scan the applicant's profile data for relevant information (e.g. experience years, specific tool/tech skills, location, notices).
3. If the answer is present, clear, or can be reasonably inferred with high confidence, set "canAnswer" to true and provide the correct "answer" (if multiple choice, pick the exact option that matches).
4. If the question asks for notice period, location, salary, or GitHub and it is present in the profile, answer it.
5. If the answer is NOT present, is ambiguous, or require personal preference (e.g., "Are you willing to relocate to a city not mentioned in profile?"), set "canAnswer" to false. Do not guess blindly.
6. Provide a brief reasoning for your decision.

Return ONLY a JSON object with this exact structure:
{
  "canAnswer": true/false,
  "answer": "string or choice option",
  "reasoning": "short explanation"
}
`;

    let response;
    let retries = 3;
    let delay = 1000;
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: prompt,
          config: {
            responseMimeType: 'application/json'
          }
        });
        break;
      } catch (err) {
        if (attempt === retries) {
          throw err;
        }
        console.warn(`[Gemini Service] generateContent failed (attempt ${attempt}). Retrying in ${delay}ms...`);
        await new Promise(res => setTimeout(res, delay));
        delay *= 2;
      }
    }

    const result = JSON.parse(response.text);
    return {
      canAnswer: Boolean(result.canAnswer),
      answer: result.answer ? String(result.answer) : undefined,
      reasoning: result.reasoning
    };
  } catch (error) {
    console.error('[Gemini Service] Error answering question:', error.message);
    return { canAnswer: false, reasoning: `AI failure: ${error.message}` };
  }
}

/**
 * Compares a job description against the user's resume text and generates a tailored optimization checklist.
 * @param {object} jobDetails Job title, company, and description
 * @param {string} resumeText Master resume text
 * @returns {Promise<string>} Markdown checklist
 */
export async function generateResumeChecklist(jobDetails, resumeText) {
  try {
    const ai = await getAiClient();
    
    const prompt = `
You are an expert ATS (Applicant Tracking System) optimizer and resume writer.
Compare the user's master resume against the job details and generate a practical, step-by-step markdown checklist to tailor the resume for this specific position.

JOB DETAILS:
- Title: ${jobDetails.title}
- Company: ${jobDetails.company}
- Job Description:
${jobDetails.description || 'N/A'}

APPLICANT MASTER RESUME TEXT:
${resumeText || 'N/A'}

OUTPUT REQUIREMENTS:
- Provide a clear, actionable checklist in Markdown.
- Highlight key matching skills, tools, or projects to add or emphasize.
- Highlight any missing keywords that are prominent in the Job Description.
- Suggest phrasing modifications for maximum impact.
- Keep the checklist concise and readable on a mobile screen.
`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt
    });

    return response.text;
  } catch (error) {
    console.error('[Gemini Service] Error generating checklist:', error.message);
    return `### ⚠️ AI Resume Optimizer Error\nFailed to generate checklist: ${error.message}`;
  }
}
