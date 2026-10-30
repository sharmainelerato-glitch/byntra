"""BYNTRA public journey publishing, social interactions, and private forwarding.
Publishing is explicit and creates a separate public snapshot; private plans never exposed.
"""
import json
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

router = APIRouter(prefix='/api/journey-social', tags=['Public cultural journeys'])

async def signed_user(request: Request):
    from main import current
    return current(request.headers.get('authorization'))

def setup(c):
    c.executescript('''
    CREATE TABLE IF NOT EXISTS public_journeys(
      id INTEGER PRIMARY KEY, owner_id INTEGER NOT NULL REFERENCES users(id),
      source_journey_id INTEGER REFERENCES journeys(id) ON DELETE SET NULL,
      title TEXT NOT NULL, story TEXT NOT NULL, image TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS public_journey_likes(
      user_id INTEGER NOT NULL REFERENCES users(id), journey_id INTEGER NOT NULL REFERENCES public_journeys(id) ON DELETE CASCADE,
      PRIMARY KEY(user_id,journey_id));
    CREATE TABLE IF NOT EXISTS public_journey_saves(
      user_id INTEGER NOT NULL REFERENCES users(id), journey_id INTEGER NOT NULL REFERENCES public_journeys(id) ON DELETE CASCADE,
      PRIMARY KEY(user_id,journey_id));
    CREATE TABLE IF NOT EXISTS public_journey_comments(
      id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id),
      journey_id INTEGER NOT NULL REFERENCES public_journeys(id) ON DELETE CASCADE,
      body TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS public_journey_reposts(
      user_id INTEGER NOT NULL REFERENCES users(id), journey_id INTEGER NOT NULL REFERENCES public_journeys(id) ON DELETE CASCADE,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(user_id,journey_id));
    CREATE TABLE IF NOT EXISTS public_journey_forwards(
      id INTEGER PRIMARY KEY, sender_id INTEGER NOT NULL REFERENCES users(id),
      recipient_id INTEGER NOT NULL REFERENCES users(id),
      journey_id INTEGER NOT NULL REFERENCES public_journeys(id) ON DELETE CASCADE,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP);
    ''')

def data(c, row, viewer):
    from main import user_public
    d=dict(row)
    d['author']=user_public(c,d['owner_id'],viewer)
    for table, name in [('public_journey_likes','likes'),('public_journey_comments','comments'),('public_journey_reposts','reposts')]:
        d[name]=c.execute(f'SELECT COUNT(*) FROM {table} WHERE journey_id=?',(d['id'],)).fetchone()[0]
    for table, name in [('public_journey_likes','liked'),('public_journey_saves','saved'),('public_journey_reposts','reposted')]:
        d[name]=bool(c.execute(f'SELECT 1 FROM {table} WHERE journey_id=? AND user_id=?',(d['id'],viewer)).fetchone())
    return d

class PublishIn(BaseModel):
    source_journey_id: int
    title: str = Field(min_length=2,max_length=120)
    story: str = Field(min_length=5,max_length=4000)
    image: str | None = None

@router.post('/publish')
def publish(body:PublishIn,user=Depends(signed_user)):
    from main import db, UPLOADS
    with db() as c:
        setup(c)
        source=c.execute('SELECT * FROM journeys WHERE id=?',(body.source_journey_id,)).fetchone()
        if not source:raise HTTPException(404,'Source journey not found.')
        if source['owner_id']!=user['id']:
            raise HTTPException(403,'Only the journey creator may publish a public story.')
        if json.loads(source['plan']).get('status')!='accepted':
            raise HTTPException(409,'You cannot publish an unaccepted shared journey.')
        # No partner content, messages, or activities are copied. Story is authored explicitly.
        if body.image and (not body.image.startswith('/uploads/') or '/' in body.image[9:] or not (UPLOADS/body.image[9:]).is_file()):
            raise HTTPException(422,'Upload the cover image first.')
        cur=c.execute('INSERT INTO public_journeys(owner_id,source_journey_id,title,story,image) VALUES(?,?,?,?,?)',
            (user['id'],source['id'],body.title.strip(),body.story.strip(),body.image))
        return data(c,c.execute('SELECT * FROM public_journeys WHERE id=?',(cur.lastrowid,)).fetchone(),user['id'])

@router.get('')
def feed(saved_only:bool=False,user=Depends(signed_user)):
    from main import db
    with db() as c:
        setup(c)
        query=('SELECT p.* FROM public_journeys p JOIN public_journey_saves s ON s.journey_id=p.id AND s.user_id=? ORDER BY p.id DESC LIMIT 100'
               if saved_only else 'SELECT * FROM public_journeys ORDER BY id DESC LIMIT 100')
        rows=c.execute(query,(user['id'],) if saved_only else ()).fetchall()
        return [data(c,row,user['id']) for row in rows]

@router.get('/forwards')
def forwards(user=Depends(signed_user)):
    from main import db, user_public
    with db() as c:
        setup(c)
        rows=c.execute('SELECT * FROM public_journey_forwards WHERE recipient_id=? ORDER BY id DESC LIMIT 100',(user['id'],)).fetchall()
        return [{'id':r['id'],'journey':data(c,c.execute('SELECT * FROM public_journeys WHERE id=?',(r['journey_id'],)).fetchone(),user['id']),
                 'sender':user_public(c,r['sender_id'],user['id'])} for r in rows]

@router.get('/{jid}')
def detail(jid:int,user=Depends(signed_user)):
    from main import db
    with db() as c:
        setup(c)
        row=c.execute('SELECT * FROM public_journeys WHERE id=?',(jid,)).fetchone()
        if not row:raise HTTPException(404)
        return data(c,row,user['id'])

class CommentIn(BaseModel):
    body:str=Field(min_length=1,max_length=1200)

@router.get('/{jid}/comments')
def comments(jid:int,user=Depends(signed_user)):
    from main import db, user_public
    with db() as c:
        setup(c)
        if not c.execute('SELECT 1 FROM public_journeys WHERE id=?',(jid,)).fetchone():raise HTTPException(404)
        return [{**dict(row),'author':user_public(c,row['user_id'],user['id'])} for row in c.execute('SELECT * FROM public_journey_comments WHERE journey_id=? ORDER BY id',(jid,)).fetchall()]

@router.post('/{jid}/comments')
def comment(jid:int,body:CommentIn,user=Depends(signed_user)):
    from main import db
    with db() as c:
        setup(c)
        if not c.execute('SELECT 1 FROM public_journeys WHERE id=?',(jid,)).fetchone():raise HTTPException(404)
        cur=c.execute('INSERT INTO public_journey_comments(user_id,journey_id,body) VALUES(?,?,?)',(user['id'],jid,body.body.strip()))
        return {'id':cur.lastrowid,'journey_id':jid,'body':body.body.strip()}

class ForwardIn(BaseModel):
    recipient_id:int

@router.post('/{jid}/forward')
def forward(jid:int,body:ForwardIn,user=Depends(signed_user)):
    from main import db
    with db() as c:
        setup(c)
        if not c.execute('SELECT 1 FROM public_journeys WHERE id=?',(jid,)).fetchone():raise HTTPException(404)
        if body.recipient_id==user['id']:raise HTTPException(400,'Choose another Explorer.')
        if not c.execute('SELECT 1 FROM users WHERE id=?',(body.recipient_id,)).fetchone():raise HTTPException(404,'Recipient not found.')
        cur=c.execute('INSERT INTO public_journey_forwards(sender_id,recipient_id,journey_id) VALUES(?,?,?)',
                      (user['id'],body.recipient_id,jid))
        # Forward is a persisted inbox notification; private source plan remains inaccessible.
        return {'forward_id':cur.lastrowid,'recipient_id':body.recipient_id,'journey_id':jid,'delivered_to_inbox':True}

@router.post('/{jid}/{action}')
def toggle(jid:int,action:str,user=Depends(signed_user)):
    from main import db
    table={'like':'public_journey_likes','save':'public_journey_saves','repost':'public_journey_reposts'}.get(action)
    if not table:raise HTTPException(400,'Unsupported action.')
    with db() as c:
        setup(c)
        row=c.execute('SELECT * FROM public_journeys WHERE id=?',(jid,)).fetchone()
        if not row:raise HTTPException(404)
        exists=c.execute(f'SELECT 1 FROM {table} WHERE user_id=? AND journey_id=?',(user['id'],jid)).fetchone()
        if exists:c.execute(f'DELETE FROM {table} WHERE user_id=? AND journey_id=?',(user['id'],jid))
        else:c.execute(f'INSERT INTO {table}(user_id,journey_id) VALUES(?,?)',(user['id'],jid))
        return data(c,row,user['id'])

