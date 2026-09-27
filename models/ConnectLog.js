const mongoose=require('mongoose');
const schema=new mongoose.Schema({
 userId:{type:mongoose.Schema.Types.ObjectId,ref:'User',required:true},
 actionType:{type:String,enum:['call','message','proposal','post_ad','view_phone'],required:true},
 amountSpent:{type:Number,required:true},
 targetUserId:{type:mongoose.Schema.Types.ObjectId,ref:'User',required:function(){return ['call','message','proposal','view_phone'].includes(this.actionType);}},
 createdAt:{type:Date,default:Date.now}
});
schema.pre('validate',function(next){const needs=['call','message','proposal','view_phone'].includes(this.actionType);if(needs&&!this.targetUserId)this.invalidate('targetUserId','Target user required');if(this.actionType==='post_ad'&&this.targetUserId)this.invalidate('targetUserId','Post action must not have target');next();});
module.exports=mongoose.model('ConnectLog',schema);