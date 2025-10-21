import{Hono}from'hono'
import{ObjectId}from'mongodb'
const friends=new Hono()
const users=()=>global.db.collection('users')
function oid(id){try{return new ObjectId(id)}catch{return null}}
function norm(s){return String(s||'').toLowerCase()}
async function byId(id){const _id=oid(id);if(!_id)return null;return await users().findOne({_id})}
async function byName(u){return await users().findOne({username:norm(u)})}
function tok(h){if(!h)return null;return h.replace('Bearer ','').replace('bearer ','').replace('eg1~','')}
async function me(c){
const auth=c.req.header('authorization');const t=tok(auth);if(!t)return null
let u=await users().findOne({token:t});if(u)return u
const id=oid(t);if(id)u=await users().findOne({_id:id})
return u
}
async function ensureFriendFields(u){
const set={}
if(!u.friends){set.friends=[]}
if(!u.incoming){set.incoming=[]}
if(!u.outgoing){set.outgoing=[]}
if(!u.blocked){set.blocked=[]}
if(!u.presence){set.presence={status:'offline',platform:'unknown',updatedAt:new Date().toISOString()}}
if(Object.keys(set).length)await users().updateOne({_id:u._id},{$set:set})
}
async function minimal(u){return{accountId:String(u._id),displayName:u.displayName||u.username||('Player'+String(u._id).slice(-6)),status:u.presence?.status||'offline',platform:u.presence?.platform||'unknown'}}
friends.get('/api/public/friends/:accountId',async c=>{
const{accountId}=c.req.param()
const u=await byId(accountId);if(!u)return c.json([])
await ensureFriendFields(u)
const list=await users().find({_id:{$in:u.friends.map(x=>oid(x)).filter(Boolean)}}).toArray()
return c.json(list.map(x=>({accountId:String(x._id)})))
})
friends.get('/api/v1/:accountId/summary',async c=>{
const{accountId}=c.req.param()
const u=await byId(accountId);if(!u)return c.json({friends:[],incoming:[],outgoing:[],suggested:[]})
await ensureFriendFields(u)
const q=async(ids)=>await users().find({_id:{$in:ids.map(x=>oid(x)).filter(Boolean)}}).project({_id:1,username:1,displayName:1,presence:1}).toArray()
const fr=await q(u.friends||[])
const inc=await q(u.incoming||[])
const out=await q(u.outgoing||[])
return c.json({friends:await Promise.all(fr.map(minimal)),incoming:await Promise.all(inc.map(minimal)),outgoing:await Promise.all(out.map(minimal)),suggested:[]})
})
friends.get('/list/:accountId',async c=>{
const{accountId}=c.req.param()
const u=await byId(accountId);if(!u)return c.json({error:'User not found'},404)
await ensureFriendFields(u)
return c.json({friends:u.friends||[],incoming:u.incoming||[],outgoing:u.outgoing||[],blocked:u.blocked||[]})
})
friends.get('/search',async c=>{
const q=norm(c.req.query('q')||'')
if(!q||q.length<2)return c.json({results:[]})
const res=await users().find({username:{$regex:`^${q}`,$options:'i'}}).limit(20).project({_id:1,username:1,displayName:1,presence:1}).toArray()
return c.json({results:await Promise.all(res.map(minimal))})
})
friends.post('/request',async c=>{
const m=await me(c);if(!m)return c.json({error:'Unauthorized'},401)
await ensureFriendFields(m)
const{toId,toName}=await c.req.json().catch(()=>({}))
let t=null
if(toId)t=await byId(toId);else if(toName)t=await byName(toName)
if(!t)return c.json({error:'Target not found'},404)
if(String(t._id)===String(m._id))return c.json({error:'Cannot friend self'},400)
await ensureFriendFields(t)
if((m.blocked||[]).includes(String(t._id))||(t.blocked||[]).includes(String(m._id)))return c.json({error:'Blocked'},403)
if((m.friends||[]).includes(String(t._id)))return c.json({ok:true,already:true})
if((m.outgoing||[]).includes(String(t._id)))return c.json({ok:true,pending:true})
await users().updateOne({_id:m._id},{$addToSet:{outgoing:String(t._id)}})
await users().updateOne({_id:t._id},{$addToSet:{incoming:String(m._id)}})
return c.json({ok:true})
})
friends.post('/accept',async c=>{
const m=await me(c);if(!m)return c.json({error:'Unauthorized'},401)
await ensureFriendFields(m)
const{fromId}=await c.req.json().catch(()=>({}))
const f=await byId(fromId);if(!f)return c.json({error:'User not found'},404)
await ensureFriendFields(f)
if(!(m.incoming||[]).includes(String(f._id)))return c.json({error:'No request'},400)
await users().updateOne({_id:m._id},{$pull:{incoming:String(f._id)},$addToSet:{friends:String(f._id)}})
await users().updateOne({_id:f._id},{$pull:{outgoing:String(m._id)},$addToSet:{friends:String(m._id)}})
return c.json({ok:true})
})
friends.post('/decline',async c=>{
const m=await me(c);if(!m)return c.json({error:'Unauthorized'},401)
const{fromId}=await c.req.json().catch(()=>({}))
if(!fromId)return c.json({error:'Missing fields'},400)
await users().updateOne({_id:m._id},{$pull:{incoming:String(fromId)}})
await users().updateOne({_id:oid(fromId)},{$pull:{outgoing:String(m._id)}})
return c.json({ok:true})
})
friends.post('/cancel',async c=>{
const m=await me(c);if(!m)return c.json({error:'Unauthorized'},401)
const{toId}=await c.req.json().catch(()=>({}))
if(!toId)return c.json({error:'Missing fields'},400)
await users().updateOne({_id:m._id},{$pull:{outgoing:String(toId)}})
await users().updateOne({_id:oid(toId)},{$pull:{incoming:String(m._id)}})
return c.json({ok:true})
})
friends.post('/remove',async c=>{
const m=await me(c);if(!m)return c.json({error:'Unauthorized'},401)
const{friendId}=await c.req.json().catch(()=>({}))
const f=await byId(friendId);if(!f)return c.json({error:'User not found'},404)
await users().updateOne({_id:m._id},{$pull:{friends:String(f._id)}})
await users().updateOne({_id:f._id},{$pull:{friends:String(m._id)}})
return c.json({ok:true})
})
friends.post('/block',async c=>{
const m=await me(c);if(!m)return c.json({error:'Unauthorized'},401)
const{targetId}=await c.req.json().catch(()=>({}))
const t=await byId(targetId);if(!t)return c.json({error:'User not found'},404)
await users().updateOne({_id:m._id},{$addToSet:{blocked:String(t._id)},$pull:{friends:String(t._id),incoming:String(t._id),outgoing:String(t._id)}})
await users().updateOne({_id:t._id},{$pull:{friends:String(m._id),incoming:String(m._id),outgoing:String(m._id)}})
return c.json({ok:true})
})
friends.post('/unblock',async c=>{
const m=await me(c);if(!m)return c.json({error:'Unauthorized'},401)
const{targetId}=await c.req.json().catch(()=>({}))
await users().updateOne({_id:m._id},{$pull:{blocked:String(targetId)}})
return c.json({ok:true})
})
friends.get('/presence/:accountId',async c=>{
const{accountId}=c.req.param()
const u=await byId(accountId);if(!u)return c.json({error:'User not found'},404)
const p=u.presence||{status:'offline',platform:'unknown'}
return c.json({accountId,status:p.status,platform:p.platform,updatedAt:p.updatedAt||null,playlist:p.playlist||null})
})
friends.post('/presence/set',async c=>{
const m=await me(c);if(!m)return c.json({error:'Unauthorized'},401)
const{status='online',platform='unknown',playlist=null}=await c.req.json().catch(()=>({}))
await users().updateOne({_id:m._id},{$set:{presence:{status,platform,playlist,updatedAt:new Date().toISOString()}}})
return c.json({ok:true})
})
export default friends