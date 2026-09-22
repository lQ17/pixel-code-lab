import { useEffect, useRef, useState } from 'react'
import type { EditorKind } from '../blocks/model'
import { levels } from '../engine/levels'
import { pixelReferences, pixelReferenceIds, type PixelReferenceId } from '../engine/pixelCreation'
import { getVoxelLevel, voxelRadius, voxelTargetIds, type VoxelLevelId } from '../engine/voxel'
import type { AxisMode } from '../engine/view'
import type { RunnerStatus } from '../runners/types'
import type { useProjectLibrary } from '../hooks/useProjectLibrary'
import type { VoxelControls } from '../hooks/useVoxelControls'

export type MenuKey = 'project' | 'edit' | 'reference' | 'view' | 'run' | 'help' | null

interface WorkspaceMenuBarProps {
  mode: '2d' | '3d'
  isCreation: boolean
  isBlocks: boolean
  status: RunnerStatus
  code: string
  template: string
  blocksError: string
  hasWork: boolean
  isHistorical: boolean
  axisMode: AxisMode
  voxelControls: VoxelControls
  selectedPixelRefId: PixelReferenceId
  selectedVoxelRefId: VoxelLevelId
  levelId: string
  library: ReturnType<typeof useProjectLibrary>
  showOutput: boolean
  showPalette: boolean
  showBlocksCode: boolean
  onToggleOutput: () => void
  onTogglePalette: () => void
  onToggleBlocksCode: () => void
  onRun: () => void
  onStop: () => void
  onRetryRunner: () => void
  onLoadExample?: () => void
  onRestoreTemplate: () => void
  onSwitchEditor?: (editor: EditorKind) => void
  onSelectPixelRef?: (id: PixelReferenceId) => void
  onSelectVoxelRef?: (id: VoxelLevelId) => void
  onSetAxisMode: (mode: AxisMode | ((prev: AxisMode) => AxisMode)) => void
  onResetView: () => void
  onFitBlocks?: () => void
  onOpenLibrary: () => void
  onExportPng: () => void
  onOpenHelp: () => void
  elapsedMs?: number
  voxelCount?: number
}

export function WorkspaceMenuBar({
  mode,
  isCreation,
  isBlocks,
  status,
  code,
  template,
  blocksError,
  hasWork,
  isHistorical,
  axisMode,
  voxelControls,
  selectedPixelRefId,
  selectedVoxelRefId,
  levelId,
  library,
  showOutput,
  showPalette,
  showBlocksCode,
  onToggleOutput,
  onTogglePalette,
  onToggleBlocksCode,
  onRun,
  onStop,
  onRetryRunner,
  onLoadExample,
  onRestoreTemplate,
  onSwitchEditor,
  onSelectPixelRef,
  onSelectVoxelRef,
  onSetAxisMode,
  onResetView,
  onFitBlocks,
  onOpenLibrary,
  onExportPng,
  onOpenHelp,
  elapsedMs,
  voxelCount,
}: WorkspaceMenuBarProps) {
  const [openMenu, setOpenMenu] = useState<MenuKey>(null)
  const menuBarRef = useRef<HTMLDivElement>(null)
  const is3d = mode === '3d'

  // 点击外部和 Escape 自动关闭菜单
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuBarRef.current && !menuBarRef.current.contains(event.target as Node)) {
        setOpenMenu(null)
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpenMenu(null)
      }
    }
    document.addEventListener('pointerdown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  function toggle(menu: MenuKey) {
    setOpenMenu(current => (current === menu ? null : menu))
  }

  function handleAction(action: () => void) {
    action()
    setOpenMenu(null)
  }

  const isClipped = voxelControls.cuts.some(c => c < voxelRadius)
  const canRun = status === 'ready' && (!isBlocks || (!!code && !blocksError))
  const canExportPng = hasWork && !isHistorical && status !== 'running' && (!isBlocks || !blocksError)

  return (
    <nav className="workspace-menubar" ref={menuBarRef} aria-label="工作台菜单栏">
      {/* 作品菜单（仅自由创作） */}
      {isCreation && (
        <div className="menu-group">
          <button
            className={`menu-trigger ${openMenu === 'project' ? 'active' : ''}`}
            aria-haspopup="true"
            aria-expanded={openMenu === 'project'}
            onClick={() => toggle('project')}
          >
            作品 ▾
          </button>
          {openMenu === 'project' && (
            <div className="menu-dropdown" role="menu">
              <button
                role="menuitem"
                disabled={isBlocks && !!blocksError}
                onClick={() =>
                  handleAction(() => {
                    if (library.name.trim()) library.save()
                    else onOpenLibrary()
                  })
                }
              >
                <span>保存作品</span>
                {library.modified && <i className="menu-badge" title="待保存修改">●</i>}
              </button>
              <button role="menuitem" onClick={() => handleAction(onOpenLibrary)}>
                作品库…
              </button>
              <div className="menu-divider" />
              <button
                role="menuitem"
                disabled={!canExportPng}
                title="导出与当前代码一致的完整作品；修改后请重新运行"
                onClick={() => handleAction(onExportPng)}
              >
                导出 PNG
              </button>
            </div>
          )}
        </div>
      )}

      {/* 编辑菜单 */}
      <div className="menu-group">
        <button
          className={`menu-trigger ${openMenu === 'edit' ? 'active' : ''}`}
          aria-haspopup="true"
          aria-expanded={openMenu === 'edit'}
          onClick={() => toggle('edit')}
        >
          编辑 ▾
        </button>
        {openMenu === 'edit' && (
          <div className="menu-dropdown" role="menu">
            {onSwitchEditor && (
              <>
                <div className="menu-section-title">编辑方式</div>
                <button
                  role="menuitemradio"
                  aria-checked={!isBlocks}
                  onClick={() => handleAction(() => onSwitchEditor('python'))}
                >
                  <span>{!isBlocks ? '✓ ' : '  '}Python 代码</span>
                </button>
                <button
                  role="menuitemradio"
                  aria-checked={isBlocks}
                  onClick={() => handleAction(() => onSwitchEditor('blocks'))}
                >
                  <span>{isBlocks ? '✓ ' : '  '}图形积木</span>
                </button>
                {isBlocks && (
                  <>
                    {isCreation && <button
                      role="menuitem"
                      disabled={!code || !!blocksError}
                      onClick={() => handleAction(library.copyPython)}
                    >
                      复制为 Python 作品
                    </button>}
                    <button
                      role="menuitem"
                      aria-checked={showBlocksCode}
                      onClick={() => handleAction(onToggleBlocksCode)}
                    >
                      <span>{showBlocksCode ? '✓ ' : '  '}查看生成的 Python 代码</span>
                    </button>
                  </>
                )}
                <div className="menu-divider" />
              </>
            )}

            {onLoadExample && (
              <button role="menuitem" onClick={() => handleAction(onLoadExample)}>
                载入示例
              </button>
            )}
            <button
              role="menuitem"
              disabled={!isBlocks && code === template}
              onClick={() => handleAction(onRestoreTemplate)}
            >
              {isBlocks ? '恢复初始积木…' : '恢复初始代码…'}
            </button>
            <div className="menu-divider" />
            <button
              role="menuitem"
              aria-checked={showPalette}
              onClick={() => handleAction(onTogglePalette)}
            >
              <span>{showPalette ? '✓ ' : '  '}颜色表（调色板）</span>
            </button>
          </div>
        )}
      </div>

      {/* 参考菜单 */}
      <div className="menu-group">
        <button
          className={`menu-trigger ${openMenu === 'reference' ? 'active' : ''}`}
          aria-haspopup="true"
          aria-expanded={openMenu === 'reference'}
          onClick={() => toggle('reference')}
        >
          参考 ▾
        </button>
        {openMenu === 'reference' && (
          <div className="menu-dropdown" role="menu">
            {isCreation ? (
              <>
                <div className="menu-section-title">选择参考目标</div>
                {is3d
                  ? voxelTargetIds.map(id => (
                      <button
                        key={id}
                        role="menuitemradio"
                        aria-checked={id === selectedVoxelRefId}
                        onClick={() => handleAction(() => onSelectVoxelRef?.(id))}
                      >
                        <span>{id === selectedVoxelRefId ? '✓ ' : '  '}{getVoxelLevel(id).title}</span>
                      </button>
                    ))
                  : pixelReferenceIds.map(id => (
                      <button
                        key={id}
                        role="menuitemradio"
                        aria-checked={id === selectedPixelRefId}
                        onClick={() => handleAction(() => onSelectPixelRef?.(id))}
                      >
                        <span>{id === selectedPixelRefId ? '✓ ' : '  '}{pixelReferences[id].title}</span>
                      </button>
                    ))}
                <div className="menu-divider" />
                <div className="menu-info-item">
                  网格尺寸：{is3d ? '17 × 17 × 17 体素' : '21 × 21 像素'}
                </div>
              </>
            ) : (
              <>
                <div className="menu-section-title">当前挑战信息</div>
                <div className="menu-info-item">
                  目标：{is3d ? getVoxelLevel(selectedVoxelRefId).title : (levels.find(l => l.id === levelId)?.title ?? levelId)}
                </div>
                <div className="menu-info-item">
                  网格尺寸：{is3d ? '17 × 17 × 17 体素' : `${levels.find(l => l.id === levelId)?.radius ? levels.find(l => l.id === levelId)!.radius * 2 + 1 : 11} × ${levels.find(l => l.id === levelId)?.radius ? levels.find(l => l.id === levelId)!.radius * 2 + 1 : 11} 像素`}
                </div>
                <div className="menu-info-item subtle">
                  {is3d ? '三维挑战可通过「编辑」显式载入示例' : '挑战模式不提供参考答案或目标公式'}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* 视图菜单 */}
      <div className="menu-group">
        <button
          className={`menu-trigger ${openMenu === 'view' ? 'active' : ''}`}
          aria-haspopup="true"
          aria-expanded={openMenu === 'view'}
          onClick={() => toggle('view')}
        >
          视图 ▾
        </button>
        {openMenu === 'view' && (
          <div className="menu-dropdown" role="menu">
            {!is3d ? (
              <>
                <button
                  role="menuitem"
                  onClick={() =>
                    handleAction(() => onSetAxisMode(prev => (prev === 'edge' ? 'center' : 'edge')))
                  }
                >
                  坐标系：{axisMode === 'edge' ? '边缘轴（点击切换居中轴）' : '居中轴（点击切换边缘轴）'}
                </button>
                <button role="menuitem" onClick={() => handleAction(onResetView)}>
                  重置视图
                </button>
              </>
            ) : (
              <>
                <button
                  role="menuitem"
                  aria-checked={voxelControls.axes}
                  onClick={() => handleAction(() => voxelControls.setAxes(!voxelControls.axes))}
                >
                  <span>{voxelControls.axes ? '✓ ' : '  '}坐标辅助</span>
                </button>
                <button
                  role="menuitem"
                  aria-checked={voxelControls.showCutHandles}
                  onClick={() =>
                    handleAction(() => voxelControls.setShowCutHandles(!voxelControls.showCutHandles))
                  }
                >
                  <span>{voxelControls.showCutHandles ? '✓ ' : '  '}剖切工具（手柄）</span>
                </button>
                <button
                  role="menuitem"
                  disabled={!isClipped}
                  onClick={() => handleAction(() => voxelControls.setCuts([voxelRadius, voxelRadius, voxelRadius]))}
                >
                  恢复完整模型
                </button>
                <div className="menu-divider" />
                <button
                  role="menuitem"
                  onClick={() => handleAction(() => voxelControls.setView({ yaw: -0.65, pitch: 0.45, zoom: 1 }))}
                >
                  重置视角
                </button>
              </>
            )}

            {isBlocks && onFitBlocks && (
              <>
                <div className="menu-divider" />
                <button role="menuitem" onClick={() => handleAction(onFitBlocks)}>
                  适应积木工作区
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* 运行菜单 */}
      <div className="menu-group">
        <button
          className={`menu-trigger ${openMenu === 'run' ? 'active' : ''} ${status === 'running' ? 'is-running' : ''}`}
          aria-haspopup="true"
          aria-expanded={openMenu === 'run'}
          onClick={() => toggle('run')}
        >
          {status === 'running' ? '运行中… ▾' : '运行 ▾'}
        </button>
        {openMenu === 'run' && (
          <div className="menu-dropdown" role="menu">
            <button
              role="menuitem"
              disabled={!canRun}
              onClick={() => handleAction(onRun)}
            >
              <span>▶ 运行代码</span>
              <kbd>Ctrl+Enter</kbd>
            </button>
            <button
              role="menuitem"
              disabled={status !== 'running'}
              onClick={() => handleAction(onStop)}
            >
              <span>■ 停止运行</span>
            </button>
            {status === 'failed' && (
              <button role="menuitem" onClick={() => handleAction(onRetryRunner)}>
                重试加载 Python
              </button>
            )}
            <div className="menu-divider" />
            <button
              role="menuitem"
              aria-checked={showOutput}
              onClick={() => handleAction(onToggleOutput)}
            >
              <span>{showOutput ? '✓ ' : '  '}程序输出与错误日志</span>
            </button>
            {(elapsedMs !== undefined || voxelCount !== undefined) && (
              <>
                <div className="menu-divider" />
                {elapsedMs !== undefined && (
                  <div className="menu-info-item">上次耗时：{Math.round(elapsedMs)} ms</div>
                )}
                {voxelCount !== undefined && (
                  <div className="menu-info-item">体素总数：{voxelCount}</div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* 帮助菜单 */}
      <div className="menu-group">
        <button
          className={`menu-trigger ${openMenu === 'help' ? 'active' : ''}`}
          aria-haspopup="true"
          aria-expanded={openMenu === 'help'}
          onClick={() => toggle('help')}
        >
          帮助 ▾
        </button>
        {openMenu === 'help' && (
          <div className="menu-dropdown" role="menu">
            <button role="menuitem" onClick={() => handleAction(onOpenHelp)}>
              使用说明…
            </button>
            <div className="menu-divider" />
            <div className="menu-info-item">快捷键：Ctrl+Enter 运行</div>
            <div className="menu-info-item">
              {is3d ? '操作：拖拽旋转视角，滚轮缩放' : '操作：拖拽平移画布，滚轮缩放'}
            </div>
          </div>
        )}
      </div>
    </nav>
  )
}
