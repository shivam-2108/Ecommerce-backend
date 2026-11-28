import express from "express";
import {
  addReview,
  getProductReviews,
  updateReview,
  deleteReview,
  toggleHelpfulReview,
} from "../controllers/review.controller.js";
import { protect, optionalProtect } from "../middleware/auth.middleware.js";

const router = express.Router();

router.post("/:productId", protect, addReview);
router.post("/:reviewId/helpful", protect, toggleHelpfulReview);
router.delete("/:reviewId", protect, deleteReview);
router.get("/:productId", optionalProtect, getProductReviews);
router.put("/update/:reviewId", protect, updateReview);

export default router;
