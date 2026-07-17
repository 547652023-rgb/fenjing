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
