# Virtual Company Roundtable — React + Python

This project models a **virtual company with fixed specialist Agents**, not a response queue.

## Product model

- **User** is the human directing the company discussion.
- Every **Agent** is a named virtual employee with a fixed role and fixed skills.
- **15 employees are included by default**, each with a fixed role, skills, system prompt, color, emoji, and avatar:
  - Emma — Software Architect
  - Mike — Critic / Reviewer
  - Bob — Frontend Engineer
  - Ava — UI/UX Designer
  - Tom — Marketing & Sales
  - Alex — Researcher
  - Sarah — SEO Specialist
  - Adrian — Copy & Creative
  - David — DevOps / SRE
  - Sophia — Product Manager
  - Leo — Backend Engineer
  - Nina — QA Engineer
  - Oscar — Data Analyst
  - Ella — Customer Success
  - Ryan — Security Specialist
- Roles and skills are defined in the company catalog. New roles can be added.
- A new Agent is assigned a role when created; that role is its fixed professional identity.
- Rooms are company roundtables. User and Agent messages appear in one chronological timeline.
- The next Agent is always selected manually by the User.

## Per-Agent context sync

The old `waiting / received / queue` model has been removed.

Each `(room, agent)` stores its own context cursor:

```text
lastCopiedMessageId
lastCopiedAt
```

When **Copy New Context** is pressed for an Agent:

1. The app finds the last point that specific Agent saw.
2. It collects only newer messages.
3. It excludes messages written by that same Agent because the Agent already knows its own response.
4. It copies only that delta to the clipboard.
5. After a successful copy, that Agent's cursor advances to the current end of the room.

Example:

```text
1. User
2. Emma
3. Bob
4. Mike
5. Emma
6. Bob
```

If Mike was synced through message 4, the next Copy for Mike contains only **5 and 6**.

## Agent response policy

Every copied Agent prompt includes a shared company rule:

- Give only your professional opinion / analysis / recommendation.
- Do not ask follow-up questions or ask what to do next.
- Ask a question only when the User explicitly asks for questions, or when one indispensable clarification is required.
- Do not repeat the supplied discussion.

## UI / UX

- Employee avatars are shown in the company directory, timeline, and Agent Response panel.
- Hover or keyboard-focus an avatar to see the employee's fixed role, role description, and skills.
- The employee directory is searchable by name, role, or skill.
- Mixed Persian/English message content renders with `dir="auto"` and Markdown support.
- User and Agent messages use distinct alignment and visual surfaces.
- Messages longer than 500 words collapse behind `Read more`.
- The bottom area is one tabbed Action Panel, so User input and Agent paste input are never shown at the same time.
- Agent-response textareas auto-resize for long pasted answers.
- Clipboard actions show Toast confirmation.
- `Copy Full Chat` exports the current room as clean text for an external LLM.

The center of the screen is the shared timeline:

```text
User (2026/09/17 10:00): ...
Emma · Software Architect (2026/09/17 10:03): ...
Bob · Frontend Engineer (2026/09/17 10:06): ...
```

At the bottom, switch between `User Message` and `Agent Response`. In the Agent tab:

1. Manually select an Agent.
2. View the Agent's fixed Role and Skills (read-only).
3. Click `Copy N new messages`.
4. Get the Agent's response from its AI chat/model.
5. Paste only that Agent's response.
6. Click `Add response`.
7. Manually choose the next Agent.

There is no `3 waiting / 0 received` status box anymore.

## Persistence and migration

- Frontend snapshot format is **v3**.
- Existing v2 browser/backend snapshots are automatically migrated.
- v2 queue metadata is discarded because the new workflow no longer uses queues.
- During migration, an Agent's last existing response is used as a reasonable initial context boundary when possible.
- Browser persistence is local-first and mirrors to FastAPI/SQLite when the backend is available.

## Local development on Windows

### Backend

From the project root:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r .\backend\requirements.txt
python -m uvicorn backend.app:app --reload --host 127.0.0.1 --port 8001
```

You should see:

```text
Uvicorn running on http://127.0.0.1:8001
```

Health check:

```text
http://127.0.0.1:8001/api/health
```

Port **8001** is the local default because port 8000 was blocked/reserved on the target Windows machine. You can override it with `VITE_API_TARGET` in the frontend environment.

### Frontend

Open a second PowerShell:

```powershell
cd frontend
npm install
npm run dev
```

Open:

```text
http://localhost:5173
```

Vite proxies `/api` to `http://127.0.0.1:8001` by default.

## Tests

Backend:

```powershell
cd backend
$env:PYTHONPATH="."
pytest -q
```

Frontend:

```powershell
cd frontend
npm run test:run
npm run typecheck
npm run build
```

Key frontend tests include the exact delta-context rule: when Mike was synced through message 4, messages 5 and 6 are the only new messages copied to Mike.

## Docker

Docker keeps the backend on container port 8000 internally; Nginx proxies `/api` to it:

```bash
docker compose up --build
```

Open `http://localhost:8080`.

## Verification performed while generating this revision

- Backend API tests: **4 passed**
- Built-in catalog validation: **15 roles + 15 employees + 15 avatar files**
- Global TypeScript compiler found no parser/syntax diagnostics; full dependency-aware typecheck still requires installed npm packages.
- Frontend `npm install` could not complete in the generation sandbox because npm registry access timed out, so full `npm run typecheck/test:run/build` must be run on the target machine with npm access.

## GitHub repository

Recommended repository name: `virtual-company-roundtable`

CI is included at `.github/workflows/ci.yml` and runs:

- FastAPI backend tests on Python 3.12
- Frontend Vitest tests
- TypeScript typecheck
- Vite production build

The local repository is intended to use `main` as its default branch.
