const express = require('express');
const axios = require('axios');
const { v7: uuidv7 } = require('uuid'); 
const cors = require('cors');
const sequelize = require('./config/sequelize');
const Profile = require('./model/profile'); 
const { count } = require('node:console');

const app = express();
app.use(express.json());
app.use(cors({origin: '*'})); // Allow CORS from any origin for testing purposes

app.post('/api/profile', async (req, res) => {
    try {
        const { name } = req.query;

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
        let age_group = "senior";
        if (age <= 12) age_group = "child";
        else if (age <= 19) age_group = "teenager";
        else if (age <= 59) age_group = "adult";

        // Process Country (highest probability)
        const topCountry = countries.reduce((prev, curr) => 
            (curr.probability > prev.probability) ? curr : prev
        );

        // 5. Persist to Database
        const newProfile = await Profile.create({
            name: normalizedName,
            gender: genderData.gender,
            gender_probability: genderData.probability,
            sample_size: genderData.count,
            age: age,
            age_group: age_group,
            country_id: topCountry.country_id,
            country_probability: topCountry.probability,
            created_at: new Date().toISOString()
        });

        return res.status(201).json({
            status: "success",
            data: newProfile
        });

    } catch (error) {
        console.error("Internal Error:", error.message);
        res.status(500).json({ status: "error", message: "Internal Server Error" });
    }
});

app.get('/api/profile/:id', async (req, res) => {
    try {
        const profile = await Profile.findByPk(req.params.id);
        if (!profile) {
            return res.status(404).json({ status: "error", message: "Profile not found" });
        }

        return res.status(200).json({
            status: "success",
            data: profile
        });
    } catch (error) {
        console.error("Internal Error:", error.message);
        res.status(500).json({ status: "error", message: "Internal Server Error" });
    }
});

app.get('/api/profiles', async (req, res) => {
    try {
        const { gender, country_id, age_group } = req.query;
        const where = {};

        if (gender) where.gender = gender;
        if (country_id) where.country_id = country_id;
        if (age_group) where.age_group = age_group;

        const profiles = await Profile.findAll({where});

        return res.status(200).json({
            status: "success",
            count: profiles.length,
            data: profiles.map(p => ({
                id: p.id,
                name: p.name,
                gender: p.gender,
                age: p.age,
                country_id: p.country_id
            }))
        });
    } catch (error) {
        console.error("Internal Error:", error.message);
        res.status(500).json({ status: "error", message: "Internal Server Error" });
    }
});

app.delete('/api/profile/:id', async (req, res) => {
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


app.listen(3000, async () => {
    try {
        await sequelize.authenticate();
        console.log('Database connection has been established successfully.');
        await sequelize.sync({alter: true}); // Sync models with DB, alter tables if needed
        console.log('Server is running on port 3000');
    } catch (error) {
        console.error('Unable to connect to the database:', error);
    }
});