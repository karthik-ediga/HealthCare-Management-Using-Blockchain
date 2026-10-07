// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title HealthRecords
 * @notice Modular decentralized access-controlled patient health records contract.
 */
contract HealthRecords {
    address public immutable owner;
    uint256 public nextRecordId = 1;
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
        uint8 recordType;
        string title;
        uint256 createdAt;
    }

    struct AccessRequest {
        uint256 id;
        address doctor;
        address patient;
        string reason;
        uint8 status; // 0: Pending, 1: Approved, 2: Rejected
        uint256 requestedAt;
    }

    mapping(uint256 => Record) private _records;
    mapping(address => uint256[]) private _patientRecordIds;
    mapping(uint256 => AccessRequest) private _accessRequests;
    mapping(address => uint256[]) private _patientRequestIds;

    event DoctorApprovalChanged(address indexed doctor, bool approved);
    event RecordAccessChanged(address indexed patient, address indexed doctor, bool granted);
    event AccessRequested(uint256 indexed requestId, address indexed patient, address indexed doctor, string reason);
    event AccessRequestResolved(uint256 indexed requestId, uint8 status);
    event RecordAdded(uint256 indexed recordId, address indexed patient, address indexed author, string encryptedUri, bytes32 digest, uint256 createdAt);

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    function setDoctorApproval(address doctor, bool approved) external onlyOwner {
        require(doctor != address(0), "Invalid doctor");
        approvedDoctors[doctor] = approved;
        emit DoctorApprovalChanged(doctor, approved);
    }

    function setRecordAccess(address doctor, bool granted) external {
        require(approvedDoctors[doctor], "Doctor not approved");
        hasRecordAccess[msg.sender][doctor] = granted;
        emit RecordAccessChanged(msg.sender, doctor, granted);
    }

    function requestRecordAccess(address patient, string calldata reason) external returns (uint256 requestId) {
        require(approvedDoctors[msg.sender], "Doctor not approved");
        require(patient != address(0), "Invalid patient");

        requestId = nextRequestId++;
        _accessRequests[requestId] = AccessRequest(requestId, msg.sender, patient, reason, 0, block.timestamp);
        _patientRequestIds[patient].push(requestId);
        emit AccessRequested(requestId, patient, msg.sender, reason);
    }

    function respondToAccessRequest(uint256 requestId, bool approve) external {
        AccessRequest storage req = _accessRequests[requestId];
        require(req.patient == msg.sender, "Only patient can respond");
        require(req.status == 0, "Already resolved");

        if (approve) {
            req.status = 1;
            hasRecordAccess[msg.sender][req.doctor] = true;
            emit RecordAccessChanged(msg.sender, req.doctor, true);
        } else {
            req.status = 2;
        }
        emit AccessRequestResolved(requestId, req.status);
    }

    function addRecord(
        address patient,
        string calldata encryptedUri,
        bytes32 digest,
        uint8 recordType,
        string calldata title
    ) external {
        require(patient != address(0), "Invalid patient");
        require(bytes(encryptedUri).length > 0, "Missing URI");
        require(
            msg.sender == patient || (approvedDoctors[msg.sender] && hasRecordAccess[patient][msg.sender]),
            "No patient authorization"
        );

        uint256 recordId = nextRecordId++;
        _records[recordId] = Record(recordId, patient, msg.sender, encryptedUri, digest, recordType, title, block.timestamp);
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
        require(record.patient != address(0), "Not found");
        require(
            msg.sender == record.patient || (approvedDoctors[msg.sender] && hasRecordAccess[record.patient][msg.sender]),
            "No patient authorization"
        );
        return record;
    }

    function getPatientRequestIds(address patient) external view returns (uint256[] memory) {
        require(msg.sender == patient || approvedDoctors[msg.sender], "Not authorized");
        return _patientRequestIds[patient];
    }

    function getAccessRequest(uint256 requestId) external view returns (AccessRequest memory) {
        return _accessRequests[requestId];
    }
}
