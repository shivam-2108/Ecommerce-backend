export const FREE_DELIVERY_THRESHOLD = 200;
export const STANDARD_DELIVERY_CHARGE = 30;

/**
 * Compute delivery fee based on discounted items subtotal.
 * Orders of Rs. 200 or more qualify for free delivery; below Rs. 200 is Rs. 30.
 */
export function calculateDeliveryCharge(itemsSubtotal) {
  const subtotal = Math.max(0, Number(itemsSubtotal) || 0);
  if (subtotal === 0) return 0;
  return subtotal >= FREE_DELIVERY_THRESHOLD ? 0 : STANDARD_DELIVERY_CHARGE;
}

/**
 * Normalize product pricing fields so originalPrice, discountedPrice/price,
 * and discountPercentage remain consistent and valid.
 */
export function normalizeProductPricing({
  price,
  discountedPrice,
  originalPrice,
  discountPercentage,
}) {
  let sellingPrice = Number(discountedPrice ?? price);
  let mrp = originalPrice !== undefined && originalPrice !== "" ? Number(originalPrice) : undefined;
  let pct =
    discountPercentage !== undefined && discountPercentage !== ""
      ? Number(discountPercentage)
      : undefined;

  if (!Number.isFinite(sellingPrice) || sellingPrice < 0) {
    sellingPrice = 0;
  }

  // Case 1: MRP and discount percentage given, compute selling price when price wasn't explicitly lowered
  if (Number.isFinite(mrp) && mrp > 0 && Number.isFinite(pct) && pct >= 0 && pct <= 90) {
    if (discountedPrice === undefined && (price === undefined || Number(price) === mrp)) {
      sellingPrice = Math.max(1, Math.round(mrp * (1 - pct / 100)));
    }
  }

  // Case 2: MRP given and sellingPrice < MRP -> derive percentage
  if (Number.isFinite(mrp) && mrp > sellingPrice && sellingPrice > 0) {
    pct = Math.max(1, Math.min(90, Math.round(((mrp - sellingPrice) / mrp) * 100)));
  } else if (Number.isFinite(pct) && pct >= 5 && pct <= 90 && sellingPrice > 0) {
    // Derive MRP from sellingPrice and discount percentage
    mrp = Math.max(sellingPrice + 1, Math.round(sellingPrice / (1 - pct / 100)));
    pct = Math.round(((mrp - sellingPrice) / mrp) * 100);
  } else {
    // Default realistic discount between 10% and 35% if none supplied on new product
    const defaultPct = Number.isFinite(pct) && pct > 0 ? Math.min(90, pct) : 0;
    if (defaultPct > 0 && sellingPrice > 0) {
      mrp = Math.max(sellingPrice + 1, Math.round(sellingPrice / (1 - defaultPct / 100)));
      pct = Math.round(((mrp - sellingPrice) / mrp) * 100);
    } else {
      mrp = Number.isFinite(mrp) && mrp >= sellingPrice ? mrp : sellingPrice;
      pct = mrp > sellingPrice ? Math.round(((mrp - sellingPrice) / mrp) * 100) : 0;
    }
  }

  if (mrp > 0 && sellingPrice >= mrp && pct > 0) {
    sellingPrice = Math.max(1, Math.round(mrp * (1 - pct / 100)));
  }

  return {
    originalPrice: Math.round(mrp),
    price: Math.round(sellingPrice),
    discountedPrice: Math.round(sellingPrice),
    discountPercentage: Math.round(pct),
  };
}
