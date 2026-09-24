import { test, expect } from "@playwright/test";
import { emptyContent, getLevel, validateContent } from "../src/engine/content";

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
  for (const changed of [
    { ...valid, levels: [{ ...level, targetColors: "0".repeat(440) }] },
    { ...valid, levels: [{ ...level, targetColors: "9".repeat(441) }] },
    { ...valid, levels: [level, level] },
    {
      ...valid,
      placements: [{ levelId: level.id, sectionId: "missing", order: 0 }],
    },
    { ...valid, sections: [{ ...valid.sections[0], chapterId: "missing" }] },
  ])
    expect(() => validateContent(changed)).toThrow();
});
