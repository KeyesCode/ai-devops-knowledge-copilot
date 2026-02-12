import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import './EvalDashboard.css';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

interface EvalSet {
  id: string;
  name: string;
  description: string | null;
  questionCount?: number;
  createdAt: string;
}

interface EvalRun {
  id: string;
  evalSetId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  totalQuestions: number;
  completedQuestions: number;
  createdAt: string;
  completedAt: string | null;
  metadata?: {
    topK?: number;
    hybridWeight?: number;
  };
}

interface EvalResult {
  id: string;
  question: string;
  expectedAnswer: string;
  generatedAnswer: string;
  faithfulnessScore: number | null;
  contextRecallScore: number | null;
  contextPrecisionScore: number | null;
}

export function EvalDashboard() {
  const { token, user } = useAuth();
  const [evalSets, setEvalSets] = useState<EvalSet[]>([]);
  const [selectedSetId, setSelectedSetId] = useState<string | null>(null);
  const [runs, setRuns] = useState<EvalRun[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [results, setResults] = useState<EvalResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [topK, setTopK] = useState(20);
  const [hybridWeight, setHybridWeight] = useState(0.5);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: '',
    description: '',
    questions: [{ question: '', expectedAnswer: '' }],
  });

  // Load eval sets
  const loadEvalSets = useCallback(async () => {
    if (!token) return;

    try {
      const response = await fetch(`${API_BASE_URL}/eval/sets`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) throw new Error('Failed to load eval sets');
      const data = await response.json();
      setEvalSets(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load eval sets');
    }
  }, [token]);

  // Load runs for selected set
  const loadRuns = useCallback(async (evalSetId: string) => {
    if (!token) return;

    try {
      const response = await fetch(`${API_BASE_URL}/eval/sets/${evalSetId}/runs`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) throw new Error('Failed to load runs');
      const data = await response.json();
      setRuns(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load runs');
    }
  }, [token]);

  // Load results for selected run
  const loadResults = useCallback(async (runId: string) => {
    if (!token) return;

    try {
      const response = await fetch(`${API_BASE_URL}/eval/runs/${runId}/results`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) throw new Error('Failed to load results');
      const data = await response.json();
      setResults(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load results');
    }
  }, [token]);

  // Create eval set
  const createEvalSet = useCallback(async () => {
    if (!token) return;

    if (!createForm.name.trim()) {
      setError('Name is required');
      return;
    }

    if (createForm.questions.length === 0 || createForm.questions.some(q => !q.question.trim() || !q.expectedAnswer.trim())) {
      setError('All questions must have both question and expected answer');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/eval/sets`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: createForm.name.trim(),
          description: createForm.description.trim() || undefined,
          questions: createForm.questions.map(q => ({
            question: q.question.trim(),
            expectedAnswer: q.expectedAnswer.trim(),
          })),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Failed to create eval set' }));
        throw new Error(errorData.message || 'Failed to create eval set');
      }

      await loadEvalSets();
      setShowCreateModal(false);
      setCreateForm({
        name: '',
        description: '',
        questions: [{ question: '', expectedAnswer: '' }],
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create eval set');
    } finally {
      setIsLoading(false);
    }
  }, [token, createForm, loadEvalSets]);

  // Run evaluation
  const runEvaluation = useCallback(async (evalSetId: string) => {
    if (!token) return;

    setIsRunning(true);
    setError(null);

    try {
      const response = await fetch(
        `${API_BASE_URL}/eval/sets/${evalSetId}/run?topK=${topK}&hybridWeight=${hybridWeight}`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        },
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Failed to run evaluation' }));
        throw new Error(errorData.message || 'Failed to run evaluation');
      }

      const run = await response.json();
      setSelectedRunId(run.id);
      await loadRuns(evalSetId);
      await loadResults(run.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to run evaluation');
    } finally {
      setIsRunning(false);
    }
  }, [token, topK, hybridWeight, loadRuns, loadResults]);

  // Poll for running evaluations
  useEffect(() => {
    if (!selectedSetId || !token) return;

    const interval = setInterval(async () => {
      const runningRuns = runs.filter(r => r.status === 'running');
      if (runningRuns.length > 0) {
        await loadRuns(selectedSetId);
        // If we're viewing a running eval, reload its results
        if (selectedRunId && runningRuns.some(r => r.id === selectedRunId)) {
          await loadResults(selectedRunId);
        }
      }
    }, 3000); // Poll every 3 seconds

    return () => clearInterval(interval);
  }, [selectedSetId, runs, selectedRunId, token, loadRuns, loadResults]);

  useEffect(() => {
    loadEvalSets();
  }, [loadEvalSets]);

  useEffect(() => {
    if (selectedSetId) {
      loadRuns(selectedSetId);
    }
  }, [selectedSetId, loadRuns]);

  useEffect(() => {
    if (selectedRunId) {
      loadResults(selectedRunId);
    }
  }, [selectedRunId, loadResults]);

  const selectedSet = evalSets.find(s => s.id === selectedSetId);
  const selectedRun = runs.find(r => r.id === selectedRunId);

  // Calculate aggregate metrics
  const avgMetrics = results.length > 0 ? {
    faithfulness: results.reduce((sum, r) => sum + (r.faithfulnessScore || 0), 0) / results.length,
    contextRecall: results.reduce((sum, r) => sum + (r.contextRecallScore || 0), 0) / results.length,
    contextPrecision: results.reduce((sum, r) => sum + (r.contextPrecisionScore || 0), 0) / results.length,
  } : null;

  return (
    <div className="eval-dashboard">
      <div className="eval-dashboard-header">
        <h1>Evaluation Dashboard</h1>
        <div className="eval-dashboard-actions">
          <label>
            Top K:
            <input
              type="number"
              min="1"
              max="50"
              value={topK}
              onChange={(e) => setTopK(parseInt(e.target.value, 10) || 10)}
              style={{ marginLeft: '8px', width: '60px' }}
            />
          </label>
          <div className="hybrid-weight-control" style={{ marginLeft: '16px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px' }}>
              Hybrid Weight:
              <div className="hybrid-weight-input-group">
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={hybridWeight}
                  onChange={(e) => setHybridWeight(parseFloat(e.target.value))}
                  className="hybrid-weight-slider"
                  title="0.0 = BM25 only, 0.5 = Hybrid (equal), 1.0 = Vector only"
                />
                <input
                  type="number"
                  min="0"
                  max="1"
                  step="0.1"
                  value={hybridWeight}
                  onChange={(e) => {
                    const value = parseFloat(e.target.value);
                    if (!isNaN(value) && value >= 0 && value <= 1) {
                      setHybridWeight(value);
                    }
                  }}
                  className="hybrid-weight-number"
                  title="0.0 = BM25 only, 0.5 = Hybrid (equal), 1.0 = Vector only"
                />
              </div>
              <span className="hybrid-weight-label">
                {hybridWeight === 0 ? 'BM25 only' : hybridWeight === 1 ? 'Vector only' : hybridWeight === 0.5 ? 'Hybrid (equal)' : `Hybrid (${(hybridWeight * 100).toFixed(0)}% vector)`}
              </span>
            </label>
          </div>
        </div>
      </div>

      {error && (
        <div className="eval-error">
          <span>⚠️ {error}</span>
          <button onClick={() => setError(null)}>×</button>
        </div>
      )}

      <div className="eval-dashboard-content">
        {/* Eval Sets Sidebar */}
        <div className="eval-sets-panel">
          <div className="eval-sets-panel-header">
            <h2>Evaluation Sets</h2>
            <button
              className="eval-create-btn"
              onClick={() => setShowCreateModal(true)}
              disabled={isLoading}
            >
              ➕ Create
            </button>
          </div>
          <button
            className="eval-refresh-btn"
            onClick={loadEvalSets}
            disabled={isLoading}
          >
            🔄 Refresh
          </button>
          <div className="eval-sets-list">
            {evalSets.length === 0 ? (
              <div className="eval-empty">No eval sets found</div>
            ) : (
              evalSets.map((set) => (
                <div
                  key={set.id}
                  className={`eval-set-item ${selectedSetId === set.id ? 'active' : ''}`}
                  onClick={() => {
                    setSelectedSetId(set.id);
                    setSelectedRunId(null);
                    setResults([]);
                  }}
                >
                  <div className="eval-set-name">{set.name}</div>
                  <div className="eval-set-meta">
                    {set.questionCount || 0} questions
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Main Content Area */}
        <div className="eval-main-content">
          {!selectedSetId ? (
            <div className="eval-placeholder">
              <p>Select an evaluation set to view runs and metrics</p>
            </div>
          ) : (
            <>
              {/* Eval Set Info */}
              <div className="eval-set-info">
                <h2>{selectedSet?.name}</h2>
                {selectedSet?.description && (
                  <p className="eval-set-description">{selectedSet.description}</p>
                )}
                <button
                  className="eval-run-btn"
                  onClick={() => runEvaluation(selectedSetId)}
                  disabled={isRunning}
                >
                  {isRunning ? 'Running...' : '▶️ Run Evaluation'}
                </button>
              </div>

              {/* Runs List */}
              <div className="eval-runs-section">
                <h3>Evaluation Runs</h3>
                {runs.length === 0 ? (
                  <div className="eval-empty">No runs yet. Click "Run Evaluation" to start.</div>
                ) : (
                  <div className="eval-runs-list">
                    {runs.map((run) => (
                      <div
                        key={run.id}
                        className={`eval-run-item ${selectedRunId === run.id ? 'active' : ''} ${run.status}`}
                        onClick={() => setSelectedRunId(run.id)}
                      >
                        <div className="eval-run-header">
                          <span className="eval-run-status">{run.status}</span>
                          <span className="eval-run-date">
                            {new Date(run.createdAt).toLocaleString()}
                          </span>
                        </div>
                        <div className="eval-run-progress">
                          {run.status === 'running' ? (
                            <div className="eval-progress-bar">
                              <div
                                className="eval-progress-fill"
                                style={{
                                  width: `${(run.completedQuestions / run.totalQuestions) * 100}%`,
                                }}
                              />
                            </div>
                          ) : null}
                          <span>
                            {run.completedQuestions} / {run.totalQuestions} questions
                          </span>
                        </div>
                        {(run.metadata?.topK !== undefined || run.metadata?.hybridWeight !== undefined) && (
                          <div className="eval-run-params">
                            {run.metadata?.topK !== undefined && (
                              <span className="eval-run-param">
                                Top K: {run.metadata.topK}
                              </span>
                            )}
                            {run.metadata?.hybridWeight !== undefined && (
                              <span className="eval-run-param">
                                Hybrid: {run.metadata.hybridWeight === 0 ? 'BM25 only' : 
                                         run.metadata.hybridWeight === 1 ? 'Vector only' : 
                                         run.metadata.hybridWeight === 0.5 ? 'Hybrid (equal)' : 
                                         `${(run.metadata.hybridWeight * 100).toFixed(0)}% vector`}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Results and Metrics */}
              {selectedRunId && selectedRun && (
                <div className="eval-results-section">
                  <h3>Results & Metrics</h3>
                  
                  {selectedRun.status === 'running' && (
                    <div className="eval-running-notice">
                      ⏳ Evaluation in progress... Results will update automatically.
                    </div>
                  )}

                  {selectedRun.status === 'completed' && results.length > 0 && avgMetrics && (
                    <>
                      {/* Aggregate Metrics */}
                      <div className="eval-metrics-summary">
                        <div className="eval-metric-card">
                          <div className="eval-metric-label">Avg Faithfulness</div>
                          <div className="eval-metric-value">
                            {(avgMetrics.faithfulness * 100).toFixed(1)}%
                          </div>
                          <div className="eval-metric-bar">
                            <div
                              className="eval-metric-fill"
                              style={{ width: `${avgMetrics.faithfulness * 100}%` }}
                            />
                          </div>
                        </div>
                        <div className="eval-metric-card">
                          <div className="eval-metric-label">Avg Context Recall</div>
                          <div className="eval-metric-value">
                            {(avgMetrics.contextRecall * 100).toFixed(1)}%
                          </div>
                          <div className="eval-metric-bar">
                            <div
                              className="eval-metric-fill"
                              style={{ width: `${avgMetrics.contextRecall * 100}%` }}
                            />
                          </div>
                        </div>
                        <div className="eval-metric-card">
                          <div className="eval-metric-label">Avg Context Precision</div>
                          <div className="eval-metric-value">
                            {(avgMetrics.contextPrecision * 100).toFixed(1)}%
                          </div>
                          <div className="eval-metric-bar">
                            <div
                              className="eval-metric-fill"
                              style={{ width: `${avgMetrics.contextPrecision * 100}%` }}
                            />
                          </div>
                        </div>
                      </div>

                      {/* Individual Results */}
                      <div className="eval-results-list">
                        {results.map((result, idx) => (
                          <div key={result.id} className="eval-result-item">
                            <div className="eval-result-header">
                              <span className="eval-result-number">Question {idx + 1}</span>
                              <div className="eval-result-scores">
                                {result.faithfulnessScore !== null && (
                                  <span className="eval-score-badge">
                                    F: {(result.faithfulnessScore * 100).toFixed(0)}%
                                  </span>
                                )}
                                {result.contextRecallScore !== null && (
                                  <span className="eval-score-badge">
                                    R: {(result.contextRecallScore * 100).toFixed(0)}%
                                  </span>
                                )}
                                {result.contextPrecisionScore !== null && (
                                  <span className="eval-score-badge">
                                    P: {(result.contextPrecisionScore * 100).toFixed(0)}%
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="eval-result-content">
                              <div className="eval-result-question">
                                <strong>Q:</strong> {result.question}
                              </div>
                              <div className="eval-result-expected">
                                <strong>Expected:</strong> {result.expectedAnswer}
                              </div>
                              <div className="eval-result-generated">
                                <strong>Generated:</strong> {result.generatedAnswer}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}

                  {selectedRun.status === 'completed' && results.length === 0 && (
                    <div className="eval-empty">No results available</div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Create Eval Set Modal */}
      {showCreateModal && (
        <div className="eval-modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="eval-modal" onClick={(e) => e.stopPropagation()}>
            <div className="eval-modal-header">
              <h2>Create Evaluation Set</h2>
              <button
                className="eval-modal-close"
                onClick={() => {
                  setShowCreateModal(false);
                  setCreateForm({
                    name: '',
                    description: '',
                    questions: [{ question: '', expectedAnswer: '' }],
                  });
                  setError(null);
                }}
              >
                ×
              </button>
            </div>

            <div className="eval-modal-content">
              <div className="eval-form-field">
                <label>Name *</label>
                <input
                  type="text"
                  value={createForm.name}
                  onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                  placeholder="e.g., RAG System Evaluation"
                />
              </div>

              <div className="eval-form-field">
                <label>Description</label>
                <textarea
                  value={createForm.description}
                  onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
                  placeholder="Optional description of this evaluation set"
                  rows={3}
                />
              </div>

              <div className="eval-questions-section">
                <div className="eval-questions-header">
                  <label>Questions *</label>
                  <button
                    type="button"
                    className="eval-add-question-btn"
                    onClick={() => setCreateForm({
                      ...createForm,
                      questions: [...createForm.questions, { question: '', expectedAnswer: '' }],
                    })}
                  >
                    ➕ Add Question
                  </button>
                </div>

                {createForm.questions.map((q, idx) => (
                  <div key={idx} className="eval-question-item">
                    <div className="eval-question-header">
                      <span>Question {idx + 1}</span>
                      {createForm.questions.length > 1 && (
                        <button
                          type="button"
                          className="eval-remove-question-btn"
                          onClick={() => setCreateForm({
                            ...createForm,
                            questions: createForm.questions.filter((_, i) => i !== idx),
                          })}
                        >
                          🗑️ Remove
                        </button>
                      )}
                    </div>
                    <div className="eval-form-field">
                      <label>Question *</label>
                      <textarea
                        value={q.question}
                        onChange={(e) => {
                          const newQuestions = [...createForm.questions];
                          newQuestions[idx].question = e.target.value;
                          setCreateForm({ ...createForm, questions: newQuestions });
                        }}
                        placeholder="What is the question you want to test?"
                        rows={2}
                      />
                    </div>
                    <div className="eval-form-field">
                      <label>Expected Answer *</label>
                      <textarea
                        value={q.expectedAnswer}
                        onChange={(e) => {
                          const newQuestions = [...createForm.questions];
                          newQuestions[idx].expectedAnswer = e.target.value;
                          setCreateForm({ ...createForm, questions: newQuestions });
                        }}
                        placeholder="What is the expected/correct answer?"
                        rows={3}
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="eval-modal-actions">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateModal(false);
                    setCreateForm({
                      name: '',
                      description: '',
                      questions: [{ question: '', expectedAnswer: '' }],
                    });
                    setError(null);
                  }}
                  disabled={isLoading}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={createEvalSet}
                  disabled={isLoading}
                  className="eval-create-submit-btn"
                >
                  {isLoading ? 'Creating...' : 'Create Set'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

