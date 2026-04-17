// config/sequelize.js
const { Sequelize } = require('sequelize');
require('dotenv').config();

console.log('=== Railway Debug Info ===');
console.log('DATABASE_URL exists:', !!process.env.DATABASE_URL);
console.log('DB_HOST:', process.env.DB_HOST);
console.log('All env keys:', Object.keys(process.env).filter(k => k.includes('DB') || k.includes('DATABASE')));

let sequelize;

if (process.env.DATABASE_URL && process.env.DATABASE_URL.startsWith('postgres://')) {
    console.log('✅ Using DATABASE_URL from Railway');
    sequelize = new Sequelize(process.env.DATABASE_URL, {
        dialect: 'postgres',
        dialectOptions: {
            ssl: {
                require: true,
                rejectUnauthorized: false
            }
        },
        logging: false,
        pool: { max: 10, min: 0, acquire: 30000, idle: 10000 }
    });
} else {
    console.log('⚠️  Falling back to individual DB variables (local mode)');
    sequelize = new Sequelize(
        process.env.DB_NAME,
        process.env.DB_USER,
        process.env.DB_PASS || process.env.DB_PASSWORD,
        {
            host: process.env.DB_HOST || 'localhost',
            port: parseInt(process.env.DB_PORT) || 5432,
            dialect: 'postgres',
            logging: false,
        }
    );
}

module.exports = sequelize;