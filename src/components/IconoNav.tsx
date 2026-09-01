"use client";

import {
  Award,
  LayoutDashboard,
  Trophy,
  Users,
  ClipboardList,
  MapPin,
  UserCheck,
  Banknote,
  LayoutList,
  ShoppingCart,
  Receipt,
  CalendarRange,
  LayoutGrid,
  Boxes,
  CalendarDays,
  CalendarCheck,
  CreditCard,
  GraduationCap,
  QrCode,
  Bot,
  Ban,
  BookOpen,
  ShieldCheck,
  UserCog,
  UserPlus,
  UserRoundPlus,
  Shirt,
  Goal,
} from "lucide-react";
import type { IconoNav as NombreIcono } from "@/lib/navegacion";

/**
 * Traduce el nombre del icono que guarda el catálogo de navegación al componente que
 * lo dibuja. El catálogo no puede importar lucide-react (lo lee también el servidor),
 * así que la traducción vive aquí y la usan el menú y la pantalla de permisos.
 */
const ICONOS: Record<NombreIcono, React.ElementType> = {
  Award,
  LayoutDashboard,
  Trophy,
  Users,
  ClipboardList,
  MapPin,
  UserCheck,
  Banknote,
  LayoutList,
  ShoppingCart,
  Receipt,
  CalendarRange,
  LayoutGrid,
  Boxes,
  CalendarDays,
  CalendarCheck,
  CreditCard,
  GraduationCap,
  QrCode,
  Bot,
  Ban,
  BookOpen,
  ShieldCheck,
  UserCog,
  UserPlus,
  UserRoundPlus,
  Shirt,
  Goal,
};

export default function IconoNav({
  nombre,
  size = 18,
  className,
}: {
  nombre: NombreIcono;
  size?: number;
  className?: string;
}) {
  const Componente = ICONOS[nombre];
  return <Componente size={size} className={className} />;
}
