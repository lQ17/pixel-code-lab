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
import { LevelGlyph, PixelMark } from './components/GameIcons'
import { VoxelCanvas } from './renderers/VoxelCanvas'
import { voxelExamples, voxelRadius, voxelStarter, voxelReference, voxelTargetIds } from './engine/voxel'
import './App.css'

const CodeEditor = lazy(() => import('./components/CodeEditor'))
type Work = { origin: Origin; colors: number[]; percent: number; passed: boolean; elapsedMs: number; source: string }
const labels: Record<RunnerStatus, string> = { loading: '正在加载 Python…', recovering: '正在恢复 Python…', ready: 'Python 已就绪', running: '运行中…', failed: 'Python 加载失败' }

export default function App() {
  const { progress, update, saveState, message, retrySave } = useProgress()
  const { levelId, codes, passed } = progress
  const mode = progress.mode ?? '2d'
  const is3d = mode === '3d'
  const activeId = is3d ? voxelTargetIds[progress.voxelExample ?? 0] : levelId
  const template = is3d ? voxelStarter : starterCode
  const voxelControls = useVoxelControls(voxelRadius)
  const exampleIndex = progress.voxelExample ?? 0
  const reference = useMemo(() => voxelReference(exampleIndex), [exampleIndex])
  const [showHelp, setShowHelp] = useState(!progress.introSeen)
  const [works, setWorks] = useState<Record<string, Work>>({})
  const [status, setStatus] = useState<RunnerStatus>('loading')
  const [runtimeError, setRuntimeError] = useState('')
  const [error, setError] = useState('')
  const [errorLocation, setErrorLocation] = useState<{ line: number; message: string }>()
  const [logs, setLogs] = useState('')
  const [stale, setStale] = useState<Record<string, boolean>>({})
  const [view, setView] = useState(initialView)
  const [axisMode, setAxisMode] = useState<AxisMode>('edge')
  const runner = useRef<PythonRunner | null>(null)
  const generation = useRef(0)
  const latestSource = useRef('')
  useEffect(() => {
    const tickets = generation
    const instance = new PythonRunner((next, detail) => { setStatus(next); setRuntimeError(detail ?? '') })
    runner.current = instance
    return () => { tickets.current++; instance.dispose(); runner.current = null }
  }, [])
  const level = levels.find(item => item.id === levelId)!
  const target = useMemo(() => targetColors(level), [level])
  const blank = useMemo(() => target.map(() => 0), [target])
  const code = is3d ? progress.voxelCode ?? voxelStarter : codes[levelId] ?? starterCode
  useEffect(() => { latestSource.current = code }, [code])
  const work = works[activeId]
  const isHistorical = work && (stale[activeId] || work.source !== code)
  const levelNumber = levels.findIndex(item => item.id === levelId) + 1
  const progressIds = is3d ? voxelTargetIds : levels.map(item => item.id)
  const currentPassed = is3d ? progress.voxelPassed ?? {} : passed
  const completed = progressIds.filter(id => currentPassed[id]).length
  const size = level.radius * 2 + 1

  async function run() {
    if (!runner.current || status !== 'ready') return
    const ticket = ++generation.current
    const selected = activeId
    const source = code
    setError(''); setLogs(''); setErrorLocation(undefined)
    setStale(previous => ({ ...previous, [selected]: true }))
    try {
      const result = await runner.current.run(source, is3d ? voxelRadius : level.radius, mode)
      if (generation.current !== ticket) return
      const score = evaluate(is3d ? reference : target, result.colors)
      setWorks(previous => ({ ...previous, [selected]: { ...score, colors: result.colors, origin: result.origin, elapsedMs: result.elapsedMs, source } }))
      setStale(previous => ({ ...previous, [selected]: false }))
      setLogs(result.logs)
      if (score.passed) update(is3d ? { voxelPassed: { ...progress.voxelPassed, [selected]: true } } : { passed: { ...passed, [selected]: true } }, true)
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
    update(is3d ? { voxelCode: value } : { codes: { ...codes, [levelId]: value } })
    setErrorLocation(undefined)
  }
  function restoreTemplate() {
    if (code === template || !window.confirm('恢复初始代码？当前代码将被替换，历史通关记录会保留。')) return
    generation.current++
    runner.current?.stop()
    update(is3d ? { voxelCode: template } : { codes: { ...codes, [levelId]: template } }, true)
    setError(''); setLogs(''); setErrorLocation(undefined)
  }
  function switchMode(next: '2d' | '3d') {
    if (next === mode) return
    generation.current++
    runner.current?.stop()
    update({ mode: next }, true)
    setError(''); setLogs(''); setErrorLocation(undefined); setShowHelp(false)
  }
  function loadExample(source: string) {
    if (code !== voxelStarter && code !== source && !window.confirm('载入示例将替换当前三维代码，是否继续？')) return
    generation.current++
    runner.current?.stop()
    update({ voxelCode: source, voxelExample: voxelExamples.findIndex(example => example.code === source) }, true)
    setError(''); setLogs(''); setErrorLocation(undefined)
  }
  return <main className="arcade">
    <header className="game-header">
      <div className="brand"><PixelMark/><div><h1>{is3d ? '体素创作实验室' : '像素编程挑战'}</h1></div></div>
      <nav className="mode-switch" aria-label="空间模式"><button aria-pressed={!is3d} onClick={() => switchMode('2d')}>2D 像素挑战</button><button aria-pressed={is3d} onClick={() => switchMode('3d')}>3D 体素创作</button></nav>
      <div className="header-progress"><div className="progress-slots" aria-label={`已通关 ${completed} / ${progressIds.length} 关`}>{progressIds.map(id => <i key={id} className={currentPassed[id] ? 'filled' : ''}/>)}</div><strong>{completed}<em> / {progressIds.length}</em></strong></div>
      {!is3d && <button className="help-button" onClick={() => setShowHelp(true)}><span aria-hidden="true">?</span> 使用说明</button>}
    </header>
    <div className="game-shell">
      {is3d ? <aside className="level-rail voxel-rail"><div className="rail-heading"><span className="micro">VOXEL LAB</span><h2>自由创作</h2><p>从一个想法开始。</p></div><nav aria-label="三维示例">{voxelExamples.map((example, index) => <button className={`level-button ${index === exampleIndex ? 'active' : ''} ${currentPassed[voxelTargetIds[index]] ? 'completed' : ''}`} aria-pressed={index === exampleIndex} key={example.title} onClick={() => loadExample(example.code)}><span className="micro">EXAMPLE 0{index+1}</span><strong>{example.title}</strong><span className="level-bottom">{currentPassed[voxelTargetIds[index]] ? '✓ 已通关 · 载入示例 →' : '载入示例 →'}</span></button>)}</nav><div className="rail-bottom"><p>改变坐标条件，<br/>让想法成为形状。</p></div></aside> : <aside className="level-rail"><div className="rail-heading"><span className="micro">SELECT STAGE</span><h2>选择关卡</h2><p>任务已就绪，选择目标。</p></div>
        <nav aria-label="关卡">{levels.map((item, index) => <button key={item.id} className={`level-button ${item.id === levelId ? 'active' : ''} ${passed[item.id] ? 'completed' : ''}`} aria-pressed={item.id === levelId} onClick={() => switchLevel(item.id)}><span className="level-top"><span className="micro">STAGE 0{index + 1}</span><span aria-hidden="true">{passed[item.id] ? '◆' : '◇'}</span></span><LevelGlyph kind={item.id}/><strong>{item.title}</strong><span className="level-bottom">{passed[item.id] ? '✓ 已通关' : item.id === levelId ? '正在挑战' : '开始挑战'}<b aria-hidden="true">→</b></span></button>)}</nav>
        <div className="rail-bottom"><div className="tiny-pixels" aria-hidden="true"><i/><i/><i/><i/><i/></div></div>
      </aside>}
      <div className="workspace">
        <section className="editor-panel game-panel"><header className="panel-heading"><div><span className="micro">CODE TERMINAL</span><h2>代码工作台</h2></div><span className="tag">PYTHON</span></header>
          <div className="file-tab"><span><i/> {is3d ? 'creation_3d.py' : `challenge_0${levelNumber}.py`}</span><button className="text-button" onClick={restoreTemplate} disabled={code === template}>恢复初始代码</button></div>
          <Suspense fallback={<div className="editor-loading"><PixelMark/><span>正在加载代码编辑器…</span></div>}><CodeEditor key={activeId} value={code} onChange={changeCode} error={errorLocation}/></Suspense>
          <div className="execution-dock"><div className="actions"><button className="run-button" onClick={() => void run()} disabled={status !== 'ready'} aria-label="运行"><span aria-hidden="true">▶</span> 运行代码 <span className="micro">RUN</span></button><button className="stop-button" aria-label="停止" onClick={() => runner.current?.stop()} disabled={status !== 'running'}><span aria-hidden="true">■</span> 停止</button>{status === 'failed' && <button onClick={() => runner.current?.retry()}>重试加载</button>}</div><p className={`runtime-state ${status}`} role="status"><i/>{labels[status]}</p></div>
          <div className="console-output" aria-live="polite">{(error || runtimeError) && <div className="error" role="alert">{error || runtimeError}</div>}{logs && <details open><summary>程序输出（最多 4000 字符）</summary><pre>{logs}</pre></details>}</div>
          <div className="palette-dock"><div className="dock-label"><h2>调色模块</h2><span className="micro">RETURN 0—8</span></div><div className="palette">{palette.map((color, index) => <span key={index} title={`${index} · ${colorNames[index]}`}><i style={{ background: index === 0 ? 'transparent' : color }} className={index === 0 ? 'empty-color' : ''}/><b>{index}</b><em>{colorNames[index]}</em></span>)}</div></div>
          <div className="storage-status" data-testid="storage-status" data-save-state={saveState} aria-live="polite"><span className={saveState === 'error' ? 'save-error' : ''}>{saveState === 'saved' ? '' : saveState === 'pending' ? '◇ 正在保存…' : message}</span>{saveState === 'error' && <button onClick={retrySave}>重试保存</button>}</div>
        </section>
        {is3d ? <div className="voxel-previews">
          <section className="voxel-panel game-panel"><header className="panel-heading"><div><h2>参考图 · {voxelExamples[exampleIndex].title}</h2></div><span className="tag">17 × 17 × 17 · 两图联动</span></header><VoxelCanvas colors={reference} radius={voxelRadius} controls={voxelControls} label="三维参考图画布"/></section>
          <section className={`voxel-panel game-panel ${work?.passed && !isHistorical ? 'is-cleared' : ''}`}><header className="panel-heading"><div><h2>我的作品</h2></div><span className="tag" data-testid="voxel-status">{status === 'running' ? '生成中…' : work ? `${work.colors.filter(Boolean).length} 个体素 · ${isHistorical ? '历史结果' : '已生成'}` : '等待运行'}</span></header><div className="voxel-result-wrap"><VoxelCanvas colors={work?.colors ?? []} radius={voxelRadius} controls={voxelControls} showControls={false}/>{work && <div className={`voxel-score ${work.passed ? 'success' : ''}`} data-testid="voxel-score" aria-live="polite"><span>{isHistorical ? '历史匹配率' : '匹配率'}</span><strong>{work.percent.toFixed(1)}%</strong><span>{work.passed ? '通关！' : '尚未匹配'}</span><small>按完整模型判定</small></div>}</div>{isHistorical && <p className="voxel-history">当前显示上次成功运行的作品，请重新运行更新。</p>}</section>
        </div> : <div className="previews">
          <section className="board-panel game-panel target-panel"><header className="panel-heading"><div><span className="micro">TARGET / 0{levelNumber}</span><h2>目标图 · {level.title}</h2></div><span className="tag">{size} × {size}</span></header><div className="board-body board-body--solo"><PixelCanvas key={`target-${levelId}`} colors={target} radius={level.radius} label="目标图画布" view={view} setView={setView} axisMode={axisMode} origin={work?.origin ?? initialOrigin}/><button className="view-axis-button" aria-label="调整坐标系显示方式" aria-pressed={axisMode === 'center'} title={`坐标系：${axisMode === 'edge' ? '边缘轴' : '居中轴'}，点击切换`} onClick={() => setAxisMode(previous => previous === 'edge' ? 'center' : 'edge')}>坐标系</button><button className="view-reset-button" onClick={() => setView(initialView)}>重置视图</button></div></section>
          <section className={`board-panel game-panel result-panel ${work?.passed && !isHistorical ? 'is-cleared' : ''}`}><header className="panel-heading"><div><span className="micro">YOUR CREATION</span><h2>我的作品</h2></div><span className="tag">{status === 'running' ? '绘制中' : work ? isHistorical ? '历史结果' : '已生成' : '待运行'}</span></header><div className={`board-body result-board-body ${work ? '' : 'board-body--solo'}`}><PixelCanvas key={`work-${levelId}`} colors={work?.colors ?? blank} radius={level.radius} label="学生作品画布" view={view} setView={setView} axisMode={axisMode} origin={work?.origin ?? initialOrigin}/>{work && <div className="board-info result-info"><div className={work.passed ? 'clear-emblem' : 'match-emblem'} aria-hidden="true">{work.passed ? '★' : '◇'}</div><div className={`score ${work.passed ? 'success' : ''}`} data-testid="score"><span className="micro">匹配率</span><strong>{work.percent.toFixed(1)}<em>%</em></strong><span className="score-label">{work.passed ? '通关！' : '尚未匹配'}</span><small>{Math.round(work.elapsedMs)} ms</small></div><div className="match-meter" aria-hidden="true"><i style={{ width: `${work.percent}%` }}/></div>{isHistorical && <p className="historical">当前显示上次成功运行的结果，请以重新运行为准。</p>}</div>}</div></section>
        </div>}
      </div>
    </div>
    <footer className="game-footer"/>
    {showHelp && <HelpDialog onClose={() => { setShowHelp(false); update({ introSeen: true }, true) }}/>}
  </main>
}
