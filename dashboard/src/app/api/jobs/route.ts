import { NextResponse } from 'next/server';
import { prisma } from '@/utils/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const trackerData = await prisma.job.findMany({
      orderBy: { serialNumber: 'desc' }
    });
    
    const runLogDataRaw = await prisma.runLog.findMany({
      orderBy: { startedAt: 'desc' },
      take: 10
    });

    const runLogData = runLogDataRaw.map(log => ({
      ...log,
      actions: JSON.parse(log.actions || '[]'),
      warnings: JSON.parse(log.warnings || '[]')
    }));

    return NextResponse.json({
      tracker: trackerData,
      runLog: runLogData
    });
  } catch (error) {
    console.error('Error fetching jobs data:', error);
    return NextResponse.json({ error: 'Failed to fetch jobs data' }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    await prisma.job.deleteMany();
    await prisma.runLog.deleteMany();
    await prisma.botRun.deleteMany();
    await prisma.qAInteraction.deleteMany();
    return NextResponse.json({ success: true, message: 'All database tables successfully cleared' });
  } catch (error: any) {
    console.error('Error clearing database:', error);
    return NextResponse.json({ error: `Failed to clear database: ${error.message}` }, { status: 500 });
  }
}
