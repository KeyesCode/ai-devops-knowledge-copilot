import { useAuth } from './contexts/AuthContext';
import { Chat } from './components/Chat';
import { Auth } from './components/Auth';
import './App.css';

function App() {
  const { isAuthenticated, user, isLoading } = useAuth();

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

  return <Chat orgId={user.orgId} topK={10} />;
}

export default App;
