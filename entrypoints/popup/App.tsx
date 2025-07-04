import "./App.css";
import AuthProvider, { useAuth } from "./AuthContext";

export default function App() {
  const { user, loginWithGoogle, logout } = useAuth();

  return (
    <AuthProvider>
      {user?.displayName}
      <button onClick={loginWithGoogle}>Login</button>
      <button onClick={logout}>Login</button>
    </AuthProvider>
  );
}
