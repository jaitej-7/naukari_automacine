import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';

// Track bot run state in a temp file so all requests can read it
const statusFile = path.join(process.cwd(), '../.bot-status.json');

function readStatus() {
  try {
    return JSON.parse(fs.readFileSync(statusFile, 'utf8'));
  } catch {
    return { running: false, lastRun: null, pid: null };
  }
}

function writeStatus(data: object) {
  fs.writeFileSync(statusFile, JSON.stringify(data, null, 2));
}

export async function GET() {
  return NextResponse.json(readStatus());
}

export async function POST() {
  const current = readStatus();
  if (current.running) {
    return NextResponse.json({ message: 'Bot is already running' }, { status: 409 });
  }

  const scriptPath = path.join(process.cwd(), '../src/naukri-automation.js');
  const cwd = path.join(process.cwd(), '..');

  writeStatus({ running: true, lastRun: new Date().toISOString(), pid: null, log: 'Starting bot...' });

  const child = exec(`node "${scriptPath}"`, { cwd }, (error, stdout, stderr) => {
    const log = stdout || stderr || (error ? error.message : 'Done');
    writeStatus({
      running: false,
      lastRun: new Date().toISOString(),
      pid: null,
      log: log.slice(-500) // keep last 500 chars
    });
  });

  writeStatus({ running: true, lastRun: new Date().toISOString(), pid: child.pid, log: 'Bot started...' });

  return NextResponse.json({ message: 'Bot started', pid: child.pid });
}
