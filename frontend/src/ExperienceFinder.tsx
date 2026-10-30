import { useState, type FormEvent } from "react";
import { post } from "./api";
import "./experience-finder.css";

type Flight = {id:string;price:number;currency:string;stops:number;airlines:string[];departure:string;arrival:string;cabin:string;why_recommended:string|null};
type FlightsResponse = {results:Flight[];source:string;sandbox_data:boolean;notice:string};
type Event = {id:string;name:string;date?:string;time?:string;venue?:string;city?:string;url?:string;prices:{min?:number;max?:number;currency?:string}[];ticket_status?:string};
type TicketQuote = {seller:string;starting_price:number;maximum_price?:number|null;currency?:string|null;url?:string|null;fees_included?:boolean|null;note:string};
type ComparedEvent = Event & {provider:string;matched_providers:string[];quotes:TicketQuote[];comparison?:{lowest_listed_starting_price_provider:string;starting_price:number;currency:string;caveat:string}|null};
type EventsResponse = {results:ComparedEvent[];notice:string;location_used:string;provider_status:Record<string,string>};

export default function ExperienceFinder() {
  const [tab,setTab]=useState<"events"|"flights">("events");
  const [keyword,setKeyword]=useState("poetry");
  const [city,setCity]=useState("");
  const [radius,setRadius]=useState(25);
  const [events,setEvents]=useState<ComparedEvent[]>([]);
  const [providerStatus,setProviderStatus]=useState<Record<string,string>>({});
  const [eventsInfo,setEventsInfo]=useState("");
  const [origin,setOrigin]=useState("JNB");
  const [destination,setDestination]=useState("CPT");
  const [date,setDate]=useState("");
  const [travelClass,setTravelClass]=useState("ECONOMY");
  const [preference,setPreference]=useState("balanced");
  const [flights,setFlights]=useState<Flight[]>([]);
  const [flightsInfo,setFlightsInfo]=useState("");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [locationUsed,setLocationUsed]=useState(false);

  async function findEvents(e:FormEvent) {
    e.preventDefault();setBusy(true);setError("");setEvents([]);
    try {
      const response=await post<EventsResponse>("/api/experiences/events/compare",{keyword,city,radius_km:radius});
      setEvents(response.results);setEventsInfo(response.notice);setProviderStatus(response.provider_status);setLocationUsed(false);
    } catch(err) {setError(err instanceof Error?err.message:String(err));}
    finally {setBusy(false);}
  }
  function findNearMe() {
    setError("");
    if (!navigator.geolocation) {setError("Your browser does not support location sharing. Enter a city instead.");return;}
    setBusy(true);
    navigator.geolocation.getCurrentPosition(async pos=>{
      try {
        const response=await post<EventsResponse>("/api/experiences/events/compare",{
          keyword,latitude:pos.coords.latitude,longitude:pos.coords.longitude,radius_km:radius});
        setEvents(response.results);setEventsInfo(response.notice);setProviderStatus(response.provider_status);setLocationUsed(true);
      } catch(err) {setError(err instanceof Error?err.message:String(err));}
      finally {setBusy(false);}
    },()=>{setBusy(false);setError("Location permission was not granted. You can search by city instead.");},
    {enableHighAccuracy:false,timeout:12000,maximumAge:0});
  }
  async function findFlights(e:FormEvent) {
    e.preventDefault();setBusy(true);setError("");setFlights([]);
    try {
      const response=await post<FlightsResponse>("/api/experiences/flights",{
        origin:origin.trim().toUpperCase(),destination:destination.trim().toUpperCase(),
        departure_date:date,travel_class:travelClass,preference,currency:"ZAR",adults:1});
      setFlights(response.results);setFlightsInfo(response.notice);
    } catch(err) {setError(err instanceof Error?err.message:String(err));}
    finally {setBusy(false);}
  }
  return <section className="experience-finder" aria-label="Real-world experience finder">
    <div className="experience-heading"><span>BYNTRA EXPERIENCE FINDER</span><h2>Go beyond discovery</h2>
      <p>Find cultural experiences and compare travel options with real provider information. Nothing is booked automatically.</p></div>
    <div className="experience-tabs"><button type="button" className={tab==="events"?"selected":""} onClick={()=>{setTab("events");setError("");}}>Events near you</button>
      <button type="button" className={tab==="flights"?"selected":""} onClick={()=>{setTab("flights");setError("");}}>Compare flights</button></div>
    {tab==="events"?<>
      <form className="experience-form" onSubmit={findEvents}>
        <label>What interests you?<input value={keyword} minLength={2} maxLength={80} onChange={e=>setKeyword(e.target.value)} placeholder="Poetry, jazz, concerts..." required /></label>
        <label>City (no location permission needed)<input value={city} onChange={e=>setCity(e.target.value)} placeholder="Johannesburg" /></label>
        <label>Distance (km)<input type="number" min={1} max={150} value={radius} onChange={e=>setRadius(Number(e.target.value))} /></label>
        <div className="experience-actions"><button type="submit" disabled={busy||!city.trim()}>{busy?"Searching...":"Search city"}</button>
          <button type="button" disabled={busy} onClick={findNearMe}>Use my location once</button></div>
      </form>
      <p className="experience-note">Location is optional. If you choose “Use my location once,” your browser asks permission and coordinates are sent only for that search. BYNTRA does not save them to your profile.</p>
      {locationUsed&&<p className="experience-note">Results from your one-time location search.</p>}
      {eventsInfo&&<p className="experience-note">{eventsInfo}</p>}
      {events.length===0&&eventsInfo&&!busy&&<p>No matching provider listings found. Try a broader keyword or another city; smaller community events may not be covered.</p>}
      <p className="experience-note">{Object.entries(providerStatus).map(([name,status])=>`${name}: ${status}`).join(" · ")}</p>
      <div className="experience-results">{events.map(item=><article key={`${item.provider}-${item.id}`} className="experience-card"><h3>{item.name}</h3>
        <p>{[item.date,item.time,item.venue,item.city].filter(Boolean).join(" · ")}</p>
        <p>{item.quotes.length ? item.quotes.map((q,i)=><span key={i} style={{display:"block"}}>{q.seller}: from {q.starting_price} {q.currency || "(currency unverified)"} · fees not confirmed {q.url&&<a href={q.url} target="_blank" rel="noopener noreferrer">View seller</a>}</span>) : "Ticket price not provided"}</p>
        {item.comparison&&<p><strong>Lowest listed starting amount:</strong> {item.comparison.lowest_listed_starting_price_provider} · {item.comparison.starting_price} {item.comparison.currency}. {item.comparison.caveat}</p>}
        <small>{item.matched_providers.join(" + ")} · {item.ticket_status||"Availability unverified"}</small>
        {item.url&&<a href={item.url} target="_blank" rel="noopener noreferrer">View tickets on provider site</a>}</article>)}</div>
    </>:<>
      <form className="experience-form" onSubmit={findFlights}>
        <label>From (airport IATA)<input value={origin} maxLength={3} minLength={3} required onChange={e=>setOrigin(e.target.value)} /></label>
        <label>To (airport IATA)<input value={destination} maxLength={3} minLength={3} required onChange={e=>setDestination(e.target.value)} /></label>
        <label>Departure date<input type="date" value={date} min={new Date().toISOString().slice(0,10)} required onChange={e=>setDate(e.target.value)} /></label>
        <label>Cabin<select value={travelClass} onChange={e=>setTravelClass(e.target.value)}><option value="ECONOMY">Economy</option><option value="PREMIUM_ECONOMY">Premium economy</option><option value="BUSINESS">Business</option><option value="FIRST">First</option></select></label>
        <label>What matters most?<select value={preference} onChange={e=>setPreference(e.target.value)}><option value="balanced">Price and stops</option><option value="cheapest">Lowest price</option><option value="fewest_stops">Fewest stops</option><option value="fastest">Shortest duration</option></select></label>
        <div className="experience-actions"><button type="submit" disabled={busy}>{busy?"Comparing...":"Compare flights"}</button></div>
      </form>
      <p className="experience-note">Flights use Amadeus TEST by default. Production results are only possible with approved production credentials and backend AMADEUS_ENV=production. All fares require provider revalidation before booking.</p>
      {flightsInfo&&<p className="experience-note">{flightsInfo}</p>}
      <div className="experience-results">{flights.map((item,i)=><article className="experience-card" key={item.id}><h3>{i===0?"Best match · ":"Option "+(i+1)+" · "}{item.price.toFixed(2)} {item.currency}</h3>
        <p>{item.airlines.join(", ")} · {item.cabin.replaceAll("_"," ")} · {item.stops} stops</p>
        <p>{item.departure} — {item.arrival}</p>
        {item.why_recommended&&<p><strong>Why this option:</strong> {item.why_recommended}</p>}
        <small>{flightsInfo.includes("Production") ? "Amadeus production · price must be revalidated" : "Amadeus TEST · not live commercial inventory"} · No booking in BYNTRA</small></article>)}</div>
    </>}
    {error&&<p className="experience-error" role="alert">{error}</p>}
  </section>;
}
