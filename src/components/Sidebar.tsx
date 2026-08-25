"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useUser, usePermisos } from "@/contexts/user-context";
import { NAV_ITEMS, claveDeRuta, puedeVerItem, type NavItem } from "@/lib/navegacion";
import IconoNav from "./IconoNav";
import {
  ChevronDown,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  X,
} from "lucide-react";

/**
 * El menú y sus permisos viven en @/lib/navegacion (dato plano, sin JSX) porque el
 * servidor también los necesita: aquí solo se pintan.
 */

/** Acentos del español; el menú no tiene otros. */
const SIN_ACENTO: Record<string, string> = {
  á: "a", é: "e", í: "i", ó: "o", ú: "u", ü: "u", ñ: "n",
};

/** Para buscar sin que estorben mayúsculas ni acentos: "administracion" encuentra "Administración". */
const normaliza = (texto: string): string =>
  texto.toLowerCase().replace(/[áéíóúüñ]/g, (letra) => SIN_ACENTO[letra]);

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, season, setSesion } = useUser();
  const { paginas } = usePermisos();
  const [collapsed, setCollapsed] = useState(false);
  /* Vacío a propósito: los grupos nacen CERRADOS. Lo que no está aquí cae en el valor
     por omisión (abierto solo si contiene la pantalla en la que estás), y en cuanto el
     usuario abre o cierra uno a mano, su decisión queda guardada y manda. */
  const [openMenus, setOpenMenus] = useState<Record<string, boolean>>({});
  const [busqueda, setBusqueda] = useState("");
  const inputBusqueda = useRef<HTMLInputElement>(null);
  /* Bandera en ref, no en estado: el sidebar colapsado no tiene input que enfocar, así
     que hay que esperar a que se expanda. Un estado aquí provocaría un render extra
     por cada expansión sin cambiar nada de lo que se pinta. */
  const pedirFoco = useRef(false);

  useEffect(() => {
    if (!collapsed && pedirFoco.current) {
      inputBusqueda.current?.focus();
      pedirFoco.current = false;
    }
  }, [collapsed]);

  /* Colapsar esconde la caja de búsqueda; dejar el filtro vivo ocultaría módulos del
     riel de iconos sin que nada explique por qué. */
  const cambiarColapso = (valor: boolean) => {
    setCollapsed(valor);
    if (valor) setBusqueda("");
  };

  const toggleMenu = (label: string, abiertoAhora: boolean) => {
    if (collapsed) {
      setCollapsed(false);
      setOpenMenus((prev) => ({ ...prev, [label]: true }));
      return;
    }
    setOpenMenus((prev) => ({ ...prev, [label]: !abiertoAhora }));
  };

  /**
   * Qué entrada se resalta. Se pregunta al catálogo a qué MÓDULO pertenece la ruta en
   * vez de comparar prefijos: con prefijos, estar en /jugadores/becas encendía también
   * "Lista de Jugadores", porque su href es prefijo del de aquélla.
   */
  const claveActual = claveDeRuta(pathname);
  const isActive = (href: string) => claveActual === href;

  const handleLogout = async () => {
    // Borra la cookie de sesión del servidor además del estado local.
    try {
      await fetch("/api/logout", { method: "POST" });
    } catch {
      /* aunque falle, salimos igualmente */
    }
    setSesion(null, null);
    router.push("/login");
  };

  const consulta = normaliza(busqueda.trim());
  const buscando = consulta.length > 0;

  /**
   * Menú ya filtrado por permisos y por la búsqueda. Un grupo entra si su propio
   * nombre coincide (y entonces muestra todos sus módulos) o si alguno de sus hijos
   * coincide (y entonces muestra solo esos). Los hijos ya vienen filtrados por
   * permiso, así que el render no vuelve a comprobarlo.
   */
  const resultados: NavItem[] = useMemo(() => {
    const out: NavItem[] = [];

    for (const item of NAV_ITEMS) {
      if (!puedeVerItem(item, paginas)) continue;

      if (!item.children) {
        if (!buscando || normaliza(item.label).includes(consulta)) out.push(item);
        continue;
      }

      const coincideGrupo = !buscando || normaliza(item.label).includes(consulta);
      const hijos = item.children.filter(
        (hijo) =>
          puedeVerItem(hijo, paginas) &&
          (coincideGrupo || normaliza(hijo.label).includes(consulta)),
      );
      if (hijos.length > 0) out.push({ ...item, children: hijos });
    }
    return out;
  }, [paginas, consulta, buscando]);

  return (
    <>
      {/* Mobile overlay */}
      <div
        className={`fixed inset-0 bg-black/50 backdrop-blur-sm z-30 lg:hidden print:hidden transition-opacity duration-300 ${
          collapsed ? "opacity-0 pointer-events-none" : "opacity-100"
        }`}
        onClick={() => cambiarColapso(true)}
      />

      {/* Sidebar */}
      <aside
        className={`fixed left-0 top-0 h-full z-40 flex flex-col print:hidden transition-all duration-300 ease-in-out
          ${collapsed ? "w-[68px]" : "w-64"}
          bg-slate-900/95 backdrop-blur-xl border-r border-white/10 shadow-2xl`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-white/10 min-h-[64px]">
          {!collapsed && (
            <div className="flex items-center gap-2 overflow-hidden">
              {/* El escudo del club (el mismo archivo que el favicon), sin caja de
                  color detrás: el emblema ya trae su propia forma. */}
              <Image
                src="/favicon.ico"
                alt="Ángeles Soccer"
                width={32}
                height={32}
                unoptimized
                className="flex-shrink-0 w-8 h-8 object-contain drop-shadow"
              />
              <div className="min-w-0">
                <p className="text-xs font-black text-white leading-tight truncate">
                  Ángeles Soccer
                </p>
                {season && (
                  <p className="text-[10px] text-blue-400 font-medium truncate">
                    {season}
                  </p>
                )}
              </div>
            </div>
          )}
          {collapsed && (
            <Image
              src="/favicon.ico"
              alt="Ángeles Soccer"
              width={32}
              height={32}
              unoptimized
              className="w-8 h-8 object-contain drop-shadow mx-auto"
            />
          )}
          <button
            onClick={() => cambiarColapso(!collapsed)}
            className={`p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-all duration-200 flex-shrink-0 ${
              collapsed ? "hidden" : ""
            }`}
            title={collapsed ? "Expandir" : "Colapsar"}
          >
            <PanelLeftClose size={16} />
          </button>
        </div>

        {/* Collapse toggle when collapsed */}
        {collapsed && (
          <button
            onClick={() => setCollapsed(false)}
            className="mx-auto mt-2 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-all duration-200"
            title="Expandir sidebar"
          >
            <PanelLeftOpen size={16} />
          </button>
        )}

        {/* User info */}
        {!collapsed && user && (
          <div className="px-4 py-3 border-b border-white/10">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white text-xs font-black flex-shrink-0 shadow">
                {user.Usuario?.charAt(0).toUpperCase() || "U"}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-white truncate">
                  {user.Usuario}
                </p>
                {/* El perfil es lo que decide qué ve: se muestra tal cual, en vez de
                    la etiqueta genérica "Administrador / Usuario". */}
                <p className="text-[10px] text-slate-400 truncate flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400 inline-block flex-shrink-0" />
                  {user.Puesto || "Sin perfil"}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Buscador del menú */}
        {collapsed ? (
          <button
            onClick={() => {
              pedirFoco.current = true;
              setCollapsed(false);
            }}
            title="Buscar en el menú"
            className="mx-auto mt-2 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-all duration-200"
          >
            <Search size={16} />
          </button>
        ) : (
          <div className="px-3 pt-3">
            <div className="relative">
              <Search
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none"
              />
              <input
                ref={inputBusqueda}
                type="text"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setBusqueda("");
                }}
                placeholder="Buscar en el menú..."
                className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-8 py-2 text-xs text-slate-200 placeholder-slate-500 outline-none focus:border-blue-500/60 focus:bg-white/8 transition-all"
              />
              {busqueda && (
                <button
                  onClick={() => {
                    setBusqueda("");
                    inputBusqueda.current?.focus();
                  }}
                  title="Limpiar búsqueda"
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md text-slate-500 hover:text-white hover:bg-white/10 transition-colors"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
          {!collapsed && buscando && resultados.length === 0 && (
            <p className="px-3 py-6 text-center text-[11px] text-slate-500 leading-relaxed">
              Ningún módulo coincide con
              <br />
              <span className="font-bold text-slate-400">&ldquo;{busqueda.trim()}&rdquo;</span>
            </p>
          )}
          {resultados.map((item) => {
            if (!item.children) {
              // Simple link
              const active = item.href ? isActive(item.href) : false;
              return (
                <Link
                  key={item.label}
                  href={item.href || "/"}
                  title={collapsed ? item.label : undefined}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 group relative
                    ${
                      active
                        ? "bg-blue-600/20 text-blue-300 border border-blue-500/30"
                        : "text-slate-400 hover:text-white hover:bg-white/8 border border-transparent"
                    }
                    ${collapsed ? "justify-center" : ""}`}
                >
                  <span
                    className={`flex-shrink-0 transition-colors ${
                      active ? "text-blue-400" : "group-hover:text-white"
                    }`}
                  >
                    <IconoNav nombre={item.icono} size={18} />
                  </span>
                  {!collapsed && (
                    <span className="text-sm font-semibold truncate">
                      {item.label}
                    </span>
                  )}
                  {active && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-blue-400 rounded-r-full" />
                  )}
                </Link>
              );
            }

            // Group with children (ya vienen filtrados por permiso y por la búsqueda)
            const hijosVisibles = item.children;
            const hasActiveChild = hijosVisibles.some(
              (child) => child.href && isActive(child.href)
            );

            /* Cerrado salvo que el usuario lo haya abierto, que contenga la pantalla en
               la que estás (si no, al navegar se perdería el rastro) o que haya una
               búsqueda en curso, donde esconder los resultados no tendría sentido. */
            const isOpen = buscando || (openMenus[item.label] ?? hasActiveChild);

            return (
              <div key={item.label}>
                <button
                  onClick={() => toggleMenu(item.label, isOpen)}
                  title={collapsed ? item.label : undefined}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 group
                    ${
                      hasActiveChild
                        ? "text-blue-300"
                        : "text-slate-400 hover:text-white hover:bg-white/8"
                    }
                    ${collapsed ? "justify-center" : "justify-between"}`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className={`flex-shrink-0 transition-colors ${
                        hasActiveChild
                          ? "text-blue-400"
                          : "group-hover:text-white"
                      }`}
                    >
                      <IconoNav nombre={item.icono} size={18} />
                    </span>
                    {!collapsed && (
                      <span className="text-sm font-semibold truncate">
                        {item.label}
                      </span>
                    )}
                  </div>
                  {!collapsed && (
                    <ChevronDown
                      size={14}
                      className={`flex-shrink-0 transition-transform duration-200 ${
                        isOpen ? "rotate-0" : "-rotate-90"
                      }`}
                    />
                  )}
                </button>

                {/* Children */}
                {!collapsed && isOpen && (
                  <div className="ml-4 mt-0.5 space-y-0.5 border-l border-white/10 pl-2">
                    {hijosVisibles.map((child) => {
                      const childActive = child.href
                        ? isActive(child.href)
                        : false;
                      return (
                        <Link
                          key={child.label}
                          href={child.href || "/"}
                          className={`flex items-center gap-2.5 px-3 py-2 rounded-lg transition-all duration-200 group relative
                            ${
                              childActive
                                ? "bg-blue-600/20 text-blue-300 border border-blue-500/20"
                                : "text-slate-500 hover:text-white hover:bg-white/5 border border-transparent"
                            }`}
                        >
                          <span
                            className={`flex-shrink-0 ${
                              childActive
                                ? "text-blue-400"
                                : "group-hover:text-slate-300"
                            }`}
                          >
                            <IconoNav nombre={child.icono} size={16} />
                          </span>
                          <span className="text-xs font-semibold truncate">
                            {child.label}
                          </span>
                          {childActive && (
                            <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 bg-blue-400 rounded-r-full" />
                          )}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* Footer - Logout */}
        <div className="p-3 border-t border-white/10">
          <button
            onClick={handleLogout}
            title={collapsed ? "Salir" : undefined}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-slate-400 hover:text-red-300 hover:bg-red-500/10 transition-all duration-200 group border border-transparent hover:border-red-500/20
              ${collapsed ? "justify-center" : ""}`}
          >
            <LogOut
              size={18}
              className="flex-shrink-0 group-hover:rotate-12 transition-transform duration-200"
            />
            {!collapsed && (
              <span className="text-sm font-semibold">Salir</span>
            )}
          </button>
        </div>
      </aside>

      {/* Spacer to push content */}
      <div
        className={`flex-shrink-0 print:hidden transition-all duration-300 ${
          collapsed ? "w-[68px]" : "w-64"
        }`}
      />
    </>
  );
}
