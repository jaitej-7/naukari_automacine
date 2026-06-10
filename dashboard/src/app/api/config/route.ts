import { NextResponse } from 'next/server';
import Database from 'better-sqlite3';
import { PrismaClient } from '@prisma/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import path from 'path';

function getPrisma() {
  const dbPath = path.join(process.cwd(), '../database.sqlite');
  const adapter = new PrismaBetterSqlite3({ url: `file:${dbPath}` });
  return new PrismaClient({ adapter });
}

export async function GET() {
  let prisma;
  try {
    prisma = getPrisma();
    const c = await prisma.configuration.findUnique({ where: { id: 1 } });
    if (!c) {
      return NextResponse.json({});
    }

    const config = {
      resume: {
        path: c.resumePath,
        uploadEveryRun: c.uploadEveryRun
      },
      profile: {
        refreshProfile: c.refreshProfile,
        headline: c.headline,
        profileSummary: c.profileSummary,
        keySkills: JSON.parse(c.keySkills || '[]')
      },
      jobs: {
        searches: JSON.parse(c.searches || '[]'),
        maxResultsPerSearch: c.maxResultsPerSearch,
        minRelevanceScore: c.minRelevanceScore,
        includeKeywords: JSON.parse(c.includeKeywords || '[]'),
        excludeKeywords: JSON.parse(c.excludeKeywords || '[]')
      },
      applications: {
        directApply: c.directApply,
        createResumeFolderPerJob: c.createResumeFolder,
        defaultStatus: c.defaultStatus,
        qaMemory: JSON.parse(c.qaMemory || '{}'),
        statuses: JSON.parse(c.statuses || '["Not Applied", "Applied", "Rejected", "Interviewing"]')
      },
      browser: {
        headless: c.headless,
        slowMoMs: c.slowMoMs,
        manualLoginTimeoutMs: c.manualLoginTimeoutMs
      }
    };

    return NextResponse.json(config);
  } catch (error) {
    console.error('Error reading config:', error);
    return NextResponse.json({ error: 'Failed to read config' }, { status: 500 });
  } finally {
    if (prisma) await prisma.$disconnect();
  }
}

export async function POST(request: Request) {
  let prisma;
  try {
    const body = await request.json();
    prisma = getPrisma();

    const dataToSave = {
      resumePath: body.resume?.path || '',
      uploadEveryRun: body.resume?.uploadEveryRun ?? true,
      refreshProfile: body.profile?.refreshProfile ?? true,
      headline: body.profile?.headline || '',
      profileSummary: body.profile?.profileSummary || '',
      keySkills: JSON.stringify(body.profile?.keySkills || []),
      maxResultsPerSearch: body.jobs?.maxResultsPerSearch || 25,
      minRelevanceScore: body.jobs?.minRelevanceScore || 2,
      searches: JSON.stringify(body.jobs?.searches || []),
      includeKeywords: JSON.stringify(body.jobs?.includeKeywords || []),
      excludeKeywords: JSON.stringify(body.jobs?.excludeKeywords || []),
      directApply: body.applications?.directApply ?? true,
      createResumeFolder: body.applications?.createResumeFolderPerJob ?? true,
      defaultStatus: body.applications?.defaultStatus || 'Not Applied',
      qaMemory: JSON.stringify(body.applications?.qaMemory || {}),
      statuses: JSON.stringify(body.applications?.statuses || '["Not Applied", "Applied", "Rejected", "Interviewing"]'),
      headless: body.browser?.headless ?? true,
      slowMoMs: body.browser?.slowMoMs || 120,
      manualLoginTimeoutMs: body.browser?.manualLoginTimeoutMs || 300000
    };

    await prisma.configuration.upsert({
      where: { id: 1 },
      update: dataToSave,
      create: { id: 1, ...dataToSave }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating config:', error);
    return NextResponse.json({ error: 'Failed to update config' }, { status: 500 });
  } finally {
    if (prisma) await prisma.$disconnect();
  }
}
