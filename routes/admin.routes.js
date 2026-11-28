import express from "express";
import {
  getDashboardStats,
  getAllReviewsAdmin,
  deleteReviewAdmin,
} from "../controllers/admin.controller.js";
import {
  getDeliveryPartners,
  createDeliveryPartner,
  updateDeliveryPartner,
  deleteDeliveryPartner,
} from "../controllers/deliveryPartner.controller.js";
import { protect, adminOnly } from "../middleware/auth.middleware.js";

const router = express.Router();

router.get("/dashboard", protect, adminOnly, getDashboardStats);

router.get("/reviews", protect, adminOnly, getAllReviewsAdmin);
router.delete("/reviews/:reviewId", protect, adminOnly, deleteReviewAdmin);

router.get("/delivery-partners", protect, adminOnly, getDeliveryPartners);
router.post("/delivery-partners", protect, adminOnly, createDeliveryPartner);
router.put("/delivery-partners/:partnerId", protect, adminOnly, updateDeliveryPartner);
router.delete("/delivery-partners/:partnerId", protect, adminOnly, deleteDeliveryPartner);

export default router;
