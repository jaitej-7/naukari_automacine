import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prisma } from './utils/db.js';
import { chromium } from 'playwright-extra';
import stealthPlugin from 'puppeteer-extra-plugin-stealth';
import { isLoggedIn, attemptCredentialLogin, lightProfileRefresh } from './services/auth.js';

chromium.use(stealthPlugin());
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const profileDir = path.join(rootDir, 'browser-profile');

async function readConfig() {
  const c = await prisma.configuration.findUnique({ where: { id: 1 } });
  if (!c) {
    console.error("Configuration not found in database.");
    process.exit(1);
  }
  return {
    profile: {
      refreshProfile: c.refreshProfile,
      headline: c.headline,
      profileSummary: c.profileSummary,
      keySkills: JSON.parse(c.keySkills || '[]'),
      careerStartDate: c.careerStartDate,
      customFields: JSON.parse(c.customFields || '{}')
    },
    browser: {
      headless: c.headless,
      slowMoMs: c.slowMoMs,
      manualLoginTimeoutMs: c.manualLoginTimeoutMs
    },
    credentials: {
      email: c.naukriEmail,
      encryptedPassword: c.naukriPassword
    }
  };
}

async function main() {
  console.log('[Profile Refresh] Starting light profile refresh...');
  const config = await readConfig();

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

  if (headless) {
    launchOptions.args.push('--headless=new');
    launchOptions.userAgent = defaultUserAgent;
  }

  let context;
  let page;
  let browser;

  if (process.env.NAUKRI_COOKIES) {
    console.log('[HF] Using injected cookies from Hugging Face secret');
    browser = await chromium.launch(launchOptions);
    const storageState = JSON.parse(process.env.NAUKRI_COOKIES);
    context = await browser.newContext({ storageState });
    page = await context.newPage();
  } else {
    context = await chromium.launchPersistentContext(profileDir, launchOptions);
    page = context.pages()[0] || await context.newPage();
  }

  const log = { actions: [], warnings: [] };

  try {
    console.log('[Profile Refresh] Checking saved Hunter session.');
    let loggedIn = await isLoggedIn(page);
    if (!loggedIn) {
      console.log('[Profile Refresh] Not logged in. Attempting credential login...');
      loggedIn = await attemptCredentialLogin(page, log, config);
    }

    if (!loggedIn) {
      throw new Error('Hunter login failed or not completed. Skipping profile refresh.');
    }

    console.log('[Profile Refresh] Executing light profile refresh.');
    await lightProfileRefresh(page, config, log);

    console.log('[Profile Refresh] Done.');
  } finally {
    await context.close();
    if (typeof browser !== 'undefined' && browser) {
      await browser.close();
    }
  }
}

main().catch(error => {
  console.error('[Profile Refresh] Error:', error);
  process.exitCode = 1;
});
