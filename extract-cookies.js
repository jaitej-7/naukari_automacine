import { chromium } from 'playwright-extra';
import stealthPlugin from 'puppeteer-extra-plugin-stealth';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

chromium.use(stealthPlugin());

const profileDir = path.join(__dirname, 'browser-profile');
const launchOptions = {
  headless: true,
  args: [
    '--disable-blink-features=AutomationControlled',
    '--no-sandbox',
    '--disable-setuid-sandbox'
  ]
};

async function extract() {
  console.log('Launching browser to extract cookies...');
  try {
    const context = await chromium.launchPersistentContext(profileDir, launchOptions);
    
    // Save storage state into state.json
    await context.storageState({ path: 'state.json' });
    console.log('✅ Successfully extracted browser cookies to state.json');
    
    await context.close();
    
    // Read and format for Hugging Face secret
    const stateStr = await fs.readFile('state.json', 'utf8');
    // Minimize it
    const minified = JSON.stringify(JSON.parse(stateStr));
    await fs.writeFile('hf-secret-cookies.txt', minified, 'utf8');
    
    console.log('\n--- NEXT STEPS ---');
    console.log('1. A new file called "hf-secret-cookies.txt" has been created.');
    console.log('2. When you create your Hugging Face Space, go to Settings -> Variables and secrets.');
    console.log('3. Create a New Secret:');
    console.log('   Name: NAUKRI_COOKIES');
    console.log('   Value: (paste the entire contents of hf-secret-cookies.txt)');
    console.log('------------------\n');
    
    process.exit(0);
  } catch (err) {
    console.error('Error extracting cookies:', err);
    process.exit(1);
  }
}

extract();
