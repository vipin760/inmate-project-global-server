import mongoose from "mongoose";

const locationSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    baseUrl:{type:String},
    location:{type:String},
    subscription_amount:{type:Number},
    subscriptionPlans: {
      monthly: {
        type: Number
      },
      quarterly: {        // 3 months
        type: Number
      },
      halfYearly: {       // 6 months
        type: Number
      },
      yearly: {
        type: Number
      }
    }
  },
  { timestamps: true }
);

export const Location = mongoose.model("Location", locationSchema);
