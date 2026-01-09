import mongoose from "mongoose";

const InmateSnapshotSchema = new mongoose.Schema(
  {
    _id: mongoose.Schema.Types.ObjectId,
    inmateId: String,
    inmate_name: String,
    inmate_lastName: String,
    custodyType: String,
    cellNumber: String,
    balance: Number,
    location_id: mongoose.Schema.Types.ObjectId,
    user_id: mongoose.Schema.Types.ObjectId,
    subscription: Boolean,
    admissionDate: String,
    crimeType: String,
    status: String,
    is_blocked: Boolean,
    date_of_birth: Date,
    contact_number: String,
    gender: String,
    nationality: String,
    blood_group: String,
    phonenumber:String,
  },
  { _id: false }
);


const InmateSubscriptionSchema = new mongoose.Schema(
  {
    inmateId: {
      type: String
    },
    location_id: {
      type: String,
      ref: "Location",
      required: true
    },
    subscription_type: {
      type: String
    },
    subscription_months: {
      type: Number,
      enum: [1, 3, 6, 12],
      required: true
    },

    razorpay_order_id: {
      type: String,
      required: true
    },

    razorpay_payment_id: {
      type: String,
    },

    payment_status: {
      type: String,
      enum: ["PENDING", "SUCCESS", "FAILED"],
      default: "PENDING"
    },

    start_date: {
      type: Date,
      default: Date.now
    },

    expire_date: {
      type: Date
    },

    is_active: {
      type: Boolean,
      default: false
    },
    amount: {
      type: Number,
      required: true
    },
    inmate_info: InmateSnapshotSchema
  },
  {
    timestamps: true
  }
);

export default mongoose.model("InmateSubscription", InmateSubscriptionSchema);
