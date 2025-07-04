import "./App.css";
import AuthProvider from "./AuthContext";
import LoginForm from "./LoginForm";

export default function App() {
  return (
    <AuthProvider>
      <LoginForm />
    </AuthProvider>
  );
}
