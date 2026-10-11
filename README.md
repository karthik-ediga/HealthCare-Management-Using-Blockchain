# MedLedger Healthcare Portal

This project is a role-based healthcare management application with a MySQL-backed login system and department-specific sections for patients, doctors, and administrators. It is designed to provide a realistic healthcare dashboard with records, appointments, access requests, and insurance claim data in a structured format.

---

## Project Overview

The application includes the following major sections:

- Login
- Overview Dashboard
- Patients
- Doctors
- Medical Records
- Appointments
- Access Control
- Insurance Claims
- Administration

The app is connected to a local MySQL database named `Mediccal_data` and uses a dedicated database connection file for credentials and connection configuration.

---

## Database Connection File

Use the credentials in the `.env` file and the connection logic in `backend/dbConnection.js`.

### Database credentials

```env
DB_HOST=127.0.0.1
DB_USER=root
DB_PASSWORD=karthik4321@2005
DB_NAME=Mediccal_data
DB_PORT=3306
JWT_SECRET=medledger-demo-secret
NODE_ENV=development
```

### Connection file

```js
const mysql = require("mysql2/promise");
require("dotenv").config();

const dbConfig = {
  host: process.env.DB_HOST || "127.0.0.1",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "Mediccal_data",
  port: Number(process.env.DB_PORT || 3306),
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  timezone: "+00:00"
};

const pool = mysql.createPool(dbConfig);

module.exports = {
  pool,
  dbConfig
};
```

> File to update with the database credentials: `.env`
> File containing the database connection logic: `backend/dbConnection.js`

---

## Database Structure

The database schema contains the following tables:

- `users`
- `patient_profiles`
- `doctor_profiles`
- `records`
- `appointments`
- `access_logs`
- `insurance_claims`
- `access_requests`

Core schema summary:

```sql
CREATE DATABASE IF NOT EXISTS `Mediccal_data`;
USE `Mediccal_data`;

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(150) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  role ENUM('patient', 'doctor', 'administrator') NOT NULL,
  wallet VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## Login Credentials

The system includes login accounts for all three roles.

| ID | Name | Email | Password | Role | Wallet |
|---:|---|---|---|---|---|
| 1 | Emma Johnson | emma.patient@medledger.local | patient123 | patient | 0x70997970C51812dc3A010C7d01b50e0d17dc79C8 |
| 2 | Daniel Carter | daniel.patient@medledger.local | patient456 | patient | 0x4b0897b0513fDc7C541B6D9D7E7eE1ed9AB1D1B3 |
| 3 | Noah Patel | noah.patient@medledger.local | patient789 | patient | 0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc |
| 4 | Aisha Rahman | aisha.patient@medledger.local | patient321 | patient | 0x8c1c302f0c9d99f8d3d1b6dffca994d87d4b8f45 |
| 5 | Dr. Hannah Lee | hannah.doctor@medledger.local | doctor123 | doctor | 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC |
| 6 | Dr. Priya Shah | priya.doctor@medledger.local | doctor456 | doctor | 0x90F79bf6EB2c4f870365E785982E1f101E93b906 |
| 7 | Dr. Marcus Reed | marcus.doctor@medledger.local | doctor789 | doctor | 0x15d34AaF54267DB7D3c7e4f502A0B4bd4C0f1e5a |
| 8 | System Admin | admin@medledger.local | admin123 | administrator | 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 |

These credentials work with the MySQL database and are used by the login API at `/api/login`.

---

## Role-Based Sections and Access Logic

The current MySQL-backed login flow supports three roles: `patient`, `doctor`, and `administrator`.

### Patient
- View their own medical records, appointments, and insurance claims.
- Add their own medical records and submit insurance claims.
- Book appointments with listed doctors and cancel pending appointments.
- Approve or decline doctor access requests, grant record access directly, and revoke access.

### Doctor
- View patient records only while the patient has granted active access.
- Request access to a patient's records; the patient must approve the request.
- View their assigned appointments, accept or decline pending appointments, and complete accepted appointments after the scheduled time.
- The database-backed login flow does not let doctors add records or submit insurance claims.

### Administrator
- View the account directory and all records, appointments, and claims in the database-backed dashboard.
- Review and approve or decline demo insurance claims.
- The dashboard API also returns access requests and access logs to administrators, though the current administrator UI does not display the Access Control view.
- Approving doctors and insurers is a blockchain contract-owner operation, not an administrator action in database demo mode.

### Access and Role Notes
- Accepting an appointment does **not** grant a doctor access to medical records. Patient consent is a separate step; database-backed approvals grant access for 30 days.
- There is no insurer role in the MySQL login schema or role selector. In the database demo, administrators review claims. On-chain, claim resolution requires an approved insurer.
- These permissions describe the MySQL-backed login flow. Blockchain permissions apply only when the app is connected to a deployed contract and wallet.

---

## Seeded Data by Section

### 1) Overview

```json
{
  "users": 8,
  "patients": 4,
  "doctors": 3,
  "medicalRecords": 8,
  "appointments": 6,
  "pendingAccessRequests": 1,
  "insuranceClaims": 3
}
```

### 2) Patient Profiles

| User ID | Blood Group | Emergency Contact | Allergies |
|---:|---|---|---|
| 1 | O+ | +1 555 010 222 | Penicillin |
| 2 | A- | +1 555 010 334 | Peanuts, Sulfa drugs |
| 3 | B+ | +1 555 010 556 | Latex |
| 4 | AB- | +1 555 010 778 | None noted |

### 3) Doctor Directory

| User ID | Specialty | License Number | Consultation Fee |
|---:|---|---|---|
| 5 | Cardiology & Internal Medicine | MED-CA-88349 | 0.02 ETH |
| 6 | Endocrinology | MED-EN-20418 | 0.018 ETH |
| 7 | Orthopedics | MED-OR-77112 | 0.024 ETH |

### 4) Medical Records

| ID | Patient ID | Author ID | Title | Category | Description |
|---:|---:|---:|---|---|---|
| 1 | 1 | 1 | Annual Wellness Medical History | Medical History | No major issues. Blood pressure stable. Annual screening due in Q4. |
| 2 | 1 | 5 | Lipid Panel Report | Lab Report | HDL 58 mg/dL, LDL 112 mg/dL, triglycerides 140 mg/dL. |
| 3 | 1 | 5 | Atorvastatin Prescription | Prescription | Take 10 mg daily after dinner. Follow-up consultation in 6 weeks. |
| 4 | 2 | 2 | Diabetes Care Plan | Medical History | Type 2 diabetes management plan includes nutrition and exercise coaching. |
| 5 | 2 | 6 | HbA1c Lab Results | Lab Report | HbA1c reduced from 8.4% to 7.1% after medication optimization. |
| 6 | 3 | 3 | Orthopedic Injury Summary | Clinical Note | Lower back pain reported after lifting; physiotherapy referral issued. |
| 7 | 3 | 7 | X-Ray Follow-Up | Imaging | No fracture detected. Mild disc inflammation noted on L4-L5. |
| 8 | 4 | 4 | Postpartum Checkup | Medical History | Patient reports fatigue and anemia screening ordered for follow-up. |

### 5) Appointments

| ID | Patient ID | Doctor ID | Date/Time | Fee | Status |
|---:|---:|---:|---|---|---|
| 1 | 1 | 5 | 2026-10-12T19:01:32.000Z | 0.02000000 | pending |
| 2 | 1 | 5 | 2026-10-06T19:01:32.000Z | 0.02000000 | completed |
| 3 | 2 | 6 | 2026-10-14T19:01:32.000Z | 0.01800000 | accepted |
| 4 | 2 | 6 | 2026-10-02T19:01:32.000Z | 0.01800000 | completed |
| 5 | 3 | 7 | 2026-10-11T19:01:32.000Z | 0.02400000 | pending |
| 6 | 4 | 5 | 2026-09-29T19:01:32.000Z | 0.02000000 | cancelled |

### 6) Access Requests

| ID | Patient ID | Doctor ID | Reason | Status |
|---:|---:|---:|---|---|
| 1 | 1 | 5 | Review cholesterol trends for medication update | approved |
| 2 | 2 | 6 | Request access to glucose monitoring history | pending |
| 3 | 3 | 7 | Assess recovery plan after ligament strain | approved |
| 4 | 4 | 5 | Consent for postpartum wellness checkup | rejected |

### 7) Access Logs

| ID | Patient ID | Doctor ID | Purpose | Granted | Expires At |
|---:|---:|---:|---|---|---|
| 1 | 1 | 5 | Cardiology review | 1 | 2026-11-08T19:01:32.000Z |
| 2 | 1 | 6 | Second opinion on diabetic labs | 1 | 2026-10-29T19:01:32.000Z |
| 3 | 2 | 6 | Endocrinology consultation | 1 | 2026-11-23T19:01:32.000Z |
| 4 | 3 | 7 | Orthopedic imaging review | 1 | 2026-10-24T19:01:32.000Z |
| 5 | 4 | 5 | Follow-up after maternity observation | 1 | 2026-11-03T19:01:32.000Z |

### 8) Insurance Claims

| ID | Patient ID | Insurer Name | Claim Number | Claim Amount | Status |
|---:|---:|---|---|---|---|
| 1 | 1 | BlueCross Health | BC-2026-1041 | 0.01500000 | approved |
| 2 | 2 | CareSecure Plus | CS-2026-2189 | 0.02000000 | pending |
| 3 | 4 | National Care Cover | NC-2026-3002 | 0.01100000 | paid |

---

## Blockchain & Decentralization

This project combines a healthcare dashboard with blockchain-backed logic to demonstrate how decentralization can support trust, traceability, and controlled access in a medical data environment.

### Core blockchain architecture

- Smart contract framework: Solidity with Hardhat
- Ethereum-compatible development workflow
- Frontend blockchain integration: Ethers.js + MetaMask
- Contract interaction layer: `src/contract.js`
- Main on-chain logic: `contracts/HealthCarePlatform.sol`

### Decentralized healthcare features

- Patient record ownership and controlled access are modeled through on-chain permission logic.
- Doctor approval and insurer approval are managed through smart contract mappings and admin-controlled functions.
- Access requests and consent flows can be represented in a more transparent and auditable way than a centralized database alone.
- Appointment booking can include escrow-style payment logic and transaction-based status updates.
- Claim submission and claim resolution can be tracked through contract events and on-chain state changes.
- The platform supports a Web3 wallet-based interaction model using MetaMask for identity and transaction signing.

### Smart contracts in the project

- `HealthCarePlatform.sol` — the primary healthcare contract for records, access policies, appointments, and insurance claim workflows.
- `HealthRecords.sol` — record-related logic and medical file handling.
- `Appointment.sol` — booking, scheduling, accept/reject operations, and appointment status updates.
- `Insurance.sol` — claim lifecycle management and payout-related logic.

### Web3 integration details

The frontend connects to the blockchain through the contract abstraction in `src/contract.js` and the wallet flow in `src/App.jsx`.

Typical environment variables used for connectivity include:

```env
VITE_CONTRACT_ADDRESS=0x...
VITE_HEALTH_RECORDS_ADDRESS=0x...
VITE_APPOINTMENT_ADDRESS=0x...
VITE_INSURANCE_ADDRESS=0x...
```

These values are generated after contract deployment using `scripts/deploy.js` and stored in `.env.local` for the frontend.

### Why decentralization is useful here

- Improves trust through transparent, auditable transactions.
- Reduces dependence on a single central authority for healthcare workflow enforcement.
- Creates a verifiable ledger for permission changes, appointments, and claims.
- Helps demonstrate a realistic hybrid model where MySQL supports the app UI and blockchain adds trust and traceability.

### Important note

This is a healthcare demo platform and not a production-grade hospital ledger. The app uses MySQL for structured user login and business data, while the blockchain layer demonstrates decentralized governance, access control, and smart-contract-based healthcare workflows.

### Blockchain + MySQL hybrid architecture

This project is designed as a hybrid healthcare application:

- MySQL handles user authentication, healthcare records, appointments, access requests, and insurance data in a structured database format.
- Smart contracts handle the trust layer for decentralized identity, role permissions, transaction-based workflows, and contract-level auditability.
- The frontend connects to both systems: it authenticates with the database and can also connect to MetaMask for blockchain-based actions.

In practical terms:

1. A user logs in through the MySQL-backed role system.
2. The dashboard loads patient, doctor, and admin data from the database.
3. Wallet-connected actions such as record verification, appointment booking, and claim processing can be executed through the blockchain contract.
4. The blockchain acts as a transparent execution layer, while the database provides quick structured access for day-to-day app operations.

This hybrid design makes the project easier to demonstrate, easier to test locally, and more realistic for a healthcare management prototype.

---

## Setup Instructions

### Install dependencies

```bash
npm install
```

### Initialize the database

```bash
npm run db:init
```

This script creates the database and inserts the sample patient, doctor, administrator, medical records, appointments, access requests, and claim data.

### Start the backend server

```bash
npm run server
```

Backend API endpoints include:

- `GET /api/health`
- `POST /api/login`
- `GET /api/dashboard/:role/:userId`

### Start the frontend

```bash
npm run dev
```

Open the app in the browser using:

```text
http://localhost:4173
```

### Local blockchain setup (Hardhat + MetaMask)

If you want to test the smart contract functionality locally:

1. Start a local Ethereum node:

```bash
npx hardhat node
```

2. Deploy the contracts on the local network:

```bash
npx hardhat run scripts/deploy.js --network localhost
```

3. Copy the generated contract addresses from `.env.local` into your frontend environment if needed.

4. Open MetaMask and connect it to the Hardhat local network:
   - Network name: Hardhat Local
   - RPC URL: `http://127.0.0.1:8545`
   - Chain ID: `31337`

5. Import one of the default Hardhat wallet accounts into MetaMask using the private keys shown in the terminal output from `npx hardhat node`.

6. Refresh the app and connect the wallet from the UI. The app will then use the deployed contract address from `VITE_CONTRACT_ADDRESS` for blockchain interactions.

This allows you to test record permissions, appointment flows, and claim logic directly against the blockchain while keeping the SQL-based app data for login and hospital operations.

---

## Important Notes

- The app is configured for MySQL and uses `backend/dbConnection.js` as the central DB connection file.
- The database name is `Mediccal_data`.
- The local host is `127.0.0.1`.
- The MySQL port is `3306`.
- Login credentials are stored in the database and are not hardcoded in the frontend.
- The seeded data is intentionally structured to simulate realistic medical workflows and role-based access.

---

## Project Summary

This healthcare platform demonstrates a working healthcare portal with:

- role-based login
- patient, doctor, and administrator views
- structured SQL database records
- patient medical history and record access
- appointment scheduling
- doctor access requests
- insurance claim records
- admin-level operational monitoring

This is a functional demo application built around logical healthcare data and role separation, not a production hospital system.
