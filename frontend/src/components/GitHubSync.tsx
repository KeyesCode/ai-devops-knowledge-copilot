import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import './GitHubSync.css';

interface SyncResult {
  sourceId: string;
  documentsProcessed: number;
  chunksCreated: number;
  embeddingsCreated: number;
  errors: string[];
}

export function GitHubSync() {
  const { token, user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [owner, setOwner] = useState('');
  const [repo, setRepo] = useState('');
  const [branch, setBranch] = useState('main');
  const [result, setResult] = useState<SyncResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

  const handleSync = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!owner.trim() || !repo.trim()) {
      setError('Owner and repository are required');
      return;
    }

    if (!token) {
      setError('Not authenticated');
      return;
    }

    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch(`${API_BASE_URL}/github/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          owner: owner.trim(),
          repo: repo.trim(),
          branch: branch.trim() || 'main',
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Sync failed' }));
        throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
      }

      const data: SyncResult = await response.json();
      setResult(data);
      
      // Clear form on success
      setOwner('');
      setRepo('');
      setBranch('main');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  // Only show for admins
  if (user?.role !== 'admin') {
    return null;
  }

  return (
    <>
      <button
        className="github-sync-button"
        onClick={() => setIsOpen(true)}
        title="Sync GitHub Repository"
      >
        📥 Sync Repo
      </button>

      {isOpen && (
        <div className="github-sync-overlay" onClick={() => setIsOpen(false)}>
          <div className="github-sync-modal" onClick={(e) => e.stopPropagation()}>
            <div className="github-sync-header">
              <h2>Sync GitHub Repository</h2>
              <button
                className="github-sync-close"
                onClick={() => {
                  setIsOpen(false);
                  setError(null);
                  setResult(null);
                }}
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleSync} className="github-sync-form">
              <div className="github-sync-field">
                <label htmlFor="owner">Owner/Organization *</label>
                <input
                  id="owner"
                  type="text"
                  value={owner}
                  onChange={(e) => setOwner(e.target.value)}
                  placeholder="e.g., vesta-labs"
                  required
                  disabled={isLoading}
                />
              </div>

              <div className="github-sync-field">
                <label htmlFor="repo">Repository *</label>
                <input
                  id="repo"
                  type="text"
                  value={repo}
                  onChange={(e) => setRepo(e.target.value)}
                  placeholder="e.g., ai-devops-knowledge-copilot"
                  required
                  disabled={isLoading}
                />
              </div>

              <div className="github-sync-field">
                <label htmlFor="branch">Branch</label>
                <input
                  id="branch"
                  type="text"
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                  placeholder="main"
                  disabled={isLoading}
                />
              </div>

              {error && (
                <div className="github-sync-error">
                  <span>⚠️ {error}</span>
                </div>
              )}

              {result && (
                <div className="github-sync-result">
                  <h3>✅ Sync Completed!</h3>
                  <div className="github-sync-stats">
                    <div className="github-sync-stat">
                      <span className="stat-label">Documents:</span>
                      <span className="stat-value">{result.documentsProcessed}</span>
                    </div>
                    <div className="github-sync-stat">
                      <span className="stat-label">Chunks:</span>
                      <span className="stat-value">{result.chunksCreated}</span>
                    </div>
                    <div className="github-sync-stat">
                      <span className="stat-label">Embeddings:</span>
                      <span className="stat-value">{result.embeddingsCreated}</span>
                    </div>
                  </div>
                  {result.errors.length > 0 && (
                    <div className="github-sync-errors">
                      <strong>Errors:</strong>
                      <ul>
                        {result.errors.map((err, idx) => (
                          <li key={idx}>{err}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              <div className="github-sync-actions">
                <button
                  type="button"
                  onClick={() => {
                    setIsOpen(false);
                    setError(null);
                    setResult(null);
                  }}
                  disabled={isLoading}
                >
                  Cancel
                </button>
                <button type="submit" disabled={isLoading}>
                  {isLoading ? 'Syncing...' : 'Sync Repository'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

