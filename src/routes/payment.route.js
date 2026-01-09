import { request } from "http";
import { createOrder } from "../services/razorpay.service.js";
import crypto from 'crypto'
import { Location } from "../models/location.model.js";
import inmateSubscriptionModel from "../models/inmateSubscription.model.js";
import inmatesubscriptionHistoryModel from "../models/inmatesubscriptionHistory.model.js";
import calculateExpiry from "../utils/getExpirydate.js";

export default async function paymentFunction(fastify) {
    fastify.post('/create', async (request, reply) => {
        try {
            const { amount, shortReceipt, inmateData, locationId, subscription_type, inmate_info,month } = request.body;

            const inmateId = inmateData._id;
            const today = new Date();

            // STUDENT DATA
            const inmate_data = {
                _id: inmate_info._id,
                inmateId: inmate_info.inmateId,
                inmate_name: inmate_info.firstName,
                inmate_lastName: inmate_info.lastName,
                custodyType: inmate_info.custodyType,
                cellNumber: inmate_info.cellNumber,
                balance: inmate_info.balance,
                user_id: inmate_info.user_id,
                date_of_birth: inmate_info.dateOfBirth,
                admissionDate: inmate_info.admissionDate,
                crimeType: inmate_info.crimeType,
                status: inmate_info.status,
                is_blocked: inmate_info.is_blocked,
                location_id: inmate_info.location_id,
                phonenumber:inmate_info.phonenumber
            }

            // 1️⃣ Check if valid active subscription exists
            const activeSub = await inmateSubscriptionModel.findOne({
                inmateId: inmateId,
                payment_status: "SUCCESS",
                is_active: true,
                expire_date: { $gte: today } // expire future
            });

            if (activeSub) {
                // Calculate remaining days
                const diffMs = new Date(activeSub.expire_date) - today;
                const remainingDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

                return reply.code(200).send({
                    success: true,
                    subscription: true,
                    message: `You already have an active subscription. ${remainingDays} day(s) remaining.`,
                    subscription: activeSub
                });
            }

            // 2️⃣ No active plan → Create order
            const locationData = await Location.findById(locationId)

            // const order = await createOrder(locationData?.amount || 100, shortReceipt);
            const order = await createOrder(amount || 100, shortReceipt);

            const orderData = {
                inmateId: inmateId,
                location_id: locationId,
                subscription_type,
                amount,
                razorpay_order_id: order.id,
                inmate_info: inmate_data,
                subscription_months:Number(month)
            };

            const data = await inmateSubscriptionModel.create(orderData)

            return reply.code(200).send({
                success: true,
                order
            });

        } catch (error) {
            console.log("<><>error",error)
            return reply.code(500).send({
                status: false,
                message: "Internal Server Error",
                error: error.message
            });
        }
    });

    fastify.post('/verify', async (request, reply) => {
        try {
            const {
                razorpay_order_id,
                razorpay_payment_id,
                razorpay_signature,
                month
            } = request.body;

            // 🔴 Validate input
            if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
                return reply.code(400).send({
                    success: false,
                    message: "Missing Razorpay verification fields"
                });
            }

            // 🔐 Verify Razorpay signature
            const body = `${razorpay_order_id}|${razorpay_payment_id}`;
            const expectedSignature = crypto
                .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
                .update(body)
                .digest("hex");

            const today = new Date();

            // 🔍 Fetch MASTER subscription
            const master = await inmateSubscriptionModel.findOne({
                razorpay_order_id
            });

            if (!master) {
                return reply.code(404).send({
                    success: false,
                    message: "Subscription record not found"
                });
            }

            // const expire = getExpiryDate(master.subscription_type);
            const expire = calculateExpiry(today, Number(month));


            // ❌ Signature mismatch → FAILED
            if (expectedSignature !== razorpay_signature) {
                master.payment_status = "FAILED";
                master.razorpay_payment_id = razorpay_payment_id;
                await master.save();

                await inmatesubscriptionHistoryModel.create({
                    inmateId: master.inmateId,
                    location_id: master.location_id,
                    subscription_type: master.subscription_type,
                    amount: master.amount,
                    payment_status: "FAILED",
                    activated_at: today,
                    expired_at: expire,
                    razorpay_order_id,
                    razorpay_payment_id
                });

                return reply.code(400).send({
                    success: false,
                    message: "Invalid payment signature"
                });
            }

            // ✅ SUCCESS → Activate subscription
            master.payment_status = "SUCCESS";
            master.razorpay_payment_id = razorpay_payment_id;
            master.is_active = true;
            master.start_date = today;
            master.expire_date = expire;
            master.subscription_months = Number(month);
            await master.save();

            // 🧾 HISTORY (SUCCESS)
            await inmatesubscriptionHistoryModel.create({
                inmateId: master.inmateId,
                location_id: master.location_id,
                subscription_type: master.subscription_type,
                amount: master.amount,
                payment_status: "SUCCESS",
                activated_at: today,
                expired_at: expire,
                razorpay_order_id,
                razorpay_payment_id
            });

            return reply.code(200).send({
                success: true,
                message: "Payment verified and inmate subscription activated",
                subscription: master
            });

        } catch (error) {
            console.error("❌ verify error:", error);

            return reply.code(500).send({
                success: false,
                message: "Internal Server Error",
                error: error.message
            });
        }
    });


    fastify.put('/update', async (request, reply) => {
        try {
            const { studentId } = request.body
            await parentsubscriptionModel.updateOne({ student_id: studentId }, { is_active: false })
            return reply.code(200).send(true)
        } catch (error) {
            return reply
                .code(500)
                .send({ status: false, message: "Internal Server Error", error: error.message });
        }
    })

}