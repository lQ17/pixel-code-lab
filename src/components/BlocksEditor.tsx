import { useEffect, useRef, useState } from 'react'
import { Blockly, theme, toolbox } from '../blocks/blockly'
import { compileBlocks, maxBlocks, parseBlocks, type BlocksDocument } from '../blocks/model'

function fitWorkspace(ws: Blockly.WorkspaceSvg) {
  ws.zoomToFit()
  if (ws.scale > .85) { ws.setScale(.85); ws.scrollCenter() }
}

export default function BlocksEditor({ document, onChange, onError, errorBlock }: { document: BlocksDocument; onChange: (document: BlocksDocument) => void; errorBlock?: string; onError: (message: string) => void }) {
  const container = useRef<HTMLDivElement>(null)
  const workspace = useRef<Blockly.WorkspaceSvg | null>(null)
  const latest = useRef({ document, onChange, onError })
  const [loadError, setLoadError] = useState('')
  useEffect(() => { latest.current = { document, onChange, onError } }, [document, onChange, onError])
  useEffect(() => {
    const node = container.current!
    const ws = Blockly.inject(node, { toolbox, theme, renderer: 'geras', sounds: false, trashcan: false, maxBlocks,
      zoom: { controls: true, wheel: true, startScale: .75, maxScale: 1.5, minScale: .3, scaleSpeed: 1.15 },
      move: { scrollbars: true, drag: true, wheel: true }, grid: { spacing: 20, length: 2, colour: '#253746', snap: false } })
    workspace.current = ws
    let loaded = false
    try { Blockly.serialization.workspaces.load(parseBlocks(latest.current.document).workspace, ws); loaded = true }
    catch { const message = '积木工作区无法恢复，原草稿已保留。请导出备份后检查文件。'; queueMicrotask(() => { setLoadError(message); latest.current.onError(message) }) }
    function publish(event: Blockly.Events.Abstract) {
      if (!loaded || event.isUiEvent || ws.isDragging()) return
      try {
        const next = parseBlocks({ version: 1, workspace: Blockly.serialization.workspaces.save(ws) })
        setLoadError(''); latest.current.onError('')
        if (JSON.stringify(next) !== JSON.stringify(latest.current.document)) latest.current.onChange(next)
      } catch (error) { const message = error instanceof Error ? error.message : String(error); setLoadError(message); latest.current.onError(message) }
    }
    ws.addChangeListener(publish)
    const resize = new ResizeObserver(() => Blockly.svgResize(ws)); resize.observe(node)
    Blockly.svgResize(ws)
    let disposed = false
    let fit = 0
    void Blockly.renderManagement.finishQueuedRenders().then(() => {
      if (!disposed) fit = requestAnimationFrame(() => { Blockly.svgResize(ws); fitWorkspace(ws) })
    })
    const onResize = () => { Blockly.svgResize(ws); fitWorkspace(ws) }
    window.addEventListener('resize', onResize)
    return () => { disposed = true; window.removeEventListener('resize', onResize); cancelAnimationFrame(fit); resize.disconnect(); ws.removeChangeListener(publish); ws.dispose(); workspace.current = null }
  }, [])
  useEffect(() => {
    const ws = workspace.current
    if (!ws) return
    ws.highlightBlock(errorBlock ?? null)
  }, [errorBlock])
  const issues = compileBlocks(document).issues
  return <div className="blocks-editor-wrap">
    <div ref={container} className="blocks-editor" aria-label="积木编辑区" />
    {(loadError || issues.length > 0) && <p className="blocks-warning" role="alert">{loadError || issues[0].message}</p>}
    <div className="blocks-hint"><span>选中后按 Delete 删除；滚轮缩放。</span><button onClick={() => workspace.current && fitWorkspace(workspace.current)}>适应积木</button></div>
  </div>
}
