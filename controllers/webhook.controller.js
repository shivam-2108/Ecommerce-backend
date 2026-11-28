import crypto from "crypto";
import Order from "../models/order.model.js";

export const razorpayWebhook = async (req, res) => {
  try {
    const signature = req.headers["x-razorpay-signature"];

    if (!signature || !req.rawBody) {
      return res.status(400).json({
        message: "Missing webhook signature or raw body",
      });
    }

    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET)
      .update(req.rawBody)
      .digest("hex");

    const expectedBuffer = Buffer.from(expectedSignature);
    const receivedBuffer = Buffer.from(signature);

    if (
      expectedBuffer.length !== receivedBuffer.length ||
      !crypto.timingSafeEqual(expectedBuffer, receivedBuffer)
    ) {
      return res.status(400).json({
        message: "Invalid webhook signature",
      });
    }

    const { event, payload } = JSON.parse(req.rawBody.toString());

    if (event === "refund.processed") {
      const refundEntity = payload?.refund?.entity;
      if (!refundEntity) {
        return res.status(400).json({ message: "Missing refund payload" });
      }
      const order = await Order.findOne({
        razorpayPaymentId: refundEntity.payment_id,
      });
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }
      order.refund = {
        ...(order.refund || {}),
        status: "Completed",
        razorpayRefundId: refundEntity.id,
        processedAt: new Date(),
      };
      order.paymentStatus = "Refunded";
      order.orderStatus = "Refunded";
      order.statusHistory = order.statusHistory || [];
      order.statusHistory.push({
        status: "Refunded",
        timestamp: new Date(),
        note: `Razorpay refund processed (${refundEntity.id})`,
      });
      await order.save();
      return res.status(200).json({
        message: "Refund webhook processed successfully",
        event,
      });
    }

    if (!["payment.captured", "payment.failed"].includes(event)) {
      return res.status(200).json({
        message: "Event ignored",
      });
    }

    const payment = payload.payment.entity;

    const order = await Order.findOne({
      razorpayOrderId: payment.order_id,
    });

    if (!order) {
      return res.status(404).json({
        message: "Order not found",
      });
    }

    const expectedAmount = Math.round(order.finalAmount * 100);

    if (payment.amount !== expectedAmount || payment.currency !== "INR") {
      return res.status(400).json({
        message: "Payment amount or currency mismatch",
      });
    }

    if (event === "payment.captured" && payment.status !== "captured") {
      return res.status(400).json({
        message: "Payment is not captured",
      });
    }

    if (event === "payment.failed" && payment.status !== "failed") {
      return res.status(400).json({
        message: "Payment is not failed",
      });
    }

    if (order.paymentStatus === "Paid") {
      return res.status(200).json({
        message: "Payment already processed",
        paymentStatus: order.paymentStatus,
      });
    }

    order.statusHistory = order.statusHistory || [];

    if (event === "payment.captured") {
      order.paymentStatus = "Paid";
      order.razorpayPaymentId = payment.id;
      if (["Pending", "Order Placed", "Payment Failed"].includes(order.orderStatus)) {
        order.orderStatus = "Order Confirmed";
      }
      order.statusHistory.push({
        status: order.orderStatus,
        timestamp: new Date(),
        note: `Payment captured via webhook (${payment.id})`,
      });
    }

    if (event === "payment.failed") {
      order.paymentStatus = "Failed";
      order.razorpayPaymentId = payment.id;
      if (!["Cancelled", "Delivered"].includes(order.orderStatus)) {
        order.orderStatus = "Payment Failed";
      }
      order.statusHistory.push({
        status: order.orderStatus,
        timestamp: new Date(),
        note: "Payment failed via webhook",
      });
    }

    await order.save();

    return res.status(200).json({
      message: "Webhook processed successfully",
      event,
      paymentStatus: order.paymentStatus,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Webhook processing failed",
      error: error.message,
    });
  }
};
