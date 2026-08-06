import { render, screen, within } from "@testing-library/react";
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

it("opens export settings and passes a temporary logo to the selected exporter", async () => {
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

  expect(screen.getByRole("button", { name: "导出文件" })).toBeVisible();

  await user.click(screen.getByRole("button", { name: "导出文件" }));

  const dialog = screen.getByRole("dialog", { name: "导出交付" });
  expect(within(dialog).getByText(project.title)).toBeVisible();
  expect(within(dialog).getByText("16:9")).toBeVisible();
  expect(within(dialog).getByText("1 个")).toBeVisible();
  expect(within(dialog).getByText("可编辑镜头清单")).toBeVisible();
  expect(within(dialog).getByText("审阅用制片稿")).toBeVisible();
  const logo = new File(["logo"], "logo.png", { type: "image/png" });
  await user.upload(screen.getByLabelText("本次导出 Logo"), logo);
  expect(screen.getByText("logo.png")).toBeVisible();

  await user.click(screen.getByRole("button", { name: /可编辑镜头清单/ }));

  expect(exportExcel).toHaveBeenCalledWith(project, expect.objectContaining({
    logo: expect.objectContaining({ name: "logo.png", url: expect.any(String) }),
  }));
  expect(screen.getByRole("button", { name: /可编辑镜头清单/ })).toBeDisabled();
  expect(screen.getByRole("button", { name: /审阅用制片稿/ })).toBeDisabled();

  pending.resolve();
  expect(await screen.findByRole("button", { name: "导出文件" })).toBeEnabled();
});

it("keeps settings open after an export error and clears the temporary logo when closed", async () => {
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

  await user.click(screen.getByRole("button", { name: "导出文件" }));
  const logo = new File(["logo"], "logo.png", { type: "image/png" });
  await user.upload(screen.getByLabelText("本次导出 Logo"), logo);
  await user.click(screen.getByRole("button", { name: /可编辑镜头清单/ }));
  pending.reject(new Error("download failed"));

  expect(await screen.findByRole("alert")).toHaveTextContent("导出失败，请稍后重试");
  expect(screen.getByRole("button", { name: /可编辑镜头清单/ })).toBeEnabled();
  expect(screen.getByRole("button", { name: /审阅用制片稿/ })).toBeEnabled();
  await user.click(screen.getByRole("button", { name: "取消" }));
  await user.click(screen.getByRole("button", { name: "导出文件" }));
  expect(screen.queryByText("logo.png")).not.toBeInTheDocument();
});
