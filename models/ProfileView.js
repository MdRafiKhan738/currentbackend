const mongoose=require('mongoose');
const schema=new mongoose.Schema({viewerId:{type:mongoose.Schema.Types.ObjectId,ref:'User',required:true},viewedProfileId:{type:mongoose.Schema.Types.ObjectId,ref:'User',required:true},createdAt:{type:Date,default:Date.now}});
module.exports=mongoose.model('ProfileView',schema);