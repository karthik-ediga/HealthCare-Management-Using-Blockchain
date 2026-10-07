// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title Appointment
 * @notice Modular smart contract managing doctor bookings and cryptocurrency escrow.
 */
contract Appointment {
    address public immutable owner;
    uint256 private _entered = 1;
    uint256 public nextAppointmentId = 1;

    mapping(address => bool) public approvedDoctors;

    struct Booking {
        address patient;
        address doctor;
        uint64 startsAt;
        uint256 fee;
        uint8 status; // 0: Awaiting, 1: Confirmed, 2: Completed, 3: Cancelled
    }

    mapping(uint256 => Booking) private _appointments;

    event DoctorApprovalChanged(address indexed doctor, bool approved);
    event AppointmentBooked(uint256 indexed appointmentId, address indexed patient, address indexed doctor, uint64 startsAt, uint256 fee);
    event AppointmentUpdated(uint256 indexed appointmentId, uint8 status);

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

    function setDoctorApproval(address doctor, bool approved) external onlyOwner {
        require(doctor != address(0), "Invalid doctor");
        approvedDoctors[doctor] = approved;
        emit DoctorApprovalChanged(doctor, approved);
    }

    function bookAppointment(address doctor, uint64 startsAt) external payable nonReentrant returns (uint256 appointmentId) {
        require(approvedDoctors[doctor], "Doctor not approved");
        require(doctor != msg.sender, "Cannot book yourself");
        require(startsAt > block.timestamp, "Appointment must be in future");
        require(msg.value > 0, "Fee required");

        appointmentId = nextAppointmentId++;
        _appointments[appointmentId] = Booking(msg.sender, doctor, startsAt, msg.value, 0);
        emit AppointmentBooked(appointmentId, msg.sender, doctor, startsAt, msg.value);
    }

    function respondToAppointment(uint256 appointmentId, bool accept) external nonReentrant {
        Booking storage apt = _appointments[appointmentId];
        require(apt.doctor == msg.sender, "Only assigned doctor");
        require(apt.status == 0, "Already resolved");

        apt.status = accept ? 1 : 3;
        emit AppointmentUpdated(appointmentId, apt.status);
        if (!accept) {
            (bool ok, ) = payable(apt.patient).call{value: apt.fee}("");
            require(ok, "Refund failed");
        }
    }

    function cancelAppointment(uint256 appointmentId) external nonReentrant {
        Booking storage apt = _appointments[appointmentId];
        require(apt.patient == msg.sender, "Only patient");
        require(apt.status == 0, "Already resolved");

        apt.status = 3;
        emit AppointmentUpdated(appointmentId, 3);
        (bool ok, ) = payable(apt.patient).call{value: apt.fee}("");
        require(ok, "Refund failed");
    }

    function completeAppointment(uint256 appointmentId) external nonReentrant {
        Booking storage apt = _appointments[appointmentId];
        require(msg.sender == apt.patient || msg.sender == apt.doctor, "Not authorized");
        require(apt.status == 1, "Not confirmed");
        require(block.timestamp >= apt.startsAt, "Time not reached");

        apt.status = 2;
        emit AppointmentUpdated(appointmentId, 2);
        (bool ok, ) = payable(apt.doctor).call{value: apt.fee}("");
        require(ok, "Payout failed");
    }

    function getAppointment(uint256 appointmentId) external view returns (Booking memory) {
        Booking memory apt = _appointments[appointmentId];
        require(apt.patient != address(0), "Not found");
        require(msg.sender == apt.patient || msg.sender == apt.doctor, "Not authorized");
        return apt;
    }
}
