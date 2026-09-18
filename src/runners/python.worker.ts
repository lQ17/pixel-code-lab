import type { PyodideInterface } from 'pyodide'
import executeScript from './execute.py?raw'
import type { WorkerReply, WorkerRequest } from './types'

const send = (message: WorkerReply) => postMessage(message)
let python: PyodideInterface
async function init() {
  try {
    const indexURL = new URL(`${import.meta.env.BASE_URL}pyodide/`, self.location.origin).href
    const { loadPyodide } = await import(/* @vite-ignore */ `${indexURL}pyodide.mjs`)
    python = await loadPyodide({ indexURL, stdin: () => undefined, stdout: () => {}, stderr: () => {} })
    send({ type: 'ready' })
  } catch (error) {
    send({ type: 'init-error', message: `Python 加载失败，请检查网络并重试。${String(error).slice(0, 200)}` })
  }
}
self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const { id, code, radius } = event.data
  if (event.data.type !== 'run' || !python) return
  const started = performance.now()
  const namespace = python.toPy({ _source: code, _radius: radius })
  try {
    const raw = python.runPython(executeScript, { globals: namespace })
    const result = JSON.parse(raw)
    if (result.error) send({ type: 'error', id, error: result.error, logs: result.logs })
    else send({ type: 'result', id, result: { colors: result.colors, origin: result.origin, logs: result.logs, elapsedMs: performance.now() - started } })
  } catch (error) {
    send({ type: 'error', id, error: { kind: 'RuntimeError', message: `Python 执行失败：${String(error).slice(0, 500)}` }, logs: '' })
  } finally {
    namespace.destroy()
  }
}
void init()
