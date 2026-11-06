# Classroom Survey

A classroom survey web app. The instructor builds a survey, activates it, and projects a QR code. Students scan it, answer on their phones without logging in, and the instructor sees counts, percentages, and charts, and can export a CSV.

- **Frontend:** React 19 + TypeScript + Vite + Tailwind CSS, React Router, Recharts, `qrcode`
- **Backend/DB:** Supabase (PostgreSQL + Auth + auto-generated REST API), secured with Row Level Security
- **Hosting:** Cloudflare Pages (static site); the database stays on Supabase

Specs: [Classroom_Survey_Web_App_Specification.md](Classroom_Survey_Web_App_Specification.md), [DATABASE.md](DATABASE.md), [API.md](API.md), [UI.md](UI.md), [TODO.md](TODO.md).

## Architecture

```text
Browser (React SPA on Cloudflare Pages)
   |  supabase-js over HTTPS, with the public anon key
   v
Supabase
   ├── Auth        instructor email/password login -> JWT
   ├── PostgREST   table reads/writes + RPC calls, checked by RLS
   └── PostgreSQL  surveys -> questions -> choices
                   surveys -> responses -> answers (-> questions, choices)
```

There is no custom server. The browser talks straight to Supabase. Security comes from Postgres itself:

| Who | Can do | Enforced by |
| --- | --- | --- |
| Student (`anon` role) | read the **active** survey and its questions/choices | RLS `select` policies |
| Student | submit one response | `submit_survey_response` RPC (security definer): checks the survey is active, every question belongs to it, every choice belongs to its question, every question is answered, no duplicate token; inserts the response and answers in one transaction |
| Student | read responses/answers, modify anything | **nothing** - no anon policies exist, so RLS denies it |
| Instructor (`authenticated` role) | everything | RLS `for all` policies + `save_survey`, `activate_survey`, `close_survey` RPCs |

Data flow examples:

- **Create/edit:** editor -> `rpc('save_survey')` -> one transaction writes the `surveys` row and replaces its `questions` + `choices`.
- **Activate:** `rpc('activate_survey')` closes any other active survey, generates a random `public_slug`, and sets status `active`. A partial unique index (`only_one_active_survey`) makes two active surveys impossible.
- **Student:** `/s/:slug` -> `select surveys(*, questions(*, choices(*)))` (RLS hides it unless active) -> `rpc('submit_survey_response')`.
- **Results:** `select responses(id, submitted_at, answers(question_id, choice_id))`, counted in the browser (`src/lib/results.ts`), drawn with Recharts, exported to CSV.

## Project layout

```text
src/
  lib/supabase.ts    Supabase client (reads env vars)
  lib/auth.tsx       AuthProvider + RequireAuth (protected routes)
  lib/api.ts         every database call + friendly error messages
  lib/results.ts     types, result aggregation, CSV generation (pure, unit-tested)
  components/ui.tsx  header shell, status badge
  pages/             Login, Dashboard, Editor, Present, Results, StudentSurvey
supabase/
  migrations/20261105000000_init.sql   tables, indexes, RLS, RPCs
  seed.sql                             demo survey for local dev
tests/
  db.test.mjs        runs the migration in PGlite and tests RLS + RPCs as anon/authenticated
  results.test.ts    result percentages and CSV escaping
public/_redirects    SPA fallback for Cloudflare Pages
```

## Setup

### 1. Supabase project

1. Create a free project at <https://supabase.com>.
2. **SQL Editor** -> paste all of `supabase/migrations/20261105000000_init.sql` -> Run.
   (Or with the CLI: `npx supabase link --project-ref <ref>` then `npx supabase db push`.)
3. **Authentication -> Sign In / Providers -> Email:** turn **off** "Allow new users to sign up".
   This matters: every logged-in user is treated as an instructor, so nobody should be able to self-register with the public key.
4. **Authentication -> Users -> Add user -> Create new user:** enter the instructor email and password, tick "Auto Confirm User".
5. **Project Settings -> API Keys:** copy the Project URL and the `anon` / publishable key. Never use the `service_role` / secret key in the frontend.

### 2. Run locally

```bash
npm install
```

```bash
cp .env.example .env.local
```

Fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `.env.local` (git-ignored), then:

```bash
npm run dev
```

Open <http://localhost:5173>, log in, create a survey, activate it. To try the student side on a phone on the same Wi-Fi, run `npm run dev -- --host` and scan the QR code.

### Optional: fully local Supabase (Docker)

```bash
npx supabase start
```

This applies the migration and `supabase/seed.sql` (instructor `instructor@example.com` / `password123`, local only). Put the printed API URL and anon key in `.env.local`.

### 3. Tests

```bash
npm test
```

`tests/db.test.mjs` loads the real migration into an in-process Postgres (PGlite), creates the same `anon`/`authenticated` roles Supabase uses, and checks: students can't insert/update/delete surveys or read responses; drafts and closed surveys are invisible to students; only one survey can be active; duplicate, incomplete, wrong-choice and closed-survey submissions are rejected; deleting a survey cascades.

## Deploy (Cloudflare Pages)

1. Push this repo to GitHub.
2. Cloudflare dashboard -> **Workers & Pages -> Create -> Pages -> Connect to Git** -> pick the repo.
3. Build settings: framework preset **React (Vite)**, build command `npm run build`, output directory `dist`.
4. **Environment variables (Production):** `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`. Vite bakes these into the bundle at build time, so redeploy after changing them.
5. Deploy. `public/_redirects` sends every path to `index.html`, so `/s/<slug>` and `/dashboard` work on refresh.
6. In Supabase **Authentication -> URL Configuration**, set the Site URL to the Pages URL.

QR codes use `window.location.origin`, so they automatically point at whichever host serves the app.

## Instructor test access

Credentials are never in the repo. For grading, create a separate instructor user in Supabase (step 1.4) and give the email/password to the grader privately (HuskyCT submission comment). Delete or rotate that user after grading.

## Design decisions not fixed by the spec

| Decision | Why |
| --- | --- |
| Only **draft** surveys can be edited. Active surveys must be closed first; closed/archived surveys stay read-only (use **Duplicate** to change one). | Editing questions after responses exist would corrupt or cascade-delete results. Drafts never have responses, so `save_survey` can safely replace questions in one transaction. |
| A closed survey can be **reopened** (Activate again). It keeps its slug and its responses. | Lets an instructor resume a survey closed by mistake. Archived surveys can't be reopened. |
| Every question is required. | Spec lists `MISSING_REQUIRED_ANSWER`; makes percentages comparable across questions. |
| Slug = 10 random hex characters, generated on first activation. | Unique, non-sequential, hard to guess, short enough to type from the projector. |
| Duplicate protection = random token in `localStorage` + unique index on `(survey_id, anonymous_token)`. | Stops accidental double submits and refreshes. A student using a private window or another device can submit again; preventing that needs student login, which the spec excludes. |
| `survey_status_by_slug` RPC. | RLS hides closed surveys from students; this lets the page say "no longer accepting responses" instead of "not found" without exposing survey contents. |
| Results aggregated in the browser. | One query feeds both the charts and the CSV. Fine for classroom sizes (up to PostgREST's 1000-row default). |
| Present page polls the response count every 3 seconds. | Simpler than Realtime (listed as post-MVP in TODO.md). |
| CSV: one row per response, question text as headers, every cell quoted, cells starting with `= + - @` prefixed with `'`, UTF-8 BOM. | Opens correctly in Excel/Sheets and blocks formula injection from choice text. |
| Confirmations use the browser's native `confirm()`. | Accessible and keyboard-friendly; the UI spec asks to avoid excessive modals. |
| Any authenticated user is an instructor; public sign-ups are disabled. | Spec allows this for a single-instructor deployment. |

## Submission docs

- [docs/DEVELOPMENT_SUMMARY.md](docs/DEVELOPMENT_SUMMARY.md) - development report
- [docs/AI_HISTORY.md](docs/AI_HISTORY.md) - summary of the AI agent session, including the test log
- `docs/screenshots/` - Supabase table/data screenshots and the results page
