import { answerScreeningQuestion } from './gemini.js';
import { sendDiscordQuestion } from './discord.js';
import { prisma } from '../utils/db.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function handleQuestionnaire(page, config, log, jobRow) {
  const jobUrl = jobRow.url;
  await sleep(3000); // Wait for modal to render

  // --- Collect all answerable inputs in the modal/page ---
  // Includes text, number, textarea, select, radio groups, and checkboxes
  const textInputs = await page.locator(
    'input[type="text"]:visible, input[type="number"]:visible, textarea:visible, select:visible'
  ).all();

  // Find radio button groups (each group = one question)
  const radioGroups = await page.evaluate(() => {
    const inputs = Array.from(document.querySelectorAll('input[type="radio"]:not([disabled])'));
    const groups = {};
    for (const input of inputs) {
      const name = input.name || input.getAttribute('data-name') || 'unnamed';
      if (!groups[name]) groups[name] = [];
      const label = input.closest('label') || document.querySelector(`label[for="${input.id}"]`);
      const optionText = label ? label.innerText.trim() : input.value;
      groups[name].push({ name, value: input.value, label: optionText });
    }
    return Object.values(groups);
  });

  const hasAnything = textInputs.length > 0 || radioGroups.length > 0;
  if (!hasAnything) {
    log.warnings.push(`No success message and no questionnaire found for ${jobUrl}`);
    return false;
  }

  let allAnswered = true;

  // --- Handle text / select inputs ---
  for (const input of textInputs) {
    const placeholder = await input.getAttribute('placeholder').catch(() => '');
    if (placeholder && placeholder.toLowerCase().includes('search')) continue;
    
    const questionText = await input.evaluate((el) => {
      let parent = el.parentElement;
      while (parent && parent.innerText.trim().length < 5 && parent !== document.body) {
        parent = parent.parentElement;
      }
      return parent ? parent.innerText.trim().replace(/\n/g, ' ') : '';
    });

    if (!questionText.trim()) continue;
    // Skip global site headers / search bars
    if (questionText.toLowerCase().includes('search jobs here') || questionText.toLowerCase().includes('search jobs')) continue;

    console.log(`[Q&A Engine] Text/Select question: "${questionText}"`);

    let answered = false;
    let answerText = '';

    // Step 1: Cache
    for (const [key, val] of Object.entries(config.applications.qaMemory)) {
      if (questionText.toLowerCase().includes(key.toLowerCase())) {
        answerText = String(val);
        answered = true;
        console.log(`[Q&A Engine] Cache hit: "${answerText}" for key "${key}"`);
        break;
      }
    }

    // Step 2: Gemini
    if (!answered && process.env.GEMINI_API_KEY) {
      const tagName = await input.evaluate(el => el.tagName.toLowerCase());
      let options = [];
      if (tagName === 'select') {
        options = await input.locator('option').allInnerTexts();
        options = options.map(o => o.trim()).filter(o => o && !o.toLowerCase().includes('select'));
      }
      const aiResponse = await answerScreeningQuestion(questionText, options, config.profile);
      if (aiResponse.canAnswer && aiResponse.answer !== undefined) {
        answerText = String(aiResponse.answer);
        answered = true;
        console.log(`[Q&A Engine] Gemini: "${answerText}" (${aiResponse.reasoning})`);
      }
    }

    // Step 3: Discord fallback
    if (!answered) {
      const discordResult = await askViaDiscord(page, input, questionText, [], config, log, jobRow);
      if (discordResult === 'timeout') return 'timeout';
      if (discordResult !== null) { answerText = discordResult; answered = true; }
    }

    if (answered) {
      const tagName = await input.evaluate(el => el.tagName.toLowerCase());
      if (tagName === 'select') {
        const options = await input.locator('option').allInnerTexts();
        const match = options.find(o => o.toLowerCase().includes(answerText.toLowerCase()));
        if (match) await input.selectOption({ label: match });
        else await input.selectOption({ value: answerText });
      } else {
        await input.fill(answerText);
      }
      await sleep(800);
    } else {
      allAnswered = false;
      break;
    }
  }

  // --- Handle radio button groups ---
  for (const group of radioGroups) {
    if (!allAnswered) break;
    const questionText = group[0]?.label || group[0]?.name || 'Unknown question';
    const options = group.map(o => o.label);
    console.log(`[Q&A Engine] Radio question: "${questionText}" Options: [${options.join(', ')}]`);

    let answered = false;
    let answerText = '';

    // Step 1: Cache
    for (const [key, val] of Object.entries(config.applications.qaMemory)) {
      if (questionText.toLowerCase().includes(key.toLowerCase())) {
        answerText = String(val); answered = true;
        console.log(`[Q&A Engine] Cache hit for radio: "${answerText}"`);
        break;
      }
    }

    // Step 2: Gemini
    if (!answered && process.env.GEMINI_API_KEY) {
      const aiResponse = await answerScreeningQuestion(questionText, options, config.profile);
      if (aiResponse.canAnswer && aiResponse.answer !== undefined) {
        answerText = String(aiResponse.answer);
        answered = true;
        console.log(`[Q&A Engine] Gemini radio: "${answerText}"`);
      }
    }

    // Step 3: Discord fallback
    if (!answered) {
      const discordResult = await askViaDiscord(page, null, questionText, options, config, log, jobRow);
      if (discordResult === 'timeout') return 'timeout';
      if (discordResult !== null) { answerText = discordResult; answered = true; }
    }

    if (answered) {
      // Click the matching radio button
      const matchingOption = group.find(o =>
        o.label.toLowerCase().includes(answerText.toLowerCase()) ||
        o.value.toLowerCase().includes(answerText.toLowerCase())
      ) || group[0]; // fallback to first option
      
      await page.evaluate((opt) => {
        const radio = document.querySelector(`input[type="radio"][value="${opt.value}"][name="${opt.name}"]`);
        if (radio) radio.click();
      }, matchingOption);
      await sleep(800);
    } else {
      allAnswered = false;
    }
  }

  if (!allAnswered) {
    log.warnings.push(`Aborted application for ${jobUrl}. Questionnaire could not be completed.`);
    return false;
  }

  // All answered! Try to submit.
  const submitBtn = page.locator('button').filter({ hasText: /^Submit$|^Save$|^Apply$|^Save & Apply$/i }).first();
  if (await submitBtn.count() > 0) {
    await submitBtn.click();
    await sleep(4000);
    log.actions.push(`Successfully auto-applied (via Q&A engine) to ${jobUrl}`);
    return true;
  }

  log.warnings.push(`Filled Q&A for ${jobUrl} but couldn't find Submit button.`);
  return false;
}

export async function askViaDiscord(page, input, questionText, options, config, log, jobRow) {
  if (!config.discord?.botToken || !config.discord?.qaChannelId) {
    log.warnings.push(`Discord not configured. Cannot fallback for Q: "${questionText.substring(0, 50)}"`);
    return null;
  }

  if (input) {
    const tagName = await input.evaluate(el => el.tagName.toLowerCase());
    if (tagName === 'select' && options.length === 0) {
      options = await input.locator('option').allInnerTexts();
      options = options.map(o => o.trim()).filter(o => o && !o.toLowerCase().includes('select'));
    }
  }

  const qaRow = await prisma.qAInteraction.create({
    data: {
      jobId: jobRow.id,
      jobTitle: jobRow.title,
      company: jobRow.company,
      question: questionText,
      options: JSON.stringify(options),
      status: 'pending'
    }
  });

  const messageId = await sendDiscordQuestion(
    config.discord.botToken,
    config.discord.qaChannelId,
    qaRow.id,
    { title: jobRow.title, company: jobRow.company, url: jobRow.url },
    questionText,
    options
  );

  if (!messageId) {
    log.warnings.push(`Failed to send question to Discord. Aborting.`);
    return null;
  }

  await prisma.job.update({ where: { id: jobRow.id }, data: { status: 'Pending Q&A' } });
  console.log(`[Q&A Engine] Paused. Waiting up to 10 minutes for Discord response...`);

  const pollStart = Date.now();
  while (Date.now() - pollStart < 10 * 60 * 1000) {
    await sleep(3000);
    const interaction = await prisma.qAInteraction.findUnique({ where: { id: qaRow.id } });
    if (interaction?.status === 'answered') {
      const answer = interaction.answer;
      // Cache the answer
      try {
        const currentConfig = await prisma.configuration.findUnique({ where: { id: 1 } });
        const mem = JSON.parse(currentConfig?.qaMemory || '{}');
        const key = questionText.toLowerCase().replace(/[^a-z0-9 ]/g, '').substring(0, 50).trim();
        mem[key] = answer;
        await prisma.configuration.update({ where: { id: 1 }, data: { qaMemory: JSON.stringify(mem) } });
      } catch (err) { console.error('Caught error:', err.message); }
      console.log(`[Q&A Engine] Discord answer received: "${answer}"`);
      return answer;
    }
    if (interaction?.status === 'timeout') break;
  }

  await prisma.qAInteraction.update({ where: { id: qaRow.id }, data: { status: 'timeout' } });
  log.warnings.push(`Discord Q&A timeout for: "${questionText.substring(0, 50)}"`);
  return 'timeout';
}
