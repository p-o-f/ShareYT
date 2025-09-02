import { useAuth } from './AuthContext';
import { messaging } from '../../utils/messaging';
import { useState } from 'react';

export const userInfo = 1;

export default function LoginForm() {
  const { user, loginWithGoogle, logout, loading } = useAuth();
  const [summary, setSummary] = useState<string | null>(null);

  if (loading) {
    return <div>Loading...</div>;
  }

  const handleSummarize = async () => {
    const result = await messaging.sendMessage('summarize:video');
    setSummary(result);
  };

  return (
    <div
      style={{
        padding: '1rem',
        minWidth: '250px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '1rem',
        fontFamily: 'sans-serif',
      }}
    >
      <h2 style={{ margin: 0 }}>ShareYT</h2>

      {user && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          {user.photoURL && (
            <img
              src={user.photoURL}
              alt="Profile"
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                objectFit: 'cover',
              }}
            />
          )}
          <span>Hi, {user.displayName || user.email || 'User'}!</span>
        </div>
      )}

      {!user && (
        <button style={{ width: '100%' }} onClick={loginWithGoogle}>
          Sign In
        </button>
      )}
      {user && (
        <>
          <button style={{ width: '100%' }} onClick={logout}>
            Sign Out
          </button>
          <button
            style={{ width: '100%' }}
            onClick={() => {
              const url = browser.runtime.getURL('/dashboard.html');
              window.open(url, '_blank');
            }}
          >
            View Your Dashboard
          </button>
          <button style={{ width: '100%' }} onClick={handleSummarize}>
            Summarize (in progress)
          </button>
        </>
      )}

      {summary && (
        <div style={{ width: '100%' }}>
          <h3 style={{ marginBottom: '0.5rem' }}>Summary:</h3>
          <p style={{ fontSize: '0.9rem' }}>{summary}</p>
        </div>
      )}
    </div>
  );
}
