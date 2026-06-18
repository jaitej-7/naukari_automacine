import 'dotenv/config';

/**
 * Sends a notification embed to Discord using a webhook.
 * @param {string} webhookUrl Webhook URL
 * @param {object} embed Embed object
 * @returns {Promise<boolean>}
 */
export async function sendWebhookNotification(webhookUrl, embed) {
  if (!webhookUrl) return false;
  try {
    const payload = { embeds: [embed] };
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return res.ok;
  } catch (err) {
    console.error('[Discord Service] Webhook notification failed:', err.message);
    return false;
  }
}

/**
 * Sends a screening question to a Discord channel using Q&A bot token.
 * Renders interactive buttons for choice questions.
 * @param {string} botToken Discord Bot Token
 * @param {string} channelId Discord Channel ID
 * @param {string} interactionId QAInteraction ID
 * @param {object} job { title, company, url }
 * @param {string} question The screening question text
 * @param {string[]} options Choice options (if any)
 * @returns {Promise<string|null>} Message ID if successful
 */
export async function sendDiscordQuestion(botToken, channelId, interactionId, job, question, options = []) {
  if (!botToken || !channelId) {
    console.warn('[Discord Service] Bot Token or Channel ID missing. Cannot send Q&A.');
    return null;
  }

  const url = `https://discord.com/api/v10/channels/${channelId}/messages`;
  
  // Format options as buttons (max 5 buttons per action row)
  const components = [];
  
  // If options are provided, render them as buttons
  if (options && options.length > 0 && options.length <= 5) {
    const buttons = options.map((opt, idx) => ({
      type: 2, // BUTTON
      style: idx === 0 ? 1 : 2, // PRIMARY for first, SECONDARY for rest
      label: opt.slice(0, 80), // limit label size
      custom_id: `qa_btn:${interactionId}:${opt}`
    }));
    
    components.push({
      type: 1, // ACTION_ROW
      components: buttons
    });
  } else {
    // Render a default help notice button
    components.push({
      type: 1, // ACTION_ROW
      components: [
        {
          type: 2,
          style: 2, // SECONDARY
          label: "Reply to this message with text",
          custom_id: `qa_text:${interactionId}`,
          disabled: true
        }
      ]
    });
  }

  const embed = {
    title: '❓ Screening Question Blocked',
    description: `The automachine needs your input to complete an application.`,
    color: 0xf59e0b, // Amber color
    fields: [
      { name: 'Job Title', value: job.title || 'N/A', inline: true },
      { name: 'Company', value: job.company || 'N/A', inline: true },
      { name: 'Question', value: question, inline: false }
    ],
    footer: { text: `Stealth Job Automachine • ID: ${interactionId}` },
    timestamp: new Date().toISOString()
  };

  if (job.url) {
    embed.url = job.url;
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bot ${botToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        embeds: [embed],
        components: components
      })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(`Discord API error: ${data.message || res.statusText}`);
    }

    return data.id; // Returns message ID
  } catch (err) {
    console.error('[Discord Service] Failed to send question to Discord:', err.message);
    return null;
  }
}
