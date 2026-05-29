import { describe, expect, it } from "vitest";
import { parseDotenv } from "../src/config/env.js";

describe("parseDotenv", () => {
  it("parses quoted and unquoted values while ignoring comments", () => {
    expect(parseDotenv([
      "# comment",
      "A=1",
      "B=\"two\"",
      "C='three'",
      "EMPTY=",
    ].join("\n"))).toEqual({
      A: "1",
      B: "two",
      C: "three",
      EMPTY: "",
    });
  });
});

