# AI Form Test Bot — Final

## What this build does
- Real website UI with dashboard, analyzer, generator, preview, submission progress and results.
- Server-side Google Forms responder-page fetching and question discovery.
- Detects text, paragraph, email, number, dropdown, multiple-choice and checkbox fields when exposed in the responder HTML.
- Generates clearly synthetic Indian respondent names and answers.
- Optional OpenAI generation through `OPENAI_API_KEY`.
- Sends ordinary form POSTs to the configured Google Form test target.
- CSV export.
- Restrictive CSP without `unsafe-eval`.
- No CAPTCHA bypassing, anti-abuse evasion, proxy rotation, or mechanisms intended to make synthetic data look like genuine participants.

## Run
Node.js 18+ recommended.

    npm install
    npm start

Open http://localhost:3000

## AI
Copy `.env.example` to `.env` and set `OPENAI_API_KEY` if you want AI-generated richer answers. The key stays server-side.

## Important Google Forms limitations
Google Forms is a third-party service and can change its responder HTML or reject automated submissions. This project only uses the normal responder endpoint and does not bypass CAPTCHA or other anti-abuse controls. For maximum reliability on a form you own, a Google Apps Script/authorized integration is preferable. Google's official Forms API supports reading form content and responses, while submission is handled differently from the public responder endpoint.


## Repair notes
- Removed all inline HTML event handlers so the restrictive CSP (`script-src 'self'`) no longer blocks button actions.
- Moved UI events to `addEventListener` in `public/app.js`.
- Added consistent JSON/error handling for API requests.
- Fixed the configured submission delay so the UI value is actually used.
- Prevented duplicate test runs and made the Stop button state explicit.
- Resolved relative Google Forms `form` actions against the final responder URL before server-side submission.
- Added Google Forms URL validation and a lightweight `/api/health` endpoint.
- Added validation for generated response counts and submission metadata.
- CSV export now cleans up its temporary object URL.

## Install note
Run `npm install` before starting the app. The repair environment had no npm registry/network access, so dependencies could not be installed or a live Google Forms submission could not be exercised here. The JavaScript source passes Node syntax checks.

- Submission handling now follows redirects, validates the Google Forms `formResponse` endpoint, preserves hidden form fields, and checks the returned confirmation page instead of treating every HTTP 2xx/3xx response as success.
- Results now show the last submission failure reason when Google Forms rejects or fails to confirm a response.


## Multi-page Google Forms support (v4)

The analyzer now reads the Google Forms `FB_PUBLIC_LOAD_DATA_` metadata embedded in the responder page. This is important for multi-page forms because the initial rendered HTML can expose only the first page's inputs. The bot now:

- discovers questions across all sections/pages;
- extracts the real `entry.<id>` values from the embedded form metadata;
- records each question's page;
- follows normal section routing and simple choice-based section jumps;
- sends a `pageHistory` value matching the pages traversed by each synthetic response;
- avoids sending answers belonging to pages that were not traversed;
- preserves hidden Google Forms metadata such as `fbzx` when present.

The supplied responder URL is prefilled in the dashboard for the requested career-awareness form. Google Forms must still be published and configured to accept the responder access you intend to test. Google's current documentation explains that responders must have access to the published form and that limiting a form to one response requires sign-in. urlGoogle Forms publishing and responder settingshttps://support.google.com/docs/answer/2839588?hl=en


## Vercel deployment (v5)

This build is configured for Vercel. `api/index.js` exports the Express app as a Vercel Node function, and `vercel.json` rewrites both API and browser routes to that function. The app still runs locally with `npm start`.

For Vercel, do not use `npm start` as the deployment start command; Vercel detects the Node function from `api/index.js`. Set `OPENAI_API_KEY` and `OPENAI_MODEL` in Vercel Environment Variables. Keep `.env` out of Git.

After pushing this version to GitHub, redeploy the latest commit in Vercel. Then check `https://YOUR-DOMAIN/api/health`; it should return JSON with `ok: true`.
