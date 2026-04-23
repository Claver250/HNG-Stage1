const express = require('express');
const axios = require('axios');
const cors = require('cors');
const { Op } = require('sequelize');
const ISOcountries = require('i18n-iso-countries');
ISOcountries.registerLocale(require("i18n-iso-countries/langs/en.json"));
const sequelize = require('./config/sequelize');
const Profile = require('./model/profile'); 
require('dotenv').config();

const PORT = process.env.PORT || 3000;

const app = express();
app.use(express.json());
app.use(cors({origin: '*'})); // Allow CORS from any origin for testing purposes

const MAX_LIMIT = 100;
const ALLOWED_SORT_FIELDS = ['age', 'created_at', 'gender_probability', 'country_probability'];
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parsePagination(pageRaw, limitRaw) {
    const pageNum = Math.max(parseInt(pageRaw, 10) || 1, 1);
    const limitNum = Math.min(Math.max(parseInt(limitRaw, 10) || 10, 1), MAX_LIMIT);
    return { pageNum, limitNum };
}

function buildPaginationEnvelope(count, pageNum, limitNum, data) {
    const totalPages = count === 0 ? 0 : Math.ceil(count / limitNum);
    return {
        status: "success",
        page: pageNum,
        limit: limitNum,
        total: count,
        total_pages: totalPages,
        has_next_page: pageNum < totalPages,
        has_prev_page: pageNum > 1,
        data
    };
}

function validateProfileId(req, res) {
    const id = String(req.params.id || '');
    if (id.toLowerCase() === 'search') {
        res.status(400).json({ status: "error", message: "Invalid profile id" });
        return null;
    }
    if (!UUID_PATTERN.test(id)) {
        res.status(400).json({ status: "error", message: "Invalid UUID format" });
        return null;
    }
    return id;
}

app.get('/api/profiles/search', async (req, res) => {
    try {
        const { q, page = 1, limit = 10 } = req.query;
        if (!q) return res.status(400).json({ status: "error", message: "Query 'q' is required" });

        const query = q.toLowerCase().trim();
        const where = {};
        let interpreted = false;

        // Gender (support both male and female in one query without forcing one side)
        const hasMale = /\b(male|males|man|men)\b/.test(query);
        const hasFemale = /\b(female|females|woman|women)\b/.test(query);
        if (hasMale || hasFemale) {
            interpreted = true;
            if (hasMale && !hasFemale) where.gender = 'male';
            if (hasFemale && !hasMale) where.gender = 'female';
        }

        // Age group keywords
        if (/\byoung\b/.test(query)) { where.age = { [Op.gte]: 16, [Op.lte]: 24 }; interpreted = true; }
        if (/\badults?\b/.test(query)) { where.age_group = 'adult'; interpreted = true; }
        if (/\bteen(ager)?s?\b/.test(query)) { where.age_group = 'teenager'; interpreted = true; }
        if (/\bchild(ren)?\b|\bkids?\b/.test(query)) { where.age_group = 'child'; interpreted = true; }
        if (/\bsenior(s)?\b|\belderly\b/.test(query)) { where.age_group = 'senior'; interpreted = true; }

         // Age comparisons
        const aboveMatch = query.match(/(?:above|over|older than|greater than)\s+(\d+)/);
        const belowMatch = query.match(/(?:below|under|younger than|less than)\s+(\d+)/);
        const minMatch = query.match(/(?:at least|min(?:imum)?)\s+(\d+)/);
        const maxMatch = query.match(/(?:at most|max(?:imum)?)\s+(\d+)/);

        if (aboveMatch) {
            const ageVal = parseInt(aboveMatch[1], 10);
            where.age = { ...(where.age || {}), [Op.gt]: ageVal };
            interpreted = true;
        }
        if (belowMatch) {
            const ageVal = parseInt(belowMatch[1], 10);
            where.age = { ...(where.age || {}), [Op.lt]: ageVal };
            interpreted = true;
        }
        if (minMatch) {
            const ageVal = parseInt(minMatch[1], 10);
            where.age = { ...(where.age || {}), [Op.gte]: ageVal };
            interpreted = true;
        }
        if (maxMatch) {
            const ageVal = parseInt(maxMatch[1], 10);
            where.age = { ...(where.age || {}), [Op.lte]: ageVal };
            interpreted = true;
        }

        // Country Parsing
        const countryMatch = query.match(/(?:from|in)\s+([a-zA-Z\s]+?)(?=\s+(?:above|over|older|greater|below|under|younger|less|at least|at most|min|max|and|or)\b|$)/);
        if (countryMatch) {
            const countryName = countryMatch[1].trim();
            const countryId = ISOcountries.getAlpha2Code(countryName, 'en');
            if (countryId) { where.country_id = countryId.toUpperCase(); interpreted = true; }
        }

        if (!interpreted) return res.status(400).json({ status: "error", message: "Uninterpretable query" });

        const { pageNum, limitNum } = parsePagination(page, limit);

        const { count, rows } = await Profile.findAndCountAll({
            where,
            limit: limitNum,
            offset: (pageNum - 1) * limitNum,
            order: [['created_at', 'DESC'], ['id', 'ASC']]
        });

        return res.status(200).json(buildPaginationEnvelope(count, pageNum, limitNum, rows));
    } catch (error) {
        console.error("Search Error:", error.stack);
        return res.status(500).json({ status: "error", message: "Internal Server Error" });
    }
});

app.get('/api/profiles', async (req, res) => {
    try {
        const {
            gender,
            country_id,
            age_group,
            min_age,
            max_age,
            min_gender_probability,
            max_gender_probability,
            min_country_probability,
            max_country_probability,
            gender_probability_min,
            gender_probability_max,
            country_probability_min,
            country_probability_max,
            page = 1,
            limit = 10,
            sort_by,
            sortBy,
            order = 'ASC'
        } = req.query;

        // Validation for sortBy
        const resolvedSortBy = (sort_by || sortBy || 'created_at').toLowerCase();
        const resolvedOrder = String(order).toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

        if (!ALLOWED_SORT_FIELDS.includes(resolvedSortBy)) {
            return res.status(400).json({
                status: "error",
                message: "Invalid sort_by field. Allowed fields: age, created_at, gender_probability, country_probability"
            });
        }

        const where = {};
        if (gender) where.gender = gender.toLowerCase();
        if (country_id) where.country_id = country_id.toUpperCase();
        if (age_group) where.age_group = age_group.toLowerCase();

        if (min_age || max_age) {
            where.age = {};
            if (min_age) where.age[Op.gte] = parseInt(min_age, 10);
            if (max_age) where.age[Op.lte] = parseInt(max_age, 10);
        }

        const resolvedMinGenderProbability = min_gender_probability ?? gender_probability_min;
        const resolvedMaxGenderProbability = max_gender_probability ?? gender_probability_max;
        const resolvedMinCountryProbability = min_country_probability ?? country_probability_min;
        const resolvedMaxCountryProbability = max_country_probability ?? country_probability_max;

        if (resolvedMinGenderProbability || resolvedMaxGenderProbability) {
            where.gender_probability = {};
            if (resolvedMinGenderProbability) where.gender_probability[Op.gte] = parseFloat(resolvedMinGenderProbability);
            if (resolvedMaxGenderProbability) where.gender_probability[Op.lte] = parseFloat(resolvedMaxGenderProbability);
        }

        if (resolvedMinCountryProbability || resolvedMaxCountryProbability) {
            where.country_probability = {};
            if (resolvedMinCountryProbability) where.country_probability[Op.gte] = parseFloat(resolvedMinCountryProbability);
            if (resolvedMaxCountryProbability) where.country_probability[Op.lte] = parseFloat(resolvedMaxCountryProbability);
        }

        const { pageNum, limitNum } = parsePagination(page, limit);

        const { count, rows } = await Profile.findAndCountAll({
            where,
            limit: limitNum,
            offset: (pageNum - 1) * limitNum,
            order: [[resolvedSortBy, resolvedOrder], ['id', 'ASC']]
        });

        return res.status(200).json(buildPaginationEnvelope(count, pageNum, limitNum, rows));
    } catch (error) {
        console.error("List Error:", error.stack);
        res.status(500).json({ status: "error", message: "Internal Server Error" });
    }
});

app.get('/api/profiles/:id', async (req, res) => {
    const id = validateProfileId(req, res);
    if (!id) return;

    try {
        const profile = await Profile.findByPk(id);
        if (!profile) return res.status(404).json({ status: "error", message: "Profile not found" });
        return res.status(200).json({ status: "success", data: profile });
    } catch (error) {
        // This catches the 'invalid input syntax for type uuid'
        return res.status(400).json({ status: "error", message: "Invalid UUID format" });
    }
});

app.delete('/api/profiles/:id', async (req, res) => {
    try {
        const id = validateProfileId(req, res);
        if (!id) return;
        const deletedCount = await Profile.destroy({ where: { id } });
        if (deletedCount === 0) {
            return res.status(404).json({ status: "error", message: "Profile not found" });
        }
        return res.status(204).send();
    }catch(error){
        console.error("Internal Error:", error.message);
        res.status(500).json({ status: "error", message: "Internal Server Error" });
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

app.listen(PORT, '0.0.0.0', async () => {
    try {
        await sequelize.authenticate();
        console.log('Database connected.');
        await sequelize.sync();
        console.log(`Server is running on port ${PORT}`);
    } catch (error) {
        console.error('Unable to connect to the database:', error);
    }
});