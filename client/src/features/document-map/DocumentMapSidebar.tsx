import type { DocumentMapNode } from '../../reportApi'

type Props = {
  nodes: DocumentMapNode[] | null | undefined
  busy: boolean
  onNavigate: (id: string) => void
}

export function DocumentMapSidebar({ nodes, busy, onNavigate }: Props) {
  if (!nodes || nodes.length === 0) {
    return null
  }

  return (
    <nav className="document-map" aria-labelledby="document-map-heading">
      <h2 id="document-map-heading">Document Map</h2>
      <DocumentMapList nodes={nodes} busy={busy} onNavigate={onNavigate} />
    </nav>
  )
}

type ListProps = {
  nodes: DocumentMapNode[]
  busy: boolean
  onNavigate: (id: string) => void
}

function DocumentMapList({ nodes, busy, onNavigate }: ListProps) {
  return (
    <ul className="document-map-list">
      {nodes.map((node) => (
        <li key={node.id}>
          <button
            type="button"
            className="document-map-node"
            disabled={busy}
            onClick={() => onNavigate(node.id)}
          >
            {node.label}
          </button>
          {node.children?.length > 0 && (
            <DocumentMapList nodes={node.children} busy={busy} onNavigate={onNavigate} />
          )}
        </li>
      ))}
    </ul>
  )
}
