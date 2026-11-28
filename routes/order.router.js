import express from "express";
import {
  createOrder,
  getMyOrders,
  getOrderById,
  cancelOrder,
  requestRefund,
  buyAgainOrder,
  getAllOrders,
  updateOrderStatus,
  updatePaymentStatus,
  assignDeliveryPartner,
  processRefundAdmin,
  syncRazorpayRefundStatus,
} from "../controllers/order.controller.js";
import { protect } from "../middleware/auth.middleware.js";
import { adminOnly } from "../middleware/admin.middleware.js";

const router = express.Router();

// Customer routes
router.post("/", protect, createOrder);
router.get("/my-orders", protect, getMyOrders);
router.get("/admin/all", protect, adminOnly, getAllOrders);
router.get("/:orderId", protect, getOrderById);
router.patch("/:orderId/cancel", protect, cancelOrder);
router.post("/:orderId/refund", protect, requestRefund);
router.post("/:orderId/buy-again", protect, buyAgainOrder);

// Admin routes
router.patch("/admin/:orderId/status", protect, adminOnly, updateOrderStatus);
router.patch("/admin/:orderId/payment", protect, adminOnly, updatePaymentStatus);
router.patch("/admin/:orderId/delivery", protect, adminOnly, assignDeliveryPartner);
router.patch("/admin/:orderId/refund", protect, adminOnly, processRefundAdmin);
router.post("/admin/:orderId/refund/sync", protect, adminOnly, syncRazorpayRefundStatus);

export default router;
