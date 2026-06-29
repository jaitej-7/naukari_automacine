import { handleQuestionnaire } from './qa-engine.js';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function autoApply(context, jobRow, log, config) {
  // Detect internship listings early and skip auto‑apply
  const titleLower = (jobRow.title || '').toLowerCase();
  const isInternship = /\bintern\b/.test(titleLower);
  if (isInternship) {
    // Record internship job for the new Internships tab
    const fs = require('fs');
    const path = require('path');
    const internshipsPath = path.join(__dirname, '../../reports/internships.csv');
    const line = `"${new Date().toISOString()}","${jobRow.title}","${jobRow.company}","${jobRow.url}"\n`;
    try {
      if (!fs.existsSync(internshipsPath)) {
        fs.writeFileSync(internshipsPath, 'capturedAt,title,company,url\n');
      }
      fs.appendFileSync(internshipsPath, line);
      log.actions.push(`Recorded internship job ${jobRow.url}`);
    } catch (e) {
      log.warnings.push(`Failed to record internship job ${jobRow.url}: ${e.message}`);
    }
    return 'internship';
  }
  const jobUrl = jobRow.url;
  const page = await context.newPage();
  try {
    console.log(`[AutoApply] Navigating to: ${jobUrl}`);
    await page.goto(jobUrl, { waitUntil: 'domcontentloaded' });
    // Give React time to hydrate the page fully
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch((err) => console.error('Caught error:', err.message));
    await sleep(3000);

    // --- Detect available button types and status ---
    const { hasEasyApply, hasRegularApply, alreadyApplied } = await page.evaluate(() => {
      const allBtns = Array.from(document.querySelectorAll('button, a, div[class*="apply"]'));
      
      const alreadyApplied = allBtns.some(el => /^applied$/i.test((el.textContent || '').trim()));
      const hasEasyApply = allBtns.some(el => /easy apply/i.test((el.textContent || '').trim()));
      const hasRegularApply = allBtns.some(el => /^apply now$|^apply$|^apply on company site$/i.test((el.textContent || '').trim()));
      
      return { hasEasyApply, hasRegularApply, alreadyApplied };
    });

    console.log(`[AutoApply] Buttons detected — Easy Apply: ${hasEasyApply}, Regular Apply: ${hasRegularApply}, Already Applied: ${alreadyApplied}`);

    if (alreadyApplied) {
      log.actions.push(`Skipped ${jobUrl} — Already applied.`);
      return true; // We consider this a "success" so it doesn't get stuck in the queue
    }

    if (!hasEasyApply && !hasRegularApply) {
      log.warnings.push(`No apply button found on ${jobUrl} (Job might be closed, expired, or require external platform)`);
      return 'expired';
    }

    // If only regular Apply (external redirect), flag for manual action
    if (!hasEasyApply && hasRegularApply) {
      // Record manual apply needed job
      const fs = require('fs');
      const path = require('path');
      const manualPath = path.join(__dirname, '../../reports/manual-apply.json');
      const entry = { capturedAt: new Date().toISOString(), title: jobRow.title, company: jobRow.company, url: jobRow.url };
      try {
        const existing = fs.existsSync(manualPath) ? JSON.parse(fs.readFileSync(manualPath, 'utf8')) : [];
        existing.push(entry);
        fs.writeFileSync(manualPath, JSON.stringify(existing, null, 2));
        log.actions.push(`Recorded manual apply job ${jobRow.url}`);
      } catch (e) {
        log.warnings.push(`Failed to record manual apply job ${jobRow.url}: ${e.message}`);
      }
      log.warnings.push(`MANUAL APPLY NEEDED: ${jobUrl} — only external Apply button found (no Easy Apply)`);
      return 'external';
    }

    // --- Click the Easy Apply button using Playwright locator (fires real mouse events for React) ---
    console.log('[AutoApply] Clicking Easy Apply via Playwright locator...');
    const easyApplyLocator = page.locator('button, a[role="button"]').filter({ hasText: /easy apply/i }).first();
    if (await easyApplyLocator.count() === 0) {
      log.warnings.push(`Could not click Easy Apply on ${jobUrl}`);
      return false;
    }
    await easyApplyLocator.scrollIntoViewIfNeeded();
    await easyApplyLocator.click({ force: true });

    console.log(`[AutoApply] Clicked Easy Apply, waiting for response...`);
    await sleep(4000);

    // --- Broad success detection ---
    const successPatterns = [
      /successfully applied/i,
      /application submitted/i,
      /thank you for applying/i,
      /you.?ve applied/i,
      /applied successfully/i,
      /your application has been/i,
      /application received/i
    ];
    for (const pattern of successPatterns) {
      try {
        const match = await page.getByText(pattern).first();
        if (await match.isVisible({ timeout: 3000 }).catch(() => false)) {
          console.log(`[AutoApply] Success confirmed via text pattern: ${pattern}`);
          log.actions.push(`Successfully auto-applied to ${jobUrl}`);
    // Record applied job
    const fs = require('fs');
    const path = require('path');
    const appliedPath = path.join(__dirname, '../../reports/applied-jobs.csv');
    const line = `"${new Date().toISOString()}","${jobRow.title}","${jobRow.company}","${jobRow.url}"\n`;
    try {
      if (!fs.existsSync(appliedPath)) {
        fs.writeFileSync(appliedPath, 'appliedAt,title,company,url\n');
      }
      fs.appendFileSync(appliedPath, line);
      log.actions.push(`Recorded applied job ${jobRow.url}`);
    } catch (e) {
      log.warnings.push(`Failed to record applied job ${jobRow.url}: ${e.message}`);
    }
          return true;
        }
      } catch (err) { console.error('Caught error:', err.message); }
    }

    // --- Check if the button text changed to "Applied" after clicking ---
    const nowApplied = await page.evaluate(() => {
      const allBtns = Array.from(document.querySelectorAll('button, a[role="button"], div[class*="apply"]'));
      return allBtns.some(el => /^applied$/i.test((el.textContent || '').trim()));
    });
    if (nowApplied) {
      console.log(`[AutoApply] Button changed to "Applied" — success confirmed.`);
      log.actions.push(`Successfully auto-applied to ${jobUrl}`);
      return true;
    }

    // --- Check for a multi-step questionnaire ---
    const qaResult = await handleQuestionnaire(page, config, log, jobRow);
    if (qaResult === true) return true;
    if (qaResult === 'timeout') return 'timeout';

    log.warnings.push(`Applied to ${jobUrl} but could not confirm success — marking for manual review`);
    return false;
  } catch (error) {
    log.warnings.push(`Error during autoApply for ${jobUrl}: ${error.message}`);
    console.error(`[AutoApply] Error:`, error.message);
    return false;
  } finally {
    await page.close();
  }
}
