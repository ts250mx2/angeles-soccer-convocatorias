"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { useUser } from "@/contexts/user-context";
import {
  LayoutDashboard,
  Trophy,
  Users,
  ClipboardList,
  CreditCard,
  ChevronDown,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Shield,
  MapPin,
  UserCheck,
  Banknote,
  LayoutList,
  ShoppingCart,
  Receipt,
} from "lucide-react";

interface NavItem {
  label: string;
  href?: string;
  icon: React.ReactNode;
  children?: NavItem[];
  adminOnly?: boolean;
}

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, season } = useUser();
  const [collapsed, setCollapsed] = useState(false);
  const [openMenus, setOpenMenus] = useState<Record<string, boolean>>({
    "Copas y Ligas": true,
    Caja: true,
    Jugadores: true,
    Ventas: true,
  });

  const navItems: NavItem[] = [
    {
      label: "Dashboard",
      href: "/dashboard",
      icon: <LayoutDashboard size={18} />,
      adminOnly: true,
    },
    {
      label: "Copas y Ligas",
      icon: <Trophy size={18} />,
      children: [
        {
          label: "Convocatorias",
          href: "/",
          icon: <ClipboardList size={16} />,
        },
        {
          label: "Pagos de Copas y Ligas",
          href: "/pagos-copas",
          icon: <Trophy size={16} />,
          adminOnly: true,
        },
      ],
    },
    {
      label: "Caja",
      icon: <Banknote size={18} />,
      adminOnly: true,
      children: [
        {
          label: "Control de Caja",
          href: "/caja",
          icon: <LayoutList size={16} />,
          adminOnly: true,
        },
      ],
    },
    {
      label: "Jugadores",
      icon: <Users size={18} />,
      children: [
        {
          label: "Inscripciones",
          href: "/inscripciones",
          icon: <UserCheck size={16} />,
        },
        {
          label: "Adeudos",
          href: "/adeudos",
          icon: <CreditCard size={16} />,
          adminOnly: true,
        },
        {
          label: "Adeudos por Sede",
          href: "/adeudos/sede",
          icon: <MapPin size={16} />,
          adminOnly: true,
        },
      ],
    },
    {
      label: "Ventas",
      icon: <ShoppingCart size={18} />,
      adminOnly: true,
      children: [
        {
          label: "Ventas de Productos",
          href: "/ventas",
          icon: <ShoppingCart size={16} />,
        },
        {
          label: "Cortes de Caja",
          href: "/caja",
          icon: <Receipt size={16} />,
        },
      ],
    },
  ];

  const toggleMenu = (label: string) => {
    if (collapsed) {
      setCollapsed(false);
      setOpenMenus((prev) => ({ ...prev, [label]: true }));
      return;
    }
    setOpenMenus((prev) => ({ ...prev, [label]: !prev[label] }));
  };

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  };

  const handleLogout = () => {
    router.push("/login");
  };

  return (
    <>
      {/* Mobile overlay */}
      <div
        className={`fixed inset-0 bg-black/50 backdrop-blur-sm z-30 lg:hidden transition-opacity duration-300 ${
          collapsed ? "opacity-0 pointer-events-none" : "opacity-100"
        }`}
        onClick={() => setCollapsed(true)}
      />

      {/* Sidebar */}
      <aside
        className={`fixed left-0 top-0 h-full z-40 flex flex-col transition-all duration-300 ease-in-out
          ${collapsed ? "w-[68px]" : "w-64"}
          bg-slate-900/95 backdrop-blur-xl border-r border-white/10 shadow-2xl`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-white/10 min-h-[64px]">
          {!collapsed && (
            <div className="flex items-center gap-2 overflow-hidden">
              <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center shadow-lg">
                <Shield size={16} className="text-white" />
              </div>
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
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center shadow-lg mx-auto">
              <Shield size={16} className="text-white" />
            </div>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
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
                <p className="text-[10px] text-slate-400 truncate flex items-center gap-1">
                  {(user.AdminConvocatorias ?? 0) >= 2 ? (
                    <>
                      <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />
                      Administrador
                    </>
                  ) : (
                    <>
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-400 inline-block" />
                      Usuario
                    </>
                  )}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
          {navItems.map((item) => {
            // Skip admin-only top-level items
            if (item.adminOnly && (user?.AdminConvocatorias ?? 0) < 2)
              return null;

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
                    {item.icon}
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

            // Group with children
            const isOpen = openMenus[item.label];
            const hasActiveChild = item.children.some(
              (child) => child.href && isActive(child.href)
            );

            return (
              <div key={item.label}>
                <button
                  onClick={() => toggleMenu(item.label)}
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
                      {item.icon}
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
                    {item.children.map((child) => {
                      if (
                        child.adminOnly &&
                        (user?.AdminConvocatorias ?? 0) < 2
                      )
                        return null;

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
                            {child.icon}
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
        className={`flex-shrink-0 transition-all duration-300 ${
          collapsed ? "w-[68px]" : "w-64"
        }`}
      />
    </>
  );
}
