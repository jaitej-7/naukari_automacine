import { chromium } from 'playwright-extra';
import stealthPlugin from 'puppeteer-extra-plugin-stealth';

chromium.use(stealthPlugin());

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  try {
    console.log("Navigating to Supabase sign-in page...");
    await page.goto('https://supabase.com/dashboard/sign-in', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    
    console.log("Entering credentials...");
    await page.fill('input[type="email"]', 'tejajaya458@gmail.com');
    await page.fill('input[type="password"]', 'jai101251@A');
    await page.click('button:has-text("Sign in")');
    
    console.log("Waiting for login...");
    await page.waitForTimeout(5000);
    await page.waitForLoadState('networkidle').catch(() => {});

    console.log("Navigating to project page...");
    await page.goto('https://supabase.com/dashboard/project/nxzxlvvtfdbhmbteckoy', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(10000);

    // take a screenshot of the project page to see what to click
    await page.screenshot({ path: 'supabase-project-page.png', fullPage: true });
    console.log("Screenshot saved as supabase-project-page.png");

    // Look for text like "Restore", "Restore project", "Unpause"
    const restoreBtnText = await page.getByRole('button', { name: /restore/i }).count();
    const unpauseBtnText = await page.getByRole('button', { name: /unpause/i }).count();

    if (restoreBtnText > 0) {
      console.log("Found Restore button. Clicking...");
      await page.getByRole('button', { name: /restore/i }).first().click();
      await page.waitForTimeout(5000);
      await page.screenshot({ path: 'supabase-after-restore.png', fullPage: true });
      console.log("Screenshot saved as supabase-after-restore.png");
    } else if (unpauseBtnText > 0) {
      console.log("Found Unpause button. Clicking...");
      await page.getByRole('button', { name: /unpause/i }).first().click();
      await page.waitForTimeout(5000);
      await page.screenshot({ path: 'supabase-after-restore.png', fullPage: true });
      console.log("Screenshot saved as supabase-after-restore.png");
    } else {
      console.log("Could not find a Restore or Unpause button on the page. Please check the screenshot.");
    }

  } catch (error) {
    console.error("An error occurred:", error);
    await page.screenshot({ path: 'supabase-error.png' });
  } finally {
    await browser.close();
  }
})();
