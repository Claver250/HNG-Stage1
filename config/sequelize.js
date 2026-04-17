// config/sequelize.js
const { Sequelize } = require('sequelize');
require('dotenv').config();

// Priority: Use DATABASE_URL first (Railway provides this automatically)
// Fallback to individual variables for local development
const connectionString = process.env.DATABASE_URL;

let sequelize;

if (connectionString) {
    // Production (Railway) - Use connection string (cleaner & recommended)
    sequelize = new Sequelize(connectionString, {
        dialect: 'postgres',
        dialectOptions: {
            ssl: {
                require: true,
                rejectUnauthorized: false   // Required for Railway Postgres
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
        process.env.DB_NAME || 'profile_db',
        process.env.DB_USER || 'postgres',
        process.env.DB_PASSWORD || process.env.DB_PASS,   // support both common names
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
}

// Optional: Add retry logic for better resilience
sequelize.authenticate()
    .then(() => {
        console.log('✅ Database connection established successfully.');
    })
    .catch(err => {
        console.error('❌ Unable to connect to the database:', err.message);
        if (err.name === 'SequelizeConnectionRefusedError') {
            console.error('   → Make sure PostgreSQL is running locally or DATABASE_URL is correctly set on Railway.');
        }
    });

module.exports = sequelize;