"use client";

import { AlertTriangle, History, Ban, Check, DollarSign, Lock } from "lucide-react";
import AvatarJugador from "@/components/AvatarJugador";

/**
 * Lista de jugadores de una convocatoria.
 *
 * Solo llegan aquí los jugadores INSCRITOS en la temporada (la API filtra al resto) y
 * los que ya están dentro de la convocatoria, aunque no lo estén. A quien debe
 * mensualidades se le pinta la advertencia y se le bloquea el botón de convocar: el
 * mismo criterio que aplica el servidor, aquí solo se adelanta para no hacer viajar
 * al usuario hasta el error.
 */

export interface JugadorConvocatoria {
  IdJugador: number;
  Jugador: string;
  Categoria: string;
  Precio: number;
  EsConvocado: number;
  EsEliminado: number;
  EsInvitado: number;
  /** Porcentaje de la beca del torneo: BecaCopas en una copa, BecaLigas en una liga. */
  Beca: string | number | null;
  PagoJugador: number;
  CXC: number;
  /** Tiene inscripción pagada en la temporada. */
  Inscrito: number;
  /** El modelo de inscripción no le aplica (clinics, venta al público). */
  Exento: number;
  /** Meses vencidos sin pagar en la temporada. */
  MesesDebe: number;
  /**
   * El precio se fijó a mano: ni el sincronizado ni convocar lo mueven. Se pone al
   * capturar un importe distinto al del sistema y se quita al volver a ese importe.
   */
  PrecioManual?: number;
  /** Tiene foto en su ficha. La imagen la sirve /api/jugadores/foto. */
  TieneFoto?: number;
  /** Sello para romper el caché del navegador cuando la foto cambia. */
  FotoVersion?: string | null;
}

interface Props {
  players: JugadorConvocatoria[];
  sortConfig: { key: string; direction: "asc" | "desc" } | null;
  onSort: (key: string) => void;
  onConvocar: (player: JugadorConvocatoria) => void;
  onQuitar: (player: JugadorConvocatoria) => void;
  onPrecio: (player: JugadorConvocatoria) => void;
  onHistorial: (player: JugadorConvocatoria) => void;
  onPagosConvocatoria: (player: JugadorConvocatoria) => void;
}

const money = (n: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n || 0);

const MANUAL_TITULO =
  "Precio fijado a mano: no lo cambia el precio de la liga. Para devolverlo al automático, captúralo igual al del sistema.";

const tituloPrecio = (p: JugadorConvocatoria): string => {
  if (p.PrecioManual === 1) return MANUAL_TITULO;
  return p.EsConvocado === 1 ? "Cambiar precio" : "Asignar precio (aún no convocado)";
};

/** Candado que distingue un precio ajustado a mano de uno que sigue al de la liga. */
function CandadoPrecio({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return <Lock size={11} className="inline-block ml-1 -mt-0.5 text-amber-600" aria-label="Precio fijado a mano" />;
}

/** Porcentaje de beca normalizado a 0-100; '', '0' y NULL son "sin beca". */
function becaPct(beca: unknown): number {
  const n = parseFloat(String(beca ?? "").trim());
  return isNaN(n) ? 0 : Math.max(0, Math.min(100, n));
}

/**
 * Lo que hay que advertir de este jugador, o null si viene limpio.
 *
 * Es un aviso, no un candado: a cualquier jugador activo de la categoría se le puede
 * convocar. Refleja `advertenciaConvocatoria` del servidor
 * (src/lib/convocatoria-elegibilidad.ts).
 */
export function advertenciaJugador(p: JugadorConvocatoria): string | null {
  if (!p.Inscrito && !p.Exento) {
    return "No tiene inscripción pagada en la temporada.";
  }
  if (p.MesesDebe > 0) {
    const meses = p.MesesDebe === 1 ? "1 mes" : `${p.MesesDebe} meses`;
    return `Tiene ${meses} de adeudo en la temporada.`;
  }
  return null;
}

const COLUMNAS: { key: string; label: string; alinea: "left" | "right" | "center" }[] = [
  { key: "Jugador", label: "Jugador", alinea: "left" },
  { key: "Categoria", label: "Categoría", alinea: "left" },
  { key: "Precio", label: "Precio", alinea: "right" },
  { key: "PagoJugador", label: "Pago", alinea: "right" },
  { key: "CXC", label: "CXC", alinea: "right" },
  { key: "Estado", label: "Estado", alinea: "center" },
];

export default function ConvocatoriaPlayersTable({
  players,
  sortConfig,
  onSort,
  onConvocar,
  onQuitar,
  onPrecio,
  onHistorial,
  onPagosConvocatoria,
}: Props) {
  if (players.length === 0) {
    return (
      <div className="text-center py-16 bg-white rounded-2xl border border-slate-200 shadow-sm">
        <p className="text-slate-800 font-black">No hay jugadores que mostrar</p>
        <p className="text-xs text-slate-500 mt-1">
          Prueba quitando el filtro de convocados o la búsqueda.
        </p>
      </div>
    );
  }

  /* Este div es EL contenedor de scroll, en los dos ejes a la vez, y por eso los
     encabezados `sticky` se quedan pegados al bajar. Antes había dos divs anidados
     —uno con overflow-hidden y otro con overflow-x-auto— y el sticky se medía contra
     un cuadro que nunca se desplazaba en vertical, así que no hacía nada: quien
     scrolleaba perdía de vista los títulos de las columnas.

     Necesita un padre con altura acotada (flex-1 + min-h-0) para tener contra qué
     desplazarse. */
  return (
    <div className="flex-1 min-h-0 rounded-2xl border border-slate-200 shadow-sm bg-white overflow-auto">
      <table className="min-w-full border-separate border-spacing-0">
          <thead>
            <tr>
              {COLUMNAS.map(({ key, label, alinea }) => (
                <th
                  key={key}
                  onClick={() => onSort(key)}
                  className={`sticky top-0 z-10 bg-slate-800 text-white px-4 py-2.5 text-[10px] font-black uppercase tracking-widest cursor-pointer select-none hover:bg-slate-700 transition-colors whitespace-nowrap ${
                    alinea === "right" ? "text-right" : alinea === "center" ? "text-center" : "text-left"
                  }`}
                >
                  {label}
                  <span className="ml-1 text-blue-300">
                    {sortConfig?.key === key ? (sortConfig.direction === "asc" ? "↑" : "↓") : ""}
                  </span>
                </th>
              ))}
              <th className="sticky top-0 z-10 bg-slate-800 text-white px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-right whitespace-nowrap">
                Acciones
              </th>
            </tr>
          </thead>
          <tbody>
            {players.map((p) => {
              const bloqueo = advertenciaJugador(p);
              const convocado = !!p.EsConvocado;
              const eliminado = !!p.EsEliminado;
              const beca = becaPct(p.Beca);

              /* El color de la fila dice el estado de un vistazo: verde dentro,
                 ámbar se puede convocar pero trae adeudo o le falta inscripción,
                 rojo fuera. */
              const fondo = eliminado
                ? "bg-rose-50/60"
                : convocado
                  ? "bg-emerald-50/60"
                  : bloqueo
                    ? "bg-amber-50/60"
                    : "bg-white";
              const borde = eliminado
                ? "border-l-rose-400"
                : convocado
                  ? "border-l-emerald-500"
                  : bloqueo
                    ? "border-l-amber-400"
                    : "border-l-transparent";

              return (
                <tr
                  key={p.IdJugador}
                  className={`${fondo} hover:bg-slate-100/70 transition-colors border-b border-slate-100 last:border-b-0`}
                >
                  {/* Jugador */}
                  <td className={`px-4 py-2.5 border-l-4 ${borde}`}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <AvatarJugador
                        idJugador={p.IdJugador}
                        nombre={p.Jugador}
                        tieneFoto={p.TieneFoto}
                        fotoVersion={p.FotoVersion}
                        tamano={26}
                      />
                      <span className="text-[10px] font-mono text-slate-400 tabular-nums">
                        {p.IdJugador}
                      </span>
                      <span className={`text-sm font-bold ${eliminado ? "text-slate-400 line-through" : "text-slate-900"}`}>
                        {p.Jugador}
                      </span>
                      {beca > 0 && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-black bg-purple-100 text-purple-700 border border-purple-200">
                          BECA {beca}%
                        </span>
                      )}
                      {p.EsInvitado === 1 && (
                        <span
                          className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-black bg-yellow-100 text-yellow-800 border border-yellow-200"
                          title="Jugador invitado de otra categoría"
                        >
                          INVITADO
                        </span>
                      )}
                    </div>
                    {bloqueo && (
                      <div className="flex items-start gap-1.5 mt-1 text-amber-700">
                        <AlertTriangle size={12} className="flex-shrink-0 mt-0.5" />
                        <span className="text-[11px] font-semibold leading-tight">{bloqueo}</span>
                      </div>
                    )}
                  </td>

                  {/* Categoría */}
                  <td className="px-4 py-2.5 text-xs text-slate-600 whitespace-nowrap">{p.Categoria}</td>

                  {/* Precio: editable siempre, para dejarlo listo antes de convocar. */}
                  <td className="px-4 py-2.5 text-right whitespace-nowrap">
                    <button
                      onClick={() => onPrecio(p)}
                      title={tituloPrecio(p)}
                      className={`text-sm font-bold tabular-nums hover:underline transition-colors ${
                        convocado ? "text-blue-700 hover:text-blue-900" : "text-slate-300 hover:text-slate-500"
                      }`}
                    >
                      {convocado ? money(p.Precio) : "—"}
                      <CandadoPrecio visible={p.PrecioManual === 1} />
                    </button>
                  </td>

                  {/* Pago de esta convocatoria */}
                  <td className="px-4 py-2.5 text-right whitespace-nowrap">
                    {convocado ? (
                      <button
                        onClick={() => onPagosConvocatoria(p)}
                        title="Ver los pagos de esta convocatoria"
                        className="text-sm font-bold tabular-nums text-emerald-700 hover:text-emerald-900 hover:underline transition-colors"
                      >
                        {money(p.PagoJugador)}
                      </button>
                    ) : (
                      <span className="text-sm text-slate-300">—</span>
                    )}
                  </td>

                  {/* CXC */}
                  <td className="px-4 py-2.5 text-right whitespace-nowrap">
                    {convocado ? (
                      <span className={`text-sm font-bold tabular-nums ${p.CXC > 0 ? "text-rose-700" : "text-slate-400"}`}>
                        {money(p.CXC)}
                      </span>
                    ) : (
                      <span className="text-sm text-slate-300">—</span>
                    )}
                  </td>

                  {/* Estado */}
                  <td className="px-4 py-2.5 text-center whitespace-nowrap">
                    {convocado ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800">
                        <Check size={11} strokeWidth={3} /> CONVOCADO
                      </span>
                    ) : eliminado ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-100 text-rose-800">
                        <Ban size={11} /> ELIMINADO
                      </span>
                    ) : bloqueo ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-100 text-amber-800">
                        <AlertTriangle size={11} /> CON ADEUDO
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black bg-slate-100 text-slate-600">
                        DISPONIBLE
                      </span>
                    )}
                  </td>

                  {/* Acciones */}
                  <td className="px-4 py-2.5">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        onClick={() => onHistorial(p)}
                        title={`Historial de pagos de ${p.Jugador}`}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-blue-700 hover:bg-blue-50 transition-colors"
                      >
                        <History size={15} />
                      </button>
                      <button
                        onClick={() => onPrecio(p)}
                        title={p.PrecioManual === 1 ? MANUAL_TITULO : "Cambiar el precio de este jugador"}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                      >
                        <DollarSign size={15} />
                      </button>
                      {convocado ? (
                        <button
                          onClick={() => onQuitar(p)}
                          className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-black transition-colors shadow-sm"
                        >
                          Quitar
                        </button>
                      ) : (
                        <button
                          onClick={() => onConvocar(p)}
                          title={
                            bloqueo
                              ? `${bloqueo} Aun así lo puedes convocar.`
                              : "Convocar a este jugador"
                          }
                          className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-black transition-colors shadow-sm"
                        >
                          Convocar
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
      </table>
    </div>
  );
}
