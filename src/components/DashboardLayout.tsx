"use client";

import Sidebar from "./Sidebar";
import AgentChatWidget from "./AgentChatWidget";

interface DashboardLayoutProps {
  children: React.ReactNode;
}

/** El proveedor del agente vive en el layout raíz, no aquí: ver app/layout.tsx. */
export default function DashboardLayout({ children }: DashboardLayoutProps) {
  return (
    <div className="flex min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {children}
      </div>
      <AgentChatWidget />
    </div>
  );
}
