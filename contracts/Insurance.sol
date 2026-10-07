// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title Insurance
 * @notice Modular smart contract automating healthcare insurance claim verification and payouts.
 */
contract Insurance {
    address public immutable owner;
    uint256 private _entered = 1;
    uint256 public nextClaimId = 1;
    uint256 public claimPoolBalance;

    mapping(address => bool) public approvedInsurers;

    struct Claim {
        address patient;
        string encryptedEvidenceUri;
        uint256 amount;
        uint8 status; // 0: In review, 1: Approved, 2: Declined
    }

    mapping(uint256 => Claim) private _claims;

    event InsurerApprovalChanged(address indexed insurer, bool approved);
    event ClaimSubmitted(uint256 indexed claimId, address indexed patient, uint256 amount, string encryptedEvidenceUri);
    event ClaimResolved(uint256 indexed claimId, uint8 status);
    event ClaimPoolFunded(address indexed funder, uint256 amount);

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

    function setInsurerApproval(address insurer, bool approved) external onlyOwner {
        require(insurer != address(0), "Invalid insurer");
        approvedInsurers[insurer] = approved;
        emit InsurerApprovalChanged(insurer, approved);
    }

    function submitClaim(string calldata encryptedEvidenceUri, uint256 amount) external returns (uint256 claimId) {
        require(bytes(encryptedEvidenceUri).length > 0, "Missing URI");
        require(amount > 0, "Amount required");

        claimId = nextClaimId++;
        _claims[claimId] = Claim(msg.sender, encryptedEvidenceUri, amount, 0);
        emit ClaimSubmitted(claimId, msg.sender, amount, encryptedEvidenceUri);
    }

    function fundClaimPool() external payable {
        require(msg.value > 0, "Funding required");
        claimPoolBalance += msg.value;
        emit ClaimPoolFunded(msg.sender, msg.value);
    }

    function resolveClaim(uint256 claimId, bool approve) external nonReentrant {
        require(approvedInsurers[msg.sender], "Only approved insurer");
        Claim storage claim = _claims[claimId];
        require(claim.patient != address(0), "Not found");
        require(claim.status == 0, "Already resolved");
        if (approve) require(claimPoolBalance >= claim.amount, "Pool insufficient");

        claim.status = approve ? 1 : 2;
        emit ClaimResolved(claimId, claim.status);

        if (approve) {
            claimPoolBalance -= claim.amount;
            (bool ok, ) = payable(claim.patient).call{value: claim.amount}("");
            require(ok, "Payout failed");
        }
    }

    function getClaim(uint256 claimId) external view returns (Claim memory) {
        Claim memory claim = _claims[claimId];
        require(claim.patient != address(0), "Not found");
        require(msg.sender == claim.patient || approvedInsurers[msg.sender], "Not authorized");
        return claim;
    }

    receive() external payable {
        claimPoolBalance += msg.value;
        emit ClaimPoolFunded(msg.sender, msg.value);
    }
}
