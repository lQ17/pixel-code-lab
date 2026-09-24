import { lazy, Suspense, useEffect, useRef, useState, useMemo } from 'react'
import type { BlocksDocument, EditorKind } from '../blocks/model'
import type { BlocksEditorHandle } from '../components/BlocksEditor'
import { HelpDialog } from '../components/HelpDialog'
import { ProjectLibrary } from '../components/ProjectLibrary'
import { PixelMark } from '../components/GameIcons'
import { WorkspaceMenuBar } from '../components/WorkspaceMenuBar'
import { colorNames, levels, palette } from '../engine/levels'
import { pixelReferences, pixelReference, pixelRadius, type PixelReferenceId } from '../engine/pixelCreation'
import { getVoxelLevel, voxelRadius, voxelReference, type VoxelLevelId } from '../engine/voxel'
import type { AxisMode, ViewState } from '../engine/view'
import { initialOrigin, type Origin, type RunnerStatus } from '../runners/types'
import { PixelCanvas } from '../renderers/PixelCanvas'
import { VoxelCanvas } from '../renderers/VoxelCanvas'
import type { ProgressData, SaveState } from '../hooks/useProgress'
import type { useProjectLibrary } from '../hooks/useProjectLibrary'
import type { VoxelControls } from '../hooks/useVoxelControls'
import { evaluate, targetColors } from '../engine/evaluate'
import type { getLevel } from '../engine/content'
import { isVoxelLevelId } from '../engine/voxel'

const BlocksEditor = lazy(() => import('../components/BlocksEditor'))
const CodeEditor = lazy(() => import('../components/CodeEditor'))

export type Work = {
  origin: Origin
  colors: number[]
  score: ReturnType<typeof evaluate> | null
  elapsedMs: number
  source: string
}

interface WorkspacePageProps {
  mode: '2d' | '3d'
  isCreation: boolean
  isBlocks: boolean
  levelId: string
  voxelLevelId: string
  customLevel: ReturnType<typeof getLevel>
  pixelReferenceId: PixelReferenceId
  code: string
  template: string
  blocksDocument: BlocksDocument
  blocksError: string
  error: string
  runtimeError: string
  errorLocation?: { line: number; message: string }
  errorBlock?: string
  logs: string
  status: RunnerStatus
  work?: Work
  isHistorical: boolean
  saveState: SaveState
  storageMessage: string
  retrySave: () => void
  creationRevision: number
  activeId: string
  progress: ProgressData
  library: ReturnType<typeof useProjectLibrary>
  view: ViewState
  axisMode: AxisMode
  voxelControls: VoxelControls
  onBackToStart: () => void
  onRun: () => void
  onStop: () => void
  onRetryRunner: () => void
  onChangeCode: (code: string) => void
  onChangeBlocks: (doc: BlocksDocument) => void
  onSetBlocksError: (err: string) => void
  onSwitchEditor: (editor: EditorKind) => void
  onRestoreTemplate: () => void
  onLoadExample?: () => void
  onSelectPixelRef: (id: PixelReferenceId) => void
  onSelectVoxelRef: (id: VoxelLevelId) => void
  onSetView: React.Dispatch<React.SetStateAction<ViewState>>
  onSetAxisMode: React.Dispatch<React.SetStateAction<AxisMode>>
  showOutput: boolean
  onToggleOutput: () => void
  onCloseOutput: () => void
  onExportPng: () => void
  onUpdateDraftName: (name: string) => void
}

export function WorkspacePage(props: WorkspacePageProps) {
  const {
    mode,
    isCreation,
    isBlocks,
    levelId,
    voxelLevelId,
    customLevel,
    pixelReferenceId,
    code,
    template,
    blocksDocument,
    blocksError,
    error,
    runtimeError,
    errorLocation,
    errorBlock,
    logs,
    status,
    work,
    isHistorical,
    saveState,
    storageMessage,
    retrySave,
    creationRevision,
    activeId,
    progress,
    library,
    view,
    axisMode,
    voxelControls,
    showOutput,
    onToggleOutput,
    onCloseOutput,
    onBackToStart,
    onRun,
    onStop,
    onRetryRunner,
    onChangeCode,
    onChangeBlocks,
    onSetBlocksError,
    onSwitchEditor,
    onRestoreTemplate,
    onLoadExample,
    onSelectPixelRef,
    onSelectVoxelRef,
    onSetView,
    onSetAxisMode,
    onExportPng,
    onUpdateDraftName,
  } = props

  const is3d = mode === '3d'
  const blocksEditorRef = useRef<BlocksEditorHandle>(null)

  // 浮层面板显隐状态
  const [showPalette, setShowPalette] = useState(false)
  const [showBlocksCode, setShowBlocksCode] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const [showLibrary, setShowLibrary] = useState(false)

  // 支持快捷键 Ctrl+Enter 运行
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        if (event.isComposing) return
        const active = document.activeElement
        if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA') && active.closest('.project-modal')) {
          return
        }
        event.preventDefault()
        onRun()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onRun])

  // 当前任务/作品名称
  const activeTitle = useMemo(() => {
    if (is3d) {
      if (isCreation) return library.name || '三维创作草稿'
      return `3D 关卡 · ${customLevel?.title ?? voxelLevelId}`
    } else {
      if (isCreation) return library.name || '二维创作草稿'
      const levelObj = levels.find(l => l.id === levelId)
      return `2D 关卡 · ${customLevel?.title ?? levelObj?.title ?? levelId}`
    }
  }, [is3d, isCreation, library.name, voxelLevelId, levelId, customLevel?.title])

  // 二维目标数据
  const challengeLevel = levels.find(item => item.id === levelId) || levels[0]
  const targetColorsArray = useMemo(() => {
    if (!is3d && isCreation) return pixelReference(pixelReferenceId)
    return customLevel?.mode === '2d' ? customLevel.colors : targetColors(challengeLevel)
  }, [is3d, isCreation, pixelReferenceId, challengeLevel, customLevel])
  const blankColors = useMemo(() => targetColorsArray.map(() => 0), [targetColorsArray])

  // 三维参考数据
  const voxelRefId = isCreation ? ((isBlocks ? progress.voxelBlocks?.referenceId : progress.voxelReferenceId) ?? 'voxel-cube') : (isVoxelLevelId(voxelLevelId) ? voxelLevelId : 'voxel-cube')
  const voxelReferenceColors = useMemo(() => {
    return !isCreation && customLevel?.mode === '3d' ? customLevel.colors : voxelReference(voxelRefId)
  }, [voxelRefId, isCreation, customLevel])

  // 尺寸计算
  const gridSizeLabel = is3d
    ? '17 × 17 × 17'
    : isCreation
      ? `${pixelRadius * 2 + 1} × ${pixelRadius * 2 + 1}`
      : `${(customLevel?.radius ?? challengeLevel.radius) * 2 + 1} × ${(customLevel?.radius ?? challengeLevel.radius) * 2 + 1}`

  const isClipped = voxelControls.cuts.some(c => c < voxelRadius)

  return (
    <main className="arcade workspace-page">
      {/* 极简顶栏 */}
      <header className="workspace-header">
        <div className="header-left">
          <button className="back-start-button" onClick={onBackToStart} title="返回入口页">
            <span aria-hidden="true">←</span> 返回入口
          </button>
          <div className="workspace-identity">
            <PixelMark />
            <h1 title={activeTitle}>{activeTitle}</h1>
            {isCreation && library.modified && (
              <span className="draft-tag" title="有未保存修改">
                待保存
              </span>
            )}
          </div>
        </div>

        <div className="header-right">
          <WorkspaceMenuBar
            mode={mode}
            isCreation={isCreation}
            isBlocks={isBlocks}
            status={status}
            code={code}
            template={template}
            blocksError={blocksError}
            hasWork={!!work}
            isHistorical={isHistorical}
            axisMode={axisMode}
            voxelControls={voxelControls}
            selectedPixelRefId={pixelReferenceId}
            selectedVoxelRefId={voxelRefId}
            levelId={levelId}
            customLevel={customLevel}
            library={library}
            showOutput={showOutput}
            showPalette={showPalette}
            showBlocksCode={showBlocksCode}
            onToggleOutput={onToggleOutput}
            onTogglePalette={() => setShowPalette(v => !v)}
            onToggleBlocksCode={() => setShowBlocksCode(v => !v)}
            onRun={onRun}
            onStop={onStop}
            onRetryRunner={onRetryRunner}
            onLoadExample={onLoadExample}
            onRestoreTemplate={onRestoreTemplate}
            onSwitchEditor={onSwitchEditor}
            onSelectPixelRef={onSelectPixelRef}
            onSelectVoxelRef={onSelectVoxelRef}
            onSetAxisMode={onSetAxisMode}
            onResetView={() => onSetView({ x: 0, y: 0, zoom: 1 })}
            onFitBlocks={() => blocksEditorRef.current?.zoomToFit()}
            onOpenLibrary={() => setShowLibrary(true)}
            onExportPng={onExportPng}
            onOpenHelp={() => setShowHelp(true)}
            elapsedMs={work?.elapsedMs}
            voxelCount={work?.colors?.filter(Boolean).length}
          />
        </div>
      </header>

      {/* Python 加载失败短提示 */}
      {status === 'failed' && (
        <aside className="runner-failed-banner" role="alert">
          <span>Python 运行环境加载失败</span>
          <button onClick={onRetryRunner}>重试加载</button>
        </aside>
      )}

      {/* 工作台三大区域主网格 */}
      <div className="workspace-main-grid">
        {/* 左侧：代码/积木编辑区（约 48%） */}
        <section className="editor-zone game-panel">
          <header className="panel-heading">
            <div>
              <h2>代码 · {isBlocks ? '积木' : 'Python'}</h2>
            </div>
            <span className="tag">{isBlocks ? 'BLOCKS' : 'PYTHON'}</span>
          </header>

          <div className="editor-container">
            <Suspense
              fallback={
                <div className="editor-loading">
                  <PixelMark />
                  <span>正在加载代码编辑器…</span>
                </div>
              }
            >
              {isBlocks ? (
                <BlocksEditor
                  mode={mode}
                  ref={blocksEditorRef}
                  key={`${activeId}-${creationRevision}`}
                  document={blocksDocument}
                  onChange={onChangeBlocks}
                  onError={onSetBlocksError}
                  errorBlock={errorBlock}
                />
              ) : (
                <CodeEditor
                  key={isCreation ? `${activeId}-${creationRevision}` : activeId}
                  value={code}
                  onChange={onChangeCode}
                  error={errorLocation}
                />
              )}
            </Suspense>
          </div>

          <div
            className="storage-status"
            data-testid="storage-status"
            data-save-state={saveState}
            aria-live="polite"
          >
            <span className={saveState === 'error' ? 'save-error' : ''}>
              {saveState === 'saved' ? '' : saveState === 'pending' ? '◇ 正在保存…' : storageMessage}
            </span>
            {saveState === 'error' && <button onClick={retrySave}>重试保存</button>}
          </div>
        </section>

        {/* 右侧：上下双图对照区（约 52%） */}
        <div className="preview-zone">
          {/* 右上：目标图 / 参考图 */}
          <section className="preview-panel game-panel target-panel">
            <header className="panel-heading">
              <div>
                <h2>
                  {isCreation ? '参考图' : '目标图'} ·{' '}
                  {is3d
                    ? (isCreation ? getVoxelLevel(voxelRefId).title : customLevel?.title ?? getVoxelLevel(voxelRefId).title)
                    : isCreation
                      ? pixelReferences[pixelReferenceId].title
                      : customLevel?.title ?? challengeLevel.title}
                </h2>
              </div>
              <div className="heading-tags">
                {is3d && isClipped && <span className="tag clip-tag">剖切中</span>}
                <span className="tag">{gridSizeLabel}</span>
              </div>
            </header>

            <div className="canvas-frame">
              {is3d ? (
                <VoxelCanvas
                  colors={voxelReferenceColors}
                  radius={voxelRadius}
                  controls={voxelControls}
                  label="三维参考图画布"
                />
              ) : (
                <PixelCanvas
                  key={`target-${levelId}`}
                  colors={targetColorsArray}
                  radius={isCreation ? pixelRadius : customLevel?.radius ?? challengeLevel.radius}
                  label="目标图画布"
                  view={view}
                  setView={onSetView}
                  axisMode={axisMode}
                  origin={work?.origin ?? initialOrigin}
                />
              )}
            </div>
          </section>

          {/* 右下：运行结果 */}
          <section
            className={`preview-panel game-panel result-panel ${work?.score?.passed && !isHistorical ? 'is-cleared' : ''}`}
          >
            <header className="panel-heading">
              <div>
                <h2>运行结果</h2>
              </div>
              <div className="heading-tags">
                <span className="tag" data-testid={is3d ? 'voxel-status' : undefined}>
                  {status === 'running'
                    ? is3d
                      ? '生成中…'
                      : '绘制中'
                    : work
                      ? isHistorical
                        ? '历史结果'
                        : is3d
                          ? `${work.colors.filter(Boolean).length} 个体素 · 已生成`
                          : '已生成'
                      : is3d
                        ? '等待运行'
                        : '待运行'}
                </span>
              </div>
            </header>

            <div className="canvas-frame">
              {is3d ? (
                <div className="voxel-result-wrap">
                  <VoxelCanvas
                    colors={work?.colors ?? []}
                    radius={voxelRadius}
                    controls={voxelControls}
                    showControls={false}
                  />
                  {work?.score && (
                    <div
                      className={`voxel-score ${work.score.passed ? 'success' : ''}`}
                      data-testid="voxel-score"
                      aria-live="polite"
                    >
                      <span>{isHistorical ? '历史匹配率' : '匹配率'}</span>
                      <strong>{work.score.percent.toFixed(1)}%</strong>
                      <span>{work.score.passed ? '通关！' : '尚未匹配'}</span>
                      <small>按完整模型判定</small>
                    </div>
                  )}
                </div>
              ) : (
                <div className="pixel-result-wrap">
                  <PixelCanvas
                    key={`work-${levelId}`}
                    colors={work?.colors ?? blankColors}
                    radius={isCreation ? pixelRadius : customLevel?.radius ?? challengeLevel.radius}
                    label="学生作品画布"
                    view={view}
                    setView={onSetView}
                    axisMode={axisMode}
                    origin={work?.origin ?? initialOrigin}
                  />
                  {work?.score && (
                    <div className="board-info result-info">
                      <div className={work.score.passed ? 'clear-emblem' : 'match-emblem'} aria-hidden="true">
                        {work.score.passed ? '★' : '◇'}
                      </div>
                      <div className={`score ${work.score.passed ? 'success' : ''}`} data-testid="score">
                        <span className="micro">匹配率</span>
                        <strong>
                          {work.score.percent.toFixed(1)}
                          <em>%</em>
                        </strong>
                        <span className="score-label">{work.score.passed ? '通关！' : '尚未匹配'}</span>
                        <small>{Math.round(work.elapsedMs)} ms</small>
                      </div>
                      <div className="match-meter" aria-hidden="true">
                        <i style={{ width: `${work.score.percent}%` }} />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {isHistorical && (
              <div className="historical-banner" role="status">
                {!is3d && !isCreation
                  ? '当前显示上次成功运行的结果，请以重新运行为准。'
                  : '当前显示上次成功运行的作品，请重新运行更新。'}
              </div>
            )}
          </section>
        </div>
      </div>

      {/* 浮层 1：程序输出与错误日志 */}
      {showOutput && (
        <aside className="workspace-drawer output-drawer" aria-label="程序输出与错误">
          <header className="drawer-header">
            <h3>程序输出与错误</h3>
            <button className="drawer-close" onClick={onCloseOutput} title="关闭输出面板">
              ✕
            </button>
          </header>
          <div className="drawer-body">
            {(error || runtimeError) && (
              <div className="error" role="alert">
                {error || runtimeError}
              </div>
            )}
            {logs ? (
              <pre className="logs-pre">{logs}</pre>
            ) : (
              !error && !runtimeError && <p className="empty-hint">暂无程序输出。</p>
            )}
          </div>
        </aside>
      )}

      {/* 浮层 2：颜色表（调色板） */}
      {showPalette && (
        <aside className="workspace-drawer palette-drawer" aria-label="颜色表">
          <header className="drawer-header">
            <h3>颜色编号对照表（RETURN 0～8）</h3>
            <button className="drawer-close" onClick={() => setShowPalette(false)} title="关闭颜色表">
              ✕
            </button>
          </header>
          <div className="drawer-body">
            <div className="palette-grid">
              {palette.map((color, index) => (
                <div key={index} className="palette-item" title={`${index} · ${colorNames[index]}`}>
                  <i
                    style={{ background: index === 0 ? 'transparent' : color }}
                    className={index === 0 ? 'empty-color' : ''}
                  />
                  <b>{index}</b>
                  <span>{colorNames[index]}</span>
                  {index === 0 && <small>（空白）</small>}
                </div>
              ))}
            </div>
          </div>
        </aside>
      )}

      {/* 浮层 3：积木生成的 Python 对照 */}
      {showBlocksCode && isBlocks && (
        <aside className="workspace-drawer code-drawer" aria-label="积木生成的 Python 代码">
          <header className="drawer-header">
            <h3>积木生成的 Python 代码（只读）</h3>
            <button className="drawer-close" onClick={() => setShowBlocksCode(false)} title="关闭代码对照">
              ✕
            </button>
          </header>
          <div className="drawer-body">
            <pre aria-label="积木生成的 Python">{code || '请先补齐积木连接。'}</pre>
            {errorLocation && (
              <p className="error-loc">
                第 {errorLocation.line} 行：{errorLocation.message}
              </p>
            )}
          </div>
        </aside>
      )}

      {/* 弹窗：作品库与帮助 */}
      {isCreation && showLibrary && (
        <ProjectLibrary
          library={library}
          onName={name => onUpdateDraftName(name)}
          onClose={() => setShowLibrary(false)}
        />
      )}
      {showHelp && <HelpDialog mode={mode} activity={isCreation ? 'create' : 'challenge'} isBlocks={isBlocks} onClose={() => setShowHelp(false)} />}
    </main>
  )
}
