"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { BookOpen, Printer, Search, ExternalLink } from "lucide-react";
import { useUser } from "@/contexts/user-context";
import DashboardLayout from "@/components/DashboardLayout";
import { NAV_ITEMS, puedeVer } from "@/components/Sidebar";
import {
  INTRO, CIERRE, POR_CLAVE, type Bloque, type SeccionManual,
} from "@/lib/manual-contenido";

/** Sección resuelta con la ruta del módulo, para poder enlazarlo. */
interface SeccionVisible {
  seccion: SeccionManual;
  /** Ruta del módulo en la app; ausente en las secciones generales. */
  href?: string;
  /** Ruta dentro del menú, p. ej. "Jugadores › Adeudos por Sede". */
  ruta?: string;
}

/** Convierte **negritas** en nodos, sin insertar HTML crudo. */
function conNegritas(texto: string) {
  return texto.split(/(\*\*[^*]+\*\*)/g).map((parte, i) =>
    parte.startsWith("**") && parte.endsWith("**")
      ? <strong key={i} className="font-black text-white">{parte.slice(2, -2)}</strong>
      : <span key={i}>{parte}</span>
  );
}

const NOTA_ESTILO = {
  ojo: { caja: "bg-amber-500/10 border-amber-500/40", tag: "text-amber-300" },
  calculo: { caja: "bg-blue-500/10 border-blue-500/40", tag: "text-blue-300" },
  cuidado: { caja: "bg-rose-500/10 border-rose-500/40", tag: "text-rose-300" },
} as const;

function BloqueVista({ bloque }: { bloque: Bloque }) {
  switch (bloque.tipo) {
    case "subtitulo":
      return <h3 className="text-sm font-black text-white mt-6 mb-2 tracking-tight">{bloque.texto}</h3>;
    case "parrafo":
      return <p className="text-sm text-slate-300 leading-relaxed mb-3 max-w-3xl">{conNegritas(bloque.texto)}</p>;
    case "lista":
      return (
        <ul className="mb-3 space-y-1.5 max-w-3xl">
          {bloque.items.map((it, i) => (
            <li key={i} className="text-sm text-slate-300 leading-relaxed flex gap-2">
              <span className="text-blue-400 flex-shrink-0 mt-1.5">&bull;</span>
              <span>{conNegritas(it)}</span>
            </li>
          ))}
        </ul>
      );
    case "pasos":
      return (
        <ol className="mb-3 space-y-2 max-w-3xl">
          {bloque.items.map((it, i) => (
            <li key={i} className="text-sm text-slate-300 leading-relaxed flex gap-3">
              <span className="flex-shrink-0 w-5 h-5 rounded-md bg-blue-600 text-white text-[11px] font-black flex items-center justify-center mt-0.5">
                {i + 1}
              </span>
              <span>{conNegritas(it)}</span>
            </li>
          ))}
        </ol>
      );
    case "formula":
      return (
        <div className="my-4 bg-slate-950/60 border border-white/10 rounded-xl p-4 overflow-x-auto">
          {bloque.lineas.map((l, i) => (
            <p key={i} className="font-mono text-[12px] text-slate-300 whitespace-pre leading-relaxed">{l}</p>
          ))}
        </div>
      );
    case "nota": {
      const e = NOTA_ESTILO[bloque.estilo];
      return (
        <div className={`my-4 border-l-4 rounded-r-xl px-4 py-3 max-w-3xl ${e.caja}`}>
          <p className={`text-[10px] font-black uppercase tracking-widest mb-1 ${e.tag}`}>{bloque.titulo}</p>
          <p className="text-sm text-slate-200 leading-relaxed">{conNegritas(bloque.texto)}</p>
        </div>
      );
    }
    case "imagen":
      return (
        <figure className="my-5 max-w-3xl">
          <Image
            src={bloque.src}
            alt={bloque.alt}
            width={bloque.ancho}
            height={bloque.alto}
            unoptimized
            className="w-full h-auto rounded-2xl border border-white/10"
          />
          {bloque.pie && (
            <figcaption className="mt-2 text-xs text-slate-400 leading-relaxed">
              {conNegritas(bloque.pie)}
            </figcaption>
          )}
        </figure>
      );
    case "tabla":
      return (
        <div className="my-4 overflow-x-auto">
          <table className="w-full min-w-[420px] border border-white/10 rounded-xl overflow-hidden">
            <thead>
              <tr className="bg-white/5">
                {bloque.encabezados.map((h) => (
                  <th key={h} className="text-left text-[10px] font-black uppercase tracking-widest text-slate-400 px-4 py-2.5">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bloque.filas.map((fila, i) => (
                <tr key={i} className="border-t border-white/5">
                  {fila.map((celda, j) => (
                    <td key={j} className="px-4 py-2.5 text-sm text-slate-300 align-top leading-relaxed">
                      {conNegritas(celda)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
  }
}

export default function ManualPage() {
  const router = useRouter();
  const { user, isInitialized } = useUser();
  const [busqueda, setBusqueda] = useState("");

  useEffect(() => {
    if (isInitialized && !user) router.push("/login");
  }, [user, isInitialized, router]);

  /* Recorre el MISMO menú que pinta el sidebar y arma las secciones que este usuario
     puede ver. Si mañana se agrega o restringe un módulo, el manual lo sigue solo. */
  const visibles = useMemo<SeccionVisible[]>(() => {
    const out: SeccionVisible[] = [];
    const vistas = new Set<string>();

    const agrega = (clave: string, href?: string, ruta?: string) => {
      const seccion = POR_CLAVE[clave];
      if (!seccion || vistas.has(clave)) return;
      vistas.add(clave);
      out.push({ seccion, href, ruta });
    };

    for (const item of NAV_ITEMS) {
      if (!puedeVer(item, user)) continue;

      if (item.children) {
        const hijosVisibles = item.children.filter((c) => puedeVer(c, user));
        if (hijosVisibles.length === 0) continue;
        /* Un grupo puede tener una sección de conjunto (p. ej. Ventas) y ADEMÁS
           secciones propias de algunos hijos; se pintan las dos cosas. */
        const grupo = `grupo:${item.label}`;
        if (POR_CLAVE[grupo]) agrega(grupo, hijosVisibles[0].href, item.label);
        for (const hijo of hijosVisibles) {
          if (hijo.href) agrega(hijo.href, hijo.href, `${item.label} › ${hijo.label}`);
        }
        continue;
      }
      if (item.href) agrega(item.href, item.href, item.label);
    }
    return out;
  }, [user]);

  const todas: SeccionVisible[] = useMemo(
    () => [
      ...INTRO.map((s) => ({ seccion: s })),
      ...visibles,
      ...CIERRE.map((s) => ({ seccion: s })),
    ],
    [visibles],
  );

  const q = busqueda.trim().toLowerCase();
  const filtradas = q
    ? todas.filter(({ seccion }) =>
        seccion.titulo.toLowerCase().includes(q) ||
        JSON.stringify(seccion.bloques).toLowerCase().includes(q))
    : todas;

  const idDe = (s: SeccionManual) => `sec-${s.clave.replace(/[^a-zA-Z0-9]/g, "-")}`;

  return (
    <DashboardLayout>
      <main className="overflow-y-auto flex-1 text-white p-6 md:p-8">
        <div className="max-w-6xl mx-auto">

          <div className="mb-8 flex flex-col md:flex-row md:items-end md:justify-between gap-5 print:hidden">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <div className="bg-blue-500/15 p-2 rounded-xl border border-blue-500/20">
                  <BookOpen size={18} className="text-blue-400" />
                </div>
                <h1 className="text-3xl font-black text-white">Manual de Operación</h1>
              </div>
              <p className="text-slate-400 max-w-2xl">
                Cómo operar cada módulo y qué significa cada número. Solo aparecen los
                módulos a los que tiene acceso tu usuario.
              </p>
            </div>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-2 h-[42px] px-4 rounded-xl text-sm font-black text-white bg-white/10 hover:bg-white/20 border border-white/15 transition-all self-start"
            >
              <Printer size={15} /> Imprimir
            </button>
          </div>

          <div className="mb-8 relative max-w-md print:hidden">
            <Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar en el manual..."
              className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-3 outline-none focus:bg-white/10 focus:border-blue-500/50 transition-all text-white placeholder-slate-400"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)] gap-8 items-start">
            <nav className="hidden lg:block sticky top-6 print:hidden">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-3">Contenido</p>
              <ul className="space-y-0.5">
                {filtradas.map(({ seccion }) => (
                  <li key={seccion.clave}>
                    <a
                      href={`#${idDe(seccion)}`}
                      className="block px-3 py-1.5 rounded-lg text-[13px] text-slate-400 hover:text-blue-300 hover:bg-blue-500/10 border-l-2 border-transparent hover:border-blue-500 transition-all"
                    >
                      {seccion.titulo}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>

            <div className="min-w-0">
              {filtradas.length === 0 ? (
                <div className="text-center py-20 bg-white/5 rounded-3xl border border-dashed border-white/20">
                  <Search size={40} className="mx-auto text-slate-500 mb-3 opacity-30" />
                  <h3 className="text-lg font-bold text-slate-300">Sin resultados</h3>
                  <p className="text-slate-500 mt-1 text-sm">No hay secciones que mencionen &quot;{busqueda}&quot;.</p>
                </div>
              ) : (
                <div className="space-y-10">
                  {filtradas.map(({ seccion, href, ruta }) => (
                    <section
                      key={seccion.clave}
                      id={idDe(seccion)}
                      className="scroll-mt-6 bg-white/[0.03] border border-white/10 rounded-2xl p-6"
                    >
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <h2 className="text-xl font-black text-white tracking-tight">{seccion.titulo}</h2>
                        {seccion.audiencia.map((a) => (
                          <span
                            key={a}
                            className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border ${
                              a === "operacion"
                                ? "text-emerald-300 bg-emerald-500/10 border-emerald-500/30"
                                : "text-blue-300 bg-blue-500/10 border-blue-500/30"
                            }`}
                          >
                            {a === "operacion" ? "Operación" : "Dirección"}
                          </span>
                        ))}
                      </div>
                      {ruta && (
                        <div className="flex items-center gap-2 mb-4">
                          <span className="text-[11px] text-slate-500">{ruta}</span>
                          {href && (
                            <Link
                              href={href}
                              className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-400 hover:text-blue-300 print:hidden"
                            >
                              Ir al módulo <ExternalLink size={11} />
                            </Link>
                          )}
                        </div>
                      )}
                      <div className={ruta ? "" : "mt-4"}>
                        {seccion.bloques.map((b, i) => <BloqueVista key={i} bloque={b} />)}
                      </div>
                    </section>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </DashboardLayout>
  );
}
