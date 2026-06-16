# Product Requirement Document (PRD)
## Project Name: Stealth Job Automachine

---

## 1. Product Overview & Vision
The **Stealth Job Automachine** is an AI-driven, hybrid-cloud job application agent designed to run silently in the background of a user's computer while allowing safe, remote monitoring and interactive questionnaire inputs from a mobile device or office computer. 

The core goal is to enable job hunters to apply to hundreds of relevant positions securely without interrupting their workplace routines or triggering visual browser windows on their work monitors.

---

## 2. Key Target Audience & Use Cases
* **Target Audience**: Employed professionals actively seeking new opportunities while at their current workplace.
* **Primary Use Case**: 
  * The user leaves the automation bot running on their home laptop/PC.
  * The bot runs in a completely hidden (headless) browser mode.
  * When a job application requires screening questions that the AI cannot answer, the bot sends an interactive message to a private Discord channel on the user's phone.
  * The user answers the question with a single tap (buttons) or text response on their phone.
  * The bot completes the application instantly.

---

## 3. System Architecture
The application uses a **hybrid cloud model**:

1. **Automation Engine (Local PC)**: A headless Playwright-based script that handles Naukri session cookies, scans new job postings, and fills out applications. Runs locally to utilize the user's residential IP (to bypass Cloudflare blocklists).
2. **Database (Supabase)**: Cloud-hosted PostgreSQL instance holding job tracking, run records, settings parameters, and Q&A history.
3. **Web Interface (Vercel)**: Next.js Dashboard that reads/writes to Supabase, letting the user view statistics, upload resumes, and configure settings.
4. **Interactive Channel (Discord)**: Real-time messaging endpoint for system status embeds and question-answering bridges.

---

## 4. Functional Requirements

### 4.1. Three-Way Application Router
The automation script must handle Naukri applications using a three-way logic branch:
* **Direct Easy Apply**: Auto-submits the application. Updates DB status to `Applied`.
* **External Portal Redirect**: If clicking apply redirects to a company portal, the script stops, logs the details, and flags the database status as `Manual Apply Needed`.
* **Screening Questionnaire (Q&A)**:
  1. The bot attempts to answer screening questions using the user's resume profile and historical Q&A database.
  2. If the answer cannot be determined, the bot dispatches a message to the Discord Q&A Channel.
  3. The bot pauses application submission and waits for user feedback from Discord.
  4. **Timeout Fallback**: If no user response is received within **10 minutes**, the application is skipped, the job status is set to `Manual Review (Q&A Timeout)`, the browser tab is closed, and the bot proceeds to the next job in the queue to maintain stability.
  5. Once feedback is received (within the timeout), it inputs the answer, submits the application, and caches the Q&A pair.

### 4.2. Dual Discord Bot System
* **Notification Bot**: Dispatches embeds at the beginning of a run (*"Bot Run Started"*), end of a run (*"Bot Run Completed" with metrics*), and upon encountering critical blocker errors (*"⚠️ Action Required: Naukri captcha/verification request detected"*).
* **Interactive Q&A Bot**: Wakes up when a screening question is blocked.
  * For standard boolean or notice-period questions, it generates interactive buttons (e.g. `Yes` | `No`, `30 Days` | `Immediate`).
  * For free-text questions, it accepts message replies.

### 4.3. Next.js Settings Dashboard
The web panel hosted on Vercel must support:
* **Dashboard Protection (Authentication)**: Secure authentication module (either via a single-password gate configured in `.env` or fully-fledged Supabase Auth) preventing unauthorized access to the dashboard.
* **Resume Upload**: File uploader for the master PDF resume. Uploads files directly to Supabase Storage, which is subsequently retrieved by the local Playwright runner before executing Naukri uploads.
* **Credentials Configuration**: Inputs to edit Naukri email and password.
* **Search Targets**: Key-value pairs and tag selectors for location tags and role titles.
* **AI Auto-Fix Roles**: A feature that parses the uploaded resume using Gemini API and suggests the best keywords and location options to optimize the search query.
* **Q&A Memory Editor**: A dedicated UI panel allowing the user to view, edit, or delete previously cached screening question-and-answer pairs to fix incorrect responses or update info.
* **Dynamic Experience Calculator**: Instead of saving a static years-of-experience number, the profile settings will store a **Career Start Date**. On every run, the runner will calculate the exact years and months of experience relative to the current date (e.g., auto-incrementing month-by-month).
* **Custom Profile Fields (Manual Fields)**: A UI section where users can add arbitrary manual key-value pairs (e.g., `Expected CTC: 10 LPA`, `Relocation: Yes`, `GitHub: https://github.com/username`). 
* **Full AI Data Access**: The AI evaluation engine (Gemini) and Playwright crawler are equipped with direct access to the entire profile database (master details, resume text, calculated experience, custom fields, and Q&A history) to dynamically fetch context and auto-fill questions.
* **Discord Integration Settings**: Fields in the web panel to edit and save your **Discord Notification Webhook** and **Discord Q&A Bot Token** directly, saving them securely to the database so you can modify channels without altering local `.env` files.
* **Background Run Scheduler**: A user-friendly settings section allowing the user to toggle background runs ON/OFF and select a running frequency interval (e.g., Every 30 Minutes, Every 1 Hour, Every 2 Hours, etc.).


### 4.4. AI Resume Optimizer
* For any job categorized as `Manual Apply Needed`, the AI analyzes the scraped Job Description (JD) against the user's master resume.
* It generates a markdown checklist detailing exactly what keywords, skills, or projects to modify on the resume to match that specific role.
* **Database & UI Access**: This checklist is pushed directly to the `resumeChecklist` column in Supabase, enabling the user to read and copy these suggestions directly from their phone or work computer via the Vercel Web Dashboard. It is also saved as a local `README.md` file in the job's directory on the runner PC.

---

## 5. Security & Anti-Detection Requirements
* **Credential Encryption**: Naukri passwords must be encrypted before being stored in the cloud. The decryption key must reside only in the local runner's `.env` configuration.
* **Anti-Ban Throttling**: The Playwright browser must implement human-behavior emulation:
  * Randomized execution delays (10–45 seconds) between page transitions.
  * Mouse movement emulation and scrolling gestures.
  * Headless browser spoofing using stealth plugins to hide automated signatures.

---

## 6. Success Metrics & KPIs
* **Stealth Verification**: Zero browser windows opened on the local desk during runs.
* **Response Rate**: Q&A interactions completed within 1 minute of receiving phone alerts.
* **Interview Conversions**: Increased match rates for manual applications using the AI Resume Optimizer checklists.

---

## 7. User Flows

### 7.1. Flow 1: Manual Bot Trigger (From Web Dashboard)
1. **User Action**: The user logs into the Next.js Web Dashboard hosted on Vercel (e.g., on their phone or office computer).
2. **Trigger**: User clicks the **"Run Bot Now"** button.
3. **Database Write**: The dashboard inserts a trigger event (e.g., `{ status: 'queued', triggeredAt: timestamp }`) into the `BotRuns` table in Supabase.
4. **Local Runner Wakeup**: The local runner script (listening to Supabase changes via subscription/polling) detects the queued run.
5. **Headless Execution**: The local runner launches Playwright in headless mode. 
6. **Live Telemetry**: The runner updates the `BotRuns` status to `in-progress` and feeds live step updates (e.g., *"Searching UI UX roles..."*, *"Scraped 12 matches..."*) to Supabase, which renders instantly on the user's dashboard screen.
7. **Complete**: When done, status changes to `completed`, and a Discord notification summary is dispatched.

### 7.2. Flow 2: Scheduled Run
1. **Trigger**: The background daemon running on the local PC automatically triggers `node src/naukri-automation.js` based on the running interval (e.g., every 30 minutes, 1 hour, etc.) configured in the database settings.
2. **Headless Scraper**: Runs silently without visual indicators on the desktop.
3. **Report Upload**: Saves all scraped jobs directly to the cloud Supabase DB and posts a status embed on the Discord `#notifications` channel.


### 7.3. Flow 3: Interactive Q&A (From Phone via Discord)
1. **Question Detected**: The crawler stops on a Naukri Easy Apply question: *"Do you have a portfolio link?"*.
2. **Local Attempt**: The crawler searches the local decrypted profile for "portfolio" and fills the text.
3. **Ambiguity Halt**: The next question is *"How many years of experience do you have with Framer?"* (Not found in profile).
4. **Pause & Notify**: The crawler writes status `Pending Q&A` to the database and dispatches a message via the **Discord Q&A Agent** to the user:
   * Message: *"Framer Experience?"*
   * Buttons: `1 Year` | `2 Years` | `3+ Years` | `Custom Reply`
5. **User Response**: The user receives the notification on their phone at work, taps `2 Years`.
6. **Input & Submit**: The Discord bot receives the webhook payload, updates the question entry in Supabase, and signals the local script. The local script inputs `"2 Years"` into the input box, clicks submit, and caches the Q&A pair in the `QAHistory` table for future runs.
