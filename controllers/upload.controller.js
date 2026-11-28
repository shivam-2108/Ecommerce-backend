import Product from "../models/products.model.js";
import cloudinary from "../config/cloudinary.js";

export const uploadProductImage = async (req, res) => {
  try {
    const { productId } = req.params;
    const append = req.query.append === "true" || req.body?.append === "true";

    if (!req.file) {
      return res.status(400).json({
        message: "Please select an image",
      });
    }

    const product = await Product.findById(productId);

    if (!product) {
      return res.status(404).json({
        message: "Product not found",
      });
    }

    const result = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: "ecommerce/products",
          resource_type: "image",
        },
        (error, uploadResult) => {
          if (error) {
            reject(error);
          } else {
            resolve(uploadResult);
          }
        }
      );

      stream.end(req.file.buffer);
    });

    const imageEntry = {
      url: result.secure_url,
      publicId: result.public_id || "",
    };

    if (!append || !product.image) {
      product.image = result.secure_url;
    }

    if (!Array.isArray(product.images)) {
      product.images = [];
    }

    if (append) {
      product.images.push(imageEntry);
    } else if (product.images.length === 0) {
      product.images.push(imageEntry);
    } else {
      product.images[0] = imageEntry;
    }

    await product.save();

    return res.status(200).json({
      message: "Product image uploaded successfully",
      image: product.image,
      images: product.images,
      product,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Image upload failed",
      error: error.message,
    });
  }
};
