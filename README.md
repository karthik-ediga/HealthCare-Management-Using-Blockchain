# 🩺 Modern Web 3.0 Blockchain Applications for Healthcare Enhancement

A decentralized, patient-sovereign healthcare management platform powered by **Ethereum Smart Contracts**, **Solidity**, **Ethers.js (v6)**, and **React + Vite**.

This project modernizes healthcare workflows by placing data ownership firmly in the hands of patients, guaranteeing cryptographic integrity, establishing cryptocurrency escrow for medical consultations, and automating insurance claim settlement.

---

## 🌟 Key Features

### 1. Decentralized Storage & Cryptographic Verification
- **Zero-Knowledge Architecture:** Sensitive clinical records remain securely off-chain (IPFS or encrypted storage).
- **Cryptographic Checksum:** Client-side SHA-256 hash calculation verifies that records are tamper-proof before anchoring references on-chain.
- **Categorized Clinical Records:** Supports *Medical History*, *Lab Reports*, *Prescriptions*, *Consultation Notes*, and *Payment Logs*.
- **Integrity Inspector:** Live modal to inspect off-chain URI pointers and verify SHA-256 hashes against smart contract state.

### 2. Patient-Controlled Access & Consent Workflow
- **Doctor-to-Patient Access Requests:** Clinicians submit on-chain access requests specifying medical rationale (e.g., *Cardiology review*).
- **Inbound Consent Queue:** Patients review pending clinician requests and approve or decline with a single transaction.
- **Revocation at Any Time:** Patients can revoke doctor permissions immediately, causing future smart contract read queries to revert.

### 3. Cryptocurrency Escrow for Consultations
- **Verified Clinician Directory:** Browse approved doctors with verifiable credentials, specialties, and consultation fees in ETH.
- **Smart Contract Escrow:** Patient booking fees are held in contract escrow until the visit is completed.
- **Automated Refunds:** If a clinician declines or the patient cancels prior to confirmation, funds are automatically refunded.
- **Escrow Payout:** Once completed, the fee is released to the clinician.

### 4. Automated Insurance Claim Settlement
- **Encrypted Evidence Pointers:** Patients submit claims with off-chain encrypted billing/discharge references.
- **Insurer Liquidity Pool:** Approved insurers fund and manage an on-chain claims reserve pool.
- **One-Click Settlement:** Approved claims trigger immediate contract-to-wallet ETH transfers to the patient.

### 5. Local Preview & MetaMask Integration
- **Local Preview:** The website opens with prefilled healthcare entries and simulated interactions for trying the interface.
- **Live MetaMask:** Connect a browser wallet and sign transactions on a local node or configured test network.

---

## 🏗️ Architecture & Smart Contracts

```
contracts/
├── HealthCarePlatform.sol   # Unified platform combining records, access, escrow, and claims
├── HealthRecords.sol        # Modular patient-controlled medical records & access request system
├── Appointment.sol          # Modular appointment scheduling with cryptocurrency escrow
└── Insurance.sol            # Modular insurance claim submission, review, and pool settlement
```

### User Roles & Permissions
| Role | Capabilities |
| :--- | :--- |
| **Patient** | Upload encrypted records, approve/decline doctor access requests, book escrowed visits, and submit insurance claims. |
| **Doctor** | Request patient record access, review authorized records, accept/complete appointments, receive escrow payouts. |
| **Insurer** | Fund insurance claims pool, inspect submitted claims, approve & disburse payouts or decline claims. |
| **Administrator** | Approve/revoke verified clinicians and insurers, audit liquidity pools, govern protocol parameters. |

---

## ⚙️ How to Run the Project

### Prerequisites
- [Node.js](https://nodejs.org/) (v18 or v20+)
- [MetaMask Chrome Extension](https://metamask.io/) (for Live Web3 mode)

### 1. Install Dependencies
```bash
npm install
```

### 2. Run Smart Contract Test Suite
Verify that all access control, escrow, and claim test cases pass:
```bash
npm run test
```

### 3. Start Local Blockchain & Deploy Contracts
In **Terminal 1**, start the local Hardhat node:
```bash
npm run node
```

In **Terminal 2**, deploy the smart contracts:
```bash
npm run deploy:local
```
*This command deploys both unified and modular contracts, seeds test accounts (doctor, insurer), funds the claims pool, and automatically populates `.env.local`.*

### 4. Launch the Web Application
```bash
npm run dev
```
Open [http://localhost:4173](http://localhost:4173) in your browser.

---

## 👨‍⚕️ Step-by-Step Use Case Walkthrough

1. **Upload an Encrypted Record:**
   - Under **Medical Records**, select a category (e.g. *Lab Report*), choose a file to compute its SHA-256 hash, and click **Add to blockchain**.
2. **Doctor Requests Access:**
   - Connect the approved clinician wallet.
   - In **Access Control**, search the patient's address and click **Request Medical Access**.
3. **Patient Grants Permission:**
   - Reconnect the patient wallet.
   - In **Access Control**, view the pending request in the **Inbound Consent Queue** and click **Approve Access**.
4. **Doctor Views Records:**
   - Reconnect the clinician wallet; search the patient's wallet to see authorized records.
5. **Book Consultation with Crypto Escrow:**
   - Under **Appointments**, select a clinician and book a slot. The consultation fee is locked in smart contract escrow.
   - The doctor accepts the booking; upon visit completion, the fee is disbursed to the doctor.
6. **Settle Insurance Claim:**
   - Patient submits an insurance claim under **Insurance Claims**.
   - Connect the approved insurer wallet to approve and disburse funds from the liquidity pool.

---

## 🧪 Testing & Validation
Run Hardhat contract tests for access, appointments, profiles, and claims:
```bash
npx hardhat test
```

Compile smart contracts:
```bash
npx hardhat compile
```

Build production frontend bundle:
```bash
npm run build
```

---

## 📄 Security & Privacy Boundaries
- **No Identifiable Data On-Chain:** Never place unencrypted clinical data, names, or patient identifiers on the blockchain.
- **Client-Side Hashing:** Hashes are computed in the user's browser via the Web Cryptography API (`crypto.subtle.digest`).
- **Access Enforcement:** On-chain permissions restrict smart contract read methods to authorized addresses only.
- *Disclaimer: This software is an educational prototype and demonstration of Web 3.0 healthcare coordination.*