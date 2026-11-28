import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateDeliveryCharge,
  normalizeProductPricing,
} from "../utils/pricing.js";
import { normalizePhoneNumber } from "../utils/sendSms.js";

test("calculateDeliveryCharge returns 30 below 200 and 0 at or above 200", () => {
  assert.equal(calculateDeliveryCharge(0), 0);
  assert.equal(calculateDeliveryCharge(150), 30);
  assert.equal(calculateDeliveryCharge(199), 30);
  assert.equal(calculateDeliveryCharge(200), 0);
  assert.equal(calculateDeliveryCharge(500), 0);
});

test("normalizeProductPricing keeps discounted price strictly below originalPrice when discounted", () => {
  const result = normalizeProductPricing({
    originalPrice: 1000,
    discountPercentage: 25,
  });
  assert.equal(result.originalPrice, 1000);
  assert.equal(result.price, 750);
  assert.equal(result.discountedPrice, 750);
  assert.equal(result.discountPercentage, 25);
  assert.ok(result.price < result.originalPrice);

  const fromSelling = normalizeProductPricing({
    price: 400,
    discountPercentage: 20,
  });
  assert.equal(fromSelling.originalPrice, 500);
  assert.equal(fromSelling.price, 400);
  assert.equal(fromSelling.discountPercentage, 20);
});

test("normalizePhoneNumber formats Indian 10-digit and E.164 numbers", () => {
  assert.equal(normalizePhoneNumber("9876543210"), "+919876543210");
  assert.equal(normalizePhoneNumber("+91 98765-43210"), "+919876543210");
  assert.equal(normalizePhoneNumber("123"), "");
});
