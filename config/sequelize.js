const Sequelize = require('sequelize');
require('dotenv').config();

// Check if we are in production (Railway) or local
const isProduction = process.env.NODE_ENV === 'production' || process.env.DB_HOST?.includes('railway');

const sequelize = new Sequelize(
    process.env.DB_NAME,
    process.env.DB_USER,
    process.env.DB_PASS,
    {
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        dialect: 'postgres',
        dialectOptions: isProduction ? {
            ssl: {
                require: true,
                rejectUnauthorized: false
            }
        } : {}, // No SSL for local development
        logging: false
    }
);

module.exports = sequelize;