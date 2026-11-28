import mongoose from "mongoose";

export const ORDER_STATUSES = [
  "Pending",
  "Confirmed",
  "Order Placed",
  "Order Confirmed",
  "Processing",
  "Packed",
  "Shipped",
  "Out for Delivery",
  "Delivered",
  "Cancelled",
  "Payment Failed",
  "Return Requested",
  "Return Approved",
  "Refund Processing",
  "Refunded",
];

export const DELIVERY_STATUSES = [
  "Unassigned",
  "Assigned",
  "Picked Up",
  "In Transit",
  "Out for Delivery",
  "Delivered",
  "Failed Attempt",
];

const orderSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    items: [
      {
        product: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Product",
          required: true,
        },
        quantity: {
          type: Number,
          required: true,
          min: 1,
        },
        price: {
          type: Number,
          required: true,
          min: 0,
        },
        originalPrice: {
          type: Number,
          min: 0,
        },
        discountPercentage: {
          type: Number,
          default: 0,
          min: 0,
        },
      },
    ],

    // Items subtotal using discounted selling prices
    totalAmount: {
      type: Number,
      required: true,
      min: 0,
    },

    productDiscountSavings: {
      type: Number,
      default: 0,
      min: 0,
    },

    deliveryCharge: {
      type: Number,
      default: 0,
      min: 0,
    },

    couponCode: {
      type: String,
      default: null,
      trim: true,
    },

    discountAmount: {
      type: Number,
      default: 0,
      min: 0,
    },

    finalAmount: {
      type: Number,
      required: true,
      min: 0,
    },

    shippingAddress: {
      fullName: { type: String, required: true, trim: true },
      phone: { type: String, required: true, trim: true },
      address: { type: String, required: true, trim: true },
      city: { type: String, required: true, trim: true },
      state: { type: String, required: true, trim: true },
      postalCode: { type: String, required: true, trim: true },
      country: { type: String, required: true, trim: true },
    },

    paymentMethod: {
      type: String,
      enum: ["COD", "Online"],
      default: "COD",
      required: true,
    },

    paymentStatus: {
      type: String,
      enum: ["Pending", "Paid", "Failed", "Refunded"],
      default: "Pending",
    },

    razorpayOrderId: {
      type: String,
      default: null,
    },

    razorpayPaymentId: {
      type: String,
      default: null,
    },

    orderStatus: {
      type: String,
      enum: ORDER_STATUSES,
      default: "Order Placed",
    },

    statusHistory: [
      {
        status: { type: String, required: true },
        timestamp: { type: Date, default: Date.now },
        note: { type: String, default: "" },
        updatedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          default: null,
        },
      },
    ],

    estimatedDeliveryDate: {
      type: Date,
      default: null,
    },

    deliveredAt: {
      type: Date,
      default: null,
    },

    cancelledAt: {
      type: Date,
      default: null,
    },

    cancellationReason: {
      type: String,
      default: "",
      trim: true,
    },

    idempotencyKey: {
      type: String,
      default: null,
      index: true,
      sparse: true,
    },

    deliveryAssignment: {
      partner: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "DeliveryPartner",
        default: null,
      },
      partnerName: { type: String, default: "" },
      partnerPhone: { type: String, default: "" },
      deliveryStatus: {
        type: String,
        enum: DELIVERY_STATUSES,
        default: "Unassigned",
      },
      trackingNumber: { type: String, default: "" },
      deliveryNotes: { type: String, default: "" },
      assignedAt: { type: Date, default: null },
      updatedAt: { type: Date, default: null },
    },

    refund: {
      status: {
        type: String,
        enum: [
          "None",
          "Requested",
          "Approved",
          "Rejected",
          "Processing",
          "Completed",
        ],
        default: "None",
      },
      reason: { type: String, default: "" },
      details: { type: String, default: "" },
      amount: { type: Number, default: 0, min: 0 },
      method: {
        type: String,
        enum: ["None", "Razorpay", "Manual/COD"],
        default: "None",
      },
      payoutDetails: { type: String, default: "" },
      razorpayRefundId: { type: String, default: "" },
      adminNote: { type: String, default: "" },
      transactionRef: { type: String, default: "" },
      requestedAt: { type: Date, default: null },
      processedAt: { type: Date, default: null },
    },
  },
  { timestamps: true }
);

const Order = mongoose.model("Order", orderSchema);

export default Order;
