import { useCallback, useEffect, useRef, useState } from 'react'
import { levels } from '../engine/levels'

export const STORAGE_KEY = 'pixel-code-lab.progress'
export interface Progress {
  schemaVersion: 1
  codes: Record<string, string>
  passed: Record<string, boolean>
  levelId: string
  introSeen: boolean
  mode?: '2d' | '3d'
  voxelCode?: string
}
const empty = (): Progress => ({ schemaVersion: 1, codes: {}, passed: {}, levelId: levels[0].id, introSeen: false })
export function parseProgress(raw: string | null): Progress {
  if (raw === null) return empty()
  const value: unknown = JSON.parse(raw)
  if (!value || typeof value !== 'object') throw new Error('无效存档')
  const data = value as Record<string, unknown>
  if (data.schemaVersion !== 1 || typeof data.introSeen !== 'boolean' || !levels.some(level => level.id === data.levelId)) throw new Error('不支持的存档格式')
  if (!data.codes || typeof data.codes !== 'object' || Array.isArray(data.codes) || !data.passed || typeof data.passed !== 'object' || Array.isArray(data.passed)) throw new Error('无效进度')
  const codes: Record<string, string> = {}, passed: Record<string, boolean> = {}
  for (const level of levels) {
    const code = (data.codes as Record<string, unknown>)[level.id]
    const done = (data.passed as Record<string, unknown>)[level.id]
    if (code !== undefined && typeof code !== 'string') throw new Error('无效代码')
    if (done !== undefined && typeof done !== 'boolean') throw new Error('无效通关记录')
    if (typeof code === 'string') codes[level.id] = code
    if (typeof done === 'boolean') passed[level.id] = done
  }
  if (data.mode !== undefined && data.mode !== '2d' && data.mode !== '3d') throw new Error('无效模式')
  if (data.voxelCode !== undefined && typeof data.voxelCode !== 'string') throw new Error('无效三维代码')
  return { schemaVersion: 1, codes, passed, levelId: data.levelId as string, introSeen: data.introSeen, mode: data.mode as Progress['mode'], voxelCode: data.voxelCode as string | undefined }
}
function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    try { return { progress: parseProgress(raw), blocked: false, message: '' } }
    catch { return { progress: empty(), blocked: true, message: '本地存档损坏或版本不兼容，原存档已保留。当前进度暂未保存。' } }
  } catch {
    return { progress: empty(), blocked: false, message: '无法读取本地存储，当前进度可能无法保存。' }
  }
}
export function useProgress() {
  const [initial] = useState(load)
  const [progress, setProgress] = useState(initial.progress)
  const [message, setMessage] = useState(initial.message)
  const [saveState, setSaveState] = useState<'saved' | 'pending' | 'error'>(initial.message ? 'error' : 'saved')
  const current = useRef(initial.progress)
  const blocked = useRef(initial.blocked)
  const dirty = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const flush = useCallback(() => {
    clearTimeout(timer.current)
    if (!dirty.current || blocked.current) return
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(current.current))
      dirty.current = false
      setSaveState('saved'); setMessage('')
    } catch {
      setSaveState('error')
      setMessage('保存失败：浏览器存储不可用或空间不足。当前代码仍在页面中，请勿刷新。')
    }
  }, [])
  const update = useCallback((patch: Partial<Omit<Progress, 'schemaVersion'>>, immediate = false) => {
    current.current = { ...current.current, ...patch }
    setProgress(current.current)
    dirty.current = true
    clearTimeout(timer.current)
    if (blocked.current) return
    setSaveState('pending')
    if (immediate) flush()
    else timer.current = setTimeout(flush, 300)
  }, [flush])
  useEffect(() => {
    const onVisibility = () => { if (document.visibilityState === 'hidden') flush() }
    window.addEventListener('pagehide', flush)
    window.addEventListener('beforeunload', flush)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      flush()
      window.removeEventListener('pagehide', flush)
      window.removeEventListener('beforeunload', flush)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [flush])
  function retrySave() {
    if (blocked.current && !window.confirm('用当前页面进度覆盖无法读取的旧存档？此操作无法撤销。')) return
    blocked.current = false
    dirty.current = true
    flush()
  }
  return { progress, update, saveState, message, retrySave }
}
