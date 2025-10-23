
import dotenv from'dotenv';dotenv.config()
import{MongoClient,ObjectId}from'mongodb'
import{Client,GatewayIntentBits,ActivityType,REST,Routes,EmbedBuilder}from'discord.js'

const TOKEN=process.env.DISCORD_BOT_TOKEN
const CLIENT_ID=process.env.DISCORD_CLIENT_ID
const GUILD_ID=process.env.DISCORD_GUILD_ID||null
const BOT_NAME=process.env.DISCORD_BOT_NAME||'MoonfallBot'
const MONGO_URI=process.env.MONGO_URI||'mongodb://127.0.0.1:27017/moonfall'
const PRESENCE_INTERVAL=Number(process.env.BOT_PRESENCE_INTERVAL||15000)

if(!TOKEN||!CLIENT_ID){console.error('Missing DISCORD_BOT_TOKEN or DISCORD_CLIENT_ID');process.exit(1)}

const dbClient=new MongoClient(MONGO_URI)
let db,users

async function initDB(){await dbClient.connect();db=dbClient.db();users=db.collection('users')}

async function countIngame(){
try{
return await users.countDocuments({'presence.playlist':{$exists:true,$nin:[null,'']}})
}catch{return 0}
}

async function updateStatus(client){
const n=await countIngame()
const text=`Moonfall is watching ${n} Players`
client.user.setPresence({status:'online',activities:[{type:ActivityType.Playing,name:text}]})
}

const commands=[{
name:'stats',description:'Show Moonfall player stats',options:[{name:'username',description:'Moonfall username',type:3,required:true}]
}]

async function registerCommands(){
const rest=new REST({version:'10'}).setToken(TOKEN)
if(GUILD_ID){await rest.put(Routes.applicationGuildCommands(CLIENT_ID,GUILD_ID),{body:commands})}
else{await rest.put(Routes.applicationCommands(CLIENT_ID),{body:commands})}
}

const client=new Client({intents:[GatewayIntentBits.Guilds]})

client.once('ready',async()=>{
await initDB()
await registerCommands()
await updateStatus(client)
setInterval(()=>updateStatus(client),PRESENCE_INTERVAL)
console.log(`${BOT_NAME} ready`)
})

client.on('interactionCreate',async i=>{
try{
if(!i.isChatInputCommand())return
if(i.commandName==='stats'){
const uname=(i.options.getString('username')||'').toLowerCase()
if(!uname)return i.reply({content:'Missing username',ephemeral:true})
const u=await users.findOne({username:uname})
if(!u)return i.reply({content:'User not found',ephemeral:true})
const a=u?.profile?.athena?.stats?.attributes||{}
const level=a.level||1
const xp=a.xp||0
const wins=a.wins||0
const kills=a.kills||0
const matches=a.matches||0
const arena=a.arenaPoints||0
const embed=new EmbedBuilder()
.setTitle(`Stats • ${u.displayName||u.username}`)
.addFields(
{name:'Level',value:String(level),inline:true},
{name:'XP',value:String(xp),inline:true},
{name:'Wins',value:String(wins),inline:true},
{name:'Kills',value:String(kills),inline:true},
{name:'Matches',value:String(matches),inline:true},
{name:'Arena Points',value:String(arena),inline:true}
)
.setColor(0x00c3ff)
.setTimestamp(new Date())
return i.reply({embeds:[embed]})
}
}catch(e){try{if(i.isRepliable())await i.reply({content:'Error',ephemeral:true})}catch{}}
})

client.login(TOKEN)