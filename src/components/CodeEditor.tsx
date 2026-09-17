import { useEffect, useRef } from 'react'
import * as monaco from 'monaco-editor/editor/editor.api'
import 'monaco-editor/languages/definitions/python/register'
import 'monaco-editor/editor/contrib/find/browser/findController'
import 'monaco-editor/editor/contrib/bracketMatching/browser/bracketMatching'
import EditorWorker from 'monaco-editor/editor/editor.worker?worker'

self.MonacoEnvironment = { getWorker: () => new EditorWorker() }

export default function CodeEditor({ value, onChange, error }: {
  value: string
  onChange: (code: string) => void
  error?: { line: number; message: string }
}) {
  const container = useRef<HTMLDivElement>(null)
  const instance = useRef<monaco.editor.IStandaloneCodeEditor | null>(null)
  const latest = useRef({ value, onChange })
  useEffect(() => { latest.current = { value, onChange } }, [value, onChange])
  useEffect(() => {
    const model = monaco.editor.createModel(latest.current.value, 'python')
    const editor = monaco.editor.create(container.current!, {
      model, theme: 'vs-dark', automaticLayout: true, minimap: { enabled: false },
      fontSize: 15, lineNumbers: 'on', scrollBeyondLastLine: false,
      tabSize: 4, insertSpaces: true, detectIndentation: false,
      ariaLabel: 'Python代码', accessibilitySupport: 'on', editContext: false,
      padding: { top: 16, bottom: 16 }, wordWrap: 'off',
      stickyScroll: { enabled: false }, renderLineHighlight: 'line',
      quickSuggestions: false, wordBasedSuggestions: 'off',
    })
    instance.current = editor
    const subscription = editor.onDidChangeModelContent(() => latest.current.onChange(editor.getValue()))
    return () => { subscription.dispose(); editor.dispose(); model.dispose(); instance.current = null }
  }, [])
  useEffect(() => {
    const editor = instance.current
    if (editor && editor.getValue() !== value) editor.setValue(value)
  }, [value])
  useEffect(() => {
    const editor = instance.current
    const model = editor?.getModel()
    if (!editor || !model) return
    const line = error && Math.min(Math.max(1, error.line), model.getLineCount())
    monaco.editor.setModelMarkers(model, 'python-run', error && line ? [{
      severity: monaco.MarkerSeverity.Error, message: error.message,
      startLineNumber: line, endLineNumber: line, startColumn: 1,
      endColumn: model.getLineMaxColumn(line),
    }] : [])
    if (line) editor.revealLineInCenterIfOutsideViewport(line)
  }, [error])
  return <div ref={container} className="code-editor" />
}
