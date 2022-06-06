import { ethers, network, run } from "hardhat";
import "dotenv/config";

async function main() {
  // Get network name: hardhat, testnet or mainnet
  const { name } = network;
  console.log(`Deploying to ${name} network...`);

  // Compile contracts
  await run("compile");
  console.log("Compiled contracts...");

  // Deploy contracts
  const dexAuction = await ethers.getContractFactory("DexAuction");
  const contract = await dexAuction.deploy(
    process.env.DEX_TOKEN_ADDR!,
    process.env.OPERATOR_ADDR!,
    process.env.AUCTION_LENGTH!
  );

  // Wait for the contract to be deployed before exiting the script
  await contract.deployed();
  console.log(`Deployed to ${contract.address}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
