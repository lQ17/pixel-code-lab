import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { levels, palette, colorNames, starterCode } from './engine/levels'
import { evaluate, targetColors } from './engine/evaluate'
import { initialView, zoomView } from './engine/view'
import { PythonRunner, RunFailure } from './runners/PythonRunner'
import type { RunnerStatus } from './runners/types'
import { PixelCanvas } from './renderers/PixelCanvas'
import { useProgress } from './hooks/useProgress'
import { HelpDialog } from './components/HelpDialog'
import './App.css'

const CodeEditor = lazy(() => import('./components/CodeEditor'))
type Work = { colors: number[]; percent: number; passed: boolean; elapsedMs: number; source: string }
const labels: Record<RunnerStatus, string> = { loading: '正在加载 Python…', recovering: '正在恢复 Python…', ready: 'Python 已就绪', running: '运行中…', failed: 'Python 加载失败' }

export default function App() {
  const { progress, update, saveState, message, retrySave } = useProgress()
  const { levelId, codes, passed } = progress
  const [showHelp, setShowHelp] = useState(!progress.introSeen)
  const [works, setWorks] = useState<Record<string, Work>>({})
  const [status, setStatus] = useState<RunnerStatus>('loading')
  const [runtimeError, setRuntimeError] = useState('')
  const [error, setError] = useState('')
  const [errorLocation, setErrorLocation] = useState<{ line: number; message: string }>()
  const [logs, setLogs] = useState('')
  const [stale, setStale] = useState<Record<string, boolean>>({})
  const [view, setView] = useState(initialView)
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
  const code = codes[levelId] ?? starterCode
  useEffect(() => { latestSource.current = code }, [code])
  const work = works[levelId]
  const isHistorical = work && (stale[levelId] || work.source !== code)

  async function run() {
    if (!runner.current || status !== 'ready') return
    const ticket = ++generation.current
    const selected = level.id
    const source = code
    setError(''); setLogs(''); setErrorLocation(undefined)
    setStale(previous => ({ ...previous, [selected]: true }))
    try {
      const result = await runner.current.run(source, level.radius)
      if (generation.current !== ticket) return
      const score = evaluate(target, result.colors)
      setWorks(previous => ({ ...previous, [selected]: { ...score, colors: result.colors, elapsedMs: result.elapsedMs, source } }))
      setStale(previous => ({ ...previous, [selected]: false }))
      setLogs(result.logs)
      if (score.passed) update({ passed: { ...passed, [selected]: true } }, true)
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
    update({ codes: { ...codes, [levelId]: value } })
    setErrorLocation(undefined)
  }
  function restoreTemplate() {
    if (code === starterCode || !window.confirm('恢复本关初始代码？当前代码将被替换，历史通关记录会保留。')) return
    generation.current++
    runner.current?.stop()
    update({ codes: { ...codes, [levelId]: starterCode } }, true)
    setError(''); setLogs(''); setErrorLocation(undefined)
  }
  return <main>
    <header className="page-header"><div><small>PIXEL CODE LAB · PYTHON / 2D</small><h1>像素编程挑战</h1></div><button onClick={() => setShowHelp(true)}>使用说明</button></header>
    <nav aria-label="关卡">{levels.map((item, i) => <button key={item.id} className={item.id === levelId ? 'active' : ''} aria-pressed={item.id === levelId} onClick={() => switchLevel(item.id)}>{i + 1}　{item.title}{passed[item.id] ? ' ✓ 已通关' : ''}</button>)}</nav>
    <div className="workspace">
      <section className="editor-panel"><h2>编写 Python</h2><p>系统逐个坐标调用 pixel(x, y)，返回 0 表示空白。</p>
        <Suspense fallback={<div className="editor-loading">正在加载代码编辑器…</div>}><CodeEditor key={levelId} value={code} onChange={changeCode} error={errorLocation}/></Suspense>
        <div className="actions"><button className="active" onClick={() => void run()} disabled={status !== 'ready'}>运行</button><button onClick={() => runner.current?.stop()} disabled={status !== 'running'}>停止</button><button onClick={restoreTemplate} disabled={code === starterCode}>恢复初始代码</button>{status === 'failed' && <button onClick={() => runner.current?.retry()}>重试加载</button>}</div>
        <p role="status">{labels[status]}</p>
        {(error || runtimeError) && <div className="error" role="alert">{error || runtimeError}</div>}
        {logs && <details open><summary>程序输出（最多 4000 字符）</summary><pre>{logs}</pre></details>}
        <div className="storage-status" data-testid="storage-status" aria-live="polite">{saveState === 'saved' ? '已保存到当前浏览器' : saveState === 'pending' ? '正在保存…' : message}{saveState === 'error' && <button onClick={retrySave}>重试保存</button>}</div>
        <p className="storage-note">代码与通关记录自动保存，作品需重新运行生成。</p><h2>颜色编号</h2><div className="palette">{palette.map((color, i) => <span key={i}><i style={{ background: color }}/>{i} · {colorNames[i]}</span>)}</div>
      </section>
      <div className="previews"><div className="view-toolbar"><span>两图联动 · {Math.round(view.zoom * 100)}%</span><div className="actions"><button aria-label="缩小视图" onClick={() => setView(previous => zoomView(previous, previous.zoom / 1.25))} disabled={view.zoom <= 1}>−</button><button aria-label="放大视图" onClick={() => setView(previous => zoomView(previous, previous.zoom * 1.25))} disabled={view.zoom >= 8}>＋</button><button onClick={() => setView(initialView)}>重置视图</button></div></div>
        <section><h2>目标图 · {level.title}</h2><p>x、y：-{level.radius} ～ {level.radius} · {level.radius * 2 + 1}×{level.radius * 2 + 1}</p><PixelCanvas key={`target-${levelId}`} colors={target} radius={level.radius} label="目标图画布" view={view} setView={setView}/><p>原点位于中心。灰色为空，白色为编号 7。</p></section>
        <section><h2>我的作品</h2>{work ? <><div className={work.passed ? 'score success' : 'score'} data-testid="score">匹配率 {work.percent.toFixed(1)}% · {work.passed ? '通关！' : '尚未匹配'} · {Math.round(work.elapsedMs)} ms</div>{isHistorical && <p className="historical">当前显示上次成功运行的结果，请以重新运行为准。</p>}</> : <p>点击运行生成作品。此处空白画布尚未参与判定。</p>}<PixelCanvas key={`work-${levelId}`} colors={work?.colors ?? blank} radius={level.radius} label="学生作品画布" view={view} setView={setView}/></section>
      </div>
    </div>
    {showHelp && <HelpDialog onClose={() => { setShowHelp(false); update({ introSeen: true }, true) }}/ >}
  </main>
}
