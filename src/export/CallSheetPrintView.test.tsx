import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { CallSheetPrintView } from "./CallSheetPrintView";
import type { CallSheetPrintModel } from "./callSheetPrint";

const model: CallSheetPrintModel = {
  projectTitle: "广告片", versionNumber: 1, publishedAt: "2026-08-20T08:00:00.000Z",
  shootDay: { id: "day-1", projectId: "project-1", title: "首日", shootDate: "2026-08-23", location: "测试棚 A", callTime: "08:00", wrapTime: "18:00", coordinator: "王制片", notes: "带雨具", weather: "小雨", rainPlan: "转棚内", safetyNotes: "高空作业系安全绳", emergencyContactName: "李安全", emergencyContactRole: "安全员", emergencyContactPhone: "13800000000", order: 0 },
  scenes: [{ id: "scene-1", number: "1", name: "天台", intExt: "EXT", dayNight: "NIGHT", targetDurationSeconds: "15", shootDate: "2026-08-23", notes: "夜戏", collapsed: false }],
  shots: [{ id: "shot-1", sceneId: "scene-1", shootDayId: "day-1", shootOrder: 0, values: { shotNumber: "1", content: "主角登场", shotSize: "中景" } }],
  acknowledgementSummary: { acknowledged: 1, total: 2 },
};

it("renders version and acknowledgement summary in the formal print view", () => {
  render(<CallSheetPrintView model={model} onClose={vi.fn()} />);

  expect(screen.getByRole("region", { name: "正式拍摄通告" })).toBeInTheDocument();
  expect(screen.getByText("正式拍摄通告 · V1")).toBeInTheDocument();
  expect(screen.getByText("成员确认：1 / 2")).toBeInTheDocument();
  expect(screen.getByText("场次 1 · 天台")).toBeInTheDocument();
  expect(screen.getByText("镜头 1 · 主角登场")).toBeInTheDocument();
});

it("prints without mutating the formal notice and closes on request", () => {
  const print = vi.spyOn(window, "print").mockImplementation(() => {});
  const onClose = vi.fn();
  render(<CallSheetPrintView model={model} onClose={onClose} />);

  fireEvent.click(screen.getByRole("button", { name: "打印正式通告" }));
  fireEvent.click(screen.getByRole("button", { name: "关闭" }));

  expect(print).toHaveBeenCalledOnce();
  expect(onClose).toHaveBeenCalledOnce();
  expect(model.shootDay.location).toBe("测试棚 A");
  print.mockRestore();
});
