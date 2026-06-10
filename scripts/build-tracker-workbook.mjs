import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SpreadsheetFile, Workbook } from '@oai/artifact-tool';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const outputDir = path.join(rootDir, 'outputs');
const outputPath = path.join(outputDir, 'Naukri_Application_Tracker.xlsx');
const previewDir = path.join(outputDir, 'previews');

const statuses = [
  'Not Applied',
  'Shortlisted',
  'Resume Tailored',
  'Applied',
  'Rejected',
  'Interview',
  'Offer',
  'Not Relevant'
];

const resumeStatuses = [
  'Needs Resume',
  'Tailoring Needed',
  'Tailored',
  'Uploaded',
  'Not Needed'
];

function styleTitle(range) {
  range.format.fill.color = '#111827';
  range.format.font.color = '#FFFFFF';
  range.format.font.bold = true;
  range.format.font.size = 18;
  range.format.rowHeightPx = 42;
}

function styleHeader(range) {
  range.format.fill.color = '#0F766E';
  range.format.font.color = '#FFFFFF';
  range.format.font.bold = true;
  range.format.wrapText = true;
  range.format.rowHeightPx = 32;
}

function setColWidths(sheet, widths) {
  widths.forEach((width, index) => {
    sheet.getRangeByIndexes(0, index, 1, 1).format.columnWidthPx = width;
  });
}

const workbook = Workbook.create();

const dashboard = workbook.worksheets.add('Dashboard');
const tracker = workbook.worksheets.add('Job Tracker');
const resumes = workbook.worksheets.add('Resume Queue');
const options = workbook.worksheets.add('Options');

for (const sheet of [dashboard, tracker, resumes, options]) {
  sheet.showGridLines = false;
}

dashboard.getRange('A1:H1').merge();
dashboard.getRange('A1').values = [['Naukri Application Dashboard']];
styleTitle(dashboard.getRange('A1:H1'));

dashboard.getRange('A3:B8').values = [
  ['Metric', 'Value'],
  ['Total Jobs', '=COUNTA(\'Job Tracker\'!A5:A204)'],
  ['Not Applied', '=COUNTIF(\'Job Tracker\'!B5:B204,"Not Applied")'],
  ['Resume Tailored', '=COUNTIF(\'Job Tracker\'!B5:B204,"Resume Tailored")'],
  ['Applied', '=COUNTIF(\'Job Tracker\'!B5:B204,"Applied")'],
  ['Interview', '=COUNTIF(\'Job Tracker\'!B5:B204,"Interview")']
];
styleHeader(dashboard.getRange('A3:B3'));
dashboard.getRange('A4:A8').format.font.bold = true;
dashboard.getRange('B4:B8').format.font.bold = true;
dashboard.getRange('B4:B8').format.font.size = 14;

dashboard.getRange('D3:H3').merge();
dashboard.getRange('D3').values = [['Workflow']];
styleHeader(dashboard.getRange('D3:H3'));
dashboard.getRange('D4:H10').values = [
  ['1. Automation finds relevant jobs and gives each job a serial number.', null, null, null, null],
  ['2. You review status in Job Tracker: Not Applied, Shortlisted, Applied, etc.', null, null, null, null],
  ['3. Drop your base resume in the resume folder.', null, null, null, null],
  ['4. For strong matches, tailored resumes go into job-resumes/JOB-0001 folders.', null, null, null, null],
  ['5. If you apply manually, mark status as Applied.', null, null, null, null],
  ['6. If automation applies later after approval, it will mark Applied automatically.', null, null, null, null],
  ['', null, null, null, null]
];
dashboard.getRange('D4:H10').format.wrapText = true;
dashboard.getRange('D4:H10').format.fill.color = '#F8FAFC';
setColWidths(dashboard, [170, 110, 30, 210, 150, 150, 150, 150]);

tracker.getRange('A1:S1').merge();
tracker.getRange('A1').values = [['Job Application Tracker']];
styleTitle(tracker.getRange('A1:S1'));
tracker.getRange('A3:S3').merge();
tracker.getRange('A3').values = [['Use this sheet for daily tracking. Automation updates CSV/JSON reports; this workbook is your working tracker template.']];
tracker.getRange('A3:S3').format.fill.color = '#ECFDF5';
tracker.getRange('A3:S3').format.font.color = '#065F46';
tracker.getRange('A3:S3').format.wrapText = true;

const trackerHeaders = [
  'Serial No',
  'Status',
  'Applied By',
  'Applied Date',
  'Resume Status',
  'Resume File',
  'Match Decision',
  'Score',
  'Job Title',
  'Company',
  'Location',
  'Experience',
  'Salary',
  'Job URL',
  'Resume Folder',
  'Search Keyword',
  'Captured Date',
  'Last Seen',
  'Notes'
];
tracker.getRange('A4:S4').values = [trackerHeaders];
styleHeader(tracker.getRange('A4:S4'));
tracker.getRange('A5:S204').format.wrapText = true;
tracker.getRange('B5:B204').dataValidation = { rule: { type: 'list', values: statuses } };
tracker.getRange('E5:E204').dataValidation = { rule: { type: 'list', values: resumeStatuses } };
tracker.tables.add('A4:S204', true, 'ApplicationTracker');
tracker.freezePanes.freezeRows(4);
setColWidths(tracker, [90, 130, 110, 115, 140, 190, 130, 70, 240, 170, 140, 110, 120, 260, 260, 140, 135, 135, 240]);

tracker.getRange('B5:B204').conditionalFormats.add('containsText', {
  text: 'Applied',
  format: { fill: { color: '#DCFCE7' }, font: { color: '#166534', bold: true } }
});
tracker.getRange('B5:B204').conditionalFormats.add('containsText', {
  text: 'Not Applied',
  format: { fill: { color: '#FEF3C7' }, font: { color: '#92400E' } }
});
tracker.getRange('B5:B204').conditionalFormats.add('containsText', {
  text: 'Rejected',
  format: { fill: { color: '#FEE2E2' }, font: { color: '#991B1B' } }
});
tracker.getRange('H5:H204').conditionalFormats.add('cellIs', {
  operator: 'greaterThanOrEqual',
  formula: 4,
  format: { fill: { color: '#DBEAFE' }, font: { color: '#1D4ED8', bold: true } }
});

resumes.getRange('A1:I1').merge();
resumes.getRange('A1').values = [['Resume Tailoring Queue']];
styleTitle(resumes.getRange('A1:I1'));
resumes.getRange('A3:I3').merge();
resumes.getRange('A3').values = [['When you drop your base resume, use this sheet to decide which roles need a tailored version. Tailored files should be saved inside job-resumes using the job serial number.']];
resumes.getRange('A3:I3').format.fill.color = '#EFF6FF';
resumes.getRange('A3:I3').format.font.color = '#1D4ED8';
resumes.getRange('A3:I3').format.wrapText = true;

resumes.getRange('A4:I4').values = [[
  'Serial No',
  'Company',
  'Role',
  'Match Level',
  'JD Keywords',
  'Resume Changes Needed',
  'Tailored Resume Path',
  'Owner',
  'Done'
]];
styleHeader(resumes.getRange('A4:I4'));
resumes.getRange('A5:I104').format.wrapText = true;
resumes.getRange('I5:I104').dataValidation = { rule: { type: 'list', values: ['No', 'Yes'] } };
resumes.tables.add('A4:I104', true, 'ResumeQueue');
resumes.freezePanes.freezeRows(4);
setColWidths(resumes, [95, 170, 230, 120, 260, 280, 300, 120, 80]);

options.getRange('A1:D1').merge();
options.getRange('A1').values = [['Tracker Options']];
styleTitle(options.getRange('A1:D1'));
options.getRange('A3:A10').values = statuses.map((status) => [status]);
options.getRange('C3:C7').values = resumeStatuses.map((status) => [status]);
options.getRange('A2').values = [['Application Status']];
options.getRange('C2').values = [['Resume Status']];
styleHeader(options.getRange('A2:A2'));
styleHeader(options.getRange('C2:C2'));
setColWidths(options, [180, 40, 180, 40]);

await fs.mkdir(outputDir, { recursive: true });
await fs.mkdir(previewDir, { recursive: true });

const dashboardPreview = await workbook.render({ sheetName: 'Dashboard', range: 'A1:H12', scale: 1, format: 'png' });
await fs.writeFile(path.join(previewDir, 'dashboard.png'), new Uint8Array(await dashboardPreview.arrayBuffer()));

const trackerPreview = await workbook.render({ sheetName: 'Job Tracker', range: 'A1:S12', scale: 1, format: 'png' });
await fs.writeFile(path.join(previewDir, 'job-tracker.png'), new Uint8Array(await trackerPreview.arrayBuffer()));

const resumePreview = await workbook.render({ sheetName: 'Resume Queue', range: 'A1:I12', scale: 1, format: 'png' });
await fs.writeFile(path.join(previewDir, 'resume-queue.png'), new Uint8Array(await resumePreview.arrayBuffer()));

const optionsPreview = await workbook.render({ sheetName: 'Options', range: 'A1:D12', scale: 1, format: 'png' });
await fs.writeFile(path.join(previewDir, 'options.png'), new Uint8Array(await optionsPreview.arrayBuffer()));

const dashboardCheck = await workbook.inspect({
  kind: 'table',
  range: 'Dashboard!A1:H12',
  include: 'values,formulas',
  tableMaxRows: 12,
  tableMaxCols: 8
});

console.log(dashboardCheck.ndjson);

const errors = await workbook.inspect({
  kind: 'match',
  searchTerm: '#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A',
  options: { useRegex: true, maxResults: 100 },
  summary: 'formula error scan'
});

console.log(errors.ndjson);

const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputPath);

console.log(outputPath);
