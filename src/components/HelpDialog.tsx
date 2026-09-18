import { useEffect, useRef } from 'react'
import { PixelMark } from './GameIcons'
export function HelpDialog({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const node = dialog.current!
    node.showModal()
    return () => node.close()
  }, [])
  return <dialog ref={dialog} className="help-dialog" aria-labelledby="help-title" onCancel={event => { event.preventDefault(); onClose() }}>
    <PixelMark/><small>任务简报 / MISSION BRIEFING</small><h2 id="help-title">用代码决定每一格的颜色</h2>
    <p>观察右上方的目标图，编写 Python，让下方作品与它完全一致。</p>
    <ol><li>系统会遍历画布的每个整数坐标，调用一次 <code>pixel(x, y)</code>。你无需自己编写遍历循环。</li><li>函数返回 0～8 的整数决定该格颜色；0 表示空白，在画布上显示为深色底格。调色模块始终可见。</li><li>原点默认在中心，x 向右、y 向上。悬停可以查看坐标和颜色；滚轮缩放，拖动画布平移，两图同步。</li><li>可在 <code>pixel()</code> 外调用 <code>move_origin(dx, dy)</code>，相对当前原点移动整数格：正数向右、向上，多次调用会累加。每次运行从默认原点开始，两图坐标同步更新，目标图案保持不变。</li><li>点击运行即可看到作品和匹配率。图案完全一致就通关，三关随时可选。</li></ol>
    <p>代码与通关记录保存在当前浏览器，刷新后可恢复。作品需要重新运行生成；清理浏览器数据会移除存档。</p>
    <button className="active" onClick={onClose}>开始挑战</button>
  </dialog>
}
