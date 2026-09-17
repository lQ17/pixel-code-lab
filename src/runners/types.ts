export interface ExecutionError { kind: string; message: string; line?: number }
export interface RunResult { colors: number[]; logs: string; elapsedMs: number }
export type RunnerStatus = 'loading' | 'ready' | 'running' | 'recovering' | 'failed'
export type WorkerReply =
  | { type: 'ready' }
  | { type: 'init-error'; message: string }
  | { type: 'result'; id: number; result: RunResult }
  | { type: 'error'; id: number; error: ExecutionError; logs: string }
export type WorkerRequest = { type: 'run'; id: number; code: string; radius: number }
