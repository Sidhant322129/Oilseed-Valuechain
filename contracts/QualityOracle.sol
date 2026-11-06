// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract QualityOracle {
    address public oracleAdmin;

    struct Certificate {
        string ipfsCID;        // Pinata IPFS Content Identifier
        string certType;       // e.g. "moisture_lab_report", "soil_health"
        uint256 timestamp;
        address issuedBy;
    }

    // batchId => array of certificates
    mapping(string => Certificate[]) public batchCertificates;

    event CertificateRecorded(string indexed batchId, string ipfsCID, string certType, uint256 timestamp);

    constructor() {
        oracleAdmin = msg.sender;
    }

    function recordCertificate(string memory _batchId, string memory _ipfsCID, string memory _certType) external {
        require(bytes(_batchId).length > 0, "Invalid batchId");
        require(bytes(_ipfsCID).length > 0, "Invalid IPFS CID");

        batchCertificates[_batchId].push(Certificate({
            ipfsCID: _ipfsCID,
            certType: _certType,
            timestamp: block.timestamp,
            issuedBy: msg.sender
        }));

        emit CertificateRecorded(_batchId, _ipfsCID, _certType, block.timestamp);
    }

    function getCertificates(string memory _batchId) external view returns (Certificate[] memory) {
        return batchCertificates[_batchId];
    }
}
