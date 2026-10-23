const mongoose=require('mongoose');
const schema=new mongoose.Schema({userId:{type:mongoose.Schema.Types.ObjectId,ref:'User',default:null,index:true},type:{type:String,default:'general'},message:{type:String,required:true},status:{type:String,enum:['unread','read'],default:'unread'}},{timestamps:true});
module.exports=mongoose.model('Notification',schema);
