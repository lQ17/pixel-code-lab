import { useState } from 'react'
import { LevelGlyph, PixelMark } from '../components/GameIcons'
import { HelpDialog } from '../components/HelpDialog'
import { levels } from '../engine/levels'
import { getVoxelLevel, voxelTargetIds } from '../engine/voxel'
import type { ProgressData, SaveState } from '../hooks/useProgress'
import { getResumeIssue, getResumeRoute, type Activity, type AppRoute, type Mode } from '../navigation/route'
import { getLevel, visibleLevels, type ContentPackage } from '../engine/content'
import { LevelThumbnail } from '../components/LevelThumbnail'

interface StartPageProps {
  mode: Mode
  activity: Activity
  progress: ProgressData
  content: ContentPackage
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
  content,
  saveState,
  storageMessage,
  retrySave,
  onSelectMode,
  onSelectActivity,
  onNavigate,
  onHelpClosed,
}: StartPageProps) {
  const [showHelp, setShowHelp] = useState(false)
  const [chapterId, setChapterId] = useState<string | null>(null)
  const [sectionId, setSectionId] = useState<string | null>(null)
  const is3d = mode === '3d'
  const isChallenge = activity === 'challenge'

  // 通关统计
  const challengeIds = is3d ? voxelTargetIds : levels.map(l => l.id)
  const currentPassed = is3d ? (progress.voxelPassed ?? {}) : progress.passed
  const passedCount = challengeIds.filter(id => currentPassed[id]).length
  const totalCount = challengeIds.length
  const nextChallengeId = challengeIds.find(id => !currentPassed[id]) ?? challengeIds[0]

  // 上次工作推导
  const resumeRoute = getResumeRoute(progress)
  const resumeIssue = getResumeIssue(progress, content)
  const resumeTitle = (() => {
    if (resumeRoute.mode === '3d') {
      if (resumeRoute.activity === 'create') return '3D 体素 · 自由创作'
      const name = getLevel(resumeRoute.levelId, content)?.title || resumeRoute.levelId
      return `3D 体素 · 挑战：${name}`
    } else {
      if (resumeRoute.activity === 'create') return '2D 像素 · 自由创作'
      const name = getLevel(resumeRoute.levelId, content)?.title || resumeRoute.levelId
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

        <button className="help-button" onClick={() => onNavigate({ kind: 'admin', mode: '2d', activity: 'challenge', page: 'levels' })}>内容管理</button>
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
            <strong>上次进行：{resumeIssue ? '关卡暂不可用' : resumeTitle}</strong>
            {resumeIssue && <span role="status" className="resume-issue">{resumeIssue}请从课程目录选择关卡，原有代码和通关记录会保留。</span>}
          </div>
          <button className="resume-action-button" onClick={() => { if (resumeIssue) { setChapterId(null); setSectionId(null); onNavigate({ kind: 'start', mode: resumeRoute.mode, activity: 'challenge' }) } else onNavigate(resumeRoute) }}>
            <img src="/ui/resume-path.png" alt="" />
            <span>{resumeIssue ? '返回课程目录 →' : '继续上次工作 →'}</span>
          </button>
        </section>

        {isChallenge ? (
          <section className="start-content challenge-view">
            {content.chapters.length > 0 && <div className="course-catalog">
              <div className="section-head"><h2>课程目录</h2><span className="micro">章节 → 小节 → 关卡</span></div>
              <nav className="course-breadcrumb" aria-label="当前位置"><button onClick={() => { setChapterId(null); setSectionId(null) }}>课程目录</button>{chapterId && <><span> / </span><button onClick={() => setSectionId(null)}>{content.chapters.find(c => c.id === chapterId)?.title}</button></>}{sectionId && <><span> / </span><span>{content.sections.find(s => s.id === sectionId)?.title}</span></>}</nav>
              {!chapterId && content.chapters.filter(c => !c.archived).slice().sort((a,b) => a.order-b.order).map(chapter => <button className="start-card" key={chapter.id} onClick={() => { setChapterId(chapter.id); setSectionId(null) }}><h3>{chapter.title}</h3><p>{chapter.description}</p><span>进入章节 →</span></button>)}
              {chapterId && <><button onClick={() => { setChapterId(null); setSectionId(null) }}>← 全部章节</button><h3>{content.chapters.find(c => c.id === chapterId)?.title}</h3></>}
              {chapterId && !sectionId && content.sections.filter(s => s.chapterId === chapterId && !s.archived).sort((a,b) => a.order-b.order).map(section => <button className="start-card" key={section.id} onClick={() => setSectionId(section.id)}><h3>{section.title}</h3><p>{section.description}</p><span>选择关卡 →</span></button>)}
              {sectionId && <><button onClick={() => setSectionId(null)}>← 返回小节</button><h3>{content.sections.find(s => s.id === sectionId)?.title}</h3><div className="start-cards-grid">{visibleLevels(content, sectionId).filter(level => level.mode === mode).map(level => <button className="start-card" key={level.id} onClick={() => onNavigate({ kind: 'work', mode: level.mode, activity: 'challenge', levelId: level.id })}><LevelThumbnail colors={level.colors} mode={level.mode} radius={level.radius} /><h3>{level.title}</h3><p>{level.description}</p><span>{(level.mode === '3d' ? progress.voxelPassed : progress.passed)?.[level.id] ? '已通关' : '开始挑战'} →</span></button>)}</div></>}
            </div>}
            <div className="section-head challenge-head">
              <div className="challenge-intro">
                <span className="micro">{is3d ? '3D VOXEL CHALLENGE' : '2D PIXEL CHALLENGE'}</span>
                <h2>{is3d ? '3D 体素样例关卡' : '2D 像素样例关卡'}</h2>
                <p>{is3d ? '七关' : '三关'}全部开放。编写函数绘出目标，开启下一段像素冒险。</p>
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
              <button
                className="start-art-button challenge-art-button"
                onClick={() => onNavigate({ kind: 'work', mode, activity: 'challenge', levelId: nextChallengeId })}
              >
                <img src="/ui/challenge-portal.png" alt="" />
                <span>开始挑战 →</span>
              </button>
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

            <button
              className="start-art-button create-entrance-card"
              onClick={() => onNavigate({ kind: 'work', mode, activity: 'create' })}
            >
              <img src="/ui/create-toolbox.png" alt="" />
              <span>进入创作工作台 →</span>
            </button>
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
