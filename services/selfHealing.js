const mongoose=require('mongoose');
const os=require('os');
const fs=require('fs/promises');
const path=require('path');
const Incident=require('../models/Incident');
const settingsPath=path.join(__dirname,'..','data','self-healing-settings.json');
const state={status:'starting',lastCheck:null,database:'unknown',memoryPercent:0,actions:[],enabled:true,chaosActive:false,chaosScenario:null,chaosStartedAt:null};
let chaosRecoveryTimer=null;
async function logIncident(source,severity,message,recoveryAction){try{return await Incident.create({source,severity,message,recoveryAction});}catch(e){console.error('[self-healing] Could not persist incident:',e.message);return null;}}
async function loadSelfHealingSetting(){
  try{
    const settings=JSON.parse(await fs.readFile(settingsPath,'utf8'));
    if(typeof settings.enabled!=='boolean') throw new Error('Invalid self-healing setting: enabled must be a boolean.');
    state.enabled=settings.enabled;
  }catch(error){
    if(error.code==='ENOENT') return;
    throw error;
  }
}
async function setSelfHealingEnabled(enabled){
  if(typeof enabled!=='boolean') throw new Error('Self-healing setting must be a boolean.');
  await fs.mkdir(path.dirname(settingsPath),{recursive:true});
  await fs.writeFile(settingsPath,`${JSON.stringify({enabled},null,2)}\n`,'utf8');
  state.enabled=enabled;
}
function triggerChaos(scenario){
  if(typeof scenario!=='string'||!scenario.trim()) throw new Error('A scenario name is required for chaos simulation.');
  if(state.chaosActive) throw new Error('A chaos simulation is already active.');
  state.chaosActive=true;
  state.chaosScenario=scenario;
  state.chaosStartedAt=new Date().toISOString();
  if(chaosRecoveryTimer) clearTimeout(chaosRecoveryTimer);
  chaosRecoveryTimer=null;
  if(state.enabled){
    chaosRecoveryTimer=setTimeout(()=>{
      if(state.enabled) recoverChaos();
      else chaosRecoveryTimer=null;
    },8000);
    chaosRecoveryTimer.unref();
  }
}
function recoverChaos(){
  if(chaosRecoveryTimer) clearTimeout(chaosRecoveryTimer);
  chaosRecoveryTimer=null;
  const recovered=state.chaosActive;
  state.chaosActive=false;
  state.chaosScenario=null;
  state.chaosStartedAt=null;
  return recovered;
}
function getHealth(){const database=mongoose.connection.readyState===1?'connected':'disconnected';return {...state,database,enabled:state.enabled,status:state.chaosActive||database!=='connected'?'degraded':(state.status==='starting'?'healthy':state.status),actions:state.chaosActive?['Simulated service outage is active',state.enabled?'Automatic recovery is scheduled':'Recovery is paused until self-healing is enabled',`Chaos injected from ${state.chaosScenario}`]:state.actions,uptimeSeconds:Math.floor(process.uptime()),checkedAt:state.lastCheck?new Date(state.lastCheck).toLocaleString():'Not checked yet'};}
function startHealthMonitor(){
  async function check(){state.lastCheck=Date.now();const used=os.totalmem()-os.freemem();state.memoryPercent=Math.round(used/os.totalmem()*100);state.database=mongoose.connection.readyState===1?'connected':'disconnected';
    if(state.chaosActive){state.status='degraded';state.actions=['Simulated service outage is active',state.enabled?'Automatic recovery is scheduled':'Recovery is paused until self-healing is enabled',`Chaos injected from ${state.chaosScenario}`];}
    else if(state.database==='connected'){state.status='healthy';state.actions=['MongoDB connection available','HTTP server process is running'];}
    else{state.status='degraded';state.actions=['Detected MongoDB connection issue',state.enabled?'Automatic MongoDB reconnect retries are active':'Automatic MongoDB reconnect retries are paused until self-healing is enabled','Database-backed pages hide collection data until the connection is restored'];}
    if(state.memoryPercent>92){state.status='degraded';state.actions.push('Memory usage is high; warning logged. No unsafe automatic process kill is attempted.');await logIncident('memory-pressure','warning',`System memory usage is ${state.memoryPercent}%`,'Recorded warning; service remains running');}
    if(state.database!=='connected') await logIncident('health-check-db','warning','Health monitor cannot reach MongoDB',state.enabled?'Automatic MongoDB reconnect retries are active':'Automatic MongoDB reconnect retries are paused until self-healing is enabled');
  }
  check();setInterval(check,30000).unref();
}
module.exports={startHealthMonitor,logIncident,getHealth,loadSelfHealingSetting,setSelfHealingEnabled,triggerChaos,recoverChaos};
