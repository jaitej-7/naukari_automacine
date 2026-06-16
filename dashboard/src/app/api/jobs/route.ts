import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import path from 'path';

export const dynamic = 'force-dynamic';

function getPrisma() {
  const dbPath = path.join(process.cwd(), '../database.sqlite');
  const adapter = new PrismaBetterSqlite3({ url: `file:${dbPath}` });
  return new PrismaClient({ adapter });
}

export async function GET() {
  let prisma;
  try {
    prisma = getPrisma();
    
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
  } finally {
    if (prisma) await prisma.$disconnect();
  }
}
