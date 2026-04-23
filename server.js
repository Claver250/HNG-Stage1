const express = require('express');
const cors = require('cors');
const { Op } = require('sequelize');
const countries = require('i18n-iso-countries');
const { Profile } = require('./model/profile'); // Assuming your model is in a separate file

const app = express();

// --- Middleware ---
app.use(cors({ origin: '*' }));
app.use(express.json());

// --- Helper: Dynamic Filter Builder ---
/**
 * Transforms raw query parameters into a Sequelize where clause
 */
const buildWhereClause = (params) => {
    const where = {};

    if (params.gender) where.gender = params.gender;
    if (params.age_group) where.age_group = params.age_group;
    if (params.country_id) where.country_id = params.country_id.toUpperCase();

    // Numeric Range: Age
    if (params.min_age || params.max_age) {
        where.age = {};
        if (params.min_age) where.age[Op.gte] = parseInt(params.min_age);
        if (params.max_age) where.age[Op.lte] = parseInt(params.max_age);
    }

    // Probability Thresholds
    if (params.min_gender_probability) {
        where.gender_probability = { [Op.gte]: parseFloat(params.min_gender_probability) };
    }
    if (params.min_country_probability) {
        where.country_probability = { [Op.gte]: parseFloat(params.min_country_probability) };
    }

    return where;
};

// --- Helper: Rule-Based NLQ Parser ---
/**
 * Maps plain English strings to structured query parameters
 */
const parseNLQ = (q) => {
    const text = q.toLowerCase();
    const params = {};
    let matched = false;

    // 1. Gender Rules
    if (/\bmales?\b/.test(text)) { params.gender = 'male'; matched = true; }
    if (/\bfemales?\b/.test(text)) { params.gender = 'female'; matched = true; }

    // 2. Age Group Rules
    if (text.includes('teenager')) { params.age_group = 'teenager'; matched = true; }
    if (text.includes('adult')) { params.age_group = 'adult'; matched = true; }
    if (text.includes('senior')) { params.age_group = 'senior'; matched = true; }

    // 3. Special Keyword: "young" (16-24)
    if (text.includes('young')) {
        params.min_age = 16;
        params.max_age = 24;
        matched = true;
    }

    // 4. Regex: "above X"
    const aboveMatch = text.match(/above (\d+)/);
    if (aboveMatch) {
        params.min_age = parseInt(aboveMatch[1]);
        matched = true;
    }

    // 5. Regex: "from [Country]"
    const countryMatch = text.match(/from ([\w\s]+)/);
    if (countryMatch) {
        const countryName = countryMatch[1].trim();
        const code = countries.getAlpha2Code(countryName, 'en');
        if (code) {
            params.country_id = code;
            matched = true;
        }
    }

    return matched ? params : null;
};

// --- Endpoints ---

/**
 * 1. Advanced Filtering & Sorting
 * GET /api/profiles
 */
app.get('/api/profiles', async (req, res) => {
    try {
        const { sort_by = 'created_at', order = 'desc', page = 1, limit = 10 } = req.query;

        // Validation for Sorting
        const allowedSort = ['age', 'created_at', 'gender_probability'];
        if (!allowedSort.includes(sort_by)) {
            return res.status(422).json({ status: "error", message: "Invalid sort parameter" });
        }

        const paginationLimit = Math.min(parseInt(limit), 50);
        const offset = (parseInt(page) - 1) * paginationLimit;

        const where = buildWhereClause(req.query);

        const { count, rows } = await Profile.findAndCountAll({
            where,
            order: [[sort_by, order.toUpperCase()]],
            limit: paginationLimit,
            offset: offset
        });

        return res.status(200).json({
            status: "success",
            page: parseInt(page),
            limit: paginationLimit,
            total: count,
            data: rows
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ status: "error", message: "Internal Server Error" });
    }
});

/**
 * 2. Natural Language Query
 * GET /api/profiles/search
 */
app.get('/api/profiles/search', async (req, res) => {
    try {
        const { q, page = 1, limit = 10 } = req.query;

        if (!q || q.trim() === "") {
            return res.status(400).json({ status: "error", message: "Query parameter 'q' is required" });
        }

        const interpretedParams = parseNLQ(q);

        if (!interpretedParams) {
            return res.status(200).json({ status: "error", message: "Unable to interpret query" });
        }

        const paginationLimit = Math.min(parseInt(limit), 50);
        const offset = (parseInt(page) - 1) * paginationLimit;
        
        // Use the same where clause builder to keep logic DRY
        const where = buildWhereClause(interpretedParams);

        const { count, rows } = await Profile.findAndCountAll({
            where,
            limit: paginationLimit,
            offset: offset,
            order: [['created_at', 'DESC']]
        });

        return res.status(200).json({
            status: "success",
            page: parseInt(page),
            limit: paginationLimit,
            total: count,
            data: rows
        });

    } catch (error) {
        return res.status(500).json({ status: "error", message: "Internal Server Error" });
    }
});

app.post('/api/profiles', async (req, res) => {
    try {
        const { name } = req.body;

        if (!name || typeof name !== 'string' || name.trim() === '') {
            return res.status(400).json({ status: "error", message: "A valid name is required" });
        }

        const normalizedName = name.trim().toLowerCase();

        // Idempotency Check: Check DB first
        const existingProfile = await Profile.findOne({ where: { name: normalizedName } });
        if (existingProfile) {
            return res.status(200).json({
                status: "success",
                message: "Profile already exists",
                data: existingProfile
            });
        }

        // Fetch data concurrently
        const [genderRes, ageRes, nationRes] = await Promise.allSettled([
            axios.get(`https://api.genderize.io?name=${normalizedName}`),
            axios.get(`https://api.agify.io?name=${normalizedName}`),
            axios.get(`https://api.nationalize.io?name=${normalizedName}`)
        ]);

        // Extract data with safe checks
        const genderData = genderRes.status === 'fulfilled' ? genderRes.value.data : {};
        const ageData = ageRes.status === 'fulfilled' ? ageRes.value.data : {};
        const nationData = nationRes.status === 'fulfilled' ? nationRes.value.data : {};

        // Edge Case Validation (Return 502 + Do NOT store) 
        if (!genderData.gender || genderData.count === 0 || genderData.count === null) {
            return res.status(502).json({
                status: "error",
                message: "Genderize returned an invalid response"
            });
        }

        if (ageData.age === null || ageData.age === undefined) {
            return res.status(502).json({
                status: "error",
                message: "Agify returned an invalid response"
            });
        }

        const countries = nationData.country || [];
        if (countries.length === 0) {
            return res.status(502).json({
                status: "error",
                message: "Nationalize returned an invalid response"
            });
        }

        // 3. Process Age Group
        const age = ageData.age;
        const age_group = "senior";
        if (age <= 12) age_group = "child";
        else if (age <= 19) age_group = "teenager";
        else if (age <= 59) age_group = "adult";

        // Process Country (highest probability)
        const topCountry = countries.reduce((prev, curr) => 
            (curr.probability > prev.probability) ? curr : prev
        );

        const fullName = ISOcountries.getName(topCountry.country_id, "en");

        // 5. Persist to Database
        const newProfile = await Profile.create({
            name: normalizedName,
            gender: genderData.gender,
            gender_probability: genderData.probability,
            sample_size: genderData.count,
            age: age,
            age_group: age_group,
            country_id: topCountry.country_id,
            country_name: fullName,
            country_probability: topCountry.probability,
            created_at: new Date().toISOString()
        });

        return res.status(201).json({
            status: "success",
            data: newProfile
        });

    } catch (error) {
        console.error("Internal Error:", error.message);
        res.status(500).json({ status: "error", message: "Internal Server Error", debug: error.message });
    }
});

// --- Server Start ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Intelligence Query Engine running on port ${PORT}`);
});