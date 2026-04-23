## 🧠 Natural Language Search Engine

The `/api/profiles/search` endpoint implements a custom **Rule-Based Natural Language Processing (NLP)** engine. This allows users to query the database using plain English sentences without the overhead or unpredictability of an LLM.

### 🛠️ How the Logic Works
The engine processes the input string `q` through three distinct phases:

1.  **Normalization:** The input is converted to lowercase and stripped of special characters to ensure case-insensitive matching.
2.  **Tokenization & Pattern Matching:** We use **Regular Expressions (Regex)** with word boundaries (`\b`) to identify intent. This prevents "partial matches" (e.g., ensuring the word "email" doesn't accidentally trigger a "male" gender filter).
3.  **Logical Mapping:** Detected tokens are mapped to Sequelize operators (`Op.gte`, `Op.lte`, `Op.eq`) to build a dynamic `where` clause.

### 🔑 Supported Keywords & Mappings

| Category | Keywords | Logic / Mapping |
| :--- | :--- | :--- |
| **Gender** | `male`, `men`, `female`, `women` | `gender = 'male'` or `'female'` |
| **Age Group** | `child`, `teenager`, `adult`, `senior` | Maps to `age_group` column |
| **"Young"** | `young` | Custom range: `age BETWEEN 16 AND 24` |
| **Comparison** | `above`, `over`, `below`, `under` | Captures following digit: `age > X` or `age < X` |
| **Geography** | `from [Country]`, `in [Country]` | Uses `i18n-iso-countries` to map names to ISO-2 codes (e.g., "Nigeria" → "NG") |

**Example Logic Flow:**
Query: *"young females from nigeria above 20"*
1.  `young` → `age >= 16 AND age <= 24`
2.  `females` → `gender = 'female'`
3.  `from nigeria` → `country_id = 'NG'`
4.  `above 20` → `age > 20`
5.  **Result:** Profiles where `gender='female'`, `country_id='NG'`, and `age` is between 21 and 24.

---

### ⚠️ Limitations & Edge Cases

While the parser is robust for standard queries, it has the following limitations:

* **No Semantic Context:** The parser cannot distinguish between "not a male" and "is a male." It looks for the presence of keywords regardless of negation.
* **Ambiguous Geographic Names:** Only official country names and common English aliases are supported. It does not support cities, states, or slang (e.g., "Lagos" or "Naija" will not map to Nigeria).
* **Complex Conjunctions:** The engine treats all detected filters as an `AND` operation. It does not currently support `OR` logic (e.g., "males from Kenya OR Ghana").
* **Non-numeric ages:** The parser expects digits for age comparisons. It will not understand "above twenty."
* **Keyword Overlap:** If a user types "young adult," the system will apply both the "young" (16-24) filter and the "adult" category filter, which may result in a very narrow or empty result set depending on database values.