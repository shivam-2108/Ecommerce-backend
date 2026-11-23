import express from "express";

import { addToWishlist,
    getMyWishlist ,
    removeFromWishlist,
    clearWishlist
} from "../controllers/wishlist.controller.js";
import { protect } from "../middleware/auth.middleware.js";

const router = express.Router();

router.post("/add", protect, addToWishlist);
router.get("/", protect, getMyWishlist);
router.delete("/remove/:productId", protect, removeFromWishlist);
router.delete("/clear", protect, clearWishlist);

export default router;