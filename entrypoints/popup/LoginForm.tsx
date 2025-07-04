import { useAuth } from "./AuthContext";

export default function LoginForm() {
  const { user, loginWithGoogle, logout } = useAuth();
  console.log("user", user);
  return (
    <>
      {user}
      <button onClick={loginWithGoogle}>Login</button>
      <button onClick={logout}>Logout</button>
    </>
  );
}
