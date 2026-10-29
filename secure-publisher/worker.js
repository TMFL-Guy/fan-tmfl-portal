// Deploy this Worker after setting the secrets documented in commissioner/SECURE_SETUP.md.
// No GitHub credentials or commissioner write access are exposed to GitHub Pages.
const OWNER='TMFL-Guy';
const REPO='fan-tmfl-portal';
const FILES=new Set(['tmfl-official-results.json','tmfl-highlights.json','tmfl-news.json','tmfl-rosters.json','tmfl-draft.json','tmfl-news-settings.json']);
const encoder=new TextEncoder();
function json(data,status=200,headers={}){return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store',...headers}})}
function cookie(req,name){return req.headers.get('cookie')?.split(';').map(s=>s.trim()).find(s=>s.startsWith(name+'='))?.slice(name.length+1)}
function b64(bytes){return btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_')}
function unb64(str){return Uint8Array.from(atob(str.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0))}
async function key(secret){return crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign','verify'])}
async function sign(text,secret){return b64(await crypto.subtle.sign('HMAC',await key(secret),encoder.encode(text)))}
async function session(req,env){const token=cookie(req,'tmfl_session');if(!token)return null;const [data,signature]=token.split('.');if(!data||!signature)return null;const valid=await crypto.subtle.verify('HMAC',await key(env.SESSION_SECRET),unb64(signature),encoder.encode(data)).catch(()=>false);if(!valid)return null;const info=JSON.parse(new TextDecoder().decode(unb64(data)));return info.exp>Date.now()&&String(info.id)===String(env.OWNER_GITHUB_ID)?info:null}
function setCookie(name,value,age){return name+'='+value+'; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age='+age}
function redirect(url,headers={}){return new Response(null,{status:302,headers:{location:url,'cache-control':'no-store',...headers}})}
export default {async fetch(request,env){
 const url=new URL(request.url),origin=url.origin;
 if(!env.GITHUB_CLIENT_ID||!env.GITHUB_CLIENT_SECRET||!env.SESSION_SECRET||!env.OWNER_GITHUB_ID)return json({error:'Worker not configured'},503);
 if(url.pathname==='/login'){
  const state=crypto.randomUUID();
  const target=new URL('https://github.com/login/oauth/authorize');
  target.searchParams.set('client_id',env.GITHUB_CLIENT_ID);target.searchParams.set('redirect_uri',origin+'/callback');
  target.searchParams.set('scope','repo');target.searchParams.set('state',state);
  return redirect(target.toString(),{'set-cookie':setCookie('tmfl_oauth_state',state,600)});
 }
 if(url.pathname==='/callback'){
  if(!url.searchParams.get('code')||url.searchParams.get('state')!==cookie(request,'tmfl_oauth_state'))return json({error:'Invalid OAuth state'},403);
  const response=await fetch('https://github.com/login/oauth/access_token',{method:'POST',headers:{accept:'application/json','content-type':'application/json'},body:JSON.stringify({client_id:env.GITHUB_CLIENT_ID,client_secret:env.GITHUB_CLIENT_SECRET,code:url.searchParams.get('code'),redirect_uri:origin+'/callback'})});
  const auth=await response.json();if(!auth.access_token)return json({error:'GitHub authentication failed'},401);
  const userResponse=await fetch('https://api.github.com/user',{headers:{authorization:'Bearer '+auth.access_token,accept:'application/vnd.github+json','user-agent':'TMFL-Commissioner'}});
  const user=await userResponse.json();
  if(String(user.id)!==String(env.OWNER_GITHUB_ID)||user.login?.toLowerCase()!==OWNER.toLowerCase())return json({error:'Only TMFL-Guy is authorized'},403,{'set-cookie':setCookie('tmfl_oauth_state','',0)});
  // Access token is encrypted with AES-GCM and stored inside a signed, HttpOnly session cookie.
  const aes=await crypto.subtle.importKey('raw',await crypto.subtle.digest('SHA-256',encoder.encode(env.SESSION_SECRET)),{name:'AES-GCM'},false,['encrypt','decrypt']);
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv},aes,encoder.encode(auth.access_token));
  const data=b64(encoder.encode(JSON.stringify({id:user.id,exp:Date.now()+3600000,token:b64(ciphertext),iv:b64(iv)})));
  const signed=data+'.'+await sign(data,env.SESSION_SECRET);
  return redirect('/dashboard',{'set-cookie':setCookie('tmfl_session',signed,3600)});
 }
 if(url.pathname==='/logout')return redirect('/login',{'set-cookie':setCookie('tmfl_session','',0)});
 const user=await session(request,env);if(!user)return url.pathname.startsWith('/api/')?json({error:'Unauthorized'},401):redirect('/login');
 if(url.pathname==='/api/me')return json({login:OWNER});
 if(url.pathname==='/api/publish'&&request.method==='POST'){
  const allowedOrigin=request.headers.get('origin');if(allowedOrigin!==origin)return json({error:'Origin not allowed'},403);
  if(!request.headers.get('content-type')?.startsWith('application/json'))return json({error:'JSON required'},415);
  const body=await request.json().catch(()=>null);if(!body||!FILES.has(body.file)||typeof body.content!=='string'||body.content.length>1000000)return json({error:'Invalid file or content'},400);
  try{JSON.parse(body.content)}catch{return json({error:'Invalid JSON content'},400)}
  const aes=await crypto.subtle.importKey('raw',await crypto.subtle.digest('SHA-256',encoder.encode(env.SESSION_SECRET)),{name:'AES-GCM'},false,['encrypt','decrypt']);
  const token=new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(user.iv)},aes,unb64(user.token)));
  const endpoint='https://api.github.com/repos/'+OWNER+'/'+REPO+'/contents/'+body.file;
  const headers={authorization:'Bearer '+token,accept:'application/vnd.github+json','user-agent':'TMFL-Commissioner','x-github-api-version':'2022-11-28'};
  const current=await fetch(endpoint+'?ref=main',{headers});
  if(current.status!==200&&current.status!==404)return json({error:'Cannot read GitHub file',status:current.status},502);
  const existing=current.status===200?await current.json():null;
  const bytes=encoder.encode(body.content);const content=btoa(Array.from(bytes,x=>String.fromCharCode(x)).join(''));
  const put=await fetch(endpoint,{method:'PUT',headers:{...headers,'content-type':'application/json'},body:JSON.stringify({message:'Commissioner publish '+body.file,branch:'main',content,...(existing?.sha?{sha:existing.sha}:{})})});
  if(!put.ok)return json({error:'GitHub rejected publish',status:put.status,details:(await put.text()).slice(0,500)},502);
  const result=await put.json();return json({ok:true,file:body.file,commit:result.commit?.sha});
 }
 if(url.pathname==='/dashboard'||url.pathname==='/'){
  // Dashboard assets must be served by this Worker, NOT public GitHub Pages.
  if(!env.ASSETS)return json({error:'Private dashboard assets not deployed'},503);
  const asset=new URL('/index.html',origin);
  const response=await env.ASSETS.fetch(new Request(asset,request));
  const headers=new Headers(response.headers);headers.set('cache-control','private, no-store');headers.set('x-robots-tag','noindex, nofollow');
  return new Response(response.body,{status:response.status,headers});
 }
 return json({error:'Not found'},404);
}};
