import { type ContentPackage, type ContentLevel, validateContent } from "./content";
import { levels } from "./levels";
import { voxelTargetIds } from "./voxel";

export const previousPublishedKey = "pixel-code-lab.content-previous";
export const importBackupKey = "pixel-code-lab.admin-import-backup";

export function contentCounts(content: ContentPackage) {
  return { chapters: content.chapters.length, sections: content.sections.length, levels: content.levels.length, placements: content.placements.length };
}
export type ContentChanges = {
  added: string[];
  modified: string[];
  archived: string[];
  restored: string[];
  removed: string[];
  placed: string[];
  unplaced: string[];
  moved: string[];
  directory: string[];
};

function compareById<T extends { id: string }>(before: T[], after: T[], label: string) {
  const previous = new Map(before.map((item) => [item.id, item]));
  const current = new Map(after.map((item) => [item.id, item]));
  return [
    ...after.filter((item) => !previous.has(item.id)).map((item) => `${label}新增：${"title" in item ? item.title : item.id}`),
    ...before.filter((item) => !current.has(item.id)).map((item) => `${label}删除：${"title" in item ? item.title : item.id}`),
    ...after.filter((item) => previous.has(item.id) && JSON.stringify(previous.get(item.id)) !== JSON.stringify(item)).map((item) => `${label}调整：${"title" in item ? item.title : item.id}`),
  ];
}

export function compareContent(before: ContentPackage, after: ContentPackage): ContentChanges {
  const oldLevels = new Map(before.levels.map((item) => [item.id, item]));
  const newLevels = new Map(after.levels.map((item) => [item.id, item]));
  const oldPlacements = new Map(before.placements.map((item) => [item.levelId, item]));
  const newPlacements = new Map(after.placements.map((item) => [item.levelId, item]));
  const name = (item: ContentLevel) => `${item.title} (${item.id})`;
  return {
    added: after.levels.filter((item) => !oldLevels.has(item.id)).map(name),
    removed: before.levels.filter((item) => !newLevels.has(item.id)).map(name),
    modified: after.levels.filter((item) => { const old = oldLevels.get(item.id); return old && [item.title, item.description, item.mode, item.targetColors, item.revision].some((value, index) => value !== [old.title, old.description, old.mode, old.targetColors, old.revision][index]); }).map(name),
    archived: after.levels.filter((item) => !oldLevels.get(item.id)?.archived && item.archived).map(name),
    restored: after.levels.filter((item) => oldLevels.get(item.id)?.archived && !item.archived).map(name),
    placed: after.placements.filter((item) => !oldPlacements.has(item.levelId)).map((item) => item.levelId),
    unplaced: before.placements.filter((item) => !newPlacements.has(item.levelId)).map((item) => item.levelId),
    moved: after.placements.filter((item) => { const old = oldPlacements.get(item.levelId); return old && (old.sectionId !== item.sectionId || old.order !== item.order); }).map((item) => item.levelId),
    directory: [...compareById(before.chapters, after.chapters, "大章"), ...compareById(before.sections, after.sections, "小节")],
  };
}

export function changeCount(changes: ContentChanges) {
  return Object.values(changes).reduce((count, items) => count + items.length, 0);
}

export function conflictingIds(current: ContentPackage, imported: ContentPackage) {
  const old = new Map(current.levels.map((item) => [item.id, item]));
  return imported.levels.filter((item) => old.has(item.id) && JSON.stringify(old.get(item.id)) !== JSON.stringify(item)).map((item) => item.id);
}

export function parseImport(value: unknown): ContentPackage {
  return validateContent(value);
}

export function inspectReferences(value: unknown): string[] {
  if (!value || typeof value !== "object") return [];
  const data = value as { chapters?: unknown; sections?: unknown; levels?: unknown; placements?: unknown };
  if (!Array.isArray(data.chapters) || !Array.isArray(data.sections) || !Array.isArray(data.levels) || !Array.isArray(data.placements)) return [];
  const getId = (item: unknown, key: string) => item && typeof item === "object" ? (item as Record<string, unknown>)[key] : undefined;
  const chapterIds = new Set(data.chapters.map((item) => getId(item, "id")));
  const sectionIds = new Set(data.sections.map((item) => getId(item, "id")));
  const levelIds = new Set<unknown>([...data.levels.map((item) => getId(item, "id")), ...levels.map((item) => item.id), ...voxelTargetIds]);
  return [
    ...data.sections.filter((item) => !chapterIds.has(getId(item, "chapterId"))).map((item) => `小节 ${String(getId(item, "id"))} 引用不存在的大章`),
    ...data.placements.filter((item) => !sectionIds.has(getId(item, "sectionId"))).map((item) => `编排 ${String(getId(item, "levelId"))} 引用不存在的小节`),
    ...data.placements.filter((item) => !levelIds.has(getId(item, "levelId"))).map((item) => `编排引用不存在的关卡 ${String(getId(item, "levelId"))}`),
  ];
}
