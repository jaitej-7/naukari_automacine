import Database from 'better-sqlite3';
import { PrismaClient } from '@prisma/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import fs from 'fs/promises';
import path from 'path';
import 'dotenv/config';

// We don't need to manually create Database anymore
const adapter = new PrismaBetterSqlite3({ url: 'file:database.sqlite' });
const prisma = new PrismaClient({ adapter });

async function migrateConfig() {
  try {
    const rawConfig = await fs.readFile(path.join(process.cwd(), 'config.json'), 'utf8');
    const config = JSON.parse(rawConfig);
    
    await prisma.configuration.upsert({
      where: { id: 1 },
      update: {},
      create: {
        resumePath: config.resume?.path || '',
        uploadEveryRun: config.resume?.uploadEveryRun ?? true,
        refreshProfile: config.profile?.refreshProfile ?? true,
        headline: config.profile?.headline,
        profileSummary: config.profile?.profileSummary,
        keySkills: JSON.stringify(config.profile?.keySkills || []),
        maxResultsPerSearch: config.jobs?.maxResultsPerSearch ?? 25,
        minRelevanceScore: config.jobs?.minRelevanceScore ?? 2,
        searches: JSON.stringify(config.jobs?.searches || []),
        includeKeywords: JSON.stringify(config.jobs?.includeKeywords || []),
        excludeKeywords: JSON.stringify(config.jobs?.excludeKeywords || []),
        directApply: config.applications?.directApply ?? true,
        createResumeFolder: config.applications?.createResumeFolderPerJob ?? true,
        defaultStatus: config.applications?.defaultStatus || 'Not Applied',
        qaMemory: JSON.stringify(config.applications?.qaMemory || {}),
        statuses: JSON.stringify(config.applications?.statuses || []),
        headless: config.browser?.headless ?? true,
        slowMoMs: config.browser?.slowMoMs ?? 120,
        manualLoginTimeoutMs: config.browser?.manualLoginTimeoutMs ?? 300000
      }
    });
    console.log('Migrated configuration.');
  } catch (error) {
    console.error('Failed to migrate config:', error.stack);
  }
}

async function migrateJobs() {
  try {
    const rawJobs = await fs.readFile(path.join(process.cwd(), 'reports', 'application-tracker.json'), 'utf8');
    const jobs = JSON.parse(rawJobs);
    
    for (const job of jobs) {
      await prisma.job.upsert({
        where: { jobKey: job.jobKey || job.url },
        update: {},
        create: {
          serialNumber: job.serialNumber,
          status: job.status,
          appliedBy: job.appliedBy,
          appliedAt: job.appliedAt,
          resumeStatus: job.resumeStatus,
          resumeFile: job.resumeFile,
          matchDecision: job.matchDecision,
          relevanceScore: job.relevanceScore,
          title: job.title || 'Unknown',
          company: job.company || 'Unknown',
          location: job.location,
          experience: job.experience,
          salary: job.salary,
          url: job.url,
          resumeFolder: job.resumeFolder,
          searchKeywords: job.searchKeywords,
          capturedAt: job.capturedAt || new Date().toISOString(),
          lastSeenAt: job.lastSeenAt || new Date().toISOString(),
          notes: job.notes,
          jobKey: job.jobKey || job.url,
          description: job.description
        }
      });
    }
    console.log(`Migrated ${jobs.length} jobs.`);
  } catch (error) {
    console.error('Failed to migrate jobs:', error.message);
  }
}

async function migrateRunLog() {
  try {
    const rawLog = await fs.readFile(path.join(process.cwd(), 'reports', 'run-log.json'), 'utf8');
    const log = JSON.parse(rawLog);
    
    await prisma.runLog.create({
      data: {
        startedAt: log.startedAt || new Date().toISOString(),
        finishedAt: log.finishedAt,
        jobCount: log.jobCount || 0,
        trackerCount: log.trackerCount || 0,
        actions: JSON.stringify(log.actions || []),
        warnings: JSON.stringify(log.warnings || [])
      }
    });
    console.log('Migrated latest run log.');
  } catch (error) {
    console.error('Failed to migrate run log:', error.message);
  }
}

async function main() {
  await migrateConfig();
  await migrateJobs();
  await migrateRunLog();
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
