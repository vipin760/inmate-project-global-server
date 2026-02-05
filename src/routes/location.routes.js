import { Location } from "../models/location.model.js";

export default async function locationRoutes(fastify) {
    // Get all locations
    fastify.get("/", async (request, reply) => {
        try {
            const {
                search = "",       // for name or location search
                page = 1,
                limit = 10,
                sort_by = "createdAt",
                sort_order = "desc",
                baseUrl,           // optional filter
                location           // optional filter
            } = request.query;

            // 🧠 Build dynamic filter
            const filter = {};

            if (search) {
                filter.$or = [
                    { name: { $regex: search, $options: "i" } },
                    { location: { $regex: search, $options: "i" } },
                    { baseUrl: { $regex: search, $options: "i" } }
                ];
            }

            if (baseUrl) filter.baseUrl = baseUrl;
            if (location) filter.location = location;

            // ⚙️ Sorting
            const sortOptions = { [sort_by]: sort_order === "asc" ? 1 : -1 };

            // 🔢 Pagination
            const skip = (parseInt(page) - 1) * parseInt(limit);
            const total = await Location.countDocuments(filter);
            const locations = await Location.find(filter)
                .sort(sortOptions)
                .skip(skip)
                .limit(parseInt(limit));

            return reply.code(200).send({
                status: true,
                message: "Locations fetched successfully",
                data: locations,
                pagination: {
                    total,
                    page: parseInt(page),
                    limit: parseInt(limit),
                    totalPages: Math.ceil(total / limit)
                }
            });
        } catch (error) {
            fastify.log.error(error);
            return reply.code(500).send({
                status: false,
                message: "Failed to fetch locations",
                error: error.message
            });
        }
    });

    // Add location
    fastify.post("/", async (req, reply) => {
        try {
            const { externalId, name, location, baseUrl } = req.body;

            if (!externalId)
                return reply.code(400).send({ status: false, message: "externalId required" });

            if (!name || !location || !baseUrl)
                return reply.code(400).send({ status: false, message: "Invalid payload" });

            const doc = await Location.findOneAndUpdate(
                { externalId }, // 🔑 identity
                {
                    $set: {
                        name,
                        location,
                        baseUrl,
                        subscription_amount: req.body.subscription_amount ?? 300,
                        subscriptionPlans: req.body.subscriptionPlans ?? {}
                    }
                },
                {
                    upsert: true,
                    new: true
                }
            );

            return reply.code(200).send(doc);

        } catch (error) {
            console.error("GLOBAL LOCATION UPSERT ERROR:", error);
            return reply.code(500).send({
                status: false,
                message: error.message
            });
        }
    });


    // Update location
    fastify.put("/:id", async (req, reply) => {
        try {
            const { externalId, name, location, baseUrl } = req.body;

            if (!externalId)
                return reply.code(400).send({ status: false, message: "externalId required" });

            const updated = await Location.findOneAndUpdate(
                { externalId }, // 🔑 identity
                {
                    $set: {
                        ...(name && { name }),
                        ...(location && { location }),
                        ...(baseUrl && { baseUrl }),
                        subscription_amount: req.body.subscription_amount
                    }
                },
                { new: true, upsert: true }
            );

            return reply.code(200).send({
                status: true,
                message: "Global location synced",
                data: updated
            });

        } catch (error) {
            console.error("GLOBAL UPDATE ERROR:", error);
            return reply.code(500).send({
                status: false,
                message: error.message
            });
        }
    });

    // Delete location
    fastify.delete("/:id", async (req, reply) => {
        await Location.findByIdAndDelete(req.params.id);
        reply.send({ message: "Location deleted successfully" });
    });

    // Delete location
    fastify.get("/:id", async (req, reply) => {
        const locationData = await Location.findById(req.params.id);
        reply.code(200).send({ status: true, data: locationData, message: "Location fetch successfully" });
    });
}
