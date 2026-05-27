# Vehicle Lifecycle Monorepo

Welcome to the Vehicle Lifecycle Monorepo! This repository contains the complete full-stack architecture for our decentralized vehicle lifecycle management system.

## Project Structure

This is an NPM Workspace monorepo containing the following modules:

- **/contracts**: Foundry project containing our Smart Contracts (e.g., `OwnershipToken.sol`).
- **/backend**: Express/TypeScript API Gateway bridging the traditional web with our Web3 infrastructure using Prisma and node-postgres.
- **/frontend**: (Coming Soon) Next.js frontend application.
- **/besu**: (Coming Soon) Hyperledger Besu enterprise blockchain nodes configuration.

## Getting Started

To install dependencies for all modules simultaneously:

```bash
npm run install:all
```

## Running the Architecture

To start the development servers across all workspaces:

```bash
npm run dev
```

## Technologies Used

- **Blockchain**: Hyperledger Besu, Solidity, Foundry
- **Backend**: Node.js, Express, TypeScript, Prisma, PostgreSQL
- **Frontend**: Next.js, React, TailwindCSS
- **Tooling**: NPM Workspaces, tsup, Zod
