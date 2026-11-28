import mongoose from "mongoose";

const deliveryPartnerSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Delivery partner name is required"],
      trim: true,
    },
    phone: {
      type: String,
      required: [true, "Delivery partner mobile number is required"],
      trim: true,
      unique: true,
    },
    vehicleInfo: {
      type: String,
      trim: true,
      default: "",
    },
    notes: {
      type: String,
      trim: true,
      default: "",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

const DeliveryPartner = mongoose.model("DeliveryPartner", deliveryPartnerSchema);
export default DeliveryPartner;
