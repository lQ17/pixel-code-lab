import { test, expect, type Page } from "@playwright/test";
import { draftKey, publishedKey, type ContentPackage } from "../src/engine/content";
import { importBackupKey, previousPublishedKey } from "../src/engine/contentDelivery";
import { runCode, switchEditorKind } from "./helpers";

const level = (id: string, targetColors = "0".repeat(441)) => ({ id, title: id, description: "", mode: "2d" as const, radius: 10, targetColors, revision: 1, source: "manual" as const, archived: false });
const packageOf = (ids: string[]): ContentPackage => ({
  format: "pixel-code-lab.content", version: 1,
  chapters: [{ id: "chapter-a", title: "第一章", description: "", order: 0 }],
  sections: [{ id: "section-a", chapterId: "chapter-a", title: "第一节", description: "", order: 0 }],
  levels: ids.map((id) => level(id)),
  placements: ids.map((levelId, order) => ({ levelId, sectionId: "section-a", order })),
});
async function seed(page: Page, draft: ContentPackage, published: ContentPackage) {
  await page.addInitScript(({ draftKey, publishedKey, draft, published }) => {
    if (sessionStorage.getItem("delivery-seeded")) return;
    sessionStorage.setItem("delivery-seeded", "1");
    localStorage.setItem(draftKey, JSON.stringify(draft));
    localStorage.setItem(publishedKey, JSON.stringify(published));
    localStorage.setItem("pixel-code-lab.progress", JSON.stringify({ schemaVersion: 1, introSeen: true, levelId: "delivery-a", codes: { "delivery-a": "def pixel(x, y):\n    return 0" }, passed: { "delivery-a": true } }));
  }, { draftKey, publishedKey, draft, published });
}

test("应用差异、上次应用回退和重新应用", async ({ page }) => {
  await seed(page, packageOf(["delivery-a", "delivery-b"]), packageOf(["delivery-a"]));
  await page.goto("/#/admin/levels");
  await expect(page.getByText("新增关卡：1")).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({ path: "test-results/admin-delivery-review.png" });
  await page.getByText("新增关卡：1").click();
  await expect(page.getByText(/delivery-b \(delivery-b\)/)).toBeVisible();
  await page.getByRole("button", { name: "应用到本机挑战" }).click();
  expect((await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), publishedKey)).levels).toHaveLength(2);
  expect((await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), previousPublishedKey)).levels).toHaveLength(1);
  await page.getByRole("button", { name: "回退上一次应用" }).click();
  expect((await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), publishedKey)).levels).toHaveLength(1);
  expect((await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), draftKey)).levels).toHaveLength(2);
  await page.getByRole("button", { name: "应用到本机挑战" }).click();
  await page.reload();
  expect((await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), publishedKey)).levels).toHaveLength(2);
});

test("导入先审阅并备份，缺失引用和写入失败不覆盖旧管理内容", async ({ page }) => {
  const original = packageOf(["delivery-a"]);
  const imported = packageOf(["delivery-b", "delivery-c"]);
  await seed(page, original, original);
  await page.goto("/#/admin/levels");
  const upload = page.locator('input[type="file"]');
  await upload.setInputFiles({ name: "new-content.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(imported)) });
  await expect(page.getByRole("dialog", { name: "导入审阅" })).toContainText("2 自定义关卡");
  await expect(page.getByRole("dialog", { name: "导入审阅" })).toContainText("缺失引用：0");
  await page.getByRole("button", { name: "确认备份并导入" }).click();
  expect((await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), draftKey)).levels).toHaveLength(2);
  expect((await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), importBackupKey)).levels).toHaveLength(1);
  await page.getByRole("button", { name: "恢复导入前管理草稿" }).click();
  await page.getByRole("button", { name: "确认恢复" }).click();
  expect((await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), draftKey)).levels[0].id).toBe("delivery-a");

  const conflict = packageOf(["delivery-a"]);
  conflict.levels[0].targetColors = `1${"0".repeat(440)}`;
  await upload.setInputFiles({ name: "conflict.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(conflict)) });
  await expect(page.getByRole("dialog", { name: "导入审阅" })).toContainText("同 ID 内容冲突：1 关");
  await page.getByRole("button", { name: "取消导入" }).click();

  const broken = { ...imported, placements: [{ levelId: "not-there", sectionId: "section-a", order: 0 }] };
  await upload.setInputFiles({ name: "broken.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(broken)) });
  await expect(page.getByText(/编排引用不存在的关卡 not-there/)).toBeVisible();
  expect((await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), draftKey)).levels[0].id).toBe("delivery-a");
  await page.getByRole("button", { name: "关闭" }).click();

  await page.evaluate((key) => { const originalSet = Storage.prototype.setItem; Storage.prototype.setItem = function (name, value) { if (this === localStorage && name === key) throw new Error("quota-test"); return originalSet.call(this, name, value); }; }, draftKey);
  await upload.setInputFiles({ name: "valid-again.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(imported)) });
  await page.getByRole("button", { name: "确认备份并导入" }).click();
  await expect(page.getByText(/导入写入失败，原管理草稿保持不变/)).toBeVisible();
  expect((await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), draftKey)).levels[0].id).toBe("delivery-a");
});

test("应用写入失败时保留当前学生内容", async ({ page }) => {
  await seed(page, packageOf(["delivery-a", "delivery-b"]), packageOf(["delivery-a"]));
  await page.goto("/#/admin/levels");
  await page.evaluate(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), { key: previousPublishedKey, value: packageOf([]) });
  await page.evaluate((key) => { const originalSet = Storage.prototype.setItem; Storage.prototype.setItem = function (name, value) { if (this === localStorage && name === key) throw new Error("publish-quota-test"); return originalSet.call(this, name, value); }; }, publishedKey);
  await page.getByRole("button", { name: "应用到本机挑战" }).click();
  await expect(page.getByText(/应用失败.*publish-quota-test/)).toBeVisible();
  expect((await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), publishedKey)).levels).toHaveLength(1);
  expect((await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), previousPublishedKey)).levels).toHaveLength(0);
});

test("导入自动备份写入失败时不替换管理草稿", async ({ page }) => {
  const original = packageOf(["delivery-a"]);
  await seed(page, original, original);
  await page.goto("/#/admin/levels");
  await page.evaluate((key) => { const originalSet = Storage.prototype.setItem; Storage.prototype.setItem = function (name, value) { if (this === localStorage && name === key) throw new Error("backup-quota-test"); return originalSet.call(this, name, value); }; }, importBackupKey);
  await page.locator('input[type="file"]').setInputFiles({ name: "next.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(packageOf(["delivery-b"]))) });
  await page.getByRole("button", { name: "确认备份并导入" }).click();
  await expect(page.getByText(/导入写入失败，原管理草稿保持不变/)).toBeVisible();
  expect((await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), draftKey)).levels[0].id).toBe("delivery-a");
});

test("学生工作台试做支持 Python 与积木且隔离学生进度", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const draft = packageOf(["delivery-a"]);
  await seed(page, draft, draft);
  await page.goto("/#/admin/preview/delivery-a");
  await expect(page.getByText(/管理员试做/)).toBeVisible();
  await page.setViewportSize({ width: 1180, height: 768 });
  await expect(page.locator(".editor-zone .monaco-editor")).toBeVisible();
  await page.screenshot({ path: "test-results/admin-preview-workspace.png" });
  const before = await page.evaluate(() => localStorage.getItem("pixel-code-lab.progress"));
  await runCode(page);
  await expect(page.getByTestId("score")).toContainText("100.0%");
  await switchEditorKind(page, "图形积木");
  await expect(page.locator(".blocklySvg").first()).toBeVisible();
  const category = page.locator(".blocklyToolboxCategory").filter({ hasText: "颜色" });
  await category.click();
  const geometry = await page.locator(".pixel_entry>path.blocklyPath").evaluate((element) => { const rect = element.getBoundingClientRect(); return { x: rect.x, y: rect.y, scale: (element as SVGGraphicsElement).getScreenCTM()!.a }; });
  const drag = async (selector: string, x: number, y: number) => { const box = (await page.locator(selector).boundingBox())!; await page.mouse.move(box.x + 20, box.y + 10); await page.mouse.down(); await page.mouse.move(box.x + 30, box.y + 10, { steps: 4 }); await page.mouse.move(x + 20, y + 10, { steps: 25 }); await page.mouse.up(); };
  await drag(".blocklyFlyout .pixel_return", geometry.x + 20 * geometry.scale, geometry.y + 30 * geometry.scale);
  await category.click();
  const ret = (await page.locator(".blocklyWorkspace .pixel_return>path.blocklyPath").last().boundingBox())!;
  await drag(".blocklyFlyout .pixel_color", ret.x + ret.width - 8 * geometry.scale, ret.y);
  await runCode(page);
  await expect(page.getByTestId("score")).toContainText("100.0%");
  expect(await page.evaluate(() => localStorage.getItem("pixel-code-lab.progress"))).toBe(before);
  await page.getByRole("button", { name: "返回关卡编辑" }).click();
  await expect(page.getByRole("heading", { name: "编辑关卡" })).toBeVisible();
});

test("三维试做按完整体素目标判定且不更新学生通关", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const colors = Array(4913).fill("0"); colors[2456] = "4";
  const content: ContentPackage = { ...packageOf([]), levels: [{ ...level("delivery-voxel"), mode: "3d", radius: 8, targetColors: colors.join("") }], placements: [{ levelId: "delivery-voxel", sectionId: "section-a", order: 0 }] };
  await seed(page, content, content);
  await page.goto("/#/admin/preview/delivery-voxel");
  const before = await page.evaluate(() => localStorage.getItem("pixel-code-lab.progress"));
  await page.locator(".editor-zone .monaco-editor").click();
  await page.evaluate(() => navigator.clipboard.writeText("def voxel(x, y, z):\n    return 4 if x == 0 and y == 0 and z == 0 else 0\n"));
  await page.keyboard.press("ControlOrMeta+A"); await page.keyboard.press("ControlOrMeta+V");
  await runCode(page);
  await expect(page.getByTestId("voxel-score")).toContainText("100.0%");
  expect(await page.evaluate(() => localStorage.getItem("pixel-code-lab.progress"))).toBe(before);
});

test("继续上次工作对归档、移出和缺失关卡说明原因并引导目录", async ({ page }) => {
  const content = packageOf(["delivery-a"]);
  content.levels[0].archived = true;
  await seed(page, content, content);
  await page.goto("/#/start/challenge/2d");
  await expect(page.getByText(/已归档。请从课程目录选择关卡/)).toBeVisible();
  await page.getByRole("button", { name: "返回课程目录" }).click();
  await page.getByRole("button", { name: /第一章/ }).click();
  await page.getByRole("button", { name: /第一节/ }).click();
  await expect(page.getByRole("navigation", { name: "当前位置" })).toContainText("课程目录 / 第一章 / 第一节");

  await page.evaluate(({ key, content }) => { const next = structuredClone(content); next.levels[0].archived = false; next.placements = []; localStorage.setItem(key, JSON.stringify(next)); }, { key: publishedKey, content });
  await page.reload();
  await expect(page.getByText(/已移出课程目录/)).toBeVisible();
  await page.evaluate(({ key, content }) => { const next = structuredClone(content); next.levels = []; next.placements = []; localStorage.setItem(key, JSON.stringify(next)); }, { key: publishedKey, content });
  await page.reload();
  await expect(page.getByText(/不在当前内容包中/)).toBeVisible();
  await page.evaluate(({ key, content }) => { const next = structuredClone(content); next.levels[0].archived = false; next.sections[0].archived = true; localStorage.setItem(key, JSON.stringify(next)); }, { key: publishedKey, content });
  await page.reload();
  await expect(page.getByText(/所在目录已归档/)).toBeVisible();
});

test("导入、编辑、试做、应用、学生挑战和回退完整流程", async ({ page }) => {
  const original = packageOf(["delivery-a"]);
  await seed(page, original, original);
  await page.goto("/#/admin/levels");
  await page.locator('input[type="file"]').setInputFiles({ name: "course.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(packageOf(["delivery-a", "delivery-b"]))) });
  await page.getByRole("button", { name: "确认备份并导入" }).click();
  await page.locator(".admin-list article").filter({ hasText: "delivery-b" }).getByRole("button", { name: "编辑" }).click();
  await page.getByRole("button", { name: "打开学生工作台试做" }).click();
  await runCode(page);
  await expect(page.getByTestId("score")).toContainText("100.0%");
  await page.getByRole("button", { name: "返回关卡编辑" }).click();
  await page.getByText("备份、导入与应用").click();
  await page.getByRole("button", { name: "应用到本机挑战" }).click();
  await page.getByRole("button", { name: "返回学生入口" }).click();
  await page.getByRole("button", { name: /第一章/ }).click();
  await page.getByRole("button", { name: /第一节/ }).click();
  await page.getByRole("button", { name: /delivery-b/ }).click();
  await runCode(page);
  await expect(page.getByTestId("score")).toContainText("100.0%");
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("pixel-code-lab.progress")!).passed["delivery-b"])).toBe(true);
  await page.goto("/#/admin/levels");
  await page.getByRole("button", { name: "回退上一次应用" }).click();
  expect((await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), publishedKey)).levels.map((item: { id: string }) => item.id)).toEqual(["delivery-a"]);
  expect((await page.evaluate(() => JSON.parse(localStorage.getItem("pixel-code-lab.progress")!))).passed["delivery-b"]).toBe(true);
});
