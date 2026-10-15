# Learnpath

Learnpath has a separate vanilla-JavaScript frontend and Node.js backend. The backend keeps the Gemini and optional Supabase credentials private, serves the frontend, and generates learning paths with Gemini. Workspace data is saved in this browser by default and can optionally sync to Supabase without requiring a login.

## Project structure

```text
AI learning/
├── frontend/
│   ├── index.html
│   ├── script.js
│   └── style.css
├── backend/
│   ├── index.js
│   ├── schema.sql
│   ├── .env                 # private API keys; excluded from Git
│   └── .env.example
├── package.json
└── README.md
```

## Setup on Windows

1. Install Node.js 20 or newer and open this project folder in VS Code.
2. Get a Gemini API key from [Google AI Studio](https://aistudio.google.com/apikey). Copy `backend/.env.example` to `backend/.env` if the latter does not exist, then fill in:

   ```env
   GEMINI_API_KEY=your_google_ai_studio_key
   GEMINI_MODEL=gemini-2.5-flash
   PORT=3000
   ```

3. In the project folder terminal, run:

   ```powershell
   npm run dev
   ```

4. Open **http://127.0.0.1:3000** and keep the terminal open. Learning paths can now be generated and saved locally in this browser.

## Optional Supabase sync

1. Create a Supabase project. In its **SQL Editor**, run the contents of [`backend/schema.sql`](./backend/schema.sql).
2. In project settings, copy the **Project URL** and the legacy `service_role` API key. The service-role key bypasses row-level security; keep it only in `backend/.env`, never in frontend files or chat.
3. Add these values to `backend/.env` and restart the server:

   ```env
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
   ```

## Data and privacy

- Gemini is called only by the backend; its key is never sent to the browser.
- When Supabase is configured, the backend assigns a private, HTTP-only browser cookie and uses it to load and save that browser's workspace. No login is required. Without login, workspace data is not shared between browsers or devices.
- Supabase Row Level Security is enabled and access is revoked for the public `anon` and `authenticated` roles. Only the backend's service-role key accesses workspace rows.
- Existing learning data in this browser's local storage is copied to Supabase the first time the app connects successfully.
- Without Supabase, learning paths are saved only in this browser's local storage.
- **Clear saved learning data** removes the workspace from Supabase (if configured) and this browser's local cache.

## Troubleshooting

- Gemini is required for generating paths. Fill in `GEMINI_API_KEY` in `backend/.env` and restart `npm run dev`.
- Supabase is optional. Without it, the app stores workspace data in this browser only.
- `/api/health` reports whether each service is configured without revealing keys.
- If workspace saving fails, check the backend terminal for the Supabase error and confirm the SQL schema, project URL, and service-role key.
- **Export PDF** opens the browser print dialog; choose **Save as PDF**.

Generated study advice can be inaccurate. Check important or exam-specific information against authoritative sources.
