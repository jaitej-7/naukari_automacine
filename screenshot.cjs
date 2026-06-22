const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  await page.goto('http://localhost:3000');
  await page.waitForTimeout(2000);
  
  const passwordInputCount = await page.locator('input[type="password"]').count();
  if (passwordInputCount > 0) {
    await page.fill('input[type="password"]', 'StealthJobAuto123!');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(3000);
  }
  
  await page.screenshot({ path: 'dashboard.png' });
  await browser.close();
  console.log('Screenshot saved to dashboard.png');
})().catch(console.error);
