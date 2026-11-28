import mongoose from "mongoose";
import Review from "../models/review.model.js";
import Product from "../models/products.model.js";
import Order from "../models/order.model.js";

export const updateProductRating = async (productId) => {
  const result = await Review.aggregate([
    {
      $match: {
        product: new mongoose.Types.ObjectId(productId),
      },
    },
    {
      $group: {
        _id: "$product",
        averageRating: { $avg: "$rating" },
        numReviews: { $sum: 1 },
      },
    },
  ]);

  const averageRating =
    result.length > 0 ? Number(result[0].averageRating.toFixed(1)) : 0;

  const numReviews = result.length > 0 ? result[0].numReviews : 0;

  await Product.findByIdAndUpdate(productId, {
    averageRating,
    numReviews,
  });

  return { averageRating, numReviews };
};

async function findVerifiedPurchaseOrder(userId, productId) {
  return Order.findOne({
    user: userId,
    "items.product": productId,
    orderStatus: { $nin: ["Cancelled", "Payment Failed"] },
    $or: [{ paymentMethod: "COD" }, { paymentStatus: "Paid" }],
  }).sort({ createdAt: -1 });
}

// ADD PRODUCT REVIEW (AUTHENTICATED PURCHASERS ONLY)
export const addReview = async (req, res) => {
  try {
    const { rating, comment } = req.body;
    const { productId } = req.params;

    if (!rating || !comment) {
      return res.status(400).json({
        message: "Please provide rating and comment",
      });
    }

    if (!Number.isInteger(Number(rating)) || Number(rating) < 1 || Number(rating) > 5) {
      return res.status(400).json({
        message: "Rating must be between 1 and 5",
      });
    }

    if (typeof comment !== "string" || !comment.trim()) {
      return res.status(400).json({
        message: "Comment cannot be empty",
      });
    }

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({
        message: "Product not found",
      });
    }

    const purchaseOrder = await findVerifiedPurchaseOrder(req.user._id, productId);
    if (!purchaseOrder) {
      return res.status(403).json({
        message: "Only customers who have purchased this product can write a review",
      });
    }

    const existingReview = await Review.findOne({
      user: req.user._id,
      product: productId,
    });

    if (existingReview) {
      return res.status(409).json({
        message: "You have already reviewed this product",
      });
    }

    const review = await Review.create({
      user: req.user._id,
      product: productId,
      order: purchaseOrder._id,
      rating: Number(rating),
      comment: comment.trim(),
      isVerifiedPurchase: true,
    });

    await updateProductRating(productId);

    const populated = await Review.findById(review._id).populate("user", "name");

    return res.status(201).json({
      message: "Review added successfully",
      review: populated,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        message: "You have already reviewed this product",
      });
    }

    return res.status(500).json({
      message: "Failed to add review",
      error: error.message,
    });
  }
};

// GET ALL REVIEWS OF A PRODUCT + DISTRIBUTION + PURCHASE ELIGIBILITY
export const getProductReviews = async (req, res) => {
  try {
    const { productId } = req.params;

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({
        message: "Product not found",
      });
    }

    const reviews = await Review.find({ product: productId })
      .populate("user", "name")
      .sort({ createdAt: -1 });

    const ratingDistribution = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    let ratingSum = 0;
    for (const r of reviews) {
      if (r.rating >= 1 && r.rating <= 5) {
        ratingDistribution[r.rating] += 1;
        ratingSum += r.rating;
      }
    }

    const averageRating =
      reviews.length > 0 ? Number((ratingSum / reviews.length).toFixed(1)) : 0;

    let hasPurchased = false;
    let canReview = false;
    if (req.user) {
      const order = await findVerifiedPurchaseOrder(req.user._id, productId);
      hasPurchased = Boolean(order);
      const alreadyReviewed = reviews.some(
        (r) => String(r.user?._id || r.user) === String(req.user._id)
      );
      canReview = hasPurchased && !alreadyReviewed;
    }

    return res.status(200).json({
      message: "Reviews fetched successfully",
      totalReviews: reviews.length,
      averageRating,
      ratingDistribution,
      hasPurchased,
      canReview,
      reviews,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to fetch reviews",
      error: error.message,
    });
  }
};

// UPDATE OWN REVIEW
export const updateReview = async (req, res) => {
  try {
    const { reviewId } = req.params;
    const { rating, comment } = req.body;

    if (rating === undefined && comment === undefined) {
      return res.status(400).json({
        message: "Please provide rating or comment",
      });
    }

    if (
      rating !== undefined &&
      (!Number.isInteger(Number(rating)) || Number(rating) < 1 || Number(rating) > 5)
    ) {
      return res.status(400).json({
        message: "Rating must be between 1 and 5",
      });
    }

    if (
      comment !== undefined &&
      (typeof comment !== "string" || !comment.trim())
    ) {
      return res.status(400).json({
        message: "Comment cannot be empty",
      });
    }

    const review = await Review.findOne({
      _id: reviewId,
      user: req.user._id,
    });

    if (!review) {
      return res.status(404).json({
        message: "Review not found or unauthorized",
      });
    }

    if (rating !== undefined) review.rating = Number(rating);
    if (comment !== undefined) review.comment = comment.trim();

    await review.save();
    await updateProductRating(review.product);

    const populated = await Review.findById(review._id).populate("user", "name");

    return res.status(200).json({
      message: "Review updated successfully",
      review: populated,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to update review",
      error: error.message,
    });
  }
};

// DELETE OWN REVIEW
export const deleteReview = async (req, res) => {
  try {
    const { reviewId } = req.params;

    const review = await Review.findOne({
      _id: reviewId,
      user: req.user._id,
    });

    if (!review) {
      return res.status(404).json({
        message: "Review not found or unauthorized",
      });
    }

    await Review.findByIdAndDelete(reviewId);
    await updateProductRating(review.product);

    return res.status(200).json({
      message: "Review deleted successfully",
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to delete review",
      error: error.message,
    });
  }
};

// TOGGLE HELPFUL VOTE ON A REVIEW
export const toggleHelpfulReview = async (req, res) => {
  try {
    const { reviewId } = req.params;
    const review = await Review.findById(reviewId);

    if (!review) {
      return res.status(404).json({
        message: "Review not found",
      });
    }

    const userId = String(req.user._id);
    const index = (review.helpfulVotes || []).findIndex(
      (id) => String(id) === userId
    );

    let voted = false;
    if (index > -1) {
      review.helpfulVotes.splice(index, 1);
      voted = false;
    } else {
      review.helpfulVotes.push(req.user._id);
      voted = true;
    }

    review.helpfulCount = review.helpfulVotes.length;
    await review.save();

    return res.status(200).json({
      message: voted ? "Marked review as helpful" : "Removed helpful vote",
      helpfulCount: review.helpfulCount,
      voted,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to update helpful vote",
      error: error.message,
    });
  }
};
