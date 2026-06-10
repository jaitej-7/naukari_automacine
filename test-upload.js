const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();
const path = require('path');
const config = require('./config.json');

chromium.use(stealth);

async function uploadResume(page, resumePath) {
  const resolvedResumePath = path.resolve(resumePath);
  console.log('Testing upload for:', resolvedResumePath);

  await page.goto('https://www.naukri.com/mnjuser/profile', { waitUntil: 'domcontentloaded' });
  console.log('Profile page loaded.');

  try {
    const updateBtn = page.locator('input[value="Update resume" i], input[id="attachCV"], button:has-text("Update"), .uploadBtn, input[type="file"]').first();
    
    console.log('Clicking upload button and waiting for file dialog...');
    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser', { timeout: 10000 }),
      updateBtn.click({ force: true })
    ]);
    
    console.log('Injecting file into dialog...');
    await fileChooser.setFiles(resolvedResumePath);
    
    console.log('Waiting for green success message...');
    const successMsg = page.getByText(/uploaded successfully|updated successfully|success/i);
    await successMsg.waitFor({ state: 'visible', timeout: 10000 });
    console.log(`Resume uploaded SUCCESSFULLY!`);
  } catch (err) {
    console.error(`Resume upload failed: ${err.message}`);
  }
}

async function run() {
  const userDataDir = path.join(process.cwd(), 'browser-profile');
  console.log('Launching browser...');
  const browser = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
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
