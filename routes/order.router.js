
import express from "express";

import {
  createOrder,
  getMyOrders,
  getOrderById,
  cancelOrder,
  getAllOrders,
  updateOrderStatus,
  updatePaymentStatus
} from "../controllers/order.controller.js";

import { protect } from "../middleware/auth.middleware.js";
import { adminOnly } from "../middleware/admin.middleware.js";

const router = express.Router();

// All routes require login
router.post("/", protect, createOrder);
router.get("/my-orders", protect, getMyOrders);
router.get("/:orderId", protect, getOrderById);
router.patch("/:orderId/cancel", protect, cancelOrder);
router.get("/admin/all", protect,adminOnly, getAllOrders);
router.patch("/admin/:orderId/status",protect,adminOnly,updateOrderStatus);
router.patch("/admin/:orderId/payment",protect,adminOnly,updatePaymentStatus);

export default router;
