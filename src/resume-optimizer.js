import fs from 'node:fs/promises';
import path from 'node:path';
import { prisma } from './utils/db.js';
import { generateResumeChecklist } from './services/gemini.js';

/**
 * Optimizes the resume for a given job row by calling Gemini and writing results to Supabase and a local file.
 * @param {object} jobRow Database Job row
 * @returns {Promise<boolean>} Success status
 */
export async function optimizeResumeForJob(jobRow) {
  try {
    console.log(`[Resume Optimizer] Generating ATS checklist for ${jobRow.serialNumber}...`);
    
    // Fetch configuration for master resume text
    const config = await prisma.configuration.findUnique({ where: { id: 1 } });
    const resumeText = config?.resumeText || '';
    
    if (!resumeText) {
      console.warn('[Resume Optimizer] No master resume text found in Configuration. Skipping checklist generation.');
      return false;
    }

    const jobDetails = {
      title: jobRow.title,
      company: jobRow.company,
      description: jobRow.description
    };

    const checklist = await generateResumeChecklist(jobDetails, resumeText);

    // Save to database
    await prisma.job.update({
      where: { id: jobRow.id },
      data: { resumeChecklist: checklist }
    });

    // Save to local job folder README.md
    if (jobRow.resumeFolder) {
      const readmePath = path.join(jobRow.resumeFolder, 'README.md');
      
      let existingContent = '';
      try {
        existingContent = await fs.readFile(readmePath, 'utf8');
      } catch {
        // Build base readme if it doesn't exist
        existingContent = [
          `# ${jobRow.serialNumber} - ${jobRow.title}`,
          '',
          `Company: ${jobRow.company}`,
          `Location: ${jobRow.location}`,
          `Status: ${jobRow.status}`,
          `Job URL: ${jobRow.url}`,
          ''
        ].join('\n');
      }

      // Append or replace the AI optimization section
      const aiSectionMarker = '\n\n## 🤖 AI ATS Resume Optimization Checklist\n';
      const cleanExisting = existingContent.split(aiSectionMarker)[0];
      const updatedContent = `${cleanExisting}${aiSectionMarker}${checklist}`;

      await fs.writeFile(readmePath, updatedContent, 'utf8');
      console.log(`[Resume Optimizer] Checklist written to ${readmePath}`);
    }

    return true;
  } catch (error) {
    console.error(`[Resume Optimizer] Tailoring checklist failed for ${jobRow.serialNumber}:`, error.message);
    return false;
  }
}
