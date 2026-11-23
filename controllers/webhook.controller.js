
import crypto from "crypto";
import Order from "../models/order.model.js";

export const razorpayWebhook = async (req, res) => {
    try {
        const signature = req.headers["x-razorpay-signature"];

        // 1. Check signature and raw body
        if (!signature || !req.rawBody) {
            return res.status(400).json({
                message: "Missing webhook signature or raw body"
            });
        }

        // 2. Verify webhook signature
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
                message: "Invalid webhook signature"
            });
        }

        // 3. Parse webhook event
        const { event, payload } = JSON.parse(req.rawBody.toString());

        // 4. Ignore unsupported events
        if (!["payment.captured", "payment.failed"].includes(event)) {
            return res.status(200).json({
                message: "Event ignored"
            });
        }

        const payment = payload.payment.entity;

        // 5. Find order
        const order = await Order.findOne({
            razorpayOrderId: payment.order_id
        });

        if (!order) {
            return res.status(404).json({
                message: "Order not found"
            });
        }

        // 6. Validate payment amount and currency
        const expectedAmount = Math.round(order.finalAmount * 100);

        if (
            payment.amount !== expectedAmount ||
            payment.currency !== "INR"
        ) {
            return res.status(400).json({
                message: "Payment amount or currency mismatch"
            });
        }

        // 7. Validate actual payment status
        if (
            event === "payment.captured" &&
            payment.status !== "captured"
        ) {
            return res.status(400).json({
                message: "Payment is not captured"
            });
        }

        if (
            event === "payment.failed" &&
            payment.status !== "failed"
        ) {
            return res.status(400).json({
                message: "Payment is not failed"
            });
        }

        // 8. Check payment ID consistency
        if (
            order.razorpayPaymentId &&
            order.razorpayPaymentId !== payment.id
        ) {
            return res.status(400).json({
                message: "Payment ID mismatch"
            });
        }

        // 9. Prevent duplicate updates
        if (order.paymentStatus === "Paid") {
            return res.status(200).json({
                message: "Payment already processed",
                paymentStatus: order.paymentStatus
            });
        }

        // 10. Update payment status
        if (event === "payment.captured") {
            order.paymentStatus = "Paid";
            order.razorpayPaymentId = payment.id;
        }
        if (event === "payment.failed") {
            order.paymentStatus = "Failed";
        }
        await order.save();

        return res.status(200).json({
            message: "Webhook processed successfully",
            event,
            paymentStatus: order.paymentStatus
        });

    } catch (error) {
        return res.status(500).json({
            message: "Webhook processing failed",
            error: error.message
        });
    }
};
