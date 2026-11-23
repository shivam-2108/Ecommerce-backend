
import User from "../models/user.model.js";
import Product from "../models/products.model.js";
import Order from "../models/order.model.js";

export const getDashboardStats = async (req, res) => {
    try {
        const [
            totalUsers,
            totalProducts,
            totalOrders,
            pendingOrders,
            deliveredOrders,
            revenueData
        ] = await Promise.all([
            User.countDocuments({ role: "user" }),
            Product.countDocuments(),
            Order.countDocuments(),
            Order.countDocuments({ orderStatus: "Pending" }),
            Order.countDocuments({ orderStatus: "Delivered" }),
            Order.aggregate([
                { $match: { paymentStatus: "Paid" } },
                {
                    $group: {
                        _id: null,
                        totalRevenue: { $sum: "$finalAmount" }
                    }
                }
            ])
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
                deliveredOrders
            }
        });

    } catch (error) {
        return res.status(500).json({
            message: "Failed to fetch dashboard statistics",
            error: error.message
        });
    }
};
