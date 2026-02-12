import { Chat } from './components/Chat'
import './App.css'

function App() {
  // TODO: Get orgId from auth context or props
  const orgId = 'default-org-id'

  return <Chat orgId={orgId} topK={10} />
}

export default App
