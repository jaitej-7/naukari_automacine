import { decrypt } from '../utils/crypto.js';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function isLoggedIn(page) {
  if (!page.url().toLowerCase().includes('/mnjuser/profile')) {
    await page.goto('https://www.naukri.com/mnjuser/profile', { waitUntil: 'domcontentloaded' }).catch((err) => console.error('Caught error:', err.message));
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

export async function waitForManualLogin(page, timeoutMs) {
  const started = Date.now();

  console.log('Login required. Please complete Naukri login in the opened browser window.');
  await page.goto('https://www.naukri.com/nlogin/login', { waitUntil: 'domcontentloaded' }).catch((err) => console.error('Caught error:', err.message));

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

export async function attemptCredentialLogin(page, log, config) {
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
  await page.goto('https://www.naukri.com/nlogin/login', { waitUntil: 'domcontentloaded' }).catch((err) => console.error('Caught error:', err.message));
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch((err) => console.error('Caught error:', err.message));

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

export async function lightProfileRefresh(page, config, log) {
  if (!config.profile?.refreshProfile) return;

  if (!page.url().toLowerCase().includes('/mnjuser/profile')) {
    await page.goto('https://www.naukri.com/mnjuser/profile', { waitUntil: 'domcontentloaded' }).catch((err) => console.error('Caught error:', err.message));
  }

  await page.waitForTimeout(3000);

  try {
    const editHeadlineBtn = page.locator('span:has-text("Resume headline")').locator('..').locator('.edit').first();
    const foundBtn = await editHeadlineBtn.count().catch(() => 0);
    
    if (foundBtn > 0) {
      log.actions.push('Found Resume Headline edit button. Attempting auto-bump...');
      await editHeadlineBtn.click();
      await page.waitForTimeout(2000);
      
      const textarea = page.locator('textarea[id="resumeHeadlineTxt"]');
      if (await textarea.count() > 0) {
        let currentText = await textarea.inputValue();
        // Microscopic edit: toggle a trailing space
        if (currentText.endsWith(' ')) {
          currentText = currentText.slice(0, -1);
        } else {
          currentText += ' ';
        }
        await textarea.fill(currentText);
        await page.waitForTimeout(1000);
        
        const saveBtn = page.getByRole('button', { name: 'Save' });
        await saveBtn.click();
        await page.waitForTimeout(2000);
        log.actions.push('Profile auto-bumped successfully (Resume Headline updated).');
      }
    } else {
      log.warnings.push('Could not find Resume Headline edit button for auto-bump.');
    }
  } catch (err) {
    log.warnings.push(`Profile auto-bump failed: ${err.message}`);
  }

  await page.mouse.wheel(0, 600);
  await page.waitForTimeout(1500);
}
