# Naukri Profile Automation

## Purpose

This automation opens Naukri in a real browser, refreshes your profile/resume, and creates a relevant job list every run.

## What You Need

| Item | Required | Where |
| --- | --- | --- |
| Naukri login | Yes | Browser window opened by the script |
| Resume PDF/DOCX | Yes | Put it in `D:\Naukari automachine\resume` |
| Profile details | Yes | Edit `config.json` |
| Job keywords | Yes | Edit `config.json` |
| Credentials | Optional | Local `.env` file only |

## Setup

1. Create this folder if it does not exist:

   `D:\Naukari automachine\resume`

2. Put your resume file there.

3. Edit `config.json` and replace:

   `D:\Naukari automachine\resume\Your_Resume.pdf`

   with your real resume file path.

4. Run:

   `.\run.ps1`

5. Log in to Naukri manually the first time. The browser profile is saved in `browser-profile`, so future runs can reuse the session.

## Optional Credential Setup

Do not share your password in chat. If you want the script to attempt login automatically, create a local `.env` file:

```text
NAUKRI_EMAIL=your-email@example.com
NAUKRI_PASSWORD=your-password-here
```

If Naukri asks for OTP, CAPTCHA, or extra verification, complete it manually in the opened browser.

## Output

| File | Purpose |
| --- | --- |
| `reports\jobs-latest.json` | Latest matched jobs |
| `reports\jobs-latest.csv` | Spreadsheet-friendly job list |
| `reports\application-tracker.csv` | Job list with status, serial number, applied state, and resume folder |
| `reports\application-tracker.json` | Machine-readable application tracker used to keep job IDs stable |
| `reports\run-log.json` | Last automation actions and warnings |
| `outputs\Naukri_Application_Tracker.xlsx` | Excel tracker template for review and manual updates |
| `job-resumes\JOB-0001 - Company - Role` | Per-job folder for tailored resume files |

## Automation Behavior

- Opens Naukri using a persistent browser session.
- Uploads the configured resume when `uploadEveryRun` is `true`.
- Attempts light profile refresh actions.
- Searches configured job roles and locations.
- Scores jobs using your include/exclude keywords.
- Saves only relevant listings.
- Gives each relevant job a serial number.
- Creates a status tracker with `Not Applied`, `Applied`, `Interview`, and other stages.
- Creates per-job resume folders when enabled.

## Applying Workflow

Direct auto-apply is disabled by default in `config.json`:

```json
"directApply": false
```

This is intentional. The safer workflow is:

1. Automation finds relevant jobs.
2. You review `outputs\Naukri_Application_Tracker.xlsx`.
3. Drop your base resume into `resume`.
4. For a strong matching role, a tailored resume can be created and saved inside that job's serial-number folder.
5. If you apply manually, mark the job as `Applied`.
6. If we later enable automation-assisted apply, the script should mark `Applied By` as `Automation`.

## Important Note

Naukri can change page layouts or ask for OTP/CAPTCHA. This script will not bypass those. If login verification appears, complete it manually in the opened browser.
