"use client";

import { useMemo } from "react";
import { LayoutGrid } from "lucide-react";
import ReporteGastos, { type ConfigReporte, type GrupoGasto } from "@/components/gastos/ReporteGastos";

/**
 * Gastos por Tipo: pago a personal contra pago a proveedor.
 *
 * La pantalla entera vive en ReporteGastos; aquí solo se declara la dimensión.
 */
export default function GastosPorTipoPage() {
  const config = useMemo<ConfigReporte>(() => ({
    claveModulo: "/gastos/por-tipo",
    titulo: "Gastos por Tipo",
    apiBase: "/api/gastos/por-tipo",
    paramGrupo: "tipo",
    etiquetaDimension: "Tipo de gasto",
    etiquetaDimensionPlural: "Tipos de Gasto",
    icono: <LayoutGrid size={20} className="text-rose-400" />,
    normaliza: (f): GrupoGasto => ({
      clave: Number(f.TipoClave) || 0,
      etiqueta: String(f.TipoEgreso ?? "—"),
      Cantidad: Number(f.Cantidad) || 0,
      Total: Number(f.Total) || 0,
    }),
  }), []);

  return <ReporteGastos config={config} />;
}
