import { createWriteStream } from 'node:fs';
import path from 'node:path';
import PDFDocument from 'pdfkit';
import { GoogleGenAI } from '@google/genai';

export async function tailorResume(jobDetails, baseProfile, outputPath) {
  if (!process.env.GEMINI_API_KEY) {
    console.warn("GEMINI_API_KEY not set. Skipping AI resume tailoring.");
    return false;
  }
  
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  
  const prompt = `
  You are an expert resume writer. Below is the applicant's base profile and a job description.
  Rewrite the applicant's "Summary" and "Key Skills" to specifically highlight their relevant experience for this job.
  Keep it professional, concise, and truthful to the base profile.
  
  Base Profile:
  Headline: ${baseProfile.headline}
  Summary: ${baseProfile.profileSummary}
  Skills: ${baseProfile.keySkills.join(', ')}
  
  Job Details:
  Title: ${jobDetails.title}
  Company: ${jobDetails.company}
  Description: ${jobDetails.description || 'N/A'}
  
  Return ONLY a JSON object with this exact structure:
  {
    "tailoredSummary": "string",
    "tailoredSkills": ["skill1", "skill2"]
  }
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
      }
    });

    const tailored = JSON.parse(response.text);
    
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument();
      const stream = createWriteStream(outputPath);
      doc.pipe(stream);
      
      doc.fontSize(20).text('JAYA TEJA VENKUMAHANTHI', { align: 'center' });
      doc.fontSize(12).fillColor('gray').text(baseProfile.headline, { align: 'center' });
      doc.moveDown(2);
      
      doc.fillColor('black').fontSize(16).text('Professional Summary');
      doc.moveDown(0.5);
      doc.fontSize(12).text(tailored.tailoredSummary);
      doc.moveDown(2);
      
      doc.fontSize(16).text('Key Skills');
      doc.moveDown(0.5);
      doc.fontSize(12).text(tailored.tailoredSkills.join(' • '));
      doc.moveDown(2);
      
      doc.fontSize(16).text('Experience');
      doc.moveDown(0.5);
      doc.fontSize(12).text('Detailed employment history available in standard portfolio/resume.');
      
      doc.end();
      
      stream.on('finish', () => resolve(true));
      stream.on('error', reject);
    });
  } catch (error) {
    console.error("AI Tailoring failed:", error);
    return false;
  }
}
