import { useEffect, useMemo, useRef, useState } from "react";
import { compileBlocks, emptyBlocksFor, type BlocksDocument, type EditorKind } from "../blocks/model";
import { draftKey, getLevel, loadContent, type ContentPackage } from "../engine/content";
import { evaluate } from "../engine/evaluate";
import { starterCode } from "../engine/levels";
import { defaultPixelId } from "../engine/pixelCreation";
import { voxelRadius, voxelStarter } from "../engine/voxel";
import { initialView, type AxisMode } from "../engine/view";
import { useProjectLibrary } from "../hooks/useProjectLibrary";
import { useVoxelControls } from "../hooks/useVoxelControls";
import { parseProgress, type useProgress } from "../hooks/useProgress";
import type { AppRoute } from "../navigation/route";
import { downloadPng } from "../renderers/projectImage";
import { PythonRunner, RunFailure } from "../runners/PythonRunner";
import type { RunnerStatus } from "../runners/types";
import { WorkspacePage, type Work } from "./WorkspacePage";

export function AdminPreviewPage({ levelId, onNavigate }: { levelId: string; onNavigate: (route: AppRoute) => void }) {
  const [content] = useState<ContentPackage | null>(() => { try { return loadContent(draftKey); } catch { return null; } });
  const level = content ? getLevel(levelId, content) : null;
  const levelAvailable = !!level;
  const mode = level?.mode ?? "2d";
  const template = mode === "3d" ? voxelStarter : starterCode;
  const [editor, setEditor] = useState<EditorKind>("python");
  const [pythonCode, setPythonCode] = useState(template);
  const [blocks, setBlocks] = useState<BlocksDocument>(() => emptyBlocksFor(mode));
  const [blocksError, setBlocksError] = useState("");
  const compiled = useMemo(() => compileBlocks(blocks), [blocks]);
  const code = editor === "blocks" ? compiled.code : pythonCode;
  const [work, setWork] = useState<Work>();
  const [status, setStatus] = useState<RunnerStatus>("loading");
  const [runtimeError, setRuntimeError] = useState("");
  const [error, setError] = useState("");
  const [errorLocation, setErrorLocation] = useState<{ line: number; message: string }>();
  const [logs, setLogs] = useState("");
  const [showOutput, setShowOutput] = useState(false);
  const [view, setView] = useState(initialView);
  const [axisMode, setAxisMode] = useState<AxisMode>("edge");
  const voxelControls = useVoxelControls(voxelRadius);
  const runner = useRef<PythonRunner | null>(null);
  const ticket = useRef(0);
  const latestCode = useRef(code);
  useEffect(() => { latestCode.current = code; }, [code]);
  const [previewProgress] = useState(() => parseProgress(null));
  const library = useProjectLibrary(previewProgress, (() => false) as ReturnType<typeof useProgress>["commit"], () => {}, mode);

  useEffect(() => {
    if (!levelAvailable) return;
    const ticketRef = ticket;
    const runnerRef = runner;
    const instance = new PythonRunner((next, detail) => { setStatus(next); setRuntimeError(detail ?? ""); });
    runnerRef.current = instance;
    return () => { ticketRef.current++; instance.dispose(); runnerRef.current = null; };
  }, [levelId, levelAvailable]);

  function back() {
    ticket.current++;
    runner.current?.stop();
    onNavigate({ kind: "admin", mode: "2d", activity: "challenge", page: "levels", levelId });
  }
  async function run() {
    if (!level || !runner.current || status !== "ready" || (editor === "blocks" && (!code || blocksError))) return;
    const current = ++ticket.current;
    const source = code;
    setError(""); setErrorLocation(undefined); setLogs("");
    try {
      const result = await runner.current.run(source, level.radius, level.mode);
      if (current !== ticket.current) return;
      setWork({ origin: result.origin, colors: result.colors, score: evaluate(level.colors, result.colors), elapsedMs: result.elapsedMs, source });
      setLogs(result.logs);
    } catch (failure) {
      if (current !== ticket.current) return;
      if (failure instanceof RunFailure) {
        const { kind, line, message } = failure.detail;
        setError(`${kind}${line ? ` · 第 ${line} 行` : ""}：${message}${latestCode.current !== source ? "（对应运行时的旧代码）" : ""}`);
        if (line && latestCode.current === source) setErrorLocation({ line, message });
        setLogs(failure.logs);
      } else setError(`执行结果无效：${String(failure)}`);
      setShowOutput(true);
    }
  }
  function stop() { ticket.current++; runner.current?.stop(); }
  function switchEditor(next: EditorKind) {
    if (editor === "blocks" && blocksError) { setError("请先修正积木，再切换编辑方式。"); return; }
    if (next === editor) return;
    stop(); setEditor(next); setWork(undefined); setError(""); setErrorLocation(undefined); setLogs(""); setBlocksError("");
  }
  function restoreTemplate() {
    if (editor === "blocks") setBlocks(emptyBlocksFor(mode));
    else setPythonCode(template);
    stop(); setWork(undefined); setError(""); setErrorLocation(undefined);
  }
  if (!level) return <main className="admin-page"><h1>无法试做此关卡</h1><p>管理草稿中找不到该关卡，或管理内容无法读取。</p><button onClick={back}>返回关卡库</button></main>;
  return <WorkspacePage
    preview mode={mode} isCreation={false} isBlocks={editor === "blocks"}
    levelId={mode === "2d" ? levelId : "square"} voxelLevelId={mode === "3d" ? levelId : "voxel-cube"}
    customLevel={level} pixelReferenceId={defaultPixelId} code={code} template={template}
    blocksDocument={blocks} blocksError={blocksError} error={error} runtimeError={runtimeError}
    errorLocation={errorLocation} errorBlock={editor === "blocks" && errorLocation ? compiled.lineBlocks[errorLocation.line] : undefined}
    logs={logs} status={status} work={work} isHistorical={!!work && work.source !== code}
    saveState="saved" storageMessage="" retrySave={() => {}} creationRevision={0} activeId={`admin-preview-${levelId}-${editor}`}
    progress={previewProgress} library={library} view={view} axisMode={axisMode} voxelControls={voxelControls}
    showOutput={showOutput} onToggleOutput={() => setShowOutput((value) => !value)} onCloseOutput={() => setShowOutput(false)}
    onBackToStart={back} onRun={() => void run()} onStop={stop} onRetryRunner={() => runner.current?.retry()}
    onChangeCode={(value) => { setPythonCode(value); setErrorLocation(undefined); }}
    onChangeBlocks={(value) => { setBlocks(value); setErrorLocation(undefined); }} onSetBlocksError={setBlocksError}
    onSwitchEditor={switchEditor} onRestoreTemplate={restoreTemplate}
    onSelectPixelRef={() => {}} onSelectVoxelRef={() => {}}
    onSetView={setView} onSetAxisMode={setAxisMode}
    onExportPng={() => { if (work) downloadPng(work.colors, mode, level.title); }} onUpdateDraftName={() => {}}
  />;
}
