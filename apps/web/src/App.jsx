/** UI component for App in the Relay web application. */

import { lazy, Suspense, useEffect, useRef } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Loader } from "lucide-react";
import { Toaster } from "react-hot-toast";

import OperationsShell from "./components/OperationsShell";
import OperationsOverview from "./pages/OperationsOverview";
import HomePage from "./pages/HomePage";
import SignUpPage from "./pages/SignUpPage";
import LoginPage from "./pages/LoginPage";
import SettingsPage from "./pages/SettingsPage";
import ProfilePage from "./pages/ProfilePage";
import AIAssistantPage from "./pages/AIAssistantPage";
import InfrastructurePage from "./pages/InfrastructurePage";
import OperationalWorkspacePage from "./pages/OperationalWorkspacePage";
import AnalyticsPage from "./pages/AnalyticsPage";
import JobsPage from "./pages/JobsPage.jsx";
import { useAuthStore } from "./store/useAuthStore";
import { useThemeStore } from "./store/useThemeStore";

const IntelligencePage = lazy(() => import("./pages/IntelligencePage"));

function PageLoader() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-[50vh] items-center justify-center"
    >
      <Loader className="size-8 animate-spin text-primary" aria-hidden="true" />
      <span className="a11y-visually-hidden">Loading Intelligence page…</span>
    </div>
  );
}

function RouteFocusManager() {
  const location = useLocation();
  const previousPath = useRef(location.pathname);

  useEffect(() => {
    if (previousPath.current === location.pathname) return;

    previousPath.current = location.pathname;
    document.getElementById("main-content")?.focus({ preventScroll: true });
  }, [location.pathname]);

  return null;
}

function ProtectedLayout() {
  const { authUser } = useAuthStore();
  return authUser ? <OperationsShell /> : <Navigate to="/login" replace />;
}

const App = () => {
  const { authUser, checkAuth, isCheckingAuth } = useAuthStore();
  const { theme } = useThemeStore();

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  if (isCheckingAuth && !authUser) {
    return (
      <main
        id="main-content"
        tabIndex={-1}
        aria-busy="true"
        data-theme={theme}
        className="flex min-h-screen items-center justify-center bg-base-200 text-base-content"
      >
        <div className="flex flex-col items-center gap-4">
          <Loader className="size-9 animate-spin text-primary" aria-hidden="true" />
          <h1 className="sr-only">Checking your session</h1>
          <p role="status" className="text-sm text-base-content/70">
            Checking your session…
          </p>
        </div>
      </main>
    );
  }

  return (
    <div data-theme={theme} className="min-h-screen">
      <a className="a11y-skip-link" href="#main-content">
        Skip to main content
      </a>
      <RouteFocusManager />
      <Routes>
        <Route
          path="/login"
          element={!authUser ? <LoginPage /> : <Navigate to="/" replace />}
        />
        <Route
          path="/signup"
          element={!authUser ? <SignUpPage /> : <Navigate to="/" replace />}
        />

        <Route element={<ProtectedLayout />}>
          <Route path="/" element={<OperationsOverview />} />
          <Route
            path="/intelligence"
            element={
              <Suspense fallback={<PageLoader />}>
                <IntelligencePage />
              </Suspense>
            }
          />
          <Route path="/agents" element={<OperationalWorkspacePage workspace="agents" />} />
          <Route path="/infrastructure" element={<InfrastructurePage />} />
          <Route path="/jobs" element={<JobsPage />} />
          <Route path="/analytics" element={<AnalyticsPage />} />
          <Route path="/knowledge" element={<OperationalWorkspacePage workspace="knowledge" />} />
          <Route path="/workspace" element={<HomePage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/ai" element={<AIAssistantPage />} />
          <Route path="/profile" element={<ProfilePage />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      <Toaster position="top-right" />
    </div>
  );
};

export default App;
