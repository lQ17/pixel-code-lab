export function LevelGlyph({ kind }: { kind: string }) {
  return <svg className="level-glyph" viewBox="0 0 24 24" aria-hidden="true" shapeRendering="crispEdges">
    {kind === 'square' ? <><path fill="currentColor" d="M4 4h16v16H4z"/><path fill="#ffffff" opacity=".25" d="M4 4h16v3H4z"/></> : kind === 'checkerboard' ? <><path fill="currentColor" d="M3 3h18v18H3z"/><path fill="#111a2b" d="M9 3h6v6H9zM3 9h6v6H3zM15 9h6v6h-6zM9 15h6v6H9z"/></> : <path fill="currentColor" d="M8 2h8v3h4v4h3v6h-3v4h-4v3H8v-3H4v-4H1V9h3V5h4z"/>}
  </svg>
}

export function PixelMark() {
  return <svg className="pixel-mark" viewBox="0 0 32 32" aria-hidden="true" shapeRendering="crispEdges"><path fill="currentColor" d="M4 4h8v8H4zM20 4h8v8h-8zM12 12h8v8h-8zM4 20h8v8H4zM20 20h8v8h-8z"/></svg>
}
