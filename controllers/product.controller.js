
import Product from "../models/products.model.js";

// CREATE PRODUCT
export const createProduct = async (req, res) => {
  try {
    const product = await Product.create(req.body);

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

    // Build filter object
    const filter = {};

    // Search by product name
    if (search) {
      filter.name = {
        $regex: search,
        $options: "i",
      };
    }

    // Category filter
    if (category) {
      filter.category = category;
    }

    // Price filter
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
        (minPrice !== undefined && maxPrice !== undefined &&
          Number(minPrice) > Number(maxPrice))
      ) {
        return res.status(400).json({
          message: "Invalid price range",
        });
      }
    }

    // Sorting
    let sortOption = {};

    if (sort === "priceLowToHigh") {
      sortOption.price = 1;
    } else if (sort === "priceHighToLow") {
      sortOption.price = -1;
    } else if (sort === "newest") {
      sortOption.createdAt = -1;
    }

    // Pagination
    const currentPage = Math.max(1, parseInt(page, 10) || 1);
    const perPage = Math.min(
      100,
      Math.max(1, parseInt(limit, 10) || 10)
    );

    const skip = (currentPage - 1) * perPage;

    // Count matching products
    const totalProducts = await Product.countDocuments(filter);

    // Fetch products
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


// GET SINGLE PRODUCT BY ID
export const getProductById = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({
        message: "Product not found",
      });
    }

    res.status(200).json(product);

  } catch (error) {
    res.status(400).json({
      message: "Invalid product ID",
    });
  }
};


export const updateProduct = async (req, res) => {
  try {
    const product = await Product.findByIdAndUpdate(
      req.params.id,
      req.body,
      {
        new: true,
        runValidators: true,
      }
    );

    if (!product) {
      return res.status(404).json({
        message: "Product not found",
      });
    }

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
    const product = await Product.findByIdAndDelete(
      req.params.id
    );

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
