import User from "../models/user.model.js";
import Product from "../models/products.model.js";
import Order from "../models/order.model.js";
import Review from "../models/review.model.js";
import { updateProductRating } from "./review.controller.js";

export const getDashboardStats = async (req, res) => {
  try {
    const [
      totalUsers,
      totalProducts,
      totalOrders,
      pendingOrders,
      deliveredOrders,
      pendingRefunds,
      totalReviews,
      revenueData,
    ] = await Promise.all([
      User.countDocuments({ role: "user" }),
      Product.countDocuments(),
      Order.countDocuments(),
      Order.countDocuments({
        orderStatus: {
          $in: [
            "Pending",
            "Confirmed",
            "Order Placed",
            "Order Confirmed",
            "Processing",
            "Packed",
            "Shipped",
            "Out for Delivery",
          ],
        },
      }),
      Order.countDocuments({ orderStatus: "Delivered" }),
      Order.countDocuments({
        "refund.status": { $in: ["Requested", "Approved", "Processing"] },
      }),
      Review.countDocuments(),
      Order.aggregate([
        { $match: { paymentStatus: "Paid" } },
        {
          $group: {
            _id: null,
            totalRevenue: { $sum: "$finalAmount" },
          },
        },
      ]),
    ]);

    const totalRevenue = revenueData[0]?.totalRevenue || 0;

    return res.status(200).json({
      message: "Dashboard statistics fetched successfully",
      stats: {
        totalUsers,
        totalProducts,
        totalOrders,
        totalRevenue,
        pendingOrders,
        deliveredOrders,
        pendingRefunds,
        totalReviews,
      },
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to fetch dashboard statistics",
      error: error.message,
    });
  }
};

export const getAllReviewsAdmin = async (req, res) => {
  try {
    const reviews = await Review.find()
      .populate("user", "name email")
      .populate("product", "name image category")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      totalReviews: reviews.length,
      reviews,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to fetch reviews",
      error: error.message,
    });
  }
};

export const deleteReviewAdmin = async (req, res) => {
  try {
    const { reviewId } = req.params;
    const review = await Review.findByIdAndDelete(reviewId);

    if (!review) {
      return res.status(404).json({
        message: "Review not found",
      });
    }

    await updateProductRating(review.product);

    return res.status(200).json({
      message: "Review deleted by admin",
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to delete review",
      error: error.message,
    });
  }
};
