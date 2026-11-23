import express from "express";
import { addReview } from "../controllers/review.controller.js";
import { protect } from "../middleware/auth.middleware.js";


import {
    getProductReviews,
    updateReview,
    deleteReview
} from "../controllers/review.controller.js";

const router = express.Router();

router.post("/:productId", protect, addReview);
router.delete("/:reviewId", protect, deleteReview);
router.get("/:productId", getProductReviews);
router.put("/update/:reviewId", protect, updateReview);

export default router;