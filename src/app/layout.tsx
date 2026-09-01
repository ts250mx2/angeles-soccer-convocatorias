import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Convocatorias",
  description: "Convocatorias de liga",
};

import { UserProvider } from "@/contexts/user-context";
import { AgentChatProvider } from "@/hooks/use-agent-chat";
import VistaPreviaPdf from "@/components/VistaPreviaPdf";


export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <UserProvider>
          {/* El agente vive por ENCIMA de las páginas: cada pantalla renderiza su
              propio DashboardLayout, así que un proveedor puesto ahí quedaría por
              debajo de quien lo consume. Aquí además la conversación sobrevive al
              navegar entre pantallas. */}
          <AgentChatProvider>
            {children}
            {/* La presentación preliminar de los PDF. Va aquí, y no en DashboardLayout,
                para que cubra también las pantallas que no pasan por él; se muestra sola
                cuando una exportación deja un documento (ver @/lib/pdf-preview). */}
            <VistaPreviaPdf />
          </AgentChatProvider>
        </UserProvider>
      </body>
    </html>
  );
}
