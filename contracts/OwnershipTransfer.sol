// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract OwnershipTransfer {
    struct TransferRecord {
        string batchId;
        address from;
        address to;
        string orderId;
        uint256 timestamp;
    }

    mapping(string => TransferRecord[]) public transferHistory;

    event OwnershipTransferred(string indexed batchId, address indexed from, address indexed to, string orderId, uint256 timestamp);

    function transferBatchOwnership(
        string memory _batchId,
        address _from,
        address _to,
        string memory _orderId
    ) external {
        require(_to != address(0), "Invalid new owner");

        transferHistory[_batchId].push(TransferRecord({
            batchId: _batchId,
            from: _from,
            to: _to,
            orderId: _orderId,
            timestamp: block.timestamp
        }));

        emit OwnershipTransferred(_batchId, _from, _to, _orderId, block.timestamp);
    }

    function getTransferCount(string memory _batchId) external view returns (uint256) {
        return transferHistory[_batchId].length;
    }

    function getTransfers(string memory _batchId) external view returns (TransferRecord[] memory) {
        return transferHistory[_batchId];
    }
}
