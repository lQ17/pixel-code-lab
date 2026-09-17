import { copyFile, mkdir } from 'node:fs/promises'
const files = ['pyodide.mjs', 'pyodide.asm.mjs', 'pyodide.asm.wasm', 'python_stdlib.zip', 'pyodide-lock.json']
await mkdir(new URL('../public/pyodide/', import.meta.url), { recursive: true })
for (const file of files) await copyFile(new URL(`../node_modules/pyodide/${file}`, import.meta.url), new URL(`../public/pyodide/${file}`, import.meta.url))
console.log('Python runtime assets ready.')
