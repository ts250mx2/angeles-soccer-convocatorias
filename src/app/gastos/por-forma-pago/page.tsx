"use client";

import { useMemo } from "react";
import { CreditCard } from "lucide-react";
import ReporteGastos, { type ConfigReporte, type GrupoGasto } from "@/components/gastos/ReporteGastos";

/**
 * Gastos por Forma de Pago: con qué se pagó lo que salió de las sedes.
 *
 * La pantalla entera vive en ReporteGastos; aquí solo se declara la dimensión.
 */
export default function GastosPorFormaPagoPage() {
  const config = useMemo<ConfigReporte>(() => ({
    claveModulo: "/gastos/por-forma-pago",
    titulo: "Gastos por Forma de Pago",
    apiBase: "/api/gastos/por-forma-pago",
    paramGrupo: "idFormaPago",
    etiquetaDimension: "Forma de pago",
    etiquetaDimensionPlural: "Formas de Pago",
    icono: <CreditCard size={20} className="text-rose-400" />,
    normaliza: (f): GrupoGasto => ({
      clave: Number(f.IdFormaPago) || 0,
      etiqueta: String(f.FormaPago ?? "—"),
      Cantidad: Number(f.Cantidad) || 0,
      Total: Number(f.Total) || 0,
    }),
  }), []);

  return <ReporteGastos config={config} />;
}
