import express from "express";

import{
    registerUser,
    loginUser,
    getUserProfile,
    updateUserProfile,
    changePassword
}from "../controllers/user.controller.js";

const router =express.Router();
router.get("/", (req, res) => {
    res.status(200).json({
        message: "User route working successfully"
    });
});

import { protect } from "../middleware/auth.middleware.js";

router.post("/register",registerUser);
router.post("/login",loginUser);
router.get("/profile", protect, getUserProfile);
router.put("/profile", protect, updateUserProfile);
router.patch("/change-password", protect, changePassword);

export default router;