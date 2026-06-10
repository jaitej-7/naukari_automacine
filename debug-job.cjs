const Database = require('better-sqlite3');
const db = new Database('database.sqlite');

const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
console.log(`\nDeleting jobs captured before: ${cutoff}`);

// Preview what will be deleted
const toDelete = db.prepare(`
  SELECT serialNumber, title, company, capturedAt, status 
  FROM Job 
  WHERE capturedAt < ? AND status NOT IN ('Applied', 'Manual Apply Needed')
`).all(cutoff);

console.log(`\n=== ${toDelete.length} JOBS TO BE DELETED ===`);
toDelete.forEach(j => console.log(`  ${j.serialNumber} | ${j.company} - ${j.title} | ${j.capturedAt?.substring(0,10)} | ${j.status}`));

// Delete them
const result = db.prepare(`
  DELETE FROM Job 
  WHERE capturedAt < ? AND status NOT IN ('Applied', 'Manual Apply Needed')
`).run(cutoff);

console.log(`\n✅ Deleted ${result.changes} old jobs.`);

// Show what's remaining
const remaining = db.prepare(`SELECT COUNT(*) as count FROM Job`).get();
const applied = db.prepare(`SELECT COUNT(*) as count FROM Job WHERE status = 'Applied'`).get();
console.log(`📊 Remaining in DB: ${remaining.count} jobs (${applied.count} applied records kept)`);

db.close();
