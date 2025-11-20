# FHE-based Art Auction

ArtAuction_Z is a cutting-edge privacy-preserving platform designed for secure art auctions, powered by Zama's Fully Homomorphic Encryption (FHE) technology. With each bid encrypted, ArtAuction_Z ensures that bidders can maintain their anonymity while still participating in high-stakes auctions.

## The Problem

In traditional art auctions, bid transparency can expose buyers' identities, leading to potential privacy breaches and unwanted attention. Cleartext data, such as bid amounts or participant identities, can be exploited, resulting in security vulnerabilities for both bidders and auction houses. This lack of privacy is particularly concerning in high-value transactions where anonymity is paramount.

## The Zama FHE Solution

ArtAuction_Z addresses these privacy concerns by leveraging Zama's FHE technology. By enabling computation on encrypted data, parties can engage in the bidding process with peace of mind. Using fhevm to process encrypted inputs, we can ensure that bid amounts remain confidential while still allowing the auction platform to determine the highest bidder without revealing any sensitive information.

## Key Features

- 🔒 **Bid Encryption**: All bids are encrypted to protect participants' identities.
- 🥇 **Homomorphic Reveal**: At the end of the auction, the highest bid is revealed without disclosing individual bids.
- 🎨 **Art Privacy**: Bidders can evaluate and bid on artwork without risk of exposure.
- 📈 **Secure Transactions**: Bids are securely recorded and managed on-chain, ensuring transparency without compromising privacy.
- 🖼️ **High-End Auctions**: Supports luxury and high-value art pieces with maximum confidentiality.

## Technical Architecture & Stack

ArtAuction_Z utilizes a robust architecture built on the following technology stack:

- **Frontend**: React.js for the user interface
- **Backend**: Node.js with Express.js for server handling
- **Smart Contracts**: Solidity for blockchain interactions
- **Core Privacy Engine**: Zama's FHE technologies (fhevm)
- **Database**: IPFS for decentralized storage

## Smart Contract / Core Logic

Here’s a simplified example of how the bidding process may look in Solidity, utilizing Zama's FHE capabilities:solidity
pragma solidity ^0.8.0;

import "TFHE.sol";

contract ArtAuction {
    struct Bid {
        uint64 encryptedAmount;
        address bidder;
    }
    
    Bid[] public bids;
    
    function placeBid(uint64 encryptedBidAmount) public {
        bids.push(Bid({encryptedAmount: encryptedBidAmount, bidder: msg.sender}));
    }
    
    function revealHighestBid() public view returns (address) {
        uint64 highestBid = 0;
        address highestBidder;
        for (uint i = 0; i < bids.length; i++) {
            uint64 decryptedBid = TFHE.decrypt(bids[i].encryptedAmount);
            if (decryptedBid > highestBid) {
                highestBid = decryptedBid;
                highestBidder = bids[i].bidder;
            }
        }
        return highestBidder;
    }
}

## Directory Structure

Below is the proposed directory structure for the ArtAuction_Z project:
ArtAuction_Z/
├── contracts/
│   └── ArtAuction.sol
├── src/
│   ├── components/
│   ├── pages/
│   └── App.js
├── scripts/
│   └── bid_handler.py
├── package.json
└── README.md

## Installation & Setup

### Prerequisites

Before you begin, ensure you have the following software installed:

- Node.js (for the backend and front-end)
- Python (for data processing scripts)
- npm (Node package manager)
- Hardhat (for smart contract development)

### Installing Dependencies

To set up ArtAuction_Z, follow these steps:

1. Install Node.js dependencies:bash
   npm install
   npm install fhevm

2. Install Python dependencies:bash
   pip install concrete-ml

## Build & Run

To compile the smart contracts and run the application, execute the following commands:

1. Compile the smart contracts:bash
   npx hardhat compile

2. Start the server:bash
   npm start

3. Run the bidding script:bash
   python scripts/bid_handler.py

## Acknowledgements

This project is made possible through the open-source FHE primitives provided by Zama. Their innovative technology enables us to create secure and private applications that uphold the integrity of sensitive transactions in the digital age.

