import DeliveryPartner from "../models/deliveryPartner.model.js";
import { normalizePhoneNumber } from "../utils/sendSms.js";

export const getDeliveryPartners = async (req, res) => {
  try {
    const partners = await DeliveryPartner.find().sort({ createdAt: -1 });
    return res.status(200).json({
      totalPartners: partners.length,
      partners,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to fetch delivery partners",
      error: error.message,
    });
  }
};

export const createDeliveryPartner = async (req, res) => {
  try {
    const { name, phone, vehicleInfo, notes } = req.body;
    if (!name || !phone) {
      return res.status(400).json({
        message: "Partner name and mobile number are required",
      });
    }

    const normalizedPhone = normalizePhoneNumber(String(phone)) || String(phone).trim();

    const partner = await DeliveryPartner.create({
      name: String(name).trim(),
      phone: normalizedPhone,
      vehicleInfo: String(vehicleInfo || "").trim(),
      notes: String(notes || "").trim(),
    });

    return res.status(201).json({
      message: "Delivery partner created successfully",
      partner,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        message: "A delivery partner with this phone number already exists",
      });
    }
    return res.status(500).json({
      message: "Failed to create delivery partner",
      error: error.message,
    });
  }
};

export const updateDeliveryPartner = async (req, res) => {
  try {
    const { partnerId } = req.params;
    const { name, phone, vehicleInfo, notes, isActive } = req.body;

    const partner = await DeliveryPartner.findById(partnerId);
    if (!partner) {
      return res.status(404).json({
        message: "Delivery partner not found",
      });
    }

    if (name !== undefined && String(name).trim()) partner.name = String(name).trim();
    if (phone !== undefined && String(phone).trim()) {
      partner.phone =
        normalizePhoneNumber(String(phone)) || String(phone).trim();
    }
    if (vehicleInfo !== undefined) partner.vehicleInfo = String(vehicleInfo).trim();
    if (notes !== undefined) partner.notes = String(notes).trim();
    if (isActive !== undefined) partner.isActive = Boolean(isActive);

    await partner.save();

    return res.status(200).json({
      message: "Delivery partner updated successfully",
      partner,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        message: "A delivery partner with this phone number already exists",
      });
    }
    return res.status(500).json({
      message: "Failed to update delivery partner",
      error: error.message,
    });
  }
};

export const deleteDeliveryPartner = async (req, res) => {
  try {
    const { partnerId } = req.params;
    const partner = await DeliveryPartner.findByIdAndDelete(partnerId);
    if (!partner) {
      return res.status(404).json({
        message: "Delivery partner not found",
      });
    }
    return res.status(200).json({
      message: "Delivery partner deleted successfully",
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to delete delivery partner",
      error: error.message,
    });
  }
};
