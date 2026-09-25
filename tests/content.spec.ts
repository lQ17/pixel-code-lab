import { test, expect } from "@playwright/test";
import { emptyContent, getLevel, validateContent, visibleLevels } from "../src/engine/content";
import { compareContent, inspectReferences } from "../src/engine/contentDelivery";

test("内容包严格校验目标长度、颜色、层级和重复关卡", () => {
  const base = emptyContent();
  const level = {
    id: "level-custom",
    title: "自定义",
    description: "",
    mode: "2d" as const,
    radius: 10,
    targetColors: "0".repeat(441),
    revision: 1,
    source: "manual" as const,
    archived: false,
  };
  const valid = {
    ...base,
    chapters: [
      { id: "chapter-one", title: "第一章", description: "", order: 0 },
    ],
    sections: [
      {
        id: "section-one",
        chapterId: "chapter-one",
        title: "第一节",
        description: "",
        order: 0,
      },
    ],
    levels: [level],
    placements: [{ levelId: level.id, sectionId: "section-one", order: 0 }],
  };
  expect(validateContent(valid)).toEqual(valid);
  expect(getLevel(level.id, valid)?.colors).toHaveLength(441);
  expect(visibleLevels(valid, "section-one")).toHaveLength(1);
  expect(visibleLevels({ ...valid, chapters: [{ ...valid.chapters[0], archived: true }] }, "section-one")).toHaveLength(0);
  expect(visibleLevels({ ...valid, sections: [{ ...valid.sections[0], archived: true }] }, "section-one")).toHaveLength(0);
  for (const changed of [
    { ...valid, levels: [{ ...level, targetColors: "0".repeat(440) }] },
    { ...valid, levels: [{ ...level, targetColors: "9".repeat(441) }] },
    { ...valid, levels: [level, level] },
    {
      ...valid,
      placements: [{ levelId: level.id, sectionId: "missing", order: 0 }],
    },
    { ...valid, sections: [{ ...valid.sections[0], chapterId: "missing" }] },
    { ...valid, chapters: [{ ...valid.chapters[0], archived: "yes" }] },
  ])
    expect(() => validateContent(changed)).toThrow();
});

test("应用差异区分新增、归档、移出与目录调整", () => {
  const base = emptyContent();
  const first = validateContent({ ...base, chapters: [{ id: "chapter-a", title: "旧章", description: "", order: 0 }], sections: [{ id: "section-a", chapterId: "chapter-a", title: "旧节", description: "", order: 0 }], levels: [{ id: "level-a", title: "甲", description: "", mode: "2d", radius: 10, targetColors: "0".repeat(441), revision: 1, source: "manual", archived: false }], placements: [{ levelId: "level-a", sectionId: "section-a", order: 0 }] });
  const second = validateContent({ ...first, chapters: [{ ...first.chapters[0], title: "新章" }], levels: [{ ...first.levels[0], archived: true }, { ...first.levels[0], id: "level-b", title: "乙" }], placements: [{ levelId: "level-b", sectionId: "section-a", order: 0 }] });
  const changes = compareContent(first, second);
  expect(changes.added).toHaveLength(1);
  expect(changes.archived).toHaveLength(1);
  expect(changes.unplaced).toEqual(["level-a"]);
  expect(changes.placed).toEqual(["level-b"]);
  expect(changes.directory).toContain("大章调整：新章");
  expect(inspectReferences({ ...second, placements: [{ levelId: "missing", sectionId: "section-a", order: 0 }] })).toContain("编排引用不存在的关卡 missing");
});
