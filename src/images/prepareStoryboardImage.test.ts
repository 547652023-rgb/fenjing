import { describe, expect, it } from "vitest";
import { cropToSixteenByNine } from "./prepareStoryboardImage";

describe("cropToSixteenByNine", () => {
  it("center-crops a portrait image to a 16:9 source rectangle", () => {
    expect(cropToSixteenByNine(900, 1600)).toEqual({
      sx: 0,
      sy: 546.875,
      sw: 900,
      sh: 506.25,
    });
  });

  it("center-crops a wide image to a 16:9 source rectangle", () => {
    expect(cropToSixteenByNine(2000, 900)).toEqual({
      sx: 200,
      sy: 0,
      sw: 1600,
      sh: 900,
    });
  });
});
