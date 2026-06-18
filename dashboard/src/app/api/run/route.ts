import { NextResponse } from 'next/server';
import { prisma } from '@/utils/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const latestRun = await prisma.botRun.findFirst({
      orderBy: { triggeredAt: 'desc' }
    });

    if (!latestRun) {
      return NextResponse.json({ running: false, lastRun: null, pid: null, logs: [] });
    }

    // Auto-timeout for stuck runs (older than 5 minutes)
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const isStuck = (latestRun.status === 'queued' || latestRun.status === 'in-progress') && 
                    latestRun.triggeredAt < fiveMinutesAgo;

    if (isStuck) {
      // Treat as failed if it's been stuck for too long
      await prisma.botRun.update({
        where: { id: latestRun.id },
        data: { status: 'failed', logs: JSON.stringify([...JSON.parse(latestRun.logs || '[]'), 'Run timed out waiting for daemon.']) }
      });
      return NextResponse.json({ running: false, lastRun: latestRun.triggeredAt, status: 'failed', logs: JSON.parse(latestRun.logs || '[]'), id: latestRun.id });
    }

    return NextResponse.json({
      running: latestRun.status === 'queued' || latestRun.status === 'in-progress',
      lastRun: latestRun.triggeredAt,
      status: latestRun.status,
      logs: JSON.parse(latestRun.logs || '[]'),
      id: latestRun.id
    });
  } catch (error) {
    console.error('Error fetching bot run status:', error);
    return NextResponse.json({ error: 'Failed to fetch status' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    // Check if there is already an active run executing
    const activeRun = await prisma.botRun.findFirst({
      where: {
        status: { in: ['queued', 'in-progress'] }
      }
    });

    if (activeRun) {
      return NextResponse.json({ message: 'Bot is already running', id: activeRun.id }, { status: 409 });
    }

    let headless = true;
    try {
      const body = await request.json();
      if (body && typeof body.headless === 'boolean') {
        headless = body.headless;
      }
    } catch {
      // Default to headless
    }

    // Queue a new bot run
    const newRun = await prisma.botRun.create({
      data: {
        status: 'queued',
        headless: headless,
        logs: JSON.stringify(['Queued from dashboard. Waiting for local runner daemon...'])
      }
    });

    return NextResponse.json({ message: 'Bot run queued', id: newRun.id });
  } catch (error) {
    console.error('Error queueing bot run:', error);
    return NextResponse.json({ error: 'Failed to start bot' }, { status: 500 });
  }
}
