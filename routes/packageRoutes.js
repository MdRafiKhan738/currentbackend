const router=require("express").Router();
const c=require("../controllers/packageController");
const {verifyToken,checkPermission,authenticateUser}=require("../middleware/auth");
const adminGuard=[verifyToken,checkPermission("Settings & Others")];

router.get("/",c.getPackages);
router.get("/mine",authenticateUser,c.getMyPackage);
router.get("/admin",...adminGuard,c.getAllPackages);
router.get("/admin/search-user",...adminGuard,c.searchUserByMobile);
router.get("/admin/phone-history",...adminGuard,c.getPhoneViewHistory);
router.post("/",...adminGuard,c.createPackage);
router.put("/:id",...adminGuard,c.updatePackage);
router.delete("/:id",...adminGuard,c.deletePackage);
router.post("/manual-inject",...adminGuard,c.manualInject);
router.post("/manual-update-validity",...adminGuard,c.updateManualPackageValidity);
router.post("/set-connect-balance",...adminGuard,c.setConnectBalance);
router.post("/manual-refund",...adminGuard,c.refundCredit);

module.exports=router;
