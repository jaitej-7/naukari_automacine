import 'dotenv/config';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { prisma } from './utils/db.js';
import crypto from 'node:crypto';
import { generateKeys } from './utils/crypto.js';
import { startDiscordBot } from './discord-bot.js';

const rootDir = process.cwd();
const envPath = path.join(rootDir, '.env');

// Helper to ensure RSA keys are generated and saved
async function ensureKeys() {
  // Try loading from process.env first
  let privateKeyB64 = process.env.RSA_PRIVATE_KEY;
  
  if (!privateKeyB64) {
    console.log('No RSA_PRIVATE_KEY found in environment. Generating new keypair...');
    const { publicKey, privateKey } = generateKeys();
    privateKeyB64 = Buffer.from(privateKey).toString('base64');
    
    // Append to .env file
    try {
      let envContent = await fs.readFile(envPath, 'utf8').catch(() => '');
      if (envContent && !envContent.endsWith('\n')) {
        envContent += '\n';
      }
      envContent += `# Cryptography Keys for Secure Naukri Password\nRSA_PRIVATE_KEY="${privateKeyB64}"\n`;
      await fs.writeFile(envPath, envContent, 'utf8');
      process.env.RSA_PRIVATE_KEY = privateKeyB64;
      console.log('Saved RSA private key to local .env file.');
    } catch (err) {
      console.error('Warning: Failed to write private key to .env:', err.message);
    }

    // Upsert public key to database Configuration (id: 1)
    try {
      await prisma.configuration.upsert({
        where: { id: 1 },
        update: { publicKey: publicKey },
        create: { id: 1, resumePath: '', publicKey: publicKey }
      });
      console.log('Uploaded RSA public key to Supabase database.');
    } catch (err) {
      console.error('Failed to upload public key to DB:', err.message);
    }
  } else {
    // If key exists in .env, ensure DB has it
    try {
      const config = await prisma.configuration.findUnique({ where: { id: 1 } });
      if (config && !config.publicKey) {
        // Recover public key from private key
        const privateKey = Buffer.from(privateKeyB64, 'base64').toString('utf8');
        const publicKey = crypto.createPublicKey(privateKey).export({ type: 'spki', format: 'pem' });
        await prisma.configuration.update({
          where: { id: 1 },
          data: { publicKey }
        });
        console.log('Recovered and uploaded public key to database.');
      }
    } catch (err) {
      // Ignore or log
    }
  }
}

// Global state for active run
let activeRunId = null;

// Discord Bot global state
let discordClient = null;
let currentBotToken = null;

async function syncDiscordBot() {
  try {
    const config = await prisma.configuration.findUnique({ where: { id: 1 } });
    const token = config?.discordBotToken;

    if (token !== currentBotToken) {
      if (discordClient) {
        console.log('[Daemon] Discord Bot token changed. Stopping old Discord client...');
        try {
          discordClient.destroy();
        } catch (destroyErr) {
          console.error('[Daemon] Error destroying discord client:', destroyErr.message);
        }
        discordClient = null;
      }

      currentBotToken = token;

      if (token) {
        console.log('[Daemon] Starting Discord bot client...');
        discordClient = startDiscordBot(token);
      }
    }
  } catch (err) {
    console.error('[Daemon] Error syncing Discord Bot:', err.message);
  }
}

// Throttled logging helper
class RunLogger {
  constructor(runId) {
    this.runId = runId;
    this.logs = [];
    this.dirty = false;
    this.timer = setInterval(() => this.flush(), 2500);
  }

  log(message) {
    const timestamp = new Date().toISOString();
    const cleanMsg = message.replace(/\r?\n$/, '');
    if (cleanMsg) {
      this.logs.push(`[${timestamp}] ${cleanMsg}`);
      this.dirty = true;
    }
  }

  async flush() {
    if (!this.dirty) return;
    this.dirty = false;
    const logsToSave = [...this.logs];
    try {
      const run = await prisma.botRun.findUnique({ where: { id: this.runId } });
      if (run) {
        const currentLogs = JSON.parse(run.logs || '[]');
        const updatedLogs = [...currentLogs, ...logsToSave];
        await prisma.botRun.update({
          where: { id: this.runId },
          data: { logs: JSON.stringify(updatedLogs) }
        });
        // Remove successfully saved logs from buffer
        this.logs = this.logs.slice(logsToSave.length);
      }
    } catch (err) {
      console.error('Failed to flush logs to DB:', err.message);
      this.dirty = true; // Retry next time
    }
  }

  async close(status, finishedAt) {
    clearInterval(this.timer);
    await this.flush(); // final flush
    try {
      await prisma.botRun.update({
        where: { id: this.runId },
        data: {
          status,
          finishedAt,
          logs: JSON.stringify(this.logs) // write final logs
        }
      });
    } catch (err) {
      console.error('Failed to close run status in DB:', err.message);
    }
  }
}

// Spawns the automation script
async function executeRun(runId, headless) {
  activeRunId = runId;
  console.log(`[Daemon] Executing bot run: ${runId} (headless: ${headless})`);

  try {
    await prisma.botRun.update({
      where: { id: runId },
      data: {
        status: 'in-progress',
        startedAt: new Date()
      }
    });

    const logger = new RunLogger(runId);
    logger.log(`Bot run initiated on local runner.`);

    const args = ['src/naukri-automation.js'];
    if (headless) {
      args.push('--headless');
    } else {
      args.push('--headful');
    }

    const child = spawn('node', args, {
      cwd: rootDir,
      env: { ...process.env, ACTIVE_RUN_ID: runId }
    });

    child.stdout.on('data', (data) => {
      const lines = data.toString().split('\n');
      for (const line of lines) {
        if (line.trim()) {
          console.log(`[Runner stdout] ${line.trim()}`);
          logger.log(line.trim());
        }
      }
    });

    child.stderr.on('data', (data) => {
      const lines = data.toString().split('\n');
      for (const line of lines) {
        if (line.trim()) {
          console.error(`[Runner stderr] ${line.trim()}`);
          logger.log(`ERROR: ${line.trim()}`);
        }
      }
    });

    child.on('close', async (code) => {
      const status = code === 0 ? 'completed' : 'failed';
      console.log(`[Daemon] Bot run ${runId} finished with code: ${code} (status: ${status})`);
      logger.log(`Runner process exited with code ${code}. Status: ${status}`);
      await logger.close(status, new Date());
      activeRunId = null;
    });
  } catch (err) {
    console.error(`[Daemon] Failed to start run ${runId}:`, err.message);
    await prisma.botRun.update({
      where: { id: runId },
      data: {
        status: 'failed',
        finishedAt: new Date(),
        logs: JSON.stringify([`[Daemon Error] Failed to start runner: ${err.message}`])
      }
    });
    activeRunId = null;
  }
}

// Background scheduler check (interval scheduler)
async function checkScheduler() {
  if (activeRunId) return; // Do not schedule runs if one is already executing

  try {
    const config = await prisma.configuration.findUnique({ where: { id: 1 } });
    if (!config || !config.schedulerEnabled) return;

    // Get the latest run
    const latestRun = await prisma.botRun.findFirst({
      orderBy: { triggeredAt: 'desc' }
    });

    const intervalMs = (config.schedulerIntervalMin || 60) * 60 * 1000;
    const now = Date.now();

    let shouldQueue = false;
    if (!latestRun) {
      shouldQueue = true;
    } else {
      const lastTriggered = new Date(latestRun.triggeredAt).getTime();
      if (now - lastTriggered >= intervalMs && latestRun.status !== 'queued' && latestRun.status !== 'in-progress') {
        shouldQueue = true;
      }
    }

    if (shouldQueue) {
      console.log(`[Scheduler] Interval elapsed. Queueing automated run (${config.schedulerIntervalMin} min interval)...`);
      await prisma.botRun.create({
        data: {
          status: 'queued',
          headless: config.headless
        }
      });
    }
  } catch (err) {
    console.error('[Scheduler] Error during schedule check:', err.message);
  }
}

let pollIteration = 0;

// Polling loop
async function pollLoop() {
  try {
    pollIteration++;
    // Sync Discord bot configuration every 30 seconds (6 iterations)
    if (pollIteration % 6 === 1) {
      await syncDiscordBot();
    }

    // Check for manual queues
    if (!activeRunId) {
      const queuedRun = await prisma.botRun.findFirst({
        where: { status: 'queued' },
        orderBy: { triggeredAt: 'asc' }
      });

      if (queuedRun) {
        await executeRun(queuedRun.id, queuedRun.headless);
      }
    }
    
    // Check background scheduler
    await checkScheduler();
  } catch (err) {
    console.error('[Daemon] Loop execution error:', err.message);
  }
  
  // Poll every 5 seconds
  setTimeout(pollLoop, 5000);
}

// Main execution
async function main() {
  console.log('============================================');
  console.log('  Stealth Job Automachine Runner Daemon      ');
  console.log('============================================');
  
  await ensureKeys();
  await syncDiscordBot();
  console.log('[Daemon] Database connection, keys, & Discord bot verified.');
  console.log('[Daemon] Starting polling loop (every 5 seconds)...');
  
  pollLoop();
}

main().catch((err) => {
  console.error('[Daemon CRITICAL] Daemon crashed:', err);
  process.exit(1);
});
