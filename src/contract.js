import { Contract } from "ethers";

export const contractAddress = import.meta.env.VITE_CONTRACT_ADDRESS || "";

export const healthcareAbi = [
  "function owner() view returns (address)",
  "function approvedDoctors(address) view returns (bool)",
  "function hasRecordAccess(address patient, address doctor) view returns (bool)",
  "function nextRecordId() view returns (uint256)",
  "function nextAppointmentId() view returns (uint256)",
  "function nextRequestId() view returns (uint256)",
  "function getPatientRecordIds(address patient) view returns (uint256[])",
  "function getRecord(uint256 recordId) view returns (tuple(uint256 id, address patient, address author, string encryptedUri, bytes32 digest, uint256 createdAt))",
  "function getRecordMeta(uint256 recordId) view returns (tuple(uint8 recordType, string title, string description))",
  "function addRecord(address patient, string encryptedUri, bytes32 digest)",
  "function addRecordWithDetails(address patient, string encryptedUri, bytes32 digest, uint8 recordType, string title, string description)",
  "function setRecordAccess(address doctor, bool granted)",
  "function setRecordAccessWithPolicy(address doctor, bool granted, uint256 validForSeconds, string purpose)",
  "function getAccessPolicy(address patient, address doctor) view returns (tuple(bool granted, uint256 grantedAt, uint256 validForSeconds, uint256 expiresAt, string purpose))",
  "function getAccessLogCount(address patient) view returns (uint256)",
  "function getAccessLog(address patient, uint256 index) view returns (tuple(address patient, address doctor, bool granted, string purpose, uint256 timestamp, uint256 expiresAt))",
  "function requestRecordAccess(address patient, string reason) returns (uint256)",
  "function requestRecordAccessWithPolicy(address patient, string reason, uint256 validForSeconds) returns (uint256)",
  "function respondToAccessRequest(uint256 requestId, bool approve)",
  "function getPatientRequestIds(address patient) view returns (uint256[])",
  "function getDoctorRequestIds(address doctor) view returns (uint256[])",
  "function getAccessRequest(uint256 requestId) view returns (tuple(uint256 id, address doctor, address patient, string reason, uint8 status, uint256 requestedAt, uint256 validForSeconds, uint256 expiresAt))",
  "function bookAppointment(address doctor, uint64 startsAt) payable returns (uint256 appointmentId)",
  "function respondToAppointment(uint256 appointmentId, bool accept)",
  "function cancelAppointment(uint256 appointmentId)",
  "function completeAppointment(uint256 appointmentId)",
  "function getAppointment(uint256 appointmentId) view returns (tuple(address patient, address doctor, uint64 startsAt, uint256 fee, uint8 status))",
  "function setDoctorApproval(address doctor, bool approved)",
  "function registerDoctor(string name, string specialty, string licenseNumber, uint256 consultationFee)",
  "function registerPatient(string name, string emergencyContact, string bloodGroup)",
  "function doctorProfiles(address) view returns (tuple(string name, string specialty, string licenseNumber, uint256 consultationFee, bool isRegistered))",
  "function patientProfiles(address) view returns (tuple(string name, string emergencyContact, string bloodGroup, bool isRegistered))",
  "function getDoctorDirectory() view returns (address[])",
  "event DoctorApprovalChanged(address indexed doctor, bool approved)",
  "event RecordAccessChanged(address indexed patient, address indexed doctor, bool granted)",
  "event AccessRequested(uint256 indexed requestId, address indexed patient, address indexed doctor, string reason)",
  "event AccessRequestResolved(uint256 indexed requestId, uint8 status)",
  "event RecordAdded(uint256 indexed recordId, address indexed patient, address indexed author, string encryptedUri, bytes32 digest, uint256 createdAt)",
  "event AppointmentBooked(uint256 indexed appointmentId, address indexed patient, address indexed doctor, uint64 startsAt, uint256 fee)",
  "event AppointmentUpdated(uint256 indexed appointmentId, uint8 status)"
];

export function makeContract(signerOrProvider, customAddress = null) {
  const target = customAddress || contractAddress;
  return target ? new Contract(target, healthcareAbi, signerOrProvider) : null;
}