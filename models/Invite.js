const mongoose=require('mongoose');
const schema=new mongoose.Schema({
 senderId:{type:mongoose.Schema.Types.ObjectId,ref:'User',required:true},
 receiverId:{type:mongoose.Schema.Types.ObjectId,ref:'User',required:true},
 adId:{type:mongoose.Schema.Types.ObjectId,ref:'Ad'},
 category:String,subCategory:String,location:String,subLocation:String,
 status:{type:String,enum:['pending','accepted','rejected'],default:'pending'},
 createdAt:{type:Date,default:Date.now}
});
module.exports=mongoose.model('Invite',schema);