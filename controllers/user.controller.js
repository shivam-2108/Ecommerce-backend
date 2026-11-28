import crypto from "crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/user.model.js";
import Otp from "../models/otp.model.js";
import sendEmail from "../utils/sendEmail.js";
import { normalizePhoneNumber } from "../utils/sendSms.js";

const OTP_EXPIRY_SECONDS = 300; // 5 minutes
const OTP_RESEND_COOLDOWN_SECONDS = 60;
const OTP_MAX_ATTEMPTS = 5;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(rawEmail) {
  if (typeof rawEmail !== "string") return "";
  const trimmed = rawEmail.trim().toLowerCase();
  return EMAIL_REGEX.test(trimmed) ? trimmed : "";
}

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function signAuthToken(user) {
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is not configured");
  }
  return jwt.sign(
    {
      id: user._id,
      role: user.role,
    },
    process.env.JWT_SECRET,
    { expiresIn: "1d" }
  );
}

function formatUserResponse(user) {
  return {
    id: user._id,
    _id: user._id,
    name: user.name,
    email: user.email,
    phone: user.phone || "",
    role: user.role,
  };
}

export const registerUser = async (req, res) => {
  try {
    const { name, email, phone, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        message: "Please provide name, email and password",
      });
    }

    if (typeof password !== "string" || password.length < 8) {
      return res.status(400).json({
        message: "Password must be at least 8 characters",
      });
    }

    let normalizedPhone;
    if (phone && String(phone).trim()) {
      normalizedPhone = normalizePhoneNumber(String(phone));
      if (!normalizedPhone) {
        return res.status(400).json({
          message: "Please provide a valid 10-digit mobile number",
        });
      }
    }

    const existingEmail = await User.findOne({
      email: email.trim().toLowerCase(),
    });
    if (existingEmail) {
      return res.status(409).json({
        message: "Email already registered",
      });
    }

    if (normalizedPhone) {
      const existingPhone = await User.findOne({ phone: normalizedPhone });
      if (existingPhone) {
        return res.status(409).json({
          message: "Phone number already registered",
        });
      }
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const userData = {
      name: name.trim(),
      email: email.trim().toLowerCase(),
      password: hashedPassword,
    };
    if (normalizedPhone) {
      userData.phone = normalizedPhone;
    }

    const user = await User.create(userData);

    try {
      await sendEmail({
        email: user.email,
        subject: "Welcome to ShopEase!",
        message: `
          <h2>Welcome, ${user.name}!</h2>
          <p>Your account has been created successfully.</p>
          <p>Thank you for registering with us.</p>
        `,
      });
    } catch (emailError) {
      console.error("Registration email failed:", emailError.message);
    }

    return res.status(201).json({
      message: "User registered successfully",
      user: formatUserResponse(user),
    });
  } catch (error) {
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern || {})[0];
      return res.status(409).json({
        message:
          field === "phone"
            ? "Phone number already registered"
            : "Email already registered",
      });
    }

    return res.status(500).json({
      message: "Registration failed",
    });
  }
};

export const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        message: "Please provide email and password",
      });
    }

    if (typeof password !== "string") {
      return res.status(400).json({
        message: "Password must be a string",
      });
    }

    const user = await User.findOne({
      email: email.trim().toLowerCase(),
    }).select("+password");

    if (!user) {
      return res.status(401).json({
        message: "Invalid email or password",
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(401).json({
        message: "Invalid email or password",
      });
    }

    const token = signAuthToken(user);

    return res.status(200).json({
      message: "Login successful",
      token,
      user: formatUserResponse(user),
    });
  } catch (error) {
    console.error("Login error:", error.message);
    return res.status(500).json({
      message: "Login failed",
    });
  }
};

export function createEmailOtpHandlers({
  UserModel = User,
  OtpModel = Otp,
  sendEmailFn = sendEmail,
  signTokenFn = signAuthToken,
  nowFn = () => new Date(),
} = {}) {
  // SEND EMAIL OTP FOR REGISTERED USERS
  const sendEmailOtp = async (req, res) => {
    try {
      const normalizedEmail = normalizeEmail(req.body?.email);

      if (!normalizedEmail) {
        return res.status(400).json({
          message: "Please provide a valid email address",
        });
      }

      const user = await UserModel.findOne({ email: normalizedEmail });
      if (!user) {
        return res.status(404).json({
          message:
            "This email address is not registered. Please create an account first.",
        });
      }

      const existingOtp = await OtpModel.findOne({
        email: normalizedEmail,
        purpose: "login",
      }).sort({ createdAt: -1 });

      const now = nowFn();
      if (existingOtp && !existingOtp.used && existingOtp.resendAllowedAt > now) {
        const retryAfterSeconds = Math.ceil(
          (existingOtp.resendAllowedAt.getTime() - now.getTime()) / 1000
        );
        return res.status(429).json({
          message: `Please wait ${retryAfterSeconds}s before requesting a new OTP.`,
          retryAfterSeconds,
        });
      }

      const otp = String(crypto.randomInt(100000, 1000000));
      const otpHash = await bcrypt.hash(otp, 10);

      await sendEmailFn({
        email: user.email,
        subject: "Your ShopEase Login OTP",
        message: `
          <h2>ShopEase Login Verification</h2>
          <p>Hello ${escapeHtml(user.name)},</p>
          <p>Use the one-time password (OTP) below to sign in to your ShopEase account:</p>
          <p style="font-size: 26px; font-weight: bold; letter-spacing: 6px; margin: 16px 0;">${otp}</p>
          <p>This OTP is valid for <strong>5 minutes</strong> and can only be used once.</p>
          <p>If you did not request this login code, please ignore this email.</p>
        `,
      });

      await OtpModel.deleteMany({ email: normalizedEmail, purpose: "login" });

      await OtpModel.create({
        email: normalizedEmail,
        otpHash,
        purpose: "login",
        attempts: 0,
        maxAttempts: OTP_MAX_ATTEMPTS,
        used: false,
        resendAllowedAt: new Date(
          now.getTime() + OTP_RESEND_COOLDOWN_SECONDS * 1000
        ),
        expiresAt: new Date(now.getTime() + OTP_EXPIRY_SECONDS * 1000),
      });

      return res.status(200).json({
        message: "OTP sent to your registered email address",
        expiresInSeconds: OTP_EXPIRY_SECONDS,
        resendCooldownSeconds: OTP_RESEND_COOLDOWN_SECONDS,
      });
    } catch (error) {
      if (error.code === "EMAIL_NOT_CONFIGURED") {
        return res.status(503).json({
          message: "Email OTP service is not configured.",
        });
      }
      console.error("Send email OTP failed");
      return res.status(500).json({
        message: "Failed to send OTP email. Please try again later.",
      });
    }
  };

  // VERIFY EMAIL OTP AND ISSUE JWT
  const verifyEmailOtp = async (req, res) => {
    try {
      const normalizedEmail = normalizeEmail(req.body?.email);
      const rawOtp = req.body?.otp;
      const submittedOtp =
        typeof rawOtp === "string" || typeof rawOtp === "number"
          ? String(rawOtp).trim()
          : "";

      if (!normalizedEmail || !/^\d{6}$/.test(submittedOtp)) {
        return res.status(400).json({
          message: "Please provide a valid email address and 6-digit OTP",
        });
      }

      const user = await UserModel.findOne({ email: normalizedEmail });
      if (!user) {
        return res.status(404).json({
          message: "Email address is not registered. Please register first.",
        });
      }

      const otpDoc = await OtpModel.findOne({
        email: normalizedEmail,
        purpose: "login",
        used: { $ne: true },
      }).sort({ createdAt: -1 });

      if (!otpDoc) {
        return res.status(400).json({
          message: "No active OTP found. Please request a new OTP.",
        });
      }

      const now = nowFn();
      if (otpDoc.expiresAt <= now) {
        await OtpModel.deleteOne({ _id: otpDoc._id });
        return res.status(400).json({
          message: "OTP has expired. Please request a new OTP.",
        });
      }

      if (otpDoc.attempts >= otpDoc.maxAttempts) {
        await OtpModel.deleteOne({ _id: otpDoc._id });
        return res.status(429).json({
          message:
            "Maximum incorrect OTP attempts exceeded. Please request a new OTP.",
        });
      }

      const isValid = await bcrypt.compare(submittedOtp, otpDoc.otpHash);

      if (!isValid) {
        const updated = await OtpModel.findByIdAndUpdate(
          otpDoc._id,
          { $inc: { attempts: 1 } },
          { new: true }
        );
        const attemptsCount = updated ? updated.attempts : otpDoc.attempts + 1;
        const remaining = Math.max(0, otpDoc.maxAttempts - attemptsCount);

        if (remaining === 0) {
          await OtpModel.deleteOne({ _id: otpDoc._id });
          return res.status(429).json({
            message:
              "Maximum incorrect OTP attempts exceeded. Please request a new OTP.",
          });
        }

        return res.status(401).json({
          message: `Invalid OTP. ${remaining} attempt(s) remaining.`,
        });
      }

      // Atomically mark OTP as used to prevent concurrent or sequential reuse
      const consumed = await OtpModel.findOneAndUpdate(
        {
          _id: otpDoc._id,
          used: { $ne: true },
          expiresAt: { $gt: now },
        },
        { $set: { used: true } },
        { new: true }
      );

      if (!consumed) {
        return res.status(400).json({
          message:
            "OTP has already been used or expired. Please request a new OTP.",
        });
      }

      await OtpModel.deleteMany({ email: normalizedEmail, purpose: "login" });

      const token = signTokenFn(user);

      return res.status(200).json({
        message: "Login successful",
        token,
        user: formatUserResponse(user),
      });
    } catch (error) {
      console.error("Verify email OTP failed");
      return res.status(500).json({
        message: "OTP verification failed",
      });
    }
  };

  return { sendEmailOtp, verifyEmailOtp };
}

const defaultOtpHandlers = createEmailOtpHandlers();
export const sendEmailOtp = defaultOtpHandlers.sendEmailOtp;
export const verifyEmailOtp = defaultOtpHandlers.verifyEmailOtp;

// FORGOT PASSWORD (EMAIL 6-DIGIT VERIFICATION CODE)
export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || !String(email).trim()) {
      return res.status(400).json({
        message: "Please provide your registered email address",
      });
    }

    const user = await User.findOne({
      email: String(email).trim().toLowerCase(),
    });

    if (!user) {
      return res.status(404).json({
        message: "No account found with that email address",
      });
    }

    const resetCode = String(crypto.randomInt(100000, 1000000));
    const tokenHash = crypto
      .createHash("sha256")
      .update(resetCode)
      .digest("hex");

    user.resetPasswordToken = tokenHash;
    user.resetPasswordExpires = new Date(Date.now() + 15 * 60 * 1000);
    await user.save();

    await sendEmail({
      email: user.email,
      subject: "ShopEase Password Reset Code",
      message: `
        <h2>Password Reset Request</h2>
        <p>Hello ${user.name},</p>
        <p>Use the verification code below to reset your ShopEase password:</p>
        <p style="font-size: 24px; font-weight: bold; letter-spacing: 4px;">${resetCode}</p>
        <p>This code expires in 15 minutes. If you did not request a reset, please ignore this email.</p>
      `,
    });

    return res.status(200).json({
      message: "Password reset code sent to your email address",
    });
  } catch (error) {
    console.error("Forgot password error:", error.message);
    return res.status(500).json({
      message: "Failed to send password reset email",
    });
  }
};

export const resetPassword = async (req, res) => {
  try {
    const { email, code, newPassword } = req.body;

    if (!email || !code || !newPassword) {
      return res.status(400).json({
        message: "Email, reset code, and new password are required",
      });
    }

    if (typeof newPassword !== "string" || newPassword.length < 8) {
      return res.status(400).json({
        message: "New password must be at least 8 characters",
      });
    }

    const tokenHash = crypto
      .createHash("sha256")
      .update(String(code).trim())
      .digest("hex");

    const user = await User.findOne({
      email: String(email).trim().toLowerCase(),
      resetPasswordToken: tokenHash,
      resetPasswordExpires: { $gt: new Date() },
    }).select("+resetPasswordToken +resetPasswordExpires");

    if (!user) {
      return res.status(400).json({
        message: "Invalid or expired password reset code",
      });
    }

    user.password = await bcrypt.hash(newPassword, 10);
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    return res.status(200).json({
      message: "Password reset successfully. You can now sign in.",
    });
  } catch (error) {
    console.error("Reset password error:", error.message);
    return res.status(500).json({
      message: "Failed to reset password",
    });
  }
};

// GET USER PROFILE
export const getUserProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select("-password");

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    return res.status(200).json({
      message: "User profile fetched successfully",
      user: formatUserResponse(user),
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to fetch user profile",
      error: error.message,
    });
  }
};

// UPDATE USER PROFILE
export const updateUserProfile = async (req, res) => {
  try {
    const { name, email, phone } = req.body;

    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    if (name && name.trim()) user.name = name.trim();
    if (email && email.trim()) user.email = email.trim().toLowerCase();

    if (phone !== undefined) {
      if (String(phone).trim() === "") {
        user.phone = undefined;
      } else {
        const normalizedPhone = normalizePhoneNumber(String(phone));
        if (!normalizedPhone) {
          return res.status(400).json({
            message: "Invalid phone number format",
          });
        }
        user.phone = normalizedPhone;
      }
    }

    await user.save();

    return res.status(200).json({
      message: "Profile updated successfully",
      user: formatUserResponse(user),
    });
  } catch (error) {
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern || {})[0];
      return res.status(409).json({
        message:
          field === "phone"
            ? "Phone number already registered"
            : "Email already registered",
      });
    }

    return res.status(500).json({
      message: "Failed to update profile",
      error: error.message,
    });
  }
};

// CHANGE PASSWORD
export const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        message: "Please provide current and new password",
      });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({
        message: "New password must be at least 8 characters",
      });
    }

    const user = await User.findById(req.user._id).select("+password");

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    const isMatch = await bcrypt.compare(currentPassword, user.password);

    if (!isMatch) {
      return res.status(400).json({
        message: "Current password is incorrect",
      });
    }

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();

    return res.status(200).json({
      message: "Password changed successfully",
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to change password",
      error: error.message,
    });
  }
};
