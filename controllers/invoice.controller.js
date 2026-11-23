import PDFDocument from "pdfkit";
import Order from "../models/order.model.js";

export const generateInvoice = async (req, res) => {
    try {
        const { orderId } = req.params;

        const order = await Order.findOne({
            _id: orderId,
            user: req.user._id,
        }).populate("items.product", "name price");

        if (!order) {
            return res.status(404).json({
                message: "Order not found",
            });
        }

        const doc = new PDFDocument({ margin: 50 });

        res.setHeader("Content-Type", "application/pdf");
        res.setHeader(
            "Content-Disposition",
            `attachment; filename=invoice-${order._id}.pdf`
        );

        doc.pipe(res);

        doc.fontSize(22).text("E-Commerce Store", { align: "center" });
        doc.moveDown();

        doc.fontSize(16).text("INVOICE");
        doc.moveDown();

        doc.fontSize(11).text(`Invoice ID: ${order._id}`);
        doc.text(`Customer: ${order.shippingAddress.fullName}`);
        doc.text(`Date: ${new Date(order.createdAt).toLocaleDateString()}`);
        doc.moveDown();

        doc.fontSize(14).text("Order Details");
        doc.moveDown();

        order.items.forEach((item) => {
            doc.fontSize(11).text(
                `${item.product?.name || "Product"} | Quantity: ${item.quantity} | Price: Rs. ${item.price}`
            );
        });

        doc.moveDown();
        doc.fontSize(12).text(`Total Amount: Rs. ${order.finalAmount}`);
        doc.text(`Payment Method: ${order.paymentMethod}`);
        doc.text(`Payment Status: ${order.paymentStatus}`);

        doc.moveDown();
        doc.text("Thank you for shopping with us!", {
            align: "center",
        });

        doc.end();

    } catch (error) {
        return res.status(500).json({
            message: "Invoice generation failed",
            error: error.message,
        });
    }
};