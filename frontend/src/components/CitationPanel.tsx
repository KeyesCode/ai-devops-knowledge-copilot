import type { Citation } from '../hooks/useChatStream';
import './CitationPanel.css';

interface CitationPanelProps {
  citations: Citation[];
  isOpen: boolean;
  onClose: () => void;
}

export function CitationPanel({
  citations,
  isOpen,
  onClose,
}: CitationPanelProps) {
  if (!isOpen || citations.length === 0) {
    return null;
  }

  return (
    <div className="citation-panel-overlay" onClick={onClose}>
      <div
        className="citation-panel"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="citation-panel-header">
          <h3>Sources ({citations.length})</h3>
          <button
            className="citation-panel-close"
            onClick={onClose}
            aria-label="Close citations"
          >
            ×
          </button>
        </div>
        <div className="citation-panel-content">
          {citations.map((citation, index) => (
            <div key={citation.chunkId} className="citation-item">
              <div className="citation-header">
                <span className="citation-number">{index + 1}</span>
                <div className="citation-meta">
                  <div className="citation-title">
                    {citation.documentTitle ||
                      `Document ${citation.documentId.substring(0, 8)}...`}
                  </div>
                  <div className="citation-similarity">
                    Similarity: {(citation.similarity * 100).toFixed(1)}%
                  </div>
                </div>
              </div>
              <div className="citation-content">{citation.content}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

