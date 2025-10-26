
import dotenv from'dotenv';dotenv.config()
import{Hono}from'hono'
import{cors}from'hono/cors'
import{logger}from'hono/logger'
import{serve}from'@hono/node-server'
import{MongoClient}from'mongodb'
import fs from'fs'
import path from'path'
import crypto from'crypto'

const MONGO=process.env.MONGO_URI||'mongodb://127.0.0.1:27017/moonfall'
const PORT=Number(process.env.PORT||3551)

const app=new Hono()
app.use('*',cors())
app.use('*',logger())

const client=new MongoClient(MONGO)
await client.connect()
global.db=client.db()

const p=path.join
const root=process.cwd()
const cfg=(f)=>p(root,'config',f)
const cs=(f)=>p(root,'CloudStorage',f)
const exists=(f)=>{try{return fs.existsSync(f)}catch{return false}}
async function mountIf(file,base='/'){if(exists(file)){const r=(await import(pathToFileURL(file).href)).default;app.route(base,r)}}
function pathToFileURL(f){return new URL('file:///'+f.replace(/\\/g,'/'))}

const mounts=[
['src/auth.js','/auth'],
['src/profile.js','/profile'],
['src/party.js','/party'],
['src/friends.js','/friends'],
['src/matchmaking.js','/match'],
['src/voice.js','/voice'],
['src/shop.js','/'],
['src/vbucks.js','/vbucks'],
['src/xp.js','/xp'],
['src/quests.js','/quests'],
['src/sac.js','/sac'],
['src/reports.js','/reports']
]
for(const [f,base]of mounts){await mountIf(p(root,f),base)}

app.get('/',c=>c.json({name:'Moonfall',ok:true,port:PORT,time:new Date().toISOString()}))
app.get('/status',async c=>{
const users=await global.db.collection('users').estimatedDocumentCount()
return c.json({ok:true,users})
})
app.get('/heartbeat',c=>c.json({ok:true}))

app.get('/region',c=>c.json({continent:{code:'NA'},country:{iso_code:'US'},subdivisions:[{iso_code:'NY'}]}))

app.get('/lightswitch/api/service/bulk/status',c=>c.json([{serviceInstanceId:'fortnite',status:'UP',message:'Moonfall online',allowedActions:['PLAY','DOWNLOAD'],banned:false,launcherInfoDTO:{appName:'Fortnite',catalogItemId:'4fe75bbc5a674f4f9b356b5c90567da5',namespace:'fn'}}]))
app.get('/lightswitch/api/service/Fortnite/status',c=>c.json({serviceInstanceId:'fortnite',status:'UP',message:'Moonfall online',allowedActions:['PLAY','DOWNLOAD'],banned:false}))

app.post('/account/api/oauth/token',c=>c.json({access_token:`eg1~${crypto.randomUUID()}`,expires_in:28800,expires_at:new Date(Date.now()+28800000).toISOString(),token_type:'bearer',client_id:'moonfall',internal_client:true,client_service:'fortnite',account_id:crypto.randomUUID(),displayName:'MoonfallPlayer',app:'fortnite',in_app_id:crypto.randomUUID(),device_id:crypto.randomUUID()}))
app.get('/account/api/oauth/verify',c=>c.json({token:`eg1~${crypto.randomUUID()}`,session_id:crypto.randomUUID(),token_type:'bearer',client_id:'moonfall',internal_client:true,client_service:'fortnite',account_id:crypto.randomUUID(),expires_in:28800,expires_at:new Date(Date.now()+28800000).toISOString(),auth_method:'exchange_code',display_name:'Moonfall'}))
app.delete('/account/api/oauth/sessions/kill',c=>c.body(null,204))
app.delete('/account/api/oauth/sessions/kill/:t',c=>c.body(null,204))

app.get('/account/api/public/account/:id',c=>c.json({id:c.req.param('id'),displayName:`Player${String(c.req.param('id')).slice(0,8)}`,name:'Moonfall',externalAuths:{}}))
app.get('/account/api/public/account',c=>{const q=c.req.query('accountId');const ids=Array.isArray(q)?q:[q].filter(Boolean);return c.json((ids||[]).map(x=>({id:x,displayName:`Player${String(x).slice(0,8)}`,externalAuths:{}})))})

app.get('/fortnite/api/calendar/v1/timeline',c=>c.json({channels:{'client-matchmaking':{states:[{validFrom:'0001-01-01T00:00:00.000Z',activeEvents:[{eventType:'EventFlag.SeasonX',activeUntil:'9999-12-31T23:59:59.999Z',activeSince:'0001-01-01T00:00:00.000Z'}],state:{seasonNumber:10,seasonTemplateId:'SeasonX',activeStorefronts:[],eventNamedWeights:{},activeEvents:[],dailyStoreEnd:'9999-12-31T23:59:59.999Z'}}],cacheExpire:'9999-12-31T23:59:59.999Z'}},eventsTimeOffsetHrs:0,cacheIntervalMins:10,currentTime:new Date().toISOString()}))

app.get('/content/api/pages/fortnite-game',(c)=>{
let lobby={}
try{lobby=JSON.parse(fs.readFileSync(cfg('LobbyConfig.json'),'utf8'))}catch{}
const title=lobby?.lobby?.buttons?.itemshop||'Moonfall - Item Shop'
return c.json({_title:'Fortnite Game',_activeDate:new Date(Date.now()-3600000).toISOString(),lastModified:new Date().toISOString(),_locale:'en-US',battleroyalenewsv2:{news:{motds:[{entryType:'Text',image:'https://i.imgur.com/fS4FlTg.png',tileImage:'https://i.imgur.com/fS4FlTg.png',hidden:false,_type:'CommonUI Simple Message Base',title:'Moonfall',body:'Welcome to Moonfall OG!',id:crypto.randomUUID()}]}},shopCarousel:{_type:'ShopCarousel',title},playlistinformation:{playlist_info:{_type:'Playlist Information',playlists:[{playlist_name:'Playlist_Arena_Solo',playlist_info_text:'Arena Solo'}]}}})
})

function fileInfo(fp,name){try{const buf=fs.readFileSync(fp);const hash=crypto.createHash('sha1').update(buf).digest('hex');return{name,uniqueFilename:name,filename:name,hash,hash256:crypto.createHash('sha256').update(buf).digest('hex'),length:buf.length,contentType:'application/octet-stream',uploaded:new Date().toISOString()}}catch{return null}}
app.get('/fortnite/api/cloudstorage/system',c=>{
const files=['DefaultEngine.ini','DefaultGame.ini','DefaultRuntimeOptions.ini'].filter(f=>exists(cs(f)))
const list=files.map(f=>fileInfo(cs(f),f)).filter(Boolean)
return c.json(list)
})
app.get('/fortnite/api/cloudstorage/system/config',c=>c.json([]))
app.get('/fortnite/api/cloudstorage/system/:file',c=>{
const name=c.req.param('file');const fp=cs(name);if(!exists(fp))return c.body(null,204)
const data=fs.readFileSync(fp);return new Response(data,{headers:{'Content-Type':'text/plain','Content-Length':String(data.length)}})
})

app.get('/fortnite/api/cloudstorage/user/:accountId',c=>c.json([]))
app.get('/fortnite/api/cloudstorage/user/:accountId/:file',c=>c.body(null,204))
app.put('/fortnite/api/cloudstorage/user/:accountId/:file',c=>c.body(null,204))

app.get('/presence/api/v1/_/:accountId/settings/subscriptions',c=>c.json({}))
app.post('/fortnite/api/game/v2/chat/:accountId/:action',c=>c.json({GlobalChatRooms:[]}))

app.notFound(c=>c.json({error:'not_found'},404))
app.onError((e,c)=>{console.error(e);return c.json({error:'server_error'},500)})

serve({fetch:app.fetch,port:PORT})
console.log(`Moonfall backend running :${PORT}`)