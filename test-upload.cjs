require('dotenv').config();
const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();
const path = require('path');
const fs = require('fs/promises');

chromium.use(stealth);

async function uploadResume(page, resumePath) {
  const resolvedResumePath = path.resolve(resumePath);
  console.log('Testing upload for:', resolvedResumePath);

  await page.goto('https://www.naukri.com/mnjuser/profile', { waitUntil: 'domcontentloaded' });
  console.log('Profile page loaded.');

  try {
    // Look strictly for the visible Update Resume button, NOT hidden file inputs or profile picture inputs
    const updateBtn = page.locator('input[value="Update resume"], button:has-text("Update resume"), a:has-text("Update resume")').first();
    
    console.log('Waiting for React to hydrate...');
    await page.waitForTimeout(3000);

    console.log('Clicking upload button and waiting for file dialog...');
    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser', { timeout: 15000 }),
      updateBtn.click({ force: true })
    ]);
    
    console.log('Injecting file into dialog...');
    await fileChooser.setFiles(resolvedResumePath);
    
    console.log('Waiting for green success message...');
    const successMsg = page.getByText(/uploaded successfully|updated successfully|success/i).first();
    await successMsg.waitFor({ state: 'visible', timeout: 10000 });
    console.log(`Resume uploaded SUCCESSFULLY!`);
    await notifyDiscord(`✅ Base resume successfully updated on Naukri profile: ${resolvedResumePath}`);
  } catch (err) {
    console.error(`Resume upload failed: ${err.message}`);
    await notifyDiscord(`❌ Failed to update resume on Naukri profile: ${err.message}`);
  }
}

async function notifyDiscord(message) {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) return;
  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: message })
    });
  } catch (err) {
    console.error('Webhook failed:', err.message);
  }
}

async function run() {
  const config = JSON.parse(await fs.readFile('./config.json', 'utf8'));
  const userDataDir = path.join(process.cwd(), 'browser-profile');
  console.log('Launching browser...');
  const browser = await chromium.launchPersistentContext(userDataDir, {
    headless: false, // Visible so you can watch
    viewport: null,
    args: ['--start-maximized', '--disable-blink-features=AutomationControlled']
  });

  const page = await browser.newPage();
  await uploadResume(page, config.resume.path);
  
  console.log('Test complete. Closing browser in 5 seconds...');
  await new Promise(r => setTimeout(r, 5000));
  await browser.close();
}

run();
