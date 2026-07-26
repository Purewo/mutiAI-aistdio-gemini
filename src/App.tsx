import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthProvider';
import RequireAuth from './components/RequireAuth';
import SidebarLayout from './components/SidebarLayout';
import Assistant from './pages/Assistant';
import Login from './pages/Login';
import NotFound from './pages/NotFound';
import OrgDetail from './pages/OrgDetail';
import OrgsList from './pages/OrgsList';
import Profile from './pages/Profile';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />

          {/* Everything below requires a backend-confirmed session. */}
          <Route element={<RequireAuth />}>
            <Route element={<SidebarLayout />}>
              <Route path="/" element={<Assistant />} />
              <Route path="/orgs" element={<OrgsList />} />
              <Route path="/orgs/:organizationId" element={<OrgDetail />} />
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
