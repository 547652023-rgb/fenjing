import { describe, expect, it } from "vitest";
import { parseClipboardGrid } from "./storyboardGrid";

describe("spreadsheet clipboard text", () => {
  it("keeps quotes used as punctuation", () => {
    expect(parseClipboardGrid('"主角"向前\t"摄影机"后退\n下一镜\t备注')).toEqual([
      ['"主角"向前', '"摄影机"后退'], ["下一镜", "备注"],
    ]);
  });
  it("preserves quoted newlines and doubled spreadsheet quotes", () => {
    expect(parseClipboardGrid('"第一行\n他说""开始"""\t备注\r\n第二镜\t\r\n')).toEqual([
      ['第一行\n他说"开始"', "备注"], ["第二镜", ""],
    ]);
  });
  it("preserves an unmatched opening quotation mark", () => {
    expect(parseClipboardGrid('"未结束\t另一格')).toEqual([['"未结束', "另一格"]]);
  });
});
