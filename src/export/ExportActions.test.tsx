import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { createProject } from "../domain/storyboard";
import { ExportActions } from "./ExportActions";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

it("shows both export actions and disables them while an Excel export runs", async () => {
  const project = createProject();
  const pending = deferred<void>();
  const exportExcel = vi.fn(() => pending.promise);
  const exportPdf = vi.fn(async () => {});
  const user = userEvent.setup();

  render(
    <ExportActions
      exportExcel={exportExcel}
      exportPdf={exportPdf}
      project={project}
    />,
  );

  expect(screen.getByRole("button", { name: "导出 Excel" })).toBeVisible();
  expect(screen.getByRole("button", { name: "导出 PDF" })).toBeVisible();

  await user.click(screen.getByRole("button", { name: "导出 Excel" }));

  expect(exportExcel).toHaveBeenCalledWith(project);
  expect(screen.getByRole("button", { name: "正在导出 Excel…" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "导出 PDF" })).toBeDisabled();

  pending.resolve();
  expect(await screen.findByRole("button", { name: "导出 Excel" })).toBeEnabled();
});

it("announces an export error and enables both actions for retry", async () => {
  const project = createProject();
  const pending = deferred<void>();
  const user = userEvent.setup();

  render(
    <ExportActions
      exportExcel={() => pending.promise}
      exportPdf={async () => {}}
      project={project}
    />,
  );

  await user.click(screen.getByRole("button", { name: "导出 Excel" }));
  pending.reject(new Error("download failed"));

  expect(await screen.findByRole("alert")).toHaveTextContent("导出失败，请稍后重试");
  expect(screen.getByRole("button", { name: "导出 Excel" })).toBeEnabled();
  expect(screen.getByRole("button", { name: "导出 PDF" })).toBeEnabled();
});
