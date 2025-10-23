
import{Hono}from'hono'
import{ObjectId}from'mongodb'
const xp=new Hono()
const users=()=>global.db.collection('users')
const GS=process.env.MOONFALL_GS_SECRET||'moonfall_gs'
function gsAuth(c){return c.req.header('x-gs-key')===GS}
function oid(id){try{return new ObjectId(id)}catch{return null}}
function ensurePaths(u){if(!u.profile)u.profile={};if(!u.profile.athena)u.profile.athena={stats:{attributes:{}}};if(!u.profile.athena.stats)u.profile.athena.stats={attributes:{}};if(!u.profile.athena.stats.attributes)u.profile.athena.stats.attributes={};return u}
function calcLevel(x){let l=1,r=1000,t=x;while(t>=r){t-=r;l++;r=Math.floor(r*1.1)}return{level:l,progress:t,needed:r}}
async function ensureUser(u){u=ensurePaths(u);const a=u.profile.athena.stats.attributes;let ch=false;if(a.xp===undefined){a.xp=0;ch=true}if(a.level===undefined){a.level=1;ch=true}if(a.wins===undefined){a.wins=0;ch=true}if(a.kills===undefined){a.kills=0;ch=true}if(a.matches===undefined){a.matches=0;ch=true}if(a.arenaPoints===undefined){a.arenaPoints=0;ch=true}if(ch)await users().updateOne({_id:u._id},{$set:{'profile.athena.stats.attributes':a}});return u}
async function applyXP(id,{dx=0,kd=0,win=false,played=true,arena=0}={}){
const _id=oid(id);if(!_id)return{err:'User not found'}
let u=await users().findOne({_id});if(!u)return{err:'User not found'}
u=await ensureUser(u);const a=u.profile.athena.stats.attributes
const newXp=Math.max(0,(a.xp||0)+Math.max(0,Number(dx)||0))
const lv=calcLevel(newXp)
const $set={'profile.athena.stats.attributes.xp':newXp,'profile.athena.stats.attributes.level':lv.level}
const $inc={}
if(kd)$inc['profile.athena.stats.attributes.kills']=Number(kd)||0
if(played)$inc['profile.athena.stats.attributes.matches']=1
if(win)$inc['profile.athena.stats.attributes.wins']=1
if(arena)$inc['profile.athena.stats.attributes.arenaPoints']=Number(arena)||0
const upd={$set};if(Object.keys($inc).length)upd.$inc=$inc
await users().updateOne({_id},upd)
return{ok:true,xp:newXp,level:lv.level,progress:lv.progress,needed:lv.needed,kills:(a.kills||0)+(+kd||0),wins:(a.wins||0)+(win?1:0),matches:(a.matches||0)+(played?1:0),arenaPoints:(a.arenaPoints||0)+(+arena||0)}
}
xp.get('/get/:accountId',async c=>{
const _id=oid(c.req.param('accountId'));if(!_id)return c.json({error:'User not found'},404)
let u=await users().findOne({_id});if(!u)return c.json({error:'User not found'},404)
u=await ensureUser(u);const a=u.profile.athena.stats.attributes;const lv=calcLevel(a.xp||0)
return c.json({xp:a.xp||0,level:lv.level,progress:lv.progress,needed:lv.needed,wins:a.wins||0,kills:a.kills||0,matches:a.matches||0,arenaPoints:a.arenaPoints||0})
})
xp.post('/gain',async c=>{
const b=await c.req.json().catch(()=>({}))
const{accountId,amount=0,kills=0,win=false,played=true,arena=0}=b
if(!accountId)return c.json({error:'Missing accountId'},400)
const r=await applyXP(accountId,{dx:amount,kd:kills,win,played,arena})
if(r.err)return c.json({error:r.err},404)
return c.json(r)
})
xp.post('/gs/award',async c=>{
if(!gsAuth(c))return c.json({error:'Unauthorized'},401)
const{awards}=await c.req.json().catch(()=>({}))
if(!Array.isArray(awards)||!awards.length)return c.json({error:'Missing awards'},400)
const out=[]
for(const a of awards){const{id,dx=0,kd=0,win=false,played=true,arena=0}=a||{};if(!id){out.push({ok:false,error:'bad'});continue}out.push(await applyXP(id,{dx,kd,win,played,arena}))}
return c.json({ok:true,results:out})
})
xp.post('/gs/match/complete',async c=>{
if(!gsAuth(c))return c.json({error:'Unauthorized'},401)
const b=await c.req.json().catch(()=>({}))
const{accountId,kills=0,placement=100,durationSec=0,arenaDelta=0}=b
if(!accountId)return c.json({error:'Missing accountId'},400)
const base=100
const kxp=Number(kills)*50
const pxp=placement<=1?500:placement<=5?350:placement<=10?250:placement<=25?150:75
const txp=Math.min(Math.floor((Number(durationSec)/60)*10),200)
const total=base+kxp+pxp+Math.max(0,txp)
const r=await applyXP(accountId,{dx:total,kd:kills,win:placement===1,played:true,arena:arenaDelta})
if(r.err)return c.json({error:r.err},404)
return c.json({...r,awarded:{base,kills:kxp,placement:pxp,time:txp,total}})
})
xp.post('/set',async c=>{
if(!gsAuth(c))return c.json({error:'Unauthorized'},401)
const{accountId,xp:value,level}=await c.req.json().catch(()=>({}))
const _id=oid(accountId);if(!_id)return c.json({error:'User not found'},404)
let $set={}
if(Number.isFinite(value)&&value>=0){const lv=calcLevel(Number(value));$set['profile.athena.stats.attributes.xp']=Number(value);$set['profile.athena.stats.attributes.level']=lv.level}
if(Number.isFinite(level)&&level>0)$set['profile.athena.stats.attributes.level']=Number(level)
if(!Object.keys($set).length)return c.json({error:'No fields'},400)
await users().updateOne({_id},{$set})
return c.json({ok:true})
})
xp.post('/reset',async c=>{
if(!gsAuth(c))return c.json({error:'Unauthorized'},401)
const{accountId}=await c.req.json().catch(()=>({}))
const _id=oid(accountId);if(!_id)return c.json({error:'User not found'},404)
await users().updateOne({_id},{$set:{'profile.athena.stats.attributes.xp':0,'profile.athena.stats.attributes.level':1}})
return c.json({ok:true})
})
xp.get('/leaderboard',async c=>{
const top=await users().find({'profile.athena.stats.attributes.xp':{$gte:0}}).project({_id:1,username:1,'profile.athena.stats.attributes':1}).sort({'profile.athena.stats.attributes.xp':-1}).limit(50).toArray()
return c.json({ok:true,leaders:top.map(u=>({id:String(u._id),username:u.username||'Player',xp:u.profile.athena.stats.attributes.xp||0,level:u.profile.athena.stats.attributes.level||1,wins:u.profile.athena.stats.attributes.wins||0,kills:u.profile.athena.stats.attributes.kills||0,matches:u.profile.athena.stats.attributes.matches||0}))})
})
export default xp