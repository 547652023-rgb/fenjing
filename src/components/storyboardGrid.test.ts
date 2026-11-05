import { describe, expect, it } from "vitest";
import { createProject } from "../domain/storyboard";
import { undoableGridChanges, parseClipboardGrid } from "./storyboardGrid";

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


it("counts deleted shots and fields as skipped undo changes", () => {
  const project = createProject();
  project.shots[0].values.content = "pasted";
  const changes = [
    { shotId: project.shots[0].id, fieldId: "content", before: "", value: "pasted" },
    { shotId: "deleted-shot", fieldId: "content", before: "", value: "pasted" },
    { shotId: project.shots[0].id, fieldId: "deleted-field", before: "", value: "pasted" },
  ];
  expect(undoableGridChanges(project, changes)).toEqual([changes[0]]);
});
