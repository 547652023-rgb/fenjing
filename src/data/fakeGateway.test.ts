import { BUILT_IN_TEMPLATES, projectToTemplateSnapshot } from "../domain/templates";
import { createProject } from "../domain/storyboard";
import { FakeStoryboardGateway } from "./fakeGateway";

it("keeps projects isolated by signed-in membership", async () => {
  const gateway = new FakeStoryboardGateway();
  await gateway.signUp("owner@example.com", "password123");
  const created = await gateway.createProject("广告片");

  await gateway.signOut();
  await gateway.signUp("other@example.com", "password123");
  expect(await gateway.listProjects()).toEqual([]);

  await gateway.signIn("owner@example.com", "password123");
  expect(await gateway.listProjects()).toEqual([
    expect.objectContaining({ id: created.id, title: "广告片", role: "owner" }),
  ]);
});

it("lets an owner invite a registered editor without exposing other projects", async () => {
  const gateway = new FakeStoryboardGateway();
  const owner = await gateway.signUp("owner@example.com", "password123");
  const created = await gateway.createProject("广告片");
  await gateway.signOut();
  const editor = await gateway.signUp("editor@example.com", "password123");
  await gateway.signOut();
  await gateway.signIn(owner.email, "password123");

  await gateway.inviteMember(created.id, editor.email);
  await gateway.signOut();
  await gateway.signIn(editor.email, "password123");

  expect(await gateway.listProjects()).toEqual([
    expect.objectContaining({ id: created.id, role: "editor" }),
  ]);
});

it("imports a local project as a new owned project", async () => {
  const gateway = new FakeStoryboardGateway();
  await gateway.signUp("owner@example.com", "password123");
  const local = { ...createProject(), title: "旧项目" };

  const imported = await gateway.importLocalProject(local);

  expect(imported).toMatchObject({ title: "旧项目", role: "owner" });
  await expect(gateway.loadProject(imported.id)).resolves.toMatchObject({
    title: "旧项目",
  });
});

it("lets project members share templates but hides them from non-members", async () => {
  const gateway = new FakeStoryboardGateway();
  const owner = await gateway.signUp("owner@example.com", "password123");
  const project = await gateway.createProject("广告片");
  const snapshot = projectToTemplateSnapshot(await gateway.loadProject(project.id));
  await gateway.signOut();
  const editor = await gateway.signUp("editor@example.com", "password123");
  await gateway.signOut();
  await gateway.signUp("outsider@example.com", "password123");
  await gateway.signOut();
  await gateway.signIn(owner.email, "password123");
  await gateway.inviteMember(project.id, editor.email);

  await gateway.createTemplate(project.id, "广告", snapshot);

  await gateway.signIn(editor.email, "password123");
  expect((await gateway.listTemplates()).map((template) => template.name)).toContain("广告");
  await gateway.signIn("outsider@example.com", "password123");
  expect(await gateway.listTemplates()).toEqual(BUILT_IN_TEMPLATES);
});

it("creates a project from a template snapshot without sharing mutable state", async () => {
  const gateway = new FakeStoryboardGateway();
  await gateway.signUp("owner@example.com", "password123");
  const snapshot = projectToTemplateSnapshot({
    ...createProject(),
    title: "模板标题",
    aspectRatio: "9:16",
    fields: createProject().fields.slice(0, 2),
    shots: [
      { id: "template-shot-1", values: { shotNumber: "1", content: "开场" } },
      { id: "template-shot-2", values: { shotNumber: "2", content: "收尾" } },
    ],
  });

  const summary = await gateway.createProject("新广告", snapshot);
  snapshot.fields[0].label = "调用方修改";
  snapshot.shots[0].values.content = "调用方修改";

  expect(await gateway.loadProject(summary.id)).toMatchObject({
    title: "新广告",
    aspectRatio: "9:16",
    fields: [{ label: "镜号" }, { label: "画面" }],
    shots: [
      { values: { shotNumber: "1", content: "开场" } },
      { values: { shotNumber: "2", content: "收尾" } },
    ],
  });
});

it("removes image values from caller-supplied template snapshots during project creation", async () => {
  const gateway = new FakeStoryboardGateway();
  await gateway.signUp("owner@example.com", "password123");
  const snapshot = {
    title: "带图片的模板",
    aspectRatio: "16:9",
    fields: [
      { id: "frame", label: "画面", type: "image" as const, visible: true, order: 0 },
      { id: "content", label: "内容", type: "text" as const, visible: true, order: 1 },
    ],
    shots: [{ id: "template-shot", values: { frame: "image-data", content: "保留" } }],
  };

  const summary = await gateway.createProject("新广告", snapshot);

  await expect(gateway.loadProject(summary.id)).resolves.toMatchObject({
    shots: [{ values: { content: "保留" } }],
  });
  expect((await gateway.loadProject(summary.id)).shots[0].values.frame).toBeUndefined();
});
