import { prisma } from './src/utils/db.js';

async function clear() {
  const config = await prisma.configuration.findFirst();
  if (config) {
    await prisma.configuration.update({
      where: { id: config.id },
      data: {
        resumePath: null
      }
    });
    console.log('Cleared resumePath from config.');
  }
}

clear()
  .catch(console.error);
