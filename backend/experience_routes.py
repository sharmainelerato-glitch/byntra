"""BYNTRA real flight/event discovery. Optional precise coordinates are used only for a single request.
Providers: Amadeus Self-Service flight offers; Ticketmaster Discovery events.
No invented prices, ticket availability, rankings, or scraped inventory.
"""
import os, time, asyncio
from datetime import date
from typing import Optional, Literal
from urllib.parse import urlparse
import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field

router = APIRouter(prefix='/api/experiences', tags=['Experience discovery'])
_token_cache = {'token': None, 'until': 0.0}
_token_lock = asyncio.Lock()

async def signed_user(request: Request):
    from main import current
    return current(request.headers.get('authorization'))


def amadeus_production():
    return os.getenv('AMADEUS_ENV', 'test').lower() == 'production'

def amadeus_base():
    # Production access requires a separate approved Amadeus credential pair.
    return 'https://api.amadeus.com' if amadeus_production() else 'https://test.api.amadeus.com'

async def amadeus_token():
    key = os.getenv('AMADEUS_CLIENT_ID', '').strip()
    secret = os.getenv('AMADEUS_CLIENT_SECRET', '').strip()
    if not key or not secret:
        raise HTTPException(503, 'Live flight search requires Amadeus API credentials.')
    if _token_cache['token'] and _token_cache['until'] > time.time() + 45:
        return _token_cache['token']
    async with _token_lock:
        if _token_cache['token'] and _token_cache['until'] > time.time() + 45:
            return _token_cache['token']
        try:
            async with httpx.AsyncClient(timeout=20) as client:
                r = await client.post(amadeus_base() + '/v1/security/oauth2/token', data={
                    'grant_type':'client_credentials', 'client_id':key, 'client_secret':secret})
                r.raise_for_status()
                data = r.json()
                _token_cache.update(token=data['access_token'], until=time.time() + int(data.get('expires_in', 1200)))
                return _token_cache['token']
        except (httpx.HTTPError, KeyError, ValueError) as e:
            raise HTTPException(502, 'Flight provider authentication failed.') from e

class FlightSearch(BaseModel):
    origin: str = Field(pattern=r'^[A-Za-z]{3}$')
    destination: str = Field(pattern=r'^[A-Za-z]{3}$')
    departure_date: date
    return_date: Optional[date] = None
    adults: int = Field(default=1, ge=1, le=6)
    travel_class: Literal['ECONOMY','PREMIUM_ECONOMY','BUSINESS','FIRST'] = 'ECONOMY'
    currency: str = Field(default='ZAR', pattern=r'^[A-Za-z]{3}$')
    max_price: Optional[float] = Field(default=None, gt=0)
    preference: Literal['balanced','cheapest','fewest_stops','fastest'] = 'balanced'

@router.post('/flights')
async def flights(body: FlightSearch, user=Depends(signed_user)):
    if body.departure_date < date.today():
        raise HTTPException(422, 'Departure date must not be in the past.')
    if body.return_date and body.return_date < body.departure_date:
        raise HTTPException(422, 'Return date must be on or after departure.')
    if body.origin.upper() == body.destination.upper():
        raise HTTPException(422, 'Origin and destination must differ.')
    params = {'originLocationCode':body.origin.upper(), 'destinationLocationCode':body.destination.upper(),
              'departureDate':body.departure_date.isoformat(), 'adults':body.adults,
              'travelClass':body.travel_class, 'currencyCode':body.currency.upper(), 'max':20}
    if body.return_date: params['returnDate'] = body.return_date.isoformat()
    token = await amadeus_token()
    try:
        async with httpx.AsyncClient(timeout=28) as client:
            r = await client.get(amadeus_base() + '/v2/shopping/flight-offers',
                params=params, headers={'Authorization':f'Bearer {token}'})
        if r.status_code >= 400: raise HTTPException(502, f'Flight provider returned HTTP {r.status_code}.')
        payload = r.json()
    except (httpx.HTTPError, ValueError) as e:
        raise HTTPException(502, 'Live flight offers could not be retrieved.') from e
    results = []
    for offer in payload.get('data', []):
        try:
            itineraries = offer['itineraries']
            segments = [segment for it in itineraries for segment in it['segments']]
            stops = sum(max(0, len(it['segments'])-1) for it in itineraries)
            amount = float(offer['price']['grandTotal'])
            if body.max_price is not None and amount > body.max_price: continue
            first = segments[0]
            last = segments[-1]
            results.append({'id':str(offer['id']), 'price':amount,
                'currency':offer['price'].get('currency',body.currency.upper()),
                'stops':stops, 'airlines':sorted(set(s['carrierCode'] for s in segments)),
                'departure':first['departure']['at'], 'arrival':last['arrival']['at'],
                'itinerary_durations':[it.get('duration') for it in itineraries],
                'cabin':body.travel_class, 'seats_remaining':offer.get('numberOfBookableSeats'),
                'source':'Amadeus production API' if amadeus_production() else 'Amadeus test API', 'bookable_in_byntra':False})
        except (KeyError, IndexError, TypeError, ValueError): continue
    if body.preference == 'cheapest': results.sort(key=lambda x:(x['price'],x['stops']))
    elif body.preference == 'fewest_stops': results.sort(key=lambda x:(x['stops'],x['price']))
    elif body.preference == 'fastest':
        # ISO8601 durations from provider; parse via a tiny bounded parser.
        import re
        def minutes(x):
            total=0
            for dur in x['itinerary_durations']:
                m=re.fullmatch(r'P(?:\d+D)?T(?:(\d+)H)?(?:(\d+)M)?',dur or '')
                if not m:return 999999
                total += int(m.group(1) or 0)*60 + int(m.group(2) or 0)
            return total
        results.sort(key=lambda x:(minutes(x),x['price']))
    else:
        if results:
            cheapest=min(x['price'] for x in results)
            results.sort(key=lambda x:(x['price']/max(cheapest,0.01) + 0.16*x['stops'],x['price']))
    for index, item in enumerate(results):
        if index == 0:
            reasons=[]
            if body.preference == 'cheapest': reasons.append('Lowest listed price among the returned offers matching your travel class')
            elif body.preference == 'fewest_stops': reasons.append('Fewest stops among returned offers; price breaks ties')
            elif body.preference == 'fastest': reasons.append('Shortest provider-listed journey duration among returned offers')
            else: reasons.append('Balances price and number of stops among returned offers')
            reasons.append(f"Listed at {item['price']:.2f} {item['currency']} in {body.travel_class.replace('_',' ').title()}")
            item['why_recommended']='. '.join(reasons)+'.'
        else: item['why_recommended']=None
    return {'results':results, 'source':'Amadeus production API' if amadeus_production() else 'Amadeus test API', 'sandbox_data':not amadeus_production(),
            'live_commercial_inventory_verified':False,
            'notice':('Production flight offers returned; fares and availability must be revalidated with Flight Offers Price before purchase. No booking is available in BYNTRA.' if amadeus_production() else 'Amadeus TEST offers are not live commercial inventory. Do not purchase based on these prices.'),
            'comparison_count':len(results), 'preference':body.preference}

class EventSearch(BaseModel):
    keyword: str = Field(default='poetry', min_length=2, max_length=80)
    city: Optional[str] = Field(default=None, max_length=100)
    latitude: Optional[float] = Field(default=None, ge=-90, le=90)
    longitude: Optional[float] = Field(default=None, ge=-180, le=180)
    radius_km: int = Field(default=25, ge=1, le=150)
    size: int = Field(default=20, ge=1, le=30)

@router.post('/events')
async def events(body: EventSearch, user=Depends(signed_user)):
    key=os.getenv('TICKETMASTER_API_KEY','').strip()
    if not key:raise HTTPException(503,'Event search requires TICKETMASTER_API_KEY.')
    if (body.latitude is None) != (body.longitude is None):
        raise HTTPException(422,'Provide both coordinates or neither.')
    if body.latitude is None and not body.city:
        raise HTTPException(422,'Enter a city or explicitly share your location.')
    params={'apikey':key,'keyword':body.keyword.strip(),'size':body.size,'sort':'date,asc'}
    if body.latitude is not None:
        params.update(latlong=f'{body.latitude:.5f},{body.longitude:.5f}',radius=body.radius_km,unit='km')
    else: params['city']=body.city.strip()
    try:
        async with httpx.AsyncClient(timeout=25) as client:
            r=await client.get('https://app.ticketmaster.com/discovery/v2/events.json',params=params)
        if r.status_code>=400:raise HTTPException(502,f'Ticketmaster returned HTTP {r.status_code}.')
        payload=r.json()
    except (httpx.HTTPError,ValueError) as e:
        raise HTTPException(502,'Ticketmaster event search failed.') from e
    output=[]
    for event in payload.get('_embedded',{}).get('events',[]):
        venue=(event.get('_embedded',{}).get('venues') or [{}])[0]
        ranges=event.get('priceRanges') or []
        prices=[{'min':p.get('min'),'max':p.get('max'),'currency':p.get('currency'),'type':p.get('type')} for p in ranges]
        output.append({'id':event.get('id'),'name':event.get('name'),
            'date':event.get('dates',{}).get('start',{}).get('localDate'),
            'time':event.get('dates',{}).get('start',{}).get('localTime'),
            'venue':venue.get('name'),'city':venue.get('city',{}).get('name'),
            'url':event.get('url'),'prices':prices,
            'ticket_status':event.get('dates',{}).get('status',{}).get('code'),
            'source':'Ticketmaster', 'price_comparison_verified':False})
    return {'results':output,'source':'Ticketmaster', 'count':len(output),
            'location_used':'precise one-time search' if body.latitude is not None else 'manual city',
            'notice':'Ticketmaster listings only. Prices and fees can change; no cross-seller cheapest-ticket claim.'}

@router.get('/status')
def status(user=Depends(signed_user)):
    return {'flights_configured':bool(os.getenv('AMADEUS_CLIENT_ID') and os.getenv('AMADEUS_CLIENT_SECRET')),
            'events_configured':bool(os.getenv('TICKETMASTER_API_KEY') or os.getenv('SEATGEEK_CLIENT_ID')),
            'flight_provider':'Amadeus production (revalidation required)' if amadeus_production() else 'Amadeus TEST (sandbox)',
            'event_provider':'Ticketmaster and/or SeatGeek (configured sources only)'}

# Multi-provider event discovery. No event or price is invented when a provider is missing.
import re
import unicodedata


def _normalized_name(value: str) -> str:
    value = unicodedata.normalize('NFKD', value or '')
    value = ''.join(c for c in value if not unicodedata.combining(c))
    return ' '.join(re.findall(r'[a-z0-9]+', value.lower()))


def _price_quote(source: str, minimum, maximum, currency, url):
    if not isinstance(minimum, (int, float)) or isinstance(minimum, bool):
        return None
    return {'seller': source, 'starting_price': minimum, 'maximum_price': maximum,
            'currency': currency, 'url': url, 'fees_included': None,
            'note': 'Provider-listed starting amount; final checkout fees and availability are unverified.'}


@router.post('/events/compare')
async def compare_events(body: EventSearch, user=Depends(signed_user)):
    if (body.latitude is None) != (body.longitude is None):
        raise HTTPException(422, 'Provide both coordinates or neither.')
    if body.latitude is None and not (body.city or '').strip():
        raise HTTPException(422, 'Enter a city or explicitly share location for this search.')
    # Independent providers: a missing credential must not create synthetic results.
    tm_key = os.getenv('TICKETMASTER_API_KEY', '').strip()
    sg_key = os.getenv('SEATGEEK_CLIENT_ID', '').strip()
    if not tm_key and not sg_key:
        raise HTTPException(503, 'Configure TICKETMASTER_API_KEY or SEATGEEK_CLIENT_ID for event search.')
    combined = []
    provider_status = {}
    if tm_key:
        try:
            tm = await events(body, user)
            provider_status['Ticketmaster'] = 'ok'
            for event in tm['results']:
                quotes = [_price_quote('Ticketmaster', x.get('min'), x.get('max'), x.get('currency'), event.get('url')) for x in event['prices']]
                combined.append({**event, 'provider': 'Ticketmaster', 'quotes': [q for q in quotes if q],
                                 'matched_providers': ['Ticketmaster']})
        except HTTPException as exc:
            provider_status['Ticketmaster'] = f'Unavailable (HTTP {exc.status_code})'
    else:
        provider_status['Ticketmaster'] = 'Not configured'
    if sg_key:
        params = {'client_id': sg_key, 'q': body.keyword.strip(), 'per_page': body.size,
                  'sort': 'datetime_local.asc'}
        if body.latitude is not None:
            params.update({'lat': body.latitude, 'lon': body.longitude, 'range': f'{body.radius_km}km'})
        else:
            params['venue.city'] = body.city.strip()
        try:
            async with httpx.AsyncClient(timeout=25, follow_redirects=False) as client:
                response = await client.get('https://api.seatgeek.com/2/events', params=params)
            response.raise_for_status()
            sg_payload = response.json()
            provider_status['SeatGeek'] = 'ok'
            for raw in sg_payload.get('events', []):
                venue = raw.get('venue') or {}
                start = raw.get('datetime_local') or ''
                if raw.get('date_tbd'):
                    start = ''
                stats = raw.get('stats') or {}
                # SeatGeek pricing aggregates may be absent; currency may be missing.
                # Do not assume USD when the API does not specify it.
                currency = raw.get('currency') or stats.get('currency')
                quote = _price_quote('SeatGeek', stats.get('lowest_price'), stats.get('highest_price'), currency, raw.get('url'))
                combined.append({'id': str(raw.get('id')), 'name': raw.get('title') or '',
                                 'date': start[:10] or None, 'time': None if raw.get('time_tbd') else start[11:16] or None,
                                 'venue': venue.get('name'), 'city': venue.get('city'),
                                 'url': raw.get('url'), 'prices': [], 'ticket_status': raw.get('status'),
                                 'source': 'SeatGeek', 'provider': 'SeatGeek',
                                 'quotes': [quote] if quote else [], 'matched_providers': ['SeatGeek']})
        except (httpx.HTTPError, ValueError, TypeError, KeyError):
            provider_status['SeatGeek'] = 'Unavailable (upstream request failed)'
    else:
        provider_status['SeatGeek'] = 'Not configured'
    if all(v != 'ok' for v in provider_status.values()):
        raise HTTPException(502, 'Configured event providers are currently unavailable.')
    # Conservative grouping: exact normalized title + date + city; ambiguous events
    # remain separate, never merged just because artists share a name.
    grouped = {}
    for event in combined:
        key = (_normalized_name(event['name']), event.get('date'), _normalized_name(event.get('city') or ''))
        if not all(key):
            key = (*key, event['provider'], event['id'])
        if key not in grouped:
            grouped[key] = event
        else:
            existing = grouped[key]
            # A venue mismatch could mean two different shows on the same date.
            if (_normalized_name(existing.get('venue') or '') and
                _normalized_name(event.get('venue') or '') and
                _normalized_name(existing['venue']) != _normalized_name(event['venue'])):
                grouped[(*key, event['provider'], event['id'])] = event
                continue
            existing['quotes'].extend(event['quotes'])
            existing['matched_providers'].append(event['provider'])
    results = list(grouped.values())
    for event in results:
        quotes = event['quotes']
        comparable = len(quotes) >= 2 and len({q['currency'] for q in quotes}) == 1 and bool(quotes[0]['currency'])
        event['comparison'] = None
        if comparable:
            cheapest = min(quotes, key=lambda q: q['starting_price'])
            event['comparison'] = {'lowest_listed_starting_price_provider': cheapest['seller'],
                'currency': cheapest['currency'], 'starting_price': cheapest['starting_price'],
                'caveat': 'Starting prices only; fees, seats, ticket class and final totals are not comparable.'}
    results.sort(key=lambda x: (x.get('date') or '9999', x.get('name') or ''))
    return {'results': results, 'count': len(results), 'provider_status': provider_status,
            'location_used': 'precise one-time search' if body.latitude is not None else 'manual city',
            'notice': 'Only provider-returned listings are shown. Price comparisons are indicative starting amounts, not verified cheapest checkout tickets. Some local events may not be listed.'}


@router.get('/providers/status')
def provider_status(user=Depends(signed_user)):
    return {'ticketmaster_configured': bool(os.getenv('TICKETMASTER_API_KEY', '').strip()),
            'seatgeek_configured': bool(os.getenv('SEATGEEK_CLIENT_ID', '').strip()),
            'amadeus_configured': bool(os.getenv('AMADEUS_CLIENT_ID', '').strip() and os.getenv('AMADEUS_CLIENT_SECRET', '').strip()),
            'amadeus_mode': 'production' if amadeus_production() else 'test',
            'qloo_configured': bool(os.getenv('QLOO_API_KEY', '').strip()),
            'live_calls_verified': False,
            'note': 'Configured only indicates that credentials exist; it does not validate them.'}
