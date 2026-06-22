import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { tailorResume } from './resume-tailor.js';
import { prisma } from './utils/db.js';
import { downloadResumeFromSupabase } from './utils/storage.js';
import { decrypt } from './utils/crypto.js';
import { optimizeResumeForJob } from './resume-optimizer.js';
import { answerScreeningQuestion } from './services/gemini.js';
import { sendDiscordQuestion } from './services/discord.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import { chromium } from 'playwright-extra';
import stealthPlugin from 'puppeteer-extra-plugin-stealth';
import { isLoggedIn, waitForManualLogin, attemptCredentialLogin, lightProfileRefresh } from './services/auth.js';
import { scrapeJobs } from './services/scraper.js';
import { autoApply } from './services/auto-apply.js';

chromium.use(stealthPlugin());
const rootDir = path.resolve(__dirname, '..');

// Database initialized via src/utils/db.js
const profileDir = path.join(rootDir, 'browser-profile');
const reportsDir = path.join(rootDir, 'reports');
const jobResumeDir = path.join(rootDir, 'job-resumes');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function loadLocalEnv() {
  const envPath = path.join(rootDir, '.env');
  const raw = await fs.readFile(envPath, 'utf8').catch(() => '');

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const index = trimmed.indexOf('=');
    if (index === -1) continue;

    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^["']|["']$/g, '');

    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function calculateExperience(startDateStr) {
  if (!startDateStr) return null;
  const start = new Date(startDateStr);
  const now = new Date();
  if (isNaN(start.getTime())) return null;

  let years = now.getFullYear() - start.getFullYear();
  let months = now.getMonth() - start.getMonth();
  if (months < 0) {
    years--;
    months += 12;
  }
  return { years, months, text: `${years} Years ${months} Months` };
}

async function readConfig() {
  const c = await prisma.configuration.findUnique({ where: { id: 1 } });
  if (!c) {
    console.error("Configuration not found in database.");
    process.exit(1);
  }
  const exp = calculateExperience(c.careerStartDate);
  return {
    resume: { 
      path: c.resumePath, 
      uploadEveryRun: c.uploadEveryRun,
      resumeStoragePath: c.resumeStoragePath,
      resumeText: c.resumeText
    },
    profile: {
      refreshProfile: c.refreshProfile,
      headline: c.headline,
      profileSummary: c.profileSummary,
      keySkills: JSON.parse(c.keySkills || '[]'),
      careerStartDate: c.careerStartDate,
      calculatedExperience: exp,
      customFields: JSON.parse(c.customFields || '{}')
    },
    jobs: {
      searches: JSON.parse(c.searches || '[]'),
      maxResultsPerSearch: c.maxResultsPerSearch,
      includeKeywords: JSON.parse(c.includeKeywords || '[]'),
      excludeKeywords: JSON.parse(c.excludeKeywords || '[]'),
      minRelevanceScore: c.minRelevanceScore
    },
    applications: {
      defaultStatus: c.defaultStatus,
      createResumeFolderPerJob: c.createResumeFolder,
      directApply: c.directApply,
      qaMemory: JSON.parse(c.qaMemory || '{}')
    },
    browser: {
      headless: c.headless,
      slowMoMs: c.slowMoMs,
      manualLoginTimeoutMs: c.manualLoginTimeoutMs
    },
    discord: {
      webhookUrl: c.discordWebhookUrl,
      botToken: c.discordBotToken,
      qaChannelId: c.discordQaChannelId
    },
    credentials: {
      email: c.naukriEmail,
      encryptedPassword: c.naukriPassword
    }
  };
}

async function ensureDirs() {
  await fs.mkdir(reportsDir, { recursive: true });
  await fs.mkdir(profileDir, { recursive: true });
  await fs.mkdir(jobResumeDir, { recursive: true });
}







function folderSafe(value) {
  return String(value || '')
    .replace(/[<>:"/\\|?*]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

function makeJobKey(job) {
  return job.url || `${job.title}|${job.company}|${job.location}`.toLowerCase();
}

function jobSerial(number) {
  return `JOB-${String(number).padStart(4, '0')}`;
}


async function ensureJobFolder(row) {
  const folderName = `${row.serialNumber} - ${folderSafe(row.company)} - ${folderSafe(row.title)}`;
  const folderPath = path.join(jobResumeDir, folderName);
  await fs.mkdir(folderPath, { recursive: true });

  const readmePath = path.join(folderPath, 'README.md');
  const readmeExists = await fs.access(readmePath).then(() => true).catch(() => false);

  if (!readmeExists) {
    await fs.writeFile(readmePath, [
      `# ${row.serialNumber} - ${row.title}`,
      '',
      `Company: ${row.company}`,
      `Location: ${row.location}`,
      `Status: ${row.status}`,
      `Job URL: ${row.url}`,
      '',
      '## Resume Files',
      '',
      '- Drop the tailored resume for this job in this folder.',
      '- If I tailor the resume later, I will save it here with the job serial number.',
      '',
      '## Notes',
      '',
      row.description || 'Add job description notes here.'
    ].join('\n'), 'utf8');
  }

  return folderPath;
}

async function mergeIntoApplicationTracker(jobs, config, log) {
  const existingRows = await prisma.job.findMany();
  const byKey = new Map(existingRows.map((row) => [row.jobKey, row]));
  const maxNumber = existingRows.reduce((max, row) => {
    const match = String(row.serialNumber || '').match(/(\d+)/);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);

  let nextNumber = maxNumber + 1;
  const rows = [...existingRows];

  for (const job of jobs) {
    const jobKey = makeJobKey(job);
    const existing = byKey.get(jobKey);

    if (existing) {
      const updated = await prisma.job.update({
        where: { id: existing.id },
        data: {
          lastSeenAt: new Date().toISOString(),
          relevanceScore: job.relevanceScore,
          searchKeywords: job.searchKeywords || existing.searchKeywords
        }
      });
      Object.assign(existing, updated);
      continue;
    }

    const row = {
      serialNumber: jobSerial(nextNumber++),
      status: config.applications?.defaultStatus || 'Not Applied',
      appliedBy: '',
      appliedAt: '',
      resumeStatus: 'Needs Resume',
      resumeFile: '',
      matchDecision: job.relevanceScore >= 4 ? 'Strong Match' : 'Review',
      relevanceScore: job.relevanceScore || 0,
      title: job.title || '',
      company: job.company || '',
      location: job.location || '',
      experience: job.experience || '',
      salary: job.salary || '',
      url: job.url || '',
      searchKeywords: job.searchKeywords || '',
      capturedAt: job.capturedAt || new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
      jobKey,
      description: job.description || '',
      posted: job.postedText || '',
      notes: ''
    };

    if (config.applications?.createResumeFolderPerJob !== false) {
      row.resumeFolder = await ensureJobFolder(row);
      
      if (row.matchDecision === 'Strong Match') {
        const tailoredPath = path.join(row.resumeFolder, `Tailored_Resume_${row.serialNumber}.pdf`);
        const generated = await tailorResume(job, config.profile, tailoredPath);
        if (generated) {
          row.resumeStatus = 'Tailored AI Resume Ready';
          row.resumeFile = tailoredPath;
          log.actions.push(`Generated AI resume for ${row.serialNumber}`);
        }
      }
    }

    const created = await prisma.job.create({ data: row });
    byKey.set(jobKey, created);
    rows.push(created);
  }

  rows.sort((a, b) => String(a.serialNumber).localeCompare(String(b.serialNumber)));
  log.actions.push(`Application tracker updated with ${rows.length} total jobs.`);

  return rows;
}







async function uploadResume(page, resumePath, log) {
  const resolvedResumePath = path.resolve(resumePath);

  try {
    await fs.access(resolvedResumePath);
  } catch {
    log.warnings.push(`Resume file not found: ${resolvedResumePath}`);
    return false;
  }

  console.log(`Starting resume upload. Current URL: ${page.url()}`);
  try {
    console.log('Navigating to profile page...');
    await page.goto('https://www.naukri.com/mnjuser/profile', { waitUntil: 'domcontentloaded', timeout: 30000 });
  } catch (err) {
    console.log(`Profile page navigation warning: ${err.message}`);
    log.warnings.push(`Profile page navigation warning: ${err.message}`);
  }
  
  await page.waitForTimeout(3000); // Wait for React hydration
  console.log(`After navigation & wait. URL: ${page.url()}, Title: ${await page.title()}`);

  try {
    // Hidden file inputs might not be visible, so wait for attached state (up to 30s for slow connections)
    console.log('Waiting for input[type="file"]#attachCV...');
    await page.waitForSelector('input[type="file"]#attachCV', { state: 'attached', timeout: 30000 });
    console.log('Found #attachCV element. Setting file...');
    await page.setInputFiles('input[type="file"]#attachCV', resolvedResumePath);
    
    try {
      // Naukri's toast message text changes frequently. Try to catch it, but don't fail if we miss it.
      const successMsg = page.getByText(/uploaded successfully|updated successfully|success|has been successfully|updated/i).first();
      await successMsg.waitFor({ state: 'visible', timeout: 5000 });
    } catch {
      console.log('Success toast not detected or disappeared too quickly. Assuming success since file was set.');
    }
    
    // Wait for the upload to process on Naukri's backend
    await page.waitForTimeout(3000);

    log.actions.push(`Resume uploaded: ${resolvedResumePath}`);
    console.log('Resume upload completed successfully!');
    return true;
  } catch (err) {
    console.log(`Resume upload failed at URL: ${page.url()}. Error: ${err.message}`);
    log.warnings.push(`Resume upload failed: ${err.message}`);
    return false;
  }
}






function formatDate(isoString) {
  if (!isoString) return '';
  const d = new Date(isoString);
  if (isNaN(d)) return isoString;
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${dd}-${mm}-${yyyy} ${hh}:${min}`;
}

function toCsv(rows) {
  const headers = ['capturedAt', 'relevanceScore', 'title', 'company', 'location', 'experience', 'salary', 'searchKeywords', 'url'];
  const escape = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;

  // Sort newest first
  const sorted = [...rows].sort((a, b) => new Date(b.capturedAt) - new Date(a.capturedAt));

  return [
    headers.join(','),
    ...sorted.map((row) => headers.map((header) => {
      const val = header === 'capturedAt' ? formatDate(row[header]) : row[header];
      return escape(val);
    }).join(','))
  ].join('\n');
}

function toTrackerCsv(rows) {
  const headers = [
    'serialNumber',
    'capturedAt',
    'lastSeenAt',
    'status',
    'appliedBy',
    'appliedAt',
    'matchDecision',
    'relevanceScore',
    'title',
    'company',
    'location',
    'experience',
    'salary',
    'resumeStatus',
    'resumeFile',
    'resumeFolder',
    'searchKeywords',
    'url',
    'notes'
  ];
  const dateFields = ['capturedAt', 'lastSeenAt', 'appliedAt'];
  const escape = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;

  // Sort newest captured first
  const sorted = [...rows].sort((a, b) => new Date(b.capturedAt) - new Date(a.capturedAt));

  return [
    headers.join(','),
    ...sorted.map((row) => headers.map((header) => {
      const val = dateFields.includes(header) ? formatDate(row[header]) : row[header];
      return escape(val);
    }).join(','))
  ].join('\n');
}





// Shared Discord fallback helper used by handleQuestionnaire


async function notifyWebhook(payload) {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) return;
  try {
    const body = typeof payload === 'string' ? { content: payload } : payload;
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
  } catch (err) {
    console.error('Webhook notification failed:', err.message);
  }
}

async function notifyDiscordSummary(jobs, appliedCount, strongMatches, actions, warnings, trackerTotal) {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) return;

  // Build embed fields for top 5 strong matches
  const topMatches = strongMatches.slice(0, 5);
  const matchFields = topMatches.map(j => ({
    name: `${j.title} @ ${j.company}`,
    value: [
      `📍 ${j.location || 'N/A'}`,
      `⭐ Score: **${j.relevanceScore}%**`,
      j.url ? `[View Job](${j.url})` : ''
    ].filter(Boolean).join('  •  '),
    inline: false
  }));

  let actionSummary = '';
  for (const act of actions || []) {
    const nextLine = `• ${act}\n`;
    if ((actionSummary + nextLine).length > 950) {
      actionSummary += '• ... and more actions\n';
      break;
    }
    actionSummary += nextLine;
  }
  if (!actionSummary) actionSummary = 'No actions recorded';

  const color = strongMatches.length > 0 ? 0x22c55e : 0x6366f1;

  const payload = {
    embeds: [{
      title: '🤖 Hunter Bot Run Complete',
      color,
      fields: [
        { name: '🔍 New Jobs Found', value: String(jobs.length), inline: true },
        { name: '✅ Applied', value: String(appliedCount), inline: true },
        { name: '⭐ Strong Matches', value: String(strongMatches.length), inline: true },
        { name: '📊 Total Tracked', value: String(trackerTotal), inline: true },
        { name: '⚠️ Warnings', value: String(warnings.length), inline: true },
        { name: '\u200b', value: '\u200b', inline: true },
        { name: '📋 Bot Flow & Actions', value: actionSummary, inline: false },
        ...(matchFields.length > 0 ? [{ name: '🏆 Top Strong Matches', value: '\u200b', inline: false }, ...matchFields] : [])
      ],
      timestamp: new Date().toISOString(),
      footer: { text: 'Hunter Automachine' }
    }]
  };

  await notifyWebhook(payload);
}

async function writeReports(jobs, log) {
  const latestJson = path.join(reportsDir, 'jobs-latest.json');
  const latestCsv = path.join(reportsDir, 'jobs-latest.csv');

  await fs.writeFile(latestJson, JSON.stringify(jobs, null, 2), 'utf8');
  await fs.writeFile(latestCsv, toCsv(jobs), 'utf8');
  
  await prisma.runLog.create({
    data: {
      startedAt: log.startedAt,
      finishedAt: log.finishedAt,
      jobCount: log.jobCount || 0,
      trackerCount: log.trackerCount || 0,
      actions: JSON.stringify(log.actions || []),
      warnings: JSON.stringify(log.warnings || [])
    }
  });
}

async function updateBotStatus(running, logMessage = '') {
  try {
    const statusFilePath = path.join(rootDir, '.bot-status.json');
    let current = {};
    try {
      const content = await fs.readFile(statusFilePath, 'utf8');
      current = JSON.parse(content);
    } catch (err) { console.error('Caught error:', err.message); }

    const status = {
      running,
      lastRun: new Date().toISOString(),
      pid: running ? process.pid : null,
      log: logMessage || current.log || ''
    };
    await fs.writeFile(statusFilePath, JSON.stringify(status, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to update bot status file:', err.message);
  }
}

async function main() {
  await ensureDirs();
  await loadLocalEnv();

  const config = await readConfig();
  if (process.argv.includes('--validate')) {
    const resumePath = path.resolve(config.resume?.path || '');
    const resumeExists = await fs.access(resumePath).then(() => true).catch(() => false);
    console.log('Config loaded successfully.');
    console.log(`Resume path: ${resumePath}`);
    console.log(`Resume exists: ${resumeExists ? 'yes' : 'no'}`);
    console.log(`Job searches: ${config.jobs?.searches?.length || 0}`);
    return;
  }

  await updateBotStatus(true, 'Bot started...');

  const log = {
    startedAt: new Date().toISOString(),
    actions: [],
    warnings: []
  };

  let headless = Boolean(config.browser?.headless);
  if (process.argv.includes('--headless')) {
    headless = true;
  } else if (process.argv.includes('--headful')) {
    headless = false;
  }

  let defaultUserAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.7778.96 Safari/537.36';
  if (headless) {
    try {
      const tempBrowser = await chromium.launch({ headless: true });
      const tempPage = await tempBrowser.newPage();
      const ua = await tempPage.evaluate(() => navigator.userAgent);
      await tempBrowser.close();
      defaultUserAgent = ua.replace('HeadlessChrome/', 'Chrome/');
    } catch (e) {
      console.error('Failed to get dynamic user-agent:', e.message);
    }
  }

  const launchOptions = {
    headless: false, // Force headful engine to bypass Akamai
    slowMo: config.browser?.slowMoMs ?? 0,
    viewport: { width: 1366, height: 900 },
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--disable-setuid-sandbox'
    ]
  };

  // Override user-agent in headless mode to strip "HeadlessChrome" and mimic standard desktop browser
  if (headless) {
    launchOptions.args.push('--headless=new');
    launchOptions.userAgent = defaultUserAgent;
  }

  const context = await chromium.launchPersistentContext(profileDir, launchOptions);

  const page = context.pages()[0] || await context.newPage();

  try {
    console.log('Checking saved Hunter session.');
    let loggedIn = await isLoggedIn(page);
    if (!loggedIn) {
      loggedIn = await attemptCredentialLogin(page, log, config);
    }

    if (process.argv.includes('--login-test')) {
      log.finishedAt = new Date().toISOString();
      log.loginTest = loggedIn ? 'success' : 'failed';
      await fs.writeFile(path.join(reportsDir, 'login-test.json'), JSON.stringify(log, null, 2), 'utf8');
      console.log(`Login test: ${loggedIn ? 'success' : 'failed'}`);
      return;
    }

    if (!loggedIn) {
      const ok = await waitForManualLogin(page, config.browser?.manualLoginTimeoutMs ?? 300000);
      if (!ok) throw new Error('Hunter login was not completed before timeout.');
    }

    if (config.resume?.uploadEveryRun) {
      let localResumePath = config.resume.path;
      if (config.resume.resumeStoragePath) {
        console.log('Downloading master resume from Supabase Storage...');
        const localDownloadDir = path.join(rootDir, 'resume');
        const filename = path.basename(config.resume.resumeStoragePath) || 'master_resume.pdf';
        const downloadedPath = path.join(localDownloadDir, filename);
        const ok = await downloadResumeFromSupabase(config.resume.resumeStoragePath, downloadedPath);
        if (ok) {
          localResumePath = downloadedPath;
        }
      }
      console.log(`Uploading configured resume from: ${localResumePath}`);
      await uploadResume(page, localResumePath, log);
    }

    // Auto-cleanup: delete jobs older than 3 weeks (21 days) to keep the database light
    const cutoff = new Date(Date.now() - 21 * 24 * 60 * 60 * 1000).toISOString();
    const deleted = await prisma.job.deleteMany({
      where: {
        capturedAt: { lt: cutoff }
      }
    });
    if (deleted.count > 0) {
      console.log(`🗑️  Auto-cleaned ${deleted.count} old jobs (older than 3 weeks).`);
      log.actions.push(`Auto-deleted ${deleted.count} jobs older than 3 weeks.`);
    }

    console.log('Searching relevant jobs.');
    const jobs = await scrapeJobs(page, config, log);
    console.log('Updating application tracker.');
    const trackerRows = await mergeIntoApplicationTracker(jobs, config, log);


    let appliedCount = 0;
    if (config.applications?.directApply) {
      console.log('Starting Auto-Apply process for all new jobs...');
      const minScore = config.jobs?.minRelevanceScore ?? 1;
      const eligibleJobs = trackerRows.filter(row =>
        row.status === 'Not Applied' && row.relevanceScore >= minScore
      );
      console.log(`Found ${eligibleJobs.length} eligible jobs to apply (score >= ${minScore})...`);
      for (const row of eligibleJobs) {
        console.log(`Auto-applying to ${row.serialNumber} (${row.company} - score: ${row.relevanceScore})...`);
        const result = await autoApply(context, row, log, config);
        if (result === true) {
          row.status = 'Applied';
          row.appliedBy = 'Automation';
          row.appliedAt = new Date().toISOString();
          appliedCount++;
        } else if (result === 'already_applied') {
          row.status = 'Applied';
          row.appliedBy = 'Manual';
          row.appliedAt = new Date().toISOString();
        } else if (result === 'external') {
          row.status = 'Manual Apply Needed';
          // Run AI Resume Optimizer
          await optimizeResumeForJob(row);
        } else if (result === 'timeout') {
          row.status = 'Manual Review (Q&A Timeout)';
        } else if (result === 'expired') {
          row.status = 'Expired';
        }

        const success = result === true;
        if (success || result === 'already_applied' || result === 'external' || result === 'timeout' || result === 'expired') {
          try {
            await prisma.job.update({
              where: { id: row.id },
              data: {
                status: row.status,
                appliedBy: row.appliedBy || '',
                appliedAt: row.appliedAt || ''
              }
            });
          } catch (updateErr) {
            // Record may have been deleted mid-run (e.g. manual cleanup) — skip silently
            log.warnings.push(`Could not update job ${row.serialNumber} (${updateErr.code || updateErr.message})`);
          }
        }
      }
    }

    const strongMatches = trackerRows.filter(r => r.matchDecision === 'Strong Match' && r.capturedAt >= log.startedAt);

    log.finishedAt = new Date().toISOString();
    log.jobCount = jobs.length;
    log.trackerCount = trackerRows.length;
    await writeReports(jobs, log);

    // Send rich Discord embed summary
    await notifyDiscordSummary(jobs, appliedCount, strongMatches, log.actions, log.warnings, trackerRows.length);

    console.log(`Done. Relevant jobs found: ${jobs.length}`);
    console.log(`Report: ${path.join(reportsDir, 'jobs-latest.csv')}`);
    await updateBotStatus(false, `Done. Relevant jobs found: ${jobs.length}\nReport: ${path.join(reportsDir, 'jobs-latest.csv')}`);
  } finally {
    await context.close();
  }
}

main().catch(async (error) => {
  await ensureDirs();
  const failedLog = {
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    jobCount: 0,
    trackerCount: 0,
    actions: JSON.stringify([{ error: error.message, stack: error.stack }]),
    warnings: '[]'
  };

  try {
    await prisma.runLog.create({ data: failedLog });
  } catch (dbError) {
    console.error('Failed to write error to DB:', dbError);
  }

  try {
    const statusFilePath = path.join(rootDir, '.bot-status.json');
    const status = {
      running: false,
      lastRun: new Date().toISOString(),
      pid: null,
      log: `Error: ${error.message}`
    };
    await fs.writeFile(statusFilePath, JSON.stringify(status, null, 2), 'utf8');
  } catch (err) { console.error('Caught error:', err.message); }
  
  console.error(error);
  process.exitCode = 1;
});
