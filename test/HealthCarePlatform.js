const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("HealthCarePlatform", function () {
  async function deployPlatform() {
    const [owner, patient, doctor, insurer, outsider] = await ethers.getSigners();
    const Platform = await ethers.getContractFactory("HealthCarePlatform");
    const platform = await Platform.deploy();
    await platform.waitForDeployment();
    await platform.setDoctorApproval(doctor.address, true);
    await platform.setInsurerApproval(insurer.address, true);
    return { platform, owner, patient, doctor, insurer, outsider };
  }

  it("requires patient consent before an approved doctor can add a record", async function () {
    const { platform, patient, doctor, outsider } = await deployPlatform();
    const digest = ethers.keccak256(ethers.toUtf8Bytes("encrypted-report"));
    await expect(platform.connect(doctor).addRecord(patient.address, "ipfs://encrypted-cid", digest))
      .to.be.revertedWith("No patient authorization");
    await platform.connect(patient).setRecordAccess(doctor.address, true);
    await platform.connect(doctor).addRecord(patient.address, "ipfs://encrypted-cid", digest);
    expect(await platform.connect(doctor).getPatientRecordIds(patient.address)).to.deep.equal([1n]);
    await platform.connect(patient).setRecordAccess(doctor.address, false);
    await expect(platform.connect(doctor).getPatientRecordIds(patient.address)).to.be.revertedWith("No patient authorization");
    await expect(platform.connect(doctor).getRecord(1)).to.be.revertedWith("No patient authorization");
    await expect(platform.connect(outsider).getRecord(1)).to.be.revertedWith("No patient authorization");
  });

  it("escrows appointment payments until completion and refunds rejected bookings", async function () {
    const { platform, patient, doctor } = await deployPlatform();
    const fee = ethers.parseEther("0.02");
    const latest = await ethers.provider.getBlock("latest");
    await platform.connect(patient).bookAppointment(doctor.address, latest.timestamp + 3600, { value: fee });
    await expect(platform.connect(doctor).completeAppointment(1)).to.be.revertedWith("Appointment not confirmed");
    await platform.connect(doctor).respondToAppointment(1, true);
    await expect(platform.connect(patient).completeAppointment(1)).to.be.revertedWith("Appointment time has not passed");
    await ethers.provider.send("evm_setNextBlockTimestamp", [latest.timestamp + 3601]);
    const before = await ethers.provider.getBalance(doctor.address);
    await platform.connect(patient).completeAppointment(1);
    expect(await ethers.provider.getBalance(doctor.address)).to.equal(before + fee);

    await platform.connect(patient).bookAppointment(doctor.address, latest.timestamp + 7200, { value: fee });
    await expect(platform.connect(doctor).respondToAppointment(2, false))
      .to.emit(platform, "AppointmentUpdated").withArgs(2, 3);
  });

  it("allows only approved insurers to resolve funded claims once", async function () {
    const { platform, patient, insurer, outsider } = await deployPlatform();
    const amount = ethers.parseEther("0.01");
    await platform.connect(patient).submitClaim("ipfs://encrypted-claim", amount);
    await expect(platform.connect(outsider).resolveClaim(1, true)).to.be.revertedWith("Only approved insurer");
    await platform.fundClaimPool({ value: amount });
    await expect(platform.connect(insurer).resolveClaim(1, true)).to.emit(platform, "ClaimResolved").withArgs(1, 1);
    await expect(platform.connect(insurer).resolveClaim(1, false)).to.be.revertedWith("Claim already resolved");
  });

  it("supports doctor access requests and patient approval flow", async function () {
    const { platform, patient, doctor } = await deployPlatform();
    const digest = ethers.keccak256(ethers.toUtf8Bytes("lab-report-data"));

    // Patient adds own record
    await platform.connect(patient).addRecordWithDetails(
      patient.address,
      "ipfs://bafybeicid123",
      digest,
      1, // LabReport
      "Comprehensive Blood Panel",
      "Encrypted lab diagnostic panel"
    );

    // Doctor requests access
    await expect(platform.connect(doctor).requestRecordAccess(patient.address, "Cardiology consultation review"))
      .to.emit(platform, "AccessRequested")
      .withArgs(1, patient.address, doctor.address, "Cardiology consultation review");

    // Doctor cannot view yet
    await expect(platform.connect(doctor).getPatientRecordIds(patient.address)).to.be.revertedWith("No patient authorization");

    // Patient approves access
    await expect(platform.connect(patient).respondToAccessRequest(1, true))
      .to.emit(platform, "RecordAccessChanged")
      .withArgs(patient.address, doctor.address, true);

    // Doctor can now view patient's records and meta
    const recordIds = await platform.connect(doctor).getPatientRecordIds(patient.address);
    expect(recordIds.length).to.equal(1);
    const meta = await platform.connect(doctor).getRecordMeta(1);
    expect(meta.title).to.equal("Comprehensive Blood Panel");
    expect(meta.recordType).to.equal(1);
  });

  it("allows registration of doctor and patient profiles", async function () {
    const { platform, patient, doctor } = await deployPlatform();

    await platform.connect(doctor).registerDoctor("Dr. Sarah Chen", "Cardiologist", "MD-98421", ethers.parseEther("0.05"));
    const docProfile = await platform.doctorProfiles(doctor.address);
    expect(docProfile.name).to.equal("Dr. Sarah Chen");
    expect(docProfile.specialty).to.equal("Cardiologist");

    await platform.connect(patient).registerPatient("Alice Smith", "hash-contact", "O+");
    const patProfile = await platform.patientProfiles(patient.address);
    expect(patProfile.name).to.equal("Alice Smith");
    expect(patProfile.bloodGroup).to.equal("O+");
  });

  it("supports time-limited access and audit logging", async function () {
    const { platform, patient, doctor } = await deployPlatform();
    const digest = ethers.keccak256(ethers.toUtf8Bytes("urgent-care-report"));

    await platform.connect(patient).addRecordWithDetails(
      patient.address,
      "ipfs://bafybeiauditrecord",
      digest,
      3,
      "Follow-up Notes",
      "Encrypted follow-up summary"
    );

    await platform.connect(patient).setRecordAccessWithPolicy(doctor.address, true, 86400, "Cardiology review");
    const policy = await platform.getAccessPolicy(patient.address, doctor.address);
    expect(policy.granted).to.equal(true);
    expect(policy.validForSeconds).to.equal(86400n);
    expect(policy.purpose).to.equal("Cardiology review");

    await expect(platform.connect(doctor).getPatientRecordIds(patient.address)).to.not.be.reverted;
    const auditCount = await platform.getAccessLogCount(patient.address);
    expect(auditCount).to.equal(1n);

    const audit = await platform.getAccessLog(patient.address, 0);
    expect(audit.doctor).to.equal(doctor.address);
    expect(audit.purpose).to.equal("Cardiology review");
    expect(audit.granted).to.equal(true);
  });

});