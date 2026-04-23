const { DataTypes } = require('sequelize');
const sequelize = require('../config/sequelize');
const { v7: uuidv7, validate } = require('uuid');

const Profile = sequelize.define('Profile', {
    id: {
        type: DataTypes.UUID,
        primaryKey: true,
        allowNull: false,
        defaultValue: () => uuidv7() // Generate UUID v7 for each new profile
    },
    name: {
        type: DataTypes.STRING(100),
        allowNull: false,
        unique: true, // Crucial for Idempotency at the DB level
        validate: {
            notEmpty: true,
            len: [1, 100]
        },
        set(value) {
        // Automatically normalize names to lowercase before saving
        this.setDataValue('name', value ? value.trim().toLowerCase() : null);
        }
    },
    gender: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: {
            min: 0,
            max: 1
        }
    },
    gender_probability: {
        type: DataTypes.FLOAT,
        allowNull: true,
        validate: {
            min: 0,
            max: 1
        }
    },
    sample_size: {
        type: DataTypes.INTEGER,
        allowNull: true,
        validate: {
            min: 0
        }
    },
    age: {
        type: DataTypes.INTEGER,
        allowNull: true,
        validate: {
            min: 0
        }
    },
    age_group: {
        type: DataTypes.ENUM('child', 'teenager', 'adult', 'senior'),
        allowNull: true
    },
    country_id: {
        type: DataTypes.STRING(2), // Stores ISO codes like 'US', 'GB', etc.
        allowNull: true
    },
    country_name: {
        type: DataTypes.STRING,
        allowNull: true
    },
    country_probability: {
        type: DataTypes.FLOAT,
        allowNull: true,
        validate: {
            min: 0,
            max: 1
        }
    },
    created_at: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
        allowNull: false
    }
    }, {
    // Model Options
    tableName: 'profiles',
    timestamps: false,
    underscored: true,
    hooks: {
        beforeCreate: (profile) => {
            if (profile.created_at) {
                profile.created_at = new Date(profile.created_at).toISOString();
            }else{
                profile.created_at = new Date().toISOString();
            }
        },
        beforeUpdate: (profile) => {
            delete profile.created_at;
        }   
    },
    indexes: [
        {
            fields: ['gender']
        },
        {
            fields: ['country_id']
        },
        {
            fields: ['age_group']
        },
        {
            fields: ['name'],
            unique: true
        }
    ]
});

module.exports = Profile;