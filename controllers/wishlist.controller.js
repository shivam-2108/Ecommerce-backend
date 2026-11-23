
import Wishlist from "../models/wishlist.model.js";
import Product from "../models/products.model.js";

// ADD PRODUCT TO WISHLIST
export const addToWishlist = async (req, res) => {
    try {
        const { productId } = req.body;

        // Check productId
        if (!productId) {
            return res.status(400).json({
                message: "Please provide product ID"
            });
        }

        // Check product exists
        const product = await Product.findById(productId);

        if (!product) {
            return res.status(404).json({
                message: "Product not found"
            });
        }

        // Find user's wishlist
        let wishlist = await Wishlist.findOne({
            user: req.user._id
        });

        // Create wishlist if it does not exist
        if (!wishlist) {
            wishlist = await Wishlist.create({
                user: req.user._id,
                products: [productId]
            });

            return res.status(201).json({
                message: "Product added to wishlist successfully",
                wishlist
            });
        }

        // Check duplicate product
        if (wishlist.products.some(
            id => id.toString() === productId
        )) {
            return res.status(409).json({
                message: "Product already exists in wishlist"
            });
        }

        // Add product
        wishlist.products.push(productId);

        await wishlist.save();

        return res.status(200).json({
            message: "Product added to wishlist successfully",
            wishlist
        });

    } catch (error) {
        return res.status(500).json({
            message: "Failed to add product to wishlist",
            error: error.message
        });
    }
};


// GET MY WISHLIST
export const getMyWishlist = async (req, res) => {
    try {
        const wishlist = await Wishlist.findOne({
            user: req.user._id
        }).populate("products");

        if (!wishlist) {
            return res.status(200).json({
                message: "Wishlist is empty",
                wishlist: []
            });
        }

        return res.status(200).json({
            message: "Wishlist fetched successfully",
            totalProducts: wishlist.products.length,
            wishlist: wishlist.products
        });

    } catch (error) {
        return res.status(500).json({
            message: "Failed to fetch wishlist",
            error: error.message
        });
    }
};



// REMOVE PRODUCT FROM WISHLIST
export const removeFromWishlist = async (req, res) => {
    try {
        const { productId } = req.params;

        const wishlist = await Wishlist.findOne({
            user: req.user._id
        });

        if (!wishlist) {
            return res.status(404).json({
                message: "Wishlist not found"
            });
        }

        const productExists = wishlist.products.some(
            id => id.toString() === productId
        );

        if (!productExists) {
            return res.status(404).json({
                message: "Product not found in wishlist"
            });
        }

        wishlist.products = wishlist.products.filter(
            id => id.toString() !== productId
        );

        await wishlist.save();

        return res.status(200).json({
            message: "Product removed from wishlist successfully",
            wishlist
        });

    } catch (error) {
        return res.status(500).json({
            message: "Failed to remove product from wishlist",
            error: error.message
        });
    }
};


// CLEAR ENTIRE WISHLIST
export const clearWishlist = async (req, res) => {
    try {
        const wishlist = await Wishlist.findOne({
            user: req.user._id
        });

        if (!wishlist) {
            return res.status(404).json({
                message: "Wishlist not found"
            });
        }

        wishlist.products = [];

        await wishlist.save();

        return res.status(200).json({
            message: "Wishlist cleared successfully",
            wishlist
        });

    } catch (error) {
        return res.status(500).json({
            message: "Failed to clear wishlist",
            error: error.message
        });
    }
};
