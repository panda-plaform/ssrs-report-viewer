import { useState } from 'react'
import type { DocumentMapNode } from '../../shared/api/sessionTypes'

type Props = {
  nodes: DocumentMapNode[] | null | undefined
  busy: boolean
  currentNodeId?: string | null
  onNavigate: (id: string) => void
}

export function DocumentMapSidebar({ nodes, busy, currentNodeId, onNavigate }: Props) {
  if (!nodes || nodes.length === 0) {
    return null
  }

  return (
    <nav className="document-map" aria-labelledby="document-map-heading">
      <h2 id="document-map-heading">Document Map</h2>
      <DocumentMapList
        nodes={nodes}
        busy={busy}
        currentNodeId={currentNodeId}
        onNavigate={onNavigate}
      />
    </nav>
  )
}

type ListProps = {
  nodes: DocumentMapNode[]
  busy: boolean
  currentNodeId?: string | null
  onNavigate: (id: string) => void
}

function DocumentMapList({ nodes, busy, currentNodeId, onNavigate }: ListProps) {
  return (
    <ul className="document-map-list">
      {nodes.map((node) => (
        <DocumentMapItem
          key={node.id}
          node={node}
          busy={busy}
          currentNodeId={currentNodeId}
          onNavigate={onNavigate}
        />
      ))}
    </ul>
  )
}

type ItemProps = {
  node: DocumentMapNode
  busy: boolean
  currentNodeId?: string | null
  onNavigate: (id: string) => void
}

function DocumentMapItem({ node, busy, currentNodeId, onNavigate }: ItemProps) {
  const hasChildren = node.children?.length > 0
  const [expanded, setExpanded] = useState(true)
  const isCurrent = currentNodeId === node.id

  return (
    <li>
      <div className="document-map-row">
        {hasChildren ? (
          <button
            type="button"
            className="document-map-toggle"
            aria-expanded={expanded}
            aria-label={expanded ? `Collapse ${node.label}` : `Expand ${node.label}`}
            disabled={busy}
            onClick={() => setExpanded((value) => !value)}
          />
        ) : (
          <span className="document-map-toggle-spacer" aria-hidden="true" />
        )}
        <button
          type="button"
          className="document-map-node"
          disabled={busy}
          aria-current={isCurrent ? 'true' : undefined}
          onClick={() => onNavigate(node.id)}
        >
          {node.label}
        </button>
      </div>
      {hasChildren && expanded && (
        <DocumentMapList
          nodes={node.children}
          busy={busy}
          currentNodeId={currentNodeId}
          onNavigate={onNavigate}
        />
      )}
    </li>
  )
}
