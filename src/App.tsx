import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import SidebarLayout from './components/SidebarLayout';
import Login from './pages/Login';
import Assistant from './pages/Assistant';
import OrgsList from './pages/OrgsList';
import OrgDetail from './pages/OrgDetail';
import WeChatConnect from './pages/WeChatConnect';
import Profile from './pages/Profile';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        
        {/* Main Application Routes inside Sidebar Layout */}
        <Route element={<SidebarLayout />}>
          <Route path="/" element={<Assistant />} />
          <Route path="/orgs" element={<OrgsList />} />
          <Route path="/orgs/:id" element={<OrgDetail />} />
          <Route path="/wechat" element={<WeChatConnect />} />
          <Route path="/profile" element={<Profile />} />
        </Route>
        
        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
