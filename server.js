const express = require('express');
const cors = require('cors');
const { Op } = require('sequelize');
const countries = require('i18n-iso-countries');
const { Profile } = require('./model/profile'); 

const app = express();
app.use(cors());
app.use(express.json());

// --- Helper: Parsing Logic ---
const parseNLQ = (q) => {
    const text = q.toLowerCase();
    const params = {};
    let matched = false;

    if (/\bmales?\b/.test(text)) { params.gender = 'male'; matched = true; }
    if (/\bfemales?\b/.test(text)) { params.gender = 'female'; matched = true; }
    
    if (text.includes('young')) { params.min_age = 16; params.max_age = 24; matched = true; }
    if (text.includes('teenager')) { params.age_group = 'teenager'; matched = true; }
    if (text.includes('adult')) { params.age_group = 'adult'; matched = true; }
    if (text.includes('senior')) { params.age_group = 'senior'; matched = true; }

    const aboveMatch = text.match(/above (\d+)/);
    if (aboveMatch) { params.min_age = parseInt(aboveMatch[1]); matched = true; }

    const countryMatch = text.match(/from ([\w\s]+)/);
    if (countryMatch) {
        const code = countries.getAlpha2Code(countryMatch[1].trim(), 'en');
        if (code) { params.country_id = code; matched = true; }
    }
    return matched ? params : null;
};

// --- Helper: Build Where ---
const buildWhere = (p) => {
    const where = {};
    if (p.gender) where.gender = p.gender;
    if (p.age_group) where.age_group = p.age_group;
    if (p.country_id) where.country_id = p.country_id.toUpperCase();
    
    if (p.min_age || p.max_age) {
        where.age = {};
        if (p.min_age) where.age[Op.gte] = parseInt(p.min_age);
        if (p.max_age) where.age[Op.lte] = parseInt(p.max_age);
    }
    
    // CRITICAL: Combined Filters Probability Check
    if (p.min_gender_probability) where.gender_probability = { [Op.gte]: parseFloat(p.min_gender_probability) };
    if (p.min_country_probability) where.country_probability = { [Op.gte]: parseFloat(p.min_country_probability) };
    
    return where;
};

// --- ROUTES ---
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

app.get('/api/profiles/search', async (req, res) => {
    try {
        const { q, page = 1, limit = 10 } = req.query;
        const interpreted = parseNLQ(q || "");
        
        if (!interpreted) {
            return res.status(200).json({ status: "error", message: "Unable to interpret query" });
        }

        const pLimit = Math.min(parseInt(limit), 50);
        const pPage = parseInt(page);
        const { count, rows } = await Profile.findAndCountAll({
            where: buildWhere(interpreted),
            limit: pLimit,
            offset: (pPage - 1) * pLimit
        });

        res.json({ status: "success", page: pPage, limit: pLimit, total: count, data: rows });
    } catch (e) {
        res.status(500).json({ status: "error", message: e.message });
    }
});

// 2. Advanced Filters
app.get('/api/profiles', async (req, res) => {
    try {
        let { sort_by = 'created_at', order = 'desc', page = 1, limit = 10 } = req.query;
        
        // Validation: Sorting
        const validSorts = ['age', 'created_at', 'gender_probability'];
        if (!validSorts.includes(sort_by)) {
            return res.status(400).json({ status: "error", message: "Invalid query parameters" });
        }

        const pLimit = Math.min(parseInt(limit), 50); // Max-cap behavior
        const pPage = parseInt(page);

        const { count, rows } = await Profile.findAndCountAll({
            where: buildWhere(req.query),
            order: [[sort_by, order.toUpperCase()]],
            limit: pLimit,
            offset: (pPage - 1) * pLimit
        });

        res.json({ status: "success", page: pPage, limit: pLimit, total: count, data: rows });
    } catch (e) {
        res.status(422).json({ status: "error", message: "Invalid query parameters" });
    }
});

// --- Server Start ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Intelligence Query Engine running on port ${PORT}`);
});