const Database = require('better-sqlite3');
const db = new Database('database.sqlite');

const newPath = 'd:\\Naukari automachine\\resume\\VENKUMAHANTHI_JAYA_TEJA_UIUX_DESIGNER (2).pdf';

const keySkills = [
  'UI/UX Design', 'Product Design', 'Figma', 'UX Research', 
  'Design Systems', 'Wireframing', 'Prototyping', 'User Flows'
];

db.prepare('UPDATE Configuration SET resumePath = ?, uploadEveryRun = 1, keySkills = ? WHERE id = 1')
  .run(newPath, JSON.stringify(keySkills));

console.log('✅ Configured new resume path and extracted key skills from resume!');
db.close();
