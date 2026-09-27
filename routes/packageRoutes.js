const router=require("express").Router();
const c=require("../controllers/packageController");
const {verifyToken,checkPermission}=require("../middleware/auth");
const adminGuard=[verifyToken,checkPermission("Settings & Others")];

router.get("/",c.getPackages);
router.get("/admin",...adminGuard,c.getAllPackages);
router.post("/",...adminGuard,c.createPackage);
router.put("/:id",...adminGuard,c.updatePackage);
router.delete("/:id",...adminGuard,c.deletePackage);
router.post("/manual-inject",...adminGuard,c.manualInject);
router.post("/manual-refund",...adminGuard,c.refundCredit);

module.exports=router;
