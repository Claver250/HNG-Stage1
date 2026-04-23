const { Sequelize } = require('sequelize');
require('dotenv').config();

const connectionString = process.env.DATABASE_URL;

let sequelize;

if (connectionString && connectionString.trim() !== "") {
    console.log(' Production detected via DATABASE_URL → Connecting with SSL');
    
    sequelize = new Sequelize(connectionString.trim(), {
        dialect: 'postgres',
        dialectOptions: {
            ssl: {
                require: true,
                rejectUnauthorized: false,
                sslmode: 'require'
            }
        },
        logging: false
    });
} else if (process.env.DB_NAME) {
    // This part only runs if DATABASE_URL is missing but you provided individual DB variables
    console.log(' Individual env variables found → Using local fallback');
    
    sequelize = new Sequelize(
        process.env.DB_NAME,
        process.env.DB_USER || 'postgres',
        process.env.DB_PASSWORD || '',
        {
            host: process.env.DB_HOST || 'localhost',
            port: process.env.DB_PORT || 5432,
            dialect: 'postgres'
        }
    );
} else {
    // If BOTH are missing, your app shouldn't start blindly
    console.error(' ERROR: No database configuration found. Please check your .env file.');
    process.exit(1);
}

module.exports = sequelize;