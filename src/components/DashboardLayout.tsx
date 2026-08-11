"use client";

import Sidebar from "./Sidebar";
import AgentChatWidget from "./AgentChatWidget";
import { AgentChatProvider } from "@/hooks/use-agent-chat";

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  return (
    /* El proveedor envuelve al chat flotante Y al contenido: así la página del
       agente y el widget comparten una sola conversación en vez de tener cada
       uno la suya. */
    <AgentChatProvider>
      <div className="flex min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
        <Sidebar />
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {children}
        </div>
        <AgentChatWidget />
      </div>
    </AgentChatProvider>
  );
}
