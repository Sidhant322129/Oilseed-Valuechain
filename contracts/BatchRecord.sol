// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract BatchRecord {
    enum BatchStatus { Registered, Certified, Dispatched, Received, Sold }

    struct Batch {
        string batchId;
        address owner;
        string cropType;
        uint256 quantityKg;
        BatchStatus status;
        uint256 updatedAt;
    }

    mapping(string => Batch) public batches;

    event BatchCreated(string indexed batchId, address indexed owner, string cropType, uint256 quantityKg);
    event StatusChanged(string indexed batchId, BatchStatus previousStatus, BatchStatus newStatus, uint256 timestamp);

    function createBatch(string memory _batchId, string memory _cropType, uint256 _quantityKg) external {
        require(batches[_batchId].quantityKg == 0, "Batch ID already exists");
        require(_quantityKg > 0, "Quantity must be > 0");

        batches[_batchId] = Batch({
            batchId: _batchId,
            owner: msg.sender,
            cropType: _cropType,
            quantityKg: _quantityKg,
            status: BatchStatus.Registered,
            updatedAt: block.timestamp
        });

        emit BatchCreated(_batchId, msg.sender, _cropType, _quantityKg);
    }

    function transitionStatus(string memory _batchId, BatchStatus _nextStatus) external {
        Batch storage b = batches[_batchId];
        require(b.quantityKg > 0, "Batch does not exist");
        require(uint(b.status) + 1 == uint(_nextStatus), "Invalid status transition order");

        BatchStatus prev = b.status;
        b.status = _nextStatus;
        b.updatedAt = block.timestamp;

        emit StatusChanged(_batchId, prev, _nextStatus, block.timestamp);
    }

    function getBatch(string memory _batchId) external view returns (string memory, address, string memory, uint256, BatchStatus, uint256) {
        Batch memory b = batches[_batchId];
        return (b.batchId, b.owner, b.cropType, b.quantityKg, b.status, b.updatedAt);
    }
}
