import { useAuth } from './AuthContext';
import { messaging } from '../../utils/messaging';
import { useState } from 'react';

export default function LoginForm() {
  const { user, loginWithGoogle, logout, loading } = useAuth();
  const [summary, setSummary] = useState<string | null>(null);

  if (loading) {
    return <div>Loading...</div>;
  }

  const handleSummarize = async () => {
    const 
    result = await messaging.sendMessage('summarize:video');
    setSummary(result);
  };

  return (
    <div>
      {user && <div>Hi, {user.displayName || user.email || 'User'}!</div>}
      {!user && <button onClick={loginWithGoogle}>Sign In</button>}
      {user && <button onClick={logout}>Sign Out</button>}
      {user && (
        <button
          onClick={() => {
            const url = browser.runtime.getURL('/dashboard.html');
            window.open(url, '_blank');
          }}
        >
          View Dashboard
        </button>
      )}
      {user && (
        <button onClick={handleSummarize}>
          Summarize (see console for output)
        </button>
      )}
      {summary && (
        <div>
          <h3>Summary:</h3>
          <p>{summary}</p>
        </div>
      )}
    </div>
  );
}
