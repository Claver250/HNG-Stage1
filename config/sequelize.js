const { Sequelize } = require('sequelize');
require('dotenv').config();

const connectionString = process.env.DATABASE_URL;

let sequelize;

// If DATABASE_URL exists, we are likely on Neon/Railway/Render
if (connectionString) {
    console.log('🚀 Production detected via DATABASE_URL → Connecting with SSL');
    
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
    // Truly local development (no DATABASE_URL in .env)
    console.log('💻 No DATABASE_URL found → Using local fallback');
    
    sequelize = new Sequelize(
        process.env.DB_NAME || 'Stage1-db',
        process.env.DB_USER || 'postgres',
        process.env.DB_PASSWORD || '',
        {
            host: process.env.DB_HOST || 'localhost',
            port: process.env.DB_PORT || 5432,
            dialect: 'postgres'
        }
    );
}

module.exports = sequelize;