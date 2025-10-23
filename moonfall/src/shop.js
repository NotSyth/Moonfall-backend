
import{Hono}from'hono'
import{ObjectId}from'mongodb'
import fs from'fs'
import path from'path'
import crypto from'crypto'
const shop=new Hono()
const users=()=>global.db.collection('users')
const shopCol=()=>global.db.collection('shop')
const creators=()=>global.db.collection('creators')
function cfgPath(){return path.join(process.cwd(),'config','Catalog_Config.json')}
function readCfg(){try{return JSON.parse(fs.readFileSync(cfgPath(),'utf8'))}catch{return{catalogName:'Moonfall Item Shop',rotationIntervalHours:24,currency:'VBucks',priceTiers:{uncommon:800,rare:1200,epic:1500,legendary:2000,bundle:3500},categories:[{name:'Featured',slots:4,pool:[{id:'CID_001',name:'Renegade Raider',rarity:'legendary'},{id:'CID_002',name:'Black Knight',rarity:'legendary'},{id:'CID_003',name:'Skull Trooper',rarity:'epic'},{id:'CID_004',name:'Sparkle Specialist',rarity:'rare'},{id:'CID_005',name:'Aura',rarity:'uncommon'},{id:'CID_006',name:'Drift',rarity:'epic'}]},{name:'Daily',slots:6,pool:[{id:'CID_007',name:'Focus',rarity:'rare'},{id:'CID_008',name:'Galaxy',rarity:'legendary'},{id:'CID_009',name:'Brite Bomber',rarity:'rare'},{id:'CID_010',name:'John Wick',rarity:'legendary'},{id:'CID_011',name:'Moonfall Queen',rarity:'epic'}]},{name:'Bundles',slots:2,pool:[{id:'BUNDLE_001',name:'Legends Pack',rarity:'bundle'},{id:'BUNDLE_002',name:'Moonfall Legacy',rarity:'bundle'}]}]}}}
function pick(a,n){return a.slice().sort(()=>Math.random()-.5).slice(0,Math.min(n,a.length))}
function toEntry(cfg,i){const rarity=i.rarity||'rare';const price=i.price??cfg.priceTiers[rarity]??1200;return{devName:i.name,offerId:i.id,prices:[{currencyType:cfg.currency,finalPrice:price}],offerType:'StaticPrice',rarity}}
async function rotateIfNeeded(){
const cfg=readCfg()
const meta=await shopCol().findOne({_id:'meta'})
const now=Date.now(),interval=cfg.rotationIntervalHours*3600*1000
if(meta&&meta.expiresAt&&now<meta.expiresAt)return
const featCfg=cfg.categories.find(c=>c.name.toLowerCase().includes('featured'))||{pool:[],slots:0}
const dailyCfg=cfg.categories.find(c=>c.name.toLowerCase().includes('daily'))||{pool:[],slots:0}
const bundCfg=cfg.categories.find(c=>c.name.toLowerCase().includes('bundle'))||{pool:[],slots:0}
const featured=pick(featCfg.pool,featCfg.slots).map(x=>toEntry(cfg,x))
const daily=pick(dailyCfg.pool,dailyCfg.slots).map(x=>toEntry(cfg,x))
const bundles=pick(bundCfg.pool,bundCfg.slots).map(x=>toEntry(cfg,x))
const doc={_id:'catalog',rotationId:crypto.randomUUID(),updatedAt:new Date(),expiration:new Date(now+interval).toISOString(),storefronts:[{name:'BRFeatured',catalogEntries:featured},{name:'BRDaily',catalogEntries:daily},{name:'BRBundles',catalogEntries:bundles}]}
await shopCol().replaceOne({_id:'catalog'},doc,{upsert:true})
await shopCol().replaceOne({_id:'meta'},{_id:'meta',expiresAt:now+interval},{upsert:true})
}
function tokenFrom(h){return h?.replace('Bearer ','').replace('bearer ','').replace('eg1~','')||null}
async function findUser(auth,accountId){
if(accountId){try{return await users().findOne({_id:new ObjectId(accountId)})}catch{return null}}
const t=tokenFrom(auth);if(!t)return null
let u=await users().findOne({token:t});if(u)return u
try{u=await users().findOne({_id:new ObjectId(t)})}catch{}
return u
}
function getBal(u){return u?.profile?.common_core?.stats?.attributes?.mtx_balance??u?.vbucks??0}
function setBalDoc(u,val){if(u?.profile?.common_core)return{$set:{'profile.common_core.stats.attributes.mtx_balance':val}};return{$set:{vbucks:val}}}
function ownedPath(u){if(u?.profile?.athena)return'profile.athena.stats.attributes.owned';if(u?.cosmetics)return'cosmetics.owned';return'owned'}
function purchasesPath(u){if(u?.profile?.common_core)return'profile.common_core.stats.attributes.purchases';return'purchases'}
async function sacShare(u,amount){try{if(!u?.linkedCreator||!amount)return;await creators().updateOne({code:String(u.linkedCreator).toLowerCase()},{$inc:{earnings:amount*0.05}})}catch{}}
shop.get('/fortnite/api/storefront/v2/keychain',c=>c.json(['00000000000000000000000000000000:0000000000000000000000000000000000000000000000000000000000000000']))
shop.get('/fortnite/api/storefront/v2/catalog',async c=>{
await rotateIfNeeded()
const cfg=readCfg()
const cat=await shopCol().findOne({_id:'catalog'})
if(!cat)return c.json({refreshIntervalHrs:cfg.rotationIntervalHours,dailyPurchaseHrs:24,expiration:new Date(Date.now()+86400000).toISOString(),storefronts:[]})
return c.json({refreshIntervalHrs:cfg.rotationIntervalHours,dailyPurchaseHrs:24,expiration:cat.expiration,storefronts:cat.storefronts})
})
shop.get('/shop/rotation',async c=>{
const cat=await shopCol().findOne({_id:'catalog'})
if(!cat)return c.json({error:'No rotation'},404)
return c.json({rotationId:cat.rotationId,updatedAt:cat.updatedAt,expiration:cat.expiration})
})
shop.post('/shop/rotate',async c=>{await rotateIfNeeded();const cat=await shopCol().findOne({_id:'catalog'});return c.json({ok:true,rotationId:cat?.rotationId||null})})
shop.post('/fortnite/api/purchase',async c=>{
const b=await c.req.json().catch(()=>({}))
const u=await findUser(c.req.header('authorization'),b.accountId)
if(!u)return c.json({error:'Unauthorized'},401)
await rotateIfNeeded()
const cat=await shopCol().findOne({_id:'catalog'})
if(!cat)return c.json({error:'Shop not ready'},503)
const offers=[...cat.storefronts.flatMap(s=>s.catalogEntries)]
const ids=Array.isArray(b.offerIds)?b.offerIds:[b.offerId]
if(!ids||!ids.length)return c.json({error:'Missing offerId'},400)
let total=0;const items=[]
for(const id of ids){const it=offers.find(o=>o.offerId===id);if(!it)return c.json({error:`Item ${id} not found`},404);total+=Number(it.prices[0].finalPrice);items.push(it)}
const bal=getBal(u)
if(bal<total)return c.json({error:'Not enough VBucks',balance:bal,required:total},400)
const newBal=bal-total
await users().updateOne({_id:u._id},{...setBalDoc(u,newBal),$addToSet:{[ownedPath(u)]:{$each:items.map(x=>x.offerId)}},$push:{[purchasesPath(u)]:{date:new Date(),items:items.map(x=>({id:x.offerId,price:x.prices[0].finalPrice,name:x.devName})),note:'ItemShop'}}})
await sacShare(u,total)
return c.json({ok:true,spent:total,balance:newBal,granted:items.map(x=>x.offerId)})
})
export default shop