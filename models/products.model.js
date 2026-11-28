import mongoose from "mongoose";

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
    },
    originalPrice: {
      type: Number,
      min: 0,
    },
    // Current selling (discounted) price used across cart, checkout, and orders
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    discountedPrice: {
      type: Number,
      min: 0,
    },
    discountPercentage: {
      type: Number,
      default: 0,
      min: 0,
      max: 90,
    },
    category: {
      type: String,
      required: true,
      trim: true,
    },
    brand: {
      type: String,
      trim: true,
      default: "ShopEase",
    },
    image: {
      type: String,
      default: "",
    },
    images: {
      type: [
        {
          url: { type: String, required: true },
          publicId: { type: String, default: "" },
        },
      ],
      default: [],
    },
    specifications: {
      type: [
        {
          key: { type: String, required: true, trim: true },
          value: { type: String, required: true, trim: true },
        },
      ],
      default: [],
    },
    warranty: {
      type: String,
      trim: true,
      default: "",
    },
    returnPolicy: {
      type: String,
      trim: true,
      default: "7 Days Replacement & Return Policy",
    },
    returnWindowDays: {
      type: Number,
      default: 7,
      min: 0,
    },
    estimatedDeliveryDays: {
      type: Number,
      default: 4,
      min: 1,
    },
    stock: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    averageRating: {
      type: Number,
      default: 0,
      min: 0,
      max: 5,
    },
    numReviews: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  { timestamps: true }
);

const Product = mongoose.model("Product", productSchema);
export default Product;
