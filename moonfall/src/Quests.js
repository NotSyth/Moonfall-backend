import{Hono}from'hono'
import{ObjectId}from'mongodb'
import fs from'fs'
import path from'path'
import crypto from'crypto'
const quests=new Hono()
const users=()=>global.db.collection('users')
const GS=process.env.MOONFALL_GS_SECRET||'moonfall_gs'
function qp(){return path.join(process.cwd(),'config','Quests.json')}
function readCfg(){try{return JSON.parse(fs.readFileSync(qp(),'utf8'))}catch{return{daily:[{id:'D_ELIMS',name:'Eliminate Opponents',required:5,reward:{xp:750,vbucks:25}},{id:'D_DAMAGE',name:'Deal Damage',required:1000,reward:{xp:600,vbucks:20}},{id:'D_SURVIVE',name:'Survive Storm Phases',required:5,reward:{xp:650,vbucks:20}}],weekly:[{id:'W_TOP25',name:'Finish Top 25',required:3,reward:{xp:2500,vbucks:100}},{id:'W_CHESTS',name:'Search Chests',required:20,reward:{xp:2000,vbucks:75}}],special:[]}}}
function pick(a,n){return a.slice().sort(()=>Math.random()-.5).slice(0,Math.min(n,a.length))}
function nextDaily(){const d=new Date();d.setUTCHours(24,0,0,0);return d}
function nextWeekly(){const d=new Date();const day=d.getUTCDay();const add=(8-day)%7||7;d.setUTCDate(d.getUTCDate()+add);d.setUTCHours(0,0,0,0);return d}
function ensurePaths(u){if(!u.profile)u.profile={};if(!u.profile.athena)u.profile.athena={stats:{attributes:{}}};if(!u.profile.athena.stats)u.profile.athena.stats={attributes:{}};if(!u.profile.athena.stats.attributes)u.profile.athena.stats.attributes={};if(!u.profile.common_core)u.profile.common_core={stats:{attributes:{}}};if(!u.profile.common_core.stats)u.profile.common_core.stats={attributes:{}};if(!u.profile.common_core.stats.attributes)u.profile.common_core.stats.attributes={};return u}
function ownedPath(u){return'profile.athena.stats.attributes.owned'}
function purchasesPath(u){return'profile.common_core.stats.attributes.purchases'}
function getBalance(u){return u?.profile?.common_core?.stats?.attributes?.mtx_balance??u?.vbucks??0}
function setBalanceDoc(newBal){return{$set:{'profile.common_core.stats.attributes.mtx_balance':newBal}}}
function genQuest(q,t){return{qid:q.id||crypto.randomUUID(),id:q.id||crypto.randomUUID(),type:t,name:q.name||'Quest',required:q.required||1,progress:0,completed:false,claimed:false,expiresAt:(t==='daily'?nextDaily():t==='weekly'?nextWeekly():new Date(Date.now()+7*86400000)).toISOString(),reward:q.reward||{xp:250},grants:q.grants||{}}}
async function ensureQuests(u){
u=ensurePaths(u)
const a=u.profile.athena.stats.attributes
if(!a.questState)a.questState={}
const cfg=readCfg()
const now=new Date()
let changed=false
if(!a.questState.daily||!a.questState.daily.expiresAt||new Date(a.questState.daily.expiresAt)<=now){a.questState.daily={expiresAt:nextDaily().toISOString(),list:pick(cfg.daily,3).map(q=>genQuest(q,'daily'))};changed=true}
if(!a.questState.weekly||!a.questState.weekly.expiresAt||new Date(a.questState.weekly.expiresAt)<=now){a.questState.weekly={expiresAt:nextWeekly().toISOString(),list:pick(cfg.weekly,3).map(q=>genQuest(q,'weekly'))};changed=true}
if(changed)await users().updateOne({_id:u._id},{$set:{'profile.athena.stats.attributes.questState':a.questState}})
return a.questState
}
async function addRewards(u,rew){
u=ensurePaths(u)
const xp=Number(rew.xp||0),vb=Number(rew.vbucks||0)
const owned=Array.isArray(rew.items)?rew.items:[]
const bal=getBalance(u)
const ops={$inc:{},$addToSet:{},$push:{}}
if(xp>0){ops.$inc['profile.athena.stats.attributes.xp']=xp}
if(vb>0){ops.$set={...(ops.$set||{}),...setBalanceDoc(bal+vb).$set}}
if(owned.length){ops.$addToSet[ownedPath(u)]={$each:owned}}
if(owned.length||vb>0){ops.$push[purchasesPath(u)]={date:new Date(),items:owned.map(i=>({id:i,price:0,name:i})),note:'QuestReward'}}
Object.keys(ops.$inc).length||delete ops.$inc
Object.keys(ops.$addToSet).length||delete ops.$addToSet
Object.keys(ops.$push).length||delete ops.$push
Object.keys(ops).length?await users().updateOne({_id:u._id},ops):null
return{xpAwarded:xp,vbucksAwarded:vb,itemsGranted:owned}
}
function collectAll(u){const s=u?.profile?.athena?.stats?.attributes?.questState;return s?[...(s.daily?.list||[]),...(s.weekly?.list||[]),...(s.special?.list||[])]:[]}
quests.get('/active/:accountId',async c=>{
const{accountId}=c.req.param()
let u;try{u=await users().findOne({_id:new ObjectId(accountId)})}catch{return c.json({error:'User not found'},404)}
if(!u)return c.json({error:'User not found'},404)
const state=await ensureQuests(u)
return c.json({daily:state.daily,weekly:state.weekly,special:state.special||{expiresAt:null,list:[]}})
})
quests.post('/progress',async c=>{
const{accountId,questId,amount=1}=await c.req.json().catch(()=>({}))
if(!accountId||!questId)return c.json({error:'Missing fields'},400)
let u;try{u=await users().findOne({_id:new ObjectId(accountId)})}catch{return c.json({error:'User not found'},404)}
if(!u)return c.json({error:'User not found'},404)
await ensureQuests(u)
const list=collectAll(u)
const q=list.find(x=>x.id===questId||x.qid===questId)
if(!q)return c.json({error:'Quest not found'},404)
if(q.claimed)return c.json({error:'Already claimed'},400)
q.progress=Math.min(q.required,(q.progress||0)+Number(amount))
q.completed=q.progress>=q.required
await users().updateOne({_id:u._id, 'profile.athena.stats.attributes.questState.daily.list.id':q.id},{$set:{'profile.athena.stats.attributes.questState.daily.list.$.progress':q.progress,'profile.athena.stats.attributes.questState.daily.list.$.completed':q.completed}})
await users().updateOne({_id:u._id, 'profile.athena.stats.attributes.questState.weekly.list.id':q.id},{$set:{'profile.athena.stats.attributes.questState.weekly.list.$.progress':q.progress,'profile.athena.stats.attributes.questState.weekly.list.$.completed':q.completed}})
await users().updateOne({_id:u._id, 'profile.athena.stats.attributes.questState.special.list.id':q.id},{$set:{'profile.athena.stats.attributes.questState.special.list.$.progress':q.progress,'profile.athena.stats.attributes.questState.special.list.$.completed':q.completed}})
return c.json({ok:true,quest:{id:q.id,name:q.name,progress:q.progress,required:q.required,completed:q.completed}})
})
quests.post('/claim',async c=>{
const{accountId,questId}=await c.req.json().catch(()=>({}))
if(!accountId||!questId)return c.json({error:'Missing fields'},400)
let u;try{u=await users().findOne({_id:new ObjectId(accountId)})}catch{return c.json({error:'User not found'},404)}
if(!u)return c.json({error:'User not found'},404)
await ensureQuests(u)
const state=u.profile.athena.stats.attributes.questState
const all=collectAll(u)
const q=all.find(x=>x.id===questId||x.qid===questId)
if(!q)return c.json({error:'Quest not found'},404)
if(!q.completed)return c.json({error:'Not completed'},400)
if(q.claimed)return c.json({error:'Already claimed'},400)
q.claimed=true
const rew=await addRewards(u,q.reward||{})
await users().updateOne({_id:u._id,'profile.athena.stats.attributes.questState.daily.list.id':q.id},{$set:{'profile.athena.stats.attributes.questState.daily.list.$.claimed':true}})
await users().updateOne({_id:u._id,'profile.athena.stats.attributes.questState.weekly.list.id':q.id},{$set:{'profile.athena.stats.attributes.questState.weekly.list.$.claimed':true}})
await users().updateOne({_id:u._id,'profile.athena.stats.attributes.questState.special.list.id':q.id},{$set:{'profile.athena.stats.attributes.questState.special.list.$.claimed':true}})
return c.json({ok:true,reward:rew})
})
quests.post('/gs/progress',async c=>{
if(c.req.header('x-gs-key')!==GS)return c.json({error:'Unauthorized'},401)
const{updates}=await c.req.json().catch(()=>({}))
if(!Array.isArray(updates)||!updates.length)return c.json({error:'Missing updates'},400)
const out=[]
for(const u of updates){
try{
const{accountId,questId,amount=1}=u
if(!accountId||!questId){out.push({ok:false,error:'bad'});continue}
let usr=await users().findOne({_id:new ObjectId(accountId)});if(!usr){out.push({ok:false,error:'notfound'});continue}
await ensureQuests(usr)
const list=collectAll(usr)
const q=list.find(x=>x.id===questId||x.qid===questId);if(!q){out.push({ok:false,error:'nq'});continue}
q.progress=Math.min(q.required,(q.progress||0)+Number(amount));q.completed=q.progress>=q.required
await users().updateOne({_id:usr._id,'profile.athena.stats.attributes.questState.daily.list.id':q.id},{$set:{'profile.athena.stats.attributes.questState.daily.list.$.progress':q.progress,'profile.athena.stats.attributes.questState.daily.list.$.completed':q.completed}})
await users().updateOne({_id:usr._id,'profile.athena.stats.attributes.questState.weekly.list.id':q.id},{$set:{'profile.athena.stats.attributes.questState.weekly.list.$.progress':q.progress,'profile.athena.stats.attributes.questState.weekly.list.$.completed':q.completed}})
await users().updateOne({_id:usr._id,'profile.athena.stats.attributes.questState.special.list.id':q.id},{$set:{'profile.athena.stats.attributes.questState.special.list.$.progress':q.progress,'profile.athena.stats.attributes.questState.special.list.$.completed':q.completed}})
out.push({ok:true,id:q.id,progress:q.progress,completed:q.completed})
}catch(e){out.push({ok:false,error:'ex'})}
}
return c.json({ok:true,results:out})
})
quests.post('/reset',async c=>{
if(c.req.header('x-gs-key')!==GS)return c.json({error:'Unauthorized'},401)
const{accountId,type='daily'}=await c.req.json().catch(()=>({}))
if(!accountId)return c.json({error:'Missing fields'},400)
let u;try{u=await users().findOne({_id:new ObjectId(accountId)})}catch{return c.json({error:'User not found'},404)}
if(!u)return c.json({error:'User not found'},404)
const cfg=readCfg()
const set={}
if(type==='daily')set['profile.athena.stats.attributes.questState.daily']={expiresAt:nextDaily().toISOString(),list:pick(cfg.daily,3).map(q=>genQuest(q,'daily'))}
else if(type==='weekly')set['profile.athena.stats.attributes.questState.weekly']={expiresAt:nextWeekly().toISOString(),list:pick(cfg.weekly,3).map(q=>genQuest(q,'weekly'))}
else set['profile.athena.stats.attributes.questState']={daily:{expiresAt:nextDaily().toISOString(),list:pick(cfg.daily,3).map(q=>genQuest(q,'daily'))},weekly:{expiresAt:nextWeekly().toISOString(),list:pick(cfg.weekly,3).map(q=>genQuest(q,'weekly'))},special:{expiresAt:null,list:[]}}
await users().updateOne({_id:u._id},{$set:set})
return c.json({ok:true})
})
export default quests