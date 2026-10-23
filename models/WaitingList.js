const mongoose=require('mongoose');
const schema=new mongoose.Schema({patientId:{type:mongoose.Schema.Types.ObjectId,ref:'User',required:true,index:true},doctorId:{type:mongoose.Schema.Types.ObjectId,ref:'Doctor',required:true},preferredDate:{type:Date,default:null},reason:{type:String,default:'Flexible appointment'},status:{type:String,enum:['waiting','offered','booked','removed'],default:'waiting'},offeredAppointmentDate:{type:Date,default:null}},{timestamps:true});
module.exports=mongoose.model('WaitingList',schema);
