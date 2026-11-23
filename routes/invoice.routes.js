import express from "express";
import { generateInvoice } from "../controllers/invoice.controller.js";
import { protect } from "../middleware/auth.middleware.js";

const router = express.Router();

router.get("/:orderId", protect, generateInvoice);

export default router;