import { useEffect, useRef } from 'react'
import { PixelMark } from './GameIcons'

export function HelpDialog({ mode, activity, isBlocks = false, onClose }: {
  mode: '2d' | '3d'
  activity: 'challenge' | 'create'
  isBlocks?: boolean
  onClose: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const is3d = mode === '3d'
  const isChallenge = activity === 'challenge'
  useEffect(() => {
    const node = dialog.current!
    node.showModal()
    return () => node.close()
  }, [])
  return <dialog ref={dialog} className="help-dialog" aria-labelledby="help-title" onCancel={event => { event.preventDefault(); onClose() }}>
    <PixelMark /><small>使用说明 / QUICK GUIDE</small>
    <h2 id="help-title">用{isBlocks ? '积木' : '代码'}决定每{is3d ? '个体素' : '一格'}的颜色</h2>
    <p>{isChallenge
      ? '观察右上方的目标图，让下方运行结果与它完全一致。'
      : '右上方是创作参考，下方是你的作品。自由创作不计算匹配率，可以自由发挥。'}</p>
    <ol>
      <li>系统遍历每个整数坐标，调用一次 <code>{is3d ? 'voxel(x, y, z)' : 'pixel(x, y)'}</code>。你无需自己编写遍历循环。{isBlocks && `在「决定${is3d ? '体素' : '像素'}颜色」入口中拼接判断和返回颜色积木。`}</li>
      <li>返回 0～8 的整数决定颜色；0 表示空白，7 为白色，8 为黑色。通过「编辑 → 颜色表（调色板）」查看完整对照。</li>
      <li>{is3d
        ? '空间坐标为 -8～8，采用右手坐标系：XY 是水平面，Z 正方向向上。拖动旋转、滚轮缩放，悬停查看坐标与颜色；两图同步。「视图 → 剖切工具」可观察内部，剖切不改变作品或判定。'
        : '原点默认在中心，x 向右、y 向上。悬停查看坐标与颜色；滚轮缩放、拖动画布平移，两图同步。'}</li>
      {!is3d && !isBlocks && <li>可在 <code>pixel()</code> 外调用 <code>move_origin(dx, dy)</code> 相对移动原点：正数向右、向上，多次调用累加。每次运行从默认原点开始，目标图案保持不变。</li>}
      {isBlocks && <li>通过「编辑」切换 Python 或查看自己积木生成的 Python。两种方式的草稿独立保存，切换不会自动转换或覆盖内容。</li>}
      <li>通过「运行 → 运行代码」或 Ctrl+Enter 执行程序。{isChallenge
        ? '完整图形与目标完全一致即可通关；所有关卡均开放，不自动跳关，之后的尝试不撤销历史通关。'
        : '通过「作品」菜单保存命名作品、打开作品库和导出 PNG。修改后的作品需要成功运行后才能导出当前图像。'}</li>
      {(is3d || !isChallenge) && <li>选择参考与载入示例是分开的操作；「编辑 → 载入示例」才会替换当前内容。</li>}
    </ol>
    <p>草稿与通关记录保存在当前浏览器，刷新后可恢复，工作区图像需重新运行。清理浏览器数据会移除存档；自由创作可在作品库导出 JSON 备份。</p>
    <button className="active" onClick={onClose}>知道了</button>
  </dialog>
}
