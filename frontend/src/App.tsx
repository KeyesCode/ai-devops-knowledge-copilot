import { useState } from 'react';
import { useAuth } from './contexts/AuthContext';
import { Chat } from './components/Chat';
import { Auth } from './components/Auth';
import { EvalDashboard } from './components/EvalDashboard';
import './App.css';

type View = 'chat' | 'eval';

function App() {
  const { isAuthenticated, user, isLoading } = useAuth();
  const [currentView, setCurrentView] = useState<View>('chat');

  if (isLoading) {
    return (
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center', 
        height: '100vh',
        fontSize: '1.2rem'
      }}>
        Loading...
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return <Auth />;
  }

  return (
    <div className="app-container">
      <nav className="app-nav">
        <button
          className={`nav-button ${currentView === 'chat' ? 'active' : ''}`}
          onClick={() => setCurrentView('chat')}
        >
          💬 Chat
        </button>
        <button
          className={`nav-button ${currentView === 'eval' ? 'active' : ''}`}
          onClick={() => setCurrentView('eval')}
        >
          📊 Evaluations
        </button>
      </nav>
      <main className="app-main">
        {currentView === 'chat' ? (
          <Chat orgId={user.orgId} topK={20} />
        ) : (
          <EvalDashboard />
        )}
      </main>
    </div>
  );
}

export default App;
