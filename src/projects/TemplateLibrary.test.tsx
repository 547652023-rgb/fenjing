import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import type { ProjectSummary, StoryboardTemplate } from "../domain/models";
import { createProject } from "../domain/storyboard";
import { BUILT_IN_TEMPLATES, projectToTemplateSnapshot } from "../domain/templates";
import { TemplateLibrary } from "./TemplateLibrary";
import { TemplatePicker } from "./TemplatePicker";

const projects: ProjectSummary[] = [
  {
    id: "project-1",
    title: "自建广告",
    ownerId: "owner-1",
    ownerEmail: "owner@example.com",
    role: "owner",
    memberCount: 1,
    updatedAt: "2026-07-21T00:00:00.000Z",
  },
  {
    id: "project-2",
    title: "受邀宣传片",
    ownerId: "owner-2",
    ownerEmail: "teammate@example.com",
    role: "editor",
    memberCount: 2,
    updatedAt: "2026-07-21T00:00:00.000Z",
  },
];

const customTemplate: StoryboardTemplate = {
  id: "template-1",
  name: "团队模板",
  sourceProjectId: "project-1",
  builtIn: false,
  snapshot: projectToTemplateSnapshot({ ...createProject(), title: "自建广告" }),
  updatedAt: "2026-07-21T00:00:00.000Z",
};

function renderLibrary(overrides: Partial<React.ComponentProps<typeof TemplateLibrary>> = {}) {
  const props: React.ComponentProps<typeof TemplateLibrary> = {
    templates: [...BUILT_IN_TEMPLATES, customTemplate],
    projects,
    onCreate: vi.fn(),
    onUpdate: vi.fn(),
    onDelete: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  };
  render(<TemplateLibrary {...props} />);
  return props;
}

it("selects blank, built-in, and shared templates", async () => {
  const user = userEvent.setup();
  const onSelect = vi.fn();
  render(
    <TemplatePicker
      templates={[...BUILT_IN_TEMPLATES, customTemplate]}
      onSelect={onSelect}
    />,
  );

  expect(screen.getByRole("radio", { name: "空白项目" })).toBeChecked();
  await user.click(screen.getByRole("radio", { name: "专业" }));
  expect(onSelect).toHaveBeenLastCalledWith("builtin:professional");
  await user.click(screen.getByRole("radio", { name: "团队模板" }));
  expect(onSelect).toHaveBeenLastCalledWith("template-1");
  expect(screen.getByRole("radio", { name: "团队模板" })).toBeChecked();
});

it("creates shared templates only from projects visible to the member", async () => {
  const user = userEvent.setup();
  const { onCreate } = renderLibrary();

  expect(screen.getByRole("option", { name: "自建广告" })).toBeVisible();
  expect(screen.getByRole("option", { name: "受邀宣传片" })).toBeVisible();
  expect(screen.queryByRole("option", { name: "不可见项目" })).not.toBeInTheDocument();

  await user.type(screen.getByRole("textbox", { name: "模板名称" }), "广告模板");
  await user.selectOptions(screen.getByRole("combobox", { name: "来源项目" }), "project-2");
  await user.click(screen.getByRole("button", { name: "创建模板" }));

  expect(onCreate).toHaveBeenCalledWith("project-2", "广告模板");
});

it("keeps built-in templates read-only while custom templates can be updated", async () => {
  const user = userEvent.setup();
  const { onUpdate } = renderLibrary();

  expect(screen.queryByRole("button", { name: "编辑专业" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "删除专业" })).not.toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "编辑团队模板" }));
  const nameInput = screen.getByRole("textbox", { name: "编辑模板名称" });
  await user.clear(nameInput);
  await user.type(nameInput, "新版团队模板");
  await user.click(screen.getByRole("button", { name: "保存模板" }));

  expect(onUpdate).toHaveBeenCalledWith("template-1", "新版团队模板");
});

it("confirms before deleting a custom shared template", async () => {
  const user = userEvent.setup();
  const onDelete = vi.fn();
  vi.spyOn(window, "confirm").mockReturnValue(true);
  renderLibrary({ onDelete });

  await user.click(screen.getByRole("button", { name: "删除团队模板" }));

  expect(window.confirm).toHaveBeenCalledWith("确定删除模板“团队模板”吗？此操作无法撤销。");
  expect(onDelete).toHaveBeenCalledWith("template-1");
});
