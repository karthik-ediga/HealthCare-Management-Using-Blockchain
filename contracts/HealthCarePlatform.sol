// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title HealthCarePlatform
 * @notice Modern Web 3.0 Decentralized Healthcare Platform
 * Includes:
 *  - Decentralized, access-controlled patient medical records & checksum validation
 *  - Role-based permissions (Patient, Doctor, Insurer, Admin)
 *  - Doctor-to-Patient access request and approval workflow
 *  - Escrowed appointment booking & crypto settlement
 *  - Insurance claim filing, pool funding, and verification payouts
 *  - Doctor and Patient profile registries
 */
contract HealthCarePlatform {
    address public immutable owner;
    uint256 private _entered = 1;
    uint256 public nextRecordId = 1;
    uint256 public nextAppointmentId = 1;
    uint256 public nextClaimId = 1;
    uint256 public nextRequestId = 1;
    uint256 public claimPoolBalance;

    mapping(address => bool) public approvedDoctors;
    mapping(address => bool) public approvedInsurers;
    mapping(address => mapping(address => bool)) public hasRecordAccess;

    enum RecordType { MedicalHistory, LabReport, Prescription, Consultation, PaymentLog }

    struct Record {
        uint256 id;
        address patient;
        address author;
        string encryptedUri;
        bytes32 digest;
        uint256 createdAt;
    }

    struct RecordMeta {
        uint8 recordType;
        string title;
        string description;
    }

    struct Appointment {
        address patient;
        address doctor;
        uint64 startsAt;
        uint256 fee;
        uint8 status; // 0: Awaiting, 1: Confirmed, 2: Completed, 3: Cancelled
    }

    struct Claim {
        address patient;
        string encryptedEvidenceUri;
        uint256 amount;
        uint8 status; // 0: In review, 1: Approved, 2: Declined
    }

    struct AccessRequest {
        uint256 id;
        address doctor;
        address patient;
        string reason;
        uint8 status; // 0: Pending, 1: Approved, 2: Rejected
        uint256 requestedAt;
    }

    struct DoctorProfile {
        string name;
        string specialty;
        string licenseNumber;
        uint256 consultationFee;
        bool isRegistered;
    }

    struct PatientProfile {
        string name;
        string emergencyContact;
        string bloodGroup;
        bool isRegistered;
    }

    mapping(uint256 => Record) private _records;
    mapping(uint256 => RecordMeta) public recordMeta;
    mapping(address => uint256[]) private _patientRecordIds;
    mapping(uint256 => Appointment) private _appointments;
    mapping(uint256 => Claim) private _claims;
    mapping(uint256 => AccessRequest) private _accessRequests;
    mapping(address => uint256[]) private _patientRequestIds;
    mapping(address => uint256[]) private _doctorRequestIds;

    mapping(address => DoctorProfile) public doctorProfiles;
    mapping(address => PatientProfile) public patientProfiles;
    address[] public doctorDirectory;

    event DoctorApprovalChanged(address indexed doctor, bool approved);
    event InsurerApprovalChanged(address indexed insurer, bool approved);
    event RecordAccessChanged(address indexed patient, address indexed doctor, bool granted);
    event AccessRequested(uint256 indexed requestId, address indexed patient, address indexed doctor, string reason);
    event AccessRequestResolved(uint256 indexed requestId, uint8 status);
    event RecordAdded(uint256 indexed recordId, address indexed patient, address indexed author, string encryptedUri, bytes32 digest, uint256 createdAt);
    event AppointmentBooked(uint256 indexed appointmentId, address indexed patient, address indexed doctor, uint64 startsAt, uint256 fee);
    event AppointmentUpdated(uint256 indexed appointmentId, uint8 status);
    event ClaimSubmitted(uint256 indexed claimId, address indexed patient, uint256 amount, string encryptedEvidenceUri);
    event ClaimResolved(uint256 indexed claimId, uint8 status);
    event ClaimPoolFunded(address indexed funder, uint256 amount);
    event DoctorRegistered(address indexed doctor, string name, string specialty);
    event PatientRegistered(address indexed patient, string name);

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    modifier nonReentrant() {
        require(_entered == 1, "Reentrant call");
        _entered = 2;
        _;
        _entered = 1;
    }

    constructor() {
        owner = msg.sender;
    }

    // --- Profile & Registration ---

    function registerDoctor(
        string calldata name,
        string calldata specialty,
        string calldata licenseNumber,
        uint256 consultationFee
    ) external {
        require(bytes(name).length > 0, "Name required");
        if (!doctorProfiles[msg.sender].isRegistered) {
            doctorDirectory.push(msg.sender);
        }
        doctorProfiles[msg.sender] = DoctorProfile({
            name: name,
            specialty: specialty,
            licenseNumber: licenseNumber,
            consultationFee: consultationFee,
            isRegistered: true
        });
        emit DoctorRegistered(msg.sender, name, specialty);
    }

    function registerPatient(
        string calldata name,
        string calldata emergencyContact,
        string calldata bloodGroup
    ) external {
        require(bytes(name).length > 0, "Name required");
        patientProfiles[msg.sender] = PatientProfile({
            name: name,
            emergencyContact: emergencyContact,
            bloodGroup: bloodGroup,
            isRegistered: true
        });
        emit PatientRegistered(msg.sender, name);
    }

    function getDoctorDirectory() external view returns (address[] memory) {
        return doctorDirectory;
    }

    // --- Admin Role Management ---

    function setDoctorApproval(address doctor, bool approved) external onlyOwner {
        require(doctor != address(0), "Invalid doctor");
        approvedDoctors[doctor] = approved;
        emit DoctorApprovalChanged(doctor, approved);
    }

    function setInsurerApproval(address insurer, bool approved) external onlyOwner {
        require(insurer != address(0), "Invalid insurer");
        approvedInsurers[insurer] = approved;
        emit InsurerApprovalChanged(insurer, approved);
    }

    // --- Access Control & Request Workflow ---

    function setRecordAccess(address doctor, bool granted) external {
        require(approvedDoctors[doctor], "Doctor not approved");
        hasRecordAccess[msg.sender][doctor] = granted;
        emit RecordAccessChanged(msg.sender, doctor, granted);
    }

    function requestRecordAccess(address patient, string calldata reason) external returns (uint256 requestId) {
        require(approvedDoctors[msg.sender], "Doctor not approved");
        require(patient != address(0), "Invalid patient");
        require(patient != msg.sender, "Cannot request own records");

        requestId = nextRequestId++;
        _accessRequests[requestId] = AccessRequest({
            id: requestId,
            doctor: msg.sender,
            patient: patient,
            reason: reason,
            status: 0,
            requestedAt: block.timestamp
        });

        _patientRequestIds[patient].push(requestId);
        _doctorRequestIds[msg.sender].push(requestId);

        emit AccessRequested(requestId, patient, msg.sender, reason);
    }

    function respondToAccessRequest(uint256 requestId, bool approve) external {
        AccessRequest storage req = _accessRequests[requestId];
        require(req.patient == msg.sender, "Only patient can respond");
        require(req.status == 0, "Request already resolved");

        if (approve) {
            req.status = 1;
            hasRecordAccess[msg.sender][req.doctor] = true;
            emit RecordAccessChanged(msg.sender, req.doctor, true);
        } else {
            req.status = 2;
        }

        emit AccessRequestResolved(requestId, req.status);
    }

    function getPatientRequestIds(address patient) external view returns (uint256[] memory) {
        require(msg.sender == patient || approvedDoctors[msg.sender], "Not authorized");
        return _patientRequestIds[patient];
    }

    function getDoctorRequestIds(address doctor) external view returns (uint256[] memory) {
        require(msg.sender == doctor || msg.sender == owner, "Not authorized");
        return _doctorRequestIds[doctor];
    }

    function getAccessRequest(uint256 requestId) external view returns (AccessRequest memory) {
        AccessRequest memory req = _accessRequests[requestId];
        require(req.doctor != address(0), "Request not found");
        require(msg.sender == req.patient || msg.sender == req.doctor || msg.sender == owner, "Not authorized");
        return req;
    }

    // --- Medical Records ---

    function addRecord(address patient, string calldata encryptedUri, bytes32 digest) external {
        _addRecordInternal(patient, encryptedUri, digest, 0, "Medical Record", "");
    }

    function addRecordWithDetails(
        address patient,
        string calldata encryptedUri,
        bytes32 digest,
        uint8 recordType,
        string calldata title,
        string calldata description
    ) external {
        _addRecordInternal(patient, encryptedUri, digest, recordType, title, description);
    }

    function _addRecordInternal(
        address patient,
        string calldata encryptedUri,
        bytes32 digest,
        uint8 recordType,
        string memory title,
        string memory description
    ) internal {
        require(patient != address(0), "Invalid patient");
        require(bytes(encryptedUri).length > 0, "Missing encrypted URI");
        require(
            msg.sender == patient || (approvedDoctors[msg.sender] && hasRecordAccess[patient][msg.sender]),
            "No patient authorization"
        );

        uint256 recordId = nextRecordId++;
        _records[recordId] = Record(recordId, patient, msg.sender, encryptedUri, digest, block.timestamp);
        recordMeta[recordId] = RecordMeta(recordType, title, description);
        _patientRecordIds[patient].push(recordId);

        emit RecordAdded(recordId, patient, msg.sender, encryptedUri, digest, block.timestamp);
    }

    function getPatientRecordIds(address patient) external view returns (uint256[] memory) {
        require(
            msg.sender == patient || (approvedDoctors[msg.sender] && hasRecordAccess[patient][msg.sender]),
            "No patient authorization"
        );
        return _patientRecordIds[patient];
    }

    function getRecord(uint256 recordId) external view returns (Record memory) {
        Record memory record = _records[recordId];
        require(record.patient != address(0), "Record not found");
        require(
            msg.sender == record.patient || (approvedDoctors[msg.sender] && hasRecordAccess[record.patient][msg.sender]),
            "No patient authorization"
        );
        return record;
    }

    function getRecordMeta(uint256 recordId) external view returns (RecordMeta memory) {
        Record memory record = _records[recordId];
        require(record.patient != address(0), "Record not found");
        require(
            msg.sender == record.patient || (approvedDoctors[msg.sender] && hasRecordAccess[record.patient][msg.sender]),
            "No patient authorization"
        );
        return recordMeta[recordId];
    }

    // --- Escrowed Appointments ---

    function bookAppointment(address doctor, uint64 startsAt) external payable nonReentrant returns (uint256 appointmentId) {
        require(approvedDoctors[doctor], "Doctor not approved");
        require(doctor != msg.sender, "Cannot book yourself");
        require(startsAt > block.timestamp, "Appointment must be in the future");
        require(msg.value > 0, "Appointment fee required");

        appointmentId = nextAppointmentId++;
        _appointments[appointmentId] = Appointment(msg.sender, doctor, startsAt, msg.value, 0);
        emit AppointmentBooked(appointmentId, msg.sender, doctor, startsAt, msg.value);
    }

    function respondToAppointment(uint256 appointmentId, bool accept) external nonReentrant {
        Appointment storage appointment = _appointments[appointmentId];
        require(appointment.doctor == msg.sender, "Only assigned doctor");
        require(appointment.status == 0, "Appointment already resolved");

        appointment.status = accept ? 1 : 3;
        emit AppointmentUpdated(appointmentId, appointment.status);
        if (!accept) _sendValue(appointment.patient, appointment.fee);
    }

    function cancelAppointment(uint256 appointmentId) external nonReentrant {
        Appointment storage appointment = _appointments[appointmentId];
        require(appointment.patient == msg.sender, "Only patient");
        require(appointment.status == 0, "Appointment already resolved");
        appointment.status = 3;
        emit AppointmentUpdated(appointmentId, 3);
        _sendValue(appointment.patient, appointment.fee);
    }

    function completeAppointment(uint256 appointmentId) external nonReentrant {
        Appointment storage appointment = _appointments[appointmentId];
        require(msg.sender == appointment.patient || msg.sender == appointment.doctor, "Not an appointment party");
        require(appointment.status == 1, "Appointment not confirmed");
        require(block.timestamp >= appointment.startsAt, "Appointment time has not passed");
        appointment.status = 2;
        emit AppointmentUpdated(appointmentId, 2);

        // Release fee to doctor
        _sendValue(appointment.doctor, appointment.fee);

    }

    function getAppointment(uint256 appointmentId) external view returns (Appointment memory) {
        Appointment memory appointment = _appointments[appointmentId];
        require(appointment.patient != address(0), "Appointment not found");
        require(msg.sender == appointment.patient || msg.sender == appointment.doctor, "Not an appointment party");
        return appointment;
    }

    // --- Insurance Claims & Verification ---

    function submitClaim(string calldata encryptedEvidenceUri, uint256 amount) external returns (uint256 claimId) {
        require(bytes(encryptedEvidenceUri).length > 0, "Missing encrypted evidence URI");
        require(amount > 0, "Claim amount required");
        claimId = nextClaimId++;
        _claims[claimId] = Claim(msg.sender, encryptedEvidenceUri, amount, 0);
        emit ClaimSubmitted(claimId, msg.sender, amount, encryptedEvidenceUri);
    }

    function fundClaimPool() external payable {
        require(msg.value > 0, "Funding amount required");
        claimPoolBalance += msg.value;
        emit ClaimPoolFunded(msg.sender, msg.value);
    }

    function resolveClaim(uint256 claimId, bool approve) external nonReentrant {
        require(approvedInsurers[msg.sender], "Only approved insurer");
        Claim storage claim = _claims[claimId];
        require(claim.patient != address(0), "Claim not found");
        require(claim.status == 0, "Claim already resolved");
        if (approve) require(claimPoolBalance >= claim.amount, "Insufficient claim pool");

        claim.status = approve ? 1 : 2;
        emit ClaimResolved(claimId, claim.status);
        if (approve) {
            claimPoolBalance -= claim.amount;
            _sendValue(claim.patient, claim.amount);
        }
    }

    function getClaim(uint256 claimId) external view returns (Claim memory) {
        Claim memory claim = _claims[claimId];
        require(claim.patient != address(0), "Claim not found");
        require(msg.sender == claim.patient || approvedInsurers[msg.sender], "Not authorized");
        return claim;
    }

    // --- Internal Helpers ---

    function _sendValue(address recipient, uint256 amount) private {
        (bool success, ) = payable(recipient).call{value: amount}("");
        require(success, "Payment failed");
    }

    // Allow contract to receive direct ETH for pool funding
    receive() external payable {
        claimPoolBalance += msg.value;
        emit ClaimPoolFunded(msg.sender, msg.value);
    }
}