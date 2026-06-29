import { NextResponse } from 'next/server';
import { prisma } from '@/utils/db';
import { encrypt } from '@/utils/crypto';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
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
      },
      naukriEmail: c.naukriEmail,
      geminiApiKey: c.geminiApiKey,
      publicKey: c.publicKey,
      careerStartDate: c.careerStartDate,
      customFields: JSON.parse(c.customFields || '{}'),
      discordWebhookUrl: c.discordWebhookUrl,
      discordBotToken: c.discordBotToken,
      discordQaChannelId: c.discordQaChannelId,

      botEnabled: c.botEnabled,
      schedulerEnabled: c.schedulerEnabled,
      schedulerIntervalMin: c.schedulerIntervalMin,
      profileRefreshIntervalMin: c.profileRefreshIntervalMin
    };

    return NextResponse.json(config);
  } catch (error) {
    console.error('Error reading config:', error);
    return NextResponse.json({ error: 'Failed to read config' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    // Fetch existing configuration to merge
    const existing = await prisma.configuration.findUnique({ where: { id: 1 } });

    let encryptedPassword = existing?.naukriPassword ?? null;
    if (body.naukriPassword) {
      const pubKey = existing?.publicKey || body.publicKey;
      if (pubKey) {
        try {
          encryptedPassword = encrypt(body.naukriPassword, pubKey);
        } catch (err: any) {
          console.error('[Config API] Password encryption failed:', err.message);
          encryptedPassword = body.naukriPassword; // Fallback
        }
      } else {
        encryptedPassword = body.naukriPassword;
      }
    }

    const dataToSave = {
      resumePath: body.resume?.path ?? existing?.resumePath ?? '',
      uploadEveryRun: body.resume?.uploadEveryRun ?? existing?.uploadEveryRun ?? true,
      refreshProfile: body.profile?.refreshProfile ?? existing?.refreshProfile ?? true,
      headline: body.profile?.headline ?? existing?.headline ?? '',
      profileSummary: body.profile?.profileSummary ?? existing?.profileSummary ?? '',
      keySkills: body.profile?.keySkills 
        ? JSON.stringify(body.profile.keySkills) 
        : (existing?.keySkills || '[]'),
      maxResultsPerSearch: body.jobs?.maxResultsPerSearch ?? existing?.maxResultsPerSearch ?? 25,
      minRelevanceScore: body.jobs?.minRelevanceScore ?? existing?.minRelevanceScore ?? 2,
      searches: body.jobs?.searches 
        ? JSON.stringify(body.jobs.searches) 
        : (existing?.searches || '[]'),
      includeKeywords: body.jobs?.includeKeywords 
        ? JSON.stringify(body.jobs.includeKeywords) 
        : (Array.isArray(body.keywords) ? JSON.stringify(body.keywords) : (existing?.includeKeywords || '[]')),
      excludeKeywords: body.jobs?.excludeKeywords 
        ? JSON.stringify(body.jobs.excludeKeywords) 
        : (existing?.excludeKeywords || '[]'),
      directApply: body.applications?.directApply ?? existing?.directApply ?? true,
      createResumeFolder: body.applications?.createResumeFolderPerJob ?? existing?.createResumeFolder ?? true,
      defaultStatus: body.applications?.defaultStatus ?? existing?.defaultStatus ?? 'Not Applied',
      qaMemory: body.applications?.qaMemory 
        ? JSON.stringify(body.applications.qaMemory) 
        : (existing?.qaMemory || '{}'),
      statuses: body.applications?.statuses 
        ? JSON.stringify(body.applications.statuses) 
        : (existing?.statuses || '["Not Applied", "Applied", "Rejected", "Interviewing"]'),
      headless: body.browser?.headless ?? (typeof body.headless === 'boolean' ? body.headless : (existing?.headless ?? true)),
      slowMoMs: body.browser?.slowMoMs ?? existing?.slowMoMs ?? 120,
      manualLoginTimeoutMs: body.browser?.manualLoginTimeoutMs ?? existing?.manualLoginTimeoutMs ?? 300000,
      
      // New fields from settings panel:
      naukriEmail: body.naukriEmail ?? existing?.naukriEmail ?? null,
      naukriPassword: encryptedPassword,
      geminiApiKey: body.geminiApiKey ?? existing?.geminiApiKey ?? null,
      careerStartDate: body.careerStartDate ?? existing?.careerStartDate ?? null,
      customFields: body.customFields ? JSON.stringify(body.customFields) : (existing?.customFields || '{}'),
      discordWebhookUrl: body.discordWebhookUrl ?? existing?.discordWebhookUrl ?? null,
      discordBotToken: body.discordBotToken ?? existing?.discordBotToken ?? null,
      discordQaChannelId: body.discordQaChannelId ?? existing?.discordQaChannelId ?? null,
      botEnabled: body.botEnabled ?? existing?.botEnabled ?? false,
      schedulerEnabled: body.schedulerEnabled ?? existing?.schedulerEnabled ?? false,
      schedulerIntervalMin: body.schedulerIntervalMin ?? existing?.schedulerIntervalMin ?? 60,
      profileRefreshIntervalMin: body.profileRefreshIntervalMin ?? existing?.profileRefreshIntervalMin ?? 10
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
  }
}
