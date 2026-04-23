To merge these effectively, you should keep your existing **Features**, **Tech Stack**, and **API Endpoints** sections, but update them to include the new Stage 1 requirements. 

Since you are being graded on the Natural Language parsing specifically, that section needs to be prominent. Here is how you should restructure your README to include both tasks seamlessly:

---

# Profile Intelligence Service & NL Search

A robust backend service that enriches personal names with demographic insights and provides a **Natural Language Search Engine** to query the processed data. 

## 🚀 New Feature: Natural Language Search
The core update for Stage 1 is the **Rule-Based Natural Language Processing (NLP)** engine located at `/api/profiles/search`.

### How the Logic Works
The engine processes the input string `q` through a deterministic pipeline:
1. **Normalization:** Input is lowercased and trimmed.
2. **Regex Tokenization:** Uses word boundaries (`\b`) to identify intent (e.g., ensuring "mail" doesn't trigger "male").
3. **Keyword Mapping:** Maps human terms to Sequelize operators.

### Supported Keywords & Mappings
| Category | Keywords | Logic / Mapping |
| :--- | :--- | :--- |
| **Gender** | `male`, `men`, `female`, `women` | `gender = 'male'/'female'` |
| **Age Group** | `child`, `teenager`, `adult`, `senior` | Maps to `age_group` column |
| **"Young"** | `young` | `age BETWEEN 16 AND 24` |
| **Comparison** | `above`, `over`, `below`, `under` | `age > X` or `age < X` |
| **Geography** | `from [Country]`, `in [Country]` | Maps name to ISO-2 (e.g. "Nigeria" → "NG") |

### Limitations & Edge Cases
* **No Semantic Negation:** Does not understand "not male."
* **Single Conjunctions:** All filters are applied as `AND` logic; `OR` is not currently supported.
* **Geographic Specificity:** Supports country names only (no cities or states).
* **Numeric Dependency:** Comparisons require digits (e.g., "above 20" works, "above twenty" does not).

---

## 🛠 Updated API Endpoints

### 1. Natural Language Search (New)
**GET** `/api/profiles/search?q=young males from nigeria`
* **400 Error:** If `q` is missing.
* **422 Error:** If invalid types are passed.

### 2. List Profiles (Enhanced)
**GET** `/api/profiles?gender=male&page=1&limit=10`
* **Pagination:** Supported via `page` and `limit`.
* **Performance:** Handles 2026 records efficiently using B-Tree indexing on `gender`, `country_id`, and `age_group`.

### 3. Create / Enrich Profile (Idempotent)
**POST** `/api/profiles` (Body: `{"name": "ella"}`)

### 4. Get/Delete Profile
**GET/DELETE** `/api/profiles/{id}`

---

## 📈 Performance & Scalability
To handle the **2026 record requirement**, the service employs:
* **Indexing:** B-Tree indexes on filtered columns to avoid full-table scans.
* **Clamped Pagination:** `limit` is capped at 50 to prevent DoS-style payload sizes.
* **Server-Side Sorting:** Sorting is handled at the DB level via Sequelize `order`.

---

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

