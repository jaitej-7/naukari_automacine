import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-extra';
import stealthPlugin from 'puppeteer-extra-plugin-stealth';

chromium.use(stealthPlugin());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = __dirname;
const profileDir = path.join(rootDir, 'browser-profile');
const screenshotPath = path.join(rootDir, 'reports', 'test-headless-diagnostic.png');

async function testHeadless() {
  console.log('--- Headless Detection Diagnostics ---');
  console.log('Profile Dir:', profileDir);

  // 1. Get default user agent
  let defaultUserAgent = '';
  try {
    const tempBrowser = await chromium.launch({ headless: true });
    const tempPage = await tempBrowser.newPage();
    const ua = await tempPage.evaluate(() => navigator.userAgent);
    await tempBrowser.close();
    defaultUserAgent = ua.replace('HeadlessChrome/', 'Chrome/');
    console.log('Dynamic User-Agent constructed:', defaultUserAgent);
  } catch (e) {
    console.error('Failed to get dynamic user-agent:', e.message);
    defaultUserAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.7778.96 Safari/537.36';
  }

  // 2. Launch persistent context
  const launchOptions = {
    headless: false,
    viewport: { width: 1366, height: 900 },
    args: [
      '--headless=new',
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--disable-setuid-sandbox'
    ],
    userAgent: defaultUserAgent
  };

  console.log('Launching browser with persistent context...');
  const context = await chromium.launchPersistentContext(profileDir, launchOptions);
  const page = context.pages()[0] || await context.newPage();

  try {
    console.log('Navigating to Naukri Home Page first...');
    await page.goto('https://www.naukri.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    
    const homeTitle = await page.title();
    const homeUrl = page.url();
    console.log('Home Page Title:', homeTitle);
    console.log('Home Page URL:', homeUrl);
    
    // Take home page screenshot
    const homeScreenshotPath = path.join(rootDir, 'reports', 'test-headless-home.png');
    await page.screenshot({ path: homeScreenshotPath });
    console.log('Home page screenshot saved to:', homeScreenshotPath);

    await page.waitForTimeout(3000);

    console.log('Navigating to Naukri Profile Page...');
    await page.goto('https://www.naukri.com/mnjuser/profile', { waitUntil: 'domcontentloaded', timeout: 30000 });
    
    // Wait for 5 seconds to let scripts run
    await page.waitForTimeout(5000);

    const title = await page.title();
    const url = page.url();
    console.log('Page Title:', title);
    console.log('Page URL:', url);

    const isAccessDenied = title.toLowerCase().includes('access denied');
    console.log('Access Denied detected:', isAccessDenied);

    // Take screenshot
    await fs.mkdir(path.dirname(screenshotPath), { recursive: true });
    await page.screenshot({ path: screenshotPath });
    console.log('Screenshot saved to:', screenshotPath);
  } catch (err) {
    console.error('Error during test:', err);
  } finally {
    await context.close();
  }
}

testHeadless();
