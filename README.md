# Sleep Doctor (Next.js)

Minimal Next.js scaffold created by assistant.

How to run

Firebase deployment

This project includes a minimal Firebase Hosting + Cloud Function setup to serve the Next.js app. The included files are:

- `firebase.json` - hosting config that rewrites requests to `nextServer` function
- `.firebaserc` - placeholder for your Firebase project id (replace `your-firebase-project-id`)
- `functions/` - contains a minimal Cloud Function that prepares and serves Next.js

Quick deploy steps (manual steps required):

1. Install the Firebase CLI and log in:

```bash
npm install -g firebase-tools
firebase login
```

2. Set your Firebase project id in `.firebaserc` (or run `firebase use --add` to select a project).

3. Install function dependencies and build the app:

```bash
npm run functions:install
npm run build
```

4. Optionally set the Sheets webhook URL as an environment variable for cloud functions (see note below).

5. Deploy:

```bash
npm run firebase:deploy
```

## Quick deploy summary (added)

Short commands to deploy from project root:

```bash
# install deps
npm install && cd functions && npm install
# build next
cd .. && npm run build
# deploy to firebase (functions + hosting)
firebase deploy --only functions,hosting
# or run npm script
npm run firebase:deploy
```

If your `.firebaserc` isn't set to the correct project you can add it interactively:

```bash
firebase use --add
```

If you'd like me to run the deploy now, reply "deploy now" and I'll attempt to run `firebase deploy` in this workspace and report the CLI output.
````markdown

Notes & caveats
- Serving Next.js via Firebase Functions works but may need tuning for production (cold starts, function timeout). For static-only apps consider `next export` and serve the `out/` folder as static hosting.
- Environment variables used by this app (e.g., `SHEETS_WEBHOOK_URL`) can be set for Cloud Functions using `firebase functions:config:set sheets.webhook_url="https://..."` and accessed server-side via `functions.config().sheets.webhook_url`. The current `pages/api/submit.js` reads `process.env.SHEETS_WEBHOOK_URL` so you'd need to inject env vars appropriately for your hosting environment.

1. Install dependencies (if you haven't):

   npm install

2. Run dev server:

   npm run dev

Files

- `pages/` - Next.js pages
- `styles/` - global styles

Persistence & API

- Answers are persisted to `localStorage` under the key `sleep_doctor_answers_v1` as an object mapping question id -> { index, answeredAt }.
- Each answer is also POSTed to a local endpoint at `POST /api/submit` (development-only). You can inspect submissions via `GET /api/submit` while the dev server is running.

Behavior

- Click an option to select it. The UI briefly animates and advances to the next question automatically (no Back/Next buttons).
- At the end you'll see a Summary page showing your selected answers and the timestamp for each answer. Use Restart on the summary to clear saved answers.

Forwarding to Google Sheets (optional)

If you want submissions to be saved to a Google Sheet you can create a Google Apps Script web app that accepts a POST and appends rows to a sheet. Deploy the Apps Script as a Web App and copy the deploy URL.

Then set the environment variable `SHEETS_WEBHOOK_URL` when running Next.js, for example on macOS/zsh:

```bash
export SHEETS_WEBHOOK_URL="https://script.google.com/macros/s/....../exec"
npm run dev
```

When `SHEETS_WEBHOOK_URL` is set, the local API at `/api/submit` will forward batched submissions to that URL. The webhook receives JSON in the format:

```json
{ "answers": [ { "question": "...", "answer": "...", "timestamp": "...", "user_id": "..." }, ... ] }
```

Note: The included `/api/submit` implementation stores submissions in memory (dev). If you need server-side persistence, replace or extend that API to write to your database or external service.

Google Apps Script example

You can use the included example Apps Script at `scripts/google_apps_script.gs`. Steps to deploy:

1. Open Google Drive and create a new Google Spreadsheet.
2. In the spreadsheet, open Extensions → Apps Script.
3. Replace the default code with the contents of `scripts/google_apps_script.gs` (or copy/paste).
4. Update `SHEET_NAME` in the script if needed.
5. Save and Deploy → New deployment → Select "Web app".
   - Execute as: Me
   - Who has access: Anyone
6. Deploy and copy the Web App URL.
7. Start your Next.js app with the webhook URL set:

```bash
export SHEETS_WEBHOOK_URL="https://script.google.com/macros/s/....../exec"
npm run dev
```

The Apps Script will append each answer row to the specified sheet tab when it receives a POST containing { answers: [ ... ] }.

Questions sheet guidelines

If you want the app to load questions from a Google Sheet (via the Apps Script `doGet` handler), create a sheet tab named `Questions` and follow these guidelines:

- Header row: include at least these columns (case-insensitive):
   - `id` (optional integer) — unique id per question; if missing the script will assign sequential ids starting at 1
   - `category` (optional) — category or group label
   - `question` (required) — the question text shown to the user
   - `option1`, `option2`, ... `optionN` — option columns (the script collects any headers starting with `option` and uses their values as the options array)

- Example header and row:

   | id | category | question | option1 | option2 | option3 | option4 | option5 |
   |----|----------|----------|---------|---------|---------|---------|---------|
   | 1  | Sleep Environment | How often does being too warm disrupt your sleep? | Never | Occasionally | Sometimes | Often | Always |

- Notes:
   - The Apps Script normalizes headers (lowercase) and reads all columns starting with `option` to build the options array, so you can have any number of options.
   - If you omit `id` the script will use the row order to assign ids (1..N). If you re-order rows, consider updating `id` if you want stable ids.
   - Empty option cells are ignored.




