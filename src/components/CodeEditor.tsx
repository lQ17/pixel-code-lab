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
    monaco.editor.defineTheme('mission-terminal', {
      base: 'vs-dark', inherit: true,
      rules: [
        { token: 'keyword', foreground: '67d9e9' },
        { token: 'number', foreground: 'f2be86' },
        { token: 'string', foreground: '8edcbd' },
        { token: 'comment', foreground: '587b91' },
      ],
      colors: {
        'editor.background': '#0c1620', 'editor.foreground': '#c5d9e5',
        'editorLineNumber.foreground': '#3d6078', 'editorLineNumber.activeForeground': '#71cdbd',
        'editor.lineHighlightBackground': '#132530', 'editor.lineHighlightBorder': '#132530',
        'editorCursor.foreground': '#6aefce', 'editor.selectionBackground': '#24546988',
        'editorIndentGuide.background1': '#203645', 'editorIndentGuide.activeBackground1': '#487080',
        'editorWidget.background': '#122330',
      },
    })
    const model = monaco.editor.createModel(latest.current.value, 'python')
    const editor = monaco.editor.create(container.current!, {
      model, theme: 'mission-terminal', automaticLayout: true, minimap: { enabled: false },
      fontSize: 14, lineNumbers: 'on', scrollBeyondLastLine: false,
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
