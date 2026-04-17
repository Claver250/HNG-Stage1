const { Sequelize } = require('sequelize');
require('dotenv').config();

const connectionString = process.env.DATABASE_URL;
const isProduction = process.env.NODE_ENV === 'production';

let sequelize;

// If we have a URL AND we are in production, use SSL
if (connectionString && isProduction) {
    sequelize = new Sequelize(connectionString.trim(), {
        dialect: 'postgres',
        dialectOptions: {
            ssl: {
                require: true,
                rejectUnauthorized: false
            }
        },
        logging: false
    });
} else {
    // Local development (even if DATABASE_URL exists in .env)
    console.log('🚀 Running in LOCAL mode (No SSL)');
    
    sequelize = new Sequelize(
        process.env.DB_NAME || 'Stage1-db',
        process.env.DB_USER || 'postgres',
        process.env.DB_PASSWORD || '',
        {
            host: process.env.DB_HOST || 'localhost',
            port: process.env.DB_PORT || 5432,
            dialect: 'postgres',
            logging: console.log,
        }
    );
}

module.exports = sequelize;