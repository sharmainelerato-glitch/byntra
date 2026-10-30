import {useEffect,useRef,useState} from "react";
import {getToken,wsUrl} from "./api";
import "./experience-finder.css";

/** Actual WebRTC peer connection for an accepted two-person Shared Journey.
 *  The backend forwards signalling only; media is peer-to-peer when connectivity permits.
 *  TURN must be configured for reliability across restrictive networks.
 */
export default function JourneyCall({journeyId}:{journeyId:number}){
  const [active,setActive]=useState(false);
  const [status,setStatus]=useState("Not connected");
  const [muted,setMuted]=useState(false);
  const [videoOff,setVideoOff]=useState(false);
  const localVideo=useRef<HTMLVideoElement>(null);
  const remoteVideo=useRef<HTMLVideoElement>(null);
  const stream=useRef<MediaStream|null>(null);
  const socket=useRef<WebSocket|null>(null);
  const peer=useRef<RTCPeerConnection|null>(null);
  const iceQueue=useRef<RTCIceCandidateInit[]>([]);
  const mounted=useRef(true);
  const close=()=>{
    socket.current?.close();socket.current=null;
    peer.current?.close();peer.current=null;
    stream.current?.getTracks().forEach(t=>t.stop());stream.current=null;
    if(localVideo.current)localVideo.current.srcObject=null;
    if(remoteVideo.current)remoteVideo.current.srcObject=null;
    iceQueue.current=[];
    setActive(false);setStatus("Call ended");setMuted(false);setVideoOff(false);
  };
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;socket.current?.close();peer.current?.close();stream.current?.getTracks().forEach(t=>t.stop());};},[journeyId]);
  async function start(mode:"audio"|"video"){
    if(active)return;
    try{
      setStatus("Requesting microphone and camera permissions...");
      const media=await navigator.mediaDevices.getUserMedia({audio:true,video:mode==="video"});
      stream.current=media;
      if(localVideo.current)localVideo.current.srcObject=media;
      const iceServers:RTCIceServer[]=[{urls:"stun:stun.l.google.com:19302"}];
      // For production, configure a TURN server on your infrastructure and pass its
      // temporary credentials via an authenticated endpoint (not hardcoded here).
      const pc=new RTCPeerConnection({iceServers});peer.current=pc;
      for(const track of media.getTracks())pc.addTrack(track,media);
      pc.ontrack=event=>{if(remoteVideo.current)remoteVideo.current.srcObject=event.streams[0];setStatus("Connected to Explorer");};
      pc.onicecandidate=event=>{if(event.candidate&&socket.current?.readyState===WebSocket.OPEN)
        socket.current.send(JSON.stringify({type:"ice",payload:event.candidate.toJSON()}));};
      pc.onconnectionstatechange=()=>{
        if(pc.connectionState==="connected")setStatus("Connected to Explorer");
        else if(pc.connectionState==="failed")setStatus("Connection failed. A TURN relay may be needed.");
        else if(pc.connectionState==="disconnected")setStatus("Explorer disconnected");
      };
      const ws=new WebSocket(wsUrl(`/ws/journeys/${journeyId}?session=${encodeURIComponent(getToken())}`));
      socket.current=ws;
      ws.onopen=()=>setStatus("Waiting for your Explorer to join this journey call...");
      ws.onerror=()=>setStatus("Signalling connection error");
      ws.onclose=()=>{if(mounted.current&&peer.current)setStatus("Signalling disconnected");};
      ws.onmessage=async event=>{
        try{
          const message=JSON.parse(event.data) as {type:string;payload?:RTCSessionDescriptionInit|RTCIceCandidateInit};
          if(message.type==="peer-joined"){
            if(pc.signalingState!=="stable")return;
            const offer=await pc.createOffer();await pc.setLocalDescription(offer);
            ws.send(JSON.stringify({type:"offer",payload:pc.localDescription}));
          } else if(message.type==="offer"&&message.payload){
            await pc.setRemoteDescription(message.payload as RTCSessionDescriptionInit);
            for(const candidate of iceQueue.current)await pc.addIceCandidate(candidate);
            iceQueue.current=[];
            const answer=await pc.createAnswer();await pc.setLocalDescription(answer);
            ws.send(JSON.stringify({type:"answer",payload:pc.localDescription}));
          } else if(message.type==="answer"&&message.payload){
            await pc.setRemoteDescription(message.payload as RTCSessionDescriptionInit);
            for(const candidate of iceQueue.current)await pc.addIceCandidate(candidate);
            iceQueue.current=[];
          } else if(message.type==="ice"&&message.payload){
            const candidate=message.payload as RTCIceCandidateInit;
            if(pc.remoteDescription)await pc.addIceCandidate(candidate);
            else iceQueue.current.push(candidate);
          } else if(message.type==="peer-left"){
            setStatus("Explorer left the call");
          }
        }catch{setStatus("Call signalling could not be completed.");}
      };
      setActive(true);setMuted(false);setVideoOff(mode==="audio");
    }catch(err){close();setStatus(err instanceof Error?err.message:"Unable to start call");}
  }
  return <section className="experience-finder" aria-label="Private voice and video call">
    <div className="experience-heading"><span>PRIVATE SHARED JOURNEY</span><h2>Connect with your Explorer</h2>
      <p>Calls start only when you choose. Camera and microphone require permission.</p></div>
    <div className="video-layout"><div className="video-frame"><video ref={localVideo} autoPlay muted playsInline style={{width:"100%",maxHeight:220}}/><span>You</span></div>
      <div className="video-frame"><video ref={remoteVideo} autoPlay playsInline style={{width:"100%",maxHeight:220}}/><span>Explorer</span></div></div>
    <p role="status" className="experience-note">{status}</p>
    <div className="experience-actions">{!active?<><button type="button" onClick={()=>void start("audio")}>Start voice call</button><button type="button" onClick={()=>void start("video")}>Start video call</button></>:<>
      <button type="button" onClick={()=>{stream.current?.getAudioTracks().forEach(t=>t.enabled=muted);setMuted(!muted);}}>{muted?"Unmute":"Mute"}</button>
      <button type="button" onClick={()=>{stream.current?.getVideoTracks().forEach(t=>t.enabled=videoOff);setVideoOff(!videoOff);}}>{videoOff?"Enable video":"Disable video"}</button>
      <button type="button" onClick={close}>End call</button></>}</div>
    <p className="experience-note">WebRTC signalling is connected to this accepted journey. HTTPS is required outside localhost. Some networks require a TURN relay, which has not been configured in this package. Calls are not recorded.</p>
  </section>;
}
