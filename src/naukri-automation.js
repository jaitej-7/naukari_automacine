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

function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/c\+\+/g, 'cpp')
    .replace(/c#/g, 'csharp')
    .replace(/\.net/g, 'dotnet')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function buildSearchUrl(search, page = 1) {
  const keywordSlug = slugify(search.keywords);
  const locationSlug = slugify(search.location || 'india');
  const pathSuffix = page > 1 ? `-${page}` : '';
  const url = new URL(`https://www.naukri.com/${keywordSlug}-jobs-in-${locationSlug}${pathSuffix}`);

  if (search.experienceYears !== undefined && search.experienceYears !== '') {
    url.searchParams.set('experience', String(search.experienceYears));
  }

  if (search.maxAgeDays) {
    url.searchParams.set('fage', String(search.maxAgeDays));
  }

  // Salary filter — Naukri accepts LPA values like 4, 5, 6, 7.5, 10 etc.
  if (search.minSalaryLpa) {
    url.searchParams.set('salary', String(search.minSalaryLpa));
  }

  // Always sort by date (Recent) to ensure we get the latest
  url.searchParams.set('sort', 'r');

  return url.toString();
}

function relevanceScore(job, includeKeywords = [], excludeKeywords = []) {
  // Normalize punctuation to spaces so things like "ui/ux" become "ui ux"
  const haystack = `${job.title} ${job.company} ${job.location} ${job.description}`.toLowerCase().replace(/[^a-z0-9]/g, ' ');
  
  const excluded = excludeKeywords.some((keyword) => {
    const normalizedKeyword = String(keyword).toLowerCase().replace(/[^a-z0-9]/g, ' ').trim();
    if (!normalizedKeyword) return false;
    const regex = new RegExp(`\\b${normalizedKeyword}\\b`);
    return regex.test(haystack);
  });

  if (excluded) return -10;

  return includeKeywords.reduce((score, keyword) => {
    const normalizedKeyword = String(keyword).toLowerCase().replace(/[^a-z0-9]/g, ' ').trim();
    if (!normalizedKeyword) return score;
    const regex = new RegExp(`\\b${normalizedKeyword}\\b`);
    return regex.test(haystack) ? score + 1 : score;
  }, 0);
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

async function isLoggedIn(page) {
  if (!page.url().toLowerCase().includes('/mnjuser/profile')) {
    await page.goto('https://www.naukri.com/mnjuser/profile', { waitUntil: 'domcontentloaded' }).catch(() => {});
  }

  const title = await page.title().catch(() => '');
  if (title.toLowerCase().includes('access denied')) {
    console.error('CRITICAL: Access Denied by Naukri/Cloudflare bot protection.');
    throw new Error('Naukri bot protection returned "Access Denied". Please run the bot in headful mode (set "headless": false in config.json) once to solve the Cloudflare verification/CAPTCHA.');
  }

  const url = page.url().toLowerCase();
  if (url.includes('login') || url.includes('nlogin')) return false;
  if (url.includes('/mnjuser/profile')) return true;

  const loginText = await page.getByText(/login|register/i).count().catch(() => 0);
  const profileSignals = await page.locator('text=/profile|resume|visibility/i').count().catch(() => 0);

  return profileSignals > 0 && loginText < 4;
}

async function waitForManualLogin(page, timeoutMs) {
  const started = Date.now();

  console.log('Login required. Please complete Naukri login in the opened browser window.');
  await page.goto('https://www.naukri.com/nlogin/login', { waitUntil: 'domcontentloaded' }).catch(() => {});

  while (Date.now() - started < timeoutMs) {
    const url = page.url().toLowerCase();
    if (!url.includes('login') && !url.includes('nlogin')) {
      console.log('Login detected. Continuing automation.');
      return true;
    }
    await sleep(5000);
  }

  return false;
}

async function attemptCredentialLogin(page, log, config) {
  let email = config.credentials?.email || process.env.NAUKRI_EMAIL;
  let password = process.env.NAUKRI_PASSWORD;

  if (config.credentials?.encryptedPassword && process.env.RSA_PRIVATE_KEY) {
    try {
      const privateKey = Buffer.from(process.env.RSA_PRIVATE_KEY, 'base64').toString('utf8');
      password = decrypt(config.credentials.encryptedPassword, privateKey);
    } catch (err) {
      log.warnings.push(`Failed to decrypt database credentials: ${err.message}`);
    }
  }

  if (!email || !password) return false;

  console.log('Trying Naukri login with configured credentials.');
  await page.goto('https://www.naukri.com/nlogin/login', { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});

  const emailInput = page.locator('input[placeholder*="Email" i], input[placeholder*="Username" i], input[placeholder*="Mobile" i], input[type="email"], input[type="text"]').first();
  const passwordInput = page.locator('input[type="password"]').first();

  if ((await emailInput.count().catch(() => 0)) === 0 || (await passwordInput.count().catch(() => 0)) === 0) {
    log.warnings.push('Credential login fields were not found. Manual login may be required.');
    return false;
  }

  await emailInput.fill(email);
  await passwordInput.fill(password);

  const loginButton = page.getByRole('button', { name: /login/i }).first();
  if ((await loginButton.count().catch(() => 0)) > 0) {
    await loginButton.click();
  } else {
    await passwordInput.press('Enter');
  }

  await page.waitForTimeout(6000);
  const loggedIn = await isLoggedIn(page);

  if (loggedIn) {
    log.actions.push('Logged in with local .env credentials.');
  } else {
    log.warnings.push('Credential login did not complete. OTP, CAPTCHA, or manual verification may be required.');
  }

  return loggedIn;
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

async function lightProfileRefresh(page, config, log) {
  if (!config.profile?.refreshProfile) return;

  if (!page.url().toLowerCase().includes('/mnjuser/profile')) {
    await page.goto('https://www.naukri.com/mnjuser/profile', { waitUntil: 'domcontentloaded' }).catch(() => {});
  }

  const editableSections = [
    { name: 'Resume Headline', label: /resume headline|headline/i, value: config.profile.headline },
    { name: 'Profile Summary', label: /profile summary|summary/i, value: config.profile.profileSummary },
    { name: 'Key Skills', label: /key skills|skills/i, value: Array.isArray(config.profile.keySkills) ? config.profile.keySkills.join(', ') : '' }
  ].filter((item) => item.value);

  for (const section of editableSections) {
    const editButtons = page.getByText(section.label);
    const found = await editButtons.count().catch(() => 0);
    if (found === 0) continue;

    log.actions.push(`Profile section visible for refresh: ${section.name}`);
  }

  await page.mouse.wheel(0, 600);
  await page.waitForTimeout(1500);
  log.actions.push('Profile page opened and activity refreshed.');
}

async function scrapeJobs(page, config, log) {
  const allJobs = [];
  const seen = new Set();
  const searches = config.jobs?.searches || [];

  const maxResults = config.jobs?.maxResultsPerSearch || 25;
  const maxPages = Math.max(1, Math.ceil(maxResults / 20));

  for (const search of searches) {
    let searchJobs = [];
    const maxAgeDays = search.maxAgeDays;
    let skippedOldCount = 0;
    let skippedNoDateCount = 0;

    for (let currentPage = 1; currentPage <= maxPages; currentPage++) {
      if (searchJobs.length >= maxResults) break;

      const searchUrl = buildSearchUrl(search, currentPage);
      const pageJobs = await page.goto(searchUrl, { waitUntil: 'domcontentloaded' }).then(async () => {
        try {
          await page.waitForSelector('article.jobTuple, .srp-jobtuple-wrapper, .jobTuple, .cust-job-tuple', { state: 'attached', timeout: 5000 });
        } catch {}

        return page.evaluate((maxResultsToGet) => {
          const selectors = [
            '.srp-jobtuple-wrapper',
            'article.jobTuple',
            '.jobTuple',
            '.cust-job-tuple'
          ];
          const cards = selectors.flatMap((selector) => Array.from(document.querySelectorAll(selector)));
          const uniqueCards = Array.from(new Set(cards)).slice(0, maxResultsToGet);

          return uniqueCards.map((card) => {
            const link = card.querySelector('a[href*="/job-listings"], a.title, a');
            const title = card.querySelector('.title, .jobTitle, a[href*="/job-listings"]')?.textContent?.trim() || link?.textContent?.trim() || '';
            const company = card.querySelector('.comp-name, .companyName, .subTitle')?.textContent?.trim() || '';
            const location = card.querySelector('.locWdth, .location, .loc')?.textContent?.trim() || '';
            const experience = card.querySelector('.expwdth, .experience, .exp')?.textContent?.trim() || '';
            const salary = card.querySelector('.sal-wrap, .salary, .sal')?.textContent?.trim() || '';
            const description = card.querySelector('.job-desc, .job-description, .jobDesc')?.textContent?.trim() || '';
            const postedText = card.querySelector('.job-post-day, .postDate, [class*="post-day"], [class*="postDate"]')?.textContent?.trim() || '';

            return {
              title,
              company,
              location,
              experience,
              salary,
              description,
              postedText,
              url: link?.href || ''
            };
          }).filter((job) => job.title || job.company || job.url);
        }, maxResults - searchJobs.length);
      }).catch((err) => {
        console.error(`Error loading page ${currentPage}:`, err.message);
        return [];
      });

      if (!pageJobs || pageJobs.length === 0) {
        break; // No more results or navigation failed
      }

      for (const job of pageJobs) {
        const key = job.url || `${job.title}-${job.company}-${job.location}`;
        if (seen.has(key)) continue;
        seen.add(key);

        // Strict freshness filter
        if (maxAgeDays !== undefined && maxAgeDays !== null) {
          if (job.postedText) {
            const text = job.postedText.toLowerCase();
            const isFresh =
              text.includes('just now') ||
              text.includes('few hours') ||
              text.includes('today') ||
              text.match(/^(\d+)\s*hour/) ||
              (text.match(/(\d+)\s*day/) && parseInt(text.match(/(\d+)\s*day/)[1]) <= maxAgeDays);

            if (!isFresh) {
              skippedOldCount++;
              continue;
            }
          } else if (maxAgeDays <= 1) {
            skippedNoDateCount++;
            continue;
          }
        }

        const score = relevanceScore(job, config.jobs?.includeKeywords, config.jobs?.excludeKeywords);
        if (score >= (config.jobs?.minRelevanceScore ?? 1)) {
          const jobObj = {
            ...job,
            relevanceScore: score,
            searchKeywords: search.keywords,
            searchLocation: search.location,
            capturedAt: new Date().toISOString()
          };
          allJobs.push(jobObj);
          searchJobs.push(jobObj);
        }
      }
    }

    log.actions.push(`Scraped ${searchJobs.length} jobs for "${search.keywords}" in "${search.location}".`);
    if (skippedOldCount > 0) {
      log.actions.push(`Skipped ${skippedOldCount} older listings (posted ${maxAgeDays}+ days ago).`);
    }
    if (skippedNoDateCount > 0) {
      log.actions.push(`Skipped ${skippedNoDateCount} listings with no readable date.`);
    }
  }

  return allJobs.sort((a, b) => b.relevanceScore - a.relevanceScore);
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

async function autoApply(context, jobRow, log, config) {
  const jobUrl = jobRow.url;
  const page = await context.newPage();
  try {
    console.log(`[AutoApply] Navigating to: ${jobUrl}`);
    await page.goto(jobUrl, { waitUntil: 'domcontentloaded' });
    // Give React time to hydrate the page fully
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    await sleep(3000);

    // --- Check if already applied ---
    // Naukri renders "Applied" as text inside a button/div with varying class names
    const alreadyApplied = await page.evaluate(() => {
      const allButtons = Array.from(document.querySelectorAll('button, a[role="button"], div[class*="apply"]'));
      return allButtons.some(el => /^applied$/i.test((el.textContent || '').trim()));
    });
    if (alreadyApplied) {
      console.log(`[AutoApply] Already applied to ${jobUrl} — skipping`);
      log.actions.push(`Already applied to ${jobUrl} — skipping`);
      return 'already_applied';
    }

    // --- Wait for apply button to appear ---
    try {
      await page.waitForFunction(() => {
        const allBtns = Array.from(document.querySelectorAll('button, a[role="button"]'));
        return allBtns.some(el => /easy apply|apply now|apply$/i.test((el.textContent || '').trim()));
      }, { timeout: 12000 });
    } catch {
      console.log(`[AutoApply] Timed out waiting for apply button on ${jobUrl}`);
    }

    // --- Detect available button types ---
    const { hasEasyApply, hasRegularApply } = await page.evaluate(() => {
      const allBtns = Array.from(document.querySelectorAll('button, a[role="button"]'));
      const hasEasyApply = allBtns.some(el => /easy apply/i.test((el.textContent || '').trim()));
      const hasRegularApply = allBtns.some(el => /^apply now$|^apply$/i.test((el.textContent || '').trim()));
      return { hasEasyApply, hasRegularApply };
    });

    console.log(`[AutoApply] Buttons detected — Easy Apply: ${hasEasyApply}, Regular Apply: ${hasRegularApply}`);

    if (!hasEasyApply && !hasRegularApply) {
      log.warnings.push(`No apply button found on ${jobUrl}`);
      return false;
    }

    // If only regular Apply (external redirect), flag for manual action
    if (!hasEasyApply && hasRegularApply) {
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
          return true;
        }
      } catch {}
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

async function handleQuestionnaire(page, config, log, jobRow) {
  const jobUrl = jobRow.url;
  await sleep(3000); // Wait for modal to render

  // --- Collect all answerable inputs in the modal/page ---
  // Includes text, number, textarea, select, radio groups, and checkboxes
  const textInputs = await page.locator(
    'input[type="text"]:visible, input[type="number"]:visible, textarea:visible, select:visible'
  ).all();

  // Find radio button groups (each group = one question)
  const radioGroups = await page.evaluate(() => {
    const inputs = Array.from(document.querySelectorAll('input[type="radio"]:not([disabled])'));
    const groups = {};
    for (const input of inputs) {
      const name = input.name || input.getAttribute('data-name') || 'unnamed';
      if (!groups[name]) groups[name] = [];
      const label = input.closest('label') || document.querySelector(`label[for="${input.id}"]`);
      const optionText = label ? label.innerText.trim() : input.value;
      groups[name].push({ name, value: input.value, label: optionText });
    }
    return Object.values(groups);
  });

  const hasAnything = textInputs.length > 0 || radioGroups.length > 0;
  if (!hasAnything) {
    log.warnings.push(`No success message and no questionnaire found for ${jobUrl}`);
    return false;
  }

  let allAnswered = true;

  // --- Handle text / select inputs ---
  for (const input of textInputs) {
    const placeholder = await input.getAttribute('placeholder').catch(() => '');
    if (placeholder && placeholder.toLowerCase().includes('search')) continue;
    
    const questionText = await input.evaluate((el) => {
      let parent = el.parentElement;
      while (parent && parent.innerText.trim().length < 5 && parent !== document.body) {
        parent = parent.parentElement;
      }
      return parent ? parent.innerText.trim().replace(/\n/g, ' ') : '';
    });

    if (!questionText.trim()) continue;

    console.log(`[Q&A Engine] Text/Select question: "${questionText}"`);

    let answered = false;
    let answerText = '';

    // Step 1: Cache
    for (const [key, val] of Object.entries(config.applications.qaMemory)) {
      if (questionText.toLowerCase().includes(key.toLowerCase())) {
        answerText = String(val);
        answered = true;
        console.log(`[Q&A Engine] Cache hit: "${answerText}" for key "${key}"`);
        break;
      }
    }

    // Step 2: Gemini
    if (!answered && process.env.GEMINI_API_KEY) {
      const tagName = await input.evaluate(el => el.tagName.toLowerCase());
      let options = [];
      if (tagName === 'select') {
        options = await input.locator('option').allInnerTexts();
        options = options.map(o => o.trim()).filter(o => o && !o.toLowerCase().includes('select'));
      }
      const aiResponse = await answerScreeningQuestion(questionText, options, config.profile);
      if (aiResponse.canAnswer && aiResponse.answer !== undefined) {
        answerText = String(aiResponse.answer);
        answered = true;
        console.log(`[Q&A Engine] Gemini: "${answerText}" (${aiResponse.reasoning})`);
      }
    }

    // Step 3: Discord fallback
    if (!answered) {
      const discordResult = await askViaDiscord(page, input, questionText, [], config, log, jobRow);
      if (discordResult === 'timeout') return 'timeout';
      if (discordResult !== null) { answerText = discordResult; answered = true; }
    }

    if (answered) {
      const tagName = await input.evaluate(el => el.tagName.toLowerCase());
      if (tagName === 'select') {
        const options = await input.locator('option').allInnerTexts();
        const match = options.find(o => o.toLowerCase().includes(answerText.toLowerCase()));
        if (match) await input.selectOption({ label: match });
        else await input.selectOption({ value: answerText });
      } else {
        await input.fill(answerText);
      }
      await sleep(800);
    } else {
      allAnswered = false;
      break;
    }
  }

  // --- Handle radio button groups ---
  for (const group of radioGroups) {
    if (!allAnswered) break;
    const questionText = group[0]?.label || group[0]?.name || 'Unknown question';
    const options = group.map(o => o.label);
    console.log(`[Q&A Engine] Radio question: "${questionText}" Options: [${options.join(', ')}]`);

    let answered = false;
    let answerText = '';

    // Step 1: Cache
    for (const [key, val] of Object.entries(config.applications.qaMemory)) {
      if (questionText.toLowerCase().includes(key.toLowerCase())) {
        answerText = String(val); answered = true;
        console.log(`[Q&A Engine] Cache hit for radio: "${answerText}"`);
        break;
      }
    }

    // Step 2: Gemini
    if (!answered && process.env.GEMINI_API_KEY) {
      const aiResponse = await answerScreeningQuestion(questionText, options, config.profile);
      if (aiResponse.canAnswer && aiResponse.answer !== undefined) {
        answerText = String(aiResponse.answer);
        answered = true;
        console.log(`[Q&A Engine] Gemini radio: "${answerText}"`);
      }
    }

    // Step 3: Discord fallback
    if (!answered) {
      const discordResult = await askViaDiscord(page, null, questionText, options, config, log, jobRow);
      if (discordResult === 'timeout') return 'timeout';
      if (discordResult !== null) { answerText = discordResult; answered = true; }
    }

    if (answered) {
      // Click the matching radio button
      const matchingOption = group.find(o =>
        o.label.toLowerCase().includes(answerText.toLowerCase()) ||
        o.value.toLowerCase().includes(answerText.toLowerCase())
      ) || group[0]; // fallback to first option
      
      await page.evaluate((opt) => {
        const radio = document.querySelector(`input[type="radio"][value="${opt.value}"][name="${opt.name}"]`);
        if (radio) radio.click();
      }, matchingOption);
      await sleep(800);
    } else {
      allAnswered = false;
    }
  }

  if (!allAnswered) {
    log.warnings.push(`Aborted application for ${jobUrl}. Questionnaire could not be completed.`);
    return false;
  }

  // All answered! Try to submit.
  const submitBtn = page.locator('button').filter({ hasText: /^Submit$|^Save$|^Apply$|^Save & Apply$/i }).first();
  if (await submitBtn.count() > 0) {
    await submitBtn.click();
    await sleep(4000);
    log.actions.push(`Successfully auto-applied (via Q&A engine) to ${jobUrl}`);
    return true;
  }

  log.warnings.push(`Filled Q&A for ${jobUrl} but couldn't find Submit button.`);
  return false;
}

// Shared Discord fallback helper used by handleQuestionnaire
async function askViaDiscord(page, input, questionText, options, config, log, jobRow) {
  if (!config.discord?.botToken || !config.discord?.qaChannelId) {
    log.warnings.push(`Discord not configured. Cannot fallback for Q: "${questionText.substring(0, 50)}"`);
    return null;
  }

  if (input) {
    const tagName = await input.evaluate(el => el.tagName.toLowerCase());
    if (tagName === 'select' && options.length === 0) {
      options = await input.locator('option').allInnerTexts();
      options = options.map(o => o.trim()).filter(o => o && !o.toLowerCase().includes('select'));
    }
  }

  const qaRow = await prisma.qAInteraction.create({
    data: {
      jobId: jobRow.id,
      jobTitle: jobRow.title,
      company: jobRow.company,
      question: questionText,
      options: JSON.stringify(options),
      status: 'pending'
    }
  });

  const messageId = await sendDiscordQuestion(
    config.discord.botToken,
    config.discord.qaChannelId,
    qaRow.id,
    { title: jobRow.title, company: jobRow.company, url: jobRow.url },
    questionText,
    options
  );

  if (!messageId) {
    log.warnings.push(`Failed to send question to Discord. Aborting.`);
    return null;
  }

  await prisma.job.update({ where: { id: jobRow.id }, data: { status: 'Pending Q&A' } });
  console.log(`[Q&A Engine] Paused. Waiting up to 10 minutes for Discord response...`);

  const pollStart = Date.now();
  while (Date.now() - pollStart < 10 * 60 * 1000) {
    await sleep(3000);
    const interaction = await prisma.qAInteraction.findUnique({ where: { id: qaRow.id } });
    if (interaction?.status === 'answered') {
      const answer = interaction.answer;
      // Cache the answer
      try {
        const currentConfig = await prisma.configuration.findUnique({ where: { id: 1 } });
        const mem = JSON.parse(currentConfig?.qaMemory || '{}');
        const key = questionText.toLowerCase().replace(/[^a-z0-9 ]/g, '').substring(0, 50).trim();
        mem[key] = answer;
        await prisma.configuration.update({ where: { id: 1 }, data: { qaMemory: JSON.stringify(mem) } });
      } catch {}
      console.log(`[Q&A Engine] Discord answer received: "${answer}"`);
      return answer;
    }
    if (interaction?.status === 'timeout') break;
  }

  await prisma.qAInteraction.update({ where: { id: qaRow.id }, data: { status: 'timeout' } });
  log.warnings.push(`Discord Q&A timeout for: "${questionText.substring(0, 50)}"`);
  return 'timeout';
}

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
      title: '🤖 Naukri Bot Run Complete',
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
      footer: { text: 'Naukri Automachine' }
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
    } catch {}

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
    console.log('Checking saved Naukri session.');
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
      if (!ok) throw new Error('Naukri login was not completed before timeout.');
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

    console.log('Refreshing profile activity.');
    await lightProfileRefresh(page, config, log);

    // Auto-cleanup: delete jobs older than 7 days that were never applied to
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const deleted = await prisma.job.deleteMany({
      where: {
        capturedAt: { lt: cutoff },
        status: { notIn: ['Applied', 'Manual Apply Needed'] }
      }
    });
    if (deleted.count > 0) {
      console.log(`🗑️  Auto-cleaned ${deleted.count} old jobs (older than 7 days).`);
      log.actions.push(`Auto-deleted ${deleted.count} unapplied jobs older than 7 days.`);
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
        }

        const success = result === true;
        if (success || result === 'already_applied' || result === 'external' || result === 'timeout') {
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
  } catch {}
  
  console.error(error);
  process.exitCode = 1;
});
