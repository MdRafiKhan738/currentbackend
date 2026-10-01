// const mongoose=require('mongoose');
// const AdSchema=new mongoose.Schema({
//  user:{type:mongoose.Schema.Types.ObjectId,ref:'User'},headline:{type:String,required:true},description:{type:String,required:true},images:{type:[String],default:[]},category:String,subCategory:String,location:String,subLocation:String,phone:String,phoneTypes:{type:[String],default:['call']},hidePhone:{type:Boolean,default:false},additionalPhones:[{number:String,types:[String]}],url:String,actionType:{type:String,enum:['detail','click'],default:'detail'},adType:{type:String,default:'Free'},status:{type:String,enum:['active','pending','rejected','expired','notification','pause','review','atv_msg','unatv_msg','deleted','inactive'],default:'review'},views:{type:Number,default:0},price:Number,priceType:{type:String,enum:['Negotiable','Fixed'],default:'Negotiable'},features:{type:Object,default:{}},promotionHistory:[{startDate:Date,endDate:Date,adType:String,promoteType:String,promoteTag:String,budget:Number,targetD:String,targetValue:Number,views:Number,deliveryCount:Number,createdAt:{type:Date,default:Date.now}}],labels:{type:[String],default:[]},
//  postRole:{type:String,enum:['investor','business_owner']},businessStatus:{type:String,enum:['new','running','closed']},minInvestment:{type:Number,min:0},maxInvestment:{type:Number,min:0},expectedReturn:{type:Number,min:0},investmentReturnType:{type:String,enum:['expected','return','refund']}
// },{timestamps:true});
// AdSchema.index({status:1,createdAt:-1});AdSchema.index({category:1,status:1});AdSchema.index({headline:'text',description:'text'});
// module.exports=mongoose.model('Ad',AdSchema);



const mongoose = require('mongoose');

const adSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: false
    },
    headline: {
        type: String,
        required: true
    },
    description: {
        type: String,
        required: true
    },
    pendingDescription: {
        type: String
    },
    pendingImages: {
        type: [String]
    },
    category: {
        type: String,
        required: false
    },
    subCategory: {
        type: String
    },
    location: {
        type: String,
        required: false
    },
    subLocation: {
        type: String
    },
    phone: {
        type: String,
        required: false
    },
    phoneTypes: {
        type: [String], // ['whatsapp', 'telegram', 'call']
        default: ['call']
    },
    hidePhone: {
        type: Boolean,
        default: false
    },
    additionalPhones: [{
        number: String,
        types: [String] // ['whatsapp', 'telegram', 'call']
    }],
    url: {
        type: String
    },
    actionType: {
        type: String,
        enum: ['detail', 'click'],
        default: 'detail'
    },
    images: {
        type: [String], // Array of image URLs/paths
        default: []
    },
    adType: {
        type: String,
        default: 'Free'
    },
    // Promotion Details
    promoteType: {
        type: String,
        enum: ['call_msg', 'traffic']
    },
    trafficLink: {
        type: String
    },
    trafficButtonType: {
        type: String
    },
    promoteTag: {
        type: String,
        default: 'All'
    },
    targetLocations: {
        type: [String]
    },
    promoteDuration: {
        type: Number
    },
    promoteStartDate: {
        type: Date
    },
    promoteEndDate: {
        type: Date
    },
    promoteBudget: {
        type: Number
    },
    estimatedReach: {
        type: String
    },
    status: {
        type: String,
        enum: ['active', 'pending', 'rejected', 'expired', 'notification', 'pause', 'review', 'atv_msg', 'unatv_msg', 'deleted', 'inactive'],
        default: 'review'
    },
    views: {
        type: Number,
        default: 0
    },
    deliveryCount: {
        type: Number,
        default: 0
    },
    targetValue: {
        type: Number,
        default: 0
    },
    dailyDeliveryCount: {
        type: Number,
        default: 0
    },
    slotDeliveryCount: {
        type: Number,
        default: 0
    },
    currentSlot: {
        type: Number,
        default: 0
    },
    lastDeliveryDate: {
        type: Date,
        default: Date.now
    },
    promotedDeliveryCount: {
        type: Number,
        default: 0
    },
    dailyViewsCount: {
        type: Number,
        default: 0
    },
    slotViewsCount: {
        type: Number,
        default: 0
    },
    lastViewsDate: {
        type: Date,
        default: Date.now
    },
    promotedViews: {
        type: Number,
        default: 0
    },
    price: {
        type: Number
    },
    priceType: {
        type: String,
        enum: ['Negotiable', 'Fixed'],
        default: 'Negotiable'
    },
    merchantID: {
        type: String
    },
    pwrTarget: {
        type: [String] // Array of colors like ['red', 'yellow', 'green', 'blue']
    },
    targetD: {
        type: String
    },
    notificationDialogue: {
        type: String
    },
    showTill: {
        type: Date
    },
    autoInactiveAt: {
        type: Date,
        default: null
    },
    rep: {
        type: String
    },
    lgs: {
        type: String
    },
    senBy: {
        type: String
    },
    edBy: {
        type: String
    },
    note: {
        type: String
    },
    photoStatus: {
        type: String,
        enum: ['pending', 'approved', 'rejected'],
        default: 'pending'
    },
    features: {
        type: Object, // Store as key-value pairs
        default: {}
    },
    userUpdated: {
        type: Boolean,
        default: false
    },
    userNewPhotos: {
        type: Boolean,
        default: false
    },
    promotionHistory: [{
        startDate: Date,
        endDate: Date,
        adType: String,
        promoteType: String,
        promoteTag: String,
        budget: Number,
        targetD: String,
        targetValue: Number,
        views: Number,
        deliveryCount: Number,
        createdAt: {
            type: Date,
            default: Date.now
        }
    }],
    labels: {
        type: [String],
        default: []
    },

    // ---- Investment-platform fields (new in shadamoninvest) ----
    postRole: {
        type: String,
        enum: ['investor', 'business_owner']
    },
    businessStatus: {
        type: String,
        enum: ['new', 'running', 'closed']
    },
    minInvestment: { type: Number, min: 0 },
    maxInvestment: { type: Number, min: 0 },
    expectedReturn: { type: Number, min: 0 },
    investmentReturnType: {
        type: String,
        enum: ['expected', 'return', 'refund']
    }
}, { timestamps: true });

adSchema.index({ status: 1, createdAt: -1 });
adSchema.index({ category: 1, status: 1 });
adSchema.index({ location: 1, status: 1 });
adSchema.index({ headline: 'text', description: 'text' });
adSchema.index({ adType: 1, createdAt: -1 });

module.exports = mongoose.model('Ad', adSchema);
