import { describe, expect, it } from "vitest";
import { classifyHolderIdentity } from "../src/altcoin/intelligence/onchain/holder_identity_review.js";

describe("classifyHolderIdentity", () => {
  it("resolves Moralis-labeled holders", () => {
    expect(classifyHolderIdentity({
      moralisEntity: "Pendle Finance",
      moralisIsContract: false,
      contractName: "",
      isVerified: false,
      isProxy: false,
      topHolderPctSupply: 23,
      arkhamEntityName: "",
      arkhamEntityType: "",
    }).decision).toBe("IDENTITY_RESOLVED");
  });

  it("flags high concentration unlabeled contracts", () => {
    const result = classifyHolderIdentity({
      moralisEntity: "",
      moralisIsContract: true,
      contractName: "",
      isVerified: false,
      isProxy: false,
      topHolderPctSupply: 58,
      arkhamEntityName: "",
      arkhamEntityType: "",
    });
    expect(result.decision).toBe("HIGH_CONCENTRATION_UNRESOLVED");
  });

  it("recognizes likely project contracts by contract name", () => {
    const result = classifyHolderIdentity({
      moralisEntity: "",
      moralisIsContract: true,
      contractName: "VotingEscrowToken",
      isVerified: true,
      isProxy: false,
      topHolderPctSupply: 30,
      arkhamEntityName: "",
      arkhamEntityType: "",
    });
    expect(result.decision).toBe("PROJECT_CONTRACT_LIKELY");
  });

  it("does not treat generic safe proxies as resolved identity", () => {
    const result = classifyHolderIdentity({
      moralisEntity: "",
      moralisIsContract: true,
      contractName: "GnosisSafeProxy",
      isVerified: true,
      isProxy: false,
      topHolderPctSupply: 58,
      arkhamEntityName: "",
      arkhamEntityType: "",
    });
    expect(result.decision).toBe("HIGH_CONCENTRATION_UNRESOLVED");
    expect(result.identityClass).toBe("UNATTRIBUTED_MULTISIG_PROXY");
  });

  it("prefers Arkham entity resolution when available", () => {
    const result = classifyHolderIdentity({
      moralisEntity: "",
      moralisIsContract: true,
      contractName: "GnosisSafeProxy",
      isVerified: true,
      isProxy: false,
      topHolderPctSupply: 58,
      arkhamEntityName: "Ondo Finance",
      arkhamEntityType: "misc",
    });
    expect(result.decision).toBe("IDENTITY_RESOLVED");
    expect(result.identityClass).toBe("ARKHAM_MISC_RESOLVED");
  });
});
