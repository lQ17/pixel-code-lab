import { useEffect, useMemo, useRef, useState } from 'react'
import { levels, palette, colorNames, starterCode } from './engine/levels'
import { evaluate, targetColors } from './engine/evaluate'
import { PythonRunner, RunFailure } from './runners/PythonRunner'
import type { RunnerStatus } from './runners/types'
import { PixelCanvas } from './renderers/PixelCanvas'
import './App.css'

type Work = { colors: number[]; percent: number; passed: boolean; elapsedMs: number; source: string }
const labels: Record<RunnerStatus, string> = { loading: '正在加载 Python…', recovering: '正在恢复 Python…', ready: 'Python 已就绪', running: '运行中…', failed: 'Python 加载失败' }

export default function App() {
  const [levelId, setLevelId] = useState(levels[0].id)
  const [codes, setCodes] = useState<Record<string, string>>({})
  const [works, setWorks] = useState<Record<string, Work>>({})
  const [passed, setPassed] = useState<Record<string, boolean>>({})
  const [status, setStatus] = useState<RunnerStatus>('loading')
  const [runtimeError, setRuntimeError] = useState('')
  const [error, setError] = useState('')
  const [logs, setLogs] = useState('')
  const [stale, setStale] = useState<Record<string, boolean>>({})
  const runner = useRef<PythonRunner | null>(null)
  const generation = useRef(0)
  useEffect(() => {
    const tickets = generation
    const instance = new PythonRunner((next, message) => { setStatus(next); setRuntimeError(message ?? '') })
    runner.current = instance
    return () => { tickets.current++; instance.dispose(); runner.current = null }
  }, [])
  const level = levels.find(item => item.id === levelId)!
  const target = useMemo(() => targetColors(level), [level])
  const code = codes[levelId] ?? starterCode
  const work = works[levelId]
  const isHistorical = work && (stale[levelId] || work.source !== code)
  async function run() {
    if (!runner.current || status !== 'ready') return
    const ticket = ++generation.current
    const selected = level.id
    const source = code
    setError(''); setLogs('')
    setStale(previous => ({ ...previous, [selected]: true }))
    try {
      const result = await runner.current.run(source, level.radius)
      if (generation.current !== ticket) return
      const score = evaluate(target, result.colors)
      setWorks(previous => ({ ...previous, [selected]: { ...score, colors: result.colors, elapsedMs: result.elapsedMs, source } }))
      setStale(previous => ({ ...previous, [selected]: false }))
      setLogs(result.logs)
      if (score.passed) setPassed(previous => ({ ...previous, [selected]: true }))
    } catch (failure) {
      if (generation.current !== ticket) return
      if (failure instanceof RunFailure) {
        const { kind, line, message } = failure.detail
        setError(`${kind}${line ? ` · 第 ${line} 行` : ''}：${message}`)
        setLogs(failure.logs)
      } else setError(`执行结果无效：${String(failure)}`)
    }
  }
  function switchLevel(id: string) {
    if (id === levelId) return
    generation.current++
    runner.current?.stop()
    setLevelId(id); setError(''); setLogs('')
  }
  return <main>
    <header><small>PIXEL CODE LAB · PYTHON / 2D</small><h1>像素编程挑战</h1></header>
    <nav aria-label="关卡">{levels.map((item, i) => <button key={item.id} className={item.id === levelId ? 'active' : ''} onClick={() => switchLevel(item.id)}>{i + 1}　{item.title}{passed[item.id] ? ' ✓ 已通关' : ''}</button>)}</nav>
    <div className="workspace">
      <section><h2>编写 Python</h2><p>系统逐个坐标调用 pixel(x, y)，返回 0 表示空白。</p><textarea aria-label="Python代码" spellCheck={false} value={code} onChange={event => setCodes({ ...codes, [levelId]: event.target.value })} onKeyDown={event => {
        if (event.key !== 'Tab') return
        event.preventDefault()
        const input = event.currentTarget
        const start = input.selectionStart, end = input.selectionEnd
        setCodes({ ...codes, [levelId]: code.slice(0, start) + '    ' + code.slice(end) })
        requestAnimationFrame(() => { input.selectionStart = input.selectionEnd = start + 4 })
      }}/>
        <div className="actions"><button className="active" onClick={() => void run()} disabled={status !== 'ready'}>运行</button><button onClick={() => runner.current?.stop()} disabled={status !== 'running'}>停止</button>{status === 'failed' && <button onClick={() => runner.current?.retry()}>重试加载</button>}</div>
        <p role="status">{labels[status]}</p>
        {(error || runtimeError) && <div className="error" role="alert">{error || runtimeError}</div>}
        {logs && <details open><summary>程序输出（最多 4000 字符）</summary><pre>{logs}</pre></details>}
        <p className="notice">本阶段尚未接入本地保存，刷新会清除代码和通关记录。</p><h2>颜色编号</h2><div className="palette">{palette.map((color, i) => <span key={i}><i style={{ background: color }}/>{i} · {colorNames[i]}</span>)}</div></section>
      <div className="previews"><section><h2>目标图 · {level.title}</h2><p>x、y：-{level.radius} ～ {level.radius} · {level.radius * 2 + 1}×{level.radius * 2 + 1}</p><PixelCanvas colors={target} radius={level.radius} label="目标图画布"/><p>x 向右，y 向上，原点位于中心。灰色为空，白色为编号 7。</p></section>
        <section><h2>我的作品</h2>{work ? <><div className={work.passed ? 'score success' : 'score'} data-testid="score">匹配率 {work.percent.toFixed(1)}% · {work.passed ? '通关！' : '尚未匹配'} · {Math.round(work.elapsedMs)} ms</div>{isHistorical && <p className="historical">当前显示上次成功运行的结果，请以重新运行为准。</p>}<PixelCanvas colors={work.colors} radius={level.radius} label="学生作品画布"/></> : <div className="placeholder">编写代码后点击运行，作品会显示在这里。</div>}</section></div>
    </div>
  </main>
}
