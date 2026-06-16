import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { tailorResume } from './resume-tailor.js';
import Database from 'better-sqlite3';
import prismaClientPkg from '@prisma/client';
const { PrismaClient } = prismaClientPkg;
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import { chromium } from 'playwright-extra';
import stealthPlugin from 'puppeteer-extra-plugin-stealth';

chromium.use(stealthPlugin());
const rootDir = path.resolve(__dirname, '..');

const dbPath = path.join(rootDir, 'database.sqlite');
const adapter = new PrismaBetterSqlite3({ url: `file:${dbPath}` });
const prisma = new PrismaClient({ adapter });
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

async function readConfig() {
  const c = await prisma.configuration.findUnique({ where: { id: 1 } });
  if (!c) {
    console.error("Configuration not found in database.");
    process.exit(1);
  }
  return {
    resume: { path: c.resumePath, uploadEveryRun: c.uploadEveryRun },
    profile: {
      refreshProfile: c.refreshProfile,
      headline: c.headline,
      profileSummary: c.profileSummary,
      keySkills: JSON.parse(c.keySkills || '[]')
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
  const haystack = `${job.title} ${job.company} ${job.location} ${job.description}`.toLowerCase();
  const excluded = excludeKeywords.some((keyword) => haystack.includes(String(keyword).toLowerCase()));

  if (excluded) return -10;

  return includeKeywords.reduce((score, keyword) => {
    return haystack.includes(String(keyword).toLowerCase()) ? score + 1 : score;
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

async function attemptCredentialLogin(page, log) {
  const email = process.env.NAUKRI_EMAIL;
  const password = process.env.NAUKRI_PASSWORD;

  if (!email || !password) return false;

  console.log('Trying Naukri login with local .env email/password.');
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

async function autoApply(context, jobUrl, log, config) {
  const page = await context.newPage();
  try {
    await page.goto(jobUrl, { waitUntil: 'domcontentloaded' });
    await sleep(2000); // Let React fully render

    // Check if already applied
    const alreadyAppliedBtn = page.locator('button:has-text("Applied")').first();
    if (await alreadyAppliedBtn.count() > 0) {
      log.actions.push(`Already applied to ${jobUrl} — skipping`);
      return 'already_applied';
    }

    // Prefer Easy Apply over regular Apply
    const easyApplyBtn = page.locator('button:has-text("Easy Apply")').first();
    const regularApplyBtn = page.locator('button:has-text("Apply"), button:has-text("Apply Now")').first();

    try {
      await page.waitForSelector('button:has-text("Easy Apply"), button:has-text("Apply"), button:has-text("Apply Now")', { state: 'attached', timeout: 10000 });
    } catch {}

    const hasEasyApply = await easyApplyBtn.count() > 0;
    const hasRegularApply = await regularApplyBtn.count() > 0;

    if (!hasEasyApply && !hasRegularApply) {
      log.warnings.push(`No apply button found on ${jobUrl}`);
      return false;
    }

    // If only regular Apply (external), flag for manual action
    if (!hasEasyApply && hasRegularApply) {
      log.warnings.push(`MANUAL APPLY NEEDED: ${jobUrl} — only external Apply button found (no Easy Apply)`);
      return 'external';
    }

    // Click Easy Apply
    await easyApplyBtn.click();
    await sleep(3000);

    // Broader success detection
    const successPatterns = [
      /successfully applied/i,
      /application submitted/i,
      /thank you for applying/i,
      /you.ve applied/i,
      /applied successfully/i
    ];
    for (const pattern of successPatterns) {
      try {
        await page.getByText(pattern).waitFor({ state: 'visible', timeout: 3000 });
        log.actions.push(`Successfully auto-applied to ${jobUrl}`);
        return true;
      } catch {}
    }

    // Check if button changed to "Applied"
    if (await page.locator('button:has-text("Applied")').count() > 0) {
      log.actions.push(`Successfully auto-applied to ${jobUrl}`);
      return true;
    }

    // Try questionnaire
    const qaSuccess = await handleQuestionnaire(page, config, log, jobUrl);
    if (qaSuccess) return true;

    log.warnings.push(`Applied to ${jobUrl} but could not confirm success`);
    return false;
  } catch (error) {
    log.warnings.push(`Error during autoApply for ${jobUrl}: ${error.message}`);
    return false;
  } finally {
    await page.close();
  }
}

async function handleQuestionnaire(page, config, log, jobUrl) {
  if (!config.applications?.qaMemory) return false;
  await sleep(3000); // Wait for modal to render

  // Find visible inputs (excluding buttons/checkboxes for simplicity)
  const inputs = await page.locator('input[type="text"]:visible, input[type="number"]:visible, textarea:visible, select:visible').all();
  if (inputs.length === 0) {
    log.warnings.push(`No success message and no questionnaire found for ${jobUrl}`);
    return false;
  }

  let allAnswered = true;
  const unanswered = [];

  for (const input of inputs) {
    // Ignore the main site search bars
    const placeholder = await input.getAttribute('placeholder').catch(() => '');
    if (placeholder && placeholder.toLowerCase().includes('search')) continue;
    
    const questionText = await input.evaluate((el) => {
      let parent = el.parentElement;
      while (parent && parent.innerText.trim().length < 5 && parent !== document.body) {
        parent = parent.parentElement;
      }
      return parent ? parent.innerText.trim().replace(/\n/g, ' ') : '';
    });

    let answered = false;
    for (const [key, val] of Object.entries(config.applications.qaMemory)) {
      if (questionText.toLowerCase().includes(key.toLowerCase())) {
        const tagName = await input.evaluate(el => el.tagName.toLowerCase());
        if (tagName === 'select') {
          // Attempt to select option by label containing the value
          const options = await input.locator('option').allInnerTexts();
          const match = options.find(o => o.toLowerCase().includes(String(val).toLowerCase()));
          if (match) {
            await input.selectOption({ label: match });
            answered = true;
          }
        } else {
          await input.fill(String(val));
          answered = true;
        }
        break;
      }
    }

    if (!answered) {
      allAnswered = false;
      unanswered.push(questionText.substring(0, 150));
    }
  }

  if (!allAnswered) {
    const unansweredFile = path.join(process.cwd(), 'reports', 'unanswered-questions.json');
    let existing = [];
    try {
      existing = JSON.parse(await fs.readFile(unansweredFile, 'utf8'));
    } catch {}
    existing.push({ url: jobUrl, time: new Date().toISOString(), missing: unanswered });
    await fs.writeFile(unansweredFile, JSON.stringify(existing, null, 2));

    log.warnings.push(`Aborted application for ${jobUrl}. Missing answers for: ${unanswered[0]}...`);
    return false;
  }

  // All answered! Try to submit.
  const submitBtn = page.locator('button').filter({ hasText: /^Submit$|^Save$|^Apply$|^Save & Apply$/i }).first();
  if (await submitBtn.count() > 0) {
    await submitBtn.click();
    await sleep(3000);
    log.actions.push(`Successfully auto-applied (via Q&A engine) to ${jobUrl}`);
    return true;
  }

  log.warnings.push(`Filled Q&A for ${jobUrl} but couldn't find Submit button.`);
  return false;
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

  const context = await chromium.launchPersistentContext(profileDir, {
    headless: headless,
    slowMo: config.browser?.slowMoMs ?? 0,
    viewport: { width: 1366, height: 900 }
  });

  const page = context.pages()[0] || await context.newPage();

  try {
    console.log('Checking saved Naukri session.');
    let loggedIn = await isLoggedIn(page);
    if (!loggedIn) {
      loggedIn = await attemptCredentialLogin(page, log);
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
      console.log('Uploading configured resume.');
      await uploadResume(page, config.resume.path, log);
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
      const minScore = config.applications?.minRelevanceScore ?? 2;
      const eligibleJobs = trackerRows.filter(row =>
        row.status === 'Not Applied' && row.relevanceScore >= minScore
      );
      console.log(`Found ${eligibleJobs.length} eligible jobs to apply (score >= ${minScore})...`);
      for (const row of eligibleJobs) {
        console.log(`Auto-applying to ${row.serialNumber} (${row.company} - score: ${row.relevanceScore})...`);
        const result = await autoApply(context, row.url, log, config);
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
        }
        const success = result === true;
        if (success || result === 'already_applied' || result === 'external') {
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
