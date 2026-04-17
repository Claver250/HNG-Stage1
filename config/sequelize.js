// config/sequelize.js
const { Sequelize } = require('sequelize');
require('dotenv').config();

// Debug: Log what we actually have (remove after it works)
console.log('DATABASE_URL exists:', !!process.env.DATABASE_URL);
console.log('DB_HOST:', process.env.DB_HOST);

let sequelize;

if (process.env.DATABASE_URL) {
    // Railway / Production - Use the connection string
    sequelize = new Sequelize(process.env.DATABASE_URL, {
        dialect: 'postgres',
        dialectOptions: {
            ssl: {
                require: true,
                rejectUnauthorized: false
            }
        },
        logging: false,
        pool: {
            max: 10,
            min: 0,
            acquire: 30000,
            idle: 10000
        }
    });
} else {
    // Local development fallback
    sequelize = new Sequelize(
        process.env.DB_NAME || 'stage1_db',
        process.env.DB_USER || 'postgres',
        process.env.DB_PASSWORD || process.env.DB_PASS,
        {
            host: process.env.DB_HOST || 'localhost',
            port: parseInt(process.env.DB_PORT) || 5432,
            dialect: 'postgres',
            logging: process.env.NODE_ENV === 'development',
        }
    );
}

module.exports = sequelize;