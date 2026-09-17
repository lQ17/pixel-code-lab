import type { ExecutionError, RunResult, RunnerStatus, WorkerReply } from './types'

export class RunFailure extends Error {
  detail: ExecutionError
  logs: string
  constructor(detail: ExecutionError, logs = '') {
    super(detail.message)
    this.detail = detail
    this.logs = logs
  }
}

export class PythonRunner {
  private worker?: Worker
  private timer?: ReturnType<typeof setTimeout>
  private initTimer?: ReturnType<typeof setTimeout>
  private nextId = 0
  private pending?: { id: number; resolve: (result: RunResult) => void; reject: (error: RunFailure) => void }
  private status: RunnerStatus = 'loading'
  private onStatus: (status: RunnerStatus, message?: string) => void
  constructor(onStatus: (status: RunnerStatus, message?: string) => void) {
    this.onStatus = onStatus
    this.start(false)
  }
  private update(status: RunnerStatus, message?: string) {
    this.status = status
    this.onStatus(status, message)
  }
  private start(recovering: boolean) {
    this.update(recovering ? 'recovering' : 'loading')
    const worker = new Worker(new URL('./python.worker.ts', import.meta.url), { type: 'module' })
    this.worker = worker
    this.initTimer = setTimeout(() => this.failWorker('Python 加载超时，请检查网络并重试。'), 60_000)
    worker.onmessage = (event: MessageEvent<WorkerReply>) => {
      if (this.worker !== worker) return
      const message = event.data
      if (message.type === 'ready') {
        clearTimeout(this.initTimer)
        this.update('ready')
      } else if (message.type === 'init-error') {
        this.failWorker(message.message)
      } else if (this.pending?.id === message.id) {
        clearTimeout(this.timer)
        const pending = this.pending
        this.pending = undefined
        this.update('ready')
        if (message.type === 'result') pending.resolve(message.result)
        else pending.reject(new RunFailure(message.error, message.logs))
      }
    }
    worker.onerror = (event) => {
      event.preventDefault()
      if (this.worker === worker) this.failWorker('Python 运行环境发生错误，请重新加载运行环境。')
    }
  }
  private failWorker(message: string) {
    this.release()
    this.pending?.reject(new RunFailure({ kind: 'WorkerError', message }))
    this.pending = undefined
    this.update('failed', message)
  }
  private release() {
    clearTimeout(this.timer)
    clearTimeout(this.initTimer)
    this.worker?.terminate()
    this.worker = undefined
  }
  run(code: string, radius: number): Promise<RunResult> {
    if (this.status !== 'ready') return Promise.reject(new RunFailure({ kind: 'NotReady', message: '请等待 Python 就绪。' }))
    if (!Number.isInteger(radius) || radius < 0 || radius > 100) return Promise.reject(new RunFailure({ kind: 'InvalidWorld', message: '关卡范围无效。' }))
    return new Promise((resolve, reject) => {
      const id = ++this.nextId
      this.pending = { id, resolve, reject }
      this.update('running')
      this.timer = setTimeout(() => this.stop('Timeout', '程序运行超过 2 秒，已停止。请检查是否存在死循环。'), 2000)
      this.worker!.postMessage({ type: 'run', id, code, radius })
    })
  }
  stop(kind = 'Cancelled', message = '本次运行已停止。') {
    if (!this.pending) return
    this.release()
    this.pending.reject(new RunFailure({ kind, message }))
    this.pending = undefined
    this.start(true)
  }
  retry() {
    if (this.status !== 'failed') return
    this.release()
    this.start(true)
  }
  dispose() {
    this.release()
    this.pending?.reject(new RunFailure({ kind: 'Cancelled', message: '运行环境已关闭。' }))
    this.pending = undefined
  }
}
