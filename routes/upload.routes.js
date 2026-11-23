
import express from "express";
import { uploadProductImage } from "../controllers/upload.controller.js";
import upload from "../middleware/upload.middleware.js";
import { protect, adminOnly } from "../middleware/auth.middleware.js";

const router = express.Router();

router.post(
    "/product/:productId",
    protect,
    adminOnly,
    upload.single("image"),
    uploadProductImage
);

export default router;
