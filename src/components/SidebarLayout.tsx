import React from 'react';
import { Outlet, NavLink } from 'react-router-dom';
import { MessageSquare, Users, Smartphone, User, LogOut, Sparkles } from 'lucide-react';

export default function SidebarLayout() {
  return (
    <div className="flex h-screen w-full bg-slate-50 text-slate-800 font-sans selection:bg-indigo-100 selection:text-indigo-900">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-slate-200/60 flex flex-col h-full flex-shrink-0 shadow-sm relative z-10">
        <div className="p-6 border-b border-slate-100 flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center text-white shadow-md shadow-indigo-200">
            <Sparkles className="w-4 h-4" />
          </div>
          <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-slate-900 to-slate-600">mutiAI</h1>
        </div>
        
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          <NavItem to="/" icon={<MessageSquare className="w-5 h-5" />} label="平台小助理" />
          <NavItem to="/orgs" icon={<Users className="w-5 h-5" />} label="组织管理" />
          <NavItem to="/wechat" icon={<Smartphone className="w-5 h-5" />} label="微信对接" />
        </nav>
        
        <div className="p-4 border-t border-slate-100 space-y-1 bg-slate-50/50">
          <NavItem to="/profile" icon={<User className="w-5 h-5" />} label="个人中心" />
          <NavLink 
            to="/login"
            className="flex items-center px-3 py-2.5 text-sm font-medium rounded-xl text-slate-600 hover:bg-red-50 hover:text-red-700 transition-all duration-200 w-full text-left"
          >
            <LogOut className="w-5 h-5 mr-3 flex-shrink-0" />
            退出登录
          </NavLink>
        </div>
      </aside>
      
      {/* Main Content */}
      <main className="flex-1 flex flex-col h-full min-w-0 overflow-hidden bg-slate-50/50">
        <Outlet />
      </main>
    </div>
  );
}

function NavItem({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `flex items-center px-3 py-2.5 text-sm font-medium rounded-xl transition-all duration-200 ${
          isActive 
            ? 'bg-gradient-to-r from-indigo-50 to-blue-50 text-indigo-700 shadow-sm border border-indigo-100/50' 
            : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
        }`
      }
    >
      <div className="mr-3 flex-shrink-0">{icon}</div>
      <span className="truncate">{label}</span>
    </NavLink>
  );
}
