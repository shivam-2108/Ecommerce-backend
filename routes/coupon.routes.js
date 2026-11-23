
import express from "express";
import { createCoupon,
    getAllCoupons,
    applyCoupon,
    deactivateCoupon,
    deleteCoupon
 } from "../controllers/coupon.controller.js";


import { protect } from "../middleware/auth.middleware.js";
import { adminOnly } from "../middleware/admin.middleware.js";

const router = express.Router();


router.post("/", protect, adminOnly, createCoupon);
router.get("/", protect, adminOnly, getAllCoupons);
router.post("/apply", protect, applyCoupon);

router.patch("/:couponId/deactivate", protect, adminOnly, deactivateCoupon);
router.delete("/:couponId", protect, adminOnly, deleteCoupon);

export default router;
