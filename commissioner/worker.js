// Cloudflare Worker: secure GitHub OAuth and allowlisted publishing.
// Required secrets: GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, SESSION_SECRET (64+ random chars).
// Required vars: ALLOWED_GITHUB_ID=241678722, GITHUB_REPO=TMFL-Guy/fan-tmfl-portal.
// Configure GitHub OAuth callback: https://YOUR-WORKER.workers.dev/auth/callback
const json=(obj,status=200,headers={})=>new Response(JSON.stringify(obj),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store',...headers}});
const redirect=(url,headers={})=>new Response(null,{status:302,headers:{Location:url,...headers}});
const cookie=(name,value,age=3600)=>name+'='+encodeURIComponent(value)+'; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age='+age;
function cookies(req){return Object.fromEntries((req.headers.get('cookie')||'').split(';').map(x=>x.trim().split('=').map(decodeURIComponent)).filter(x=>x.length===2))}
function b64(bytes){return btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')}
function unb64(str){return Uint8Array.from(atob(str.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0))}
async function key(env){if(!env.SESSION_SECRET||env.SESSION_SECRET.length<48)throw Error('SESSION_SECRET must be 48+ chars');const raw=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(env.SESSION_SECRET));return crypto.subtle.importKey('raw',raw,'AES-GCM',false,['encrypt','decrypt'])}
async function seal(obj,env){const iv=crypto.getRandomValues(new Uint8Array(12));const encrypted=await crypto.subtle.encrypt({name:'AES-GCM',iv},await key(env),new TextEncoder().encode(JSON.stringify(obj)));return b64(iv)+'.'+b64(new Uint8Array(encrypted))}
async function unseal(value,env){try{const [a,b]=value.split('.');const decrypted=await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(a)},await key(env),unb64(b));return JSON.parse(new TextDecoder().decode(decrypted))}catch{return null}}
const allow=new Set(['tmfl-highlights.json','tmfl-official-results.json','tmfl-news.json','tmfl-alerts.json']);
async function github(url,token,options={}){const r=await fetch('https://api.github.com'+url,{...options,headers:{Accept:'application/vnd.github+json','User-Agent':'TMFL-Commissioner-Headquarters',Authorization:'Bearer '+token,'X-GitHub-Api-Version':'2022-11-28',...(options.headers||{})}});const body=await r.json().catch(()=>({}));if(!r.ok)throw Error(body.message||'GitHub request failed');return body}
export default {async fetch(req,env){try{
 const url=new URL(req.url),c=cookies(req),base=url.origin;
 if(url.pathname==='/auth/login'){
  const state=b64(crypto.getRandomValues(new Uint8Array(24)));
  const gh=new URL('https://github.com/login/oauth/authorize');gh.searchParams.set('client_id',env.GITHUB_CLIENT_ID);gh.searchParams.set('redirect_uri',base+'/auth/callback');gh.searchParams.set('scope','repo');gh.searchParams.set('state',state);
  return redirect(gh.toString(),{'Set-Cookie':cookie('tmfl_oauth_state',state,600)});
 }
 if(url.pathname==='/auth/callback'){
  if(!c.tmfl_oauth_state||url.searchParams.get('state')!==c.tmfl_oauth_state)return json({error:'OAuth state mismatch'},403);
  const params=new URLSearchParams({client_id:env.GITHUB_CLIENT_ID,client_secret:env.GITHUB_CLIENT_SECRET,code:url.searchParams.get('code')||'',redirect_uri:base+'/auth/callback'});
  const response=await fetch('https://github.com/login/oauth/access_token',{method:'POST',headers:{Accept:'application/json','Content-Type':'application/x-www-form-urlencoded'},body:params});
  const auth=await response.json();if(!auth.access_token)return json({error:'GitHub sign-in failed'},401);
  const profile=await github('/user',auth.access_token);
  if(String(profile.id)!==String(env.ALLOWED_GITHUB_ID))return json({error:'This GitHub account is not authorized as TMFL commissioner'},403);
  const session=await seal({token:auth.access_token,id:profile.id,login:profile.login,exp:Date.now()+3600*1000},env);
  const headers=new Headers({Location:'/'});headers.append('Set-Cookie',cookie('tmfl_session',session));headers.append('Set-Cookie',cookie('tmfl_oauth_state','',0));return new Response(null,{status:302,headers});
 }
 if(url.pathname==='/auth/logout'){return redirect('/',{'Set-Cookie':cookie('tmfl_session','',0)})}
 if(url.pathname==='/'){const upstream=await fetch('https://raw.githubusercontent.com/TMFL-Guy/fan-tmfl-portal/main/commissioner/index.html',{cf:{cacheTtl:0}});return new Response(upstream.body,{status:upstream.status,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Content-Security-Policy':"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",'X-Content-Type-Options':'nosniff'}})}
 if(!url.pathname.startsWith('/api/'))return json({error:'Not found'},404);
 const session=await unseal(c.tmfl_session||'',env);if(!session||session.exp<Date.now()||String(session.id)!==String(env.ALLOWED_GITHUB_ID))return json({error:'Sign in required'},401);
 if(url.pathname==='/api/me')return json({login:session.login});
 const repo=env.GITHUB_REPO||'TMFL-Guy/fan-tmfl-portal';
 if(url.pathname==='/api/file'&&req.method==='GET'){
  const path=url.searchParams.get('path');if(!allow.has(path))return json({error:'File not permitted'},400);
  const data=await github('/repos/'+repo+'/contents/'+path+'?ref=main',session.token);
  const bytes=unb64(data.content.replace(/\s/g,''));return json({sha:data.sha,content:new TextDecoder().decode(bytes)});
 }
 if(url.pathname==='/api/publish'&&req.method==='POST'){
  if(req.headers.get('Origin')!==base)return json({error:'Invalid request origin'},403);
  const input=await req.json();if(!allow.has(input.path)||typeof input.content!=='string'||input.content.length>500000||typeof input.sha!=='string')return json({error:'Invalid publishing request'},400);
  JSON.parse(input.content);
  const encoded=btoa(String.fromCharCode(...new TextEncoder().encode(input.content)));
  const data=await github('/repos/'+repo+'/contents/'+input.path,session.token,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:'TMFL Commissioner: publish '+input.path,content:encoded,sha:input.sha,branch:'main'})});
  return json({sha:data.content.sha,commit:data.commit.sha});
 }
 return json({error:'Not found'},404);
 }catch(e){return json({error:e.message||'Unexpected error'},500)}}};
