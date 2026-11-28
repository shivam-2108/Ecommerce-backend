import mongoose from "mongoose";
import Product from "../models/products.model.js";
import Order from "../models/order.model.js";
import Review from "../models/review.model.js";
import { normalizeProductPricing } from "../utils/pricing.js";

function sanitizeProductPayload(body, isUpdate = false) {
  const payload = { ...body };

  if (
    !isUpdate ||
    payload.price !== undefined ||
    payload.discountedPrice !== undefined ||
    payload.originalPrice !== undefined ||
    payload.discountPercentage !== undefined
  ) {
    const pricing = normalizeProductPricing({
      price: payload.price,
      discountedPrice: payload.discountedPrice,
      originalPrice: payload.originalPrice,
      discountPercentage: payload.discountPercentage,
    });
    payload.originalPrice = pricing.originalPrice;
    payload.price = pricing.price;
    payload.discountedPrice = pricing.discountedPrice;
    payload.discountPercentage = pricing.discountPercentage;
  }

  if (Array.isArray(payload.images)) {
    payload.images = payload.images
      .map((img) => {
        if (typeof img === "string" && img.trim()) {
          return { url: img.trim(), publicId: "" };
        }
        if (img && typeof img.url === "string" && img.url.trim()) {
          return { url: img.url.trim(), publicId: img.publicId || "" };
        }
        return null;
      })
      .filter(Boolean);

    if (!payload.image && payload.images.length > 0) {
      payload.image = payload.images[0].url;
    }
  } else if (typeof payload.image === "string" && payload.image.trim() && !isUpdate) {
    payload.images = [{ url: payload.image.trim(), publicId: "" }];
  }

  if (Array.isArray(payload.specifications)) {
    payload.specifications = payload.specifications
      .filter((spec) => spec && spec.key?.trim() && spec.value?.trim())
      .map((spec) => ({
        key: spec.key.trim(),
        value: spec.value.trim(),
      }));
  }

  return payload;
}

// CREATE PRODUCT
export const createProduct = async (req, res) => {
  try {
    const payload = sanitizeProductPayload(req.body, false);
    const product = await Product.create(payload);

    res.status(201).json({
      message: "Product created successfully",
      product,
    });
  } catch (error) {
    res.status(400).json({
      message: error.message,
    });
  }
};

// GET ALL PRODUCTS WITH SEARCH, FILTER, SORT & PAGINATION
export const getProducts = async (req, res) => {
  try {
    const {
      search,
      category,
      minPrice,
      maxPrice,
      sort,
      page = 1,
      limit = 10,
    } = req.query;

    const filter = {};

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: "i" } },
        { brand: { $regex: search, $options: "i" } },
        { category: { $regex: search, $options: "i" } },
      ];
    }

    if (category) {
      filter.category = category;
    }

    if (minPrice !== undefined || maxPrice !== undefined) {
      filter.price = {};

      if (minPrice !== undefined) {
        filter.price.$gte = Number(minPrice);
      }

      if (maxPrice !== undefined) {
        filter.price.$lte = Number(maxPrice);
      }

      if (
        (minPrice !== undefined && !Number.isFinite(Number(minPrice))) ||
        (maxPrice !== undefined && !Number.isFinite(Number(maxPrice))) ||
        (minPrice !== undefined && Number(minPrice) < 0) ||
        (maxPrice !== undefined && Number(maxPrice) < 0) ||
        (minPrice !== undefined &&
          maxPrice !== undefined &&
          Number(minPrice) > Number(maxPrice))
      ) {
        return res.status(400).json({
          message: "Invalid price range",
        });
      }
    }

    let sortOption = {};

    if (sort === "priceLowToHigh") {
      sortOption.price = 1;
    } else if (sort === "priceHighToLow") {
      sortOption.price = -1;
    } else if (sort === "newest") {
      sortOption.createdAt = -1;
    } else if (sort === "rating") {
      sortOption.averageRating = -1;
    } else if (sort === "discount") {
      sortOption.discountPercentage = -1;
    }

    const currentPage = Math.max(1, parseInt(page, 10) || 1);
    const perPage = Math.min(100, Math.max(1, parseInt(limit, 10) || 10));
    const skip = (currentPage - 1) * perPage;

    const totalProducts = await Product.countDocuments(filter);

    const products = await Product.find(filter)
      .sort(sortOption)
      .skip(skip)
      .limit(perPage);

    res.status(200).json({
      totalProducts,
      currentPage,
      totalPages: Math.ceil(totalProducts / perPage),
      productsPerPage: perPage,
      products,
    });
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};

// GET SINGLE PRODUCT BY ID WITH REAL BUYER COUNT AND RATING DISTRIBUTION
export const getProductById = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({
        message: "Product not found",
      });
    }

    const productObjectId = new mongoose.Types.ObjectId(req.params.id);

    const [buyersAgg, ratingAgg] = await Promise.all([
      Order.aggregate([
        {
          $match: {
            "items.product": productObjectId,
            orderStatus: { $nin: ["Cancelled", "Payment Failed"] },
            $or: [{ paymentMethod: "COD" }, { paymentStatus: "Paid" }],
          },
        },
        {
          $group: {
            _id: "$user",
          },
        },
        {
          $count: "totalBuyers",
        },
      ]),
      Review.aggregate([
        {
          $match: {
            product: productObjectId,
          },
        },
        {
          $group: {
            _id: "$rating",
            count: { $sum: 1 },
          },
        },
      ]),
    ]);

    const totalBuyers = buyersAgg[0]?.totalBuyers || 0;
    const ratingDistribution = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    for (const row of ratingAgg) {
      if (row._id >= 1 && row._id <= 5) {
        ratingDistribution[row._id] = row.count;
      }
    }

    const productObj = product.toObject();
    productObj.totalBuyers = totalBuyers;
    productObj.ratingDistribution = ratingDistribution;

    res.status(200).json(productObj);
  } catch (error) {
    res.status(400).json({
      message: "Invalid product ID",
    });
  }
};

export const updateProduct = async (req, res) => {
  try {
    const existing = await Product.findById(req.params.id);
    if (!existing) {
      return res.status(404).json({
        message: "Product not found",
      });
    }

    const mergedPricingInput = {
      ...req.body,
      price: req.body.price ?? existing.price,
      originalPrice: req.body.originalPrice ?? existing.originalPrice,
      discountPercentage:
        req.body.discountPercentage ?? existing.discountPercentage,
    };

    const payload = sanitizeProductPayload(mergedPricingInput, true);

    const product = await Product.findByIdAndUpdate(req.params.id, payload, {
      new: true,
      runValidators: true,
    });

    res.status(200).json({
      message: "Product updated successfully",
      product,
    });
  } catch (error) {
    res.status(400).json({
      message: error.message,
    });
  }
};

export const deleteProduct = async (req, res) => {
  try {
    const product = await Product.findByIdAndDelete(req.params.id);

    if (!product) {
      return res.status(404).json({
        message: "Product not found",
      });
    }

    res.status(200).json({
      message: "Product deleted successfully",
    });
  } catch (error) {
    res.status(400).json({
      message: error.message,
    });
  }
};
