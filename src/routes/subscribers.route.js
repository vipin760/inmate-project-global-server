import parentsubscriptionModel from "../models/inmateSubscription.model.js";
import { Location } from "../models/location.model.js";
import authenticateToken from "../middleware/auth.middleware.js";
import mongoose from "mongoose";
import inmateSubscriptionModel from "../models/inmateSubscription.model.js";
import inmatesubscriptionHistoryModel from "../models/inmatesubscriptionHistory.model.js";

export default async function subscriberFunction(fastify) {

    // ============================================================
    // 1️⃣ LOCATIONS + STATS
    // ============================================================

    fastify.get("/locations/stats", { preHandler: authenticateToken }, async (req, reply) => {
        try {
            const today = new Date();

            let {
                page = 1,
                limit = 10,
                search = "",
                sortField = "name",
                sortOrder = "asc"
            } = req.query;

            page = parseInt(page);
            limit = parseInt(limit);
            const skip = (page - 1) * limit;
            sortOrder = sortOrder === "asc" ? 1 : -1;

            const matchStage = {};
            if (search) {
                matchStage.$or = [
                    { name: { $regex: search, $options: "i" } },
                    { location: { $regex: search, $options: "i" } }
                ];
            }

            const stats = await Location.aggregate([
                { $match: matchStage },

                {
                    $lookup: {
                        from: "inmatesubscriptions",
                        let: { locationId: "$_id" },
                        pipeline: [
                            {
                                $match: {
                                    $expr: {
                                        $eq: ["$location_id", { $toString: "$$locationId" }]
                                    }
                                }
                            },
                            { $sort: { start_date: -1 } },
                            {
                                $group: {
                                    _id: "$inmateId",
                                    latestSub: { $first: "$$ROOT" }
                                }
                            }
                        ],
                        as: "subscription_details"
                    }
                },

                {
                    $addFields: {
                        total_inmates: { $size: "$subscription_details" },

                        total_subscriptions: {
                            $size: {
                                $filter: {
                                    input: "$subscription_details",
                                    as: "s",
                                    cond: { $eq: ["$$s.latestSub.payment_status", "SUCCESS"] }
                                }
                            }
                        },

                        active_subscriptions: {
                            $size: {
                                $filter: {
                                    input: "$subscription_details",
                                    as: "s",
                                    cond: {
                                        $and: [
                                            { $eq: ["$$s.latestSub.payment_status", "SUCCESS"] },
                                            { $eq: ["$$s.latestSub.is_active", true] },
                                            { $gte: ["$$s.latestSub.expire_date", today] }
                                        ]
                                    }
                                }
                            }
                        },

                        expired_subscriptions: {
                            $size: {
                                $filter: {
                                    input: "$subscription_details",
                                    as: "s",
                                    cond: {
                                        $and: [
                                            { $eq: ["$$s.latestSub.payment_status", "SUCCESS"] },
                                            { $lt: ["$$s.latestSub.expire_date", today] }
                                        ]
                                    }
                                }
                            }
                        },

                        total_revenue: {
                            $sum: {
                                $map: {
                                    input: "$subscription_details",
                                    as: "s",
                                    in: {
                                        $cond: [
                                            { $eq: ["$$s.latestSub.payment_status", "SUCCESS"] },
                                            { $toDouble: "$$s.latestSub.amount" },
                                            0
                                        ]
                                    }
                                }
                            }
                        }
                    }
                },

                { $project: { subscription_details: 0 } },
                { $sort: { [sortField]: sortOrder } },
                { $skip: skip },
                { $limit: limit }
            ]);

            const totalCount = await Location.countDocuments(matchStage);

            const summaryAgg = await inmateSubscriptionModel.aggregate([
                { $sort: { start_date: -1 } },
                {
                    $group: {
                        _id: "$inmateId",
                        latestSub: { $first: "$$ROOT" }
                    }
                },
                {
                    $group: {
                        _id: null,
                        total_inmates: { $sum: 1 },

                        total_subscriptions: {
                            $sum: {
                                $cond: [{ $eq: ["$latestSub.payment_status", "SUCCESS"] }, 1, 0]
                            }
                        },

                        active_subscriptions: {
                            $sum: {
                                $cond: [
                                    {
                                        $and: [
                                            { $eq: ["$latestSub.payment_status", "SUCCESS"] },
                                            { $eq: ["$latestSub.is_active", true] },
                                            { $gte: ["$latestSub.expire_date", today] }
                                        ]
                                    },
                                    1,
                                    0
                                ]
                            }
                        },

                        expired_subscriptions: {
                            $sum: {
                                $cond: [
                                    {
                                        $and: [
                                            { $eq: ["$latestSub.payment_status", "SUCCESS"] },
                                            { $lt: ["$latestSub.expire_date", today] }
                                        ]
                                    },
                                    1,
                                    0
                                ]
                            }
                        },

                        total_revenue: {
                            $sum: {
                                $cond: [
                                    { $eq: ["$latestSub.payment_status", "SUCCESS"] },
                                    { $toDouble: "$latestSub.amount" },
                                    0
                                ]
                            }
                        }
                    }
                }
            ]);

            const summary = {
                total_locations: await Location.countDocuments(),
                total_inmates: summaryAgg[0]?.total_inmates || 0,
                total_subscriptions: summaryAgg[0]?.total_subscriptions || 0,
                active_subscriptions: summaryAgg[0]?.active_subscriptions || 0,
                expired_subscriptions: summaryAgg[0]?.expired_subscriptions || 0,
                total_revenue: summaryAgg[0]?.total_revenue || 0
            };

            return reply.code(200).send({
                success: true,
                data: stats,
                summary,
                pagination: {
                    total: totalCount,
                    page,
                    limit,
                    pages: Math.ceil(totalCount / limit)
                }
            });

        } catch (err) {
            console.error(err);
            return reply.code(500).send({
                success: false,
                message: "Internal Server Error",
                error: err.message
            });
        }
    });

    fastify.get(
        "/location/:locationId",
        { preHandler: authenticateToken },
        async (request, reply) => {
            try {
                const { locationId } = request.params;
                const { page = 1, limit = 10, search = "", sortBy = "start_date", sortOrder = "desc" } = request.query;

                const skip = (parseInt(page) - 1) * parseInt(limit);
                const today = new Date();

                // Build search filter
                const matchFilter = {
                    location_id: locationId, // keep as string to match stored data
                    payment_status: "SUCCESS",
                    is_active: true,
                    expire_date: { $gte: today },
                };

                if (search) {
                    matchFilter.student_id = { $regex: search, $options: "i" }; // simple search by student_id, can be expanded
                }

                // Count total subscribers
                const total = await parentsubscriptionModel.countDocuments(matchFilter);

                // Fetch paginated subscribers
                const subscribers = await parentsubscriptionModel.aggregate([
                    { $match: { location_id: locationId, payment_status: "SUCCESS" } },
                    { $sort: { start_date: -1 } },
                    {
                        $group: {
                            _id: "$student_id",
                            latestSub: { $first: "$$ROOT" }
                        }
                    },
                    { $replaceRoot: { newRoot: "$latestSub" } },
                    { $match: { expire_date: { $gte: today } } }, // filter expired
                    { $skip: skip },
                    { $limit: parseInt(limit) },
                    {
                        $lookup: {
                            from: "locations",
                            let: { locId: "$location_id" },
                            pipeline: [
                                { $match: { $expr: { $eq: [{ $toString: "$_id" }, "$$locId"] } } },
                                { $project: { name: 1, baseUrl: 1, location: 1 } }
                            ],
                            as: "location"
                        }
                    },
                    { $unwind: "$location" },
                ]);


                const pages = Math.ceil(total / parseInt(limit));

                return reply.code(200).send({
                    success: true,
                    count: subscribers.length,
                    total,
                    page: parseInt(page),
                    limit: parseInt(limit),
                    pages,
                    data: subscribers
                });

            } catch (error) {
                console.error(error);
                return reply.code(500).send({
                    success: false,
                    message: "Internal Server Error",
                    error: error.message
                });
            }
        }
    );

    // ============================================================
    // 3️⃣ SUBSCRIPTION HISTORY BY STUDENT
    // ============================================================
    fastify.get(
        "/:inmateId/history",
        { preHandler: authenticateToken },
        async (request, reply) => {
            try {
                const { inmateId } = request.params;
                const {
                    page = 1,
                    limit = 10,
                    search = "",
                    sortBy = "activated_at",
                    sortOrder = "desc",
                } = request.query;

                const skip = (page - 1) * limit;

                const filter = { inmateId };

                if (search) {
                    filter.$or = [
                        { subscription_type: { $regex: search, $options: "i" } },
                        { payment_status: { $regex: search, $options: "i" } },
                        { razorpay_order_id: { $regex: search, $options: "i" } },
                    ];
                }

                const total = await inmatesubscriptionHistoryModel.countDocuments(filter);

                const history = await inmatesubscriptionHistoryModel.find(filter)
                    .sort({ [sortBy]: sortOrder === "asc" ? 1 : -1 })
                    .skip(skip)
                    .limit(Number(limit))
                    .lean();

                return reply.send({
                    success: true,
                    count: history.length,
                    total,
                    page: Number(page),
                    limit: Number(limit),
                    pages: Math.ceil(total / limit),
                    data: history,
                });
            } catch (err) {
                console.error(err);
                reply.code(500).send({
                    success: false,
                    message: "Internal Server Error",
                });
            }
        }
    );

}
