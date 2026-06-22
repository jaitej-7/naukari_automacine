import { prisma } from './src/utils/db.js';

async function clear() {
  await prisma.job.deleteMany();
  console.log('Deleted all jobs.');

  const config = await prisma.configuration.findFirst();
  if (config) {
    const data = {
      naukriEmail: null,
      naukriPassword: null,
      resumeStoragePath: null,
      resumeText: null
    };
    await prisma.configuration.update({
      where: { id: config.id },
      data
    });
    console.log('Cleared credentials and resume from config.');
  }
}

clear()
  .catch(console.error);
