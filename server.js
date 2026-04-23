// --- same imports as before ---
const express = require('express');
const axios = require('axios');
const { v7: uuidv7 } = require('uuid');
const cors = require('cors');
const { Op } = require('sequelize');
const ISOcountries = require('i18n-iso-countries');
ISOcountries.registerLocale(require("i18n-iso-countries/langs/en.json"));

const sequelize = require('./config/sequelize');
const Profile = require('./model/profile');

require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors({ origin: '*' }));

/* ---------------- HELPERS ---------------- */

const getPagination = (page, limit) => {
    const limitNum = Math.min(Math.max(parseInt(limit) || 10, 1), 50);
    const pageNum = Math.max(parseInt(page) || 1, 1);
    return { limitNum, pageNum, offset: (pageNum - 1) * limitNum };
};

const paginationMeta = (page, limit, total) => ({
    page,
    limit,
    total,
    total_pages: Math.ceil(total / limit)
});

/* ---------------- NLP PARSER ---------------- */

function parseQuery(q) {
    const query = q.toLowerCase();
    const where = {};
    let interpreted = false;

    // Gender (handles "male and female")
    const hasMale = /\b(male|men|man)\b/.test(query);
    const hasFemale = /\b(female|women|woman)\b/.test(query);

    if (hasMale && !hasFemale) {
        where.gender = 'male';
        interpreted = true;
    } else if (hasFemale && !hasMale) {
        where.gender = 'female';
        interpreted = true;
    }

    // Age keywords
    if (query.includes('young')) {
        where.age = { [Op.between]: [16, 24] };
        interpreted = true;
    }

    if (query.includes('teen')) {
        where.age = { [Op.between]: [13, 19] };
        interpreted = true;
    }

    if (query.includes('adult')) {
        where.age_group = 'adult';
        interpreted = true;
    }

    // Age comparisons
    const above = query.match(/(above|older than)\s+(\d+)/);
    if (above) {
        where.age = { ...(where.age || {}), [Op.gt]: parseInt(above[2]) };
        interpreted = true;
    }

    const below = query.match(/(below|younger than)\s+(\d+)/);
    if (below) {
        where.age = { ...(where.age || {}), [Op.lt]: parseInt(below[2]) };
        interpreted = true;
    }

    // Country
    const countryMatch = query.match(/from\s+([a-zA-Z]+)/);
    if (countryMatch) {
        const code = ISOcountries.getAlpha2Code(countryMatch[1], 'en');
        if (code) {
            where.country_id = code;
            interpreted = true;
        }
    }

    return { where, interpreted };
}

/* ---------------- SEARCH ---------------- */

app.get('/api/profiles/search', async (req, res) => {
    try {
        const { q, page = 1, limit = 10 } = req.query;

        if (!q) {
            return res.status(400).json({
                status: "error",
                message: "Query 'q' is required"
            });
        }

        const { where, interpreted } = parseQuery(q);

        if (!interpreted) {
            return res.status(400).json({
                status: "error",
                message: "Uninterpretable query"
            });
        }

        const { limitNum, pageNum, offset } = getPagination(page, limit);

        const { count, rows } = await Profile.findAndCountAll({
            where,
            limit: limitNum,
            offset,
            order: [['created_at', 'DESC']]
        });

        return res.status(200).json({
            status: "success",
            data: rows,
            pagination: paginationMeta(pageNum, limitNum, count)
        });

    } catch (err) {
        console.error(err);
        return res.status(500).json({
            status: "error",
            message: "Internal Server Error"
        });
    }
});

/* ---------------- FILTER + SORT ---------------- */

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
            page = 1,
            limit = 10,
            sort_by = 'created_at',
            order = 'ASC'
        } = req.query;

        // Validation
        const allowedSort = ['age', 'created_at', 'gender_probability', 'country_probability'];
        if (!allowedSort.includes(sort_by.toLowerCase())) {
            return res.status(400).json({
                status: "error",
                message: "Invalid sort_by field"
            });
        }

        if (!['ASC', 'DESC'].includes(order.toUpperCase())) {
            return res.status(400).json({
                status: "error",
                message: "Invalid order value"
            });
        }

        const where = {};

        if (gender) where.gender = gender.toLowerCase();
        if (country_id) where.country_id = country_id.toUpperCase();
        if (age_group) where.age_group = age_group.toLowerCase();

        if (min_age !== undefined || max_age !== undefined) {
            where.age = {};
            if (min_age !== undefined) where.age[Op.gte] = parseInt(min_age);
            if (max_age !== undefined) where.age[Op.lte] = parseInt(max_age);
        }

        if (min_gender_probability !== undefined || max_gender_probability !== undefined) {
            where.gender_probability = {};
            if (min_gender_probability !== undefined)
                where.gender_probability[Op.gte] = parseFloat(min_gender_probability);
            if (max_gender_probability !== undefined)
                where.gender_probability[Op.lte] = parseFloat(max_gender_probability);
        }

        const { limitNum, pageNum, offset } = getPagination(page, limit);

        const { count, rows } = await Profile.findAndCountAll({
            where,
            limit: limitNum,
            offset,
            order: [[sort_by.toLowerCase(), order.toUpperCase()]]
        });

        return res.status(200).json({
            status: "success",
            data: rows,
            pagination: paginationMeta(pageNum, limitNum, count)
        });

    } catch (err) {
        console.error(err);
        return res.status(500).json({
            status: "error",
            message: "Internal Server Error"
        });
    }
});

// --- Server Start ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Intelligence Query Engine running on port ${PORT}`);
});