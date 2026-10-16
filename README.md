# Learnova AI

Learnova AI creates personalized, AI-powered study roadmaps and tracks tasks, progress, study time, and learning resources.

## Architecture

```text
learnova-ai/
├── frontend/                 # React + TypeScript + Vite + Tailwind
│   ├── src/components/        # Reusable UI, including shadcn-style primitives
│   ├── src/pages/             # Dashboard and learning-path form
│   ├── src/layouts/           # Application shell and navigation
│   ├── src/services/          # Flask API and optional Supabase clients
│   ├── src/stores/            # Workspace state and browser cache
│   ├── src/hooks/             # Reusable React hooks
│   ├── src/types/             # TypeScript interfaces
│   └── src/lib/                # Shared utilities
├── backend/                   # Python Flask REST API
│   ├── app/routes/             # API endpoints
│   ├── app/services/           # Workspace persistence
│   ├── app/ai/                 # Gemini integration
│   ├── app/research/           # Research service extension point
│   ├── app/schemas/            # Request and response validation
│   ├── app/utils/              # Shared helpers
│   ├── migrations/             # Backend migration notes
│   └── tests/                  # pytest coverage location
├── supabase/migrations/       # SQL schema and row-level security
├── legacy/                    # Previous vanilla JS + Node implementation, retained for reference
├── .env.example
└── README.md
```

## Run locally on Windows

1. Install Node.js 20+ and Python 3.10+.
2. Install frontend packages with `npm install`.
3. Create a Python environment and install the API requirements:

   ```powershell
   py -m venv backend/.venv
   .\backend\.venv\Scripts\Activate.ps1
   pip install -r backend/requirements.txt
   ```

4. Copy `backend/.env.example` to `backend/.env` and set `GEMINI_API_KEY` from Google AI Studio. This key stays on the Flask server.
5. Open two terminals from the project folder:

   ```powershell
   npm run dev
   ```

   ```powershell
   .\backend\.venv\Scripts\python.exe backend/run.py
   ```

6. Open **http://127.0.0.1:5173**. Vite forwards `/api` requests to Flask on port 5000.

The backend stores workspaces as private JSON files in `backend/data/`. Supabase client configuration is optional; database schema and row-level security are in `supabase/migrations/` for deployments that use Supabase. With no Supabase URL/key configured, sign-up, sign-in, and profile editing use a local development account stored in that browser (passwords are PBKDF2-hashed); this is for local development only and is not hosted authentication. To enable hosted accounts, set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the frontend environment and enable email/password authentication in Supabase. Configure the Supabase email-confirmation and redirect settings for your deployment as needed. Never put a service-role key in a `VITE_` variable. The previous vanilla JavaScript and Node files are retained under `legacy/`.

`GET /api/health` reports whether Gemini is configured. If generation fails, check the Flask terminal and `GEMINI_API_KEY` in `backend/.env`. Exporting or printing a roadmap can be done through the browser print dialog.

AI generated study advice can be inaccurate. Check important or exam-specific information against authoritative sources.

## Deploy on Render

1. Push this repository to GitHub and sign in to [Render](https://render.com).
2. In the Render Dashboard, choose **New > Blueprint**, connect this repository, and apply the `render.yaml` Blueprint.
3. Enter `GEMINI_API_KEY` in Render's secure environment-variable prompt. Do not commit `.env` files or paste keys into chat.
4. Wait for the service health check to pass, then open the service URL shown in Render.

The Blueprint builds the Vite frontend and serves it with Flask from one web service. The free web-service plan may sleep when idle, and its local workspace files are ephemeral; use a persistent database for durable server-side workspace storage.
