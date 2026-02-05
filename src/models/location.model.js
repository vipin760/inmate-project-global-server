import mongoose from "mongoose";

const locationSchema = new mongoose.Schema(
  {
    externalId: {
      type: String,
      required: true,
      unique: true,
      index: true
    },

    name: {
      type: String,
      required: true,
      trim: true
    },

    location: {
      type: String,
      required: true,
      trim: true
    },

    baseUrl: {
      type: String,
      required: true
    },

    subscription_amount: {
      type: Number,
      default: 300
    },

    subscriptionPlans: {
      monthly: Number,
      quarterly: Number,
      halfYearly: Number,
      yearly: Number
    }
  },
  { timestamps: true }
);

export const Location = mongoose.model("Location", locationSchema);
