// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract FarmerRegistry {
    address public admin;

    struct Farmer {
        string farmerId;        // Supabase farmer UUID
        address walletAddress;  // Farmer's Ethereum wallet
        uint256 registeredAt;
        bool isVerified;
    }

    mapping(address => Farmer) public farmersByWallet;
    mapping(string => address) public walletByFarmerId;

    event FarmerRegistered(string indexed farmerId, address indexed walletAddress, uint256 timestamp);
    event FarmerVerified(string indexed farmerId, bool isVerified);

    modifier onlyAdmin() {
        require(msg.sender == admin, "Only admin can perform this action");
        _;
    }

    constructor() {
        admin = msg.sender;
    }

    function registerFarmer(string memory _farmerId, address _wallet) external onlyAdmin {
        require(bytes(_farmerId).length > 0, "Farmer ID cannot be empty");
        require(_wallet != address(0), "Invalid wallet address");

        farmersByWallet[_wallet] = Farmer(_farmerId, _wallet, block.timestamp, true);
        walletByFarmerId[_farmerId] = _wallet;

        emit FarmerRegistered(_farmerId, _wallet, block.timestamp);
    }

    function verifyFarmer(string memory _farmerId) external onlyAdmin {
        address wallet = walletByFarmerId[_farmerId];
        require(wallet != address(0), "Farmer not registered");
        farmersByWallet[wallet].isVerified = true;
        emit FarmerVerified(_farmerId, true);
    }

    function getFarmerByWallet(address _wallet) external view returns (string memory, uint256, bool) {
        Farmer memory f = farmersByWallet[_wallet];
        return (f.farmerId, f.registeredAt, f.isVerified);
    }

    function getFarmerWallet(string memory _farmerId) external view returns (address) {
        return walletByFarmerId[_farmerId];
    }
}
