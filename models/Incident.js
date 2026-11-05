const mongoose=require('mongoose');
const schema=new mongoose.Schema({source:{type:String,required:true},severity:{type:String,enum:['info','warning','error','critical'],default:'info'},message:{type:String,required:true},recoveryAction:{type:String,default:'No automatic action required'},resolved:{type:Boolean,default:false},resolvedAt:{type:Date,default:null}},{timestamps:true});
module.exports=mongoose.model('Incident',schema);
