import {useEffect,useState,type FormEvent} from "react";
import {request,post,media,type User,type Journey} from "./api";
import "./experience-finder.css";

type PublicJourney={id:number;owner_id:number;title:string;story:string;image:string|null;author:User;likes:number;comments:number;reposts:number;liked:boolean;saved:boolean;reposted:boolean};
type Comment={id:number;body:string;author:User};
type Forward={id:number;sender:User;journey:PublicJourney};
export default function JourneySocial({journeys,people,me}:{journeys:Journey[];people:User[];me:User}){
  const [feed,setFeed]=useState<PublicJourney[]>([]);
  const [savedOnly,setSavedOnly]=useState(false);
  const [inbox,setInbox]=useState<Forward[]>([]);
  const [source,setSource]=useState("");
  const [title,setTitle]=useState("");
  const [story,setStory]=useState("");
  const [selected,setSelected]=useState<number|null>(null);
  const [comments,setComments]=useState<Comment[]>([]);
  const [commentText,setCommentText]=useState("");
  const [recipients,setRecipients]=useState<Record<number,string>>({});
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");
  const [busy,setBusy]=useState(false);
  async function load(filter=savedOnly){
    try{
      const [items,forwarded]=await Promise.all([
        request<PublicJourney[]>(`/api/journey-social${filter?"?saved_only=true":""}`),
        request<Forward[]>("/api/journey-social/forwards")]);
      setFeed(items);setInbox(forwarded);
    }catch(e){setError(e instanceof Error?e.message:String(e));}
  }
  useEffect(()=>{void load(false);},[]);
  async function publish(e:FormEvent){
    e.preventDefault();setBusy(true);setError("");
    try{
      await post("/api/journey-social/publish",{source_journey_id:Number(source),title,story});
      setTitle("");setStory("");setSource("");setMessage("Your public journey story has been published.");
      await load(false);setSavedOnly(false);
    }catch(e){setError(e instanceof Error?e.message:String(e));}
    finally{setBusy(false);}
  }
  async function toggle(id:number,action:"like"|"save"|"repost"){
    setError("");try{await post(`/api/journey-social/${id}/${action}`,{});await load();}
    catch(e){setError(e instanceof Error?e.message:String(e));}
  }
  async function openComments(id:number){
    setError("");try{setComments(await request<Comment[]>(`/api/journey-social/${id}/comments`));setSelected(id);}
    catch(e){setError(e instanceof Error?e.message:String(e));}
  }
  async function comment(e:FormEvent){
    e.preventDefault();if(selected===null)return;
    try{await post(`/api/journey-social/${selected}/comments`,{body:commentText});setCommentText("");await openComments(selected);await load();}
    catch(e){setError(e instanceof Error?e.message:String(e));}
  }
  async function forward(id:number){
    const recipient_id=Number(recipients[id]);if(!recipient_id)return;
    try{await post(`/api/journey-social/${id}/forward`,{recipient_id});setMessage("Forwarded to the Explorer's BYNTRA inbox.");await load();}
    catch(e){setError(e instanceof Error?e.message:String(e));}
  }
  return <section className="experience-finder" aria-label="Published cultural journeys">
    <div className="experience-heading"><span>EXPLORER STORIES</span><h2>Journeys worth sharing</h2>
      <p>Publish a story you choose to share. Private collaboration plans, votes, and messages are never copied into the public post.</p></div>
    <form className="experience-form" onSubmit={publish}>
      <label>Choose your journey<select value={source} onChange={e=>setSource(e.target.value)} required><option value="">Select your own accepted journey</option>
        {journeys.filter(j=>j.owner_id===me.id&&j.plan.status==="accepted").map(j=><option key={j.id} value={j.id}>{j.title}</option>)}</select></label>
      <label>Public story title<input value={title} minLength={2} maxLength={120} onChange={e=>setTitle(e.target.value)} required /></label>
      <label>What would you like to share?<textarea value={story} minLength={5} maxLength={4000} onChange={e=>setStory(e.target.value)} required placeholder="Share your cultural discoveries, not private details about your collaborator." /></label>
      <div className="experience-actions"><button type="submit" disabled={busy}>{busy?"Publishing...":"Publish public story"}</button></div>
    </form>
    <div className="experience-tabs"><button type="button" className={!savedOnly?"selected":""} onClick={()=>{setSavedOnly(false);void load(false);}}>Discover stories</button>
      <button type="button" className={savedOnly?"selected":""} onClick={()=>{setSavedOnly(true);void load(true);}}>Saved stories</button>
      <button type="button" onClick={()=>void load()}>Refresh</button></div>
    {inbox.length>0&&<div><h3>Forwarded to you</h3>{inbox.map(x=><p key={x.id}><strong>@{x.sender.username}</strong> shared <strong>{x.journey.title}</strong> with you.</p>)}</div>}
    {message&&<p role="status">{message}</p>}
    {error&&<p className="experience-error" role="alert">{error}</p>}
    <div className="experience-results">{feed.map(j=><article className="experience-card" key={j.id}>
      {j.image&&<img src={media(j.image)} alt="Journey cover" style={{width:"100%",borderRadius:10}}/>}
      <h3>{j.title}</h3><small>By @{j.author.username}</small><p>{j.story}</p>
      <div className="experience-actions"><button type="button" onClick={()=>void toggle(j.id,"like")}>{j.liked?"♥ Liked":"♡ Like"} ({j.likes})</button>
        <button type="button" onClick={()=>void openComments(j.id)}>Comment ({j.comments})</button>
        <button type="button" onClick={()=>void toggle(j.id,"save")}>{j.saved?"Saved":"Save"}</button>
        <button type="button" onClick={()=>void toggle(j.id,"repost")}>{j.reposted?"Reposted":"Repost"} ({j.reposts})</button></div>
      <div className="experience-actions"><select aria-label={`Forward ${j.title} to Explorer`} value={recipients[j.id]||""} onChange={e=>setRecipients(p=>({...p,[j.id]:e.target.value}))}>
        <option value="">Forward to Explorer...</option>{people.filter(u=>u.id!==me.id).map(u=><option key={u.id} value={u.id}>@{u.username}</option>)}</select>
        <button type="button" disabled={!recipients[j.id]} onClick={()=>void forward(j.id)}>Forward</button></div>
      {selected===j.id&&<div><h4>Comments</h4>{comments.map(c=><p key={c.id}><strong>@{c.author.username}</strong>: {c.body}</p>)}
        <form className="experience-form" onSubmit={comment}><label>Add a comment<input value={commentText} maxLength={1200} onChange={e=>setCommentText(e.target.value)} required /></label>
          <div className="experience-actions"><button type="submit">Comment</button><button type="button" onClick={()=>setSelected(null)}>Close</button></div></form></div>}
    </article>)}</div>
    {!feed.length&&<p className="experience-note">No public journeys here yet. Private journeys remain private until explicitly published.</p>}
  </section>;
}
