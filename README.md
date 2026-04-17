# Data Persistence & API Design Assessment

A robust backend service that enriches personal names with demographic insights by integrating three external APIs (Genderize, Agify, and Nationalize), persists the processed data, and provides a clean RESTful API for management.

This project was built as part of a backend assessment focusing on multi-API integration, data persistence, idempotency, and clean API design.

## Features

- **Multi-API Integration**: Fetches and aggregates data from Genderize, Agify, and Nationalize APIs concurrently.
- **Intelligent Data Processing**:
  - Gender prediction with probability and sample size.
  - Age estimation and automatic age group classification (`child`, `teenager`, `adult`, `senior`).
  - Country prediction using highest probability.
- **Idempotency**: Prevents duplicate records for the same name (case-insensitive).
- **RESTful API** with consistent JSON responses.
- **Advanced Filtering**: Query profiles by `gender`, `country_id`, and `age_group`.
- **Proper Error Handling**: Returns 502 for invalid external API responses.
- **UUID v7** for unique identifiers.
- **UTC Timestamps** for all records.
- **CORS** enabled (`Access-Control-Allow-Origin: *`).

## Tech Stack

- **Node.js** + **Express.js**
- **Sequelize ORM** (PostgreSQL / MySQL compatible)
- **Axios** for HTTP requests
- **UUID v7** (`uuid` package)
- **CORS** middleware

## API Endpoints

### 1. Create / Enrich Profile
**POST** `/api/profiles`

**Request Body:**
```json
{
  "name": "ella"
}
```

**Success Responses:**
- `201 Created` – New profile created
- `200 OK` – Profile already exists (idempotent)

### 2. Get Profile by ID
**GET** `/api/profiles/{id}`

### 3. List Profiles (with optional filters)
**GET** `/api/profiles?gender=male&country_id=NG&age_group=adult`

**Response includes** `count` and simplified data array.

### 4. Delete Profile
**DELETE** `/api/profiles/{id}`  
Returns `204 No Content` on success.

## Error Responses

All errors follow this structure:
```json
{
  "status": "error",
  "message": "Error description"
}
```

- `400` – Missing or invalid name
- `404` – Profile not found
- `502` – Invalid response from external API (Genderize / Agify / Nationalize)
- `500` – Internal server error

## Project Structure

```
profile-intelligence-service/
├── config/
│   └── sequelize.js
├── models/
│   └── Profile.js
├── app.js                 # Main server file
├── package.json
└── README.md
```

## Setup & Installation

### 1. Clone the repository
```bash
git clone <your-repo-url>
cd profile-intelligence-service
```

### 2. Install dependencies
```bash
npm install
```

### 3. Configure Database
Update `config/sequelize.js` with your database credentials (PostgreSQL, MySQL, or SQLite for testing).

Example for PostgreSQL:
```js
const { Sequelize } = require('sequelize');

const sequelize = new Sequelize('database_name', 'username', 'password', {
  host: 'localhost',
  dialect: 'postgres',
  logging: false,
});

module.exports = sequelize;
```

### 4. Run the application
```bash
npm start
```

The server will start on **http://localhost:3000**

## Testing the API

You can test using **Postman**, **Thunder Client**, or **curl**.

**Example:**
```bash
# Create a profile
curl -X POST http://localhost:3000/api/profiles \
  -H "Content-Type: application/json" \
  -d '{"name": "emmanuel"}'

# Get all profiles with filter
curl "http://localhost:3000/api/profiles?gender=male&country_id=NG"
```