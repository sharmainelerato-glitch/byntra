"""BYNTRA Qloo integration. No fixtures, simulated recommendations, or leaked API keys.

Place next to main.py. Requires QLOO_API_KEY. QLOO_BASE_URL defaults to
https://hackathon.api.qloo.com; set the host specified for your credential.
"""
import os
import json
import sqlite3
from urllib.parse import urlparse
from typing import Optional
import httpx
from fastapi import APIRouter, HTTPException, Query, Depends
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api/qloo", tags=["Qloo cultural intelligence"])

TYPES = {
    "movies": "urn:entity:movie", "series": "urn:entity:tv_show",
    "music": "urn:entity:artist", "dining": "urn:entity:place",
    "travel": "urn:entity:destination", "fashion": "urn:entity:brand",
    "books": "urn:entity:book", "places": "urn:entity:place",
    "games": "urn:entity:videogame", "people": "urn:entity:artist",
    "podcasts": "urn:entity:podcast",
}


def main_dependencies():
    # main imports this router; defer import until requests to avoid circular imports.
    from main import current
    return current


def user_dependency(authorization: Optional[str] = None):
    # FastAPI dependency uses the same auth implementation as other BYNTRA routes.
    from main import current
    return current

# Use a single token dependency that delegates to main.current via FastAPI request.
from fastapi import Request
async def signed_user(request: Request):
    from main import current
    from fastapi.security.utils import get_authorization_scheme_param
    from fastapi import Header
    # main.current signature accepts authorization header directly.
    auth = request.headers.get("authorization")
    return current(auth)


def config():
    key = os.getenv("QLOO_API_KEY", "").strip()
    if not key:
        raise HTTPException(503, "Qloo is not configured. Set QLOO_API_KEY on the server.")
    base = os.getenv("QLOO_BASE_URL", "https://hackathon.api.qloo.com").strip().rstrip("/")
    parsed = urlparse(base)
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password or parsed.path not in ("", "/"):
        raise HTTPException(500, "Invalid QLOO_BASE_URL; use the HTTPS API origin only.")
    return key, base


async def upstream(path, params):
    key, base = config()
    try:
        async with httpx.AsyncClient(timeout=22, follow_redirects=False) as client:
            response = await client.get(base + path, params=params, headers={"X-Api-Key": key, "Accept": "application/json"})
        if response.status_code in (401, 403):
            raise HTTPException(502, "Qloo rejected the API credentials or access permissions.")
        if response.status_code == 429:
            raise HTTPException(503, "Qloo rate limit reached. Please retry later.")
        if response.status_code >= 400:
            raise HTTPException(502, f"Qloo returned HTTP {response.status_code}.")
        return response.json()
    except httpx.RequestError as exc:
        raise HTTPException(502, "Qloo is unreachable.") from exc
    except ValueError as exc:
        raise HTTPException(502, "Qloo returned invalid JSON.") from exc


def entities_from(payload):
    if isinstance(payload, list):
        return payload
    if not isinstance(payload, dict):
        return []
    results = payload.get("results", {})
    if isinstance(results, list):
        return results
    if isinstance(results, dict):
        for name in ("entities", "results"):
            if isinstance(results.get(name), list):
                return results[name]
    if isinstance(payload.get("entities"), list):
        return payload["entities"]
    return []


def normalize(raw):
    if not isinstance(raw, dict):
        return None
    entity = raw.get("entity") if isinstance(raw.get("entity"), dict) else raw
    identifier = entity.get("id") or entity.get("entity_id")
    name = entity.get("name") or entity.get("title")
    if not identifier or not name:
        return None
    properties = entity.get("properties") if isinstance(entity.get("properties"), dict) else {}
    image = entity.get("image") or properties.get("image") or properties.get("image_url")
    if isinstance(image, dict):
        image = image.get("url") or image.get("source")
    if not isinstance(image, str) or not image.startswith("https://"):
        image = None
    query = raw.get("query") if isinstance(raw.get("query"), dict) else {}
    affinity = query.get("affinity")
    if not isinstance(affinity, (int, float)) or isinstance(affinity, bool):
        affinity = None
    return {"id": str(identifier), "name": str(name), "type": entity.get("type", ""),
            "image": image, "properties": properties, "affinity": affinity, "source": "qloo"}


class RecommendIn(BaseModel):
    category: str
    entity_ids: list[str] = Field(min_length=1, max_length=12)
    location: Optional[str] = Field(default=None, max_length=120)
    limit: int = Field(default=12, ge=1, le=20)


class SaveIn(BaseModel):
    entity_id: str = Field(min_length=1, max_length=150)
    name: str = Field(min_length=1, max_length=250)
    category: str = Field(min_length=1, max_length=50)
    image: Optional[str] = Field(default=None, max_length=1200)


def setup_table(c):
    c.execute("""CREATE TABLE IF NOT EXISTS qloo_saved (
      id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      entity_id TEXT NOT NULL, name TEXT NOT NULL, category TEXT NOT NULL,
      image TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id,entity_id))""")


@router.get("/status")
def status(user=Depends(signed_user)):
    return {"configured": bool(os.getenv("QLOO_API_KEY", "").strip()),
            "source": "Qloo", "live_verified": False}


@router.get("/search")
async def search(q: str = Query(min_length=2, max_length=120), category: str = "", user=Depends(signed_user)):
    params = {"query": q.strip(), "take": 12}
    if category:
        if category not in TYPES:
            raise HTTPException(400, "Unsupported Qloo category.")
        params["types"] = TYPES[category]
    raw = await upstream("/search", params)
    return {"results": [x for item in entities_from(raw) if (x := normalize(item))], "source": "qloo"}


async def recommendations(body: RecommendIn):
    if body.category not in TYPES:
        raise HTTPException(400, "Unsupported Qloo category.")
    ids = list(dict.fromkeys(i.strip() for i in body.entity_ids if i.strip()))
    if not ids:
        raise HTTPException(422, "Select a real Qloo entity first.")
    params = {"filter.type": TYPES[body.category],
              "signal.interests.entities": ",".join(ids),
              "filter.exclude.entities": ",".join(ids),
              "take": body.limit, "feature.explainability": "true"}
    if body.location and body.category in ("dining", "places", "travel"):
        params["filter.location.query"] = body.location.strip()
    raw = await upstream("/v2/insights", params)
    result = [x for item in entities_from(raw) if (x := normalize(item))]
    return {"results": result, "source": "qloo", "count": len(result)}


@router.post("/recommend")
async def recommend(body: RecommendIn, user=Depends(signed_user)):
    return await recommendations(body)


@router.get("/saved")
def list_saved(user=Depends(signed_user)):
    from main import db
    with db() as c:
        setup_table(c)
        return [dict(row) for row in c.execute(
            "SELECT id,entity_id,name,category,image FROM qloo_saved WHERE user_id=? ORDER BY id DESC", (user["id"],))]


@router.post("/saved")
def save_entity(body: SaveIn, user=Depends(signed_user)):
    from main import db
    with db() as c:
        setup_table(c)
        c.execute("INSERT OR IGNORE INTO qloo_saved(user_id,entity_id,name,category,image) VALUES(?,?,?,?,?)",
                  (user["id"], body.entity_id, body.name, body.category, body.image))
        row = c.execute("SELECT id,entity_id,name,category,image FROM qloo_saved WHERE user_id=? AND entity_id=?",
                        (user["id"], body.entity_id)).fetchone()
        return dict(row)


@router.delete("/saved/{entity_id}")
def delete_saved(entity_id: str, user=Depends(signed_user)):
    from main import db
    with db() as c:
        setup_table(c)
        result = c.execute("DELETE FROM qloo_saved WHERE user_id=? AND entity_id=?", (user["id"], entity_id))
        return {"deleted": bool(result.rowcount)}


@router.post("/journeys/{jid}/recommend")
async def journey_recommend(jid: int, body: RecommendIn, user=Depends(signed_user)):
    from main import db, require_active_journey
    with db() as c:
        row = c.execute("SELECT * FROM journeys WHERE id=?", (jid,)).fetchone()
        if row is None:
            raise HTTPException(404, "Journey not found.")
        require_active_journey(row, user["id"])
    result = await recommendations(body)
    return {"recommendations": result, "journey_id": jid}


@router.get('/verify-live')
async def verify_live_qloo(q: str = Query(default='jazz', min_length=2, max_length=80), user=Depends(signed_user)):
    # A real upstream request: this is intentionally NOT a mock or config-only check.
    raw = await upstream('/search', {'query': q.strip(), 'take': 3})
    found = [x for item in entities_from(raw) if (x := normalize(item))]
    return {'live_request_succeeded': True, 'provider': 'Qloo', 'query': q.strip(),
            'returned_entities': len(found), 'results': found,
            'note': 'Successful API response; an empty result is not evidence of recommendations.'}
