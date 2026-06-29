// src/api/pending-questions.js
import fs from 'fs';
import path from 'path';

const filePath = path.join(process.cwd(), 'reports', 'pending-questions.json');

function load() {
  if (!fs.existsSync(filePath)) return [];
  const raw = fs.readFileSync(filePath, 'utf8');
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export async function GET() {
  const data = load();
  return new Response(JSON.stringify({ pending: data }), {
    headers: { 'Content-Type': 'application/json' },
    status: 200,
  });
}
