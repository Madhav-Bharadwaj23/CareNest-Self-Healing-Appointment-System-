const mongoose=require('mongoose');
const os=require('os');
const Incident=require('../models/Incident');
const state={status:'starting',lastCheck:null,database:'unknown',memoryPercent:0,actions:[]};
async function logIncident(source,severity,message,recoveryAction){try{return await Incident.create({source,severity,message,recoveryAction});}catch(e){console.error('[self-healing] Could not persist incident:',e.message);return null;}}
function getHealth(){return {...state,uptimeSeconds:Math.floor(process.uptime()),checkedAt:state.lastCheck?new Date(state.lastCheck).toLocaleString():'Not checked yet'};}
function startHealthMonitor(){
  async function check(){state.lastCheck=Date.now();const used=os.totalmem()-os.freemem();state.memoryPercent=Math.round(used/os.totalmem()*100);state.database=mongoose.connection.readyState===1?'connected':'disconnected';
    if(state.database==='connected'){state.status='healthy';state.actions=['MongoDB connection available','HTTP server process is running'];}
    else{state.status='degraded';state.actions=['Detected MongoDB connection issue','Mongoose connection manager retries connection automatically','Requests that require data show a safe fallback instead of crashing'];}
    if(state.memoryPercent>92){state.status='degraded';state.actions.push('Memory usage is high; warning logged. No unsafe automatic process kill is attempted.');await logIncident('memory-pressure','warning',`System memory usage is ${state.memoryPercent}%`,'Recorded warning; service remains running');}
    if(state.database!=='connected') await logIncident('health-check-db','warning','Health monitor cannot reach MongoDB','Mongoose automatic reconnection remains enabled');
  }
  check();setInterval(check,30000).unref();
}
module.exports={startHealthMonitor,logIncident,getHealth};
