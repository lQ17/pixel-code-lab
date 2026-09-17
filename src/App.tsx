import { useState } from 'react'
import { levels, palette, colorNames, starterCode } from './engine/levels'
import './App.css'
export default function App() {
  const [levelId, setLevelId] = useState(levels[0].id)
  const [codes, setCodes] = useState<Record<string, string>>({})
  const level = levels.find(item => item.id === levelId)!
  const size = level.radius * 2 + 1
  return <main>
    <header><small>PIXEL CODE LAB · 项目骨架</small><h1>像素编程挑战</h1></header>
    <nav>{levels.map((item, i) => <button key={item.id} className={item.id === levelId ? 'active' : ''} onClick={() => setLevelId(item.id)}>{i + 1}　{item.title}</button>)}</nav>
    <div className="workspace">
      <section><h2>编写 Python</h2><p>系统逐个坐标调用 pixel(x, y)，返回 0 表示空白。</p><textarea aria-label="Python代码" spellCheck={false} value={codes[level.id] ?? starterCode} onChange={e => setCodes({ ...codes, [level.id]: e.target.value })}/><button disabled>运行（待接入 Python）</button><p>当前为初始化骨架，刷新会清除输入。</p><h2>颜色编号</h2><div className="palette">{palette.map((color, i) => <span key={i}><i style={{ background: color }}/>{i} · {colorNames[i]}</span>)}</div></section>
      <div className="previews"><section><h2>目标图 · {level.title}</h2><p>x、y：-{level.radius} ～ {level.radius} · {size}×{size} · 悬停查询单格</p><div className="grid" style={{ gridTemplateColumns: `repeat(${size}, 1fr)` }}>{Array.from({ length: size * size }, (_, i) => { const x = i % size - level.radius; const y = level.radius - Math.floor(i / size); const color = level.target(x, y); return <div key={i} style={{ background: palette[color] }} title={`(${x}, ${y}) · ${color} ${colorNames[color]}`}/> })}</div><p>x 向右，y 向上，原点位于中心。</p></section><section><h2>我的作品</h2><div className="placeholder">等待接入 Python 执行与 Canvas 渲染</div></section></div>
    </div>
  </main>
}
