
import{Hono}from'hono'
import{ObjectId}from'mongodb'
const reports=new Hono()
const users=()=>global.db.collection('users')
const reps=()=>global.db.collection('reports')
const ADMIN=process.env.MOONFALL_ADMIN_KEY||'moonfall_admin'
function oid(id){try{return new ObjectId(id)}catch{return null}}
function tok(h){return h?.replace('Bearer ','').replace('bearer ','').replace('eg1~','')||null}
async function me(c){
const t=tok(c.req.header('authorization'));if(!t)return null
let u=await users().findOne({token:t});if(u)return u
const _id=oid(t);if(_id)u=await users().findOne({_id})
return u
}
function isAdmin(c){return c.req.header('x-admin-key')===ADMIN}
function now(){return new Date()}
reports.post('/submit',async c=>{
const u=await me(c)
const b=await c.req.json().catch(()=>({}))
const type=(b.type||'player').toLowerCase()
if(!['player','bug','feedback'].includes(type))return c.json({error:'bad type'},400)
const targetId=b.targetId?oid(b.targetId):null
const doc={createdAt:now(),updatedAt:now(),status:'open',type,reporterId:u?u._id:null,reporterName:u?.username||null,targetId,targetName:b.targetName||null,reason:b.reason||null,details:b.details||null,matchId:b.matchId||null,evidence:Array.isArray(b.evidence)?b.evidence.slice(0,10):[],updates:[]}
const r=await reps().insertOne(doc)
return c.json({ok:true,id:String(r.insertedId)})
})
reports.get('/mine',async c=>{
const u=await me(c);if(!u)return c.json({error:'unauthorized'},401)
const list=await reps().find({reporterId:u._id}).sort({createdAt:-1}).limit(100).toArray()
return c.json({ok:true,reports:list.map(x=>({id:String(x._id),type:x.type,status:x.status,createdAt:x.createdAt,updatedAt:x.updatedAt,reason:x.reason,targetId:x.targetId?String(x.targetId):null,targetName:x.targetName}))})
})
reports.get('/',async c=>{
if(!isAdmin(c))return c.json({error:'unauthorized'},401)
const q=c.req.query('q')||''
const status=c.req.query('status')||''
const type=c.req.query('type')||''
const filter={}
if(q){filter.$or=[{reporterName:{$regex:q,$options:'i'}},{targetName:{$regex:q,$options:'i'}},{reason:{$regex:q,$options:'i'}},{details:{$regex:q,$options:'i'}}]}
if(status)filter.status=status
if(type)filter.type=type
const list=await reps().find(filter).sort({createdAt:-1}).limit(200).toArray()
return c.json({ok:true,reports:list.map(x=>({id:String(x._id),type:x.type,status:x.status,reporterId:x.reporterId?String(x.reporterId):null,reporterName:x.reporterName,targetId:x.targetId?String(x.targetId):null,targetName:x.targetName,reason:x.reason,createdAt:x.createdAt,updatedAt:x.updatedAt}))})
})
reports.get('/:id',async c=>{
const id=oid(c.req.param('id'));if(!id)return c.json({error:'not found'},404)
const u=await me(c)
const r=await reps().findOne({_id:id});if(!r)return c.json({error:'not found'},404)
if(!isAdmin(c)){
const uid=u?String(u._id):null
if(uid!==String(r.reporterId)&&uid!==String(r.targetId))return c.json({error:'forbidden'},403)
}
return c.json({ok:true,report:{id:String(r._id),type:r.type,status:r.status,reporterId:r.reporterId?String(r.reporterId):null,reporterName:r.reporterName,targetId:r.targetId?String(r.targetId):null,targetName:r.targetName,reason:r.reason,details:r.details,evidence:r.evidence,matchId:r.matchId,createdAt:r.createdAt,updatedAt:r.updatedAt,updates:r.updates||[]}})
})
reports.post('/:id/comment',async c=>{
if(!isAdmin(c))return c.json({error:'unauthorized'},401)
const id=oid(c.req.param('id'));if(!id)return c.json({error:'not found'},404)
const b=await c.req.json().catch(()=>({}))
const note=String(b.note||'')
await reps().updateOne({_id:id},{$push:{updates:{at:now(),note}},$set:{updatedAt:now()}})
return c.json({ok:true})
})
reports.post('/:id/resolve',async c=>{
if(!isAdmin(c))return c.json({error:'unauthorized'},401)
const id=oid(c.req.param('id'));if(!id)return c.json({error:'not found'},404)
const b=await c.req.json().catch(()=>({}))
const status=(b.status||'resolved').toLowerCase()
if(!['resolved','dismissed','actioned'].includes(status))return c.json({error:'bad status'},400)
await reps().updateOne({_id:id},{$set:{status,updatedAt:now()},$push:{updates:{at:now(),note:`status:${status}${b.note?` ${b.note}`:''}`}}})
return c.json({ok:true})
})
reports.post('/mod/ban',async c=>{
if(!isAdmin(c))return c.json({error:'unauthorized'},401)
const b=await c.req.json().catch(()=>({}))
const id=oid(b.userId);if(!id)return c.json({error:'bad id'},400)
const mins=Number(b.minutes||0)
const until=mins>0?new Date(Date.now()+mins*60000):null
await users().updateOne({_id:id},{$set:{ban:{active:true,reason:b.reason||'violation',until}}})
await reps().insertOne({createdAt:now(),updatedAt:now(),status:'actioned',type:'moderation',reporterId:null,reporterName:'system',targetId:id,targetName:null,reason:`ban:${b.reason||''}`,details:null,evidence:[],updates:[{at:now(),note:`ban until:${until||'indefinite'}`} ]})
return c.json({ok:true,until})
})
reports.post('/mod/unban',async c=>{
if(!isAdmin(c))return c.json({error:'unauthorized'},401)
const b=await c.req.json().catch(()=>({}))
const id=oid(b.userId);if(!id)return c.json({error:'bad id'},400)
await users().updateOne({_id:id},{$set:{ban:{active:false,reason:null,until:null}}})
return c.json({ok:true})
})
reports.post('/mod/warn',async c=>{
if(!isAdmin(c))return c.json({error:'unauthorized'},401)
const b=await c.req.json().catch(()=>({}))
const id=oid(b.userId);if(!id)return c.json({error:'bad id'},400)
await users().updateOne({_id:id},{$push:{warnings:{at:now(),reason:b.reason||'violation'}}})
await reps().insertOne({createdAt:now(),updatedAt:now(),status:'actioned',type:'moderation',reporterId:null,reporterName:'system',targetId:id,targetName:null,reason:`warn:${b.reason||''}`,details:null,evidence:[],updates:[{at:now(),note:'warn issued'}]})
return c.json({ok:true})
})
reports.get('/mod/stats',async c=>{
if(!isAdmin(c))return c.json({error:'unauthorized'},401)
const open=await reps().countDocuments({status:'open'})
const actioned=await reps().countDocuments({status:'actioned'})
const resolved=await reps().countDocuments({status:'resolved'})
const dismissed=await reps().countDocuments({status:'dismissed'})
return c.json({ok:true,counts:{open,actioned,resolved,dismissed}})
})
export default reports