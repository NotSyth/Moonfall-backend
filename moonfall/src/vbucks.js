import{Hono}from'hono'
import{ObjectId}from'mongodb'
const vbucks=new Hono()
const users=()=>global.db.collection('users')
function tok(h){return h?.replace('Bearer ','').replace('bearer ','').replace('eg1~','')||null}
async function getUser(auth,accountId){
if(accountId){try{return await users().findOne({_id:new ObjectId(accountId)})}catch{return null}}
const t=tok(auth);if(!t)return null
let u=await users().findOne({token:t});if(u)return u
try{u=await users().findOne({_id:new ObjectId(t)})}catch{}
return u
}
function getBal(u){return u?.profile?.common_core?.stats?.attributes?.mtx_balance??u?.vbucks??0}
function setBalDoc(u,val){if(u?.profile?.common_core)return{$set:{'profile.common_core.stats.attributes.mtx_balance':val}};return{$set:{vbucks:val}}}
vbucks.get('/balance/:accountId',async c=>{
const{accountId}=c.req.param()
let u;try{u=await users().findOne({_id:new ObjectId(accountId)})}catch{return c.json({error:'User not found'},404)}
if(!u)return c.json({error:'User not found'},404)
return c.json({balance:getBal(u)})
})
vbucks.post('/add',async c=>{
const b=await c.req.json().catch(()=>({}))
const u=await getUser(c.req.header('authorization'),b.accountId)
if(!u)return c.json({error:'Unauthorized'},401)
const amt=Number(b.amount||0);if(!Number.isFinite(amt)||amt<=0)return c.json({error:'Bad amount'},400)
const nb=getBal(u)+amt
await users().updateOne({_id:u._id},setBalDoc(u,nb))
return c.json({ok:true,balance:nb})
})
vbucks.post('/remove',async c=>{
const b=await c.req.json().catch(()=>({}))
const u=await getUser(c.req.header('authorization'),b.accountId)
if(!u)return c.json({error:'Unauthorized'},401)
const amt=Number(b.amount||0);if(!Number.isFinite(amt)||amt<=0)return c.json({error:'Bad amount'},400)
const bal=getBal(u);if(bal<amt)return c.json({error:'Insufficient'},400)
const nb=bal-amt
await users().updateOne({_id:u._id},setBalDoc(u,nb))
return c.json({ok:true,balance:nb})
})
vbucks.post('/set',async c=>{
const b=await c.req.json().catch(()=>({}))
const u=await getUser(c.req.header('authorization'),b.accountId)
if(!u)return c.json({error:'Unauthorized'},401)
const val=Number(b.value);if(!Number.isFinite(val)||val<0)return c.json({error:'Bad value'},400)
await users().updateOne({_id:u._id},setBalDoc(u,val))
return c.json({ok:true,balance:val})
})
vbucks.post('/gift',async c=>{
const b=await c.req.json().catch(()=>({}))
const from=await getUser(c.req.header('authorization'),b.fromId)
if(!from)return c.json({error:'Unauthorized'},401)
let to;try{to=await users().findOne({_id:new ObjectId(b.toId)})}catch{return c.json({error:'Target not found'},404)}
if(!to)return c.json({error:'Target not found'},404)
const amt=Number(b.amount||0);if(!Number.isFinite(amt)||amt<=0)return c.json({error:'Bad amount'},400)
const fb=getBal(from);if(fb<amt)return c.json({error:'Insufficient'},400)
await users().updateOne({_id:from._id},setBalDoc(from,fb-amt))
await users().updateOne({_id:to._id},setBalDoc(to,getBal(to)+amt))
return c.json({ok:true,fromBalance:fb-amt})
})
export default vbucks