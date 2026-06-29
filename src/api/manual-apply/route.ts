import fs from 'fs';
import path from 'path';

const filePath = path.join(process.cwd(), 'reports', 'manual-apply.json');

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
  return new Response(JSON.stringify({ manual: data }), {
    headers: { 'Content-Type': 'application/json' },
    status: 200,
  });
}

export async function POST(req) {
  try {
    const body = await req.json();
    const { entry } = body; // expecting an object with capturedAt, title, company, url
    const existing = load();
    existing.push(entry);
    fs.writeFileSync(filePath, JSON.stringify(existing, null, 2));
    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Failed to write manual apply' }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500,
    });
  }
}
