import Order from "../models/order.model.js";
import Cart from "../models/cart.model.js";
import Product from "../models/products.model.js";
import Coupon from "../models/coupon.model.js";
import sendEmail from "../utils/sendEmail.js";

export const createOrder = async (req, res) => {
    try {
        const { shippingAddress, paymentMethod, couponCode } = req.body;

        const requiredFields = [
            "fullName",
            "phone",
            "address",
            "city",
            "state",
            "postalCode",
            "country",
        ];

        if (
            !shippingAddress ||
            requiredFields.some(
                (field) => !shippingAddress[field]?.trim()
            )
        ) {
            return res.status(400).json({
                message: "Please provide a complete shipping address",
            });
        }

        if (
            paymentMethod &&
            !["COD", "Online"].includes(paymentMethod)
        ) {
            return res.status(400).json({
                message: "Invalid payment method",
            });
        }

        const cart = await Cart.findOne({
            user: req.user._id,
        });

        if (!cart || cart.items.length === 0) {
            return res.status(400).json({
                message: "Your cart is empty",
            });
        }

        const orderItems = [];
        let totalAmount = 0;

        // Verify products and calculate price
        for (const item of cart.items) {
            const product = await Product.findById(item.product);

            if (!product) {
                return res.status(400).json({
                    message: `Product ${item.product} no longer exists`,
                });
            }

            if (product.stock < item.quantity) {
                return res.status(400).json({
                    message: `Insufficient stock for ${product.name}`,
                });
            }

            orderItems.push({
                product: product._id,
                quantity: item.quantity,
                price: product.price,
            });

            totalAmount += product.price * item.quantity;
        }


        // Coupon validation and discount calculation
        let discountAmount = 0;
        let finalAmount = totalAmount;
        let appliedCoupon = null;

        if (couponCode && couponCode.trim()) {
            const coupon = await Coupon.findOne({
                code: couponCode.trim().toUpperCase()
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

            if (totalAmount < coupon.minPurchase) {
                return res.status(400).json({
                    message: `Minimum purchase amount is ${coupon.minPurchase}`
                });
            }

            if (coupon.discountType === "percentage") {
                discountAmount =
                    (totalAmount * coupon.discountValue) / 100;

                if (coupon.maxDiscount !== null) {
                    discountAmount = Math.min(
                        discountAmount,
                        coupon.maxDiscount
                    );
                }
            } else {
                discountAmount = coupon.discountValue;
            }

            discountAmount = Math.min(discountAmount, totalAmount);

            finalAmount = totalAmount - discountAmount;
            appliedCoupon = coupon;
        }


        // Create the order
        const order = await Order.create({
            user: req.user._id,
            items: orderItems,
            totalAmount,
            couponCode: appliedCoupon ? appliedCoupon.code : null,
            discountAmount,
            finalAmount,
            shippingAddress,
            paymentMethod: paymentMethod || "COD",
        });
        // Reduce product stock after creating the order
        const updatedItems = [];

        for (const item of cart.items) {
            const updatedProduct = await Product.findOneAndUpdate(
                {
                    _id: item.product,
                    stock: { $gte: item.quantity },
                },
                {
                    $inc: { stock: -item.quantity },
                },
                { new: true }
            );

            if (!updatedProduct) {

                // Restore previously reduced stock
                for (const updatedItem of updatedItems) {
                    await Product.findByIdAndUpdate(
                        updatedItem.product,
                        {
                            $inc: { stock: updatedItem.quantity },
                        }
                    );
                }

                // Delete the order
                await Order.findByIdAndDelete(order._id);

                return res.status(409).json({
                    message: "Stock changed. Please try placing your order again.",
                });
            }

            updatedItems.push({
                product: item.product,
                quantity: item.quantity,
            });
        }


        // Increment coupon usage after successful order
        if (appliedCoupon) {
            const updatedCoupon = await Coupon.findOneAndUpdate(
                {
                    _id: appliedCoupon._id,
                    isActive: true,
                    expiryDate: { $gt: new Date() },
                    usedCount: { $lt: appliedCoupon.usageLimit }
                },
                {
                    $inc: { usedCount: 1 }
                },
                { new: true }
            );

            if (!updatedCoupon) {
                // Restore reduced product stock
                for (const updatedItem of updatedItems) {
                    await Product.findByIdAndUpdate(
                        updatedItem.product,
                        {
                            $inc: { stock: updatedItem.quantity }
                        }
                    );
                }

                // Delete the order
                await Order.findByIdAndDelete(order._id);

                return res.status(409).json({
                    message: "Coupon usage limit reached. Please try again."
                });
            }
        }


        // Clear the cart after successful order
        cart.items = [];
        await cart.save();

        // Send order confirmation email
        try {
            await sendEmail({
                email: req.user.email,
                subject: "Your Order Has Been Placed Successfully!",
                message: `
            <h2>Thank you for your order, ${shippingAddress.fullName}!</h2>
            <p>Your order has been placed successfully.</p>
            <h3>Order Details</h3>
            <p>Order ID: ${order._id}</p>
            <p>Total Amount: ₹${order.finalAmount}</p>
            <p>Payment Method: ${order.paymentMethod}</p>
            <p>Payment Status: ${order.paymentStatus}</p>
            <p>Thank you for shopping with us!</p>
        `,
            });
        } catch (emailError) {
            console.error("Order confirmation email failed:", emailError.message);
        }

        return res.status(201).json({
            message: "Order placed successfully",
            order,
        });

    } catch (error) {
        console.error("Create order error:", error);

        return res.status(500).json({
            message: "Failed to place order",
            error: error.message,
        });
    }
};


// 2. Get all orders of the logged-in user
export const getMyOrders = async (req, res) => {
    try {
        const orders = await Order.find({
            user: req.user._id,
        })
            .populate("items.product")
            .sort({ createdAt: -1 });

        return res.status(200).json({
            count: orders.length,
            orders,
        });

    } catch (error) {
        return res.status(500).json({
            message: "Failed to fetch orders",
            error: error.message,
        });
    }
};

// 3. Get one order by ID
export const getOrderById = async (req, res) => {
    try {
        const order = await Order.findOne({
            _id: req.params.orderId,
            user: req.user._id,
        }).populate("items.product");


        if (!order) {
            return res.status(404).json({
                message: "Order not found",
            });
        }
        return res.status(200).json({ order });
    } catch (error) {
        if (error.name === "CastError") {
            return res.status(400).json({
                message: "Invalid order ID",
            });
        }
        return res.status(500).json({
            message: "Failed to fetch order",
            error: error.message,
        });
    }
};

// 4. Cancel an order

export const cancelOrder = async (req, res) => {
    try {
        const { orderId } = req.params;

        const order = await Order.findById(orderId);

        if (!order) {
            return res.status(404).json({
                message: "Order not found",
            });
        }

        // Check whether the order belongs to the logged-in user
        if (order.user.toString() !== req.user._id.toString()) {
            return res.status(403).json({
                message: "You are not authorized to cancel this order",
            });
        }

        // Prevent cancelling an already cancelled order
        if (order.orderStatus === "Cancelled") {
            return res.status(400).json({
                message: "Order is already cancelled",
            });
        }

        // Prevent cancelling a delivered order
        if (order.orderStatus === "Delivered") {
            return res.status(400).json({
                message: "Delivered order cannot be cancelled",
            });
        }

        // Restore product stock
        for (const item of order.items) {
            await Product.findByIdAndUpdate(
                item.product,
                {
                    $inc: { stock: item.quantity },
                }
            );
        }

        // Update order status
        order.orderStatus = "Cancelled";
        await order.save();

        return res.status(200).json({
            message: "Order cancelled and stock restored successfully",
            order,
        });

    } catch (error) {
        return res.status(500).json({
            message: "Failed to cancel order",
            error: error.message,
        });
    }
};



export const getAllOrders = async (req, res) => {
    try {
        const { status } = req.query;

        // Pagination values
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(
            100,
            Math.max(1, parseInt(req.query.limit) || 5)
        );

        const skip = (page - 1) * limit;

        // Allowed order statuses
        const allowedStatuses = [
            "Pending",
            "Confirmed",
            "Shipped",
            "Delivered",
            "Cancelled",
        ];

        // Validate status
        if (status && !allowedStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                message: "Invalid order status",
            });
        }

        // Apply filter
        const filter = status ? { orderStatus: status } : {};

        // Get total matching orders
        const totalOrders = await Order.countDocuments(filter);

        // Fetch orders with pagination
        const orders = await Order.find(filter)
            .populate("user", "name email")
            .populate("items.product", "name price")
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        return res.status(200).json({
            success: true,
            totalOrders,
            currentPage: page,
            totalPages: Math.ceil(totalOrders / limit),
            ordersPerPage: limit,
            orders,
        });

    } catch (error) {
        return res.status(500).json({
            success: false,
            message: "Failed to fetch orders",
            error: error.message,
        });
    }
};

export const updateOrderStatus = async (req, res) => {
    try {
        const { orderStatus } = req.body;

        const allowedStatus = [
            "Pending",
            "Confirmed",
            "Shipped",
            "Delivered",
            "Cancelled",
        ];

        if (!allowedStatus.includes(orderStatus)) {
            return res.status(400).json({
                message: "Invalid order status",
            });
        }

        const order = await Order.findById(req.params.orderId);


        if (!order) {
            return res.status(404).json({
                message: "Order not found",
            });
        }
        if (order.orderStatus === "Cancelled") {
            return res.status(400).json({
                message: "Cancelled order cannot be updated",
            });
        }
        order.orderStatus = orderStatus;

        await order.save();
        return res.status(200).json({
            success: true,
            message: "Order status updated successfully",
            order,
        });
    } catch (error) {
        return res.status(500).json({
            message: "Failed to update order status",
            error: error.message,
        });
    }
}

export const updatePaymentStatus = async (req, res) => {
    try {
        const { paymentStatus } = req.body;

        const allowedPaymentStatuses = [
            "Pending",
            "Paid",
            "Failed",
            "Refunded",
        ];

        if (!allowedPaymentStatuses.includes(paymentStatus)) {
            return res.status(400).json({
                success: false,
                message: "Invalid payment status",
            });
        }

        const order = await Order.findById(req.params.orderId);

        if (!order) {
            return res.status(404).json({
                success: false,
                message: "Order not found",
            });
        }

        order.paymentStatus = paymentStatus;

        await order.save();

        return res.status(200).json({
            success: true,
            message: "Payment status updated successfully",
            order,
        });

    } catch (error) {
        return res.status(500).json({
            success: false,
            message: "Failed to update payment status",
            error: error.message,
        });
    }
};
