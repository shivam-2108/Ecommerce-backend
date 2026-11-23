import mongoose from "mongoose";
import Review from "../models/review.model.js";
import Product from "../models/products.model.js";


const updateProductRating = async (productId) => {
    try {
        const result = await Review.aggregate([
            {
                $match: {
                    product: new mongoose.Types.ObjectId(productId)
                }
            },
            {
                $group: {
                    _id: "$product",
                    averageRating: { $avg: "$rating" },
                    numReviews: { $sum: 1 }
                }
            }
        ]);

        const averageRating = result.length > 0
            ? Number(result[0].averageRating.toFixed(1))
            : 0;

        const numReviews = result.length > 0
            ? result[0].numReviews
            : 0;

        await Product.findByIdAndUpdate(productId, {
            averageRating,
            numReviews
        });

    } catch (error) {
        throw error;
    }
};


// ADD PRODUCT REVIEW
export const addReview = async (req, res) => {
    try {
        const { rating, comment } = req.body;
        const { productId } = req.params;

        // Validate required fields
        if (!rating || !comment) {
            return res.status(400).json({
                message: "Please provide rating and comment"
            });
        }

        // Validate rating
        if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
            return res.status(400).json({
                message: "Rating must be between 1 and 5"
            });
        }

        // Validate comment
        if (typeof comment !== "string" || !comment.trim()) {
            return res.status(400).json({
                message: "Comment cannot be empty"
            });
        }

        // Check product exists
        const product = await Product.findById(productId);

        if (!product) {
            return res.status(404).json({
                message: "Product not found"
            });
        }

        // Check if user already reviewed this product
        const existingReview = await Review.findOne({
            user: req.user._id,
            product: productId
        });

        if (existingReview) {
            return res.status(409).json({
                message: "You have already reviewed this product"
            });
        }

        // Create review
        const review = await Review.create({
            user: req.user._id,
            product: productId,
            rating,
            comment: comment.trim()
        });

        await updateProductRating(productId);

        return res.status(201).json({
            message: "Review added successfully",
            review
        });

    } catch (error) {
        // Handle duplicate review race condition
        if (error.code === 11000) {
            return res.status(409).json({
                message: "You have already reviewed this product"
            });
        }

        return res.status(500).json({
            message: "Failed to add review",
            error: error.message
        });
    }
};



// GET ALL REVIEWS OF A PRODUCT
export const getProductReviews = async (req, res) => {
    try {
        const { productId } = req.params;

        const product = await Product.findById(productId);

        if (!product) {
            return res.status(404).json({
                message: "Product not found"
            });
        }

        const reviews = await Review.find({ product: productId })
            .populate("user", "name")
            .sort({ createdAt: -1 });

        return res.status(200).json({
            message: "Reviews fetched successfully",
            totalReviews: reviews.length,
            reviews
        });

    } catch (error) {
        return res.status(500).json({
            message: "Failed to fetch reviews",
            error: error.message
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
                message: "Please provide rating or comment"
            });
        }

        if (rating !== undefined &&
            (!Number.isInteger(rating) || rating < 1 || rating > 5)) {
            return res.status(400).json({
                message: "Rating must be between 1 and 5"
            });
        }

        if (comment !== undefined &&
            (typeof comment !== "string" || !comment.trim())) {
            return res.status(400).json({
                message: "Comment cannot be empty"
            });
        }

        const review = await Review.findOne({
            _id: reviewId,
            user: req.user._id
        });

        if (!review) {
            return res.status(404).json({
                message: "Review not found or unauthorized"
            });
        }

        if (rating !== undefined) review.rating = rating;
        if (comment !== undefined) review.comment = comment.trim();

        await review.save();

        return res.status(200).json({
            message: "Review updated successfully",
            review
        });

    } catch (error) {
        return res.status(500).json({
            message: "Failed to update review",
            error: error.message
        });
    }
};



// DELETE OWN REVIEW
export const deleteReview = async (req, res) => {
    try {
        const { reviewId } = req.params;

        const review = await Review.findOne({
            _id: reviewId,
            user: req.user._id
        });

        if (!review) {
            return res.status(404).json({
                message: "Review not found or unauthorized"
            });
        }

        await Review.findByIdAndDelete(reviewId);

        await updateProductRating(review.product);

        return res.status(200).json({
            message: "Review deleted successfully"
        });

    } catch (error) {
        return res.status(500).json({
            message: "Failed to delete review",
            error: error.message
        });
    }
};

