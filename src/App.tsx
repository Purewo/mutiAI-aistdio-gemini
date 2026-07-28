import { lazy, Suspense } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthProvider';
import RequireAuth from './components/RequireAuth';
import SidebarLayout from './components/SidebarLayout';
import { LoadingState } from './components/states';
import Login from './pages/Login';
import NotFound from './pages/NotFound';
import OrgDetail from './pages/OrgDetail';
import OrgsList from './pages/OrgsList';
import Profile from './pages/Profile';
import RuntimeConfig from './pages/RuntimeConfig';
import TaskDetail from './pages/TaskDetail';

/** Dev-only fixture preview; the lazy import keeps captured fixtures out of the production bundle. */
const FixturePreview = import.meta.env.DEV ? lazy(() => import('./pages/FixturePreview')) : null;

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />

          {/* Everything below requires a backend-confirmed session. */}
          <Route element={<RequireAuth />}>
            <Route element={<SidebarLayout />}>
              {/* SidebarLayout keeps the assistant mounted and owns the root-route surface. */}
              <Route index element={null} />
              <Route path="/orgs" element={<OrgsList />} />
              <Route path="/orgs/:organizationId" element={<OrgDetail />} />
              <Route path="/tasks/:taskId" element={<TaskDetail />} />
              <Route path="/runtime" element={<RuntimeConfig />} />
              {FixturePreview ? (
                <Route
                  path="/dev/fixtures"
                  element={
                    <Suspense fallback={<LoadingState label="加载 Fixture 预览..." />}>
                      <FixturePreview />
                    </Suspense>
                  }
                />
              ) : null}
              <Route path="/profile" element={<Profile />} />
              {/*
                The single catch-all sits inside the guard on purpose. An unknown path for a signed-out
                visitor redirects to login rather than revealing that the route does not exist.
              */}
              <Route path="*" element={<NotFound />} />
            </Route>
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
