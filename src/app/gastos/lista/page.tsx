"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle, CalendarRange, FileDown, FileSpreadsheet, LayoutList, Loader2, Search, X,
} from "lucide-react";
import { useUser } from "@/contexts/user-context";
import DashboardLayout from "@/components/DashboardLayout";
import {
  exportEgresosDetalleToPdf, exportEgresosDetalleToExcel, type EgresoRow,
} from "@/lib/gastos-export";
import {
  PERIODOS, PERIODO_POR_OMISION, etiquetaPeriodo, paramsPeriodo, type Periodo,
} from "@/lib/gastos-periodo";

/**
 * Lista de Gastos: todos los renglones de gasto del período, en una sola tabla.
 *
 * Gastos por Sede contesta "cuánto gastó cada campus" y obliga a entrar sede por sede
 * para ver los renglones. Ésta contesta la otra pregunta, la de "qué se gastó": los
 * muestra todos juntos, ordenados por fecha, y se acota con la búsqueda.
 *
 * Comparte con aquélla los MISMOS períodos (@/lib/gastos-periodo) y el MISMO endpoint
 * —el detalle de egresos, sin acotar la sede—, que es lo que garantiza que las dos
 * pantallas nunca digan cifras distintas del mismo mes.
 *
 * Se trae el período completo y se filtra en el navegador: son unos cientos de renglones
 * y así escribir en el buscador no cuesta un viaje al servidor por letra.
 */

const EXP_BTN =
  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[11px] font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed";
const EXP_PDF = `${EXP_BTN} bg-blue-600/15 hover:bg-blue-600/25 border-blue-500/30 text-blue-200`;
const EXP_XLS = `${EXP_BTN} bg-emerald-600/15 hover:bg-emerald-600/25 border-emerald-500/30 text-emerald-200`;

const money = (n: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n || 0);

export default function ListaGastosPage() {
  const router = useRouter();
  const { user, isInitialized } = useUser();

  const [periodo, setPeriodo] = useState<Periodo>(PERIODO_POR_OMISION);
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [busqueda, setBusqueda] = useState("");

  const [filas, setFilas] = useState<EgresoRow[]>([]);
  const [truncado, setTruncado] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isInitialized && !user) router.push("/login");
  }, [user, isInitialized, router]);

  const cargar = useCallback(async () => {
    const params = paramsPeriodo(periodo, desde, hasta);
    // En rango personalizado no se consulta hasta tener las dos fechas.
    if (!params) return;

    setCargando(true);
    setError(null);
    try {
      const res = await fetch(`/api/gastos/egresos/detalle?${params}`, { cache: "no-store" });
      const json = await res.json();
      if (json.success) {
        setFilas(json.data);
        setTruncado(Boolean(json.truncado));
      } else {
        setError(json.message ?? "Error al cargar los gastos");
        setFilas([]);
      }
    } catch {
      setError("Error de conexión");
      setFilas([]);
    } finally {
      setCargando(false);
    }
  }, [periodo, desde, hasta]);

  useEffect(() => {
    if (isInitialized && user) cargar();
  }, [isInitialized, user, cargar]);

  const etiqueta = etiquetaPeriodo(periodo, desde, hasta);

  /* Se busca por concepto, beneficiario, sede, forma de pago, factura y recibo: son los
     seis por los que alguien viene a esta lista, y cuál recuerde depende de qué esté
     persiguiendo —una factura, un proveedor o un concepto—. */
  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return filas;
    return filas.filter((e) =>
      [e.Concepto, e.PagarA, e.Sede, e.FormaPago, e.Factura, e.Recibo].some((campo) =>
        String(campo ?? "").toLowerCase().includes(q),
      ),
    );
  }, [filas, busqueda]);

  const total = visibles.reduce((s, e) => s + e.Total, 0);
  const subtotal = visibles.reduce((s, e) => s + e.Subtotal, 0);
  const iva = visibles.reduce((s, e) => s + e.Iva, 0);

  /* Se exporta LO QUE SE VE, con la búsqueda aplicada: quien filtró por un proveedor y
     aprieta PDF quiere ese proveedor, no el período entero. El subtítulo lo dice para
     que el papel no se pueda confundir con el listado completo. */
  const subtituloExport = [
    etiqueta,
    busqueda.trim() ? `Filtro: "${busqueda.trim()}"` : null,
    `${visibles.length} ${visibles.length === 1 ? "gasto" : "gastos"}`,
  ].filter(Boolean).join(" · ");

  return (
    <DashboardLayout>
      <main className="p-4 md:p-8 overflow-y-auto flex-1">
        <div className="max-w-[1500px] mx-auto">
          <div className="bg-[#0f172a] rounded-xl shadow-2xl p-4 md:p-6 border border-white/20">

            {/* Encabezado */}
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 mb-5">
              <div>
                <h2 className="text-2xl md:text-3xl font-bold text-white flex items-center gap-3">
                  <LayoutList className="text-blue-400" size={28} />
                  Lista de Gastos
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Todos los gastos del período, renglón por renglón.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => exportEgresosDetalleToPdf(visibles, "Lista de Gastos", subtituloExport)}
                  disabled={cargando || visibles.length === 0}
                  className={EXP_PDF}
                >
                  <FileDown size={13} /> PDF
                </button>
                <button
                  onClick={() => exportEgresosDetalleToExcel(visibles, "Lista de Gastos", subtituloExport)}
                  disabled={cargando || visibles.length === 0}
                  className={EXP_XLS}
                >
                  <FileSpreadsheet size={13} /> Excel
                </button>
              </div>
            </div>

            {/* Período: los mismos botones que Gastos por Sede */}
            <div className="flex flex-wrap items-center gap-1.5 mb-3">
              <CalendarRange size={15} className="text-blue-400 mr-1" />
              {PERIODOS.map((p) => (
                <button
                  key={p.key}
                  onClick={() => setPeriodo(p.key)}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all border ${
                    periodo === p.key
                      ? "bg-blue-600 border-blue-500 text-white"
                      : "bg-white/5 border-white/10 text-slate-300 hover:bg-white/10"
                  }`}
                >
                  {p.label}
                </button>
              ))}

              {periodo === "custom" && (
                <span className="flex items-center gap-1.5 ml-1">
                  <input
                    type="date"
                    value={desde}
                    onChange={(e) => setDesde(e.target.value)}
                    className="bg-white/5 border border-white/15 rounded-lg px-2 py-1.5 text-[11px] text-slate-200 [color-scheme:dark]"
                  />
                  <span className="text-slate-500 text-[11px]">a</span>
                  <input
                    type="date"
                    value={hasta}
                    onChange={(e) => setHasta(e.target.value)}
                    className="bg-white/5 border border-white/15 rounded-lg px-2 py-1.5 text-[11px] text-slate-200 [color-scheme:dark]"
                  />
                </span>
              )}
            </div>

            {/* Buscador */}
            <div className="relative max-w-sm mb-4">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
              <input
                type="text"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar por concepto, quién cobró, sede, factura..."
                className="w-full bg-white/5 border border-white/15 rounded-lg pl-9 pr-8 py-2 text-xs text-slate-100 placeholder-slate-500 outline-none focus:border-blue-500/60 transition-colors"
              />
              {busqueda && (
                <button
                  type="button"
                  onClick={() => setBusqueda("")}
                  title="Limpiar la búsqueda"
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-slate-500 hover:text-white hover:bg-white/10 transition-colors"
                >
                  <X size={12} />
                </button>
              )}
            </div>

            {/* Totales de lo que se está viendo */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <Cifra etiqueta="Gastos" valor={String(visibles.length)} clase="text-white" />
              <Cifra etiqueta="Subtotal" valor={money(subtotal)} clase="text-slate-300" />
              <Cifra etiqueta="IVA" valor={money(iva)} clase="text-slate-300" />
              <Cifra etiqueta="Total" valor={money(total)} clase="text-rose-300" />
            </div>

            {error && (
              <div className="mb-4 px-4 py-3 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-200 text-sm font-bold flex items-start gap-2">
                <AlertCircle size={16} className="flex-shrink-0 mt-0.5" /> {error}
              </div>
            )}

            {/* El tope del servidor. Callarlo dejaría creer que el período no tiene más. */}
            {truncado && (
              <div className="mb-4 px-4 py-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-[11px] font-bold flex items-start gap-2">
                <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
                El período trae más renglones de los que se pueden listar de una vez. Acota
                el rango de fechas para verlos todos.
              </div>
            )}

            {periodo === "custom" && (!desde || !hasta) ? (
              <p className="text-center py-16 text-slate-400 text-sm font-bold">
                Elige las dos fechas del rango.
              </p>
            ) : cargando ? (
              <div className="flex items-center justify-center gap-2 py-16 text-slate-400">
                <Loader2 size={22} className="animate-spin" />
                <span className="text-sm font-bold">Cargando los gastos...</span>
              </div>
            ) : visibles.length === 0 ? (
              <div className="text-center py-16">
                <p className="text-slate-300 font-bold text-sm">
                  {filas.length === 0 ? "No hay gastos en este período" : "Ningún gasto con ese texto"}
                </p>
                <p className="text-slate-500 text-xs mt-1">
                  {filas.length === 0
                    ? "Prueba con otro período o un rango de fechas distinto."
                    : `Son ${filas.length} en el período. Limpia la búsqueda para verlos todos.`}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-white/10">
                <table className="w-full min-w-[1000px]">
                  <thead>
                    <tr className="bg-slate-800">
                      {["Fecha", "Sede", "Concepto", "Pagar a", "Forma de pago", "Factura", "Recibo",
                        "Subtotal", "IVA", "Total"].map((h, i) => (
                        <th
                          key={h}
                          className={`px-3 py-2 text-[9px] font-black text-slate-400 uppercase tracking-widest ${
                            i >= 7 ? "text-right" : "text-left"
                          }`}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {visibles.map((e) => (
                      <tr
                        key={e.IdEgreso}
                        className="border-b border-white/5 last:border-b-0 hover:bg-white/[0.04] transition-colors"
                      >
                        <td className="px-3 py-2 text-[11px] text-slate-300 whitespace-nowrap tabular-nums">{e.Fecha}</td>
                        <td className="px-3 py-2 text-[11px] text-slate-400 whitespace-nowrap">{e.Sede}</td>
                        <td className="px-3 py-2 text-[11px] text-slate-100 font-semibold">{e.Concepto}</td>
                        <td className="px-3 py-2 text-[11px] text-slate-300">{e.PagarA}</td>
                        <td className="px-3 py-2 text-[11px] text-slate-400 whitespace-nowrap">{e.FormaPago}</td>
                        <td className="px-3 py-2 text-[11px] text-slate-500 whitespace-nowrap">{e.Factura}</td>
                        <td className="px-3 py-2 text-[11px] text-slate-500 whitespace-nowrap">{e.Recibo}</td>
                        <td className="px-3 py-2 text-[11px] text-right tabular-nums text-slate-400">{money(e.Subtotal)}</td>
                        <td className="px-3 py-2 text-[11px] text-right tabular-nums text-slate-400">{money(e.Iva)}</td>
                        <td className="px-3 py-2 text-[11px] text-right tabular-nums font-black text-rose-300">{money(e.Total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </main>
    </DashboardLayout>
  );
}

/** Una cifra del período. Refleja lo VISIBLE, no lo traído: si no, contradiría la tabla. */
function Cifra({ etiqueta, valor, clase }: { etiqueta: string; valor: string; clase: string }) {
  return (
    <div className="rounded-xl px-4 py-3 border bg-white/5 border-white/10">
      <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">{etiqueta}</p>
      <p className={`text-xl font-black tabular-nums ${clase}`}>{valor}</p>
    </div>
  );
}
