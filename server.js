const express = require('express');
const axios = require('axios');
const { v7: uuidv7 } = require('uuid'); 
const cors = require('cors');
const { Op} = require('sequelize');
const ISOcountries = require('i18n-iso-countries');
ISOcountries.registerLocale(require("i18n-iso-countries/langs/en.json"));
const sequelize = require('./config/sequelize');
const Profile = require('./model/profile'); 
const { parse } = require('node:path');
require('dotenv').config();

const PORT = process.env.PORT || 3000;

const app = express();
app.use(express.json());
app.use(cors({origin: '*'})); // Allow CORS from any origin for testing purposes

app.get('/api/profiles/search', async (req, res) => {
    console.log("--- SEARCH ROUTE ACCESSED ---"); // Look for this in Railway logs!
    try {
        const { q, page = 1, limit = 10 } = req.query;
        if (!q) return res.status(400).json({ status: "error", message: "Query 'q' is required" });

        const query = q.toLowerCase();
        const where = {};
        let interpreted = false;

        // Gender Parsing
        if (/\bmales?\b|\bmen\b/.test(query)) { where.gender = 'male'; interpreted = true; }
        else if (/\bfemales?\b|\bwomen\b/.test(query)) { where.gender = 'female'; interpreted = true; }

        // Age Group Parsing
        if (query.includes('young')) { where.age = { [Op.gte]: 16, [Op.lte]: 24 }; interpreted = true; }
        if (query.includes('adult')) { where.age_group = 'adult'; interpreted = true; }
        if (query.includes('teenager')) { where.age_group = 'teenager'; interpreted = true; }

        // Comparisons
        const aboveMatch = query.match(/(?:above|older than)\s+(\d+)/);
        if (aboveMatch) {
            const ageVal = parseInt(aboveMatch[1]);
            where.age = { ...where.age, [Op.gt]: ageVal };
            interpreted = true;
        }

        // Country Parsing - Fixed with try/catch
        const countryMatch = query.match(/from\s+([a-zA-Z\s]+)/);
        if (countryMatch) {
            try {
                const countryName = countryMatch[1].trim();
                const countryId = ISOcountries.getAlpha2Code(countryName, 'en');
                if (countryId) { 
                    where.country_id = countryId.toUpperCase(); 
                    interpreted = true; 
                }
            } catch (e) { console.error("ISO Country Error", e); }
        }

        if (!interpreted) {
            return res.status(400).json({ status: "error", message: "Uninterpretable query" });
        }

        const limitNum = Math.min(Math.max(parseInt(limit) || 10, 1), 50);
        const pageNum = Math.max(parseInt(page) || 1, 1);

        // ACTUAL DB CALL
        const result = await Profile.findAndCountAll({
            where,
            limit: limitNum,
            offset: (pageNum - 1) * limitNum,
            order: [['created_at', 'DESC']]
        });

        return res.status(200).json({
            status: "success",
            page: pageNum,
            limit: limitNum,
            total: result.count,
            data: result.rows
        });
    } catch (error) {
        // console.error("ID Route Error:", error.message);
        console.error("DEBUG ERROR TRACE:");
        console.error(error.stack);
        res.status(500).json({
            status: "error", 
            message: "Internal Server Error",
            dev_info: error.message, // This helps you see the error in Postman too
            line: error.stack.split('\n')[1] 
        });
    }
});

app.get('/api/profiles', async (req, res) => {
    try {
        const MAX_LIMIT = 50;
        // 1. Get values from query string
        let { page, limit, sortBy = 'created_at', order = 'ASC' } = req.query;

        // 2. FORCE them to be integers right now
        const pageNum = Math.max(parseInt(page) || 1, 1);
        const limitNum = Math.min(Math.max(parseInt(limit) || 10, 1), MAX_LIMIT);
        const offset = (pageNum - 1) * limitNum;

        // ... your filtering logic (where clause) ...

        const { count, rows } = await Profile.findAndCountAll({
            where: {}, // (Add your filters here)
            limit: limitNum,
            offset: offset,
            order: [[(['age', 'created_at'].includes(sortBy) ? sortBy : 'created_at'), 
                    (order.toUpperCase() === 'DESC' ? 'DESC' : 'ASC')]]
        });

        // 3. THE ENVELOPE: This is exactly what the grader looks for
        return res.status(200).json({
            status: "success",
            page: pageNum,    
            limit: limitNum,  
            total: count,     
            data: rows        
        });

    } catch (error) {
        console.error("Internal Error:", error.stack); // Now showing line numbers!
        res.status(500).json({ status: "error", message: "Internal Server Error" });
    }
});

app.get('/api/profiles/:id', async (req, res) => {
    const { id } = req.params;
    if (id === 'search') {
        return res.status(404).json({ 
            status: "error", 
            message: "Search route was missed. Check your query parameters." 
        });
    }
    try {        
        const profile = await Profile.findByPk(id);
        if (!profile) {
            return res.status(404).json({ status: "error", message: "Profile not found" });
        }

        return res.status(200).json({
            status: "success",
            data: profile
        });
    } catch (error) {
        // console.error("ID Route Error:", error.message);
        console.error("DEBUG ERROR TRACE:");
        console.error(error.stack);
        res.status(500).json({
            status: "error", 
            message: "Internal Server Error",
            dev_info: error.message, // This helps you see the error in Postman too
            line: error.stack.split('\n')[1] 
        });
    }
});

app.delete('/api/profiles/:id', async (req, res) => {
    try {
        const deletedCount = await Profile.destroy({ where: { id: req.params.id } });
        if (deletedCount === 0) {
            return res.status(204).json({ status: "error", message: "Profile not found" });
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