import express from "express";

import{
    getProducts,
    getProductById,
    createProduct,
    updateProduct ,
    deleteProduct 
} from "../controllers/product.controller.js"

const router = express.Router();

import { protect } from "../middleware/auth.middleware.js";
import { adminOnly } from "../middleware/admin.middleware.js";

router.get("/",getProducts);
router.get("/:id",getProductById);
router.post("/",createProduct);
router.put("/:id", protect, adminOnly, updateProduct);
router.delete("/:id", protect, adminOnly, deleteProduct);

export default router;  

