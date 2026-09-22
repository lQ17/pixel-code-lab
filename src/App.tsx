import { compileBlocks, emptyBlocks, type BlocksDocument, type EditorKind } from './blocks/model'
import { blocksExample } from './blocks/examples'
import { defaultPixelId, pixelRadius, pixelReferences, pixelReferenceIds, pixelReference, type PixelReferenceId } from './engine/pixelCreation'
import { downloadPng } from './renderers/projectImage'
import { useVoxelControls } from './hooks/useVoxelControls'
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { levels, palette, colorNames, starterCode } from './engine/levels'
import { evaluate, targetColors } from './engine/evaluate'
import { initialView } from './engine/view'
import type { AxisMode } from './engine/view'
import { PythonRunner, RunFailure } from './runners/PythonRunner'
import { initialOrigin, type Origin, type RunnerStatus } from './runners/types'
import { PixelCanvas } from './renderers/PixelCanvas'
import { useProgress } from './hooks/useProgress'
import { HelpDialog } from './components/HelpDialog'
import { ProjectLibrary } from './components/ProjectLibrary'
import { patchCreationDraft, useProjectLibrary } from './hooks/useProjectLibrary'
import { LevelGlyph, PixelMark } from './components/GameIcons'
import { VoxelCanvas } from './renderers/VoxelCanvas'
import { defaultVoxelId, getVoxelLevel, voxelRadius, voxelStarter, voxelReference, voxelTargetIds, type VoxelLevelId } from './engine/voxel'
import './App.css'

const BlocksEditor = lazy(() => import('./components/BlocksEditor'))
const CodeEditor = lazy(() => import('./components/CodeEditor'))
type Work = { origin: Origin; colors: number[]; score: ReturnType<typeof evaluate> | null; elapsedMs: number; source: string }
const labels: Record<RunnerStatus, string> = { loading: '正在加载 Python…', recovering: '正在恢复 Python…', ready: 'Python 已就绪', running: '运行中…', failed: 'Python 加载失败' }

export default function App() {
  const { progress, update, commit, saveState, message, retrySave } = useProgress()
  const { levelId, codes, passed } = progress
  const mode = progress.mode ?? '2d'
  const is3d = mode === '3d'
  const voxelActivity = progress.voxelActivity ?? 'create'
  const pixelActivity = progress.pixelActivity ?? 'challenge'
  const isCreation = is3d ? voxelActivity === 'create' : pixelActivity === 'create'
  const isBlocks = !is3d && isCreation && progress.pixelEditor === 'blocks'
  const blocksDocument = progress.pixelBlocks?.document ?? emptyBlocks
  const compilation = useMemo(() => compileBlocks(blocksDocument), [blocksDocument])
  const pixelReferenceId = (isBlocks ? progress.pixelBlocks?.referenceId : progress.pixelReferenceId) ?? defaultPixelId
  const selectedPixelReference = pixelReferences[pixelReferenceId]
  const voxelLevelId = progress.voxelLevelId ?? defaultVoxelId
  const activeId = isCreation ? is3d ? 'voxel-creation' : isBlocks ? 'pixel-blocks' : 'pixel-creation' : is3d ? voxelLevelId : levelId
  const template = is3d ? voxelStarter : starterCode
  const voxelControls = useVoxelControls(voxelRadius)
  const referenceId = is3d && isCreation ? progress.voxelReferenceId ?? defaultVoxelId : voxelLevelId
  const selectedVoxelLevel = getVoxelLevel(referenceId)
  const voxelLevelNumber = voxelTargetIds.indexOf(referenceId) + 1
  const reference = useMemo(() => voxelReference(referenceId), [referenceId])
  const [showHelp, setShowHelp] = useState(!progress.introSeen)
  const [showLibrary, setShowLibrary] = useState(false)
  const [creationRevision, setCreationRevision] = useState(0)
  const [works, setWorks] = useState<Record<string, Work>>({})
  const [status, setStatus] = useState<RunnerStatus>('loading')
  const [runtimeError, setRuntimeError] = useState('')
  const [error, setError] = useState('')
  const [errorLocation, setErrorLocation] = useState<{ line: number; message: string }>()
  const [blocksError, setBlocksError] = useState('')
  const [logs, setLogs] = useState('')
  const [stale, setStale] = useState<Record<string, boolean>>({})
  const [view, setView] = useState(initialView)
  const [axisMode, setAxisMode] = useState<AxisMode>('edge')
  const runner = useRef<PythonRunner | null>(null)
  const generation = useRef(0)
  const latestSource = useRef('')
  const library = useProjectLibrary(progress, commit, () => {
    generation.current++
    runner.current?.stop()
    setCreationRevision(value => value + 1)
    setWorks(previous => { const next = { ...previous }; for (const key of mode === '2d' ? ['pixel-creation', 'pixel-blocks'] : ['voxel-creation']) delete next[key]; return next })
    setStale(previous => { const next = { ...previous }; for (const key of mode === '2d' ? ['pixel-creation', 'pixel-blocks'] : ['voxel-creation']) delete next[key]; return next })
    setError(''); setLogs(''); setErrorLocation(undefined); setBlocksError(''); setView(initialView)
  }, mode, works[activeId], isBlocks && blocksError ? `${blocksError} 请先撤销或修正积木，再保存或切换作品。` : '')
  useEffect(() => {
    const tickets = generation
    const instance = new PythonRunner((next, detail) => { setStatus(next); setRuntimeError(detail ?? '') })
    runner.current = instance
    return () => { tickets.current++; instance.dispose(); runner.current = null }
  }, [])
  const challengeLevel = levels.find(item => item.id === levelId)!
  const level = !is3d && isCreation ? { ...selectedPixelReference, id: pixelReferenceId, radius: pixelRadius } : challengeLevel
  const target = useMemo(() => !is3d && isCreation ? pixelReference(pixelReferenceId) : targetColors(challengeLevel), [is3d, isCreation, pixelReferenceId, challengeLevel])
  const blank = useMemo(() => target.map(() => 0), [target])
  const code = isBlocks ? compilation.code : is3d ? (isCreation ? progress.voxelCode : progress.voxelCodes?.[voxelLevelId]) ?? voxelStarter : (isCreation ? progress.pixelCode : codes[levelId]) ?? starterCode
  useEffect(() => { latestSource.current = code }, [code])
  const work = works[activeId]
  const isHistorical = work && (stale[activeId] || work.source !== code)
  const levelNumber = levels.findIndex(item => item.id === levelId) + 1
  const progressIds = is3d ? voxelTargetIds : levels.map(item => item.id)
  const currentPassed = is3d ? progress.voxelPassed ?? {} : passed
  const completed = progressIds.filter(id => currentPassed[id]).length
  const size = level.radius * 2 + 1

  async function run() {
    if (!runner.current || status !== 'ready' || (isBlocks && (!code || blocksError))) return
    const ticket = ++generation.current
    const selected = activeId
    const source = code
    setError(''); setLogs(''); setErrorLocation(undefined)
    setStale(previous => ({ ...previous, [selected]: true }))
    try {
      const result = await runner.current.run(source, is3d ? voxelRadius : level.radius, mode)
      if (generation.current !== ticket) return
      const score = isCreation ? null : evaluate(is3d ? reference : target, result.colors)
      setWorks(previous => ({ ...previous, [selected]: { score, colors: result.colors, origin: result.origin, elapsedMs: result.elapsedMs, source } }))
      setStale(previous => ({ ...previous, [selected]: false }))
      setLogs(result.logs)
      if (score?.passed) update(is3d ? { voxelPassed: { ...progress.voxelPassed, [selected]: true } } : { passed: { ...passed, [selected]: true } }, true)
    } catch (failure) {
      if (generation.current !== ticket) return
      if (failure instanceof RunFailure) {
        const { kind, line, message: detail } = failure.detail
        setError(`${kind}${line ? ` · 第 ${line} 行` : ''}：${detail}${latestSource.current !== source ? '（对应运行时的旧代码）' : ''}`)
        if (line && latestSource.current === source) setErrorLocation({ line, message: detail })
        setLogs(failure.logs)
      } else setError(`执行结果无效：${String(failure)}`)
    }
  }
  function switchLevel(id: string) {
    if (id === levelId) return
    generation.current++
    runner.current?.stop()
    update({ levelId: id }, true)
    setError(''); setLogs(''); setErrorLocation(undefined); setView(initialView)
  }
  function changeCode(value: string) {
    update(codePatch(value))
    setErrorLocation(undefined)
  }
  function codePatch(value: string) {
    return is3d ? isCreation ? { voxelCode: value } : { voxelCodes: { ...progress.voxelCodes, [voxelLevelId]: value } } : isCreation ? { pixelCode: value } : { codes: { ...codes, [levelId]: value } }
  }
  function changeBlocks(document: BlocksDocument) {
    update(patchCreationDraft(progress, '2d', 'blocks', { document }))
    setErrorLocation(undefined)
  }
  function replaceBlocks(document: BlocksDocument) {
    generation.current++; runner.current?.stop()
    update(patchCreationDraft(progress, '2d', 'blocks', { document }), true)
    setCreationRevision(value => value + 1)
    setBlocksError(''); setError(''); setLogs(''); setErrorLocation(undefined)
  }
  function switchEditor(editor: EditorKind) {
    if (isBlocks && blocksError) { setError('请先撤销或修正超出限制的积木，再切换编辑方式或玩法。'); return }
    if ((progress.pixelEditor ?? 'python') === editor) return
    generation.current++; runner.current?.stop()
    update({ pixelEditor: editor }, true)
    library.clearFeedback(); setBlocksError(''); setError(''); setLogs(''); setErrorLocation(undefined)
  }
  function restoreTemplate() {
    if (isBlocks) {
      if (!window.confirm('恢复初始积木？当前积木将被替换。')) return
      replaceBlocks(emptyBlocks); return
    }
    if (code === template || !window.confirm('恢复初始代码？当前代码将被替换，历史通关记录会保留。')) return
    generation.current++
    runner.current?.stop()
    update(codePatch(template), true)
    setError(''); setLogs(''); setErrorLocation(undefined)
  }
  function switchMode(next: '2d' | '3d') {
    if (isBlocks && blocksError) { setError('请先撤销或修正超出限制的积木，再切换编辑方式或玩法。'); return }
    if (next === mode) return
    generation.current++
    runner.current?.stop()
    library.clearFeedback(); setShowLibrary(false)
    update({ mode: next }, true)
    setError(''); setLogs(''); setErrorLocation(undefined); setShowHelp(false)
  }
  function switchVoxelActivity(next: 'challenge' | 'create') {
    if (next === voxelActivity) return
    generation.current++
    runner.current?.stop()
    update({ voxelActivity: next }, true)
    setError(''); setLogs(''); setErrorLocation(undefined)
  }
  function selectVoxelTarget(id: VoxelLevelId) {
    if (id === referenceId) return
    generation.current++
    runner.current?.stop()
    update(isCreation ? { voxelReferenceId: id } : { voxelLevelId: id }, true)
    setError(''); setLogs(''); setErrorLocation(undefined)
  }
  function switchPixelActivity(next: 'challenge' | 'create') {
    if (isBlocks && blocksError) { setError('请先撤销或修正超出限制的积木，再切换编辑方式或玩法。'); return }
    if (next === pixelActivity) return
    generation.current++
    runner.current?.stop()
    update({ pixelActivity: next }, true)
    setError(''); setLogs(''); setErrorLocation(undefined); setView(initialView)
  }
  function selectPixelReference(id: PixelReferenceId) {
    if (id === pixelReferenceId) return
    generation.current++
    runner.current?.stop()
    update(isBlocks ? patchCreationDraft(progress, mode, 'blocks', { referenceId: id }) : { pixelReferenceId: id }, true)
    setError(''); setLogs(''); setErrorLocation(undefined)
  }
  function loadExample() {
    if (isBlocks) {
      if (!window.confirm('载入积木示例将替换当前积木，是否继续？')) return
      replaceBlocks(blocksExample(pixelReferenceId)); return
    }
    const source = is3d ? selectedVoxelLevel.exampleCode : selectedPixelReference.exampleCode
    if (source === undefined) return
    if (code !== template && code !== source && !window.confirm('载入示例将替换当前创作或挑战代码，是否继续？')) return
    generation.current++
    runner.current?.stop()
    update(codePatch(source), true)
    setError(''); setLogs(''); setErrorLocation(undefined)
  }
  return <main className="arcade">
    <header className="game-header">
      <div className="brand"><PixelMark/><div><h1>{is3d ? isCreation ? '体素创作实验室' : '体素编程挑战' : isCreation ? '像素创作实验室' : '像素编程挑战'}</h1></div></div>
      <nav className="mode-switch" aria-label="空间模式"><button aria-pressed={!is3d} onClick={() => switchMode('2d')}>2D 像素</button><button aria-pressed={is3d} onClick={() => switchMode('3d')}>3D 体素</button></nav>
      {!isCreation && <div className="header-progress"><div className="progress-slots" aria-label={`已通关 ${completed} / ${progressIds.length} 关`}>{progressIds.map(id => <i key={id} className={currentPassed[id] ? 'filled' : ''}/>)}</div><strong>{completed}<em> / {progressIds.length}</em></strong></div>}
      {!is3d && !isCreation && <button className="help-button" onClick={() => setShowHelp(true)}><span aria-hidden="true">?</span> 使用说明</button>}
    </header>
    <div className="game-shell">
      {is3d ? <aside className="level-rail voxel-rail">
        <div className="voxel-activity" role="group" aria-label="三维玩法"><button aria-pressed={!isCreation} onClick={() => switchVoxelActivity('challenge')}>挑战</button><button aria-pressed={isCreation} onClick={() => switchVoxelActivity('create')}>自由创作</button></div>
        <nav aria-label={isCreation ? '三维参考模型' : '三维关卡'}>{voxelTargetIds.map(id => <button className={`level-button ${id === referenceId ? 'active' : ''} ${!isCreation && currentPassed[id] ? 'completed' : ''}`} aria-pressed={id === referenceId} key={id} onClick={() => selectVoxelTarget(id)}><strong>{getVoxelLevel(id).title}</strong>{!isCreation && <span className="level-bottom">{currentPassed[id] ? '✓ 已通关' : id === referenceId ? '正在挑战' : '开始挑战'}</span>}</button>)}</nav>
      </aside> : <aside className="level-rail"><div className="voxel-activity" role="group" aria-label="二维玩法"><button aria-pressed={!isCreation} onClick={() => switchPixelActivity('challenge')}>挑战</button><button aria-pressed={isCreation} onClick={() => switchPixelActivity('create')}>自由创作</button></div>{isCreation ? <nav aria-label="二维参考图">{pixelReferenceIds.map(id => <button key={id} className={`level-button ${id === pixelReferenceId ? 'active' : ''}`} aria-pressed={id === pixelReferenceId} onClick={() => selectPixelReference(id)}><strong>{pixelReferences[id].title}</strong></button>)}</nav> : <><div className="rail-heading"><span className="micro">SELECT STAGE</span><h2>选择关卡</h2><p>任务已就绪，选择目标。</p></div>
        <nav aria-label="关卡">{levels.map((item, index) => <button key={item.id} className={`level-button ${item.id === levelId ? 'active' : ''} ${passed[item.id] ? 'completed' : ''}`} aria-pressed={item.id === levelId} onClick={() => switchLevel(item.id)}><span className="level-top"><span className="micro">STAGE 0{index + 1}</span><span aria-hidden="true">{passed[item.id] ? '◆' : '◇'}</span></span><LevelGlyph kind={item.id}/><strong>{item.title}</strong><span className="level-bottom">{passed[item.id] ? '✓ 已通关' : item.id === levelId ? '正在挑战' : '开始挑战'}<b aria-hidden="true">→</b></span></button>)}</nav>
        <div className="rail-bottom"><div className="tiny-pixels" aria-hidden="true"><i/><i/><i/><i/><i/></div></div></>}
      </aside>}
      <div className="workspace">
        <section className="editor-panel game-panel"><header className="panel-heading"><div><span className="micro">CODE TERMINAL</span><h2>代码工作台</h2></div><span className="tag">{isBlocks ? 'BLOCKS → PYTHON' : 'PYTHON'}</span></header>
          {!is3d && isCreation && <div className="editor-switch" role="group" aria-label="编辑方式"><button aria-pressed={!isBlocks} onClick={() => switchEditor('python')}>Python</button><button aria-pressed={isBlocks} onClick={() => switchEditor('blocks')}>积木</button>{isBlocks && <button disabled={!code || !!blocksError} onClick={library.copyPython}>复制为 Python 作品</button>}</div>}
          <div className="file-tab"><span><i/> {is3d ? isCreation ? 'creation_3d.py' : `voxel_0${voxelLevelNumber}.py` : isCreation ? 'creation_2d.py' : `challenge_0${levelNumber}.py`}</span><div className="code-tools">{((is3d && selectedVoxelLevel.exampleCode !== undefined) || (!is3d && isCreation)) && <button className="text-button" onClick={loadExample}>载入示例</button>}<button className="text-button" onClick={restoreTemplate} disabled={!isBlocks && code === template}>{isBlocks ? '恢复初始积木' : '恢复初始代码'}</button></div></div>
          {isCreation && <div className="project-toolbar"><span title={library.name || '未命名草稿'}>{library.name || '未命名草稿'}{library.modified ? ' · 待保存到作品库' : library.active ? ' · 已保存' : ''}</span><div><button disabled={isBlocks && !!blocksError} onClick={() => library.name.trim() ? library.save() : setShowLibrary(true)}>保存作品</button><button onClick={() => setShowLibrary(true)}>作品库</button><button disabled={!work || !!isHistorical || status === 'running' || (isBlocks && !!blocksError)} onClick={() => work && downloadPng(work.colors, mode, library.name)} title="导出与当前代码一致的完整作品；修改后请重新运行">导出 PNG</button></div>{!showLibrary && (library.error || library.notice) && <p role={library.error ? 'alert' : 'status'} className={library.error ? 'project-error' : 'project-notice'}>{library.error || library.notice}</p>}</div>}
          <Suspense fallback={<div className="editor-loading"><PixelMark/><span>正在加载代码编辑器…</span></div>}>{isBlocks ? <BlocksEditor key={`${activeId}-${creationRevision}`} document={blocksDocument} onChange={changeBlocks} onError={setBlocksError} errorBlock={errorLocation ? compilation.lineBlocks[errorLocation.line] : undefined}/> : <CodeEditor key={isCreation ? `${activeId}-${creationRevision}` : activeId} value={code} onChange={changeCode} error={errorLocation}/>}</Suspense>
          {isBlocks && <details className="blocks-python"><summary>查看 Python 代码</summary><pre aria-label="积木生成的 Python">{code || '请先补齐积木连接。'}</pre>{errorLocation && <p>第 {errorLocation.line} 行：{errorLocation.message}</p>}</details>}
          <div className="execution-dock"><div className="actions"><button className="run-button" onClick={() => void run()} disabled={status !== 'ready' || (isBlocks && (!code || !!blocksError))} aria-label="运行"><span aria-hidden="true">▶</span> 运行代码 <span className="micro">RUN</span></button><button className="stop-button" aria-label="停止" onClick={() => runner.current?.stop()} disabled={status !== 'running'}><span aria-hidden="true">■</span> 停止</button>{status === 'failed' && <button onClick={() => runner.current?.retry()}>重试加载</button>}</div><p className={`runtime-state ${status}`} role="status"><i/>{labels[status]}</p></div>
          <div className="console-output" aria-live="polite">{(error || runtimeError) && <div className="error" role="alert">{error || runtimeError}</div>}{logs && <details open><summary>程序输出（最多 4000 字符）</summary><pre>{logs}</pre></details>}</div>
          <div className="palette-dock"><div className="dock-label"><h2>调色模块</h2><span className="micro">RETURN 0—8</span></div><div className="palette">{palette.map((color, index) => <span key={index} title={`${index} · ${colorNames[index]}`}><i style={{ background: index === 0 ? 'transparent' : color }} className={index === 0 ? 'empty-color' : ''}/><b>{index}</b><em>{colorNames[index]}</em></span>)}</div></div>
          <div className="storage-status" data-testid="storage-status" data-save-state={saveState} aria-live="polite"><span className={saveState === 'error' ? 'save-error' : ''}>{saveState === 'saved' ? '' : saveState === 'pending' ? '◇ 正在保存…' : message}</span>{saveState === 'error' && <button onClick={retrySave}>重试保存</button>}</div>
        </section>
        {is3d ? <div className="voxel-previews">
          <section className="voxel-panel game-panel"><header className="panel-heading"><div><h2>{isCreation ? '参考图' : '目标图'} · {selectedVoxelLevel.title}</h2></div><span className="tag">17 × 17 × 17 · 两图联动</span></header><VoxelCanvas colors={reference} radius={voxelRadius} controls={voxelControls} label="三维参考图画布"/></section>
          <section className={`voxel-panel game-panel ${work?.score?.passed && !isHistorical ? 'is-cleared' : ''}`}><header className="panel-heading"><div><h2>我的作品</h2></div><span className="tag" data-testid="voxel-status">{status === 'running' ? '生成中…' : work ? `${work.colors.filter(Boolean).length} 个体素 · ${isHistorical ? '历史结果' : '已生成'}` : '等待运行'}</span></header><div className="voxel-result-wrap"><VoxelCanvas colors={work?.colors ?? []} radius={voxelRadius} controls={voxelControls} showControls={false}/>{work?.score && <div className={`voxel-score ${work.score.passed ? 'success' : ''}`} data-testid="voxel-score" aria-live="polite"><span>{isHistorical ? '历史匹配率' : '匹配率'}</span><strong>{work.score.percent.toFixed(1)}%</strong><span>{work.score.passed ? '通关！' : '尚未匹配'}</span><small>按完整模型判定</small></div>}</div>{isHistorical && <p className="voxel-history">当前显示上次成功运行的作品，请重新运行更新。</p>}</section>
        </div> : <div className="previews">
          <section className="board-panel game-panel target-panel"><header className="panel-heading"><div>{!isCreation && <span className="micro">TARGET / 0{levelNumber}</span>}<h2>{isCreation ? '参考图' : '目标图'} · {level.title}</h2></div><span className="tag">{size} × {size}</span></header><div className="board-body board-body--solo"><PixelCanvas key={`target-${levelId}`} colors={target} radius={level.radius} label="目标图画布" view={view} setView={setView} axisMode={axisMode} origin={work?.origin ?? initialOrigin}/><button className="view-axis-button" aria-label="调整坐标系显示方式" aria-pressed={axisMode === 'center'} title={`坐标系：${axisMode === 'edge' ? '边缘轴' : '居中轴'}，点击切换`} onClick={() => setAxisMode(previous => previous === 'edge' ? 'center' : 'edge')}>坐标系</button><button className="view-reset-button" onClick={() => setView(initialView)}>重置视图</button></div></section>
          <section className={`board-panel game-panel result-panel ${work?.score?.passed && !isHistorical ? 'is-cleared' : ''}`}><header className="panel-heading"><div><span className="micro">YOUR CREATION</span><h2>我的作品</h2></div><span className="tag">{status === 'running' ? '绘制中' : work ? isHistorical ? '历史结果' : '已生成' : '待运行'}</span></header><div className={`board-body result-board-body ${work ? '' : 'board-body--solo'}`}><PixelCanvas key={`work-${levelId}`} colors={work?.colors ?? blank} radius={level.radius} label="学生作品画布" view={view} setView={setView} axisMode={axisMode} origin={work?.origin ?? initialOrigin}/>{work?.score && <div className="board-info result-info"><div className={work.score.passed ? 'clear-emblem' : 'match-emblem'} aria-hidden="true">{work.score.passed ? '★' : '◇'}</div><div className={`score ${work.score.passed ? 'success' : ''}`} data-testid="score"><span className="micro">匹配率</span><strong>{work.score.percent.toFixed(1)}<em>%</em></strong><span className="score-label">{work.score.passed ? '通关！' : '尚未匹配'}</span><small>{Math.round(work.elapsedMs)} ms</small></div><div className="match-meter" aria-hidden="true"><i style={{ width: `${work.score.percent}%` }}/></div>{isHistorical && <p className="historical">当前显示上次成功运行的结果，请以重新运行为准。</p>}</div>}</div>{isCreation && isHistorical && <p className="voxel-history">当前显示上次成功运行的作品，请重新运行更新。</p>}</section>
        </div>}
      </div>
    </div>
    <footer className="game-footer"/>
    {isCreation && showLibrary && <ProjectLibrary library={library} onName={name => update(patchCreationDraft(progress, mode, library.editor, { name }))} onClose={() => setShowLibrary(false)}/>}
    {showHelp && <HelpDialog onClose={() => { setShowHelp(false); update({ introSeen: true }, true) }}/>}
  </main>
}
