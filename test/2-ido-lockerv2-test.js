const { expect } = require("chai");
const { ethers } = require("hardhat");
const { BigNumber } = ethers;
var crypto = require('crypto');

function fmtEth(n) {
  return ethers.utils.parseEther(n).toString();
}

function fmtUsdc(n) {
  return ethers.utils.parseUnits(n, 6);
}

const latest = async function () {
  const block = await ethers.provider.getBlock("latest");
  return BigNumber.from(block.timestamp);
};

async function pushblocks(time) {
  await ethers.provider.send("evm_increaseTime", [time]);
  await ethers.provider.send("evm_mine", []);
} 


describe("IDO Testing", function () {
  describe("LockerV2", function () {
    beforeEach(async () => {
      const signers = await ethers.getSigners();
      this.deployer = signers[0];
      this.user = signers[1];
      this.user1 = signers[2];
      this.user2 = signers[3];
      this.user3 = signers[4];

      this.ERC20 = await ethers.getContractFactory("MockERC20");
      this.Locker = await ethers.getContractFactory("IDOLockerV2");
      this.token = await this.ERC20.deploy("xStella", "XSTELLA", 0);
      await this.token.deployed();

      this.locker = await this.Locker.deploy();
      await this.locker.deployed();

      await this.token.mint(this.user.address, fmtEth("1000"));
      await this.token.mint(this.user1.address, fmtEth("100"));
      await this.token.mint(this.user2.address, fmtEth("200"));
      await this.token.mint(this.user3.address, fmtEth("300"));
    });

    it("Make sure everything is fine", async () => {
      expect((await this.token.symbol()).toLowerCase()).to.equal("xstella");
    });

    it("Add Pool", async () => {
      const timestamp = (await latest()).toString()
      await this.locker.add(
        this.token.address,
        timestamp, // startTime,
        +timestamp + 86400 * 7, // _endTimestamp,
        +timestamp + 86400 * 15, // _unlockTimestamp,
        1500 // _earlyUnlockPenalty,
      );

      expect(await this.locker.poolLength()).to.equal(1);
    });

    it("Add Pool with past unlock date should revert", async () => {
      const timestamp = (await latest()).toString()
      expect(
        this.locker.add(
          this.token.address,
          timestamp, // startTime,
          +timestamp + 86400 * 7, // _endTimestamp,
          +timestamp - 86400 * 15, // _unlockTimestamp,
          1500 // _earlyUnlockPenalty,
        )
      ).to.be.revertedWith("Unlock timestamp is not in the future!");
    });

    it("Add Pool with high fees should revert", async () => {
      const timestamp = (Date.now() / 1000).toFixed(0);
      expect(
        this.locker.add(
          this.token.address,
          timestamp, // startTime,
          +timestamp + 86400 * 7, // _endTimestamp,
          +timestamp - 86400 * 15, // _unlockTimestamp,
          6000 // _earlyUnlockPenalty,
        )
      ).to.be.revertedWith("Penalty cannot be more than 50%");
    });

    it("Update Pool", async () => {
      const timestamp = (await latest()).toString()
      await this.locker.add(
        this.token.address,
        timestamp, // startTime,
        +timestamp + 86400 * 7, // _endTimestamp,
        +timestamp + 86400 * 15, // _unlockTimestamp,
        1500 // _earlyUnlockPenalty,
      );
      expect(await this.locker.poolLength()).to.equal(1);
      expect((await this.locker.poolInfo(0)).earlyUnlockPenalty).to.equal(1500);

      // await this.
      await this.locker.update(
        0, // _PID
        timestamp, // startTime,
        +timestamp + 86400 * 7, // _endTimestamp,
        +timestamp + 86400 * 15, // _unlockTimestamp,
        2500 // _earlyUnlockPenalty,
      );
      expect((await this.locker.poolInfo(0)).earlyUnlockPenalty).to.equal(2500);
    });

    it("User Locks tokens", async () => {
      const timestamp = (await latest()).toString()
      await this.locker.add(
        this.token.address,
        timestamp, // startTime,
        +timestamp + 86400 * 7, // _endTimestamp,
        +timestamp + 86400 * 15, // _unlockTimestamp,
        1500 // _earlyUnlockPenalty,
      );
      expect(await this.locker.poolLength()).to.equal(1);

      await this.token
        .connect(this.user)
        .approve(this.locker.address, 10000000);
      await this.locker.connect(this.user).lock(0, 100);

      expect(await this.locker.userInfo(0, this.user.address)).to.equal(100);
    });

    // it("User Unlocks before time should revert", async () => {
    //   const timestamp = (await latest()).toString()
    //   await this.locker.add(
    //     this.token.address,
    //     timestamp, // startTime,
    //     +timestamp + 86400 * 7, // _endTimestamp,
    //     +timestamp + 86400 * 15, // _unlockTimestamp,
    //     1500 // _earlyUnlockPenalty,
    //   );
    //   expect(await this.locker.poolLength()).to.equal(1);

    //   await this.token
    //     .connect(this.user)
    //     .approve(this.locker.address, 10000000);
    //   await this.locker.connect(this.user).lock(0, 100);

    //   expect(await this.locker.userInfo(0, this.user.address)).to.equal(100);

    //   expect(this.locker.connect(this.user).unlock(0)).to.be.revertedWith(
    //     "Cannot unlock before lock period expires"
    //   );
    // });

    it("Early Withdraw has Penalty", async () => {
      const timestamp = (await latest()).toString()
      await this.locker.add(
        this.token.address,
        timestamp, // startTime,
        +timestamp + 86400 * 7, // _endTimestamp,
        +timestamp + 86400 * 15, // _unlockTimestamp,
        1500 // _earlyUnlockPenalty,
      );
      expect(await this.locker.poolLength()).to.equal(1);

      await this.token
        .connect(this.user)
        .approve(this.locker.address, fmtEth("1000"));
      await this.locker.connect(this.user).lock(0, fmtEth("1000"));

      expect(await this.locker.userInfo(0, this.user.address)).to.equal(
        fmtEth("1000")
      );

      // balancePrint(this.token, this.user.address, "Balance before");
      expect(await this.token.balanceOf(this.user.address)).to.equal(0);
      await this.locker.connect(this.user).earlyUnlock(0);
      expect(await this.token.balanceOf(this.user.address)).to.equal(
        fmtEth("850")
      );

      // MOVE PENALTY TO OWNER

      expect(await this.token.balanceOf(this.deployer.address)).to.equal(0);
      await this.locker.connect(this.deployer).sweep(0);
      expect(await this.token.balanceOf(this.deployer.address)).to.equal(
        fmtEth("150")
      );

      // balancePrint(this.token, this.user.address, "Balance after");
    });

    it("User Unlocks after time should pass", async () => {
      const timestamp = (await latest()).toString()
      await this.locker.add(
        this.token.address,
        timestamp, // startTime,
        +timestamp + 86400 * 7, // _endTimestamp,
        +timestamp + 86400 * 15, // _unlockTimestamp,
        1500 // _earlyUnlockPenalty,
      );
      expect(await this.locker.poolLength()).to.equal(1);

      await this.token
        .connect(this.user)
        .approve(this.locker.address, fmtEth("1000"));
      await this.locker.connect(this.user).lock(0, fmtEth("1000"));

      expect(await this.locker.userInfo(0, this.user.address)).to.equal(
        fmtEth("1000")
      );

      await ethers.provider.send("evm_increaseTime", [1296000]);
      await ethers.provider.send("evm_mine", []);

      // balancePrint(this.token, this.user.address, "Balance before");
      expect(await this.token.balanceOf(this.user.address)).to.equal(0);
      await this.locker.connect(this.user).unlock(0);
      expect(await this.token.balanceOf(this.user.address)).to.equal(
        fmtEth("1000")
      );

      // balancePrint(this.token, this.user.address, "Balance after");
    });

    it("Returns right tier", async () => {
      const timestamp = (await latest()).toString()
      await this.locker.add(
        this.token.address,
        timestamp, // startTime,
        +timestamp + 86400 * 7, // _endTimestamp,
        +timestamp + 86400 * 15, // _unlockTimestamp,
        1500 // _earlyUnlockPenalty,
      );
      expect(await this.locker.poolLength()).to.equal(1);

      await this.locker.addTier(0, [fmtEth('0'), 500]) // 0.005%
      await this.locker.addTier(0, [fmtEth('100'), 1000]) // 0.01%
      await this.locker.addTier(0, [fmtEth('200'), 2000]) // 0.02%
      await this.locker.addTier(0, [fmtEth('300'), 3000]) // 0.02%

      await this.token
        .connect(this.user)
        .approve(this.locker.address, fmtEth("1000"));
      
      // 1 - Locked nothing should return 0 Tier

      expect(await this.locker.getUserTier(0, this.user.address)).to.equal(500);

      // 2 - Locked 100 should return 1 Tier
      await this.token.connect(this.user1).approve(this.locker.address, fmtEth("1000"));
      await this.locker.connect(this.user1).lock(0, fmtEth("100"));
      expect(await this.locker.getUserTier(0, this.user1.address)).to.equal(1000);

      // 3 - Locked 200 should return 2 Tier
      await this.token.connect(this.user2).approve(this.locker.address, fmtEth("1000"));
      await this.locker.connect(this.user2).lock(0, fmtEth("200"));
      expect(await this.locker.getUserTier(0, this.user2.address)).to.equal(2000);

      // 4 - Locked 300 should return 2 Tier
      await this.token.connect(this.user3).approve(this.locker.address, fmtEth("1000"));
      await this.locker.connect(this.user3).lock(0, fmtEth("300"));
      expect(await this.locker.getUserTier(0, this.user3.address)).to.equal(3000);
    });
  });
});
