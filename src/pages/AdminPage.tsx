import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import {
  compileBlocks,
  emptyBlocksFor,
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
  validateContent,
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
import { evaluate } from "../engine/evaluate";
import { LevelThumbnail } from "../components/LevelThumbnail";
import "./AdminPage.css";

const CodeEditor = lazy(() => import("../components/CodeEditor"));
const BlocksEditor = lazy(() => import("../components/BlocksEditor"));
const blank = (mode: ContentMode) =>
  "0".repeat((mode === "2d" ? 21 : 17 ** 2) * (mode === "2d" ? 21 : 17));
const makeId = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;
const stamp = (values: number[]) => values.join("");
const index3 = (x: number, y: number, z: number) =>
  (z + voxelRadius) * 289 + (voxelRadius - y) * 17 + x + voxelRadius;

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

function PixelPainter({
  colors,
  radius,
  color,
  tool,
  onStroke,
}: {
  colors: number[];
  radius: number;
  color: number;
  tool: "draw" | "erase" | "pick";
  onStroke: (indices: number[], value: number) => void;
}) {
  const side = radius * 2 + 1;
  const [zoom, setZoom] = useState(1);
  const drawing = useRef<number[]>([]);
  const pointerId = useRef<number | null>(null);
  const at = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.floor(((event.clientX - rect.left) / rect.width) * side);
    const y = Math.floor(((event.clientY - rect.top) / rect.height) * side);
    return x >= 0 && y >= 0 && x < side && y < side ? y * side + x : -1;
  };
  const add = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const next = at(event);
    if (next < 0 || tool === "pick") return;
    const previous = drawing.current.at(-1);
    if (previous === undefined) {
      drawing.current.push(next);
      return;
    }
    const px = previous % side,
      py = Math.floor(previous / side),
      nx = next % side,
      ny = Math.floor(next / side);
    const steps = Math.max(Math.abs(nx - px), Math.abs(ny - py));
    for (let i = 1; i <= steps; i++)
      drawing.current.push(
        Math.round(py + ((ny - py) * i) / steps) * side +
          Math.round(px + ((nx - px) * i) / steps),
      );
  };
  const finish = () => {
    if (drawing.current.length)
      onStroke([...new Set(drawing.current)], tool === "erase" ? 0 : color);
    drawing.current = [];
    pointerId.current = null;
  };
  return (
    <div className="admin-pixel-editor">
      <div className="admin-row">
        <button
          onClick={() => setZoom((v) => Math.max(0.5, v / 1.25))}
          aria-label="缩小网格"
        >
          －
        </button>
        <span>{Math.round(zoom * 100)}%</span>
        <button
          onClick={() => setZoom((v) => Math.min(4, v * 1.25))}
          aria-label="放大网格"
        >
          ＋
        </button>
        <button onClick={() => setZoom(1)}>重置缩放</button>
      </div>
      <div className="admin-pixel-scroll">
        <canvas
          className="admin-pixel-canvas"
          width={side * 24}
          height={side * 24}
          aria-label="手动像素画布"
          style={{
            width: `${side * 24 * zoom}px`,
            backgroundColor: "#172a36",
            backgroundImage: `linear-gradient(#315064 1px,transparent 1px),linear-gradient(90deg,#315064 1px,transparent 1px)`,
            backgroundSize: `${100 / side}% ${100 / side}%`,
          }}
          ref={(element) => {
            if (!element) return;
            const ctx = element.getContext("2d");
            if (!ctx) return;
            const cell = element.width / side;
            ctx.clearRect(0, 0, element.width, element.height);
            colors.forEach((c, i) => {
              if (!c) return;
              ctx.fillStyle = palette[c];
              ctx.fillRect(
                (i % side) * cell,
                Math.floor(i / side) * cell,
                cell,
                cell,
              );
            });
          }}
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            if (tool === "pick") {
              const i = at(event);
              if (i >= 0) onStroke([i], -colors[i] - 1);
              return;
            }
            pointerId.current = event.pointerId;
            event.currentTarget.setPointerCapture(event.pointerId);
            drawing.current = [];
            add(event);
          }}
          onPointerMove={(event) => {
            if (pointerId.current === event.pointerId) add(event);
          }}
          onPointerUp={finish}
          onPointerCancel={() => {
            drawing.current = [];
            pointerId.current = null;
          }}
        />
      </div>
    </div>
  );
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
      const raw = localStorage.getItem(
        `pixel-code-lab.authoring.${route.levelId}`,
      );
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
            data.candidate.length !== data.manual.length))
      )
        throw new Error("制作草稿无效");
      return { data, error: "" };
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
  const [notice, setNotice] = useState("");
  const [selectedChapter, setSelectedChapter] = useState(
    content.chapters[0]?.id ?? "",
  );
  const [selectedSection, setSelectedSection] = useState(
    content.sections[0]?.id ?? "",
  );
  const [levelSearch, setLevelSearch] = useState("");
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
  const [running, setRunning] = useState(false);
  const [runnerStatus, setRunnerStatus] = useState<RunnerStatus>("loading");
  const [runError, setRunError] = useState("");
  const [tryCode, setTryCode] = useState(
    initialLevel?.mode === "3d" ? voxelStarter : starterCode,
  );
  const [tryResult, setTryResult] = useState("");
  const [color, setColor] = useState(1);
  const [tool, setTool] = useState<"draw" | "erase" | "pick">("draw");
  const [slice, setSlice] = useState(0);
  const [history, setHistory] = useState<number[][]>([]);
  const [future, setFuture] = useState<number[][]>([]);
  const [archived, setArchived] = useState(
    authoring.data?.archived ?? initialLevel?.archived ?? false,
  );
  const runner = useRef<PythonRunner | null>(null);
  const runTicket = useRef(0);
  const savedNew = useRef(false);
  const controls = useVoxelControls(voxelRadius);
  const level = content.levels.find((l) => l.id === route.levelId);
  const compiled = useMemo(() => compileBlocks(blocks), [blocks]);
  const editing = route.page === "levels" && !!route.levelId;

  useEffect(() => {
    const instance = new PythonRunner((status) => setRunnerStatus(status));
    const ticketRef = runTicket;
    runner.current = instance;
    return () => {
      ticketRef.current++;
      instance.dispose();
    };
  }, []);
  useEffect(() => {
    if (!editing || storageError || savedNew.current) return;
    try {
      localStorage.setItem(
        `pixel-code-lab.authoring.${route.levelId}`,
        JSON.stringify({
          mode: levelMode,
          title,
          description,
          source,
          code,
          blocks,
          manual,
          candidate,
          archived,
        }),
      );
    } catch (error) {
      queueMicrotask(() =>
        setStorageError(`制作草稿保存失败：${String(error)}`),
      );
    }
  }, [
    editing,
    storageError,
    route.levelId,
    levelMode,
    title,
    description,
    source,
    code,
    blocks,
    manual,
    candidate,
    archived,
  ]);

  function change(next: ContentPackage) {
    if (storageError) {
      setNotice(storageError);
      return false;
    }
    try {
      saveContent(draftKey, next);
      setContent(next);
      setNotice("管理草稿已保存");
      return true;
    } catch (error) {
      setStorageError(`保存失败：${String(error)}`);
      return false;
    }
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
    setLevelMode(mode);
    setCode(mode === "2d" ? starterCode : voxelStarter);
    setBlocks(emptyBlocksFor(mode));
    setManual([...blank(mode)].map(Number));
    setCandidate(null);
    setHistory([]);
    setFuture([]);
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
      if (ticket === runTicket.current) setCandidate(result.colors);
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
  async function tryLevel() {
    if (!level || !runner.current || runnerStatus !== "ready") return;
    const ticket = ++runTicket.current;
    setTryResult("正在运行…");
    try {
      const result = await runner.current.run(
        tryCode,
        level.radius,
        level.mode,
      );
      if (ticket !== runTicket.current) return;
      const score = evaluate(
        [...level.targetColors].map(Number),
        result.colors,
      );
      setTryResult(
        `匹配率 ${score.percent.toFixed(1)}%${score.passed ? " · 完全一致" : ""}`,
      );
    } catch (error) {
      if (ticket === runTicket.current)
        setTryResult(
          error instanceof RunFailure
            ? `${error.detail.kind}：${error.detail.message}`
            : String(error),
        );
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
    onNavigate({
      kind: "admin",
      mode: "2d",
      activity: "challenge",
      page: "levels",
      levelId: "new",
    });
  }
  function addChapter() {
    const name = window.prompt("大章名称");
    if (!name?.trim()) return;
    const id = makeId("chapter");
    if (
      change({
        ...content,
        chapters: [
          ...content.chapters,
          {
            id,
            title: name.trim(),
            description: "",
            order: content.chapters.length,
          },
        ],
      })
    )
      setSelectedChapter(id);
  }
  function addSection() {
    if (!selectedChapter) {
      setNotice("先选择一个大章");
      return;
    }
    const name = window.prompt("小节名称");
    if (!name?.trim()) return;
    const id = makeId("section");
    if (
      change({
        ...content,
        sections: [
          ...content.sections,
          {
            id,
            chapterId: selectedChapter,
            title: name.trim(),
            description: "",
            order: content.sections.filter(
              (s) => s.chapterId === selectedChapter,
            ).length,
          },
        ],
      })
    )
      setSelectedSection(id);
  }
  function movePlacement(levelId: string, sectionId: string) {
    const other = content.placements.filter((p) => p.levelId !== levelId);
    change({
      ...content,
      placements: sectionId
        ? [
            ...other,
            {
              levelId,
              sectionId,
              order: other.filter((p) => p.sectionId === sectionId).length,
            },
          ]
        : other,
    });
  }
  function reorder(levelId: string, delta: number) {
    const items = content.placements
      .filter((p) => p.sectionId === selectedSection)
      .sort((a, b) => a.order - b.order);
    const i = items.findIndex((p) => p.levelId === levelId);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= items.length) return;
    [items[i], items[j]] = [items[j], items[i]];
    change({
      ...content,
      placements: content.placements
        .filter((p) => p.sectionId !== selectedSection)
        .concat(items.map((p, order) => ({ ...p, order }))),
    });
  }
  async function importFile(file: File, toPublished = false) {
    try {
      if (file.size > 12_000_000) throw new Error("内容包超过 12 MB");
      const next = validateContent(JSON.parse(await file.text()));
      if (
        !window.confirm(
          `导入将替换${toPublished ? "已应用内容" : "管理草稿"}。请先导出备份，确定继续？`,
        )
      )
        return;
      saveContent(toPublished ? publishedKey : draftKey, next);
      if (!toPublished) {
        setContent(next);
        onNavigate({ kind: "admin", mode: "2d", activity: "challenge", page: "levels" });
      }
      setNotice("导入成功");
    } catch (error) {
      setNotice(`导入失败：${String(error)}`);
    }
  }
  function apply() {
    try {
      const student = structuredClone(content);
      student.levels.forEach((level) => {
        delete level.sourceCode;
        delete level.sourceBlocks;
      });
      saveContent(publishedKey, student);
      setNotice("已应用到本机挑战");
    } catch (error) {
      setNotice(`应用失败：${String(error)}`);
    }
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
      (l): l is NonNullable<typeof l> => !!l && l.title.includes(levelSearch),
    );
  const currentSection = content.sections.find((s) => s.id === selectedSection);
  const sectionLevels = content.placements
    .filter((p) => p.sectionId === selectedSection)
    .sort((a, b) => a.order - b.order);
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
    const target =
      tool === "erase" || hit.empty || hit.dye
        ? [x, y, z]
        : [x + hit.normal[0], y + hit.normal[1], z + hit.normal[2]];
    if (target.some((v) => Math.abs(v) > 8)) {
      setNotice("超出空间范围");
      return;
    }
    const i = index3(target[0], target[1], target[2]);
    if (tool === "draw" && !hit.dye && manual[i] !== 0) {
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
            onNavigate({ kind: "start", mode: "2d", activity: "challenge" })
          }
        >
          返回学生入口
        </button>
      </header>
      <nav className="admin-nav">
        <button
          aria-current={route.page === "levels"}
          onClick={() =>
            onNavigate({
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
            onNavigate({
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
            onNavigate({
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
      </div>
      {route.page === "chapters" && (
        <div className="admin-columns">
          <section>
            <h2>大章</h2>
            <button onClick={addChapter}>＋ 新增大章</button>
            {content.chapters
              .slice()
              .sort((a, b) => a.order - b.order)
              .map((ch) => (
                <article
                  key={ch.id}
                  className={selectedChapter === ch.id ? "selected" : ""}
                >
                  <button onClick={() => setSelectedChapter(ch.id)}>
                    {ch.title}
                  </button>
                  <button
                    title="重命名"
                    onClick={() => {
                      const value = window.prompt("大章名称", ch.title);
                      if (value?.trim())
                        change({
                          ...content,
                          chapters: content.chapters.map((c) =>
                            c.id === ch.id ? { ...c, title: value.trim() } : c,
                          ),
                        });
                    }}
                  >
                    修改
                  </button>
                  <button
                    onClick={() => {
                      const value = window.prompt("大章简介", ch.description);
                      if (value !== null)
                        change({
                          ...content,
                          chapters: content.chapters.map((c) =>
                            c.id === ch.id ? { ...c, description: value } : c,
                          ),
                        });
                    }}
                  >
                    简介
                  </button>
                  <button
                    onClick={() => {
                      if (content.sections.some((s) => s.chapterId === ch.id)) {
                        setNotice("请先迁移或删除下属小节");
                        return;
                      }
                      if (window.confirm(`删除大章「${ch.title}」？`))
                        change({
                          ...content,
                          chapters: content.chapters.filter(
                            (c) => c.id !== ch.id,
                          ),
                        });
                    }}
                  >
                    删除
                  </button>
                  <button
                    onClick={() => {
                      const items = content.chapters
                          .slice()
                          .sort((a, b) => a.order - b.order),
                        i = items.findIndex((c) => c.id === ch.id);
                      if (i <= 0) return;
                      [items[i - 1], items[i]] = [items[i], items[i - 1]];
                      change({
                        ...content,
                        chapters: items.map((c, order) => ({ ...c, order })),
                      });
                    }}
                  >
                    ↑
                  </button>
                </article>
              ))}
          </section>
          <section>
            <h2>小节</h2>
            <button onClick={addSection}>＋ 新增小节</button>
            {content.sections
              .filter((s) => s.chapterId === selectedChapter)
              .sort((a, b) => a.order - b.order)
              .map((sec) => (
                <article key={sec.id}>
                  <button onClick={() => setSelectedSection(sec.id)}>
                    {sec.title}
                  </button>
                  <button
                    onClick={() => {
                      const value = window.prompt("小节名称", sec.title);
                      if (value?.trim())
                        change({
                          ...content,
                          sections: content.sections.map((s) =>
                            s.id === sec.id ? { ...s, title: value.trim() } : s,
                          ),
                        });
                    }}
                  >
                    修改
                  </button>
                  <button
                    onClick={() => {
                      const value = window.prompt("小节简介", sec.description);
                      if (value !== null)
                        change({
                          ...content,
                          sections: content.sections.map((s) =>
                            s.id === sec.id ? { ...s, description: value } : s,
                          ),
                        });
                    }}
                  >
                    简介
                  </button>
                  <select
                    aria-label={`将${sec.title}迁移到大章`}
                    value={sec.chapterId}
                    onChange={(event) =>
                      change({
                        ...content,
                        sections: content.sections.map((s) =>
                          s.id === sec.id
                            ? { ...s, chapterId: event.target.value }
                            : s,
                        ),
                      })
                    }
                  >
                    {content.chapters.map((chapter) => (
                      <option key={chapter.id} value={chapter.id}>
                        {chapter.title}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => {
                      if (
                        !window.confirm(
                          `删除小节「${sec.title}」？其中关卡会移入未编排池。`,
                        )
                      )
                        return;
                      change({
                        ...content,
                        sections: content.sections.filter(
                          (s) => s.id !== sec.id,
                        ),
                        placements: content.placements.filter(
                          (p) => p.sectionId !== sec.id,
                        ),
                      });
                    }}
                  >
                    删除
                  </button>
                  <button
                    onClick={() => {
                      const items = content.sections
                          .filter((s) => s.chapterId === selectedChapter)
                          .sort((a, b) => a.order - b.order),
                        i = items.findIndex((s) => s.id === sec.id);
                      if (i <= 0) return;
                      [items[i - 1], items[i]] = [items[i], items[i - 1]];
                      change({
                        ...content,
                        sections: content.sections.map((s) =>
                          items.find((x) => x.id === s.id)
                            ? {
                                ...s,
                                order: items.findIndex((x) => x.id === s.id),
                              }
                            : s,
                        ),
                      });
                    }}
                  >
                    ↑
                  </button>
                </article>
              ))}
          </section>
        </div>
      )}
      {route.page === "arrangement" && (
        <div className="admin-columns">
          <section>
            <h2>选择小节</h2>
            {content.chapters
              .slice()
              .sort((a, b) => a.order - b.order)
              .map((ch) => (
                <div key={ch.id}>
                  <h3>{ch.title}</h3>
                  {content.sections
                    .filter((s) => s.chapterId === ch.id)
                    .sort((a, b) => a.order - b.order)
                    .map((sec) => (
                      <button
                        key={sec.id}
                        aria-pressed={selectedSection === sec.id}
                        onClick={() => setSelectedSection(sec.id)}
                      >
                        {sec.title}
                      </button>
                    ))}
                </div>
              ))}
          </section>
          <section>
            <h2>{currentSection?.title ?? "未选择小节"}</h2>
            {sectionLevels.map((p) => (
              <article key={p.levelId}>
                <span>{getLevel(p.levelId, content)?.title ?? p.levelId}</span>
                <button onClick={() => reorder(p.levelId, -1)}>↑</button>
                <button onClick={() => reorder(p.levelId, 1)}>↓</button>
                <button onClick={() => movePlacement(p.levelId, "")}>
                  移出
                </button>
              </article>
            ))}
            <h3>未编排关卡</h3>
            {displayed
              .filter(
                (l) => !content.placements.some((p) => p.levelId === l.id),
              )
              .map((l) => (
                <article key={l.id}>
                  <LevelThumbnail
                    colors={l.colors}
                    mode={l.mode}
                    radius={l.radius}
                  />
                  <span>
                    {l.title} · {l.mode}
                  </span>
                  <button
                    disabled={!selectedSection}
                    onClick={() => movePlacement(l.id, selectedSection)}
                  >
                    加入本小节
                  </button>
                </article>
              ))}
            {content.placements
              .filter((p) => p.sectionId !== selectedSection)
              .map((p) => (
                <article key={p.levelId}>
                  <span>
                    {getLevel(p.levelId, content)?.title} · 已在其他小节
                  </span>
                  <button
                    disabled={!selectedSection}
                    onClick={() => movePlacement(p.levelId, selectedSection)}
                  >
                    移动到本小节
                  </button>
                </article>
              ))}
          </section>
        </div>
      )}
      {route.page === "levels" && !editing && (
        <section className="admin-list">
          <div className="admin-row">
            <h2>关卡库</h2>
            <button onClick={newLevel}>＋ 新建关卡</button>
            <input
              placeholder="搜索关卡"
              value={levelSearch}
              onChange={(e) => setLevelSearch(e.target.value)}
            />
          </div>
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
              </span>
              <button
                onClick={() =>
                  onNavigate({
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
                onNavigate({
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
                    onClick={() => {
                      setSource("manual");
                      setCandidate(null);
                    }}
                  >
                    手动
                  </button>
                  <button
                    aria-pressed={source === "python"}
                    onClick={() => {
                      setSource("python");
                      setCandidate(null);
                    }}
                  >
                    Python
                  </button>
                  <button
                    aria-pressed={source === "blocks"}
                    onClick={() => {
                      setSource("blocks");
                      setCandidate(null);
                    }}
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
                            setTool("draw");
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
                          updateManual(candidate);
                          setSource("manual");
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
                <button className="admin-primary" onClick={saveLevel}>
                  保存为关卡目标
                </button>
                {level && (
                  <button
                    onClick={() => {
                      if (window.confirm("归档此关卡？历史进度仍保留。"))
                        change({
                          ...content,
                          levels: content.levels.map((l) =>
                            l.id === level.id ? { ...l, archived: true } : l,
                          ),
                        });
                    }}
                  >
                    归档关卡
                  </button>
                )}
              </>
            ) : (
              <p>内置样例在代码中定义。可在编排页放入小节。</p>
            )}
          </section>
          <section className="admin-preview">
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
                tool={source === "manual" ? tool : "pick"}
                onStroke={source === "manual" ? paint : () => {}}
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
                    editLayer={slice}
                  />
                </div>
                <p>
                  左键添加，Shift＋左键染色，右键拖动旋转；可在下方逐层网格修改内部方块。
                </p>
                {source === "manual" && (
                  <PixelPainter
                    colors={sliceColors}
                    radius={8}
                    color={color}
                    tool={tool}
                    onStroke={draw3}
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
          <h2>独立试做</h2>
          <p>在这里检查目标判定，不写入学生代码或通关记录。</p>
          <textarea
            aria-label="试做 Python 代码"
            value={tryCode}
            onChange={(e) => {
              setTryCode(e.target.value);
              setTryResult("");
            }}
          />
          <button
            disabled={runnerStatus !== "ready"}
            onClick={() => void tryLevel()}
          >
            运行试做
          </button>
          {tryResult && <p role="status">{tryResult}</p>}
        </section>
      )}
    </main>
  );
}
