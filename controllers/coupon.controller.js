
import Coupon from "../models/coupon.model.js";

export const createCoupon = async (req, res) => {
    try {
        const {
            code,
            discountType,
            discountValue,
            minPurchase,
            maxDiscount,
            expiryDate,
            usageLimit
        } = req.body;

        if (
            !code ||
            !discountType ||
            discountValue === undefined ||
            !expiryDate
        ) {
            return res.status(400).json({
                message: "Please provide all required coupon details"
            });
        }

        if (!["percentage", "fixed"].includes(discountType)) {
            return res.status(400).json({
                message: "Invalid discount type"
            });
        }

        if (
            discountType === "percentage" &&
            (discountValue < 1 || discountValue > 100)
        ) {
            return res.status(400).json({
                message: "Percentage discount must be between 1 and 100"
            });
        }

        if (discountType === "fixed" && discountValue <= 0) {
            return res.status(400).json({
                message: "Fixed discount must be greater than 0"
            });
        }

        if (new Date(expiryDate) <= new Date()) {
            return res.status(400).json({
                message: "Expiry date must be in the future"
            });
        }

        const coupon = await Coupon.create({
            code: code.trim().toUpperCase(),
            discountType,
            discountValue,
            minPurchase,
            maxDiscount,
            expiryDate,
            usageLimit
        });

        res.status(201).json({
            message: "Coupon created successfully",
            coupon
        });

    } catch (error) {
        if (error.code === 11000) {
            return res.status(409).json({
                message: "Coupon code already exists"
            });
        }

        res.status(500).json({
            message: "Failed to create coupon",
            error: error.message
        });
    }
};


export const getAllCoupons = async (req, res) => {
    try {
        const coupons = await Coupon.find().sort({ createdAt: -1 });

        res.status(200).json({
            message: "Coupons fetched successfully",
            totalCoupons: coupons.length,
            coupons
        });

    } catch (error) {
        res.status(500).json({
            message: "Failed to fetch coupons",
            error: error.message
        });
    }
};


export const applyCoupon = async (req, res) => {
    try {
        const { code, totalAmount } = req.body;

        if (!code || totalAmount === undefined) {
            return res.status(400).json({
                message: "Please provide coupon code and total amount"
            });
        }

        if (!Number.isFinite(Number(totalAmount)) || Number(totalAmount) <= 0) {
            return res.status(400).json({
                message: "Please provide a valid total amount"
            });
        }

        const coupon = await Coupon.findOne({
            code: code.trim().toUpperCase()
        });

        if (!coupon) {
            return res.status(404).json({
                message: "Invalid coupon code"
            });
        }

        if (!coupon.isActive) {
            return res.status(400).json({
                message: "This coupon is inactive"
            });
        }

        if (new Date(coupon.expiryDate) <= new Date()) {
            return res.status(400).json({
                message: "This coupon has expired"
            });
        }

        if (coupon.usedCount >= coupon.usageLimit) {
            return res.status(400).json({
                message: "Coupon usage limit reached"
            });
        }

        const amount = Number(totalAmount);

        if (amount < coupon.minPurchase) {
            return res.status(400).json({
                message: `Minimum purchase amount is ${coupon.minPurchase}`
            });
        }

        let discount = 0;

        if (coupon.discountType === "percentage") {
            discount = (amount * coupon.discountValue) / 100;

            if (coupon.maxDiscount !== null) {
                discount = Math.min(discount, coupon.maxDiscount);
            }
        } else {
            discount = coupon.discountValue;
        }

        discount = Math.min(discount, amount);

        const finalAmount = amount - discount;

        res.status(200).json({
            message: "Coupon applied successfully",
            couponCode: coupon.code,
            originalAmount: amount,
            discount,
            finalAmount
        });

    } catch (error) {
        res.status(500).json({
            message: "Failed to apply coupon",
            error: error.message
        });
    }
};


export const deactivateCoupon = async (req, res) => {
    try {
        const { couponId } = req.params;

        const coupon = await Coupon.findById(couponId);

        if (!coupon) {
            return res.status(404).json({
                message: "Coupon not found"
            });
        }

        coupon.isActive = false;
        await coupon.save();

        res.status(200).json({
            message: "Coupon deactivated successfully",
            coupon
        });

    } catch (error) {
        res.status(500).json({
            message: "Failed to deactivate coupon",
            error: error.message
        });
    }
};


export const deleteCoupon = async (req, res) => {
    try {
        const { couponId } = req.params;

        const coupon = await Coupon.findByIdAndDelete(couponId);

        if (!coupon) {
            return res.status(404).json({
                message: "Coupon not found"
            });
        }

        res.status(200).json({
            message: "Coupon deleted successfully"
        });

    } catch (error) {
        res.status(500).json({
            message: "Failed to delete coupon",
            error: error.message
        });
    }
};

