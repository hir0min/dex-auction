import { ethers } from "hardhat";
import { expect } from "chai";
import { mine } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { DexAuction, MockDexToken } from "../typechain";
import { utils, constants, BigNumber } from "ethers";

describe("Dex Auction", async () => {
  let mockDexToken: MockDexToken;
  let randomToken: MockDexToken;
  let dexAuction: DexAuction;
  let [
    admin,
    operator,
    alice,
    bob,
    carol,
    david,
    eve,
    ethan,
  ]: SignerWithAddress[] = [];
  let startBlock: number, endBlock: number;

  const initialSupply = BigNumber.from(utils.parseEther("100000"));
  const maxAuctionLength = 86400;

  before(async () => {
    [admin, operator, alice, bob, carol, david, eve, ethan] =
      await ethers.getSigners();

    const mockDexTokenFactory = await ethers.getContractFactory(
      "MockDexToken",
      admin
    );
    mockDexToken = await mockDexTokenFactory.deploy(
      "DexToken",
      "Dex",
      initialSupply
    );

    const mockRandomTokenFactory = await ethers.getContractFactory(
      "MockDexToken",
      admin
    );
    randomToken = await mockRandomTokenFactory.deploy(
      "FakeDexToken",
      "Dex",
      initialSupply
    );

    const dexAuctionFactory = await ethers.getContractFactory(
      "DexAuction",
      admin
    );
    dexAuction = await dexAuctionFactory.deploy(
      mockDexToken.address,
      operator.address,
      maxAuctionLength
    );

    await mockDexToken.mint(alice.address, utils.parseEther("100000"));
    await mockDexToken.mint(bob.address, utils.parseEther("100000"));
    await mockDexToken
      .connect(alice)
      .approve(dexAuction.address, constants.MaxUint256);
    await mockDexToken
      .connect(bob)
      .approve(dexAuction.address, constants.MaxUint256);
  });

  describe("Contract cannot be deployed with wrong parameters", async () => {
    it("should revert when deploying with a wrong max auction length (0)", async () => {
      const dexAuctionFactory = await ethers.getContractFactory(
        "DexAuction",
        admin
      );

      await expect(
        dexAuctionFactory.deploy(mockDexToken.address, operator.address, 0)
      ).revertedWith("Auction: Length cannot be zero");
    });

    it("should revert when deploying with a wrong max auction length (999999999)", async () => {
      const dexAuctionFactory = await ethers.getContractFactory(
        "DexAuction",
        admin
      );

      await expect(
        dexAuctionFactory.deploy(
          mockDexToken.address,
          operator.address,
          999999999
        )
      ).revertedWith("Auction: Cannot be longer than 5 days (144,000 blocks)");
    });
  });

  describe("Operator can manage the contract", async () => {
    it("admin cannot set new operator address to zero address", async () => {
      await expect(
        dexAuction.connect(admin).setOperatorAddress(constants.AddressZero)
      ).revertedWith("Cannot be zero address");
    });

    it("admin can recover token", async () => {
      await randomToken.mint(ethan.address, utils.parseEther("100000"));
      await randomToken
        .connect(ethan)
        .transfer(dexAuction.address, utils.parseEther("300"));

      const recoveryAmount = utils.parseEther("300");

      const dexBalanceBefore = await randomToken.balanceOf(dexAuction.address);
      const adminBalanceBefore = await randomToken.balanceOf(admin.address);

      await expect(
        dexAuction
          .connect(admin)
          .recoverToken(randomToken.address, recoveryAmount)
      )
        .emit(dexAuction, "TokenRecovery")
        .withArgs(randomToken.address, recoveryAmount);

      const dexBalance = await randomToken.balanceOf(dexAuction.address);
      expect(dexBalance).deep.equal(dexBalanceBefore.sub(recoveryAmount));

      const adminBalance = await randomToken.balanceOf(admin.address);
      expect(adminBalance).deep.equal(adminBalanceBefore.add(recoveryAmount));
    });

    it("admin cannot recover dex token", async () => {
      await expect(
        dexAuction
          .connect(admin)
          .recoverToken(mockDexToken.address, utils.parseEther("200"))
      ).revertedWith("Recover: Cannot be dex token");
    });

    it("admin cannot start an auction", async () => {
      const now = (await ethers.provider.getBlock("latest")).number;
      startBlock = now + 10;
      endBlock = startBlock + 100;

      await expect(
        dexAuction
          .connect(alice)
          .startAuction(startBlock, endBlock, utils.parseEther("100"), 10)
      ).revertedWith("Management: Not the operator");
    });

    it("user cannot start an auction", async () => {
      const latestBlock = (await ethers.provider.getBlock("latest")).number;
      startBlock = latestBlock + 10;
      endBlock = startBlock + 100;

      await expect(
        dexAuction
          .connect(admin)
          .startAuction(startBlock, endBlock, utils.parseEther("100"), 10)
      ).revertedWith("Management: Not the operator");
    });

    it("operator cannot start an auction if there are no whitelisted addresses", async () => {
      const now = (await ethers.provider.getBlock("latest")).number;
      startBlock = now + 10;
      endBlock = startBlock + 100;

      await expect(
        dexAuction
          .connect(operator)
          .startAuction(startBlock, endBlock, utils.parseEther("100"), 10)
      ).revertedWith("Auction: No whitelisted address");
    });

    it("anyone can view whitelisted statuses", async () => {
      const result = await dexAuction.whitelisted(alice.address);
      expect(result).deep.equal(false);
    });

    it("operator can add multiple addresses to the whitelist", async () => {
      const whileList = [
        alice.address,
        bob.address,
        carol.address,
        david.address,
      ];

      const tx = await dexAuction.connect(operator).addWhitelist(whileList);

      const receipt = await tx.wait();
      const events = receipt.events!.filter((e) => {
        return e.event === "WhitelistAdd";
      });

      for (let i = 0; i < events!.length; i++) {
        expect(whileList[i]).deep.equal(events![i].args!.account);
      }
    });

    it("anyone can view whitelisted statuses", async () => {
      const result = await dexAuction.whitelisted(bob.address);
      expect(result).deep.equal(true);
    });

    it("operator can add multiple times the same address to the whitelist", async () => {
      const whileList = [bob.address, bob.address];

      await expect(dexAuction.connect(operator).addWhitelist(whileList))
        .not.emit(dexAuction, "WhitelistAdd")
        .withArgs(whileList[0]);
    });

    it("anyone can view whitelisted statuses", async () => {
      const result = await dexAuction.whitelisted(david.address);
      expect(result).deep.equal(true);
    });

    it("operator can remove an address from the whitelist", async () => {
      await expect(
        dexAuction.connect(operator).removeWhitelist([david.address])
      )
        .emit(dexAuction, "WhitelistRemove")
        .withArgs(david.address);
    });

    it("anyone can view whitelisted statuses", async () => {
      const result = await dexAuction.whitelisted(david.address);
      expect(result).deep.equal(false);
    });

    it("operator can remove non-whitelisted address from the whitelist", async () => {
      const whileList = [eve.address];

      await expect(dexAuction.connect(operator).removeWhitelist(whileList))
        .not.emit(dexAuction, "WhitelistRemove")
        .withArgs(whileList[0]);
    });

    it("admin cannot add an address to the whitelist", async () => {
      await expect(
        dexAuction.connect(admin).addWhitelist([alice.address])
      ).revertedWith("Management: Not the operator");
    });

    it("user cannot add an address to the whitelist", async () => {
      await expect(
        dexAuction.connect(eve).addWhitelist([alice.address])
      ).revertedWith("Management: Not the operator");
    });

    it("anyone can view whitelisted addresses", async () => {
      let result = await dexAuction.viewBidders(0, 10);

      expect(result[0].length).deep.equal(3);
      expect(result[0][0]).deep.equal(alice.address);
      expect(result[0][1]).deep.equal(bob.address);
      expect(result[0][2]).deep.equal(carol.address);

      result = await dexAuction.viewBidders(2, 1);

      expect(result[0].length).deep.equal(1);
      expect(result[0][0]).deep.equal(carol.address);
    });
  });

  describe("Auction", async () => {
    it("non-whitelisted address cannot bid", async () => {
      const correctModulo = utils.parseEther("200");
      await expect(dexAuction.connect(ethan).bid(correctModulo)).revertedWith(
        "Whitelist: Not whitelisted"
      );
    });

    it("whitelisted address cannot bid if the auction is not opened", async () => {
      const correctModulo = utils.parseEther("100");
      await expect(dexAuction.connect(alice).bid(correctModulo)).revertedWith(
        "Auction: Not in progress"
      );
    });

    it("operator cannot close an auction before one is started", async () => {
      await expect(
        dexAuction.connect(operator).closeAuction(utils.parseEther("100"))
      ).revertedWith("Auction: Not in progress");
    });

    it("operator cannot start an auction with a lower start block than current block", async () => {
      const latestBlock = (await ethers.provider.getBlock("latest")).number;
      startBlock = latestBlock - 10;
      endBlock = startBlock + 100;

      await expect(
        dexAuction
          .connect(operator)
          .startAuction(startBlock, endBlock, utils.parseEther("100"), 10)
      ).revertedWith("Auction: Start block must be higher than current block");
    });

    it("operator cannot start an auction with a lower start block than end block", async () => {
      const latestBlock = (await ethers.provider.getBlock("latest")).number;
      startBlock = latestBlock + 10;
      endBlock = startBlock - 20;

      await expect(
        dexAuction
          .connect(operator)
          .startAuction(startBlock, endBlock, utils.parseEther("100"), 10)
      ).revertedWith("Auction: Start block must be lower than End block");
    });

    it("operator cannot start an auction with a higher start block than current block + buffer", async () => {
      const latestBlock = (await ethers.provider.getBlock("latest")).number;
      startBlock = latestBlock + 999999999;
      endBlock = startBlock + 10;

      await expect(
        dexAuction
          .connect(operator)
          .startAuction(startBlock, endBlock, utils.parseEther("100"), 10)
      ).revertedWith(
        "Auction: Start block must be lower than current block + Buffer"
      );
    });

    it("operator cannot start an auction with a higher end block than start block + buffer", async () => {
      const latestBlock = (await ethers.provider.getBlock("latest")).number;
      startBlock = latestBlock + 10;
      endBlock = startBlock + 999999999;

      await expect(
        dexAuction
          .connect(operator)
          .startAuction(startBlock, endBlock, utils.parseEther("100"), 10)
      ).revertedWith(
        "Auction: End block must be lower than Start block + Buffer"
      );
    });

    it("operator cannot start an auction with a wrong initial bid amount (0)", async () => {
      const latestBlock = (await ethers.provider.getBlock("latest")).number;
      startBlock = latestBlock + 10;
      endBlock = startBlock + 100;

      await expect(
        dexAuction
          .connect(operator)
          .startAuction(startBlock, endBlock, utils.parseEther("0"), 10)
      ).revertedWith("Auction: Initial bid amount cannot be zero");
    });

    it("operator cannot start an auction with a wrong initial bid amount (0.35)", async () => {
      const latestBlock = (await ethers.provider.getBlock("latest")).number;
      startBlock = latestBlock + 10;
      endBlock = startBlock + 100;

      await expect(
        dexAuction
          .connect(operator)
          .startAuction(startBlock, endBlock, utils.parseEther("0.35"), 1)
      ).revertedWith("Auction: Incorrect initial bid amount");
    });

    it("operator cannot start an auction with a wrong initial bid amount (7)", async () => {
      const latestBlock = (await ethers.provider.getBlock("latest")).number;
      startBlock = latestBlock + 10;
      endBlock = startBlock + 100;

      await expect(
        dexAuction
          .connect(operator)
          .startAuction(startBlock, endBlock, utils.parseEther("7"), 1)
      ).revertedWith("Auction: Incorrect initial bid amount");
    });

    it("operator cannot start an auction with a wrong leaderboard", async () => {
      const latestBlock = (await ethers.provider.getBlock("latest")).number;
      startBlock = latestBlock + 10;
      endBlock = startBlock + 100;

      await expect(
        dexAuction
          .connect(operator)
          .startAuction(startBlock, endBlock, utils.parseEther("100"), 0)
      ).revertedWith("Auction: Leaderboard cannot be zero");
    });

    it("operator can start an auction", async () => {
      const latestBlock = (await ethers.provider.getBlock("latest")).number;
      startBlock = latestBlock + 10;
      endBlock = startBlock + 100;

      const auctionId = 1;
      const initialBidAmount = utils.parseEther("100").toString();
      const leaderboard = 1;

      await expect(
        dexAuction
          .connect(operator)
          .startAuction(startBlock, endBlock, initialBidAmount, 1)
      )
        .emit(dexAuction, "AuctionStart")
        .withArgs(
          auctionId,
          startBlock,
          endBlock,
          initialBidAmount,
          leaderboard
        );
    });

    it("operator cannot close an auction before end block has passed", async () => {
      await expect(
        dexAuction.connect(operator).closeAuction(utils.parseEther("100"))
      ).revertedWith("Auction: In progress");
    });

    it("anyone can view auctions", async () => {
      const result = await dexAuction.viewAuctions(0, 3);

      expect(result[0].length).deep.equal(1);
      expect(result[0][0].status).deep.equal(1);
      expect(result[0][0].startBlock).deep.equal(startBlock);
      expect(result[0][0].endBlock).deep.equal(endBlock);
      expect(result[0][0].leaderboard).deep.equal(1);
    });

    it("operator cannot set new max auction length if an auction is running", async () => {
      await expect(
        dexAuction.connect(operator).setMaxAuctionLength("38800")
      ).revertedWith("Auction: In progress");
    });

    it("operator cannot start a new auction while the previous has not finished", async () => {
      const latestBlock = (await ethers.provider.getBlock("latest")).number;
      startBlock = latestBlock + 10;
      endBlock = startBlock + 100;

      await expect(
        dexAuction
          .connect(operator)
          .startAuction(startBlock, endBlock, utils.parseEther("100"), "1")
      ).revertedWith("Auction: In progress");
    });

    it("operator cannot add an existing address to the whitelist if auction has started", async () => {
      await expect(
        dexAuction.connect(operator).addWhitelist([alice.address])
      ).revertedWith("Auction: In progress");
    });

    it("operator cannot add an existing address to the whitelist if auction has started", async () => {
      await expect(
        dexAuction.connect(operator).removeWhitelist([alice.address])
      ).revertedWith("Auction: In progress");
    });

    it("whitelisted address cannot bid (for the first time) if the auction hasn't started", async () => {
      const initialBidAmount = utils.parseEther("10");

      await expect(
        dexAuction.connect(alice).bid(initialBidAmount)
      ).revertedWith("Auction: Too early");
    });

    it("whitelisted address cannot bid (for the first time) with an amount lower than threshold", async () => {
      await mine(11);

      const wrongInitialAmount = utils.parseEther("20");

      await expect(
        dexAuction.connect(alice).bid(wrongInitialAmount)
      ).revertedWith("Bid: Incorrect initial bid amount");
    });

    it("whitelisted address can bid (for the first time) with an amount higher than threshold (alice)", async () => {
      const auctionId = 1;
      const correctInitialAmount = utils.parseEther("1000");

      const aliceBalanceBefore = await mockDexToken.balanceOf(alice.address);
      const contractBalanceBefore = await mockDexToken.balanceOf(
        dexAuction.address
      );

      const tx = await dexAuction.connect(alice).bid(correctInitialAmount);
      const receipt = await tx.wait();

      const args = receipt.events!.find((e) => {
        return e.event === "AuctionBid";
      })!.args;

      expect(args!.auctionId).deep.equal(auctionId);
      expect(args!.account).deep.equal(alice.address);
      expect(args!.amount).deep.equal(correctInitialAmount);

      const aliceBalance = await mockDexToken.balanceOf(alice.address);
      expect(aliceBalance).deep.equal(
        aliceBalanceBefore.sub(correctInitialAmount)
      );

      const contractBalance = await mockDexToken.balanceOf(dexAuction.address);
      expect(contractBalance).deep.equal(
        contractBalanceBefore.add(correctInitialAmount)
      );
    });

    it("anyone can view claimable status (auction not ended)", async () => {
      const auctionId = 1;
      const result = await dexAuction.claimable(auctionId, alice.address);
      expect(result).deep.equal(false);
    });

    it("whitelisted address can bid (for the first time) with an amount higher than threshold (bob)", async () => {
      const auctionId = 1;
      const correctInitialAmount = utils.parseEther("100");

      const bobBalanceBefore = await mockDexToken.balanceOf(bob.address);
      const contractBalanceBefore = await mockDexToken.balanceOf(
        dexAuction.address
      );

      const tx = await dexAuction.connect(bob).bid(correctInitialAmount);
      const receipt = await tx.wait();

      const args = receipt.events!.find((e) => {
        return e.event === "AuctionBid";
      })!.args;

      expect(args!.auctionId).deep.equal(auctionId);
      expect(args!.account).deep.equal(bob.address);
      expect(args!.amount).deep.equal(correctInitialAmount);

      const bobBalance = await mockDexToken.balanceOf(bob.address);
      expect(bobBalance).deep.equal(bobBalanceBefore.sub(correctInitialAmount));

      const contractBalance = await mockDexToken.balanceOf(dexAuction.address);
      expect(contractBalance).deep.equal(
        contractBalanceBefore.add(correctInitialAmount)
      );
    });

    it("whitelisted address can bid again, without restrictions", async () => {
      const auctionId = 1;
      const correctInitialAmount = utils.parseEther("50");

      const aliceBalanceBefore = await mockDexToken.balanceOf(alice.address);
      const contractBalanceBefore = await mockDexToken.balanceOf(
        dexAuction.address
      );

      const tx = await dexAuction.connect(alice).bid(correctInitialAmount);
      const receipt = await tx.wait();

      const args = receipt.events!.find((e) => {
        return e.event === "AuctionBid";
      })!.args;

      expect(args!.auctionId).deep.equal(auctionId);
      expect(args!.account).deep.equal(alice.address);
      expect(args!.amount).deep.equal(correctInitialAmount);

      const aliceBalance = await mockDexToken.balanceOf(alice.address);
      expect(aliceBalance).deep.equal(
        aliceBalanceBefore.sub(correctInitialAmount)
      );

      const contractBalance = await mockDexToken.balanceOf(dexAuction.address);
      expect(contractBalance).deep.equal(
        contractBalanceBefore.add(correctInitialAmount)
      );
    });

    it("whitelisted address cannot bid with a wrong modulo (0.5)", async () => {
      const incorrectModulo = utils.parseEther("0.5");
      await expect(dexAuction.connect(alice).bid(incorrectModulo)).revertedWith(
        "Bid: Incorrect amount"
      );
    });

    it("whitelisted address cannot bid with a wrong modulo (99)", async () => {
      const incorrectModulo = utils.parseEther("99");
      await expect(dexAuction.connect(alice).bid(incorrectModulo)).revertedWith(
        "Bid: Incorrect amount"
      );
    });

    it("admin cannot collect funds if auction has not ended", async () => {
      const auctionId = 1;
      await expect(
        dexAuction
          .connect(admin)
          .claimAuctionLeaderboard(auctionId, [alice.address])
      ).revertedWith("Auction: In progress");
    });

    it("whitelisted address cannot claim if auction has not ended", async () => {
      const auctionId = 1;
      await expect(
        dexAuction.connect(alice).claimAuction(auctionId)
      ).revertedWith("Auction: In progress");
    });

    it("whitelisted address cannot claim if auction has not been closed", async () => {
      await mine(101);
      const auctionId = 1;
      await expect(
        dexAuction.connect(alice).claimAuction(auctionId)
      ).revertedWith("Auction: Not claimable");
    });

    it("whitelisted address cannot bid if auction has not ended and end block is over", async () => {
      const correctModulo = utils.parseEther("100");
      await expect(dexAuction.connect(alice).bid(correctModulo)).revertedWith(
        "Auction: Too late"
      );
    });

    it("admin cannot collect funds when auction is not closed", async () => {
      const auctionId = 1;
      await expect(
        dexAuction
          .connect(admin)
          .claimAuctionLeaderboard(auctionId, [alice.address])
      ).revertedWith("Auction: Not claimable");
    });

    it("anyone can view claimable status (auction not closed)", async () => {
      const auctionId = 1;
      const result = await dexAuction.claimable(auctionId, alice.address);
      expect(result).deep.equal(false);
    });

    it("operator can close an auction", async () => {
      const bidLimit = utils.parseEther("1050");
      const auctionId = 1;
      const numberOfParticipants = 2;
      await expect(dexAuction.connect(operator).closeAuction(bidLimit))
        .emit(dexAuction, "AuctionClose")
        .withArgs(auctionId, bidLimit, numberOfParticipants);
    });

    it("anyone can view bids for an auction", async () => {
      const auctionId = 1;
      const cursor = 0;
      const size = 3;
      const result = await dexAuction.viewBidsPerAuction(
        auctionId,
        cursor,
        size
      );

      expect(result[0].length).deep.equal(2);
      expect(result[0][0].account).deep.equal(alice.address);
      expect(result[0][0].amount).deep.equal(utils.parseEther("1050"));
      expect(result[0][0].hasClaimed).deep.equal(false);
      expect(result[0][1].account).deep.equal(bob.address);
      expect(result[0][1].amount).deep.equal(utils.parseEther("100"));
      expect(result[0][1].hasClaimed).deep.equal(false);
    });

    it("anyone can view claimable status", async () => {
      const result = await dexAuction.claimable("1", david.address);
      expect(result).deep.equal(false);
    });

    it("admin can collect funds", async () => {
      const auctionId = 1;
      const account = admin.address;
      const expectedClaimAmount = utils.parseEther("1050");
      const isAdmin = true;

      let totalCollected = await dexAuction.totalCollected();
      expect(totalCollected).deep.equal(0);

      const dexBalanceBefore = await mockDexToken.balanceOf(dexAuction.address);
      const adminBalanceBefore = await mockDexToken.balanceOf(admin.address);

      await expect(
        dexAuction
          .connect(admin)
          .claimAuctionLeaderboard(auctionId, [alice.address])
      )
        .emit(dexAuction, "AuctionClaim")
        .withArgs(auctionId, account, expectedClaimAmount, isAdmin);

      const dexBalance = await mockDexToken.balanceOf(dexAuction.address);
      expect(dexBalance).deep.equal(dexBalanceBefore.sub(expectedClaimAmount));

      const adminBalance = await mockDexToken.balanceOf(admin.address);
      expect(adminBalance).deep.equal(
        adminBalanceBefore.add(expectedClaimAmount)
      );

      totalCollected = await dexAuction.totalCollected();
      expect(totalCollected).deep.equal(expectedClaimAmount);
    });

    it("admin cannot collect funds twice for a same address", async () => {
      const auctionId = 1;
      await expect(
        dexAuction
          .connect(admin)
          .claimAuctionLeaderboard(auctionId, [alice.address])
      ).revertedWith("Bid: Cannot be claimed twice");
    });

    it("admin cannot collect funds for an address not in leaderboard", async () => {
      const auctionId = 1;
      await expect(
        dexAuction
          .connect(admin)
          .claimAuctionLeaderboard(auctionId, [bob.address])
      ).revertedWith("Bid: Cannot be claimed (not in leaderboard)");
    });

    it("admin cannot collect funds for multiple addresses with one not in leaderboard", async () => {
      const auctionId = 1;
      await expect(
        dexAuction
          .connect(admin)
          .claimAuctionLeaderboard(auctionId, [alice.address, bob.address])
      ).revertedWith("Bid: Cannot be claimed twice");
    });

    it("anyone can view bids for an auction (after admin claim)", async () => {
      const auctionId = 1;
      const cursor = 0;
      const size = 3;
      const result = await dexAuction.viewBidsPerAuction(
        auctionId,
        cursor,
        size
      );

      expect(result[0].length).deep.equal(2);
      expect(result[0][0].account).deep.equal(alice.address);
      expect(result[0][0].amount).deep.equal(utils.parseEther("1050"));
      expect(result[0][0].hasClaimed).deep.equal(true);
      expect(result[0][1].account).deep.equal(bob.address);
      expect(result[0][1].amount).deep.equal(utils.parseEther("100"));
      expect(result[0][1].hasClaimed).deep.equal(false);
    });

    it("anyone can view bids for an auction (after admin claim) with size > cursor", async () => {
      const auctionId = 1;
      const cursor = 1;
      const size = 1;
      const result = await dexAuction.viewBidsPerAuction(
        auctionId,
        cursor,
        size
      );

      expect(result[0].length).deep.equal(1);
      expect(result[0][0].account).deep.equal(bob.address);
      expect(result[0][0].amount).deep.equal(utils.parseEther("100"));
      expect(result[0][0].hasClaimed).deep.equal(false);
    });

    it("anyone can view claimable status (bidder in leaderboard)", async () => {
      const auctionId = 1;
      const result = await dexAuction.claimable(auctionId, alice.address);
      expect(result).deep.equal(false);
    });

    it("whitelisted address cannot claim if included in leaderboard", async () => {
      await expect(dexAuction.connect(alice).claimAuction("1")).revertedWith(
        "Bid: Cannot be claimed (in leaderboard)"
      );
    });

    it("anyone can view claimable status (bidder has not claimed)", async () => {
      const auctionId = 1;
      const result = await dexAuction.claimable(auctionId, bob.address);
      expect(result).deep.equal(true);
    });

    it("whitelisted address can claim if not included in leaderboard", async () => {
      const auctionId = 1;
      const account = bob.address;
      const expectedClaimAmount = utils.parseEther("100");
      const isAdmin = false;

      const dexBalanceBefore = await mockDexToken.balanceOf(dexAuction.address);
      const bobBalanceBefore = await mockDexToken.balanceOf(bob.address);

      await expect(dexAuction.connect(bob).claimAuction(auctionId))
        .emit(dexAuction, "AuctionClaim")
        .withArgs(auctionId, account, expectedClaimAmount, isAdmin);

      const dexBalance = await mockDexToken.balanceOf(dexAuction.address);
      expect(dexBalance).deep.equal(dexBalanceBefore.sub(expectedClaimAmount));

      const bobBalance = await mockDexToken.balanceOf(bob.address);
      expect(bobBalance).deep.equal(bobBalanceBefore.add(expectedClaimAmount));
    });

    it("anyone can view claimable status (bidder has claimed)", async () => {
      const auctionId = 1;
      const result = await dexAuction.claimable(auctionId, bob.address);
      expect(result).deep.equal(false);
    });

    it("anyone can view bids for an auction (after user claim)", async () => {
      const auctionId = 1;
      const cursor = 0;
      const size = 3;
      const result = await dexAuction.viewBidsPerAuction(
        auctionId,
        cursor,
        size
      );

      expect(result[0].length).deep.equal(2);
      expect(result[0][0].account).deep.equal(alice.address);
      expect(result[0][0].amount).deep.equal(utils.parseEther("1050"));
      expect(result[0][0].hasClaimed).deep.equal(true);
      expect(result[0][1].account).deep.equal(bob.address);
      expect(result[0][1].amount).deep.equal(utils.parseEther("100"));
      expect(result[0][1].hasClaimed).deep.equal(true);
    });

    it("whitelisted address cannot claim twice", async () => {
      const auctionId = 1;
      await expect(
        dexAuction.connect(bob).claimAuction(auctionId)
      ).revertedWith("Bid: Cannot be claimed twice");
    });

    it("whitelisted address that did not participate cannot claim", async () => {
      const auctionId = 1;
      await expect(
        dexAuction.connect(ethan).claimAuction(auctionId)
      ).revertedWith("Bid: Not found");
    });

    it("operator can set new max auction length", async () => {
      const maxAuctionLength = 28800;
      await expect(
        dexAuction.connect(operator).setMaxAuctionLength(maxAuctionLength)
      )
        .emit(dexAuction, "NewMaxAuctionLength")
        .withArgs(maxAuctionLength);
    });

    it("operator cannot set new max auction length with a wrong value (0)", async () => {
      await expect(
        dexAuction.connect(operator).setMaxAuctionLength(0)
      ).revertedWith("Auction: Length cannot be zero");
    });

    it("operator cannot set new max auction length with a wrong value (999999999)", async () => {
      await expect(
        dexAuction.connect(operator).setMaxAuctionLength(999999999)
      ).revertedWith("Auction: Cannot be longer than 5 days (144,000 blocks)");
    });

    it("anyone can view bids for an auction", async () => {
      const bidder = alice.address;
      const cursor = 0;
      const size = 3;
      const result = await dexAuction.viewBidderAuctions(bidder, cursor, size);

      expect(result[0].length).deep.equal(1);
      expect(result[1].length).deep.equal(1);
      expect(result[2].length).deep.equal(1);
      expect(result[0][0]).deep.equal(1);
      expect(result[1][0]).deep.equal(utils.parseEther("1050"));
      expect(result[2][0]).deep.equal(true);
    });
  });

  describe("Auction with no bidders", async () => {
    it("operator can start an auction", async () => {
      const latestBlock = (await ethers.provider.getBlock("latest")).number;
      startBlock = latestBlock + 10;
      endBlock = startBlock + 100;

      const auctionId = 2;
      const initialBidAmount = utils.parseEther("100").toString();
      const leaderboard = 8;

      await expect(
        dexAuction
          .connect(operator)
          .startAuction(startBlock, endBlock, initialBidAmount, leaderboard)
      )
        .emit(dexAuction, "AuctionStart")
        .withArgs(
          auctionId,
          startBlock,
          endBlock,
          initialBidAmount,
          leaderboard
        );
    });

    it("operator can close an auction", async () => {
      await mine(150);

      const bidLimit = utils.parseEther("1050");
      const auctionId = 2;
      const numberOfParticipants = 0;
      await expect(dexAuction.connect(operator).closeAuction(bidLimit))
        .emit(dexAuction, "AuctionClose")
        .withArgs(auctionId, bidLimit, numberOfParticipants);
    });

    it("admin cannot collect any funds", async () => {
      const auctionId = 2;

      await expect(
        dexAuction
          .connect(admin)
          .claimAuctionLeaderboard(auctionId, [alice.address])
      ).revertedWith("Bid: Cannot be claimed (not in leaderboard)");
    });

    it("anyone can view auctions", async () => {
      const result = await dexAuction.viewAuctions(1, 1);

      expect(result[0].length).deep.equal(1);
      expect(result[0][0].status).deep.equal(2);
      expect(result[0][0].startBlock).deep.equal(startBlock);
      expect(result[0][0].endBlock).deep.equal(endBlock);
      expect(result[0][0].leaderboard).deep.equal(8);
    });
  });

  describe("Operator can manage the contract in between auctions", async () => {
    it("operator can remove an address from the whitelist", async () => {
      await expect(
        dexAuction.connect(operator).removeWhitelist([alice.address])
      )
        .emit(dexAuction, "WhitelistRemove")
        .withArgs(alice.address);
    });

    it("operator can add an address to the whitelist", async () => {
      await expect(dexAuction.connect(operator).addWhitelist([alice.address]))
        .emit(dexAuction, "WhitelistAdd")
        .withArgs(alice.address);
    });
  });
});
