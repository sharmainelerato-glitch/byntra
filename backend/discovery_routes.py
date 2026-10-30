"""Real editorial discovery using Wikipedia search; not Qloo taste recommendations."""
from fastapi import APIRouter, HTTPException, Query
import httpx

router = APIRouter(prefix="/api/discovery", tags=["discovery"])

TOPICS = {
    "Film & TV": "cinema film television",
    "Music": "music album musicians",
    "Dining": "cuisine food restaurants",
    "Travel": "travel destinations cities",
    "Fashion": "fashion designers clothing",
    "Books": "literature novels books",
    "Art": "visual arts painting sculpture",
    "Events": "cultural festivals events",
    "Photography": "photography photographers",
    "Culture": "world cultures traditions",
    "Wellness": "wellness meditation yoga",
    "Gaming": "video games gaming",
    "Technology": "technology computing inventions",
    "Nature": "nature wildlife national parks",
    "Theatre": "theatre stage plays",
    "Architecture": "architecture landmark buildings",
    "History": "historical places history",
    "Design": "design industrial graphic design",
    "Other": "culture creativity arts",
}

@router.get("")
async def browse_discoveries(
    category: str = Query("", max_length=50),
    q: str = Query("", max_length=120),
    interests: str = Query("", max_length=120),
):
    if category and category not in TOPICS:
        raise HTTPException(status_code=400, detail="Unknown discovery category")
    # Search terms are editorial prompts, not fabricated results or personal AI predictions.
    if q.strip():
        term = q.strip()
    elif category:
        term = TOPICS[category]
    elif interests.strip():
        term = interests.strip()
    else:
        term = "world culture art music film"
    params = {
        "action": "query", "generator": "search", "gsrsearch": term,
        "gsrlimit": 16, "prop": "pageimages|info", "piprop": "thumbnail",
        "pithumbsize": 640, "inprop": "url", "format": "json", "formatversion": 2,
    }
    try:
        async with httpx.AsyncClient(timeout=12, headers={
            "User-Agent": "BYNTRA/0.1 (cultural discovery prototype; Wikipedia API)",
            "Accept": "application/json",
        }) as client:
            response = await client.get("https://en.wikipedia.org/w/api.php", params=params)
            response.raise_for_status()
            data = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise HTTPException(status_code=502, detail="The public discovery source is temporarily unavailable") from exc
    pages = data.get("query", {}).get("pages", [])
    pages.sort(key=lambda page: page.get("index", 9999))
    results = []
    for page in pages:
        if page.get("missing") or not page.get("title"):
            continue
        results.append({
            "id": str(page.get("pageid", "")),
            "title": page["title"],
            "image": page.get("thumbnail", {}).get("source"),
            "url": page.get("fullurl"),
            "source": "Wikipedia",
        })
    return {"results": results, "source": "Wikipedia", "query": term,
            "personalized": False, "category": category or "For You"}
