import { useState } from 'react'
import { LevelGlyph, PixelMark } from '../components/GameIcons'
import { HelpDialog } from '../components/HelpDialog'
import { levels } from '../engine/levels'
import { getVoxelLevel, voxelTargetIds, type VoxelLevelId } from '../engine/voxel'
import type { ProgressData, SaveState } from '../hooks/useProgress'
import { getResumeRoute, type Activity, type AppRoute, type Mode } from '../navigation/route'

interface StartPageProps {
  mode: Mode
  activity: Activity
  progress: ProgressData
  saveState: SaveState
  storageMessage: string
  retrySave: () => void
  onSelectMode: (mode: Mode) => void
  onSelectActivity: (activity: Activity) => void
  onNavigate: (route: AppRoute) => void
  onHelpClosed: () => void
}

export function StartPage({
  mode,
  activity,
  progress,
  saveState,
  storageMessage,
  retrySave,
  onSelectMode,
  onSelectActivity,
  onNavigate,
  onHelpClosed,
}: StartPageProps) {
  const [showHelp, setShowHelp] = useState(false)
  const is3d = mode === '3d'
  const isChallenge = activity === 'challenge'

  // 通关统计
  const challengeIds = is3d ? voxelTargetIds : levels.map(l => l.id)
  const currentPassed = is3d ? (progress.voxelPassed ?? {}) : progress.passed
  const passedCount = challengeIds.filter(id => currentPassed[id]).length
  const totalCount = challengeIds.length

  // 上次工作推导
  const resumeRoute = getResumeRoute(progress)
  const resumeTitle = (() => {
    if (resumeRoute.mode === '3d') {
      if (resumeRoute.activity === 'create') return '3D 体素 · 自由创作'
      const name = getVoxelLevel(resumeRoute.levelId as VoxelLevelId)?.title || resumeRoute.levelId
      return `3D 体素 · 挑战：${name}`
    } else {
      if (resumeRoute.activity === 'create') return '2D 像素 · 自由创作'
      const name = levels.find(l => l.id === resumeRoute.levelId)?.title || resumeRoute.levelId
      return `2D 像素 · 挑战：${name}`
    }
  })()

  return (
    <main className="arcade start-page">
      <header className="game-header">
        <div className="brand">
          <PixelMark />
          <div>
            <h1>Pixel Code Lab</h1>
          </div>
        </div>

        <nav className="mode-switch" aria-label="空间模式">
          <button aria-pressed={!is3d} onClick={() => onSelectMode('2d')}>
            2D 像素
          </button>
          <button aria-pressed={is3d} onClick={() => onSelectMode('3d')}>
            3D 体素
          </button>
        </nav>

        <div className="activity-switch" role="group" aria-label="玩法选择">
          <button aria-pressed={isChallenge} onClick={() => onSelectActivity('challenge')}>
            挑战模式
          </button>
          <button aria-pressed={!isChallenge} onClick={() => onSelectActivity('create')}>
            自由创作
          </button>
        </div>

        <button className="help-button" onClick={() => setShowHelp(true)}>
          <span aria-hidden="true">?</span> 使用说明
        </button>
      </header>

      {/* 存储警告条 */}
      {saveState === 'error' && (
        <aside className="storage-banner error" role="alert">
          <span>存储异常：{storageMessage}</span>
          <button onClick={retrySave}>重试保存</button>
        </aside>
      )}

      <div className="start-shell">
        {/* 顶部快捷操作栏：继续上次工作 */}
        <section className="start-resume-bar">
          <div className="resume-info">
            <span className="micro">RECENT SESSION</span>
            <strong>上次进行：{resumeTitle}</strong>
          </div>
          <button className="resume-action-button" onClick={() => onNavigate(resumeRoute)}>
            继续上次工作 →
          </button>
        </section>

        {isChallenge ? (
          <section className="start-content challenge-view">
            <div className="section-head">
              <div>
                <span className="micro">{is3d ? '3D VOXEL CHALLENGE' : '2D PIXEL CHALLENGE'}</span>
                <h2>{is3d ? '3D 体素编程关卡' : '2D 像素编程关卡'}</h2>
                <p>三关与七关全部开放，编写函数输出图形，匹配目标即可通关。</p>
              </div>
              <div className="start-progress-badge">
                <div className="progress-slots" aria-label={`已通关 ${passedCount} / ${totalCount} 关`}>
                  {challengeIds.map(id => (
                    <i key={id} className={currentPassed[id] ? 'filled' : ''} />
                  ))}
                </div>
                <strong>
                  已通关 {passedCount} <em>/ {totalCount}</em>
                </strong>
              </div>
            </div>

            <div className="start-cards-grid">
              {is3d
                ? voxelTargetIds.map((id, index) => {
                    const level = getVoxelLevel(id)
                    const isPassed = !!currentPassed[id]
                    return (
                      <button
                        key={id}
                        className={`start-card ${isPassed ? 'passed' : ''}`}
                        onClick={() => onNavigate({ kind: 'work', mode: '3d', activity: 'challenge', levelId: id })}
                      >
                        <div className="card-top">
                          <span className="micro">STAGE 0{index + 1}</span>
                          <span className="status-mark" aria-hidden="true">
                            {isPassed ? '✓' : '◇'}
                          </span>
                        </div>
                        <h3>{level.title}</h3>
                        <p className="card-desc">17 × 17 × 17 体素网格</p>
                        <div className="card-bottom">
                          <span>{isPassed ? '已通关 · 再次挑战' : '开始挑战'}</span>
                          <b aria-hidden="true">→</b>
                        </div>
                      </button>
                    )
                  })
                : levels.map((item, index) => {
                    const isPassed = !!progress.passed[item.id]
                    return (
                      <button
                        key={item.id}
                        className={`start-card ${isPassed ? 'passed' : ''}`}
                        onClick={() => onNavigate({ kind: 'work', mode: '2d', activity: 'challenge', levelId: item.id })}
                      >
                        <div className="card-top">
                          <span className="micro">STAGE 0{index + 1}</span>
                          <span className="status-mark" aria-hidden="true">
                            {isPassed ? '✓' : '◇'}
                          </span>
                        </div>
                        <LevelGlyph kind={item.id} />
                        <h3>{item.title}</h3>
                        <p className="card-desc">{item.radius * 2 + 1} × {item.radius * 2 + 1} 像素网格</p>
                        <div className="card-bottom">
                          <span>{isPassed ? '已通关 · 再次挑战' : '开始挑战'}</span>
                          <b aria-hidden="true">→</b>
                        </div>
                      </button>
                    )
                  })}
            </div>
          </section>
        ) : (
          <section className="start-content create-view">
            <div className="section-head">
              <div>
                <span className="micro">{is3d ? '3D VOXEL LAB' : '2D PIXEL LAB'}</span>
                <h2>{is3d ? '3D 体素自由创作' : '2D 像素自由创作'}</h2>
                <p>自由探索编程图形，支持参考模型、本地作品库管理、代码与图片导出。</p>
              </div>
            </div>

            <div className="create-entrance-card">
              <div className="create-hero">
                <PixelMark />
                <div className="create-details">
                  <h3>进入 {is3d ? '3D 体素' : '2D 像素'} 自由创作工作台</h3>
                  <p>
                    {is3d
                      ? '在 17×17×17 三维空间中编写 voxel(x, y, z)，享受正交投影、剖切观察与多面体建模。'
                      : '支持 Python 手写或积木拼装，支持移动原点，自由绘制多彩像素图案。'}
                  </p>
                </div>
              </div>
              <button
                className="start-create-button"
                onClick={() => onNavigate({ kind: 'work', mode, activity: 'create' })}
              >
                进入创作工作台 →
              </button>
            </div>
          </section>
        )}
      </div>

      <footer className="game-footer" />

      {showHelp && (
        <HelpDialog
          mode={mode}
          activity={activity}
          onClose={() => {
            setShowHelp(false)
            onHelpClosed()
          }}
        />
      )}
    </main>
  )
}
