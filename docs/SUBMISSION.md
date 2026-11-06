# CSE 4095 - Classroom Survey Web App: Submission

| Deliverable | Where |
| --- | --- |
| **A. GitHub repository** | https://github.com/george3281/classroom-survey |
| **B. Deployed application** | https://classroom-survey.onrender.com/ |
| B. Instructor test access | Login given privately in the HuskyCT submission comment (not stored in the repo) |
| **C. Development summary** | [DEVELOPMENT_SUMMARY.md](DEVELOPMENT_SUMMARY.md) / `DEVELOPMENT_SUMMARY.pdf` |
| **D. AI development history** | [AI_HISTORY.md](AI_HISTORY.md) / `AI_HISTORY.pdf` |
| **E. Database evidence** | [screenshots/](screenshots/) (listed below) |

## Repository contents (required by A)

- Application source code: `src/`
- Provided specs: `Classroom_Survey_Web_App_Specification.md`, `DATABASE.md`, `API.md`, `UI.md`, `TODO.md`
- Updated `TODO.md` with completed tasks checked
- Database migration: `supabase/migrations/20261105000000_init.sql`
- `README.md` with setup and deployment instructions
- Automated tests: `tests/` (`npm test`)

## Database evidence (E)

These screenshots come from Supabase Studio on a local Supabase stack (`npx supabase start`). It runs the same migration as the hosted project and holds real test submissions made through the app and its public API. No credentials or real student data appear.

| File | Shows |
| --- | --- |
| `01-supabase-schema-relationships.png` | The 5 tables with primary keys and foreign-key relationships |
| `02-supabase-table-surveys.png` | Surveys stored with status and public slug |
| `03-supabase-table-questions.png` | Questions linked to their survey (`survey_id`) |
| `04-supabase-table-choices.png` | Choices linked to their question (`question_id`) |
| `05-supabase-table-responses.png` | 12 stored student submissions with anonymous tokens and timestamps |
| `06-supabase-table-answers.png` | Answers linked to response, question, and choice |
| `07-app-dashboard.png` | Instructor dashboard |
| `08-app-results-recursion.png` | Results for an active survey: counts and percentages |
| `09-app-results-data-structures.png` | Historical results for an archived survey (7 responses) |
| `10-app-present-qr.png` | Presentation page with QR code, URL, and response count |
| `11-app-editor.png` | Survey editor |
| `12-student-survey-mobile.png` | Student view on a phone-sized screen, no login |
| `13-student-thank-you-mobile.png` | Confirmation after submitting |

## Checklist (assignment section 10)

- [x] The application runs locally
- [x] The instructor can create and activate surveys
- [x] Students can access surveys through QR codes (URL encoded in the QR code; verified in the browser)
- [x] Students can submit answers without logging in
- [x] Responses are saved in the database
- [x] The instructor can view results
- [x] The database tables and relationships are implemented
- [x] The application is deployed publicly
- [x] The GitHub repository contains the required files
- [x] Sensitive credentials are not committed
- [x] The development summary and AI interaction history are included
- [x] Database screenshots are included
