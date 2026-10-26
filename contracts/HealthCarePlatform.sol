// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title HealthCarePlatform
 * @notice Modern Web 3.0 Decentralized Healthcare Platform
 * Includes:
 *  - Decentralized, access-controlled patient medical records & checksum validation
 *  - Role-based permissions (Patient, Doctor, Admin)
 *  - Doctor-to-Patient access request and approval workflow
 *  - Escrowed appointment booking & crypto settlement
 *  - Doctor and Patient profile registries
 */
contract HealthCarePlatform {
    address public immutable owner;
    uint256 private _entered = 1;
    uint256 public nextRecordId = 1;
    uint256 public nextAppointmentId = 1;
    uint256 public nextRequestId = 1;

    mapping(address => bool) public approvedDoctors;
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


    struct AccessRequest {
        uint256 id;
        address doctor;
        address patient;
        string reason;
        uint8 status; // 0: Pending, 1: Approved, 2: Rejected
        uint256 requestedAt;
        uint256 validForSeconds;
        uint256 expiresAt;
    }

    struct AccessPolicy {
        bool granted;
        uint256 grantedAt;
        uint256 validForSeconds;
        uint256 expiresAt;
        string purpose;
    }

    struct AccessAuditLog {
        address patient;
        address doctor;
        bool granted;
        string purpose;
        uint256 timestamp;
        uint256 expiresAt;
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
    mapping(uint256 => AccessRequest) private _accessRequests;
    mapping(address => uint256[]) private _patientRequestIds;
    mapping(address => uint256[]) private _doctorRequestIds;
    mapping(address => mapping(address => AccessPolicy)) private _accessPolicies;
    mapping(address => AccessAuditLog[]) private _accessAuditLogs;

    mapping(address => DoctorProfile) public doctorProfiles;
    mapping(address => PatientProfile) public patientProfiles;
    address[] public doctorDirectory;

    event DoctorApprovalChanged(address indexed doctor, bool approved);
    event RecordAccessChanged(address indexed patient, address indexed doctor, bool granted);
    event AccessPolicyUpdated(address indexed patient, address indexed doctor, bool granted, uint256 validForSeconds, string purpose);
    event AccessRequested(uint256 indexed requestId, address indexed patient, address indexed doctor, string reason);
    event AccessRequestResolved(uint256 indexed requestId, uint8 status);
    event RecordAdded(uint256 indexed recordId, address indexed patient, address indexed author, string encryptedUri, bytes32 digest, uint256 createdAt);
    event AppointmentBooked(uint256 indexed appointmentId, address indexed patient, address indexed doctor, uint64 startsAt, uint256 fee);
    event AppointmentUpdated(uint256 indexed appointmentId, uint8 status);
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

    // --- Access Control & Request Workflow ---

    function setRecordAccess(address doctor, bool granted) external {
        _setRecordAccessPolicy(doctor, granted, 0, granted ? "Consent granted" : "");
    }

    function setRecordAccessWithPolicy(
        address doctor,
        bool granted,
        uint256 validForSeconds,
        string calldata purpose
    ) public {
        _setRecordAccessPolicy(doctor, granted, validForSeconds, purpose);
    }

    function _setRecordAccessPolicy(
        address doctor,
        bool granted,
        uint256 validForSeconds,
        string memory purpose
    ) internal {
        require(approvedDoctors[doctor], "Doctor not approved");

        AccessPolicy storage policy = _accessPolicies[msg.sender][doctor];
        policy.granted = granted;
        policy.grantedAt = block.timestamp;
        policy.validForSeconds = validForSeconds;
        policy.expiresAt = granted && validForSeconds > 0 ? block.timestamp + validForSeconds : 0;
        policy.purpose = purpose;

        hasRecordAccess[msg.sender][doctor] = granted;

        _accessAuditLogs[msg.sender].push(
            AccessAuditLog({
                patient: msg.sender,
                doctor: doctor,
                granted: granted,
                purpose: granted ? string(purpose) : "Access revoked",
                timestamp: block.timestamp,
                expiresAt: policy.expiresAt
            })
        );

        emit RecordAccessChanged(msg.sender, doctor, granted);
        emit AccessPolicyUpdated(msg.sender, doctor, granted, validForSeconds, purpose);
    }

    function getAccessPolicy(address patient, address doctor) external view returns (AccessPolicy memory) {
        require(msg.sender == patient || msg.sender == owner || msg.sender == doctor, "Not authorized");
        return _accessPolicies[patient][doctor];
    }

    function getAccessLogCount(address patient) external view returns (uint256) {
        require(msg.sender == patient || msg.sender == owner, "Not authorized");
        return _accessAuditLogs[patient].length;
    }

    function getAccessLog(address patient, uint256 index) external view returns (AccessAuditLog memory) {
        require(msg.sender == patient || msg.sender == owner, "Not authorized");
        require(index < _accessAuditLogs[patient].length, "Audit log not found");
        return _accessAuditLogs[patient][index];
    }

    function requestRecordAccess(address patient, string calldata reason) external returns (uint256 requestId) {
        return requestRecordAccessWithPolicy(patient, reason, 0);
    }

    function requestRecordAccessWithPolicy(
        address patient,
        string calldata reason,
        uint256 validForSeconds
    ) public returns (uint256 requestId) {
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
            requestedAt: block.timestamp,
            validForSeconds: validForSeconds,
            expiresAt: 0
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
            req.expiresAt = req.validForSeconds > 0 ? block.timestamp + req.validForSeconds : 0;
            hasRecordAccess[msg.sender][req.doctor] = true;

            AccessPolicy storage policy = _accessPolicies[msg.sender][req.doctor];
            policy.granted = true;
            policy.grantedAt = block.timestamp;
            policy.validForSeconds = req.validForSeconds;
            policy.expiresAt = req.expiresAt;
            policy.purpose = req.reason;

            _accessAuditLogs[msg.sender].push(
                AccessAuditLog({
                    patient: msg.sender,
                    doctor: req.doctor,
                    granted: true,
                    purpose: req.reason,
                    timestamp: block.timestamp,
                    expiresAt: req.expiresAt
                })
            );

            emit RecordAccessChanged(msg.sender, req.doctor, true);
            emit AccessPolicyUpdated(msg.sender, req.doctor, true, req.validForSeconds, req.reason);
        } else {
            req.status = 2;
            AccessPolicy storage policy = _accessPolicies[msg.sender][req.doctor];
            policy.granted = false;
            policy.validForSeconds = 0;
            policy.expiresAt = 0;
            policy.purpose = "";
            hasRecordAccess[msg.sender][req.doctor] = false;
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
            msg.sender == patient || (approvedDoctors[msg.sender] && _hasActiveRecordAccess(patient, msg.sender)),
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
            msg.sender == patient || (approvedDoctors[msg.sender] && _hasActiveRecordAccess(patient, msg.sender)),
            "No patient authorization"
        );
        return _patientRecordIds[patient];
    }

    function getRecord(uint256 recordId) external view returns (Record memory) {
        Record memory record = _records[recordId];
        require(record.patient != address(0), "Record not found");
        require(
            msg.sender == record.patient || (approvedDoctors[msg.sender] && _hasActiveRecordAccess(record.patient, msg.sender)),
            "No patient authorization"
        );
        return record;
    }

    function getRecordMeta(uint256 recordId) external view returns (RecordMeta memory) {
        Record memory record = _records[recordId];
        require(record.patient != address(0), "Record not found");
        require(
            msg.sender == record.patient || (approvedDoctors[msg.sender] && _hasActiveRecordAccess(record.patient, msg.sender)),
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

    // --- Internal Helpers ---

    function _hasActiveRecordAccess(address patient, address doctor) private view returns (bool) {
        if (!hasRecordAccess[patient][doctor]) return false;
        AccessPolicy storage policy = _accessPolicies[patient][doctor];
        if (policy.expiresAt == 0) return true;
        return block.timestamp <= policy.expiresAt;
    }

    function _sendValue(address recipient, uint256 amount) private {
        (bool success, ) = payable(recipient).call{value: amount}("");
        require(success, "Payment failed");
    }
}