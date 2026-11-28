import crypto from "crypto";
import razorpay from "../config/razorpay.js";
import Order from "../models/order.model.js";

export const verifyPayment = async (req, res) => {
  try {
    const {
      orderId,
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    } = req.body;

    if (
      !orderId ||
      !razorpay_order_id ||
      !razorpay_payment_id ||
      !razorpay_signature
    ) {
      return res.status(400).json({
        message: "All payment details are required",
      });
    }

    const order = await Order.findOne({
      _id: orderId,
      user: req.user._id,
    });

    if (!order) {
      return res.status(404).json({
        message: "Order not found",
      });
    }

    if (order.paymentMethod !== "Online") {
      return res.status(400).json({
        message: "This is not an online payment order",
      });
    }

    if (
      !order.razorpayOrderId ||
      order.razorpayOrderId !== razorpay_order_id
    ) {
      return res.status(400).json({
        message: "Razorpay order ID mismatch",
      });
    }

    if (order.paymentStatus === "Paid") {
      return res.status(200).json({
        message: "Order payment is already verified",
        paymentStatus: order.paymentStatus,
        orderStatus: order.orderStatus,
        orderId: order._id,
      });
    }

    const generatedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(`${order.razorpayOrderId}|${razorpay_payment_id}`)
      .digest("hex");

    const signatureBuffer = Buffer.from(generatedSignature);
    const receivedSignatureBuffer = Buffer.from(razorpay_signature);

    if (
      signatureBuffer.length !== receivedSignatureBuffer.length ||
      !crypto.timingSafeEqual(signatureBuffer, receivedSignatureBuffer)
    ) {
      return res.status(400).json({
        message: "Invalid payment signature",
      });
    }

    const payment = await razorpay.payments.fetch(razorpay_payment_id);

    if (payment.order_id !== order.razorpayOrderId) {
      return res.status(400).json({
        message: "Payment order mismatch",
      });
    }

    if (payment.status !== "captured") {
      return res.status(400).json({
        message: "Payment has not been captured",
      });
    }

    const expectedAmount = Math.round(order.finalAmount * 100);

    if (payment.amount !== expectedAmount || payment.currency !== "INR") {
      return res.status(400).json({
        message: "Payment amount or currency mismatch",
      });
    }

    order.paymentStatus = "Paid";
    order.razorpayPaymentId = razorpay_payment_id;
    if (["Pending", "Order Placed", "Payment Failed"].includes(order.orderStatus)) {
      order.orderStatus = "Order Confirmed";
    }
    if (!Array.isArray(order.statusHistory)) {
      order.statusHistory = [];
    }
    order.statusHistory.push({
      status: order.orderStatus,
      timestamp: new Date(),
      note: `Online payment verified (${razorpay_payment_id})`,
      updatedBy: req.user._id,
    });

    await order.save();

    return res.status(200).json({
      message: "Payment verified successfully",
      paymentStatus: order.paymentStatus,
      orderStatus: order.orderStatus,
      orderId: order._id,
      razorpayPaymentId: order.razorpayPaymentId,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Payment verification failed",
      error: error.message,
    });
  }
};

export const handlePaymentFailure = async (req, res) => {
  try {
    const { orderId, razorpay_payment_id, reason } = req.body;

    if (!orderId) {
      return res.status(400).json({
        message: "Please provide order ID",
      });
    }

    const order = await Order.findOne({
      _id: orderId,
      user: req.user._id,
    });

    if (!order) {
      return res.status(404).json({
        message: "Order not found",
      });
    }

    if (order.paymentMethod !== "Online") {
      return res.status(400).json({
        message: "This is not an online payment order",
      });
    }

    if (order.paymentStatus === "Paid") {
      return res.status(400).json({
        message: "Already paid orders cannot be marked as failed",
      });
    }

    if (razorpay_payment_id) {
      order.razorpayPaymentId = razorpay_payment_id;
    }

    order.paymentStatus = "Failed";
    if (!["Cancelled", "Delivered"].includes(order.orderStatus)) {
      order.orderStatus = "Payment Failed";
    }
    if (!Array.isArray(order.statusHistory)) {
      order.statusHistory = [];
    }
    order.statusHistory.push({
      status: order.orderStatus,
      timestamp: new Date(),
      note: reason || "Online payment failed or cancelled",
      updatedBy: req.user._id,
    });

    await order.save();

    return res.status(200).json({
      message: "Payment failure recorded successfully",
      paymentStatus: order.paymentStatus,
      orderStatus: order.orderStatus,
      orderId: order._id,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to record payment failure",
      error: error.message,
    });
  }
};

export const createPaymentOrder = async (req, res) => {
  try {
    const { orderId } = req.body;

    if (!orderId) {
      return res.status(400).json({
        message: "Please provide order ID",
      });
    }

    const order = await Order.findOne({
      _id: orderId,
      user: req.user._id,
    });

    if (!order) {
      return res.status(404).json({
        message: "Order not found",
      });
    }

    if (order.paymentMethod !== "Online") {
      return res.status(400).json({
        message: "This order is not an online payment order",
      });
    }

    if (order.orderStatus === "Cancelled") {
      return res.status(400).json({
        message: "Cannot initiate payment for a cancelled order",
      });
    }

    if (!["Pending", "Failed"].includes(order.paymentStatus)) {
      return res.status(400).json({
        message: "Payment cannot be initiated for this order",
      });
    }

    const options = {
      amount: Math.round(order.finalAmount * 100),
      currency: "INR",
      receipt: `receipt_${order._id}`,
    };

    const paymentOrder = await razorpay.orders.create(options);

    order.razorpayOrderId = paymentOrder.id;
    order.paymentStatus = "Pending";
    await order.save();

    return res.status(201).json({
      message: "Payment order created successfully",
      orderId: order._id,
      keyId: process.env.RAZORPAY_KEY_ID || "",
      paymentOrder,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to create payment order",
      error: error.message,
    });
  }
};
