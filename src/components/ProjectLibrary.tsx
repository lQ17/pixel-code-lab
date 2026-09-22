import { projectImage, downloadPng } from '../renderers/projectImage'
import type { SpaceMode } from '../runners/types'
import { useEffect, useMemo, useRef } from 'react'
import { maxProjectName } from '../engine/projects'
import type { useProjectLibrary } from '../hooks/useProjectLibrary'

type Library = ReturnType<typeof useProjectLibrary>

function Thumbnail({ preview, mode, name }: { preview?: string; mode: SpaceMode; name: string }) {
  const url = useMemo(() => preview ? projectImage([...preview].map(Number), mode, true).toDataURL() : null, [preview, mode])
  return url ? <img className="project-thumbnail" src={url} alt={`${name}的预览`} /> : <span className="project-thumbnail project-placeholder">待生成预览</span>
}

export function ProjectLibrary({ library, onName, onClose }: { library: Library; onName: (name: string) => void; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const node = dialog.current!
    node.showModal()
    return () => node.close()
  }, [])
  const projects = [...library.projects].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  return <dialog ref={dialog} className="project-dialog" aria-labelledby="project-library-title" onCancel={event => { event.preventDefault(); onClose() }}>
    <header><div><h2 id="project-library-title">本地作品库</h2><p>{library.mode === '2d' ? '二维' : '三维'} Python 作品 · {projects.length} 件</p></div><button onClick={onClose} aria-label="关闭作品库">关闭</button></header>
    <form onSubmit={event => { event.preventDefault(); library.save() }}>
      <label htmlFor="project-name">当前作品名称</label>
      <input id="project-name" value={library.name} onChange={event => onName(event.target.value)} maxLength={maxProjectName} placeholder="为作品起个名字" autoFocus />
      <div className="project-actions"><button type="submit">保存作品</button><button type="button" onClick={() => library.save(true)}>另存为副本</button><button type="button" onClick={() => library.download()}>导出当前作品</button><button type="button" onClick={() => library.open(null)}>新建草稿</button></div>
      <p className="project-hint">编辑会自动保存草稿；点击保存作品更新作品库。打开或新建时，未保存修改可保留为草稿副本。</p>
    </form>
    {library.error && <p className="project-error" role="alert">{library.error}</p>}
    {library.notice && <p className="project-notice" role="status">{library.notice}</p>}
    <div className="project-list-heading"><h3>已保存作品</h3><button disabled={library.importing} onClick={() => input.current?.click()}>{library.importing ? '正在导入…' : '导入作品文件'}</button><input ref={input} type="file" accept=".json,application/json" aria-label="导入作品文件" hidden onChange={event => {
      const file = event.target.files?.[0]
      event.target.value = ''
      if (file) void library.importFile(file)
    }}/></div>
    <ul className="project-list">{projects.map(project => <li key={project.id} data-project-id={project.id}>
      <Thumbnail preview={project.preview} mode={library.mode} name={project.name}/><div className="project-description"><strong>{project.name}</strong><small>{project.editor === 'blocks' ? '积木 · ' : 'Python · '}更新于 {new Date(project.updatedAt).toLocaleString('zh-CN', { hour12: false })}{project.id === library.active?.id ? ' · 当前作品' : ''}</small></div>
      <div className="project-actions"><button onClick={() => library.open(project.id)} aria-label={`打开 ${project.name}`}>打开</button><button onClick={() => library.download(project)} aria-label={`导出 ${project.name}`}>导出</button><button disabled={!project.preview} onClick={() => downloadPng([...project.preview!].map(Number), library.mode, project.name)} aria-label={`导出 PNG ${project.name}`}>PNG</button></div>
    </li>)}</ul>
    {!projects.length && <p className="project-empty">还没有保存的作品。给当前草稿命名后保存，或导入作品文件。</p>}
    <p className="project-hint">作品保存在当前浏览器，可导出 JSON 备份。成功运行后保存可记录缩略图；待生成预览的作品需打开、运行并保存。PNG 为透明背景的完整作品，三维采用固定视角。</p>
  </dialog>
}
