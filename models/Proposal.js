const mongoose=require('mongoose');
const schema=new mongoose.Schema({
 senderId:{type:mongoose.Schema.Types.ObjectId,ref:'User',required:true},
 receiverId:{type:mongoose.Schema.Types.ObjectId,ref:'User',required:true},
 adId:{type:mongoose.Schema.Types.ObjectId,ref:'Ad',required:true},
 message:{type:String,required:true,trim:true,maxlength:3000},
 proposalType:{type:String,enum:['investment','business'],default:'investment'},
 status:{type:String,enum:['pending','accepted','rejected','cancelled'],default:'pending'}
},{timestamps:true});
schema.index({senderId:1,receiverId:1,adId:1,status:1});
module.exports=mongoose.model('Proposal',schema);