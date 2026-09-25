import { levels } from "./levels";
import {
  voxelRadius,
  voxelTargetIds,
  voxelReference,
  getVoxelLevel,
} from "./voxel";
import { parseBlocks, type BlocksDocument } from "../blocks/model";

export type ContentMode = "2d" | "3d";
export type ContentSource = "python" | "blocks" | "manual";
export interface Chapter {
  id: string;
  title: string;
  description: string;
  order: number;
  archived?: boolean;
}
export interface Section {
  id: string;
  chapterId: string;
  title: string;
  description: string;
  order: number;
  archived?: boolean;
}
export interface ContentLevel {
  id: string;
  title: string;
  description: string;
  mode: ContentMode;
  radius: number;
  targetColors: string;
  revision: number;
  source: ContentSource;
  sourceCode?: string;
  sourceBlocks?: BlocksDocument;
  archived: boolean;
}
export interface Placement {
  levelId: string;
  sectionId: string;
  order: number;
}
export interface ContentPackage {
  format: "pixel-code-lab.content";
  version: 1;
  chapters: Chapter[];
  sections: Section[];
  levels: ContentLevel[];
  placements: Placement[];
}
export const draftKey = "pixel-code-lab.admin-draft";
export const publishedKey = "pixel-code-lab.content";
export const emptyContent = (): ContentPackage => ({
  format: "pixel-code-lab.content",
  version: 1,
  chapters: [],
  sections: [],
  levels: [],
  placements: [],
});

function obj(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== "object" || Array.isArray(v))
    throw new Error("内容包结构无效");
  return v as Record<string, unknown>;
}
function id(v: unknown): string {
  if (typeof v !== "string" || !/^[a-z0-9][a-z0-9-]{0,79}$/.test(v))
    throw new Error("内容 ID 无效");
  return v;
}
function title(v: unknown): string {
  if (typeof v !== "string" || !v.trim() || v.length > 80)
    throw new Error("名称须为 1～80 字符");
  return v.trim();
}
function description(v: unknown): string {
  if (typeof v !== "string" || v.length > 1000) throw new Error("简介过长");
  return v;
}
function order(v: unknown): number {
  if (!Number.isSafeInteger(v) || Number(v) < 0 || Number(v) > 100000)
    throw new Error("排序值无效");
  return Number(v);
}
function archive(v: unknown): boolean {
  if (typeof v !== "boolean") throw new Error("归档状态无效");
  return v;
}
function unique(items: { id: string }[]) {
  if (new Set(items.map((i) => i.id)).size !== items.length)
    throw new Error("内容 ID 重复");
}
export function validateContent(value: unknown): ContentPackage {
  const data = obj(value);
  if (
    data.format !== "pixel-code-lab.content" ||
    data.version !== 1 ||
    !Array.isArray(data.chapters) ||
    !Array.isArray(data.sections) ||
    !Array.isArray(data.levels) ||
    !Array.isArray(data.placements)
  )
    throw new Error("不支持此内容包");
  if (
    data.chapters.length > 200 ||
    data.sections.length > 1000 ||
    data.levels.length > 2000 ||
    data.placements.length > 2000
  )
    throw new Error("内容数量超出限制");
  const chapters = data.chapters.map((item) => {
    const v = obj(item);
    return {
      id: id(v.id),
      title: title(v.title),
      description: description(v.description),
      order: order(v.order),
      ...(v.archived === undefined ? {} : { archived: archive(v.archived) }),
    };
  });
  const sections = data.sections.map((item) => {
    const v = obj(item);
    return {
      id: id(v.id),
      chapterId: id(v.chapterId),
      title: title(v.title),
      description: description(v.description),
      order: order(v.order),
      ...(v.archived === undefined ? {} : { archived: archive(v.archived) }),
    };
  });
  const builtIn = new Set([...levels.map((l) => l.id), ...voxelTargetIds]);
  const custom = data.levels.map((item) => {
    const v = obj(item);
    const mode = v.mode;
    if (mode !== "2d" && mode !== "3d") throw new Error("关卡维度无效");
    if (v.radius !== (mode === "2d" ? 10 : voxelRadius))
      throw new Error("关卡尺寸无效");
    const levelId = id(v.id);
    if (builtIn.has(levelId)) throw new Error("关卡 ID 与内置样例冲突");
    const count = (2 * Number(v.radius) + 1) ** (mode === "2d" ? 2 : 3);
    if (
      typeof v.targetColors !== "string" ||
      v.targetColors.length !== count ||
      /[^0-8]/.test(v.targetColors)
    )
      throw new Error("目标颜色数据无效");
    if (!Number.isSafeInteger(v.revision) || Number(v.revision) < 1)
      throw new Error("目标版本无效");
    if (v.source !== "python" && v.source !== "blocks" && v.source !== "manual")
      throw new Error("制作来源无效");
    if (
      v.sourceCode !== undefined &&
      (typeof v.sourceCode !== "string" || v.sourceCode.length > 200000)
    )
      throw new Error("制作代码无效");
    const sourceBlocks =
      v.sourceBlocks === undefined
        ? undefined
        : parseBlocks(v.sourceBlocks, mode);
    if (typeof v.archived !== "boolean") throw new Error("归档状态无效");
    return {
      id: levelId,
      title: title(v.title),
      description: description(v.description),
      mode,
      radius: Number(v.radius),
      targetColors: v.targetColors,
      revision: Number(v.revision),
      source: v.source,
      ...(v.sourceCode !== undefined
        ? { sourceCode: v.sourceCode as string }
        : {}),
      ...(sourceBlocks ? { sourceBlocks } : {}),
      archived: v.archived,
    } as ContentLevel;
  });
  const placements = data.placements.map((item) => {
    const v = obj(item);
    return {
      levelId: id(v.levelId),
      sectionId: id(v.sectionId),
      order: order(v.order),
    };
  });
  unique(chapters);
  unique(sections);
  unique(custom);
  if (new Set(placements.map((p) => p.levelId)).size !== placements.length)
    throw new Error("一个关卡只能编排一次");
  const chapterIds = new Set(chapters.map((c) => c.id));
  const sectionIds = new Set(sections.map((s) => s.id));
  const levelIds = new Set([...builtIn, ...custom.map((l) => l.id)]);
  if (
    sections.some((s) => !chapterIds.has(s.chapterId)) ||
    placements.some(
      (p) => !sectionIds.has(p.sectionId) || !levelIds.has(p.levelId),
    )
  )
    throw new Error("内容引用不存在");
  return {
    format: "pixel-code-lab.content",
    version: 1,
    chapters,
    sections,
    levels: custom,
    placements,
  };
}

export function loadContent(key: string): ContentPackage {
  const raw = localStorage.getItem(key);
  if (raw === null) return emptyContent();
  if (new TextEncoder().encode(raw).length > 12_000_000)
    throw new Error("内容包过大");
  return validateContent(JSON.parse(raw));
}
export function saveContent(key: string, content: ContentPackage) {
  const valid = validateContent(content);
  localStorage.setItem(key, JSON.stringify(valid));
  window.dispatchEvent(new CustomEvent("contentchange", { detail: key }));
}
export function getLevel(
  idValue: string,
  content: ContentPackage,
): {
  id: string;
  title: string;
  mode: ContentMode;
  radius: number;
  colors: number[];
  description: string;
  archived: boolean;
} | null {
  const custom = content.levels.find((l) => l.id === idValue);
  if (custom)
    return {
      id: custom.id,
      title: custom.title,
      mode: custom.mode,
      radius: custom.radius,
      colors: [...custom.targetColors].map(Number),
      description: custom.description,
      archived: custom.archived,
    };
  const pixel = levels.find((l) => l.id === idValue);
  if (pixel) {
    const colors: number[] = [];
    for (let y = pixel.radius; y >= -pixel.radius; y--)
      for (let x = -pixel.radius; x <= pixel.radius; x++)
        colors.push(pixel.target(x, y));
    return {
      id: pixel.id,
      title: pixel.title,
      mode: "2d",
      radius: pixel.radius,
      colors,
      description: "",
      archived: false,
    };
  }
  if (voxelTargetIds.includes(idValue as (typeof voxelTargetIds)[number])) {
    const id = idValue as (typeof voxelTargetIds)[number];
    return {
      id,
      title: getVoxelLevel(id).title,
      mode: "3d",
      radius: voxelRadius,
      colors: voxelReference(id),
      description: "",
      archived: false,
    };
  }
  return null;
}
export function visibleLevels(content: ContentPackage, sectionId: string) {
  const section = content.sections.find((item) => item.id === sectionId);
  if (!section || section.archived || content.chapters.find((item) => item.id === section.chapterId)?.archived) return [];
  return content.placements
    .filter((p) => p.sectionId === sectionId)
    .sort((a, b) => a.order - b.order)
    .map((p) => getLevel(p.levelId, content))
    .filter((l): l is NonNullable<typeof l> => !!l && !l.archived);
}
