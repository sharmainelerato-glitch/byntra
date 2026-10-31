# BYNTRA
### Find the Path Between Us.

**Discover culture. Connect through interests. Create experiences together.**

[Live Application](https://byntra-sigma.vercel.app/) · [API Documentation](https://byntra-api.onrender.com/docs) · [GitHub Repository](https://github.com/sharmainelerato-glitch/byntra)

---

## Overview

**BYNTRA** is an AI-powered cultural discovery and social platform designed to bring people together through the things they love.

Films that stay with us. Music that speaks to us. Places we dream of visiting. Books that change our perspectives. Food, fashion, art, and experiences that shape who we are.

These interests often live across disconnected platforms, making it difficult to discover meaningful connections between them — and between the people who share them.

BYNTRA brings cultural discovery, social connection, intelligent recommendations, and collaborative experience planning into one connected digital environment.

Our vision is simple:

**Turn shared interests into meaningful connections, and meaningful connections into shared experiences.**

---

## The Problem

Digital discovery is fragmented.

People use separate applications to discover movies, listen to music, find restaurants, explore travel destinations, attend events, and connect with others.

Although these interests are naturally connected, most platforms treat them independently.

A person who loves Japanese cinema might also be interested in Japanese literature, contemporary art, cultural festivals, or travelling to Tokyo. Yet discovering these connections often requires searching across several different services.

Social platforms introduce another challenge: they frequently prioritize engagement over meaningful compatibility.

BYNTRA explores a different approach — connecting people through cultural interests, shared curiosity, and opportunities to experience something together.

---

## Our Solution

BYNTRA combines three complementary experiences:

**Cultural Discovery**

Explore interconnected interests across entertainment, lifestyle, travel, and culture.

**Social Connection**

Find other Explorers through shared interests, public cultural activity, and transparent compatibility signals.

**Shared Experiences**

Move beyond discovering something interesting by planning activities and cultural journeys together.

Rather than stopping at recommendations, BYNTRA creates a path from discovery to connection to participation.

---

## Core Features

### 01. Multi-Domain Cultural Discovery

BYNTRA brings multiple cultural categories into one unified discovery experience.

Supported areas include:

- Film, television, documentaries, and cinema
- Music, artists, albums, and genres
- Restaurants, cafés, food, and cuisine
- Travel, destinations, and places
- Fashion, designers, and personal style
- Books, authors, and literature
- Art, museums, and exhibitions
- Events, festivals, and cultural experiences
- Additional lifestyle and creative interests

The platform is designed to support discovery across categories rather than limiting people to one type of interest.

### 02. Explorers — A Social Network Built Around Curiosity

BYNTRA calls its community members **Explorers**.

The social experience includes profiles, interests, cultural posts, comments, likes, saved posts, and following relationships.

Our terminology reflects the spirit of the platform:

- **Explorers:** People following your journey.
- **Exploring:** People whose journeys you follow.

The goal is to make cultural curiosity the foundation of social connection.

### 03. Cultural Compatibility

BYNTRA identifies potential connections between Explorers using information they have chosen to share.

Its compatibility system evaluates overlapping profile interests and topics from public posts.

Results provide evidence of shared interests and a relative ranking rather than invented compatibility percentages.

Where configured, AI can help explain these connections using the underlying evidence.

### 04. Intelligent Cultural Posts

Explorers can publish their interests, discoveries, experiences, and recommendations.

BYNTRA supports automatic post categorization through an AI-assisted classification workflow.

When the configured AI service is unavailable, the backend can use a clearly identified keyword-based fallback.

Users can also correct categories to improve the accuracy of their content.

### 05. Explore More

Discovery should not end with a single post.

BYNTRA's Explore More feature identifies related community content using overlapping topics and cultural categories.

It also generates suggested searches across other cultural areas.

Related community posts are distinguished from suggestions that have not been independently verified against external providers.

### 06. Shared Journeys

Shared Journeys turn cultural interests into collaborative plans.

Explorers can:

- Create cultural journeys.
- Invite another Explorer.
- Accept or decline invitations.
- Add and remove activities.
- Vote on proposed activities.
- Collaboratively develop plans.
- Generate AI-assisted itinerary suggestions when the AI provider is available.

Journey state and activity votes are stored in the backend rather than simulated in the interface.

### 07. BYNTRA AI

BYNTRA includes an AI assistant designed around cultural exploration.

It can help users think through interests, identify possible connections, understand shared cultural themes, and plan experiences.

The AI workflow uses Groq when configured and grounds relevant responses in available BYNTRA profile and community data.

The assistant distinguishes verified application information from general suggestions and does not present unverified venues, prices, bookings, or external API results as confirmed facts.

### 08. Conversations and Shared Presence

BYNTRA supports direct conversations between Explorers.

The backend also includes authenticated WebSocket signalling for WebRTC-based journey communication.

Real-time audio and video functionality depends on browser permissions, peer connectivity, and appropriate network configuration. Reliable production calling may require additional TURN infrastructure.

### 09. Experience Discovery

BYNTRA includes experience-discovery components intended to connect cultural interests with activities beyond the application.

These workflows cover exploration of experiences, events, and related travel or ticket information where supported by external providers.

Live availability, provider coverage, and booking capabilities depend on the actual integrations configured.

---

## Qloo Cultural Intelligence Integration

BYNTRA was developed for the **Qloo Agentic Hackathon**, with cross-domain cultural intelligence forming an important part of its architecture.

The backend includes dedicated Qloo integration routes for:

- Cultural entity search
- Recommendation requests
- Saved cultural entities
- Journey-related recommendations
- Integration status and live verification

The intended role of Qloo is to support discovery of meaningful relationships between different cultural interests and help inform recommendations grounded in cultural intelligence.

**Integration transparency:** The presence of Qloo routes does not itself establish that live Qloo requests have succeeded. Live functionality requires a valid Qloo API key and successful verification against the service. The integration should be described as verified only after an actual Qloo response has been confirmed.

---

## Technology Stack

| Layer | Technology |
|---|---|
| Frontend | React, TypeScript, Vite |
| Styling | CSS, responsive interface components |
| Backend | Python, FastAPI |
| Database | SQLite |
| Authentication | Backend-issued signed sessions |
| Password security | PBKDF2-HMAC-SHA256 |
| AI assistance | Groq API |
| Cultural intelligence | Qloo integration routes |
| Real-time communication | WebSockets, WebRTC signalling |
| Frontend hosting | Vercel |
| Backend hosting | Render |
| Cloud integration | Appwrite JavaScript SDK |

Appwrite connectivity has been established as part of BYNTRA's ongoing cloud integration work. The currently deployed application continues to use FastAPI authentication and SQLite for its core application state.

---

## System Architecture

BYNTRA uses a frontend–backend architecture.

**React Client**

Provides the cultural discovery interface, social features, journey planning, and AI interactions.

↓

**FastAPI Backend**

Handles authentication, user profiles, posts, conversations, journeys, compatibility calculations, and API orchestration.

↓

**Data and External Services**

- SQLite stores application records.
- Groq powers supported AI-generated responses.
- Qloo integration routes support cultural-intelligence workflows when configured.
- External experience services support applicable discovery workflows.
- WebSockets provide signalling for real-time journey communication.

This separation allows the interface, application logic, and external integrations to evolve independently.

---

## Getting Started

### Prerequisites

Install the following:

- Node.js and npm
- Python 3.10 or newer
- Git

### 1. Clone the Repository

```bash
git clone https://github.com/sharmainelerato-glitch/byntra.git
cd byntra
```

### 2. Set Up the Backend

```bash
cd backend
python -m venv .venv
```

Activate the virtual environment.

Windows PowerShell:

```powershell
.\.venv\Scripts\Activate.ps1
```

macOS or Linux:

```bash
source .venv/bin/activate
```

Install dependencies:

```bash
pip install -r requirements.txt
```

Create your backend environment configuration using the available `.env.example` as a reference.

Start FastAPI:

```bash
uvicorn main:app --reload
```

The local API will be available at:

`http://127.0.0.1:8000`

Interactive documentation:

`http://127.0.0.1:8000/docs`

### 3. Set Up the Frontend

Open another terminal:

```bash
cd frontend
npm install
```

Create a `.env.local` file:

```env
VITE_API_URL=http://127.0.0.1:8000
VITE_APPWRITE_ENDPOINT=https://nyc.cloud.appwrite.io/v1
VITE_APPWRITE_PROJECT_ID=YOUR_APPWRITE_PROJECT_ID
```

Start the development server:

```bash
npm run dev
```

Open the local address displayed by Vite, normally:

`http://localhost:5173`

### 4. Build for Production

```bash
npm run build
```

The frontend production build is generated in the `dist` directory.

---

## Environment Configuration

### Backend

| Variable | Purpose |
|---|---|
| `BYNTRA_SECRET` | Secret used to sign backend authentication sessions |
| `BYNTRA_ORIGINS` | Comma-separated list of permitted frontend origins |
| `GROQ_API_KEY` | Enables Groq-powered AI features |
| `GROQ_MODEL` | Optional Groq model selection |
| `QLOO_API_KEY` | Qloo API credentials, when available |

Additional environment variables may be required by individual integration modules.

For production, `BYNTRA_SECRET` should contain a securely generated random value and remain consistent between restarts.

### Frontend

| Variable | Purpose |
|---|---|
| `VITE_API_URL` | Public URL of the FastAPI backend |
| `VITE_APPWRITE_ENDPOINT` | Appwrite Cloud API endpoint |
| `VITE_APPWRITE_PROJECT_ID` | Appwrite project identifier |

Never place private provider API keys or authentication secrets in frontend environment variables prefixed with `VITE_`, because those values are exposed in the browser bundle.

---

## Deployment

### Frontend — Vercel

BYNTRA's frontend is deployed using Vercel.

Production configuration:

- Framework: Vite
- Root directory: `frontend`
- Build command: `npm run build`
- Output directory: `dist`

**Live frontend:** https://byntra-sigma.vercel.app/

### Backend — Render

The FastAPI backend is deployed as a Render web service.

Production configuration:

- Root directory: `backend`
- Build command: `pip install -r requirements.txt`
- Start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`

**Live API:** https://byntra-api.onrender.com

**API documentation:** https://byntra-api.onrender.com/docs

The backend must permit the deployed Vercel origin through `BYNTRA_ORIGINS`.

### Data Persistence Considerations

The current application uses SQLite and local file uploads.

On hosting environments with ephemeral filesystems, data and uploaded media may be lost during restarts or redeployments unless persistent storage is configured.

A production-ready long-term deployment should use durable database and object-storage services.

---

## Privacy, Security, and Data Integrity

BYNTRA is designed to distinguish actual user activity and verified application data from generated suggestions.

Its current backend includes:

- Password hashing using PBKDF2-HMAC-SHA256
- Signed authentication sessions
- Authenticated access to protected API endpoints
- User and participant authorization checks
- Input validation
- Restricted image-upload formats and sizes
- Database-backed social interactions
- Explicit handling of unavailable AI services
- Evidence-based cultural compatibility

AI-generated suggestions are not represented as confirmed bookings, verified external recommendations, or real-world transactions.

Production deployment still requires appropriate persistent storage, operational monitoring, secure secret management, and additional security testing.

---

## Design Philosophy

BYNTRA's visual identity combines cinematic storytelling with a premium, modern social interface.

Its design system is built around:

- Deep forest green
- Near-black backgrounds
- Warm cream typography
- Champagne-gold accents
- Editorial imagery
- Spacious layouts
- Mobile-first interactions

The interface aims to make cultural discovery feel personal, immersive, and inviting.

Every interaction should encourage curiosity, exploration, and connection.

---

## Future Development

BYNTRA's longer-term roadmap includes:

**Deeper Cultural Intelligence**

Expand verified cross-domain recommendations and cultural discovery relationships.

**Cloud-Native Data Infrastructure**

Move core application data and media to durable managed services.

**Expanded Social Experiences**

Develop richer group discovery, collaborative experiences, and community interaction.

**Enhanced Real-Time Communication**

Improve WebRTC reliability, connection handling, and production calling infrastructure.

**Experience Planning and Discovery**

Expand provider-backed event, travel, and activity discovery while maintaining clear distinctions between suggestions and verified availability.

**Privacy and Personalization**

Introduce more granular user controls, recommendation preferences, and transparent discovery explanations.

---

## Project Status

BYNTRA is an active hackathon prototype with a deployed frontend and backend.

Its application includes implemented social, cultural-post, compatibility, and collaborative-journey workflows.

Some external integrations and production infrastructure improvements remain dependent on credentials, provider availability, configuration, and further verification.

The project prioritizes genuine application state, traceable outputs, and clear disclosure of functionality rather than simulated results presented as real.

---

## Creator

**Lerato Sharmaine Mokgatla**

Software Developer | Cybersecurity Enthusiast | Technology Innovator

GitHub: [sharmainelerato-glitch](https://github.com/sharmainelerato-glitch)

Portfolio: [leratosportfolio.vercel.app](https://leratosportfolio.vercel.app/)

---

## Closing Vision

Culture is more than entertainment. It is how we express ourselves, discover the world, build relationships, and understand one another.

BYNTRA imagines a digital space where a favourite film can lead to a new friendship, a shared playlist can inspire a journey, and a simple discovery can become a meaningful experience.

**BYNTRA — Find the Path Between Us.**
