INSERT INTO users (name, email, password, role, wallet) VALUES
  ('Emma Johnson', 'emma.patient@medledger.local', 'patient123', 'patient', '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'),
  ('Daniel Carter', 'daniel.patient@medledger.local', 'patient456', 'patient', '0x4b0897b0513fDc7C541B6D9D7E7eE1ed9AB1D1B3'),
  ('Noah Patel', 'noah.patient@medledger.local', 'patient789', 'patient', '0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc'),
  ('Aisha Rahman', 'aisha.patient@medledger.local', 'patient321', 'patient', '0x8c1c302f0c9d99f8d3d1b6dffca994d87d4b8f45'),
  ('Dr. Hannah Lee', 'hannah.doctor@medledger.local', 'doctor123', 'doctor', '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC'),
  ('Dr. Priya Shah', 'priya.doctor@medledger.local', 'doctor456', 'doctor', '0x90F79bf6EB2c4f870365E785982E1f101E93b906'),
  ('Dr. Marcus Reed', 'marcus.doctor@medledger.local', 'doctor789', 'doctor', '0x15d34AaF54267DB7D3c7e4f502A0B4bd4C0f1e5a'),
  ('System Admin', 'admin@medledger.local', 'admin123', 'administrator', '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266')
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  password = VALUES(password),
  role = VALUES(role),
  wallet = VALUES(wallet);

INSERT INTO patient_profiles (user_id, blood_group, emergency_contact, allergies) VALUES
  (1, 'O+', '+1 555 010 222', 'Penicillin'),
  (2, 'A-', '+1 555 010 334', 'Peanuts, Sulfa drugs'),
  (3, 'B+', '+1 555 010 556', 'Latex'),
  (4, 'AB-', '+1 555 010 778', 'None noted')
ON DUPLICATE KEY UPDATE
  blood_group = VALUES(blood_group),
  emergency_contact = VALUES(emergency_contact),
  allergies = VALUES(allergies);

INSERT INTO doctor_profiles (user_id, specialty, license_number, consultation_fee) VALUES
  (5, 'Cardiology & Internal Medicine', 'MED-CA-88349', '0.02 ETH'),
  (6, 'Endocrinology', 'MED-EN-20418', '0.018 ETH'),
  (7, 'Orthopedics', 'MED-OR-77112', '0.024 ETH')
ON DUPLICATE KEY UPDATE
  specialty = VALUES(specialty),
  license_number = VALUES(license_number),
  consultation_fee = VALUES(consultation_fee);

INSERT INTO records (patient_id, author_id, title, category, description, encrypted_uri, digest) VALUES
  (1, 1, 'Annual Wellness Medical History', 'Medical History', 'No major issues. Blood pressure stable. Annual screening due in Q4.', 'ipfs://bafybeihdwdcefgh456789alicecardio', '0x8f434346648f6b96df89dda901c5176b10a6d83961dd3c1ac88b59b2dc327aa4'),
  (1, 5, 'Lipid Panel Report', 'Lab Report', 'HDL 58 mg/dL, LDL 112 mg/dL, triglycerides 140 mg/dL.', 'ipfs://bafybeigrx998234prescriptiondrch', '0x3b9a5286cd6e695d7f12e873b22b6a98299292a1040ef3dd2e7f415cba27931c'),
  (1, 5, 'Atorvastatin Prescription', 'Prescription', 'Take 10 mg daily after dinner. Follow-up consultation in 6 weeks.', 'ipfs://bafybeiclinicalnoteafternoonreview', '0x9a1112dc7eb8a87c12d6a8f3933cfd1fc4748f44f107e2f7433d16f3bd35d9be'),
  (2, 2, 'Diabetes Care Plan', 'Medical History', 'Type 2 diabetes management plan includes nutrition and exercise coaching.', 'ipfs://bafybeidialysisreviewmondayplan', '0x2fd91ec0dd0ba07cf897cdad1caed1d1c009d2b1bf4d7f5487a1d0c9f3438d91'),
  (2, 6, 'HbA1c Lab Results', 'Lab Report', 'HbA1c reduced from 8.4% to 7.1% after medication optimization.', 'ipfs://bafybeiglucosepanelreview', '0x6d9f87f1f4ed3d80b1ad3b2d12d4991bbb7d4d861d3cc9570afa0b80cb4027d9'),
  (3, 3, 'Orthopedic Injury Summary', 'Clinical Note', 'Lower back pain reported after lifting; physiotherapy referral issued.', 'ipfs://bafybeimobilitynotesummary', '0x91c0eafebea2eb68f9b5b4d9db6f7d5eb2368c7e68d6b0c3697ba6d9eaf2edb9'),
  (3, 7, 'X-Ray Follow-Up', 'Imaging', 'No fracture detected. Mild disc inflammation noted on L4-L5.', 'ipfs://bafybeixrayfollowupmedial', '0x2a3ec41ca1006de411d9e84f2c843b8d2d0f1ea74469998a53cf41cfe620500a'),
  (4, 4, 'Postpartum Checkup', 'Medical History', 'Patient reports fatigue and anemia screening ordered for follow-up.', 'ipfs://bafybeimaternalcarefollowup', '0x44f1b09dfca3ce545d4358b9f9a1237c3709fa5f4d6d042ba6af073ee7dbd4aa')
ON DUPLICATE KEY UPDATE
  title = VALUES(title),
  category = VALUES(category),
  description = VALUES(description),
  encrypted_uri = VALUES(encrypted_uri),
  digest = VALUES(digest);

INSERT INTO appointments (patient_id, doctor_id, starts_at, fee, status) VALUES
  (1, 5, DATE_ADD(NOW(), INTERVAL 3 DAY), 0.02, 'pending'),
  (1, 5, DATE_ADD(NOW(), INTERVAL -3 DAY), 0.02, 'completed'),
  (2, 6, DATE_ADD(NOW(), INTERVAL 5 DAY), 0.018, 'accepted'),
  (2, 6, DATE_ADD(NOW(), INTERVAL -7 DAY), 0.018, 'completed'),
  (3, 7, DATE_ADD(NOW(), INTERVAL 2 DAY), 0.024, 'pending'),
  (4, 5, DATE_ADD(NOW(), INTERVAL -10 DAY), 0.02, 'cancelled')
ON DUPLICATE KEY UPDATE
  fee = VALUES(fee),
  status = VALUES(status);

INSERT INTO access_logs (patient_id, doctor_id, purpose, granted, expires_at) VALUES
  (1, 5, 'Cardiology review', TRUE, DATE_ADD(NOW(), INTERVAL 30 DAY)),
  (1, 6, 'Second opinion on diabetic labs', TRUE, DATE_ADD(NOW(), INTERVAL 20 DAY)),
  (2, 6, 'Endocrinology consultation', TRUE, DATE_ADD(NOW(), INTERVAL 45 DAY)),
  (3, 7, 'Orthopedic imaging review', TRUE, DATE_ADD(NOW(), INTERVAL 15 DAY)),
  (4, 5, 'Follow-up after maternity observation', TRUE, DATE_ADD(NOW(), INTERVAL 25 DAY))
ON DUPLICATE KEY UPDATE
  purpose = VALUES(purpose),
  granted = VALUES(granted),
  expires_at = VALUES(expires_at);

INSERT INTO insurance_claims (patient_id, insurer_name, claim_number, claim_amount, encrypted_evidence_uri, reason, status) VALUES
  (1, 'BlueCross Health', 'BC-2026-1041', 0.015, 'ipfs://bafybeiclaimproof8984920evidence', 'Cardiology consultation and lab coverage', 'approved'),
  (2, 'CareSecure Plus', 'CS-2026-2189', 0.020, 'ipfs://bafybeiclearclaimlabinvoice2026', 'Diabetes monitoring and insulin prescription', 'pending'),
  (4, 'National Care Cover', 'NC-2026-3002', 0.011, 'ipfs://bafybeimissedfollowupcareinvoice', 'Prenatal follow-up and diagnostic screening', 'paid')
ON DUPLICATE KEY UPDATE
  insurer_name = VALUES(insurer_name),
  claim_amount = VALUES(claim_amount),
  encrypted_evidence_uri = VALUES(encrypted_evidence_uri),
  reason = VALUES(reason),
  status = VALUES(status);

INSERT INTO access_requests (patient_id, doctor_id, reason, status) VALUES
  (1, 5, 'Review cholesterol trends for medication update', 'approved'),
  (2, 6, 'Request access to glucose monitoring history', 'pending'),
  (3, 7, 'Assess recovery plan after ligament strain', 'approved'),
  (4, 5, 'Consent for postpartum wellness checkup', 'rejected')
ON DUPLICATE KEY UPDATE
  reason = VALUES(reason),
  status = VALUES(status);
