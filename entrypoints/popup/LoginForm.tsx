import { useAuth } from './AuthContext';

export default function LoginForm() {
  const { user, loginWithGoogle, logout, loading } = useAuth();

  if (loading) {
    return <div>Loading...</div>;
  }

  return (
    <div>
      {user && <div>Hi, {user.displayName || user.email || 'User'}!</div>}
      {!user && <button onClick={loginWithGoogle}>Sign In</button>}
      {user && <button onClick={logout}>Sign Out</button>}
    </div>
  );
}
