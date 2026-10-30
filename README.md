# BYNTRA — Find the Path Between Us

A responsive full-stack **starter**, styled after the user's 10-screen BYNTRA reference board (`frontend/public/design-reference.jpg`). The UI follows the original forest-green / near-black / cream / champagne-gold palette and the agreed names: Welcome, Home Feed, Explore, Create, Profile, Explorers, Post Detail, AI Bridges, Shared Journeys, TogetherSpace.

## Important: accurate scope

This is a **working starter**, not a claim of pixel-perfect identity with a generated concept image. A single static image cannot define every responsive breakpoint, animation, or asset. The visual direction and all 10 screen types are represented; fine visual QA against the reference remains necessary. The reference image is bundled solely as a reference, not as live app content.

**No seeded accounts, posts, people, messages, venues, events, photos or fake AI responses.** New installations have empty feeds until people sign up and post. Interest choices and design labels are UI configuration, not fake user data. Real data is stored in SQLite and user-uploaded photos on disk. No imaginary Qloo responses are displayed.

## Included and working

- Register/sign in; PBKDF2 password hashes; signed expiring sessions; edit profile, interests and avatar.
- Upload real JPG/PNG/WebP photos (max 6MB); publish/delete posts, like/save/comment, topic and text search.
- Explore actual users, follow/unfollow; **Explorers** and **Exploring** counts and lists.
- **AI Bridges** screen currently shows *deterministic shared-topic matches between real posts*, explicitly labelled as such. It is not advertised as Qloo or model-generated.
- Create persisted solo or paired **Shared Journeys**, add activities, and open TogetherSpace.
- Persistent private 1:1 direct messages (polling refresh every 3.5s).
- TogetherSpace 1:1 WebRTC video/audio/chat using authenticated WebSocket signalling. Works on localhost; across the internet needs HTTPS and often TURN. Both people must open the same shared journey.
- Optional **real Gemini** API assistant using your own key, with explicit unavailable state when unconfigured. Model outputs are not presented as externally verified listings.
- Mobile, tablet and desktop layouts, bottom navigation on mobile, sidebar on desktop.

## Not included yet (do not misrepresent these as implemented)

- **Qloo API recommendations**: Requires a valid Qloo developer key and implementation against your assigned/current Qloo API docs. The current Explore screen uses actual member content and interests; it does not call Qloo.
- Agentic orchestration and AI-generated Shared Journey itineraries: currently journeys are real user-authored collaborative plans, not generated itineraries.
- Story video uploads, notifications, content moderation/reporting, advanced privacy settings, production account recovery, scalable WebSocket fanout, push alerts, TURN infrastructure, and production-grade media security.
- Production deployment hardening (rate limits, email verification, private object storage, content scanning, secure cookies, CSRF policy if cookies are adopted, accessibility audit, multi-worker signalling).

## Run locally (Windows PowerShell)

**Backend** — Python 3.11+:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

**Frontend** — Node 20+ (second terminal):

```powershell
cd frontend
npm install
npm run dev
```

Open **http://localhost:5173**. On first launch, create your own account. Open another private/incognito browser session to create a second real account and test follows, messages and journeys. API docs: http://localhost:8000/docs.

To enable the live AI assistant, set `GEMINI_API_KEY` in the backend process environment (see `backend/.env.example` for settings). This starter does not automatically load `.env` files; use your shell's environment variables or `uvicorn --env-file .env` with `python-dotenv` installed. Never put API keys in the Vite frontend.

## Testing across devices

`npm run dev -- --host 0.0.0.0` makes the frontend reachable from a phone on the same Wi-Fi via your computer's LAN IP and port 5173. Set `BYNTRA_ORIGINS` to include the phone's exact frontend origin, and set the Vite proxy to the reachable backend if required. Camera and microphone APIs are restricted to HTTPS or localhost; use HTTPS for remote mobile video. Responsive CSS supports narrow screens but device-specific QA is still necessary.

## Deployment

Use a persistent volume for `backend/data` (SQLite and photos). Set `BYNTRA_SECRET` to a long random value and `BYNTRA_ORIGINS` to your exact HTTPS frontend URL. Deploy frontend as a static Vite build. Configure `VITE_API_URL` to the backend HTTPS origin before building. For WebRTC across NAT, add TURN credentials and secure signalling. Use managed Postgres, object storage, auth/rate limiting, and moderation before real public usage.

## Project structure

- `frontend/src/App.tsx` — all 10 BYNTRA views and responsive navigation
- `frontend/src/style.css` — design tokens and responsive styles
- `frontend/src/api.ts` — typed API client
- `backend/main.py` — SQLite, auth, REST, uploads, Gemini and WebRTC signalling
- `frontend/public/design-reference.jpg` — original user-supplied design reference

## Originality and hackathon rules

This starter was created as a development foundation. Check each hackathon's rules about pre-existing code, qualifying development windows, required sponsor technology, and disclosures before submission. Do not claim Qloo integration or a working AI agent until implemented and tested.
