import { compileBlocks, emptyBlocks, type BlocksDocument, type EditorKind } from './blocks/model'
import { blocksExample } from './blocks/examples'
import { defaultPixelId, pixelRadius, pixelReferences, pixelReference, type PixelReferenceId } from './engine/pixelCreation'
import { downloadPng } from './renderers/projectImage'
import { useVoxelControls } from './hooks/useVoxelControls'
import { useEffect, useMemo, useRef, useState } from 'react'
import { levels, starterCode } from './engine/levels'
import { evaluate, targetColors } from './engine/evaluate'
import { initialView } from './engine/view'
import type { AxisMode } from './engine/view'
import { PythonRunner, RunFailure } from './runners/PythonRunner'
import type { RunnerStatus } from './runners/types'
import { useProgress } from './hooks/useProgress'
import { patchCreationDraft, useProjectLibrary } from './hooks/useProjectLibrary'
import { defaultVoxelId, getVoxelLevel, voxelRadius, voxelStarter, voxelReference, type VoxelLevelId } from './engine/voxel'
import { parseHash, routeToHash, type AppRoute, type Mode, type Activity } from './navigation/route'
import { StartPage } from './pages/StartPage'
import { WorkspacePage, type Work } from './pages/WorkspacePage'
import './App.css'

export default function App() {
  const { progress, update, commit, saveState, message, retrySave } = useProgress()
  const progressRef = useRef(progress)
  useEffect(() => {
    progressRef.current = progress
  }, [progress])

  // 路由状态管理
  const [route, setRoute] = useState<AppRoute>(() => parseHash(window.location.hash, progress))
  const routeRef = useRef(route)
  useEffect(() => {
    routeRef.current = route
  }, [route])

  // 确保初次访问有确定 Hash
  useEffect(() => {
    const currentHash = window.location.hash
    const targetHash = routeToHash(route)
    if (currentHash !== targetHash) {
      window.location.hash = targetHash
    }
  }, [route])

  // 当前活跃上下文属性推导
  const activeMode: Mode = route.mode
  const is3d = activeMode === '3d'
  const activeActivity: Activity = route.activity
  const isCreation = activeActivity === 'create'

  const voxelLevelId: VoxelLevelId =
    route.kind === 'work' && route.mode === '3d' && route.activity === 'challenge'
      ? (route.levelId as VoxelLevelId)
      : (progress.voxelLevelId ?? defaultVoxelId)

  const levelId: string =
    route.kind === 'work' && route.mode === '2d' && route.activity === 'challenge'
      ? route.levelId
      : (progress.levelId ?? 'square')

  const editor = (isCreation ? progress.pixelEditor : progress.pixelChallengeEditors?.[levelId]) ?? 'python'
  const isBlocks = !is3d && editor === 'blocks'
  const blocksDocument = (isCreation ? progress.pixelBlocks?.document : progress.pixelChallengeBlocks?.[levelId]) ?? emptyBlocks
  const compilation = useMemo(() => compileBlocks(blocksDocument), [blocksDocument])
  const pixelReferenceId = (isBlocks && isCreation ? progress.pixelBlocks?.referenceId : progress.pixelReferenceId) ?? defaultPixelId
  const selectedPixelReference = pixelReferences[pixelReferenceId]

  const activeId = isCreation
    ? is3d
      ? 'voxel-creation'
      : isBlocks
        ? 'pixel-blocks'
        : 'pixel-creation'
    : is3d
      ? voxelLevelId
      : isBlocks ? `challenge-blocks-${levelId}` : levelId

  const template = is3d ? voxelStarter : starterCode
  const voxelControls = useVoxelControls(voxelRadius)
  const referenceId = is3d && isCreation ? (progress.voxelReferenceId ?? defaultVoxelId) : voxelLevelId
  const selectedVoxelLevel = getVoxelLevel(referenceId)
  const reference = useMemo(() => voxelReference(referenceId), [referenceId])

  // 会话状态（页面切换不卸载）
  const [creationRevision, setCreationRevision] = useState(0)
  const [works, setWorks] = useState<Record<string, Work>>({})
  const [status, setStatus] = useState<RunnerStatus>('loading')
  const [runtimeError, setRuntimeError] = useState('')
  const [error, setError] = useState('')
  const [errorLocation, setErrorLocation] = useState<{ line: number; message: string }>()
  const [showOutput, setShowOutput] = useState(false)
  const [blocksError, setBlocksError] = useState('')
  const blocksErrorRef = useRef(blocksError)
  useEffect(() => {
    blocksErrorRef.current = blocksError
  }, [blocksError])

  const [logs, setLogs] = useState('')
  const [stale, setStale] = useState<Record<string, boolean>>({})
  const [view, setView] = useState(initialView)
  const [axisMode, setAxisMode] = useState<AxisMode>('edge')
  const runner = useRef<PythonRunner | null>(null)
  const generation = useRef(0)
  const latestSource = useRef('')

  const library = useProjectLibrary(
    progress,
    commit,
    () => {
      generation.current++
      runner.current?.stop()
      setCreationRevision(value => value + 1)
      setWorks(previous => {
        const next = { ...previous }
        for (const key of activeMode === '2d' ? ['pixel-creation', 'pixel-blocks'] : ['voxel-creation']) delete next[key]
        return next
      })
      setStale(previous => {
        const next = { ...previous }
        for (const key of activeMode === '2d' ? ['pixel-creation', 'pixel-blocks'] : ['voxel-creation']) delete next[key]
        return next
      })
      setError('')
      setLogs('')
      setErrorLocation(undefined)
      setBlocksError('')
      setView(initialView)
    },
    activeMode,
    works[activeId],
    isBlocks && blocksError ? `${blocksError} 请先撤销或修正积木，再保存或切换作品。` : ''
  )

  // 初始化 Runner
  useEffect(() => {
    const tickets = generation
    const instance = new PythonRunner((next, detail) => {
      setStatus(next)
      setRuntimeError(detail ?? '')
    })
    runner.current = instance
    return () => {
      tickets.current++
      instance.dispose()
      runner.current = null
    }
  }, [])

  // 监听 Hash 变更（支持前进、后退与外部链接）
  useEffect(() => {
    function onHashChange() {
      // 积木错误拦截
      const currentRoute = routeRef.current
      if (currentRoute.kind === 'work' && currentRoute.mode === '2d') {
        const currentEditor = currentRoute.activity === 'create'
          ? progressRef.current.pixelEditor
          : progressRef.current.pixelChallengeEditors?.[currentRoute.levelId]
        if (currentEditor === 'blocks' && blocksErrorRef.current) {
          window.location.hash = routeToHash(routeRef.current)
          setError('请先撤销或修正超出限制的积木，再离开或切换。')
          return
        }
      }

      generation.current++
      runner.current?.stop()
      const nextRoute = parseHash(window.location.hash, progressRef.current)
      setRoute(nextRoute)
      const targetHash = routeToHash(nextRoute)
      if (window.location.hash !== targetHash) {
        window.location.hash = targetHash
      }
      setError('')
      setLogs('')
      setErrorLocation(undefined)
      setShowOutput(false)

      // 同步当前模式与上下文到本地存档
      if (nextRoute.kind === 'work') {
        if (nextRoute.mode === '3d') {
          if (nextRoute.activity === 'challenge') {
            update({ mode: '3d', voxelActivity: 'challenge', voxelLevelId: nextRoute.levelId as VoxelLevelId }, true)
          } else {
            update({ mode: '3d', voxelActivity: 'create' }, true)
          }
        } else {
          if (nextRoute.activity === 'challenge') {
            update({ mode: '2d', pixelActivity: 'challenge', levelId: nextRoute.levelId }, true)
          } else {
            update({ mode: '2d', pixelActivity: 'create' }, true)
          }
        }
      } else {
        update(
          {
            mode: nextRoute.mode,
            ...(nextRoute.mode === '3d'
              ? { voxelActivity: nextRoute.activity }
              : { pixelActivity: nextRoute.activity }),
          },
          true
        )
      }
    }

    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [update])

  // 统一导航方法
  function navigateTo(next: AppRoute) {
    if (isBlocks && blocksError) {
      setError('请先撤销或修正超出限制的积木，再离开或切换。')
      return
    }
    window.location.hash = routeToHash(next)
  }

  // 目标与当前代码
  const challengeLevel = levels.find(item => item.id === levelId) || levels[0]
  const level = !is3d && isCreation ? { ...selectedPixelReference, id: pixelReferenceId, radius: pixelRadius } : challengeLevel
  const target = useMemo(
    () => (!is3d && isCreation ? pixelReference(pixelReferenceId) : targetColors(challengeLevel)),
    [is3d, isCreation, pixelReferenceId, challengeLevel]
  )

  const code = isBlocks
    ? compilation.code
    : is3d
      ? (isCreation ? progress.voxelCode : progress.voxelCodes?.[voxelLevelId]) ?? voxelStarter
      : (isCreation ? progress.pixelCode : progress.codes[levelId]) ?? starterCode

  useEffect(() => {
    latestSource.current = code
  }, [code])

  const work = works[activeId]
  const isHistorical = work && (stale[activeId] || work.source !== code)

  // 运行执行器
  async function run() {
    if (!runner.current || status !== 'ready' || (isBlocks && (!code || blocksError))) return
    const ticket = ++generation.current
    const selected = activeId
    const source = code
    setError('')
    setLogs('')
    setErrorLocation(undefined)
    setStale(previous => ({ ...previous, [selected]: true }))

    try {
      const result = await runner.current.run(source, is3d ? voxelRadius : level.radius, activeMode)
      if (generation.current !== ticket) return
      const score = isCreation ? null : evaluate(is3d ? reference : target, result.colors)
      setWorks(previous => ({
        ...previous,
        [selected]: {
          score,
          colors: result.colors,
          origin: result.origin,
          elapsedMs: result.elapsedMs,
          source,
        },
      }))
      setStale(previous => ({ ...previous, [selected]: false }))
      setLogs(result.logs)
      if (score?.passed) {
        update(
          is3d
            ? { voxelPassed: { ...progress.voxelPassed, [selected]: true } }
            : { passed: { ...progress.passed, [levelId]: true } },
          true
        )
      }
    } catch (failure) {
      if (generation.current !== ticket) return
      if (failure instanceof RunFailure) {
        const { kind, line, message: detail } = failure.detail
        setError(
          `${kind}${line ? ` · 第 ${line} 行` : ''}：${detail}${
            latestSource.current !== source ? '（对应运行时的旧代码）' : ''
          }`
        )
        if (line && latestSource.current === source) setErrorLocation({ line, message: detail })
        setLogs(failure.logs)
      } else {
        setError(`执行结果无效：${String(failure)}`)
      }
      setShowOutput(true)
    }
  }

  function codePatch(value: string) {
    return is3d
      ? isCreation
        ? { voxelCode: value }
        : { voxelCodes: { ...progress.voxelCodes, [voxelLevelId]: value } }
      : isCreation
        ? { pixelCode: value }
        : { codes: { ...progress.codes, [levelId]: value } }
  }

  function changeCode(value: string) {
    update(codePatch(value))
    setErrorLocation(undefined)
  }

  function changeBlocks(doc: BlocksDocument) {
    update(blocksPatch(doc))
    setErrorLocation(undefined)
  }

  function blocksPatch(doc: BlocksDocument) {
    return isCreation
      ? patchCreationDraft(progress, '2d', 'blocks', { document: doc })
      : { pixelChallengeBlocks: { ...progress.pixelChallengeBlocks, [levelId]: doc } }
  }

  function replaceBlocks(doc: BlocksDocument) {
    generation.current++
    runner.current?.stop()
    update(blocksPatch(doc), true)
    setCreationRevision(value => value + 1)
    setBlocksError('')
    setError('')
    setLogs('')
    setErrorLocation(undefined)
  }

  function switchEditor(nextEditor: EditorKind) {
    if (isBlocks && blocksError) {
      setError('请先撤销或修正超出限制的积木，再切换编辑方式或玩法。')
      return
    }
    if (editor === nextEditor) return
    generation.current++
    runner.current?.stop()
    update(isCreation
      ? { pixelEditor: nextEditor }
      : { pixelChallengeEditors: { ...progress.pixelChallengeEditors, [levelId]: nextEditor } }, true)
    library.clearFeedback()
    setBlocksError('')
    setError('')
    setLogs('')
    setErrorLocation(undefined)
  }

  function restoreTemplate() {
    if (isBlocks) {
      if (!window.confirm('恢复初始积木？当前积木将被替换。')) return
      replaceBlocks(emptyBlocks)
      return
    }
    if (code === template || !window.confirm('恢复初始代码？当前代码将被替换，历史通关记录会保留。')) return
    generation.current++
    runner.current?.stop()
    update(codePatch(template), true)
    setError('')
    setLogs('')
    setErrorLocation(undefined)
  }

  function selectVoxelTarget(id: VoxelLevelId) {
    if (id === referenceId) return
    generation.current++
    runner.current?.stop()
    if (isCreation) {
      update({ voxelReferenceId: id }, true)
    } else {
      navigateTo({ kind: 'work', mode: '3d', activity: 'challenge', levelId: id })
    }
    setError('')
    setLogs('')
    setErrorLocation(undefined)
  }

  function selectPixelReference(id: PixelReferenceId) {
    if (id === pixelReferenceId) return
    generation.current++
    runner.current?.stop()
    update(
      isBlocks
        ? patchCreationDraft(progress, activeMode, 'blocks', { referenceId: id })
        : { pixelReferenceId: id },
      true
    )
    setError('')
    setLogs('')
    setErrorLocation(undefined)
  }

  function loadExample() {
    if (!is3d && !isCreation) return
    if (isBlocks) {
      if (!window.confirm('载入积木示例将替换当前积木，是否继续？')) return
      replaceBlocks(blocksExample(pixelReferenceId))
      return
    }
    const source = is3d ? selectedVoxelLevel.exampleCode : selectedPixelReference.exampleCode
    if (source === undefined) return
    if (code !== template && code !== source && !window.confirm('载入示例将替换当前创作或挑战代码，是否继续？'))
      return
    generation.current++
    runner.current?.stop()
    update(codePatch(source), true)
    setError('')
    setLogs('')
    setErrorLocation(undefined)
  }

  // 渲染分发
  if (route.kind === 'start') {
    return (
      <StartPage
        mode={route.mode}
        activity={route.activity}
        progress={progress}
        saveState={saveState}
        storageMessage={message}
        retrySave={retrySave}
        onSelectMode={nextMode => navigateTo({ kind: 'start', mode: nextMode, activity: route.activity })}
        onSelectActivity={nextActivity =>
          navigateTo({ kind: 'start', mode: route.mode, activity: nextActivity })
        }
        onNavigate={navigateTo}
        onHelpClosed={() => update({ introSeen: true }, true)}
      />
    )
  }

  return (
    <WorkspacePage
      mode={activeMode}
      isCreation={isCreation}
      isBlocks={isBlocks}
      levelId={levelId}
      voxelLevelId={voxelLevelId}
      pixelReferenceId={pixelReferenceId}
      code={code}
      template={template}
      blocksDocument={blocksDocument}
      blocksError={blocksError}
      error={error}
      runtimeError={runtimeError}
      errorLocation={errorLocation}
      errorBlock={isBlocks && errorLocation ? compilation.lineBlocks[errorLocation.line] : undefined}
      logs={logs}
      status={status}
      work={work}
      isHistorical={!!isHistorical}
      saveState={saveState}
      storageMessage={message}
      retrySave={retrySave}
      creationRevision={creationRevision}
      activeId={activeId}
      progress={progress}
      library={library}
      view={view}
      axisMode={axisMode}
      voxelControls={voxelControls}
      showOutput={showOutput}
      onToggleOutput={() => setShowOutput(v => !v)}
      onCloseOutput={() => setShowOutput(false)}
      onBackToStart={() =>
        navigateTo({
          kind: 'start',
          mode: activeMode,
          activity: isCreation ? 'create' : 'challenge',
        })
      }
      onRun={() => void run()}
      onStop={() => runner.current?.stop()}
      onRetryRunner={() => runner.current?.retry()}
      onChangeCode={changeCode}
      onChangeBlocks={changeBlocks}
      onSetBlocksError={setBlocksError}
      onSwitchEditor={switchEditor}
      onRestoreTemplate={restoreTemplate}
      onLoadExample={
        (is3d && selectedVoxelLevel.exampleCode !== undefined) || (!is3d && isCreation)
          ? loadExample
          : undefined
      }
      onSelectPixelRef={selectPixelReference}
      onSelectVoxelRef={selectVoxelTarget}
      onSetView={setView}
      onSetAxisMode={setAxisMode}
      onExportPng={() => {
        if (work) downloadPng(work.colors, activeMode, library.name)
      }}
      onUpdateDraftName={name =>
        update(patchCreationDraft(progress, activeMode, library.editor, { name }))
      }
    />
  )
}
