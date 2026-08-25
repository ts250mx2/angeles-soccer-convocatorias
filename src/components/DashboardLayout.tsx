"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShieldOff } from "lucide-react";
import Sidebar from "./Sidebar";
import AgentChatWidget from "./AgentChatWidget";
import { usePermisos } from "@/contexts/user-context";
import { PAGINAS, claveDeRuta, puedeVerPagina } from "@/lib/navegacion";

interface DashboardLayoutProps {
  children: React.ReactNode;
}

/**
 * Pantalla de "no tienes acceso". Se muestra en lugar del módulo, con el menú intacto
 * para que el usuario pueda irse a donde sí puede entrar.
 */
function SinAcceso({ paginas }: { paginas: ReadonlySet<string> }) {
  const primera = PAGINAS.find((p) => paginas.has(p.clave));

  return (
    <main className="flex-1 flex items-center justify-center p-8 text-white">
      <div className="max-w-md text-center bg-white/5 border border-white/10 rounded-3xl p-10 shadow-2xl">
        <ShieldOff size={48} className="mx-auto text-rose-400/70 mb-5" />
        <h1 className="text-xl font-black mb-2">Sin acceso a este módulo</h1>
        <p className="text-sm text-slate-400 leading-relaxed">
          Tu perfil no tiene concedida esta pantalla. Si la necesitas, pídele a un
          administrador que te la habilite en <strong className="text-slate-200">Administración › Perfiles y Permisos</strong>.
        </p>
        <Link
          href={primera?.clave ?? "/login"}
          className="inline-block mt-6 px-5 py-2.5 rounded-xl bg-blue-600/20 border border-blue-500/30 text-blue-200 text-sm font-bold hover:bg-blue-600/30 transition-all"
        >
          {primera ? `Ir a ${primera.label}` : "Volver a iniciar sesión"}
        </Link>
      </div>
    </main>
  );
}

/**
 * El proveedor del agente vive en el layout raíz, no aquí: ver app/layout.tsx.
 *
 * Todas las pantallas con sesión pasan por este layout, así que es el único sitio
 * donde hay que comprobar el permiso del módulo: una pantalla nueva queda protegida
 * con solo darla de alta en @/lib/navegacion. Esto es comodidad para el usuario; la
 * reja de verdad la ponen las rutas de API con requierePagina().
 */
export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const pathname = usePathname();
  const { paginas, cargando } = usePermisos();

  const clave = claveDeRuta(pathname);
  const permitido = cargando || puedeVerPagina(clave, paginas);

  /* tema-oscuro activa las reglas de globals.css para los controles nativos, y el
     text-slate-100 da color de texto a los controles que no declaran el suyo: sin él
     heredan el del body, que sigue el modo claro/oscuro de Windows y en modo claro
     deja letras oscuras sobre fondo oscuro. */
  return (
    <div className="tema-oscuro flex min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 text-slate-100">
      <Sidebar />
      <div className="contenido-app flex-1 flex flex-col min-w-0 overflow-hidden">
        {permitido ? children : <SinAcceso paginas={paginas} />}
      </div>
      <AgentChatWidget />
    </div>
  );
}
