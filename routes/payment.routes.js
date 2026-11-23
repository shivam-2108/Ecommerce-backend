
import express from "express";

import {
    createPaymentOrder,
    verifyPayment
} from "../controllers/payment.controller.js";

import { razorpayWebhook } from "../controllers/webhook.controller.js";
import { protect } from "../middleware/auth.middleware.js";

const router = express.Router();

router.post("/create-order", protect, createPaymentOrder);
router.post("/verify", protect, verifyPayment);

// Razorpay webhook (no protect middleware)
router.post("/webhook", razorpayWebhook);

export default router;
