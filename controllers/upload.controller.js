
import Product from "../models/products.model.js";
import cloudinary from "../config/cloudinary.js";

export const uploadProductImage = async (req, res) => {
    try {
        const { productId } = req.params;

        if (!req.file) {
            return res.status(400).json({
                message: "Please select an image"
            });
        }

        const product = await Product.findById(productId);

        if (!product) {
            return res.status(404).json({
                message: "Product not found"
            });
        }

        const result = await new Promise((resolve, reject) => {
            const stream = cloudinary.uploader.upload_stream(
                {
                    folder: "ecommerce/products",
                    resource_type: "image"
                },
                (error, result) => {
                    if (error) {
                        reject(error);
                    } else {
                        resolve(result);
                    }
                }
            );

            stream.end(req.file.buffer);
        });

        product.image = result.secure_url;
        await product.save();

        return res.status(200).json({
            message: "Product image uploaded successfully",
            image: product.image,
            product
        });

    } catch (error) {
        return res.status(500).json({
            message: "Image upload failed",
            error: error.message
        });
    }
};
