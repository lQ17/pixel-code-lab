import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  compileBlocks,
  emptyBlocksFor,
  parseBlocks,
  type BlocksDocument,
} from "../blocks/model";
import { useVoxelControls } from "../hooks/useVoxelControls";
import { palette, colorNames, starterCode } from "../engine/levels";
import { voxelRadius, voxelStarter } from "../engine/voxel";
import {
  draftKey,
  emptyContent,
  getLevel,
  loadContent,
  publishedKey,
  saveContent,
  type ContentLevel,
  type ContentPackage,
  type ContentMode,
  type ContentSource,
} from "../engine/content";
import { PythonRunner, RunFailure } from "../runners/PythonRunner";
import type { RunnerStatus } from "../runners/types";
import { VoxelCanvas } from "../renderers/VoxelCanvas";
import {
  initial as initialVoxelView,
  type Point,
} from "../renderers/voxelGeometry";
import type { AdminRoute, AppRoute } from "../navigation/route";
import { parseProgress, STORAGE_KEY } from "../hooks/useProgress";
import type { Project } from "../engine/projects";
import { LevelThumbnail } from "../components/LevelThumbnail";
import { PixelPainter } from "./PixelPainter";
import { AdminStructure } from "./AdminStructure";
import { changeCount, compareContent, conflictingIds, contentCounts, importBackupKey, inspectReferences, parseImport, previousPublishedKey } from "../engine/contentDelivery";
import "./AdminPage.css";

const CodeEditor = lazy(() => import("../components/CodeEditor"));
const BlocksEditor = lazy(() => import("../components/BlocksEditor"));
const blank = (mode: ContentMode) =>
  "0".repeat((mode === "2d" ? 21 : 17 ** 2) * (mode === "2d" ? 21 : 17));
const makeId = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;
const stamp = (values: number[]) => values.join("");
const index3 = (x: number, y: number, z: number) =>
  (z + voxelRadius) * 289 + (voxelRadius - y) * 17 + x + voxelRadius;
type ProgramSnapshots = Partial<Record<"python" | "blocks", { code: string; colors: number[] }>>;
type ModeDraft = { source: ContentSource; code: string; blocks: BlocksDocument; manual: number[]; candidate: number[] | null; programSnapshots: ProgramSnapshots };

function download(name: string, value: string) {
  const url = URL.createObjectURL(
    new Blob([value], { type: "application/json" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function studentContent(value: ContentPackage): ContentPackage {
  const student = structuredClone(value);
  student.levels.forEach((level) => {
    delete level.sourceCode;
    delete level.sourceBlocks;
  });
  return student;
}

export function AdminPage({
  route,
  onNavigate,
}: {
  route: AdminRoute;
  onNavigate: (route: AppRoute) => void;
}) {
  const [initial] = useState(() => {
    try {
      return { content: loadContent(draftKey), error: "" };
    } catch (error) {
      return {
        content: emptyContent(),
        error: `管理草稿无法读取：${String(error)}。原数据已保留，当前写入已停用。`,
      };
    }
  });
  const [content, setContent] = useState<ContentPackage>(initial.content);
  const [authoring] = useState(() => {
    if (route.page !== "levels" || !route.levelId)
      return { data: null, error: "" };
    try {
      const key = `pixel-code-lab.authoring.${route.levelId}`;
      let recovery: string | null = null;
      try { recovery = sessionStorage.getItem(`${key}.recovery`); } catch { /* Optional recovery storage. */ }
      const raw = recovery ?? localStorage.getItem(key);
      if (!raw) return { data: null, error: "" };
      const data = JSON.parse(raw) as {
        mode: ContentMode;
        title: string;
        description: string;
        source: ContentSource;
        code: string;
        blocks: BlocksDocument;
        manual: number[];
        candidate: number[] | null;
        programSnapshots?: ProgramSnapshots;
        modeDrafts?: Partial<Record<ContentMode, ModeDraft>>;
        archived: boolean;
      };
      if (
        !["2d", "3d"].includes(data.mode) ||
        typeof data.title !== "string" ||
        typeof data.description !== "string" ||
        !["manual", "python", "blocks"].includes(data.source) ||
        typeof data.code !== "string" ||
        !Array.isArray(data.manual) ||
        data.manual.length !== (data.mode === "2d" ? 441 : 4913) ||
        data.manual.some((c) => !Number.isInteger(c) || c < 0 || c > 8) ||
        (data.candidate !== null &&
          (!Array.isArray(data.candidate) ||
            data.candidate.length !== data.manual.length ||
            data.candidate.some((c) => !Number.isInteger(c) || c < 0 || c > 8))) ||
        typeof data.archived !== "boolean"
      )
        throw new Error("制作草稿无效");
      data.blocks = parseBlocks(data.blocks, data.mode);
      for (const mode of ["2d", "3d"] as const) {
        const draft = data.modeDrafts?.[mode];
        if (!draft) continue;
        const size = mode === "2d" ? 441 : 4913;
        if (!["manual", "python", "blocks"].includes(draft.source) || typeof draft.code !== "string" || !Array.isArray(draft.manual) || draft.manual.length !== size || draft.manual.some((v) => !Number.isInteger(v) || v < 0 || v > 8) || (draft.candidate !== null && (!Array.isArray(draft.candidate) || draft.candidate.length !== size || draft.candidate.some((v) => !Number.isInteger(v) || v < 0 || v > 8)))) throw new Error("另一维度制作草稿无效");
        draft.blocks = parseBlocks(draft.blocks, mode);
      }
      return { data, error: "", recovered: !!recovery };
    } catch (error) {
      return {
        data: null,
        error: `制作草稿无法读取：${String(error)}。原数据已保留。`,
      };
    }
  });
  const [storageError, setStorageError] = useState(
    initial.error || authoring.error,
  );
  const [draftStatus, setDraftStatus] = useState<"pending" | "saved" | "failed">("saved");
  const [failedContent, setFailedContent] = useState<ContentPackage | null>(null);
  const [published, setPublished] = useState<ContentPackage | null>(() => {
    try { return loadContent(publishedKey); } catch { return null; }
  });
  const [previousPublished, setPreviousPublished] = useState<ContentPackage | null>(() => {
    try { return localStorage.getItem(previousPublishedKey) ? loadContent(previousPublishedKey) : null; } catch { return null; }
  });
  const [importReview, setImportReview] = useState<{ name: string; content: ContentPackage; conflicts: string[] } | null>(null);
  const [importIssue, setImportIssue] = useState<{ name: string; counts: string; missing: string[]; error: string } | null>(null);
  const [importBackupAvailable, setImportBackupAvailable] = useState(() => { try { return localStorage.getItem(importBackupKey) !== null; } catch { return false; } });
  const [showRestoreBackup, setShowRestoreBackup] = useState(false);
  const [notice, setNotice] = useState(authoring.recovered ? "已恢复未保存的制作草稿，请重试保存" : "");
  const [levelSearch, setLevelSearch] = useState("");
  const [levelModeFilter, setLevelModeFilter] = useState<"all" | ContentMode>("all");
  const [levelArchiveFilter, setLevelArchiveFilter] = useState<"all" | "active" | "archived">("all");
  const [levelPlacementFilter, setLevelPlacementFilter] = useState<"all" | "placed" | "unplaced">("all");
  const [pendingArchiveId, setPendingArchiveId] = useState("");
  const [projects] = useState(() => {
    try {
      const progress = parseProgress(localStorage.getItem(STORAGE_KEY));
      return [
        ...(progress.pixelProjects ?? []).map((project) => ({
          mode: "2d" as const,
          project,
        })),
        ...(progress.voxelProjects ?? []).map((project) => ({
          mode: "3d" as const,
          project,
        })),
      ];
    } catch {
      return [] as { mode: ContentMode; project: Project }[];
    }
  });
  const [projectToCopy, setProjectToCopy] = useState("");
  const initialLevel = content.levels.find((l) => l.id === route.levelId);
  const [levelMode, setLevelMode] = useState<ContentMode>(
    authoring.data?.mode ?? initialLevel?.mode ?? "2d",
  );
  const [title, setTitle] = useState(
    authoring.data?.title ?? initialLevel?.title ?? "",
  );
  const [description, setDescription] = useState(
    authoring.data?.description ?? initialLevel?.description ?? "",
  );
  const [source, setSource] = useState<ContentSource>(
    authoring.data?.source ?? initialLevel?.source ?? "manual",
  );
  const [code, setCode] = useState(
    authoring.data?.code ??
      initialLevel?.sourceCode ??
      (initialLevel?.mode === "3d" ? voxelStarter : starterCode),
  );
  const [blocks, setBlocks] = useState<BlocksDocument>(
    () =>
      authoring.data?.blocks ??
      initialLevel?.sourceBlocks ??
      emptyBlocksFor(initialLevel?.mode ?? "2d"),
  );
  const [manual, setManual] = useState<number[]>(
    () =>
      authoring.data?.manual ??
      [...(initialLevel?.targetColors ?? blank("2d"))].map(Number),
  );
  const [candidate, setCandidate] = useState<number[] | null>(
    authoring.data?.candidate ?? null,
  );
  const [programSnapshots, setProgramSnapshots] = useState<ProgramSnapshots>(() => {
    const saved = authoring.data?.programSnapshots;
    const valid = (entry: unknown): entry is { code: string; colors: number[] } => {
      if (!entry || typeof entry !== "object") return false;
      const item = entry as { code?: unknown; colors?: unknown };
      return typeof item.code === "string" && Array.isArray(item.colors) && item.colors.length === (levelMode === "2d" ? 441 : 4913) && item.colors.every((value) => Number.isInteger(value) && value >= 0 && value <= 8);
    };
    const snapshots: ProgramSnapshots = {};
    if (valid(saved?.python)) snapshots.python = saved!.python;
    if (valid(saved?.blocks)) snapshots.blocks = saved!.blocks;
    return snapshots;
  });
  const [modeDrafts, setModeDrafts] = useState<Partial<Record<ContentMode, ModeDraft>>>(authoring.data?.modeDrafts ?? {});
  const [running, setRunning] = useState(false);
  const [runnerStatus, setRunnerStatus] = useState<RunnerStatus>("loading");
  const [runError, setRunError] = useState("");
  const [color, setColor] = useState(1);
  const [tool, setTool] = useState<"draw" | "dye" | "erase" | "pick">("draw");
  const [slice, setSlice] = useState(0);
  const [history, setHistory] = useState<number[][]>([]);
  const [future, setFuture] = useState<number[][]>([]);
  const [archived, setArchived] = useState(
    authoring.data?.archived ?? initialLevel?.archived ?? false,
  );
  const [expanded, setExpanded] = useState(false);
  const [targetExpanded, setTargetExpanded] = useState(false);
  const runner = useRef<PythonRunner | null>(null);
  const runTicket = useRef(0);
  const savedNew = useRef(false);
  const latestDraft = useRef("");
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const controls = useVoxelControls(voxelRadius);
  const level = content.levels.find((l) => l.id === route.levelId);
  const compiled = useMemo(() => compileBlocks(blocks), [blocks]);
  const editing = route.page === "levels" && !!route.levelId;
  const draftPayload = JSON.stringify({ mode: levelMode, title, description, source, code, blocks, manual, candidate, programSnapshots, modeDrafts, archived });
  useEffect(() => { latestDraft.current = draftPayload; }, [draftPayload]);
  const targetDirty = editing && (!level || title.trim() !== level.title || description !== level.description || archived !== level.archived || source !== level.source || (source === "manual" ? stamp(manual) !== level.targetColors : (source === "python" ? code !== level.sourceCode : compiled.code !== level.sourceCode || JSON.stringify(blocks) !== JSON.stringify(level.sourceBlocks)) || (candidate !== null && stamp(candidate) !== level.targetColors)));
  const studentDraft = useMemo(() => studentContent(content), [content]);
  const studentBytes = useMemo(() => new TextEncoder().encode(JSON.stringify(studentDraft)).length, [studentDraft]);
  const unapplied = JSON.stringify(studentDraft) !== JSON.stringify(published);
  const changes = useMemo(() => compareContent(published ?? emptyContent(), studentDraft), [published, studentDraft]);

  useEffect(() => {
    if (!editing) return;
    const instance = new PythonRunner((status) => setRunnerStatus(status));
    const ticketRef = runTicket;
    runner.current = instance;
    return () => {
      ticketRef.current++;
      instance.dispose();
    };
  }, [editing]);
  const saveAuthoring = useCallback(() => {
    if (!editing || savedNew.current || initial.error || authoring.error) return false;
    if (draftTimer.current) clearTimeout(draftTimer.current);
    draftTimer.current = null;
    try {
      const key = `pixel-code-lab.authoring.${route.levelId}`;
      localStorage.setItem(key, latestDraft.current);
      try { sessionStorage.removeItem(`${key}.recovery`); } catch { /* Main copy is saved. */ }
      setDraftStatus("saved");
      setStorageError("");
      return true;
    } catch (error) {
      try { sessionStorage.setItem(`pixel-code-lab.authoring.${route.levelId}.recovery`, latestDraft.current); } catch { /* Export remains available. */ }
      setDraftStatus("failed");
      setStorageError(`制作草稿保存失败：${String(error)}`);
      return false;
    }
  }, [editing, initial.error, authoring.error, route.levelId]);
  function safeNavigate(next: AppRoute) {
    if (editing && !savedNew.current && (initial.error || authoring.error || draftStatus !== "saved") && !saveAuthoring()) {
      setNotice("制作草稿尚未保存，请重试或导出后再离开");
      return;
    }
    onNavigate(next);
  }
  useEffect(() => {
    if (!editing || savedNew.current || initial.error || authoring.error) return;
    setDraftStatus("pending");
    if (draftTimer.current) clearTimeout(draftTimer.current);
    draftTimer.current = setTimeout(saveAuthoring, 400);
    return () => { if (draftTimer.current) clearTimeout(draftTimer.current); };
  // Save is scheduled for each draft change; the latest snapshot is kept in latestDraft.
  }, [editing, route.levelId, draftPayload, initial.error, authoring.error, saveAuthoring]);
  useEffect(() => {
    const flush = (event?: BeforeUnloadEvent) => {
      if (!editing || savedNew.current || initial.error || authoring.error || !draftTimer.current) return;
      clearTimeout(draftTimer.current);
      const key = `pixel-code-lab.authoring.${route.levelId}`;
      try { localStorage.setItem(key, latestDraft.current); }
      catch {
        try { sessionStorage.setItem(`${key}.recovery`, latestDraft.current); }
        catch { if (event) { event.preventDefault(); event.returnValue = ""; } }
      }
    };
    window.addEventListener("beforeunload", flush);
    return () => { flush(); window.removeEventListener("beforeunload", flush); };
  }, [editing, route.levelId, initial.error, authoring.error]);
  useEffect(() => {
    if (!editing) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && (expanded || targetExpanded)) { setExpanded(false); setTargetExpanded(false); return; }
      if (source !== "manual" || !(event.ctrlKey || event.metaKey)) return;
      if ((event.target as Element | null)?.closest("input, textarea, [contenteditable], .monaco-editor, .blocklySvg")) return;
      const undo = event.key.toLowerCase() === "z" && !event.shiftKey;
      const redo = event.key.toLowerCase() === "y" || (event.key.toLowerCase() === "z" && event.shiftKey);
      if (undo && history.length) {
        event.preventDefault();
        setFuture((items) => [manual, ...items]);
        setManual(history.at(-1)!);
        setHistory((items) => items.slice(0, -1));
      } else if (redo && future.length) {
        event.preventDefault();
        setHistory((items) => [...items, manual]);
        setManual(future[0]);
        setFuture((items) => items.slice(1));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editing, expanded, targetExpanded, source, history, future, manual]);

  function change(next: ContentPackage) {
    if (storageError) {
      setNotice(storageError);
      return false;
    }
    try {
      saveContent(draftKey, next);
      setFailedContent(null);
      setContent(next);
      setNotice("管理草稿已保存");
      return true;
    } catch (error) {
      setFailedContent(next);
      setStorageError(`保存失败：${String(error)}`);
      return false;
    }
  }
  function retryContent() {
    const pending = failedContent;
    if (!pending) return;
    try {
      saveContent(draftKey, pending);
      setFailedContent(null);
      setContent(pending);
      setStorageError("");
      setNotice("管理草稿已保存");
    } catch (error) { setStorageError(`保存失败：${String(error)}`); }
  }
  function updateManual(next: number[]) {
    setHistory((h) => [...h.slice(-99), manual]);
    setFuture([]);
    setManual(next);
  }
  function paint(indices: number[], value: number) {
    if (value < 0) {
      setColor(-value - 1);
      setTool("draw");
      return;
    }
    const next = [...manual];
    for (const i of indices) next[i] = value;
    if (next.some((v, i) => v !== manual[i])) updateManual(next);
  }
  function setMode(mode: ContentMode) {
    if (mode === levelMode || level) return;
    runTicket.current++;
    runner.current?.stop();
    setRunning(false);
    setModeDrafts((previous) => ({ ...previous, [levelMode]: { source, code, blocks, manual, candidate, programSnapshots } }));
    const restored = modeDrafts[mode];
    setLevelMode(mode);
    setSource(restored?.source ?? "manual");
    setCode(restored?.code ?? (mode === "2d" ? starterCode : voxelStarter));
    setBlocks(restored?.blocks ?? emptyBlocksFor(mode));
    setManual(restored?.manual ?? [...blank(mode)].map(Number));
    setCandidate(restored?.candidate ?? null);
    setProgramSnapshots(restored?.programSnapshots ?? {});
    setTool("draw");
    setHistory([]);
    setFuture([]);
  }
  function chooseSource(next: ContentSource) {
    if (next === source) return;
    runTicket.current++;
    runner.current?.stop();
    setRunning(false);
    setSource(next);
    const sourceCode = next === "python" ? code : next === "blocks" ? compiled.code : "";
    const previous = next === "python" || next === "blocks" ? programSnapshots[next] : undefined;
    setCandidate(previous?.code === sourceCode ? previous.colors : null);
  }
  function copyProject() {
    const selected = projects.find(
      (item) => `${item.mode}:${item.project.id}` === projectToCopy,
    );
    if (!selected) return;
    if (level && level.mode !== selected.mode) {
      setNotice("已有发布关卡的维度不能修改");
      return;
    }
    if (
      !window.confirm(`将作品「${selected.project.name}」复制到当前关卡草稿？`)
    )
      return;
    const project = selected.project;
    setLevelMode(selected.mode);
    setTitle(project.name);
    setCode(project.code);
    setBlocks(project.blocks ?? emptyBlocksFor(selected.mode));
    setSource(project.editor === "blocks" ? "blocks" : "python");
    setManual(
      project.preview
        ? [...project.preview].map(Number)
        : [...blank(selected.mode)].map(Number),
    );
    setCandidate(project.preview ? [...project.preview].map(Number) : null);
    setProgramSnapshots(project.preview ? { [project.editor === "blocks" ? "blocks" : "python"]: { code: project.code, colors: [...project.preview].map(Number) } } : {});
    setHistory([]);
    setFuture([]);
    setNotice(
      project.preview
        ? "已复制作品与预览，可保存目标"
        : "已复制作品，请运行生成目标",
    );
  }
  async function run() {
    const sourceCode = source === "blocks" ? compiled.code : code;
    if (source === "blocks" && compiled.issues.length) {
      setRunError(compiled.issues[0].message);
      return;
    }
    if (!runner.current) return;
    const ticket = ++runTicket.current;
    setRunning(true);
    setRunError("");
    setCandidate(null);
    try {
      const result = await runner.current.run(
        sourceCode,
        levelMode === "2d" ? 10 : 8,
        levelMode,
      );
      if (ticket === runTicket.current) {
        setCandidate(result.colors);
        if (source !== "manual") setProgramSnapshots((previous) => ({ ...previous, [source]: { code: sourceCode, colors: result.colors } }));
      }
    } catch (error) {
      if (ticket === runTicket.current)
        setRunError(
          error instanceof RunFailure
            ? `${error.detail.kind}：${error.detail.message}`
            : String(error),
        );
    } finally {
      if (ticket === runTicket.current) setRunning(false);
    }
  }
  function saveLevel() {
    const currentSource = source === "blocks" ? compiled.code : code;
    const unchangedProgram = level && source === level.source && currentSource === level.sourceCode;
    const result = source === "manual" ? manual : candidate ?? (unchangedProgram ? [...level.targetColors].map(Number) : null);
    if (!title.trim() || title.length > 80) {
      setNotice("请输入 1～80 字符的关卡名称");
      return;
    }
    if (!result) {
      setNotice("请先成功运行，再保存目标");
      return;
    }
    if (!saveAuthoring()) {
      setNotice("制作草稿保存失败，请重试或导出草稿");
      return;
    }
    const sameTarget = level?.targetColors === stamp(result);
    const record: ContentLevel = {
      id: level?.id ?? makeId("level"),
      title: title.trim(),
      description,
      mode: levelMode,
      radius: levelMode === "2d" ? 10 : 8,
      targetColors: stamp(result),
      revision: level ? level.revision + (sameTarget ? 0 : 1) : 1,
      source,
      ...(source === "manual"
        ? {}
        : { sourceCode: source === "blocks" ? compiled.code : code }),
      ...(source === "blocks" ? { sourceBlocks: blocks } : {}),
      archived,
    };
    const next = {
      ...content,
      levels: level
        ? content.levels.map((l) => (l.id === level.id ? record : l))
        : [...content.levels, record],
    };
    if (change(next)) {
      setNotice("关卡目标已保存");
      if (!level) {
        savedNew.current = true;
        localStorage.removeItem("pixel-code-lab.authoring.new");
        onNavigate({
          kind: "admin",
          mode: "2d",
          activity: "challenge",
          page: "levels",
          levelId: record.id,
        });
      }
    }
  }
  function newLevel() {
    safeNavigate({
      kind: "admin",
      mode: "2d",
      activity: "challenge",
      page: "levels",
      levelId: "new",
    });
  }
  function copyLevel(level: ContentLevel) {
    const copy: ContentLevel = { ...structuredClone(level), id: makeId("level"), title: `${level.title} 副本`, revision: 1, archived: false };
    if (change({ ...content, levels: [...content.levels, copy] })) {
      setNotice(`已复制关卡「${level.title}」，新 ID：${copy.id}；副本未编排，学生进度独立`);
    }
  }
  async function importFile(file: File) {
    let parsed: unknown;
    try {
      if (file.size > 12_000_000) throw new Error("内容包超过 12 MB");
      parsed = JSON.parse(await file.text());
      const missing = inspectReferences(parsed);
      if (missing.length) throw new Error(`${missing.length} 处内容引用不存在`);
      const next = parseImport(parsed);
      setImportReview({ name: file.name, content: next, conflicts: conflictingIds(content, next) });
      setImportIssue(null);
      setNotice("已验证导入文件，请查看范围后确认替换");
    } catch (error) {
      setImportReview(null);
      const data = parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {};
      const count = (key: string) => Array.isArray(data[key]) ? data[key].length : "?";
      setImportIssue({ name: file.name, counts: `${count("chapters")} 大章、${count("sections")} 小节、${count("levels")} 关卡、${count("placements")} 个编排`, missing: inspectReferences(parsed), error: String(error) });
      setNotice(`导入校验失败，原管理草稿未修改：${String(error)}`);
    }
  }
  function commitImport() {
    if (!importReview) return;
    if (targetDirty) { setNotice("当前关卡目标尚未保存，请先保存后再导入"); return; }
    if (initial.error) { setNotice("原管理草稿无法读取，已保留原数据；请先手动备份或恢复"); return; }
    try {
      saveContent(importBackupKey, content);
      setImportBackupAvailable(true);
      saveContent(draftKey, importReview.content);
      setContent(importReview.content);
      setImportReview(null);
      setImportIssue(null);
      setNotice("导入成功；替换前的管理草稿已自动备份，可恢复");
      onNavigate({ kind: "admin", mode: "2d", activity: "challenge", page: "levels" });
    } catch (error) {
      setNotice(`导入写入失败，原管理草稿保持不变：${String(error)}`);
    }
  }
  function restoreImportBackup() {
    if (targetDirty) { setNotice("当前关卡目标尚未保存，请先保存后再恢复备份"); return; }
    try {
      const backup = loadContent(importBackupKey);
      saveContent(draftKey, backup);
      setContent(backup);
      setShowRestoreBackup(false);
      setNotice("已恢复导入前的管理草稿");
      onNavigate({ kind: "admin", mode: "2d", activity: "challenge", page: "levels" });
    } catch (error) { setNotice(`恢复备份失败，当前管理草稿未修改：${String(error)}`); }
  }
  function apply() {
    if (targetDirty) {
      setNotice("当前关卡目标尚未保存，请先保存关卡目标");
      return;
    }
    let oldPreviousRaw: string | null = null;
    let previousWritten = false;
    try {
      if (!published && localStorage.getItem(publishedKey) !== null) throw new Error("现有应用内容无法读取，请先备份并修复");
      oldPreviousRaw = localStorage.getItem(previousPublishedKey);
      const before = published ?? emptyContent();
      saveContent(previousPublishedKey, before);
      previousWritten = true;
      saveContent(publishedKey, studentDraft);
      setPreviousPublished(before);
      setPublished(studentDraft);
      setNotice(`已应用到本机挑战；包含 ${changeCount(changes)} 项差异，可回退上一次应用`);
    } catch (error) {
      if (previousWritten) {
        try {
          if (oldPreviousRaw === null) localStorage.removeItem(previousPublishedKey);
          else localStorage.setItem(previousPublishedKey, oldPreviousRaw);
        } catch (restoreError) {
          setNotice(`应用失败，现有学生内容未修改；上次应用快照恢复失败：${String(restoreError)}`);
          return;
        }
      }
      setNotice(`应用失败：${String(error)}`);
    }
  }
  function rollback() {
    if (!previousPublished) return;
    try {
      const current = loadContent(publishedKey);
      saveContent(previousPublishedKey, current);
      try {
        saveContent(publishedKey, previousPublished);
      } catch (error) {
        saveContent(previousPublishedKey, previousPublished);
        throw error;
      }
      setPublished(previousPublished);
      setPreviousPublished(current);
      setNotice("已回退到上一次应用；管理草稿未修改，可再次应用");
    } catch (error) { setNotice(`回退失败，当前应用内容未修改：${String(error)}`); }
  }
  const allIds = [
    ...content.levels.map((l) => l.id),
    ...[
      "square",
      "checkerboard",
      "circle",
      "voxel-cube",
      "voxel-hollow-cube",
      "voxel-cylinder",
      "voxel-sphere",
      "voxel-stairs",
      "voxel-pyramid",
      "voxel-house",
    ],
  ];
  const displayed = allIds
    .map((id) => getLevel(id, content))
    .filter(
      (l): l is NonNullable<typeof l> => !!l && (l.title.toLocaleLowerCase().includes(levelSearch.toLocaleLowerCase()) || l.id.includes(levelSearch)) &&
        (levelModeFilter === "all" || l.mode === levelModeFilter) &&
        (levelArchiveFilter === "all" || (levelArchiveFilter === "archived") === l.archived) &&
        (levelPlacementFilter === "all" || (levelPlacementFilter === "placed") === content.placements.some((p) => p.levelId === l.id)),
    );
  const sliceColors =
    levelMode === "3d"
      ? Array.from(
          { length: 289 },
          (_, i) => manual[index3((i % 17) - 8, 8 - Math.floor(i / 17), slice)],
        )
      : manual;
  const draw3 = (indices: number[], value: number) =>
    paint(
      indices.map((i) => index3((i % 17) - 8, 8 - Math.floor(i / 17), slice)),
      value,
    );
  const edit3 = (hit: {
    voxel: Point;
    normal: Point;
    empty: boolean;
    dye: boolean;
  }) => {
    const [x, y, z] = hit.voxel;
    if (tool === "pick") {
      setColor(manual[index3(x, y, z)]);
      setTool("draw");
      return;
    }
    const dye = tool === "dye" || hit.dye;
    if (dye && hit.empty) { setNotice("染色需要先选中已有体素"); return; }
    const target =
      tool === "erase" || dye || hit.empty
        ? [x, y, z]
        : [x + hit.normal[0], y + hit.normal[1], z + hit.normal[2]];
    if (target.some((v) => Math.abs(v) > 8)) {
      setNotice("超出空间范围");
      return;
    }
    const i = index3(target[0], target[1], target[2]);
    if (tool === "draw" && !dye && manual[i] !== 0) {
      setNotice("目标格已占用");
      return;
    }
    paint([i], tool === "erase" ? 0 : color);
  };

  return (
    <main className="admin-page">
      <header className="admin-header">
        <div>
          <h1>内容管理</h1>
          <p>关卡库 · 章节管理 · 关卡编排</p>
        </div>
        <button
          onClick={() =>
            safeNavigate({ kind: "start", mode: "2d", activity: "challenge" })
          }
        >
          返回学生入口
        </button>
      </header>
      <nav className="admin-nav">
        <button
          aria-current={route.page === "levels"}
          onClick={() =>
            safeNavigate({
              kind: "admin",
              mode: "2d",
              activity: "challenge",
              page: "levels",
            })
          }
        >
          关卡库
        </button>
        <button
          aria-current={route.page === "chapters"}
          onClick={() =>
            safeNavigate({
              kind: "admin",
              mode: "2d",
              activity: "challenge",
              page: "chapters",
            })
          }
        >
          章节管理
        </button>
        <button
          aria-current={route.page === "arrangement"}
          onClick={() =>
            safeNavigate({
              kind: "admin",
              mode: "2d",
              activity: "challenge",
              page: "arrangement",
            })
          }
        >
          关卡编排
        </button>
      </nav>
      {(storageError || notice) && (
        <p
          className={storageError ? "admin-error" : "admin-notice"}
          role="status"
        >
          {storageError || notice}
        </p>
      )}
      <div className="admin-save-state" role="status">
        {editing && <span>制作草稿：{draftStatus === "pending" ? "保存中…" : draftStatus === "failed" ? "保存失败" : "已保存"}</span>}
        {editing && <span>关卡目标：{targetDirty ? "有未保存修改" : "已保存"}</span>}
        <span>本机挑战：{unapplied ? "有未应用修改" : "与管理内容一致"}</span>
        {editing && draftStatus === "failed" && <button onClick={saveAuthoring}>重试保存草稿</button>}
        {failedContent && <button onClick={retryContent}>重试保存管理内容</button>}
        {editing && <button onClick={() => download(`pixel-code-lab-authoring-${route.levelId}.json`, latestDraft.current)}>导出当前制作草稿</button>}
        {failedContent && <button onClick={() => download("pixel-code-lab-unsaved-content.json", JSON.stringify(failedContent, null, 2))}>导出未保存管理内容</button>}
      </div>
      <details className="admin-transfer-details" open={!editing}>
        <summary>备份、导入与应用</summary>
      <div className="admin-transfer">
        <button
          onClick={() =>
            download(
              "pixel-code-lab-admin-backup.json",
              JSON.stringify(content, null, 2),
            )
          }
        >
          导出管理备份
        </button>
        <button
          onClick={() => {
            const student = JSON.parse(
              JSON.stringify(content),
            ) as ContentPackage;
            student.levels = student.levels.map((l) => {
              delete l.sourceCode;
              delete l.sourceBlocks;
              return l;
            });
            download(
              "pixel-code-lab-student-content.json",
              JSON.stringify(student, null, 2),
            );
          }}
        >
          导出学生内容包
        </button>
        <label>
          导入管理备份{" "}
          <input
            type="file"
            accept="application/json,.json"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void importFile(file);
              e.target.value = "";
            }}
          />
        </label>
        <button onClick={apply}>应用到本机挑战</button>
        <button disabled={!previousPublished} onClick={rollback}>回退上一次应用</button>
        {importBackupAvailable && <button onClick={() => setShowRestoreBackup(true)}>恢复导入前管理草稿</button>}
      </div>
      <div className="admin-delivery-review">
        <h3>应用差异 · {changeCount(changes)} 项</h3>
        {([
          ["新增关卡", changes.added], ["修改关卡", changes.modified], ["归档关卡", changes.archived],
          ["恢复关卡", changes.restored], ["删除关卡", changes.removed], ["加入目录", changes.placed], ["移出目录", changes.unplaced],
          ["移动或排序", changes.moved], ["目录调整", changes.directory],
        ] as [string, string[]][]).map(([label, items]) => <details key={label}><summary>{label}：{items.length}</summary>{items.length ? <ul>{items.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul> : <p>无</p>}</details>)}
        <p className="admin-hint">待应用学生内容 JSON 约 {(studentBytes / 1024).toFixed(1)} KiB。应用只影响本机学生内容；上一次应用快照可回退，管理草稿保持独立。</p>
      </div>
      {importReview && <div className="admin-impact" role="dialog" aria-label="导入审阅"><strong>导入审阅：{importReview.name}</strong><p>新文件：{contentCounts(importReview.content).chapters} 大章、{contentCounts(importReview.content).sections} 小节、{contentCounts(importReview.content).levels} 自定义关卡、{contentCounts(importReview.content).placements} 个编排。当前管理草稿：{contentCounts(content).chapters} 大章、{contentCounts(content).sections} 小节、{contentCounts(content).levels} 自定义关卡。</p><p>同 ID 内容冲突：{importReview.conflicts.length} 关{importReview.conflicts.length ? `（${importReview.conflicts.slice(0, 8).join("、")}）` : ""}。缺失引用：0（已通过完整校验）。确认后先自动备份当前管理草稿，再整包替换。</p><button onClick={commitImport}>确认备份并导入</button><button onClick={() => setImportReview(null)}>取消导入</button></div>}
      {importIssue && <div className="admin-impact" role="alert"><strong>导入校验未通过：{importIssue.name}</strong><p>文件包含 {importIssue.counts}；{importIssue.error}。原管理草稿未修改。</p>{importIssue.missing.length > 0 && <ul>{importIssue.missing.slice(0, 20).map((item, index) => <li key={index}>{item}</li>)}</ul>}<button onClick={() => setImportIssue(null)}>关闭</button></div>}
      {showRestoreBackup && <div className="admin-impact" role="dialog" aria-label="恢复导入备份"><strong>恢复导入前的管理草稿</strong><p>这会替换当前管理草稿；本机学生应用内容不变。建议先导出当前草稿。</p><button onClick={restoreImportBackup}>确认恢复</button><button onClick={() => setShowRestoreBackup(false)}>取消</button></div>}
      </details>
      {(route.page === "chapters" || route.page === "arrangement") && (
        <AdminStructure page={route.page} content={content} change={change} setNotice={setNotice} />
      )}
      {route.page === "levels" && !editing && (
        <section className="admin-list">
          <div className="admin-row">
            <h2>关卡库</h2>
            <button onClick={newLevel}>＋ 新建关卡</button>
            <input
              aria-label="搜索关卡"
              placeholder="搜索名称或 ID"
              value={levelSearch}
              onChange={(e) => setLevelSearch(e.target.value)}
            />
            <select aria-label="筛选维度" value={levelModeFilter} onChange={(e) => setLevelModeFilter(e.target.value as typeof levelModeFilter)}><option value="all">全部维度</option><option value="2d">2D</option><option value="3d">3D</option></select>
            <select aria-label="筛选归档" value={levelArchiveFilter} onChange={(e) => setLevelArchiveFilter(e.target.value as typeof levelArchiveFilter)}><option value="all">全部归档状态</option><option value="active">未归档</option><option value="archived">已归档</option></select>
            <select aria-label="筛选编排" value={levelPlacementFilter} onChange={(e) => setLevelPlacementFilter(e.target.value as typeof levelPlacementFilter)}><option value="all">全部编排状态</option><option value="placed">已编排</option><option value="unplaced">未编排</option></select>
          </div>
          <p className="admin-hint">显示 {displayed.length} 关 · 自定义 {content.levels.length} 关</p>
          {displayed.map((l) => (
            <article key={l.id}>
              <LevelThumbnail
                colors={l.colors}
                mode={l.mode}
                radius={l.radius}
              />
              <span>
                {l.title} · {l.mode}
                {l.archived ? " · 已归档" : ""}
                <small> · {l.id} · {(() => { const placement = content.placements.find((p) => p.levelId === l.id); const section = content.sections.find((s) => s.id === placement?.sectionId); const chapter = content.chapters.find((c) => c.id === section?.chapterId); return section ? `${chapter?.title ?? "?"} / ${section.title}` : "未编排"; })()}</small>
              </span>
              {content.levels.some((c) => c.id === l.id) && <button onClick={() => copyLevel(content.levels.find((c) => c.id === l.id)!)}>复制关卡</button>}
              {content.levels.some((c) => c.id === l.id) && <button onClick={() => setPendingArchiveId(l.id)}>{l.archived ? "恢复" : "归档"}</button>}
              <button
                onClick={() =>
                  safeNavigate({
                    kind: "admin",
                    mode: "2d",
                    activity: "challenge",
                    page: "levels",
                    levelId: l.id,
                  })
                }
              >
                {content.levels.some((c) => c.id === l.id)
                  ? "编辑"
                  : "查看内置样例"}
              </button>
            </article>
          ))}
          {pendingArchiveId && (() => { const level = content.levels.find((item) => item.id === pendingArchiveId); if (!level) return null; const placement = content.placements.find((item) => item.levelId === level.id); return <div className="admin-impact" role="alert"><strong>{level.archived ? "恢复" : "归档"}「{level.title}」</strong><p>影响 1 个关卡{placement ? "，已编排目录位置保留" : "，当前未编排"}；关卡 ID、目标和学生历史进度保留。</p><button onClick={() => { if (change({ ...content, levels: content.levels.map((item) => item.id === level.id ? { ...item, archived: !item.archived } : item) })) { setNotice(level.archived ? "关卡已恢复" : "关卡已归档"); setPendingArchiveId(""); } }}>确认{level.archived ? "恢复" : "归档"}</button><button onClick={() => setPendingArchiveId("")}>取消</button></div>; })()}
        </section>
      )}
      {editing && projects.length > 0 && (
        <div className="admin-transfer">
          <select
            aria-label="选择创作作品"
            value={projectToCopy}
            onChange={(e) => setProjectToCopy(e.target.value)}
          >
            <option value="">选择创作作品</option>
            {projects
              .filter((item) => !level || item.mode === level.mode)
              .map((item) => (
                <option
                  key={`${item.mode}:${item.project.id}`}
                  value={`${item.mode}:${item.project.id}`}
                >
                  {item.mode} · {item.project.name}
                </option>
              ))}
          </select>
          <button disabled={!projectToCopy} onClick={copyProject}>
            复制到关卡草稿
          </button>
        </div>
      )}
      {editing && (
        <div className="admin-edit">
          <section className="admin-fields">
            <button
              onClick={() =>
                safeNavigate({
                  kind: "admin",
                  mode: "2d",
                  activity: "challenge",
                  page: "levels",
                })
              }
            >
              ← 关卡库
            </button>
            {level || route.levelId === "new" ? (
              <>
                <h2>{level ? "编辑关卡" : "新建关卡"}</h2>
                <label>
                  名称
                  <input
                    value={title}
                    maxLength={80}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </label>
                <label>
                  任务描述
                  <textarea
                    value={description}
                    maxLength={1000}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </label>
                <div className="admin-row">
                  <button
                    disabled={!!level}
                    aria-pressed={levelMode === "2d"}
                    onClick={() => setMode("2d")}
                  >
                    2D
                  </button>
                  <button
                    disabled={!!level}
                    aria-pressed={levelMode === "3d"}
                    onClick={() => setMode("3d")}
                  >
                    3D
                  </button>
                </div>
                <div className="admin-row">
                  <button
                    aria-pressed={source === "manual"}
                    onClick={() => chooseSource("manual")}
                  >
                    手动
                  </button>
                  <button
                    aria-pressed={source === "python"}
                    onClick={() => chooseSource("python")}
                  >
                    Python
                  </button>
                  <button
                    aria-pressed={source === "blocks"}
                    onClick={() => chooseSource("blocks")}
                  >
                    积木
                  </button>
                </div>
                {source === "manual" ? (
                  <>
                    <div className="admin-palette">
                      {palette.map((p, i) => (
                        <button
                          key={i}
                          aria-pressed={color === i}
                          title={`${i} ${colorNames[i]}`}
                          onClick={() => {
                            setColor(i);
                            setTool((previous) => previous === "dye" ? "dye" : "draw");
                          }}
                          style={{ background: p }}
                        >
                          {i}
                        </button>
                      ))}
                    </div>
                    <div className="admin-row">
                      <button
                        aria-pressed={tool === "draw"}
                        onClick={() => setTool("draw")}
                      >
                        画笔/添加
                      </button>
                      {levelMode === "3d" && <button aria-pressed={tool === "dye"} onClick={() => setTool("dye")}>染色</button>}
                      <button
                        aria-pressed={tool === "erase"}
                        onClick={() => setTool("erase")}
                      >
                        橡皮/删除
                      </button>
                      <button
                        aria-pressed={tool === "pick"}
                        onClick={() => setTool("pick")}
                      >
                        吸管
                      </button>
                    </div>
                    <div className="admin-row">
                      <button
                        disabled={!history.length}
                        onClick={() => {
                          setFuture((f) => [manual, ...f]);
                          setManual(history.at(-1)!);
                          setHistory((h) => h.slice(0, -1));
                        }}
                      >
                        撤销
                      </button>
                      <button
                        disabled={!future.length}
                        onClick={() => {
                          setHistory((h) => [...h, manual]);
                          setManual(future[0]);
                          setFuture((f) => f.slice(1));
                        }}
                      >
                        重做
                      </button>
                      <button
                        onClick={() => {
                          if (window.confirm("清空手动草稿？"))
                            updateManual([...blank(levelMode)].map(Number));
                        }}
                      >
                        清空
                      </button>
                    </div>
                    {levelMode === "3d" && (
                      <label>
                        Z 层 {slice}
                        <input
                          type="range"
                          min={-8}
                          max={8}
                          value={slice}
                          onChange={(e) => setSlice(Number(e.target.value))}
                        />
                      </label>
                    )}
                  </>
                ) : (
                  <>
                    <div className="admin-code">
                      <Suspense fallback={<p>加载编辑器…</p>}>
                        {source === "python" ? (
                          <CodeEditor
                            value={code}
                            onChange={(value) => {
                              setCode(value);
                              setCandidate(null);
                            }}
                          />
                        ) : (
                          <BlocksEditor
                            key={levelMode}
                            mode={levelMode}
                            document={blocks}
                            onChange={(value) => {
                              setBlocks(value);
                              setCandidate(null);
                            }}
                            onError={setRunError}
                          />
                        )}
                      </Suspense>
                    </div>
                    <div className="admin-row">
                      <button
                        disabled={running || runnerStatus !== "ready"}
                        onClick={() => void run()}
                      >
                        {running
                          ? "运行中…"
                          : runnerStatus === "ready"
                            ? "运行生成目标"
                            : "加载 Python…"}
                      </button>
                      <button
                        onClick={() => {
                          if (!candidate) return;
                          if (manual.some((value, index) => value !== 0 && value !== candidate[index]) && !window.confirm("复制运行结果会替换当前手动草稿，确定继续？")) return;
                          updateManual(candidate);
                          chooseSource("manual");
                        }}
                        disabled={!candidate}
                      >
                        复制结果到手动草稿
                      </button>
                    </div>
                    {runError && (
                      <p role="alert" className="admin-error">
                        {runError}
                      </p>
                    )}
                  </>
                )}
                <label>
                  <input
                    type="checkbox"
                    checked={archived}
                    onChange={(e) => setArchived(e.target.checked)}
                  />{" "}
                  归档（学生端不显示）
                </label>
                {level && <p className="admin-hint">归档影响此 1 个关卡；保留关卡 ID、已编排位置、目标和学生历史进度。保存目标后生效。</p>}
                <button className="admin-primary" onClick={saveLevel}>
                  保存为关卡目标
                </button>
              </>
            ) : (
              <p>内置样例在代码中定义。可在编排页放入小节。</p>
            )}
          </section>
          <section className={`admin-preview${expanded ? " admin-preview-expanded" : ""}`}>
            <div className="admin-preview-head">
              <h2>目标与编辑结果</h2>
              <button onClick={() => setExpanded((value) => !value)}>{expanded ? "退出放大" : "放大编辑画布"}</button>
            </div>
            <div className="admin-saved-target">
              <div><strong>已保存目标</strong><p>{level ? `版本 ${level.revision} · ${level.targetColors.replaceAll("0", "").length} 格` : "新关卡尚无已保存目标"}</p></div>
              {level && <button className="admin-target-zoom" onClick={() => setTargetExpanded(true)} aria-label="放大已保存目标"><LevelThumbnail colors={[...level.targetColors].map(Number)} mode={level.mode} radius={level.radius} /></button>}
            </div>
            {level && targetExpanded && <div className="admin-target-overlay" role="dialog" aria-label="已保存目标预览"><button onClick={() => setTargetExpanded(false)}>关闭目标预览</button><LevelThumbnail colors={[...level.targetColors].map(Number)} mode={level.mode} radius={level.radius} /></div>}
            <h2>
              {source === "manual"
                ? "手动编辑目标"
                : candidate
                  ? "运行结果预览"
                  : "尚未运行"}
            </h2>
            {levelMode === "2d" ? (
              <PixelPainter
                colors={source === "manual" ? manual : (candidate ?? manual)}
                radius={10}
                color={color}
                tool={source === "manual" ? (tool === "dye" ? "draw" : tool) : "pick"}
                onStroke={source === "manual" ? paint : () => {}}
                onPick={(picked) => { setColor(picked); setTool("draw"); }}
              />
            ) : (
              <>
                <div className="admin-row">
                  <button
                    onClick={() =>
                      controls.setView((v) => ({
                        ...v,
                        topDown: true,
                        pitch: Math.PI / 2,
                      }))
                    }
                  >
                    俯视
                  </button>
                  <button onClick={() => controls.setView(initialVoxelView)}>
                    重置视角
                  </button>
                  <button
                    aria-pressed={controls.axes}
                    onClick={() => controls.setAxes((v) => !v)}
                  >
                    坐标辅助
                  </button>
                  <button
                    aria-pressed={controls.lighting}
                    onClick={() => controls.setLighting((v) => !v)}
                  >
                    光影
                  </button>
                </div>
                <div className="admin-voxel-view">
                  <VoxelCanvas
                    colors={
                      source === "manual" ? manual : (candidate ?? manual)
                    }
                    radius={8}
                    controls={controls}
                    label="三维目标编辑画布"
                    onEdit={source === "manual" ? edit3 : undefined}
                    editMode={source === "manual" ? tool : undefined}
                    editLayer={slice}
                  />
                </div>
                <p>
                  当前工具：{tool === "draw" ? "添加" : tool === "dye" ? "染色" : tool === "erase" ? "删除" : "吸管"}。左键操作，右键拖动旋转；下方逐层网格可修改内部方块。
                </p>
                {source === "manual" && (
                  <PixelPainter
                    colors={sliceColors}
                    radius={8}
                    layer={slice}
                    color={color}
                    tool={tool === "dye" ? "draw" : tool}
                    onStroke={draw3}
                    onPick={(picked) => { setColor(picked); setTool("draw"); }}
                  />
                )}
              </>
            )}
            <p>
              当前非空格：
              {
                (source === "manual" ? manual : (candidate ?? manual)).filter(
                  Boolean,
                ).length
              }
            </p>
          </section>
        </div>
      )}
      {editing && level && (
        <section className="admin-try">
          <h2>学生工作台试做</h2>
          <p>使用已保存的管理目标，在独立工作台中试做 Python 或积木；代码、作品和通关不写入学生存档。</p>
          <button onClick={() => { if (targetDirty) { setNotice("当前关卡目标尚未保存，请先保存目标后试做"); return; } safeNavigate({ kind: "admin", mode: "2d", activity: "challenge", page: "preview", levelId: level.id }); }}>打开学生工作台试做</button>
        </section>
      )}
    </main>
  );
}
