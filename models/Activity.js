const mongoose=require('mongoose');
const schema=new mongoose.Schema({userId:{type:mongoose.Schema.Types.ObjectId,ref:'User',required:true},actionText:{type:String,required:true},createdAt:{type:Date,default:Date.now}});
module.exports=mongoose.model('Activity',schema);