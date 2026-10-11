const fs = require("fs");
const path = require("path");
const mysql = require("mysql2/promise");
require("dotenv").config();

const demoDatasetVersion = "1";

async function initDatabase() {
  const dbHost = process.env.DB_HOST || "127.0.0.1";
  const dbUser = process.env.DB_USER || "root";
  const dbPassword = process.env.DB_PASSWORD || "";
  const dbName = process.env.DB_NAME || "Mediccal_data";
  const dbPort = Number(process.env.DB_PORT || 3306);

  const connection = await mysql.createConnection({
    host: dbHost,
    user: dbUser,
    password: dbPassword,
    port: dbPort,
    multipleStatements: true
  });

  try {
    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\`;`);
    await connection.query(`USE \`${dbName}\`;`);

    const schemaSql = fs.readFileSync(path.join(__dirname, "../sql/schema.sql"), "utf8");
    const seedSql = fs.readFileSync(path.join(__dirname, "../sql/seed.sql"), "utf8");

    await connection.query(schemaSql);
    const [claimEvidenceColumn] = await connection.query(
      "SHOW COLUMNS FROM insurance_claims LIKE 'encrypted_evidence_uri'"
    );
    if (!claimEvidenceColumn.length) {
      await connection.query(
        "ALTER TABLE insurance_claims ADD COLUMN encrypted_evidence_uri VARCHAR(255) NULL AFTER claim_amount"
      );
    }
    await connection.query(
      "ALTER TABLE insurance_claims MODIFY claim_amount DECIMAL(18,8) NOT NULL DEFAULT 0.00000000"
    );
    const [claimNumberIndex] = await connection.query(
      "SHOW INDEX FROM insurance_claims WHERE Column_name = 'claim_number' AND Non_unique = 0"
    );
    if (!claimNumberIndex.length) {
      await connection.query(
        "ALTER TABLE insurance_claims ADD UNIQUE INDEX uq_insurance_claim_number (claim_number)"
      );
    }
    await connection.query(`
      CREATE TABLE IF NOT EXISTS demo_seed_state (
        seed_version VARCHAR(32) PRIMARY KEY,
        applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    const [appliedSeeds] = await connection.execute(
      "SELECT seed_version FROM demo_seed_state WHERE seed_version = ?",
      [demoDatasetVersion]
    );
    if (!appliedSeeds.length) {
      const [counts] = await connection.query(`
        SELECT
          (SELECT COUNT(*) FROM users WHERE email IN (
            'emma.patient@medledger.local', 'daniel.patient@medledger.local',
            'noah.patient@medledger.local', 'aisha.patient@medledger.local',
            'hannah.doctor@medledger.local', 'priya.doctor@medledger.local',
            'marcus.doctor@medledger.local', 'admin@medledger.local'
          )) AS users,
          (SELECT COUNT(*) FROM patient_profiles WHERE user_id IN (1, 2, 3, 4)) AS patient_profiles,
          (SELECT COUNT(*) FROM doctor_profiles WHERE user_id IN (5, 6, 7)) AS doctor_profiles,
          (SELECT COUNT(*) FROM records WHERE title IN (
            'Annual Wellness Medical History', 'Lipid Panel Report', 'Atorvastatin Prescription',
            'Diabetes Care Plan', 'HbA1c Lab Results', 'Orthopedic Injury Summary',
            'X-Ray Follow-Up', 'Postpartum Checkup'
          )) AS records,
          (SELECT COUNT(*) FROM appointments) AS appointments,
          (SELECT COUNT(*) FROM access_logs WHERE purpose IN (
            'Cardiology review', 'Second opinion on diabetic labs', 'Endocrinology consultation',
            'Orthopedic imaging review', 'Follow-up after maternity observation'
          )) AS access_logs,
          (SELECT COUNT(*) FROM access_requests WHERE reason IN (
            'Review cholesterol trends for medication update',
            'Request access to glucose monitoring history',
            'Assess recovery plan after ligament strain',
            'Consent for postpartum wellness checkup'
          )) AS access_requests,
          (SELECT COUNT(*) FROM insurance_claims WHERE claim_number IN (
            'BC-2026-1041', 'CS-2026-2189', 'NC-2026-3002'
          )) AS claims
      `);
      const existingDatasetIsComplete =
        Number(counts[0].users) >= 8 &&
        Number(counts[0].patient_profiles) >= 4 &&
        Number(counts[0].doctor_profiles) >= 3 &&
        Number(counts[0].records) >= 8 &&
        Number(counts[0].appointments) >= 6 &&
        Number(counts[0].access_logs) >= 5 &&
        Number(counts[0].access_requests) >= 4 &&
        Number(counts[0].claims) >= 3;

      if (!existingDatasetIsComplete) await connection.query(seedSql);
      await connection.execute(
        "INSERT INTO demo_seed_state (seed_version) VALUES (?)",
        [demoDatasetVersion]
      );
    }

    console.log(`Database ${dbName} initialized successfully.`);
  } finally {
    await connection.end();
  }
}

initDatabase().catch((error) => {
  console.error("Database initialization failed:", error.message);
  process.exit(1);
});
