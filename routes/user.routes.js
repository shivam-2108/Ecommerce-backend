import express from "express";
import {
  registerUser,
  loginUser,
  sendEmailOtp,
  verifyEmailOtp,
  forgotPassword,
  resetPassword,
  getUserProfile,
  updateUserProfile,
  changePassword,
} from "../controllers/user.controller.js";
import { protect } from "../middleware/auth.middleware.js";
import {
  otpSendRateLimiter,
  otpVerifyRateLimiter,
} from "../middleware/rateLimit.middleware.js";

const router = express.Router();

router.get("/", (req, res) => {
  res.status(200).json({
    message: "User route working successfully",
  });
});

router.post("/register", registerUser);
router.post("/login", loginUser);
router.post("/otp/send", otpSendRateLimiter, sendEmailOtp);
router.post("/otp/verify", otpVerifyRateLimiter, verifyEmailOtp);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);
router.get("/profile", protect, getUserProfile);
router.put("/profile", protect, updateUserProfile);
router.patch("/change-password", protect, changePassword);

export default router;
