import Cart from "../models/cart.model.js"
import Product from "../models/products.model.js"

//1.add product to cart
export const addToCart = async (req, res) => {
    try {
        const { productId, quantity = 1 } = req.body;

        if (!productId || !Number.isInteger(quantity) || quantity < 1) {
            return res.status(400).json({
                message: "Valid productId and quantity are required",
            });
        }

        // Check whether product exists
        const product = await Product.findById(productId);

        if (!product) {
            return res.status(404).json({
                message: "Product not found",
            });
        }

        // Check whether product is in stock
        if (product.stock < quantity) {
            return res.status(400).json({
                message: `Only ${product.stock} items available in stock`,
            });
        }

        // Get logged-in user's cart
        let cart = await Cart.findOne({ user: req.user._id });

        if (!cart) {
            cart = new Cart({
                user: req.user._id,
                items: [],
            });
        }

        // Check whether product is already in cart
        const itemIndex = cart.items.findIndex(
            (item) => item.product.toString() === productId
        );

        if (itemIndex > -1) {

            const newQuantity =
                cart.items[itemIndex].quantity + quantity;

            // Check total cart quantity against stock
            if (newQuantity > product.stock) {
                return res.status(400).json({
                    message: `Only ${product.stock} items available in stock`,
                });
            }

            cart.items[itemIndex].quantity = newQuantity;

        } else {
            cart.items.push({
                product: productId,
                quantity,
            });
        }

        await cart.save();

        return res.status(200).json({
            message: "Product added to cart successfully",
            cart,
        });

    } catch (error) {
        return res.status(500).json({
            message: error.message,
        });
    }
};

//2. get user's cart

export const getCart = async (req, res) => {
    try {
        const cart = await Cart.findOne({
            user: req.user._id,
        }).populate("items.product"); // populate se productId se pura product details nikalna

        if (!cart) {
            return res.status(200).json({
                message: "Cart is empty",
                items: [],
            });
        }
        return res.status(200).json(cart);  // cart ka data user ko bejh do
    } catch (error) {
        return res.status(500).json({
            message: error.message,
        });
    }
};

// 3. Update product quantity
export const updateCartItem = async (req, res) => {
    try {
        const { productId, quantity } = req.body;

        if (!productId || !Number.isInteger(quantity) || quantity < 1) {
            return res.status(400).json({
                message: "Valid productId and quantity are required",
            });
        }
        const cart = await Cart.findOne({
            user: req.user._id,
        });

        if (!cart) {
            return res.status(404).json({
                message: "Cart not found",
            });
        }

        const item = cart.items.find(
            (item) => item.product.toString() === productId
        );
        if (!item) {
            return res.status(404).json({
                message: "Product not found in cart",
            });
        }
        item.quantity = quantity;
        await cart.save(); //mongoDB me save krne ke liye
        return res.status(200).json({
            message: "Cart quantity updated successfully",
            cart,
        });
    } catch (error) {
        return res.status(500).json({
            message: error.message,
        });
    }
};

// 4. Remove product from cart
export const removeFromCart = async (req, res) => {
    try {
        const { productId } = req.params;

        const cart =await Cart.findOne({
            user: req.user._id,
        });
        if (!cart) {
            return res.status(404).json({
                message: "Cart not found",
            });
        }
        const initialLength = cart.items.length;
        cart.items = cart.items.filter((item) => item.product.toString() !== productId   //filter se product remove hota hai
        );
        if (cart.items.length === initialLength) {
            return res.status(404).json({
                message: "Product not found in cart",
            });
        }
        await cart.save();

        return res.status(200).json({
            message: "Product removed from cart successfully",
            cart,
        });
    } catch (error) {
        return res.status(500).json({
            message: error.message,
        });
    }
};