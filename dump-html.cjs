const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();
const path = require('path');

chromium.use(stealth);

async function run() {
  const userDataDir = path.join(process.cwd(), 'browser-profile');
  const browser = await chromium.launchPersistentContext(userDataDir, { headless: true });
  const page = await browser.newPage();
  
  await page.goto('https://www.naukri.com/mnjuser/profile', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000); // let React load

  try {
    const data = await page.evaluate(() => {
      // Find all file inputs
      const fileInputs = Array.from(document.querySelectorAll('input[type="file"]'));
      return fileInputs.map(input => {
        let parent = input.parentElement;
        if(parent && parent.parentElement) parent = parent.parentElement;
        return parent ? parent.outerHTML : input.outerHTML;
      });
    });
    console.log("=== FILE INPUTS FOUND ===");
    console.log(data.join('\n\n-----------------\n\n'));
  } catch (err) {
    console.error(err);
  }
  
  await browser.close();
}
run();
