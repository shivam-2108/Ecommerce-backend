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

    doc.fontSize(22).text("ShopEase E-Commerce Store", { align: "center" });
    doc.moveDown();

    doc.fontSize(16).text("TAX INVOICE");
    doc.moveDown(0.5);

    doc.fontSize(11).text(`Invoice / Order ID: ${order._id}`);
    doc.text(`Customer: ${order.shippingAddress.fullName}`);
    doc.text(`Phone: ${order.shippingAddress.phone}`);
    doc.text(
      `Shipping Address: ${order.shippingAddress.address}, ${order.shippingAddress.city}, ${order.shippingAddress.state} ${order.shippingAddress.postalCode}, ${order.shippingAddress.country}`
    );
    doc.text(`Date: ${new Date(order.createdAt).toLocaleDateString("en-IN")}`);
    doc.moveDown();

    doc.fontSize(14).text("Order Items");
    doc.moveDown(0.5);

    order.items.forEach((item) => {
      doc
        .fontSize(11)
        .text(
          `${item.product?.name || "Product"} | Qty: ${item.quantity} | Price: Rs. ${item.price} | Line Total: Rs. ${item.price * item.quantity}`
        );
    });

    doc.moveDown();
    doc.fontSize(11).text(`Items Subtotal: Rs. ${order.totalAmount}`);
    if (order.discountAmount > 0) {
      doc.text(
        `Coupon Discount (${order.couponCode || "PROMO"}): -Rs. ${order.discountAmount}`
      );
    }
    doc.text(
      `Delivery Charge: ${
        order.deliveryCharge > 0 ? `Rs. ${order.deliveryCharge}` : "FREE"
      }`
    );
    doc.fontSize(13).text(`Final Payable Amount: Rs. ${order.finalAmount}`);
    doc.moveDown(0.5);
    doc.fontSize(11).text(`Payment Method: ${order.paymentMethod}`);
    doc.text(`Payment Status: ${order.paymentStatus}`);
    doc.text(`Order Status: ${order.orderStatus}`);

    if (order.refund?.status && order.refund.status !== "None") {
      doc.text(`Refund Status: ${order.refund.status}`);
    }

    doc.moveDown();
    doc.text("Thank you for shopping with ShopEase!", {
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
