// src/api/jobs.js
import fs from 'fs';
import path from 'path';

/**
 * Helper to read a CSV file and return an array of objects.
 * Expects the first line to be a header row.
 */
function readCsv(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const content = fs.readFileSync(filePath, 'utf8').trim();
  if (!content) return [];
  const lines = content.split(/\r?\n/);
  const headers = lines[0].split(',').map(h => h.replace(/^"|"$/g, '').trim());
  return lines.slice(1).map(line => {
    const values = line.split(',').map(v => v.replace(/^"|"$/g, '').trim());
    const obj = {};
    headers.forEach((h, i) => (obj[h] = values[i] || ''));
    return obj;
  });
}

export async function GET(req) {
  const url = new URL(req.url);
  const type = url.searchParams.get('type') || 'all';

  // Base jobs are still in reports/jobs-latest.csv (capturedAt etc.)
  const latestPath = path.join(process.cwd(), 'reports', 'jobs-latest.csv');
  const appliedPath = path.join(process.cwd(), 'reports', 'applied-jobs.csv');
  const internshipsPath = path.join(process.cwd(), 'reports', 'internships.csv');

  const allJobs = readCsv(latestPath);
  const appliedJobs = readCsv(appliedPath);
  const internshipJobs = readCsv(internshipsPath);

  // Merge timestamps where applicable
  const appliedMap = new Map(appliedJobs.map(j => [j.url, j]));
  const internshipMap = new Map(internshipJobs.map(j => [j.url, j]));

  const enriched = allJobs.map(job => {
    const res = { ...job };
    if (appliedMap.has(job.url)) {
      const a = appliedMap.get(job.url);
      res.appliedAt = a.appliedAt;
    }
    if (internshipMap.has(job.url)) {
      res.isInternship = true;
      res.internshipRecordedAt = internshipMap.get(job.url).capturedAt;
    }
    return res;
  });

  let payload;
  switch (type) {
    case 'applied':
      payload = enriched.filter(j => j.appliedAt);
      break;
    case 'internships':
      payload = enriched.filter(j => j.isInternship);
      break;
    case 'manual':
      // Jobs with no auto-apply (external flag) are those without appliedAt and not internship
      payload = enriched.filter(j => !j.appliedAt && !j.isInternship);
      break;
    case 'all':
    default:
      payload = enriched;
  }

  return new Response(JSON.stringify({ jobs: payload }), {
    headers: { 'Content-Type': 'application/json' },
    status: 200,
  });
}
