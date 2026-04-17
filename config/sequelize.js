// config/sequelize.js
const { Sequelize } = require('sequelize');
require('dotenv').config();

const connectionString = process.env.DATABASE_URL?.trim();

if (!connectionString) {
    console.warn('⚠️ DATABASE_URL is missing → Running in LOCAL development mode.');
    
    // Local development fallback (using individual variables)
    const sequelize = new Sequelize(
        process.env.DB_NAME || 'Stage1-db',
        process.env.DB_USER || 'postgres',
        process.env.DB_PASSWORD || process.env.DB_PASS || '',
        {
            host: process.env.DB_HOST || 'localhost',
            port: process.env.DB_PORT || 5432,
            dialect: 'postgres',
            logging: process.env.NODE_ENV === 'development' ? console.log : false,
            pool: {
                max: 5,
                min: 0,
                acquire: 30000,
                idle: 10000
            }
        }
    );

    module.exports = sequelize;
    return; // Stop execution here
}

// === Production / Vercel mode (DATABASE_URL exists) ===
const sequelize = new Sequelize(connectionString, {
    dialect: 'postgres',
    dialectOptions: {
        ssl: {
            require: true,
            rejectUnauthorized: false
        }
    },
    pool: {
        max: 3,           // Small pool is safer on Vercel serverless
        min: 0,
        acquire: 30000,
        idle: 10000
    },
    logging: false,
    retry: {
        max: 2
    }
});

module.exports = sequelize;