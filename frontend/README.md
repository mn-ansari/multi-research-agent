# ResearchMind: Frontend

Next.js UI for the multi-agent research pipeline. It talks to the FastAPI server in `../api.py`.

## Run locally

1. **Backend** (from the project root, with `OPENAI_API_KEY` and `TAVILY_API_KEY` in `.env`):

   ```bash
   pip install -r requirements.txt
   uvicorn api:app --reload --port 8000
   ```

2. **Frontend** (from this folder):

   ```bash
   npm install
   cp .env.example .env.local   # points the UI at http://localhost:8000
   npm run dev
   ```

   Open http://localhost:3000.

## API

| Method | Path                   | Description                                             |
| ------ | ---------------------- | ------------------------------------------------------- |
| GET    | `/api/health`          | Health check                                            |
| POST   | `/api/research`        | `{ "topic": "..." }`: runs the full pipeline, returns all outputs |
| POST   | `/api/research/stream` | `{ "topic": "..." }`: streams step progress as Server-Sent Events |

If the frontend is served from a different origin, set `FRONTEND_ORIGINS` (comma-separated) for the API's CORS config.
