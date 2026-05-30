# V3: Signed Loan Commitment Protocol (Better than Escrow)

## Why Escrow is NOT the Best Solution

The Escrow pattern we designed has one fundamental problem: **the Bank must submit an on-chain transaction just to register a "pending loan".** This means:
- The Bank **pays gas** for every pre-approval (even if the deal falls through)
- Blockchain **state bloat** — the escrow mapping grows forever
- Two on-chain transactions instead of one
- Delay — user has to wait for the escrow transaction to mine before the RTO can proceed

## The Industry-Standard Solution: EIP-712 Signed Loan Commitment

This is exactly how Uniswap's **Permit2**, OpenSea's **Seaport**, and Aave's **Credit Delegation** work. Instead of writing data to the blockchain upfront, the Bank **signs a typed message off-chain (for free)** and the RTO verifies + consumes the signature atomically during the transfer.

**Zero gas for the bank. Zero state bloat. Zero extra transactions. Same security.**

---

## How It Works

### Step 1: Bank Signs the Commitment (Off-Chain, FREE)
The Bank's backend signs an EIP-712 structured message (no blockchain transaction):

```solidity
// The structure of the signed commitment
bytes32 constant LOAN_COMMITMENT_TYPEHASH = keccak256(
    "LoanCommitment(uint256 dvpId,address buyer,uint128 amount,uint16 tenure,uint64 bankId,uint64 nonce,uint256 expiry)"
);

struct LoanCommitment {
    uint256 dvpId;      // The vehicle's DVP token ID
    address buyer;      // The exact buyer wallet
    uint128 amount;     // The loan amount
    uint16  tenure;     // Loan duration in months
    uint64  bankId;     // The bank's on-chain ID
    uint64  nonce;      // Replay protection
    uint256 expiry;     // Unix timestamp — commitment expires in 30 days
}
```

The Bank's private key (their `BANK_ROLE` wallet) signs this using EIP-712. The signature is `(v, r, s)` — 65 bytes.

**This signature is stored in our Web2 database. No blockchain transaction needed!**

### Step 2: RTO Executes the Atomic Transfer
The RTO backend attaches the Bank's signature to the standard transfer transaction:

```solidity
function approveTransfer(
    uint256 ownTid,
    LoanCommitment calldata commitment,  // From Web2 DB
    bytes calldata signature              // Bank's EIP-712 signature
) external onlyRole(RTO_ROLE) {
    
    // --- 1. Standard Transfer Validations ---
    Xfer storage req = activeXfer[ownTid];
    if (!req.sellerOK || !req.buyerOK) revert NotApproved();
    if (req.done) revert AlreadyDone();
    
    address newBuyer = req.buyer;

    // --- 2. If a commitment exists, atomically verify and consume it ---
    if (commitment.dvpId != 0) {
        
        // Strict buyer match — prevents wallet-switch attack
        require(commitment.buyer == newBuyer, "Commitment buyer mismatch");
        
        // Expiry check
        require(block.timestamp <= commitment.expiry, "Loan commitment expired");
        
        // Nonce check — prevents replay attacks
        require(!usedNonces[commitment.bankId][commitment.nonce], "Nonce already used");
        
        // Cryptographically verify the Bank's signature on-chain
        bytes32 hash = _hashCommitment(commitment);
        address signer = ECDSA.recover(hash, signature);
        
        // The signer MUST be the bank's authorized wallet
        require(addrToBank[signer] == commitment.bankId, "Invalid bank signature");
        
        // Mark nonce as used — prevents double-spending this signature
        usedNonces[commitment.bankId][commitment.nonce] = true;
        
        // Register the loan atomically!
        loanContract.systemRegisterLoan(
            ownTid, commitment.bankId, commitment.amount, commitment.tenure
        );
        
        emit LoanCommitmentSettled(commitment.dvpId, newBuyer, commitment.bankId);
    }
    
    // --- 3. Standard Transfer Completion ---
    req.rtoOK = true;
    req.done = true;
    req.rtoId = addrToRTO[msg.sender];
    owns[ownTid].owner = newBuyer;
    
    emit TransferApproved(ownTid, req.rtoId);
}
```

---

## New Events (System Logs)

```solidity
// Bank signed a commitment (logged in Web2 DB, not on-chain — FREE!)
// event LoanCommitmentSigned(dvpId, buyerWallet, bankId, nonce, expiry)  [Web2 Only]

// RTO consumed the signature and registered the loan atomically
event LoanCommitmentSettled(
    uint256 indexed dvpId,
    address indexed buyer,
    uint64 indexed bankId
);

// Bank revoked a commitment before it was settled (Web2 + on-chain nonce invalidation)
event LoanCommitmentRevoked(
    uint64 indexed bankId,
    uint64 indexed nonce
);

// Commitment expired — RTO didn't execute in time
// Detected by off-chain indexer comparing block.timestamp to commitment.expiry
event LoanCommitmentExpired(
    uint256 indexed dvpId,
    address indexed buyer
);
```

---

## Complete Comparison

| Feature | Escrow Pattern | Signed Commitment Protocol |
|---|---|---|
| Bank pays gas for pre-approval | YES (expensive) | NO (free signature) |
| On-chain state bloat | YES (grows forever) | NO (only nonces stored) |
| Transactions required | 2 (createEscrow + approveTransfer) | 1 (approveTransfer only) |
| Bank can cancel without gas | NO | YES (revoke signature, invalidate nonce) |
| Replay attack protection | Partial | Full (nonce + expiry + chainId) |
| Wallet-switch attack protection | YES (vehicleHasEscrow lock) | YES (commitment.buyer == newBuyer) |
| Expiry support | Manual only | Built-in (expiry timestamp) |
| Speed | 2 block confirmations | 1 block confirmation |
| Industry Standard | Custom | Same as Uniswap Permit2, OpenSea Seaport |
| Gas Cost | 2x | 1x |

---

## Flash Payoff Protocol (For Seller Has Loan Case)

For Case 3 (Seller has active loan, Buyer needs a new loan), we introduce a **Payoff Commitment** — the Bank B signs a commitment that also authorizes paying off Bank A:

```solidity
struct PayoffCommitment {
    uint256 ownTid;       // The vehicle
    uint64  payoffLoanId; // Bank A's loan to pay off
    uint128 payoffAmount; // Amount to clear Bank A
    uint128 newAmount;    // Bank B's new loan amount
    uint16  newTenure;    // Bank B's tenure
    address buyer;        // The new owner
    uint64  bankId;       // Bank B's ID
    uint64  nonce;
    uint256 expiry;
}
```

When the RTO calls `approveTransfer(ownTid, payoffCommitment, signature)`:
1. Smart contract verifies Bank B's signature
2. Smart contract force-clears Bank A's loan (noting it was settled off-chain by Bank B)
3. Smart contract registers Bank B's new loan
4. Smart contract transfers ownership

ALL in ONE block. ONE RTO action. ZERO manual coordination between banks.

---

## Verdict

The EIP-712 Signed Loan Commitment Protocol is strictly superior to the Escrow pattern in every measurable dimension — gas cost, speed, state efficiency, security, and developer ergonomics. It is the production-grade, industry-standard solution used by the largest DeFi protocols in the world, applied to vehicle lifecycle management for the first time.
