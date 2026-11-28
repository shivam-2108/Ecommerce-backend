import Order, { ORDER_STATUSES, DELIVERY_STATUSES } from "../models/order.model.js";
import Cart from "../models/cart.model.js";
import Product from "../models/products.model.js";
import Coupon from "../models/coupon.model.js";
import DeliveryPartner from "../models/deliveryPartner.model.js";
import razorpay from "../config/razorpay.js";
import sendEmail from "../utils/sendEmail.js";
import { calculateDeliveryCharge } from "../utils/pricing.js";

const CANCELLABLE_STATUSES = [
  "Pending",
  "Confirmed",
  "Order Placed",
  "Order Confirmed",
  "Processing",
  "Packed",
  "Payment Failed",
];

function appendStatusHistory(order, status, note, userId = null) {
  if (!Array.isArray(order.statusHistory)) {
    order.statusHistory = [];
  }
  order.statusHistory.push({
    status,
    timestamp: new Date(),
    note: note || "",
    updatedBy: userId || null,
  });
}

export const createOrder = async (req, res) => {
  try {
    const { shippingAddress, paymentMethod, couponCode, idempotencyKey } =
      req.body;

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
      requiredFields.some((field) => !shippingAddress[field]?.trim())
    ) {
      return res.status(400).json({
        message: "Please provide a complete shipping address",
      });
    }

    if (paymentMethod && !["COD", "Online"].includes(paymentMethod)) {
      return res.status(400).json({
        message: "Invalid payment method",
      });
    }

    // Prevent duplicate order creation on double-click / network retry
    if (idempotencyKey && String(idempotencyKey).trim()) {
      const existingOrder = await Order.findOne({
        user: req.user._id,
        idempotencyKey: String(idempotencyKey).trim(),
      });
      if (existingOrder) {
        return res.status(200).json({
          message: "Order already created",
          order: existingOrder,
          duplicate: true,
        });
      }
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
    let productDiscountSavings = 0;
    let maxDeliveryDays = 4;

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

      const sellingPrice = Number(product.discountedPrice ?? product.price);
      const mrp = Number(product.originalPrice ?? sellingPrice);
      const itemSavings = Math.max(0, mrp - sellingPrice) * item.quantity;

      orderItems.push({
        product: product._id,
        quantity: item.quantity,
        price: sellingPrice,
        originalPrice: mrp,
        discountPercentage: product.discountPercentage || 0,
      });

      totalAmount += sellingPrice * item.quantity;
      productDiscountSavings += itemSavings;
      if (product.estimatedDeliveryDays) {
        maxDeliveryDays = Math.max(maxDeliveryDays, product.estimatedDeliveryDays);
      }
    }

    // Delivery fee calculated securely on backend: FREE >= Rs. 200, Rs. 30 below Rs. 200
    const deliveryCharge = calculateDeliveryCharge(totalAmount);

    // Coupon validation and discount calculation on discounted items subtotal
    let discountAmount = 0;
    let appliedCoupon = null;

    if (couponCode && couponCode.trim()) {
      const coupon = await Coupon.findOne({
        code: couponCode.trim().toUpperCase(),
      });

      if (!coupon) {
        return res.status(404).json({
          message: "Invalid coupon code",
        });
      }

      if (!coupon.isActive) {
        return res.status(400).json({
          message: "This coupon is inactive",
        });
      }

      if (new Date(coupon.expiryDate) <= new Date()) {
        return res.status(400).json({
          message: "This coupon has expired",
        });
      }

      if (coupon.usedCount >= coupon.usageLimit) {
        return res.status(400).json({
          message: "Coupon usage limit reached",
        });
      }

      if (totalAmount < coupon.minPurchase) {
        return res.status(400).json({
          message: `Minimum purchase amount is ₹${coupon.minPurchase}`,
        });
      }

      if (coupon.discountType === "percentage") {
        discountAmount = (totalAmount * coupon.discountValue) / 100;
        if (coupon.maxDiscount !== null) {
          discountAmount = Math.min(discountAmount, coupon.maxDiscount);
        }
      } else {
        discountAmount = coupon.discountValue;
      }

      discountAmount = Math.min(Math.round(discountAmount), totalAmount);
      appliedCoupon = coupon;
    }

    const finalAmount = Math.max(0, totalAmount - discountAmount) + deliveryCharge;
    const method = paymentMethod || "COD";
    const initialStatus = "Order Placed";
    const estimatedDeliveryDate = new Date(
      Date.now() + maxDeliveryDays * 24 * 60 * 60 * 1000
    );

    const order = await Order.create({
      user: req.user._id,
      items: orderItems,
      totalAmount,
      productDiscountSavings,
      deliveryCharge,
      couponCode: appliedCoupon ? appliedCoupon.code : null,
      discountAmount,
      finalAmount,
      shippingAddress,
      paymentMethod: method,
      orderStatus: initialStatus,
      estimatedDeliveryDate,
      idempotencyKey: idempotencyKey ? String(idempotencyKey).trim() : null,
      statusHistory: [
        {
          status: initialStatus,
          timestamp: new Date(),
          note:
            method === "COD"
              ? "Order placed with Cash on Delivery"
              : "Order placed, awaiting online payment confirmation",
          updatedBy: req.user._id,
        },
      ],
    });

    // Reduce product stock atomically
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
        for (const updatedItem of updatedItems) {
          await Product.findByIdAndUpdate(updatedItem.product, {
            $inc: { stock: updatedItem.quantity },
          });
        }
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

    // Increment coupon usage atomically
    if (appliedCoupon) {
      const updatedCoupon = await Coupon.findOneAndUpdate(
        {
          _id: appliedCoupon._id,
          isActive: true,
          expiryDate: { $gt: new Date() },
          usedCount: { $lt: appliedCoupon.usageLimit },
        },
        {
          $inc: { usedCount: 1 },
        },
        { new: true }
      );

      if (!updatedCoupon) {
        for (const updatedItem of updatedItems) {
          await Product.findByIdAndUpdate(updatedItem.product, {
            $inc: { stock: updatedItem.quantity },
          });
        }
        await Order.findByIdAndDelete(order._id);
        return res.status(409).json({
          message: "Coupon usage limit reached. Please try again.",
        });
      }
    }

    cart.items = [];
    await cart.save();

    try {
      await sendEmail({
        email: req.user.email,
        subject: "Your ShopEase Order Has Been Placed!",
        message: `
          <h2>Thank you for your order, ${shippingAddress.fullName}!</h2>
          <p>Your order has been placed successfully.</p>
          <h3>Order Details</h3>
          <p>Order ID: ${order._id}</p>
          <p>Items Subtotal: ₹${order.totalAmount}</p>
          <p>Delivery Charge: ${order.deliveryCharge === 0 ? "FREE" : `₹${order.deliveryCharge}`}</p>
          <p>Total Payable: ₹${order.finalAmount}</p>
          <p>Payment Method: ${order.paymentMethod}</p>
          <p>Payment Status: ${order.paymentStatus}</p>
          <p>Thank you for shopping with ShopEase!</p>
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

// 2. Get all orders of logged-in user
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

// 3. Get one order by ID (strict ownership check)
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
    const { reason } = req.body || {};

    const order = await Order.findById(orderId);

    if (!order) {
      return res.status(404).json({
        message: "Order not found",
      });
    }

    if (order.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        message: "You are not authorized to cancel this order",
      });
    }

    if (order.orderStatus === "Cancelled") {
      return res.status(400).json({
        message: "Order is already cancelled",
      });
    }

    if (!CANCELLABLE_STATUSES.includes(order.orderStatus)) {
      return res.status(400).json({
        message: `Order cannot be cancelled once it is ${order.orderStatus}`,
      });
    }

    // Restore product stock
    for (const item of order.items) {
      await Product.findByIdAndUpdate(item.product, {
        $inc: { stock: item.quantity },
      });
    }

    order.orderStatus = "Cancelled";
    order.cancelledAt = new Date();
    order.cancellationReason = reason?.trim() || "Cancelled by customer";

    appendStatusHistory(
      order,
      "Cancelled",
      order.cancellationReason,
      req.user._id
    );

    // If paid online, automatically queue refund request for admin/Razorpay processing
    if (order.paymentMethod === "Online" && order.paymentStatus === "Paid") {
      order.refund = {
        status: "Requested",
        reason: order.cancellationReason,
        details: "Automatic refund request on cancelled prepaid order",
        amount: order.finalAmount,
        method: "Razorpay",
        requestedAt: new Date(),
      };
      appendStatusHistory(
        order,
        "Refund Requested",
        "Prepaid order cancelled — refund queued for processing",
        req.user._id
      );
    }

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

// 5. Request return/refund for delivered order
export const requestRefund = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { reason, details, payoutDetails } = req.body;

    if (!reason || !String(reason).trim()) {
      return res.status(400).json({
        message: "Please provide a reason for the refund request",
      });
    }

    const order = await Order.findById(orderId).populate("items.product");

    if (!order) {
      return res.status(404).json({
        message: "Order not found",
      });
    }

    if (order.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        message: "Not authorized to request a refund for this order",
      });
    }

    if (order.orderStatus !== "Delivered") {
      return res.status(400).json({
        message: "Refunds can only be requested for delivered orders",
      });
    }

    if (order.refund && order.refund.status !== "None") {
      return res.status(409).json({
        message: `Refund request already exists (status: ${order.refund.status})`,
      });
    }

    // Validate return window
    const returnWindowDays = order.items.reduce((minDays, item) => {
      const days = item.product?.returnWindowDays ?? 7;
      return Math.min(minDays, days);
    }, 7);

    const referenceDate = order.deliveredAt || order.updatedAt || order.createdAt;
    const daysSinceDelivery =
      (Date.now() - new Date(referenceDate).getTime()) / (1000 * 60 * 60 * 24);

    if (daysSinceDelivery > returnWindowDays) {
      return res.status(400).json({
        message: `The ${returnWindowDays}-day return window for this order has expired`,
      });
    }

    const isOnlinePaid =
      order.paymentMethod === "Online" &&
      order.paymentStatus === "Paid" &&
      Boolean(order.razorpayPaymentId);

    if (!isOnlinePaid && (!payoutDetails || !String(payoutDetails).trim())) {
      return res.status(400).json({
        message:
          "Please provide UPI ID or bank account details for COD manual refund",
      });
    }

    order.orderStatus = "Return Requested";
    order.refund = {
      status: "Requested",
      reason: String(reason).trim(),
      details: String(details || "").trim(),
      amount: order.finalAmount,
      method: isOnlinePaid ? "Razorpay" : "Manual/COD",
      payoutDetails: String(payoutDetails || "").trim(),
      requestedAt: new Date(),
    };

    appendStatusHistory(
      order,
      "Return Requested",
      `Reason: ${order.refund.reason}`,
      req.user._id
    );

    await order.save();

    return res.status(200).json({
      message: "Refund request submitted successfully",
      order,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to submit refund request",
      error: error.message,
    });
  }
};

// 6. Buy Again: add previously ordered items to cart at current prices & stock
export const buyAgainOrder = async (req, res) => {
  try {
    const { orderId } = req.params;

    const order = await Order.findOne({
      _id: orderId,
      user: req.user._id,
    });

    if (!order) {
      return res.status(404).json({
        message: "Order not found",
      });
    }

    let cart = await Cart.findOne({ user: req.user._id });
    if (!cart) {
      cart = new Cart({ user: req.user._id, items: [] });
    }

    const addedItems = [];
    const unavailableItems = [];

    for (const item of order.items) {
      const product = await Product.findById(item.product);
      if (!product || product.stock <= 0) {
        unavailableItems.push({
          productId: item.product,
          name: product?.name || "Unavailable product",
          reason: !product ? "Product discontinued" : "Out of stock",
        });
        continue;
      }

      const existingIdx = cart.items.findIndex(
        (ci) => ci.product.toString() === product._id.toString()
      );
      const currentQty = existingIdx > -1 ? cart.items[existingIdx].quantity : 0;
      const desiredTotal = currentQty + item.quantity;
      const cappedTotal = Math.min(desiredTotal, product.stock);
      const addedQty = cappedTotal - currentQty;

      if (addedQty <= 0) {
        unavailableItems.push({
          productId: product._id,
          name: product.name,
          reason: `Maximum available stock (${product.stock}) already in cart`,
        });
        continue;
      }

      if (existingIdx > -1) {
        cart.items[existingIdx].quantity = cappedTotal;
      } else {
        cart.items.push({ product: product._id, quantity: cappedTotal });
      }

      addedItems.push({
        productId: product._id,
        name: product.name,
        quantity: addedQty,
        currentPrice: product.discountedPrice ?? product.price,
      });
    }

    await cart.save();

    return res.status(200).json({
      message:
        addedItems.length > 0
          ? "Available items added to cart with current prices"
          : "None of the items from this order are currently available",
      addedItems,
      unavailableItems,
      cart,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to process Buy Again",
      error: error.message,
    });
  }
};

// ADMIN: Get all orders
export const getAllOrders = async (req, res) => {
  try {
    const { status } = req.query;

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 10));
    const skip = (page - 1) * limit;

    let filter = {};
    if (status === "refundRequested") {
      filter["refund.status"] = {
        $in: ["Requested", "Approved", "Processing"],
      };
    } else if (status) {
      if (!ORDER_STATUSES.includes(status)) {
        return res.status(400).json({
          success: false,
          message: "Invalid order status",
        });
      }
      filter.orderStatus = status;
    }

    const totalOrders = await Order.countDocuments(filter);

    const orders = await Order.find(filter)
      .populate("user", "name email phone")
      .populate("items.product", "name price image")
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

// ADMIN: Update order status with timeline note
export const updateOrderStatus = async (req, res) => {
  try {
    const { orderStatus, note, estimatedDeliveryDate } = req.body;

    if (!ORDER_STATUSES.includes(orderStatus)) {
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

    if (
      order.orderStatus === "Cancelled" &&
      !["Refund Processing", "Refunded"].includes(orderStatus)
    ) {
      return res.status(400).json({
        message: "Cancelled order cannot be moved back into fulfillment",
      });
    }

    order.orderStatus = orderStatus;

    if (estimatedDeliveryDate) {
      order.estimatedDeliveryDate = new Date(estimatedDeliveryDate);
    }

    if (orderStatus === "Delivered") {
      order.deliveredAt = new Date();
      if (order.paymentMethod === "COD" && order.paymentStatus === "Pending") {
        order.paymentStatus = "Paid";
      }
      if (order.deliveryAssignment?.partnerName) {
        order.deliveryAssignment.deliveryStatus = "Delivered";
        order.deliveryAssignment.updatedAt = new Date();
      }
    } else if (
      orderStatus === "Out for Delivery" &&
      order.deliveryAssignment?.partnerName
    ) {
      order.deliveryAssignment.deliveryStatus = "Out for Delivery";
      order.deliveryAssignment.updatedAt = new Date();
    }

    appendStatusHistory(
      order,
      orderStatus,
      note?.trim() || `Order status updated to ${orderStatus}`,
      req.user._id
    );

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
};

export const updatePaymentStatus = async (req, res) => {
  try {
    const { paymentStatus } = req.body;

    const allowedPaymentStatuses = ["Pending", "Paid", "Failed", "Refunded"];

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
    appendStatusHistory(
      order,
      order.orderStatus,
      `Payment status updated to ${paymentStatus} by admin`,
      req.user._id
    );

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

// ADMIN: Assign or update delivery partner & delivery status
export const assignDeliveryPartner = async (req, res) => {
  try {
    const { orderId } = req.params;
    const {
      partnerId,
      partnerName,
      partnerPhone,
      deliveryStatus,
      trackingNumber,
      deliveryNotes,
      estimatedDeliveryDate,
    } = req.body;

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({
        message: "Order not found",
      });
    }

    let resolvedName = partnerName?.trim() || order.deliveryAssignment?.partnerName || "";
    let resolvedPhone = partnerPhone?.trim() || order.deliveryAssignment?.partnerPhone || "";
    let resolvedPartnerId = partnerId || order.deliveryAssignment?.partner || null;

    if (partnerId) {
      const partner = await DeliveryPartner.findById(partnerId);
      if (!partner) {
        return res.status(404).json({
          message: "Delivery partner not found",
        });
      }
      resolvedName = partner.name;
      resolvedPhone = partner.phone;
      resolvedPartnerId = partner._id;
    }

    if (!resolvedName || !resolvedPhone) {
      return res.status(400).json({
        message: "Delivery partner name and mobile number are required",
      });
    }

    const nextDeliveryStatus =
      deliveryStatus ||
      (order.deliveryAssignment?.deliveryStatus === "Unassigned" ||
      !order.deliveryAssignment?.deliveryStatus
        ? "Assigned"
        : order.deliveryAssignment.deliveryStatus);

    if (!DELIVERY_STATUSES.includes(nextDeliveryStatus)) {
      return res.status(400).json({
        message: "Invalid delivery status",
      });
    }

    order.deliveryAssignment = {
      partner: resolvedPartnerId,
      partnerName: resolvedName,
      partnerPhone: resolvedPhone,
      deliveryStatus: nextDeliveryStatus,
      trackingNumber:
        trackingNumber !== undefined
          ? String(trackingNumber).trim()
          : order.deliveryAssignment?.trackingNumber || "",
      deliveryNotes:
        deliveryNotes !== undefined
          ? String(deliveryNotes).trim()
          : order.deliveryAssignment?.deliveryNotes || "",
      assignedAt: order.deliveryAssignment?.assignedAt || new Date(),
      updatedAt: new Date(),
    };

    if (estimatedDeliveryDate) {
      order.estimatedDeliveryDate = new Date(estimatedDeliveryDate);
    }

    if (nextDeliveryStatus === "Out for Delivery" && order.orderStatus !== "Delivered") {
      order.orderStatus = "Out for Delivery";
    } else if (nextDeliveryStatus === "Delivered" && order.orderStatus !== "Delivered") {
      order.orderStatus = "Delivered";
      order.deliveredAt = new Date();
      if (order.paymentMethod === "COD" && order.paymentStatus === "Pending") {
        order.paymentStatus = "Paid";
      }
    }

    appendStatusHistory(
      order,
      order.orderStatus,
      `Delivery update (${nextDeliveryStatus}): ${resolvedName} (${resolvedPhone})${
        deliveryNotes ? ` — ${deliveryNotes}` : ""
      }`,
      req.user._id
    );

    await order.save();

    return res.status(200).json({
      message: "Delivery assignment updated successfully",
      order,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to update delivery assignment",
      error: error.message,
    });
  }
};

// ADMIN: Approve, reject, or complete manual/Razorpay refund
export const processRefundAdmin = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { action, adminNote, transactionRef } = req.body;

    if (!["approve", "reject", "complete_manual"].includes(action)) {
      return res.status(400).json({
        message: "Invalid refund action",
      });
    }

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({
        message: "Order not found",
      });
    }

    if (!order.refund || order.refund.status === "None") {
      return res.status(400).json({
        message: "No refund request exists for this order",
      });
    }

    if (order.refund.status === "Completed") {
      return res.status(400).json({
        message: "Refund has already been completed",
      });
    }

    if (action === "reject") {
      if (!["Requested", "Approved"].includes(order.refund.status)) {
        return res.status(400).json({
          message: `Cannot reject refund in status ${order.refund.status}`,
        });
      }
      order.refund.status = "Rejected";
      order.refund.adminNote = String(adminNote || "Refund request declined").trim();
      order.refund.processedAt = new Date();
      if (order.orderStatus === "Return Requested") {
        order.orderStatus = "Delivered";
      }
      appendStatusHistory(
        order,
        order.orderStatus,
        `Refund request rejected: ${order.refund.adminNote}`,
        req.user._id
      );
      await order.save();
      return res.status(200).json({
        message: "Refund request rejected",
        order,
      });
    }

    if (action === "approve") {
      if (order.refund.status !== "Requested") {
        return res.status(400).json({
          message: `Refund is already ${order.refund.status}`,
        });
      }

      const isRazorpayRefund =
        order.paymentMethod === "Online" &&
        order.paymentStatus === "Paid" &&
        Boolean(order.razorpayPaymentId);

      if (isRazorpayRefund) {
        const refundAmountPaise = Math.round((order.refund.amount || order.finalAmount) * 100);
        const rzpRefund = await razorpay.payments.refund(order.razorpayPaymentId, {
          amount: refundAmountPaise,
          notes: {
            orderId: String(order._id),
            reason: order.refund.reason || "Customer refund",
          },
        });

        order.refund.method = "Razorpay";
        order.refund.razorpayRefundId = rzpRefund.id;
        order.refund.adminNote = String(adminNote || "").trim();

        if (rzpRefund.status === "processed") {
          order.refund.status = "Completed";
          order.refund.processedAt = new Date();
          order.paymentStatus = "Refunded";
          order.orderStatus = "Refunded";
          appendStatusHistory(
            order,
            "Refunded",
            `Razorpay refund confirmed (${rzpRefund.id})`,
            req.user._id
          );
        } else {
          order.refund.status = "Processing";
          order.orderStatus = "Refund Processing";
          appendStatusHistory(
            order,
            "Refund Processing",
            `Razorpay refund initiated (${rzpRefund.id}), awaiting confirmation`,
            req.user._id
          );
        }

        await order.save();
        return res.status(200).json({
          message:
            order.refund.status === "Completed"
              ? "Razorpay refund processed and confirmed"
              : "Razorpay refund initiated and awaiting confirmation",
          order,
        });
      }

      // Manual / COD workflow: approve first, then admin completes after payout
      order.refund.method = "Manual/COD";
      order.refund.status = "Approved";
      order.refund.adminNote = String(adminNote || "Approved for manual payout").trim();
      order.orderStatus = "Return Approved";
      appendStatusHistory(
        order,
        "Return Approved",
        `Refund approved for manual/COD payout${adminNote ? `: ${adminNote}` : ""}`,
        req.user._id
      );
      await order.save();
      return res.status(200).json({
        message: "COD refund approved. Mark completed once payout is sent.",
        order,
      });
    }

    // action === "complete_manual"
    if (order.refund.method !== "Manual/COD") {
      return res.status(400).json({
        message: "Manual completion is only for COD/manual refunds",
      });
    }
    if (!["Approved", "Processing"].includes(order.refund.status)) {
      return res.status(400).json({
        message: "Refund must be approved before marking completed",
      });
    }
    if (!transactionRef || !String(transactionRef).trim()) {
      return res.status(400).json({
        message: "Please provide the payout transaction reference",
      });
    }

    order.refund.status = "Completed";
    order.refund.transactionRef = String(transactionRef).trim();
    order.refund.adminNote = String(adminNote || order.refund.adminNote || "").trim();
    order.refund.processedAt = new Date();
    order.paymentStatus = "Refunded";
    order.orderStatus = "Refunded";
    appendStatusHistory(
      order,
      "Refunded",
      `Manual refund completed (Ref: ${order.refund.transactionRef})`,
      req.user._id
    );

    await order.save();

    return res.status(200).json({
      message: "Manual COD refund marked as completed",
      order,
    });
  } catch (error) {
    return res.status(500).json({
      message: error?.error?.description || error.message || "Refund processing failed",
    });
  }
};

// ADMIN: Sync pending Razorpay refund status from Razorpay API
export const syncRazorpayRefundStatus = async (req, res) => {
  try {
    const { orderId } = req.params;
    const order = await Order.findById(orderId);

    if (!order || !order.refund?.razorpayRefundId || !order.razorpayPaymentId) {
      return res.status(404).json({
        message: "Razorpay refund record not found for this order",
      });
    }

    const rzpRefund = await razorpay.payments.fetchRefund(
      order.razorpayPaymentId,
      order.refund.razorpayRefundId
    );

    if (rzpRefund.status === "processed") {
      order.refund.status = "Completed";
      order.refund.processedAt = new Date();
      order.paymentStatus = "Refunded";
      order.orderStatus = "Refunded";
      appendStatusHistory(
        order,
        "Refunded",
        `Razorpay refund confirmed (${rzpRefund.id})`,
        req.user._id
      );
      await order.save();
    } else if (rzpRefund.status === "failed") {
      order.refund.status = "Rejected";
      order.refund.adminNote = "Razorpay refund failed";
      appendStatusHistory(
        order,
        order.orderStatus,
        `Razorpay refund failed (${rzpRefund.id})`,
        req.user._id
      );
      await order.save();
    }

    return res.status(200).json({
      message: `Razorpay refund status: ${rzpRefund.status}`,
      razorpayStatus: rzpRefund.status,
      order,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to sync Razorpay refund status",
      error: error.message,
    });
  }
};
