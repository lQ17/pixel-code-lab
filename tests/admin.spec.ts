import { test, expect } from "@playwright/test";
import { runCode } from "./helpers";
import { publishedKey } from "../src/engine/content";

test("手工创建二维关卡、编排并在学生端挑战", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.setViewportSize({ width: 1180, height: 768 });
  await page.goto("/#/admin/levels");
  await page.getByRole("button", { name: "＋ 新建关卡" }).click();
  await page.getByLabel("名称").fill("手工星点");
  const canvas = page.locator('canvas[aria-label="手动像素画布"]').first();
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await expect(page.getByText("当前非空格：1")).toBeVisible();
  await page.getByRole("button", { name: "保存为关卡目标" }).click();
  await expect(page.getByRole("heading", { name: "编辑关卡" })).toBeVisible();
  await page.screenshot({ path: "test-results/admin-layout.png" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({ path: "test-results/admin-layout-wide.png" });
  await page.getByRole("button", { name: "章节管理" }).click();
  page.once("dialog", (dialog) => dialog.accept("第一章"));
  await page.getByRole("button", { name: "＋ 新增大章" }).click();
  page.once("dialog", (dialog) => dialog.accept("坐标基础"));
  await page.getByRole("button", { name: "＋ 新增小节" }).click();
  await page.getByRole("button", { name: "关卡编排" }).click();
  await page.getByRole("button", { name: "坐标基础" }).click();
  await page
    .locator("article")
    .filter({ hasText: "手工星点" })
    .getByRole("button", { name: "加入本小节" })
    .click();
  await page.getByRole("button", { name: "应用到本机挑战" }).click();
  await page.getByRole("button", { name: "返回学生入口" }).click();
  await expect(page.getByText("课程目录")).toBeVisible();
  await page.getByRole("button", { name: /第一章/ }).click();
  await page.getByRole("button", { name: /坐标基础/ }).click();
  await page.getByRole("button", { name: /手工星点/ }).click();
  await expect(
    page.getByRole("heading", { name: "2D 关卡 · 手工星点" }),
  ).toBeVisible();
  await page.locator(".editor-zone .monaco-editor").click();
  await page.evaluate(() =>
    navigator.clipboard.writeText(
      "def pixel(x, y):\n    return 1 if x == 0 and y == 0 else 0\n",
    ),
  );
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.press("ControlOrMeta+V");
  await runCode(page);
  await expect(page.getByTestId("score")).toContainText("100.0%");
});

test("三维空场景可以通过逐层网格放置第一块并恢复草稿", async ({ page }) => {
  await page.goto("/#/admin/levels/new");
  await page.getByRole("button", { name: "3D", exact: true }).click();
  await page.getByLabel("名称").fill("测试体素");
  const canvases = page.locator('canvas[aria-label="手动像素画布"]');
  const grid = canvases.last();
  await grid.scrollIntoViewIfNeeded();
  const box = await grid.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await expect(page.getByText("当前非空格：1")).toBeVisible();
  await page.reload();
  await expect(page.getByText("当前非空格：1")).toBeVisible();
  await page.getByRole("button", { name: "保存为关卡目标" }).click();
  await expect(page.getByRole("heading", { name: "编辑关卡" })).toBeVisible();
});

test("三维立体画布可从空场景直接放置体素", async ({ page }) => {
  await page.goto("/#/admin/levels/new");
  await page.getByRole("button", { name: "3D", exact: true }).click();
  const canvas = page.locator('canvas[aria-label="三维目标编辑画布"]');
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await expect(page.getByText("当前非空格：1")).toBeVisible();
  await page.getByRole("button", { name: "染色", exact: true }).click();
  await page.getByRole("button", { name: "4", exact: true }).click();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await expect(page.getByText(/落点/)).toBeVisible();
  await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.getByLabel("名称").fill("染色体素");
  await page.getByRole("button", { name: "保存为关卡目标" }).click();
  const target = await page.evaluate(() => JSON.parse(localStorage.getItem("pixel-code-lab.admin-draft")!).levels[0].targetColors as string);
  expect(target[2456]).toBe("4");
});

test("手动笔触实时显示，整笔撤销，制作草稿与目标状态明确", async ({ page }) => {
  await page.goto("/#/admin/levels/new");
  await page.getByLabel("名称").fill("连续笔画");
  const canvas = page.locator('canvas[aria-label="手动像素画布"]').first();
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  const cell = box!.width / 21;
  const x = box!.x + cell * 10.5;
  const y = box!.y + cell * 10.5;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + cell * 3, y, { steps: 3 });
  const pixel = await canvas.evaluate((element: HTMLCanvasElement) =>
    [...element.getContext("2d")!.getImageData(10 * 24 + 12, 10 * 24 + 12, 1, 1).data],
  );
  expect(pixel.slice(0, 3)).not.toEqual([23, 42, 54]);
  await page.mouse.up();
  await expect(page.getByText("当前非空格：4")).toBeVisible();
  await page.getByRole("button", { name: "撤销" }).click();
  await expect(page.getByText("当前非空格：0")).toBeVisible();
  await page.getByRole("button", { name: "重做" }).click();
  await expect(page.getByText("当前非空格：4")).toBeVisible();
  await expect(page.getByText("制作草稿：已保存")).toBeVisible();
  await expect(page.getByText("关卡目标：有未保存修改")).toBeVisible();
  await page.getByRole("button", { name: "保存为关卡目标" }).click();
  await expect(page.getByText("关卡目标：已保存")).toBeVisible();
  await expect(page.getByText("本机挑战：有未应用修改")).toBeVisible();
  await expect(page.getByText("已保存目标")).toBeVisible();
  await page.getByRole("button", { name: "放大已保存目标" }).click();
  await expect(page.getByRole("dialog", { name: "已保存目标预览" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "已保存目标预览" })).toHaveCount(0);
});

test("程序结果在制作方式切换后仍可使用，覆盖手动草稿需确认", async ({ page }) => {
  await page.goto("/#/admin/levels/new");
  await page.getByRole("button", { name: "Python", exact: true }).click();
  await page.getByRole("button", { name: "运行生成目标" }).click();
  await expect(page.getByRole("heading", { name: "运行结果预览" })).toBeVisible();
  await page.getByRole("button", { name: "手动", exact: true }).click();
  await page.getByRole("button", { name: "Python", exact: true }).click();
  await expect(page.getByRole("heading", { name: "运行结果预览" })).toBeVisible();
});

test("制作草稿写入失败后可重试，内存草稿未丢失", async ({ page }) => {
  await page.goto("/#/admin/levels/new");
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    (window as typeof window & { restoreSetItem?: () => void }).restoreSetItem = () => { Storage.prototype.setItem = original; };
    Storage.prototype.setItem = function (key, value) {
      if (this === localStorage && key.startsWith("pixel-code-lab.authoring.")) throw new Error("quota-test");
      return original.call(this, key, value);
    };
  });
  await page.getByLabel("名称").fill("写入失败仍在");
  await expect(page.getByText("制作草稿：保存失败")).toBeVisible();
  await expect(page.getByText(/quota-test/)).toBeVisible();
  await page.evaluate(() => (window as typeof window & { restoreSetItem: () => void }).restoreSetItem());
  await page.getByRole("button", { name: "重试保存草稿" }).click();
  await expect(page.getByText("制作草稿：已保存")).toBeVisible();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("pixel-code-lab.authoring.new")!));
  expect(saved.title).toBe("写入失败仍在");
});

test("写入失败时同标签页临时备份可在刷新后恢复", async ({ page }) => {
  await page.goto("/#/admin/levels/new");
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (this === localStorage && key.startsWith("pixel-code-lab.authoring.")) throw new Error("quota-test");
      return original.call(this, key, value);
    };
  });
  await page.getByLabel("名称").fill("临时恢复关卡");
  await expect(page.getByText("制作草稿：保存失败")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("名称")).toHaveValue("临时恢复关卡");
  await expect(page.getByText("已恢复未保存的制作草稿，请重试保存")).toBeVisible();
});

test("新关卡切换二维三维后分别恢复手动草稿，刷新仍保留", async ({ page }) => {
  await page.goto("/#/admin/levels/new");
  const grid = page.locator('canvas[aria-label="手动像素画布"]').first();
  await grid.scrollIntoViewIfNeeded();
  const first = await grid.boundingBox();
  expect(first).not.toBeNull();
  await page.mouse.click(first!.x + first!.width / 2, first!.y + first!.height / 2);
  await expect(page.getByText("当前非空格：1")).toBeVisible();
  await page.getByRole("button", { name: "3D", exact: true }).click();
  await expect(page.getByText("当前非空格：0")).toBeVisible();
  await page.getByRole("button", { name: "2D", exact: true }).click();
  await expect(page.getByText("当前非空格：1")).toBeVisible();
  await page.getByRole("button", { name: "3D", exact: true }).click();
  await expect(page.getByText("制作草稿：已保存")).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "2D", exact: true }).click();
  await expect(page.getByText("当前非空格：1")).toBeVisible();
});

test("Python 生成目标后修改代码不能沿用旧运行结果", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/#/admin/levels/new");
  await page.getByLabel("名称").fill("程序星点");
  await page.getByRole("button", { name: "Python", exact: true }).click();
  await page.getByRole("button", { name: "运行生成目标" }).click();
  await expect(
    page.getByRole("heading", { name: "运行结果预览" }),
  ).toBeVisible();
  await page.locator(".admin-code .monaco-editor").click();
  await page.evaluate(() =>
    navigator.clipboard.writeText(
      "def pixel(x, y):\n    return 1 if x == 0 and y == 0 else 0\n",
    ),
  );
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.press("ControlOrMeta+V");
  await page.getByRole("button", { name: "保存为关卡目标" }).click();
  await expect(page.getByText("请先成功运行，再保存目标")).toBeVisible();
  await page.getByRole("button", { name: "运行生成目标" }).click();
  await expect(
    page.getByRole("heading", { name: "运行结果预览" }),
  ).toBeVisible();
  await expect(page.getByText("当前非空格：1")).toBeVisible();
  await page.getByRole("button", { name: "保存为关卡目标" }).click();
  await expect(page.getByRole("heading", { name: "编辑关卡" })).toBeVisible();
  await page
    .getByRole("textbox", { name: "试做 Python 代码" })
    .fill("def pixel(x, y):\n    return 1 if x == 0 and y == 0 else 0");
  await page.getByRole("button", { name: "运行试做" }).click();
  await expect(page.getByText("匹配率 100.0% · 完全一致")).toBeVisible();
});

test("自定义三维关卡使用完整体素目标判定", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const target = Array(4913).fill("0");
  target[2456] = "4";
  await page.addInitScript(
    ({ key, colors }) =>
      localStorage.setItem(
        key,
        JSON.stringify({
          format: "pixel-code-lab.content",
          version: 1,
          chapters: [
            { id: "chapter-test", title: "测试章", description: "", order: 0 },
          ],
          sections: [
            {
              id: "section-test",
              chapterId: "chapter-test",
              title: "测试节",
              description: "",
              order: 0,
            },
          ],
          levels: [
            {
              id: "level-green-voxel",
              title: "绿色中心",
              description: "",
              mode: "3d",
              radius: 8,
              targetColors: colors,
              revision: 1,
              source: "manual",
              archived: false,
            },
          ],
          placements: [
            {
              levelId: "level-green-voxel",
              sectionId: "section-test",
              order: 0,
            },
          ],
        }),
      ),
    { key: publishedKey, colors: target.join("") },
  );
  await page.goto("/#/work/3d/challenge/level-green-voxel");
  await expect(
    page.getByRole("heading", { name: "3D 关卡 · 绿色中心" }),
  ).toBeVisible();
  await page.locator(".editor-zone .monaco-editor").click();
  await page.evaluate(() =>
    navigator.clipboard.writeText(
      "def voxel(x, y, z):\n    return 4 if x == 0 and y == 0 and z == 0 else 0\n",
    ),
  );
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.press("ControlOrMeta+V");
  await runCode(page);
  await expect(page.getByTestId("voxel-score")).toContainText("100.0%");
});

test("大章和小节可修改、迁移、删除，非空大章受保护", async ({ page }) => {
  await page.goto("/#/admin/chapters");
  page.once("dialog", (dialog) => dialog.accept("第一章"));
  await page.getByRole("button", { name: "＋ 新增大章" }).click();
  page.once("dialog", (dialog) => dialog.accept("第二章"));
  await page.getByRole("button", { name: "＋ 新增大章" }).click();
  await page.getByRole("button", { name: "第一章" }).click();
  page.once("dialog", (dialog) => dialog.accept("坐标"));
  await page.getByRole("button", { name: "＋ 新增小节" }).click();
  await page.locator(".admin-columns > section").first().locator("article").filter({ hasText: "第一章" }).getByRole("button", { name: "删除" }).click();
  await expect(page.getByText("请先迁移或删除下属小节")).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept("第一章改名"));
  await page.locator(".admin-columns > section").first().locator("article").filter({ hasText: "第一章" }).getByRole("button", { name: "修改" }).click();
  const secondId = await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem("pixel-code-lab.admin-draft")!);
    return data.chapters.find((chapter: { title: string }) => chapter.title === "第二章").id as string;
  });
  await page.getByRole("combobox", { name: "将坐标迁移到大章" }).selectOption(secondId);
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator(".admin-columns > section").first().locator("article").filter({ hasText: "第一章改名" }).getByRole("button", { name: "删除" }).click();
  await expect(page.getByRole("button", { name: "第一章改名" })).toHaveCount(0);
  const content = await page.evaluate(() => JSON.parse(localStorage.getItem("pixel-code-lab.admin-draft")!));
  expect(content.sections).toHaveLength(1);
  expect(content.sections[0].chapterId).toBe(secondId);
});
