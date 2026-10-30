"""BYNTRA API. Real SQLite state, user uploads, signed sessions, and WebRTC signalling.
No seed accounts, recommendations, posts, images, or simulated model responses.
"""
import os, sqlite3, secrets, hashlib, hmac, base64, json, time, re, asyncio
from pathlib import Path
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Optional
from collections import defaultdict
from fastapi import FastAPI, HTTPException, Depends, UploadFile, File, WebSocket, WebSocketDisconnect, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
import httpx
from discovery_routes import router as discovery_router


ROOT = Path(__file__).resolve().parent
DATA = ROOT / 'data'
UPLOADS = DATA / 'uploads'
DATA.mkdir(exist_ok=True)
UPLOADS.mkdir(exist_ok=True)
DB = DATA / 'byntra.sqlite3'
SECRET = os.getenv('BYNTRA_SECRET', '')
if not SECRET:
    secret_file = DATA / '.session_secret'
    if not secret_file.exists():
        secret_file.write_text(secrets.token_urlsafe(48))
        try: secret_file.chmod(0o600)
        except OSError: pass
    SECRET = secret_file.read_text().strip()
ORIGINS = os.getenv('BYNTRA_ORIGINS', 'http://localhost:5173,http://127.0.0.1:5173').split(',')
app = FastAPI(title='BYNTRA API', version='0.1.0')
app.include_router(discovery_router)
app.add_middleware(CORSMiddleware, allow_origins=ORIGINS, allow_credentials=True, allow_methods=['*'], allow_headers=['*'])
app.mount('/uploads', StaticFiles(directory=str(UPLOADS)), name='uploads')

def conn():
    c = sqlite3.connect(DB, timeout=20, check_same_thread=False)
    c.row_factory = sqlite3.Row
    c.execute('PRAGMA foreign_keys=ON')
    c.execute('PRAGMA journal_mode=WAL')
    return c

@contextmanager
def db():
    c=conn()
    try:
        yield c
        c.commit()
    except Exception:
        c.rollback()
        raise
    finally: c.close()

with db() as c:
    c.executescript('''
    CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, email TEXT UNIQUE NOT NULL, username TEXT UNIQUE NOT NULL,
      display_name TEXT NOT NULL, bio TEXT DEFAULT '', location TEXT DEFAULT '', interests TEXT DEFAULT '[]',
      avatar TEXT, password_hash TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS posts(id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), body TEXT NOT NULL,
      image TEXT, location TEXT DEFAULT '', topics TEXT DEFAULT '[]', created_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS post_classifications(post_id INTEGER PRIMARY KEY REFERENCES posts(id) ON DELETE CASCADE, method TEXT NOT NULL, categories TEXT NOT NULL DEFAULT '[]', updated_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS likes(user_id INTEGER REFERENCES users(id), post_id INTEGER REFERENCES posts(id) ON DELETE CASCADE,
      PRIMARY KEY(user_id,post_id));
    CREATE TABLE IF NOT EXISTS saved(user_id INTEGER REFERENCES users(id), post_id INTEGER REFERENCES posts(id) ON DELETE CASCADE,
      PRIMARY KEY(user_id,post_id));
    CREATE TABLE IF NOT EXISTS comments(id INTEGER PRIMARY KEY, user_id INTEGER REFERENCES users(id), post_id INTEGER REFERENCES posts(id) ON DELETE CASCADE,
      body TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS follows(follower_id INTEGER REFERENCES users(id), following_id INTEGER REFERENCES users(id),
      PRIMARY KEY(follower_id,following_id));
    CREATE TABLE IF NOT EXISTS journeys(id INTEGER PRIMARY KEY, owner_id INTEGER REFERENCES users(id), partner_id INTEGER REFERENCES users(id),
      title TEXT NOT NULL, focus TEXT NOT NULL, style TEXT NOT NULL, plan TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS conversations(id INTEGER PRIMARY KEY, user_a INTEGER REFERENCES users(id), user_b INTEGER REFERENCES users(id),
      UNIQUE(user_a,user_b));
    CREATE TABLE IF NOT EXISTS messages(id INTEGER PRIMARY KEY, conversation_id INTEGER REFERENCES conversations(id),
      sender_id INTEGER REFERENCES users(id), body TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
    ''')

def pwd_hash(password: str):
    salt=secrets.token_bytes(16)
    digest=hashlib.pbkdf2_hmac('sha256', password.encode(), salt, 300000)
    return base64.urlsafe_b64encode(salt+digest).decode()

def check_pwd(password: str, stored: str):
    try:
        raw=base64.urlsafe_b64decode(stored)
        return hmac.compare_digest(hashlib.pbkdf2_hmac('sha256',password.encode(),raw[:16],300000),raw[16:])
    except Exception: return False

def token(uid: int):
    payload=base64.urlsafe_b64encode(json.dumps({'id':uid,'exp':int(time.time())+60*60*24*14}).encode()).decode().rstrip('=')
    signature=hmac.new(SECRET.encode(),payload.encode(),hashlib.sha256).hexdigest()
    return payload+'.'+signature

def token_uid(value: str):
    try:
        payload,signature=value.split('.')
        if not hmac.compare_digest(hmac.new(SECRET.encode(),payload.encode(),hashlib.sha256).hexdigest(),signature): raise ValueError()
        decoded=json.loads(base64.urlsafe_b64decode(payload+'='*(-len(payload)%4)))
        if decoded['exp'] < time.time(): raise ValueError()
        return int(decoded['id'])
    except Exception: raise HTTPException(401,'Invalid or expired session')

def auth(authorization: str = ''):
    # dependency header is injected by FastAPI
    return None
from fastapi import Header

def current(authorization: Optional[str] = Header(default=None)):
    if not authorization or not authorization.startswith('Bearer '): raise HTTPException(401,'Sign in required')
    uid=token_uid(authorization[7:])
    with db() as c:
        row=c.execute('SELECT * FROM users WHERE id=?',(uid,)).fetchone()
    if not row: raise HTTPException(401,'Account not found')
    return dict(row)

def user_public(c, uid, viewer=None):
    row=c.execute('SELECT id,username,display_name,bio,location,interests,avatar FROM users WHERE id=?',(uid,)).fetchone()
    if not row: raise HTTPException(404,'User not found')
    d=dict(row);d['interests']=json.loads(d['interests'] or '[]')
    d['explorers']=c.execute('SELECT COUNT(*) FROM follows WHERE following_id=?',(uid,)).fetchone()[0]
    d['exploring']=c.execute('SELECT COUNT(*) FROM follows WHERE follower_id=?',(uid,)).fetchone()[0]
    d['posts']=c.execute('SELECT COUNT(*) FROM posts WHERE user_id=?',(uid,)).fetchone()[0]
    d['journeys']=c.execute('SELECT COUNT(*) FROM journeys WHERE owner_id=? OR partner_id=?',(uid,uid)).fetchone()[0]
    d['following']=bool(viewer and c.execute('SELECT 1 FROM follows WHERE follower_id=? AND following_id=?',(viewer,uid)).fetchone())
    return d

def post_public(c, row, viewer):
    d=dict(row); d['topics']=json.loads(d['topics'] or '[]')
    d['author']=user_public(c,d['user_id'],viewer)
    d['likes']=c.execute('SELECT COUNT(*) FROM likes WHERE post_id=?',(d['id'],)).fetchone()[0]
    d['comments']=c.execute('SELECT COUNT(*) FROM comments WHERE post_id=?',(d['id'],)).fetchone()[0]
    d['liked']=bool(c.execute('SELECT 1 FROM likes WHERE user_id=? AND post_id=?',(viewer,d['id'])).fetchone())
    d['saved']=bool(c.execute('SELECT 1 FROM saved WHERE user_id=? AND post_id=?',(viewer,d['id'])).fetchone())
    classification=c.execute('SELECT method,categories FROM post_classifications WHERE post_id=?',(d['id'],)).fetchone()
    d['classification']={'method':classification['method'],'categories':json.loads(classification['categories'])} if classification else None
    return d

class Register(BaseModel):
    email:str
    username:str
    display_name:str
    password:str
class Login(BaseModel):
    email:str
    password:str
class ProfileUpdate(BaseModel):
    display_name:str=Field(min_length=1,max_length=80)
    bio:str=Field(default='',max_length=400)
    location:str=Field(default='',max_length=100)
    interests:list[str]=Field(default_factory=list,max_length=25)
class PostIn(BaseModel):
    body:str=Field(min_length=1,max_length=3000)
    image:Optional[str]=None
    location:str=Field(default='',max_length=120)
    topics:list[str]=Field(default_factory=list,max_length=12)
class TextIn(BaseModel):
    body:str=Field(min_length=1,max_length=2000)
class JourneyIn(BaseModel):
    partner_id:Optional[int]=None
    focus:str=Field(min_length=1,max_length=80)
    style:str=Field(min_length=1,max_length=40)
class AIIn(BaseModel):
    prompt:str=Field(min_length=2,max_length=1000)

@app.get('/api/health')
def health(): return {'status':'ok','database':'sqlite','demo_data':False}

@app.post('/api/auth/register')
def register(body:Register):
    if len(body.password)<8: raise HTTPException(422,'Password must have at least 8 characters')
    if not re.fullmatch(r'[A-Za-z0-9_.]{3,30}',body.username): raise HTTPException(422,'Username must be 3–30 letters, digits, _ or .')
    if '@' not in body.email: raise HTTPException(422,'Enter a valid email address')
    try:
        with db() as c:
            cur=c.execute('INSERT INTO users(email,username,display_name,password_hash) VALUES(?,?,?,?)',
                (body.email.strip().lower(),body.username.strip().lower(),body.display_name.strip(),pwd_hash(body.password)))
            uid=cur.lastrowid
            return {'token':token(uid),'user':user_public(c,uid,uid)}
    except sqlite3.IntegrityError: raise HTTPException(409,'Email or username already registered')

@app.post('/api/auth/login')
def login(body:Login):
    with db() as c:
        row=c.execute('SELECT * FROM users WHERE email=?',(body.email.lower().strip(),)).fetchone()
        if not row or not check_pwd(body.password,row['password_hash']): raise HTTPException(401,'Incorrect email or password')
        return {'token':token(row['id']),'user':user_public(c,row['id'],row['id'])}

@app.get('/api/me')
def me(user=Depends(current)):
    with db() as c: return user_public(c,user['id'],user['id'])

@app.put('/api/me')
def update_profile(body:ProfileUpdate,user=Depends(current)):
    interests=list(dict.fromkeys(x.strip()[:60] for x in body.interests if x.strip()))
    with db() as c:
        c.execute('UPDATE users SET display_name=?,bio=?,location=?,interests=? WHERE id=?',
                  (body.display_name,body.bio,body.location,json.dumps(interests),user['id']))
        return user_public(c,user['id'],user['id'])

@app.post('/api/upload')
async def upload(file:UploadFile=File(...),user=Depends(current)):
    allowed={'image/jpeg':'.jpg','image/png':'.png','image/webp':'.webp'}
    if file.content_type not in allowed: raise HTTPException(415,'Only JPG, PNG or WebP images')
    raw=await file.read(6*1024*1024+1)
    if len(raw)>6*1024*1024: raise HTTPException(413,'Maximum file size is 6 MB')
    filename=secrets.token_hex(20)+allowed[file.content_type]
    (UPLOADS/filename).write_bytes(raw)
    return {'url':'/uploads/'+filename}

class AvatarIn(BaseModel):
    url:str
@app.put('/api/me/avatar')
def avatar(body:AvatarIn,user=Depends(current)):
    if not body.url.startswith('/uploads/') or '/' in body.url[9:] or not (UPLOADS/body.url[9:]).is_file(): raise HTTPException(400,'Upload an image first')
    with db() as c:
        c.execute('UPDATE users SET avatar=? WHERE id=?',(body.url,user['id']))
        return user_public(c,user['id'],user['id'])

@app.get('/api/users')
def users(q:str='',user=Depends(current)):
    with db() as c:
        rows=c.execute('SELECT id FROM users WHERE id!=? AND (username LIKE ? OR display_name LIKE ?) ORDER BY id DESC LIMIT 50',
            (user['id'],'%'+q+'%','%'+q+'%')).fetchall()
        return [user_public(c,r['id'],user['id']) for r in rows]

@app.get('/api/users/{uid}')
def get_user(uid:int,user=Depends(current)):
    with db() as c: return user_public(c,uid,user['id'])

@app.post('/api/users/{uid}/follow')
def follow(uid:int,user=Depends(current)):
    if uid==user['id']: raise HTTPException(400,'Cannot follow yourself')
    with db() as c:
        if not c.execute('SELECT 1 FROM users WHERE id=?',(uid,)).fetchone(): raise HTTPException(404,'User not found')
        existing=c.execute('SELECT 1 FROM follows WHERE follower_id=? AND following_id=?',(user['id'],uid)).fetchone()
        if existing:c.execute('DELETE FROM follows WHERE follower_id=? AND following_id=?',(user['id'],uid))
        else:c.execute('INSERT INTO follows VALUES(?,?)',(user['id'],uid))
        return {'following':not bool(existing)}

@app.get('/api/connections/{kind}')
def connections(kind:str,user=Depends(current)):
    if kind not in ('explorers','exploring'): raise HTTPException(404)
    with db() as c:
        if kind=='explorers':rows=c.execute('SELECT follower_id AS id FROM follows WHERE following_id=?',(user['id'],)).fetchall()
        else:rows=c.execute('SELECT following_id AS id FROM follows WHERE follower_id=?',(user['id'],)).fetchall()
        return [user_public(c,r['id'],user['id']) for r in rows]

@app.get('/api/posts')
def posts(q:str='',topic:str='',author_id:Optional[int]=None,saved_only:bool=False,user=Depends(current)):
    with db() as c:
        sql='SELECT * FROM posts WHERE 1=1';args=[]
        if q:sql+=' AND (body LIKE ? OR location LIKE ?)';args+=['%'+q+'%','%'+q+'%']
        if topic:sql+=' AND topics LIKE ?';args+=['%'+topic+'%']
        if author_id:sql+=' AND user_id=?';args.append(author_id)
        if saved_only:sql+=' AND id IN (SELECT post_id FROM saved WHERE user_id=?)';args.append(user['id'])
        sql+=' ORDER BY created_at DESC,id DESC LIMIT 100'
        return [post_public(c,r,user['id']) for r in c.execute(sql,args).fetchall()]

@app.get('/api/feed/for-you')
def for_you(user=Depends(current)):
    with db() as c:
        interests = {str(t).strip().casefold() for t in json.loads(user['interests'] or '[]') if str(t).strip()}
        following = {r['following_id'] for r in c.execute('SELECT following_id FROM follows WHERE follower_id=?', (user['id'],))}
        saved_posts = {r['post_id'] for r in c.execute('SELECT post_id FROM saved WHERE user_id=?', (user['id'],))}
        saved_topics = set()
        for r in c.execute('SELECT p.topics FROM posts p JOIN saved s ON s.post_id=p.id WHERE s.user_id=?', (user['id'],)):
            saved_topics.update(str(t).strip().casefold() for t in json.loads(r['topics'] or '[]'))
        rows = c.execute('SELECT * FROM posts ORDER BY id DESC LIMIT 200').fetchall()
        ranked = []
        for row in rows:
            tags = {str(t).strip().casefold() for t in json.loads(row['topics'] or '[]')}
            score = 4 * len(tags & interests) + 2 * len(tags & saved_topics)
            score += 3 if row['user_id'] in following else 0
            score += 1 if row['id'] in saved_posts else 0
            ranked.append((score, row['id'], post_public(c, row, user['id'])))
        ranked.sort(key=lambda x: (x[0], x[1]), reverse=True)
        return {'posts': [r[2] for r in ranked[:100]], 'method': 'profile-interests-saved-topics-following',
                'personalized': bool(interests or saved_topics or following)}

# Categories describe the post; topics preserve finer-grained cultural entities.
BYNTRA_CATEGORIES = (
    'Film & TV', 'Music', 'Dining', 'Travel', 'Fashion', 'Books', 'Art',
    'Events', 'Photography', 'Culture', 'Wellness', 'Gaming', 'Technology',
    'Nature', 'Theatre', 'Architecture', 'History', 'Design', 'Other'
)
CATEGORY_TERMS = {
    'Film & TV': ('film', 'movie', 'cinema', 'series', 'television', 'documentary', 'actor'),
    'Music': ('music', 'song', 'album', 'singer', 'soundtrack', 'jazz', 'orchestra', 'artist'),
    'Dining': ('restaurant', 'cafe', 'coffee', 'recipe', 'food', 'dinner', 'cuisine'),
    'Travel': ('flight', 'airport', 'travel', 'trip', 'hotel', 'destination', 'holiday'),
    'Fashion': ('fashion', 'outfit', 'dress', 'designer', 'runway', 'style'),
    'Books': ('book', 'novel', 'author', 'reading', 'literature', 'poetry', 'poem'),
    'Art': ('gallery', 'museum', 'exhibition', 'painting', 'sculpture', 'artwork'),
    'Events': ('concert', 'festival', 'tickets', 'event', 'poetry night', 'gig'),
    'Photography': ('photography', 'photograph', 'camera'),
    'Gaming': ('gaming', 'video game', 'console', 'esports'),
    'Theatre': ('theatre', 'theater', 'stage play', 'broadway'),
    'Architecture': ('architecture', 'building', 'architect'),
    'Nature': ('wildlife', 'forest', 'nature', 'hiking'),
    'Technology': ('technology', 'software', 'computer', 'coding'),
}


def heuristic_categories(text: str) -> list[str]:
    normalized = ' ' + re.sub(r'[^\w ]', ' ', text.casefold()) + ' '
    return [category for category, words in CATEGORY_TERMS.items()
            if any(' ' + term + ' ' in normalized for term in words)][:5]


async def classify_post_text(text: str):
    # A real model call, never an invented model response. Failure is explicitly recorded.
    if not os.getenv('GROQ_API_KEY', '').strip():
        return heuristic_categories(text), [], 'keyword-fallback'
    try:
        raw = await groq_text(
            'Classify the user-provided cultural post only. Return ONLY JSON with keys '
            '"categories" (array of 1-5 exact category names from the allowed list) and '
            '"topics" (array of 0-6 short subjects explicitly supported by the post). '
            'Do not invent subjects, named entities, places, or events. '
            'Allowed categories: ' + ', '.join(BYNTRA_CATEGORIES),
            text[:3000], 350)
        # Models sometimes wrap JSON in markdown; only parse an explicit JSON object.
        parsed = json.loads(raw[raw.index('{'):raw.rindex('}')+1])
        categories = [x for x in parsed.get('categories', [])
                      if isinstance(x, str) and x in BYNTRA_CATEGORIES][:5]
        topics = [x.strip()[:60] for x in parsed.get('topics', [])
                  if isinstance(x, str) and x.strip()][:6]
        return list(dict.fromkeys(categories)), list(dict.fromkeys(topics)), 'groq'
    except (HTTPException, ValueError, TypeError, KeyError):
        return heuristic_categories(text), [], 'keyword-fallback'


@app.post('/api/posts')
async def create_post(body:PostIn,user=Depends(current)):
    if body.image and (not body.image.startswith('/uploads/') or not (UPLOADS/body.image[9:]).is_file()):
        raise HTTPException(400,'Invalid uploaded image')
    if body.topics:
        categories = [t for t in body.topics if t in BYNTRA_CATEGORIES][:5]
        topics = list(dict.fromkeys(body.topics))
        method = 'user-provided'
    else:
        categories, topics, method = await classify_post_text(body.body)
    with db() as c:
        cur=c.execute('INSERT INTO posts(user_id,body,image,location,topics) VALUES(?,?,?,?,?)',
            (user['id'],body.body,body.image,body.location,json.dumps(topics)))
        c.execute('INSERT INTO post_classifications(post_id,method,categories) VALUES(?,?,?)',
                  (cur.lastrowid,method,json.dumps(categories)))
        return post_public(c,c.execute('SELECT * FROM posts WHERE id=?',(cur.lastrowid,)).fetchone(),user['id'])


class PostCategoriesUpdate(BaseModel):
    categories: list[str] = Field(default_factory=list, max_length=5)
    topics: list[str] = Field(default_factory=list, max_length=12)


@app.put('/api/posts/{pid}/categories')
def correct_post_categories(pid:int, body:PostCategoriesUpdate, user=Depends(current)):
    if any(x not in BYNTRA_CATEGORIES for x in body.categories):
        raise HTTPException(422, 'Unknown category')
    with db() as c:
        row=c.execute('SELECT * FROM posts WHERE id=?',(pid,)).fetchone()
        if not row: raise HTTPException(404, 'Post not found')
        if row['user_id'] != user['id']: raise HTTPException(403, 'Only the author can edit categories')
        topics = list(dict.fromkeys(t.strip()[:60] for t in body.topics if t.strip()))
        c.execute('UPDATE posts SET topics=? WHERE id=?',(json.dumps(topics),pid))
        c.execute('INSERT INTO post_classifications(post_id,method,categories) VALUES(?,?,?) '
                  'ON CONFLICT(post_id) DO UPDATE SET method=excluded.method,categories=excluded.categories,updated_at=CURRENT_TIMESTAMP',
                  (pid,'user-corrected',json.dumps(list(dict.fromkeys(body.categories)))))
        return post_public(c,c.execute('SELECT * FROM posts WHERE id=?',(pid,)).fetchone(),user['id'])


@app.get('/api/posts/{pid}/explore-more')
def explore_more(pid:int, user=Depends(current)):
    with db() as c:
        source=c.execute('SELECT * FROM posts WHERE id=?',(pid,)).fetchone()
        if not source: raise HTTPException(404, 'Post not found')
        src_tags={str(t).strip().casefold() for t in json.loads(source['topics'] or '[]') if str(t).strip()}
        record=c.execute('SELECT categories FROM post_classifications WHERE post_id=?',(pid,)).fetchone()
        src_categories=set(json.loads(record['categories'])) if record else set()
        candidates=c.execute('SELECT * FROM posts WHERE id!=? ORDER BY id DESC LIMIT 500',(pid,)).fetchall()
        ranked=[]
        for row in candidates:
            tags={str(t).strip().casefold() for t in json.loads(row['topics'] or '[]') if str(t).strip()}
            r=c.execute('SELECT categories FROM post_classifications WHERE post_id=?',(row['id'],)).fetchone()
            cats=set(json.loads(r['categories'])) if r else set()
            shared_tags=sorted(src_tags & tags)
            shared_categories=sorted(src_categories & cats)
            score=4*len(shared_tags)+len(shared_categories)
            if score:
                ranked.append((score,row['id'],{'post':post_public(c,row,user['id']),
                    'shared_topics':shared_tags,'shared_categories':shared_categories}))
        ranked.sort(key=lambda x:(x[0],x[1]),reverse=True)
        # These are suggested searches, not claims of live external recommendations.
        seed=next(iter(sorted(src_tags)), None) or next(iter(sorted(src_categories)), None)
        suggestions=[{'category':cat,'query':f'{seed} {cat}' if seed else cat}
                     for cat in ('Film & TV','Music','Books','Events','Travel','Art','Dining')
                     if cat not in src_categories][:5]
        return {'source_post':post_public(c,source,user['id']),
                'related_posts':[r[2] for r in ranked[:12]],
                'discovery_queries':suggestions,
                'method':'real-post-topic-and-category-overlap',
                'external_results_verified':False}

@app.delete('/api/posts/{pid}')
def delete_post(pid:int,user=Depends(current)):
    with db() as c:
        row=c.execute('SELECT user_id FROM posts WHERE id=?',(pid,)).fetchone()
        if not row:raise HTTPException(404)
        if row['user_id']!=user['id']:raise HTTPException(403)
        c.execute('DELETE FROM posts WHERE id=?',(pid,))
        return {'deleted':True}

@app.get('/api/posts/{pid}')
def get_post(pid:int,user=Depends(current)):
    with db() as c:
        row=c.execute('SELECT * FROM posts WHERE id=?',(pid,)).fetchone()
        if not row:raise HTTPException(404)
        return post_public(c,row,user['id'])

@app.post('/api/posts/{pid}/{action}')
def toggle_post(pid:int,action:str,user=Depends(current)):
    if action not in ('like','save'):raise HTTPException(404)
    table='likes' if action=='like' else 'saved'
    with db() as c:
        if not c.execute('SELECT 1 FROM posts WHERE id=?',(pid,)).fetchone():raise HTTPException(404)
        exists=c.execute(f'SELECT 1 FROM {table} WHERE user_id=? AND post_id=?',(user['id'],pid)).fetchone()
        if exists:c.execute(f'DELETE FROM {table} WHERE user_id=? AND post_id=?',(user['id'],pid))
        else:c.execute(f'INSERT INTO {table}(user_id,post_id) VALUES(?,?)',(user['id'],pid))
        return {'active':not bool(exists)}

@app.get('/api/posts/{pid}/comments')
def get_comments(pid:int,user=Depends(current)):
    with db() as c:
        rows=c.execute('SELECT * FROM comments WHERE post_id=? ORDER BY id',(pid,)).fetchall()
        return [{**dict(r),'author':user_public(c,r['user_id'],user['id'])} for r in rows]

@app.post('/api/posts/{pid}/comments')
def add_comment(pid:int,body:TextIn,user=Depends(current)):
    with db() as c:
        if not c.execute('SELECT 1 FROM posts WHERE id=?',(pid,)).fetchone():raise HTTPException(404)
        cur=c.execute('INSERT INTO comments(user_id,post_id,body) VALUES(?,?,?)',(user['id'],pid,body.body))
        r=c.execute('SELECT * FROM comments WHERE id=?',(cur.lastrowid,)).fetchone()
        return {**dict(r),'author':user_public(c,user['id'],user['id'])}

# Explorer Compatibility: rankings are evidence-based, not percentages.
def explorer_taste(c, uid: int):
    row = c.execute('SELECT interests FROM users WHERE id=?', (uid,)).fetchone()
    if not row:
        raise HTTPException(404, 'Explorer not found.')
    interests = {str(v).strip().casefold() for v in json.loads(row['interests'] or '[]') if str(v).strip()}
    topics = set()
    for post in c.execute('SELECT topics FROM posts WHERE user_id=?', (uid,)).fetchall():
        topics.update(str(v).strip().casefold() for v in json.loads(post['topics'] or '[]') if str(v).strip())
    return {'interests': interests, 'public_topics': topics, 'combined': interests | topics}


def explorer_match(c, viewer_id: int, other_id: int):
    viewer = explorer_taste(c, viewer_id)
    other = explorer_taste(c, other_id)
    shared = viewer['combined'] & other['combined']
    if not shared:
        return None
    shared_profiles = viewer['interests'] & other['interests']
    shared_posts = viewer['public_topics'] & other['public_topics']
    score = 5 * len(shared_profiles) + 3 * len(shared_posts) + 2 * len(shared)
    return {'user': user_public(c, other_id, viewer_id), 'score': score,
            'shared_interests': sorted(shared), 'shared_profile_interests': sorted(shared_profiles),
            'shared_public_topics': sorted(shared_posts),
            'new_interests_to_explore': sorted(other['combined'] - viewer['combined'])[:6],
            'method': 'real-profile-and-public-post-overlap', 'source': 'BYNTRA database'}


@app.get('/api/explorers/compatibility')
def compatible_explorers(limit: int = 12, user=Depends(current)):
    limit = max(1, min(limit, 30))
    with db() as c:
        ids = c.execute('SELECT id FROM users WHERE id!=? ORDER BY id DESC LIMIT 500', (user['id'],)).fetchall()
        matches = [m for r in ids if (m := explorer_match(c, user['id'], r['id'])) is not None]
        matches.sort(key=lambda m: (m['score'], len(m['shared_interests'])), reverse=True)
        return {'matches': matches[:limit], 'total_matches': len(matches), 'personalized': True,
                'method': 'real-profile-and-public-post-overlap', 'score_type': 'relative-ranking-not-percentage'}


class ExplorerExplanationIn(BaseModel):
    explorer_id: int


@app.post('/api/explorers/compatibility/explain')
async def explain_explorer_compatibility(body: ExplorerExplanationIn, user=Depends(current)):
    if body.explorer_id == user['id']:
        raise HTTPException(400, 'You cannot match with yourself.')
    with db() as c:
        match = explorer_match(c, user['id'], body.explorer_id)
        if match is None:
            raise HTTPException(422, 'No verified cultural overlap was found.')
        evidence = {key: match[key] for key in ('shared_interests', 'shared_profile_interests',
                                                 'shared_public_topics', 'new_interests_to_explore')}
    explanation = await groq_text(
        'You are BYNTRA AI. Explain why two Explorers may connect culturally in 3-5 sentences. '
        'Use only the supplied evidence. Suggest one new cultural experience. Do not invent facts, '
        'relationships, Qloo results or private information. Do not imply romantic compatibility.',
        json.dumps(evidence, ensure_ascii=False), 450)
    return {'explorer_id': body.explorer_id, 'explanation': explanation,
            'shared_interests': match['shared_interests'], 'provider': 'Groq',
            'grounding': 'Real BYNTRA profile interests and public post topics'}


@app.get('/api/bridges/{pid}')
def bridges(pid:int,user=Depends(current)):
    # Deterministic matching against actual user-created topics and posts; NOT presented as an AI model result.
    with db() as c:
        src=c.execute('SELECT * FROM posts WHERE id=?',(pid,)).fetchone()
        if not src:raise HTTPException(404)
        topics=set(json.loads(src['topics'] or '[]'))
        candidates=c.execute('SELECT * FROM posts WHERE id!=? ORDER BY id DESC LIMIT 300',(pid,)).fetchall()
        matches=[]
        for r in candidates:
            shared=topics.intersection(json.loads(r['topics'] or '[]'))
            if shared:matches.append({'post':post_public(c,r,user['id']),'shared_topics':sorted(shared)})
        matches.sort(key=lambda x:len(x['shared_topics']),reverse=True)
        return {'method':'real-post-topic-overlap','matches':matches[:10]}


async def groq_text(system_text: str, user_text: str, max_tokens: int = 1200) -> str:
    key = os.getenv('GROQ_API_KEY', '').strip()
    if not key:
        raise HTTPException(503, 'Groq is not configured. Set GROQ_API_KEY.')
    try:
        async with httpx.AsyncClient(timeout=55) as client:
            result = await client.post(
                'https://api.groq.com/openai/v1/chat/completions',
                headers={'Authorization': f'Bearer {key}'},
                json={'model': os.getenv('GROQ_MODEL', 'openai/gpt-oss-20b'),
                      'messages': [{'role': 'system', 'content': system_text},
                                   {'role': 'user', 'content': user_text}],
                      'max_completion_tokens': max_tokens})
        result.raise_for_status()
        answer = (result.json()['choices'][0]['message'].get('content') or '').strip()
        if not answer:
            raise HTTPException(502, 'Groq returned no text.')
        return answer
    except httpx.HTTPStatusError as exc:
        raise HTTPException(502, f'Groq returned HTTP {exc.response.status_code}.')
    except httpx.RequestError:
        raise HTTPException(502, 'Groq could not be reached.')
    except (KeyError, IndexError, TypeError, ValueError):
        raise HTTPException(502, 'Groq response was invalid.')

class BridgeExplainIn(BaseModel):
    related_post_id: int

@app.post('/api/bridges/{pid}/explain')
async def explain_bridge(pid: int, body: BridgeExplainIn, user=Depends(current)):
    with db() as c:
        first = c.execute('SELECT * FROM posts WHERE id=?', (pid,)).fetchone()
        second = c.execute('SELECT * FROM posts WHERE id=?', (body.related_post_id,)).fetchone()
        if not first or not second or pid == body.related_post_id:
            raise HTTPException(404, 'Posts not found.')
        shared = sorted(set(json.loads(first['topics'] or '[]')) & set(json.loads(second['topics'] or '[]')))
        if not shared:
            raise HTTPException(422, 'These posts do not have a verified shared topic.')
        payload = {'first_post': first['body'][:600], 'second_post': second['body'][:600],
                   'first_topics': json.loads(first['topics'] or '[]'),
                   'second_topics': json.loads(second['topics'] or '[]'), 'shared_topics': shared}
    explanation = await groq_text(
        'You are BYNTRA AI. Explain in 2-4 short sentences how two real community posts are culturally connected. '
        'Use only supplied post text and tags as evidence. Be insightful, concrete, and friendly. '
        'Do not invent shared experiences, real-world facts, or Qloo results.',
        json.dumps(payload, ensure_ascii=False), 700)
    return {'explanation': explanation, 'shared_topics': shared, 'provider': 'Groq',
            'grounding': 'Real community posts and shared tags; AI interpretation'}

class JourneyGenerateIn(BaseModel):
    notes: str = Field(default='', max_length=1000)

@app.post('/api/journeys/{jid}/generate')
async def generate_journey(jid: int, body: JourneyGenerateIn, user=Depends(current)):
    with db() as c:
        journey = c.execute('SELECT * FROM journeys WHERE id=?', (jid,)).fetchone()
        if not journey:
            raise HTTPException(404, 'Journey not found.')
        if user['id'] not in (journey['owner_id'], journey['partner_id']):
            raise HTTPException(403, 'Not a journey participant.')
        require_active_journey(journey, user['id'])
        owner = c.execute('SELECT interests FROM users WHERE id=?', (journey['owner_id'],)).fetchone()
        partner = c.execute('SELECT interests FROM users WHERE id=?', (journey['partner_id'],)).fetchone() if journey['partner_id'] else None
        current_plan = json.loads(journey['plan'])
        details = {'focus': journey['focus'], 'style': journey['style'],
                   'owner_interests': json.loads(owner['interests'] or '[]'),
                   'partner_interests': json.loads(partner['interests'] or '[]') if partner else [],
                   'existing_activities': [a.get('text', '') for a in current_plan.get('activities', [])],
                   'user_notes': body.notes}
    suggestion = await groq_text(
        'You are BYNTRA AI planning a shared cultural journey. Give a useful, personal, creative itinerary '
        'in Markdown with a short title, 3-6 proposed activities and why they connect the supplied interests. '
        'Respect the focus and style. Suggestions are NOT bookings or verified venues/events. '
        'Do not invent personal details, live availability, prices, Qloo data, or confirmed bookings. '
        'Do not use Markdown tables. Keep it under 450 words.',
        json.dumps(details, ensure_ascii=False), 2200)
    with db() as c:
        fresh = c.execute('SELECT plan,owner_id,partner_id FROM journeys WHERE id=?', (jid,)).fetchone()
        if not fresh or user['id'] not in (fresh['owner_id'], fresh['partner_id']):
            raise HTTPException(403, 'Journey access changed.')
        require_active_journey(fresh, user['id'])
        plan = json.loads(fresh['plan'])
        plan['ai_suggestion'] = {'text': suggestion, 'provider': 'Groq',
                                 'generated_at': datetime.now(timezone.utc).isoformat(),
                                 'verified': False}
        c.execute('UPDATE journeys SET plan=? WHERE id=?', (json.dumps(plan), jid))
    return {'plan': plan, 'source': 'Groq', 'saved': True}

@app.post('/api/ai/assist')
async def ai_assist(body: AIIn, user=Depends(current)):
    key = os.getenv("GROQ_API_KEY", "").strip()

    if not key:
        raise HTTPException(
            status_code=503,
            detail="Groq is not configured. Set GROQ_API_KEY."
        )

    with db() as c:
        profile = user_public(c, user["id"], user["id"])

        posts = c.execute(
            "SELECT body, topics FROM posts "
            "ORDER BY id DESC LIMIT 15"
        ).fetchall()

        context = [
            {
                "body": row["body"][:300],
                "topics": json.loads(row["topics"])
            }
            for row in posts
        ]

    system_prompt = (
        "You are BYNTRA AI, a thoughtful cultural discovery "
        "assistant inside BYNTRA, a premium social platform. "
        "BYNTRA's tagline is 'Find the Path Between Us'. "
        "Help users explore film, television, music, books, "
        "dining, travel, fashion, art, events, and other "
        "cultural interests. Suggest connections between "
        "interests, explain cultural similarities, and help "
        "users plan shared experiences. "
        "Be natural, warm, creative and concise. "
        "Only treat supplied profile and community data as "
        "verified app data. Do not invent real users, posts, "
        "venues, events, prices or API results. "
        "If recommending something from general model "
        "knowledge, clearly distinguish it from verified "
        "live discovery results. "
        "Do not claim that Qloo has supplied recommendations "
        "unless actual Qloo results are provided."
    )

    user_context = {
        "interests": profile.get("interests", []),
        "recent_community_posts": context
    }

    messages = [
        {
            "role": "system",
            "content": system_prompt
        },
        {
            "role": "user",
            "content": (
                "Available BYNTRA context:\n"
                + json.dumps(user_context, ensure_ascii=False)
                + "\n\nUser question:\n"
                + body.prompt
            )
        }
    ]

    model = os.getenv(
        "GROQ_MODEL",
        "openai/gpt-oss-20b"
    )

    try:
        async with httpx.AsyncClient(timeout=45) as client:
            response = await client.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {key}",
                    "Content-Type": "application/json"
                },
                json={
                    "model": model,
                    "messages": messages,
                    "max_completion_tokens": 3000
                }
            )

            response.raise_for_status()
            result = response.json()

        answer = (
            result["choices"][0]["message"]
            .get("content") or ""
        ).strip()

        if not answer:
            raise HTTPException(
                status_code=502,
                detail="Groq returned an empty response."
            )

        return {
            "answer": answer,
            "provider": "Groq",
            "grounding": (
                "User interests and available community "
                "posts; external facts not independently verified"
            )
        }

    except httpx.HTTPStatusError as exc:
        status = exc.response.status_code

        if status == 401:
            detail = "Groq API key was rejected."
        elif status == 429:
            detail = "Groq rate limit reached. Try again shortly."
        else:
            detail = f"Groq API returned HTTP {status}."

        raise HTTPException(
            status_code=502,
            detail=detail
        )

    except httpx.RequestError:
        raise HTTPException(
            status_code=502,
            detail="Unable to connect to Groq."
        )

    except (KeyError, IndexError, TypeError, ValueError):
        raise HTTPException(
            status_code=502,
            detail="Unexpected response from Groq."
        )


def require_active_journey(journey, uid: int):
    if uid not in (journey['owner_id'], journey['partner_id']):
        raise HTTPException(403, 'You are not a journey participant.')
    plan = json.loads(journey['plan'])
    if journey['partner_id'] is not None and plan.get('status', 'accepted') != 'accepted':
        raise HTTPException(403, 'The shared journey invitation must be accepted first.')
    return plan


@app.post('/api/journeys')
def create_journey(body: JourneyIn, user=Depends(current)):
    if body.partner_id == user['id']:
        raise HTTPException(400, 'Select another Explorer.')
    with db() as c:
        if body.partner_id is not None and not c.execute('SELECT 1 FROM users WHERE id=?', (body.partner_id,)).fetchone():
            raise HTTPException(404, 'Explorer not found.')
        plan = {'status': 'pending' if body.partner_id is not None else 'accepted',
                'activities': [], 'ai_suggestion': None}
        title = f'{body.focus} journey'
        cur = c.execute('INSERT INTO journeys(owner_id,partner_id,title,focus,style,plan) VALUES(?,?,?,?,?,?)',
                        (user['id'], body.partner_id, title, body.focus, body.style, json.dumps(plan)))
        return {'id': cur.lastrowid, 'owner_id': user['id'], 'partner_id': body.partner_id,
                'title': title, 'focus': body.focus, 'style': body.style, 'plan': plan}


class JourneyInvitationResponse(BaseModel):
    action: str


@app.post('/api/journeys/{jid}/respond')
def respond_to_journey(jid: int, body: JourneyInvitationResponse, user=Depends(current)):
    if body.action not in ('accept', 'decline'):
        raise HTTPException(400, 'Action must be accept or decline.')
    with db() as c:
        journey = c.execute('SELECT * FROM journeys WHERE id=?', (jid,)).fetchone()
        if not journey:
            raise HTTPException(404, 'Journey not found.')
        if journey['partner_id'] != user['id']:
            raise HTTPException(403, 'Only the invited Explorer can respond.')
        plan = json.loads(journey['plan'])
        if plan.get('status') != 'pending':
            raise HTTPException(409, 'This invitation is no longer pending.')
        plan['status'] = 'accepted' if body.action == 'accept' else 'declined'
        c.execute('UPDATE journeys SET plan=? WHERE id=?', (json.dumps(plan), jid))
        return {'journey_id': jid, 'status': plan['status'],
                'message': 'Journey invitation accepted.' if body.action == 'accept' else 'Journey invitation declined.'}


@app.get('/api/journeys')
def list_journeys(user=Depends(current)):
    with db() as c:
        return [{**dict(r),'plan':json.loads(r['plan'])} for r in c.execute('SELECT * FROM journeys WHERE owner_id=? OR partner_id=? ORDER BY id DESC',(user['id'],user['id'])).fetchall()]

class ActivityIn(BaseModel):
    activity: str = Field(min_length=1, max_length=400)


class ActivityVoteIn(BaseModel):
    vote: str = Field(pattern='^(yes|no|clear)$')


def journey_activity_response(c, journey_id, plan):
    enriched = []
    for activity in plan.get('activities', []):
        item = dict(activity)
        author_id = item.get('author_id')
        author = c.execute(
            'SELECT id,username,display_name,avatar FROM users WHERE id=?',
            (author_id,)
        ).fetchone() if author_id is not None else None
        item['author'] = dict(author) if author else None
        item['votes'] = {str(k): v for k, v in item.get('votes', {}).items()
                         if v in ('yes', 'no')}
        enriched.append(item)
    return {'journey_id': journey_id, 'status': plan.get('status', 'accepted'),
            'activities': enriched, 'total': len(enriched)}


@app.get('/api/journeys/{jid}/activities')
def get_journey_activities(jid: int, user=Depends(current)):
    with db() as c:
        journey = c.execute('SELECT * FROM journeys WHERE id=?', (jid,)).fetchone()
        if not journey:
            raise HTTPException(404, 'Journey not found.')
        plan = require_active_journey(journey, user['id'])
        return journey_activity_response(c, jid, plan)


@app.post('/api/journeys/{jid}/activities')
def add_activity(jid: int, body: ActivityIn, user=Depends(current)):
    with db() as c:
        c.execute('BEGIN IMMEDIATE')
        journey = c.execute('SELECT * FROM journeys WHERE id=?', (jid,)).fetchone()
        if not journey:
            raise HTTPException(404, 'Journey not found.')
        plan = require_active_journey(journey, user['id'])
        text = body.activity.strip()
        if not text:
            raise HTTPException(422, 'Activity cannot be empty.')
        plan.setdefault('activities', []).append({
            'id': secrets.token_hex(12), 'text': text, 'author_id': user['id'],
            'created_at': datetime.now(timezone.utc).isoformat(), 'votes': {}
        })
        c.execute('UPDATE journeys SET plan=? WHERE id=?', (json.dumps(plan), jid))
        return journey_activity_response(c, jid, plan)


@app.delete('/api/journeys/{jid}/activities/{activity_id}')
def remove_journey_activity(jid: int, activity_id: str, user=Depends(current)):
    with db() as c:
        c.execute('BEGIN IMMEDIATE')
        journey = c.execute('SELECT * FROM journeys WHERE id=?', (jid,)).fetchone()
        if not journey:
            raise HTTPException(404, 'Journey not found.')
        plan = require_active_journey(journey, user['id'])
        activities = plan.get('activities', [])
        target = next((a for a in activities if a.get('id') == activity_id), None)
        if target is None:
            raise HTTPException(404, 'Activity not found.')
        if target.get('author_id') != user['id']:
            raise HTTPException(403, 'You can only remove activities you added.')
        plan['activities'] = [a for a in activities if a.get('id') != activity_id]
        c.execute('UPDATE journeys SET plan=? WHERE id=?', (json.dumps(plan), jid))
        return journey_activity_response(c, jid, plan)


@app.post('/api/journeys/{jid}/activities/{activity_id}/vote')
def vote_journey_activity(jid: int, activity_id: str, body: ActivityVoteIn, user=Depends(current)):
    with db() as c:
        c.execute('BEGIN IMMEDIATE')
        journey = c.execute('SELECT * FROM journeys WHERE id=?', (jid,)).fetchone()
        if not journey:
            raise HTTPException(404, 'Journey not found.')
        plan = require_active_journey(journey, user['id'])
        target = next((a for a in plan.get('activities', []) if a.get('id') == activity_id), None)
        if target is None:
            raise HTTPException(404, 'Activity not found.')
        votes = target.setdefault('votes', {})
        key = str(user['id'])
        if body.vote == 'clear':
            votes.pop(key, None)
        else:
            votes[key] = body.vote
        c.execute('UPDATE journeys SET plan=? WHERE id=?', (json.dumps(plan), jid))
        return journey_activity_response(c, jid, plan)


@app.get('/api/journeys/invitations/pending')
def pending_journey_invitations(user=Depends(current)):
    with db() as c:
        rows = c.execute('SELECT * FROM journeys WHERE partner_id=? ORDER BY id DESC',
                         (user['id'],)).fetchall()
        invitations = []
        for row in rows:
            plan = json.loads(row['plan'] or '{}')
            if plan.get('status') != 'pending':
                continue
            invitations.append({'id': row['id'], 'title': row['title'],
                                'focus': row['focus'], 'style': row['style'],
                                'status': 'pending',
                                'inviter': user_public(c, row['owner_id'], user['id']),
                                'created_at': row['created_at']})
        return {'invitations': invitations, 'count': len(invitations)}


@app.get('/api/conversations')
def list_conversations(user=Depends(current)):
    with db() as c:
        rows=c.execute('SELECT * FROM conversations WHERE user_a=? OR user_b=? ORDER BY id DESC',(user['id'],user['id'])).fetchall()
        return [{'id':r['id'],'other':user_public(c,r['user_b'] if r['user_a']==user['id'] else r['user_a'],user['id'])} for r in rows]

@app.post('/api/conversations/{other_id}')
def open_conversation(other_id:int,user=Depends(current)):
    if other_id==user['id']:raise HTTPException(400,'Cannot message yourself')
    a,b=sorted((user['id'],other_id))
    with db() as c:
        if not c.execute('SELECT 1 FROM users WHERE id=?',(other_id,)).fetchone():raise HTTPException(404)
        c.execute('INSERT OR IGNORE INTO conversations(user_a,user_b) VALUES(?,?)',(a,b))
        r=c.execute('SELECT id FROM conversations WHERE user_a=? AND user_b=?',(a,b)).fetchone()
        return {'id':r['id']}

@app.get('/api/conversations/{cid}/messages')
def get_messages(cid:int,user=Depends(current)):
    with db() as c:
        r=c.execute('SELECT * FROM conversations WHERE id=?',(cid,)).fetchone()
        if not r:raise HTTPException(404)
        if user['id'] not in (r['user_a'],r['user_b']):raise HTTPException(403)
        return [dict(x) for x in c.execute('SELECT * FROM messages WHERE conversation_id=? ORDER BY id',(cid,)).fetchall()]

@app.post('/api/conversations/{cid}/messages')
def send_message(cid:int,body:TextIn,user=Depends(current)):
    with db() as c:
        r=c.execute('SELECT * FROM conversations WHERE id=?',(cid,)).fetchone()
        if not r:raise HTTPException(404)
        if user['id'] not in (r['user_a'],r['user_b']):raise HTTPException(403)
        cur=c.execute('INSERT INTO messages(conversation_id,sender_id,body) VALUES(?,?,?)',(cid,user['id'],body.body))
        return dict(c.execute('SELECT * FROM messages WHERE id=?',(cur.lastrowid,)).fetchone())

# WebRTC signalling relay: messages are forwarded only between authenticated members of a journey.
# Real video requires secure HTTPS deployment (except localhost) and TURN for some networks.
rooms:dict[int,dict[int,WebSocket]]=defaultdict(dict)
@app.websocket('/ws/journeys/{jid}')
async def journey_ws(ws:WebSocket,jid:int,session:str=Query(default='')):
    try: uid=token_uid(session)
    except HTTPException:
        await ws.close(code=1008);return
    with db() as c:
        r=c.execute('SELECT * FROM journeys WHERE id=?',(jid,)).fetchone()
        if not r or uid not in (r['owner_id'],r['partner_id']):
            await ws.close(code=1008);return
        try:
            require_active_journey(r, uid)
        except HTTPException:
            await ws.close(code=1008);return
    await ws.accept()
    rooms[jid][uid]=ws
    for peer,client in list(rooms[jid].items()):
        if peer!=uid:
            try:await client.send_json({'type':'peer-joined','user_id':uid})
            except Exception:pass
    try:
        while True:
            msg=await ws.receive_json()
            if msg.get('type') not in ('offer','answer','ice','chat'):continue
            for peer,client in list(rooms[jid].items()):
                if peer!=uid:
                    await client.send_json({'type':msg['type'],'from':uid,'payload':msg.get('payload')})
    except (WebSocketDisconnect,RuntimeError):pass
    finally:
        if rooms[jid].get(uid)==ws:rooms[jid].pop(uid,None)
        for peer,client in list(rooms[jid].items()):
            try:await client.send_json({'type':'peer-left','user_id':uid})
            except Exception:pass
from qloo_routes import router as qloo_router

app.include_router(qloo_router)