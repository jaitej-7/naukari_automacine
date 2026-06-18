import 'dotenv/config';
import Database from 'better-sqlite3';
import { prisma } from '../src/utils/db.js';
import path from 'path';

const dbPath = path.resolve(process.cwd(), 'database.sqlite');

async function runMigration() {
  console.log(`Reading local SQLite database from: ${dbPath}`);
  let localDb;
  try {
    localDb = new Database(dbPath, { fileMustExist: true });
  } catch (err) {
    console.error('Error: Could not open database.sqlite. Make sure it exists in the root directory.');
    process.exit(1);
  }

  // 1. Migrate Configuration
  console.log('Migrating Configuration...');
  try {
    const configRow = localDb.prepare('SELECT * FROM Configuration WHERE id = 1').get();
    if (configRow) {
      const formattedConfig = {
        resumePath: configRow.resumePath || '',
        uploadEveryRun: Boolean(configRow.uploadEveryRun),
        refreshProfile: Boolean(configRow.refreshProfile),
        headline: configRow.headline,
        profileSummary: configRow.profileSummary,
        keySkills: configRow.keySkills || '[]',
        maxResultsPerSearch: configRow.maxResultsPerSearch || 25,
        minRelevanceScore: configRow.minRelevanceScore || 2,
        searches: configRow.searches || '[]',
        includeKeywords: configRow.includeKeywords || '[]',
        excludeKeywords: configRow.excludeKeywords || '[]',
        directApply: Boolean(configRow.directApply),
        createResumeFolder: Boolean(configRow.createResumeFolder),
        defaultStatus: configRow.defaultStatus || 'Not Applied',
        qaMemory: configRow.qaMemory || '{}',
        statuses: configRow.statuses || '[]',
        headless: Boolean(configRow.headless),
        slowMoMs: configRow.slowMoMs || 120,
        manualLoginTimeoutMs: configRow.manualLoginTimeoutMs || 300000,
        // Default new fields:
        naukriEmail: null,
        naukriPassword: null,
        publicKey: null,
        careerStartDate: null,
        customFields: '{}',
        discordWebhookUrl: process.env.DISCORD_WEBHOOK_URL || null,
        discordBotToken: null,
        discordQaChannelId: null,
        schedulerEnabled: false,
        schedulerIntervalMin: 60
      };

      await prisma.configuration.upsert({
        where: { id: 1 },
        update: formattedConfig,
        create: { id: 1, ...formattedConfig }
      });
      console.log('Successfully migrated Configuration to Supabase!');
    } else {
      console.log('No configuration row found in SQLite.');
    }
  } catch (err) {
    console.error('Failed to migrate configuration:', err.message);
  }

  // 2. Migrate Jobs
  console.log('Migrating Jobs...');
  try {
    const jobs = localDb.prepare('SELECT * FROM Job').all();
    console.log(`Found ${jobs.length} jobs in SQLite database.`);
    
    let count = 0;
    for (const job of jobs) {
      await prisma.job.upsert({
        where: { jobKey: job.jobKey },
        update: {
          status: job.status,
          appliedBy: job.appliedBy,
          appliedAt: job.appliedAt,
          resumeStatus: job.resumeStatus,
          resumeFile: job.resumeFile,
          resumeFolder: job.resumeFolder,
          lastSeenAt: job.lastSeenAt,
          notes: job.notes,
        },
        create: {
          serialNumber: job.serialNumber,
          status: job.status || 'Not Applied',
          appliedBy: job.appliedBy,
          appliedAt: job.appliedAt,
          resumeStatus: job.resumeStatus || 'Needs Resume',
          resumeFile: job.resumeFile,
          matchDecision: job.matchDecision || 'Review',
          relevanceScore: job.relevanceScore || 0,
          title: job.title,
          company: job.company,
          location: job.location,
          experience: job.experience,
          salary: job.salary,
          url: job.url,
          resumeFolder: job.resumeFolder,
          searchKeywords: job.searchKeywords,
          capturedAt: job.capturedAt,
          lastSeenAt: job.lastSeenAt,
          notes: job.notes,
          jobKey: job.jobKey,
          description: job.description,
          posted: job.posted
        }
      });
      count++;
    }
    console.log(`Successfully migrated ${count}/${jobs.length} jobs to Supabase!`);
  } catch (err) {
    console.error('Failed to migrate jobs:', err.message);
  }

  // 3. Migrate RunLogs
  console.log('Migrating Run Logs...');
  try {
    const logs = localDb.prepare('SELECT * FROM RunLog').all();
    console.log(`Found ${logs.length} run logs in SQLite.`);
    
    let count = 0;
    for (const log of logs) {
      // Check if already exists in Supabase by startedAt
      const existing = await prisma.runLog.findFirst({
        where: { startedAt: log.startedAt }
      });
      
      if (!existing) {
        await prisma.runLog.create({
          data: {
            startedAt: log.startedAt,
            finishedAt: log.finishedAt,
            jobCount: log.jobCount || 0,
            trackerCount: log.trackerCount || 0,
            actions: log.actions || '[]',
            warnings: log.warnings || '[]'
          }
        });
        count++;
      }
    }
    console.log(`Successfully migrated ${count} new run logs to Supabase!`);
  } catch (err) {
    console.error('Failed to migrate run logs:', err.message);
  }

  console.log('Migration complete!');
  await prisma.$disconnect();
  localDb.close();
}

runMigration().catch(console.error);
