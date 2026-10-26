const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("Starting Web 3.0 Healthcare Platform deployment...");
  const [deployer, patientAccount, doctorAccount] = await ethers.getSigners();
  console.log(`Deploying with account: ${deployer.address}`);

  // 1. Deploy unified platform
  const PlatformFactory = await ethers.getContractFactory("HealthCarePlatform");
  const platform = await PlatformFactory.deploy();
  await platform.waitForDeployment();
  const platformAddress = await platform.getAddress();
  console.log(`[✔] HealthCarePlatform deployed to: ${platformAddress}`);

  // 2. Deploy modular standalone contracts
  const RecordsFactory = await ethers.getContractFactory("HealthRecords");
  const healthRecords = await RecordsFactory.deploy();
  await healthRecords.waitForDeployment();
  const healthRecordsAddress = await healthRecords.getAddress();
  console.log(`[✔] HealthRecords (Modular) deployed to: ${healthRecordsAddress}`);

  const AppointmentFactory = await ethers.getContractFactory("Appointment");
  const appointment = await AppointmentFactory.deploy();
  await appointment.waitForDeployment();
  const appointmentAddress = await appointment.getAddress();
  console.log(`[✔] Appointment (Modular) deployed to: ${appointmentAddress}`);

  // Seed demo setup if multiple signers exist (e.g., in local hardhat/ganache node)
  if (patientAccount && doctorAccount) {
    try {
      console.log("Seeding test roles...");
      await platform.setDoctorApproval(doctorAccount.address, true);

      // Register doctor profile
      await platform.connect(doctorAccount).registerDoctor(
        "Dr. Sarah Chen, MD",
        "Cardiology & Internal Medicine",
        "MED-CA-88349",
        ethers.parseEther("0.02")
      );

      // Register patient profile
      await platform.connect(patientAccount).registerPatient(
        "Alice Smith",
        "emergency-contact-9921",
        "O+"
      );

      console.log(`[✔] Pre-registered Patient: ${patientAccount.address} (Alice Smith)`);
      console.log(`[✔] Pre-approved Clinician: ${doctorAccount.address} (Dr. Sarah Chen)`);
    } catch (e) {
      console.log("Skipping seed setup (non-local or insufficient funds):", e.message);
    }
  }

  // Update .env.local for Vite frontend
  const envContent = [
    `VITE_CONTRACT_ADDRESS=${platformAddress}`,
    `VITE_HEALTH_RECORDS_ADDRESS=${healthRecordsAddress}`,
    `VITE_APPOINTMENT_ADDRESS=${appointmentAddress}`
  ].join("\n") + "\n";

  const envPath = path.resolve(__dirname, "..", ".env.local");
  fs.writeFileSync(envPath, envContent, "utf8");
  console.log(`[✔] Wrote contract addresses to .env.local`);
  console.log("\nDeployment completed successfully!");
}

main().catch((error) => {
  console.error("Deployment failed:", error);
  process.exitCode = 1;
});