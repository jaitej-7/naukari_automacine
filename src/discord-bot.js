import { Client, GatewayIntentBits, Partials } from 'discord.js';
import { prisma } from './utils/db.js';

/**
 * Initializes and starts the Discord bot listener.
 * Listens for button clicks and message replies to resolve Q&A interactions.
 * @param {string} botToken Discord Bot Token
 * @returns {Client|null} Discord client instance
 */
export function startDiscordBot(botToken) {
  if (!botToken) {
    console.warn('[Discord Bot] No bot token configured. Discord Q&A client will not start.');
    return null;
  }

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent
    ],
    partials: [Partials.Channel, Partials.Message]
  });

  client.once('ready', () => {
    console.log(`[Discord Bot] Logged in as ${client.user.tag}! Listening to Q&A events...`);
  });

  // Handle button clicks
  client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return;

    const customId = interaction.customId;
    if (!customId.startsWith('qa_btn:')) return;

    const parts = customId.split(':');
    if (parts.length < 3) return;

    const interactionId = parts[1];
    const answer = parts.slice(2).join(':'); // handle answers containing colons

    try {
      const qaRow = await prisma.qAInteraction.findUnique({
        where: { id: interactionId }
      });

      if (!qaRow) {
        return interaction.reply({ content: '❌ Q&A Interaction not found.', ephemeral: true });
      }

      if (qaRow.status !== 'pending') {
        return interaction.reply({ 
          content: `❌ Question was already answered or timed out (Status: ${qaRow.status}).`, 
          ephemeral: true 
        });
      }

      // Update database
      await prisma.qAInteraction.update({
        where: { id: interactionId },
        data: {
          status: 'answered',
          answer: answer
        }
      });

      // Update Discord message, disable buttons
      await interaction.update({
        content: `✅ **Answered**: \`${answer}\` (clicked by ${interaction.user.username})`,
        components: [] // removes buttons
      });

      console.log(`[Discord Bot] Resolved QA ID ${interactionId} with button answer: "${answer}"`);
    } catch (err) {
      console.error('[Discord Bot] Button interaction failed:', err.message);
      interaction.reply({ content: `❌ Error saving answer: ${err.message}`, ephemeral: true }).catch(() => {});
    }
  });

  // Handle message replies (for free-text answers)
  client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    // Check if it's a reply to another message
    if (!message.reference || !message.reference.messageId) return;

    try {
      const repliedMsg = await message.channel.messages.fetch(message.reference.messageId);
      if (!repliedMsg.author.bot) return; // Must reply to our bot

      const embed = repliedMsg.embeds?.[0];
      if (!embed) return;

      const footerText = embed.footer?.text || '';
      if (!footerText.includes('Stealth Job Automachine • ID:')) return;

      const interactionId = footerText.split('ID: ')[1]?.trim();
      if (!interactionId) return;

      const qaRow = await prisma.qAInteraction.findUnique({
        where: { id: interactionId }
      });

      if (!qaRow) {
        return message.reply('❌ Q&A Interaction not found in database.');
      }

      if (qaRow.status !== 'pending') {
        return message.reply(`❌ This question has already been answered or timed out (Status: ${qaRow.status}).`);
      }

      const answer = message.content.trim();

      // Update database
      await prisma.qAInteraction.update({
        where: { id: interactionId },
        data: {
          status: 'answered',
          answer: answer
        }
      });

      // Update the bot's message
      await repliedMsg.edit({
        content: `✅ **Answered**: \`${answer}\` (via text reply by ${message.author.username})`,
        components: [] // remove default buttons if present
      });

      // React to user's message to confirm receipt
      await message.react('✅');

      console.log(`[Discord Bot] Resolved QA ID ${interactionId} with text reply: "${answer}"`);
    } catch (err) {
      console.error('[Discord Bot] Message reply processing failed:', err.message);
      message.reply(`❌ Failed to process reply: ${err.message}`).catch(() => {});
    }
  });

  client.login(botToken).catch((err) => {
    console.error('[Discord Bot] Failed to log in to Discord gateway:', err.message);
  });

  return client;
}
