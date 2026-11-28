import "dotenv/config";
import mongoose from "mongoose";
import connectDB from "../config/db.js";
import Product from "../models/products.model.js";
import Order from "../models/order.model.js";

const REALISTIC_DISCOUNTS = [10, 12, 15, 18, 20, 24, 25, 28, 30, 33, 35, 40, 45];

async function runBackfill() {
  await connectDB();

  // Read raw documents to avoid Mongoose validation errors on legacy imported timestamps
  const products = await Product.collection.find({}).toArray();
  let updatedProducts = 0;

  for (const prod of products) {
    const updateSet = {};
    const currentPrice = Number(prod.price || 0);

    if (
      !prod.originalPrice ||
      prod.originalPrice <= currentPrice ||
      !prod.discountPercentage ||
      prod.discountPercentage < 5
    ) {
      const targetPct =
        REALISTIC_DISCOUNTS[Math.floor(Math.random() * REALISTIC_DISCOUNTS.length)];
      const computedMrp =
        currentPrice > 0
          ? Math.max(currentPrice + 1, Math.round(currentPrice / (1 - targetPct / 100)))
          : 199;
      const sellingPrice =
        currentPrice > 0
          ? currentPrice
          : Math.round(computedMrp * (1 - targetPct / 100));
      const actualPct = Math.round(((computedMrp - sellingPrice) / computedMrp) * 100);

      updateSet.originalPrice = computedMrp;
      updateSet.price = sellingPrice;
      updateSet.discountedPrice = sellingPrice;
      updateSet.discountPercentage = actualPct;
    } else if (prod.discountedPrice !== currentPrice) {
      updateSet.discountedPrice = currentPrice;
    }

    if (prod.image && (!Array.isArray(prod.images) || prod.images.length === 0)) {
      updateSet.images = [{ url: prod.image, publicId: "" }];
    }

    if (!prod.brand) {
      updateSet.brand = "ShopEase";
    }

    if (!prod.returnPolicy) {
      updateSet.returnPolicy = "7 Days Replacement & Return Policy";
      updateSet.returnWindowDays = 7;
    }

    if (!prod.estimatedDeliveryDays) {
      updateSet.estimatedDeliveryDays = 4;
    }

    if (Object.keys(updateSet).length > 0) {
      await Product.collection.updateOne(
        { _id: prod._id },
        { $set: updateSet }
      );
      updatedProducts += 1;
    }
  }

  const orders = await Order.collection
    .find({
      $or: [{ statusHistory: { $exists: false } }, { statusHistory: { $size: 0 } }],
    })
    .toArray();
  let updatedOrders = 0;

  for (const order of orders) {
    const createdAt =
      order.createdAt instanceof Date
        ? order.createdAt
        : order.createdAt?.$date
          ? new Date(order.createdAt.$date)
          : new Date();

    await Order.collection.updateOne(
      { _id: order._id },
      {
        $set: {
          statusHistory: [
            {
              status: order.orderStatus || "Order Placed",
              timestamp: createdAt,
              note: `Order recorded (${order.paymentMethod || "COD"})`,
            },
          ],
        },
      }
    );
    updatedOrders += 1;
  }

  console.log(
    `Backfill complete: ${updatedProducts}/${products.length} products updated, ${updatedOrders} orders initialized with statusHistory.`
  );
  await mongoose.disconnect();
}

runBackfill().catch(async (err) => {
  console.error("Backfill failed:", err.message);
  await mongoose.disconnect();
  process.exit(1);
});
