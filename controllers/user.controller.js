import User from "../models/user.model.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import sendEmail from "../utils/sendEmail.js";



export const registerUser = async (req, res) => {
    try {
        const { name, email, password } = req.body;

        // Check required fields
        if (!name || !email || !password) {
            return res.status(400).json({
                message: "Please provide name, email and password",
            });
        }

        // Validate password type
        if (typeof password !== "string") {
            return res.status(400).json({
                message: "Password must be a string",
            });
        }

        // Validate password length
        if (password.length < 8) {
            return res.status(400).json({
                message: "Password must be at least 8 characters",
            });
        }

        // Check existing user
        const existingUser = await User.findOne({ email });

        if (existingUser) {
            return res.status(409).json({
                message: "Email already registered",
            });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create user
        const user = await User.create({
            name,
            email,
            password: hashedPassword,
        });

        // Send registration confirmation email
        try {
            await sendEmail({
                email: user.email,
                subject: "Welcome to Our E-commerce Store!",
                message: `
                    <h2>Welcome, ${user.name}!</h2>
                    <p>Your account has been created successfully.</p>
                    <p>Thank you for registering with us.</p>
                `,
            });
        } catch (emailError) {
            console.error(
                "Registration email failed:",
                emailError.message
            );
        }

        return res.status(201).json({
            message: "User registered successfully",
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
            },
        });

    } catch (error) {
        if (error.code === 11000) {
            return res.status(409).json({
                message: "Email already registered",
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

        // Check required fields
        if (!email || !password) {
            return res.status(400).json({
                message: "Please provide email and password",
            });
        }

        // Validate password type
        if (typeof password !== "string") {
            return res.status(400).json({
                message: "Password must be a string",
            });
        }

        // Find user and retrieve password
        const user = await User.findOne({ email }).select("+password");

        if (!user) {
            return res.status(401).json({
                message: "Invalid email or password",
            });
        }

        // Compare password
        const isMatch = await bcrypt.compare(
            password,
            user.password
        );

        if (!isMatch) {
            return res.status(401).json({
                message: "Invalid email or password",
            });
        }

        // Check JWT secret
        if (!process.env.JWT_SECRET) {
            throw new Error("JWT_SECRET is not configured");
        }

        // Generate JWT token
        const token = jwt.sign(
            {
                id: user._id,
                role: user.role,
            },
            process.env.JWT_SECRET,
            {
                expiresIn: "1d",
            }
        );

        return res.status(200).json({
            message: "Login successful",
            token,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
            },
        });

    } catch (error) {
        console.error("Login error:", error.message);

        return res.status(500).json({
            message: "Login failed",
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

        res.status(200).json({
            message: "User profile fetched successfully",
            user,
        });

    } catch (error) {
        res.status(500).json({
            message: "Failed to fetch user profile",
            error: error.message,
        });
    }
};

// UPDATE USER PROFILE
export const updateUserProfile = async (req, res) => {
    try {
        const { name, email } = req.body;

        const user = await User.findById(req.user._id);

        if (!user) {
            return res.status(404).json({
                message: "User not found"
            });
        }

        if (name) user.name = name;
        if (email) user.email = email;

        await user.save();

        res.status(200).json({
            message: "Profile updated successfully",
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role
            }
        });

    } catch (error) {
        if (error.code === 11000) {
            return res.status(409).json({
                message: "Email already registered"
            });
        }

        res.status(500).json({
            message: "Failed to update profile",
            error: error.message
        });
    }
};


// CHANGE PASSWORD
export const changePassword = async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;

        // Check required fields
        if (!currentPassword || !newPassword) {
            return res.status(400).json({
                message: "Please provide current and new password"
            });
        }

        // Check new password length
        if (newPassword.length < 6) {
            return res.status(400).json({
                message: "New password must be at least 6 characters"
            });
        }

        // Find logged-in user with password
        const user = await User.findById(req.user._id).select("+password");

        if (!user) {
            return res.status(404).json({
                message: "User not found"
            });
        }

        // Verify current password
        const isMatch = await bcrypt.compare(
            currentPassword,
            user.password
        );

        if (!isMatch) {
            return res.status(400).json({
                message: "Current password is incorrect"
            });
        }

        // Hash new password
        user.password = await bcrypt.hash(newPassword, 10);

        await user.save();

        return res.status(200).json({
            message: "Password changed successfully"
        });

    } catch (error) {
        return res.status(500).json({
            message: "Failed to change password",
            error: error.message
        });
    }
};
