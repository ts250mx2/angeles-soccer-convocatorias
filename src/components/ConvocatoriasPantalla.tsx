"use client";

/*
 * La pantalla de Convocatorias, compartida por sus tres rutas: la portada completa (/),
 * solo copas (/convocatorias/copas) y solo ligas (/convocatorias/ligas). Es el mismo
 * trabajo con distinto corte, asi que vive en un componente y cada ruta le dice cual
 * quiere; duplicarla habria dejado tres copias que se desincronizan a la primera.
 */
import { acentoDe, type TipoTorneo } from '@/lib/acento-torneo';
import { useRouter } from 'next/navigation';
import {
  Search, History, Info, LayoutGrid, List,
  X, FileSpreadsheet, FileText, UserPlus, Loader2, Trophy,
} from 'lucide-react';
import { useUser } from '@/contexts/user-context';
import { useEffect, useState } from 'react';
import ExcelJS from 'exceljs';
import jsPDF from 'jspdf';
import { presentarPdf } from '@/lib/pdf-preview';
import autoTable from 'jspdf-autotable';
import DashboardLayout from '@/components/DashboardLayout';
import PlayerPagosModal, { type PagosTarget } from '@/components/PlayerPagosModal';
import ConvocatoriaPlayersTable from '@/components/ConvocatoriaPlayersTable';
import { ELIMINATORIAS, etiquetaJornadas } from '@/lib/convocatoria-opciones';
import TarjetaCopaLiga from '@/components/TarjetaCopaLiga';
import { resumirPorCopaLiga, totalesGenerales } from '@/lib/convocatorias-resumen';
import { TIPO_COPA } from '@/lib/copas-ligas';

/**
 * Porcentaje de beca del jugador, normalizado a 0-100. La columna guarda texto
 * ('', '0', '50', '100'), así que cualquier cosa no numérica cuenta como sin beca.
 */
function becaPct(beca: unknown): number {
  const n = parseFloat(String(beca ?? '').trim());
  return isNaN(n) ? 0 : Math.max(0, Math.min(100, n));
}

/** Etiqueta corta de la beca; null cuando no tiene. */
function etiquetaBeca(beca: unknown): string | null {
  const pct = becaPct(beca);
  return pct > 0 ? `Beca ${pct}%` : null;
}

interface ConvocatoriaSummary {
  IdTemporada: number;
  IdLiga: number;
  Categoria: string;
  Color?: string;
  IdProfesor?: number;
  Profesor?: string;
  Liga: string;
  /** tblLigas.IdTipoLiga: 1 liga, 2 copa. */
  IdTipoLiga?: number;
  FechaInicio: string;
  FechaFin: string;
  Cerrada: number;
  JugadoresConvocados: number;
  Total: number;
  Pagos: number;
  CXC: number;
  CostoLiga?: number;
  CostoProfesor?: number;
  CostoArbitro?: number;
  CantidadJornadas?: number | null;
  Eliminatoria?: string | null;
  /** Escudo del torneo, del catálogo de Copas y Ligas. */
  TieneFoto?: number;
  /** Sello para romper el caché del navegador cuando la foto cambia. */
  FotoVersion?: string | null;
}

/** URL del escudo de la liga, o null si esa copa o liga no tiene foto cargada. */
const fotoLiga = (item: Pick<ConvocatoriaSummary, 'IdLiga' | 'TieneFoto' | 'FotoVersion'>): string | null =>
  item.TieneFoto === 1 ? `/api/copas-ligas/foto/${item.IdLiga}?v=${item.FotoVersion ?? '0'}` : null;

const moneda = (n: number): string =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n || 0);

/** Una de las cuatro cifras del encabezado de la convocatoria. */
function CifraConvocatoria({ etiqueta, valor, clase }: { etiqueta: string; valor: string; clase: string }) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-xl px-3 py-2">
      <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">{etiqueta}</p>
      <p className={`text-base md:text-lg font-black leading-tight tabular-nums ${clase}`}>{valor}</p>
    </div>
  );
}

export default function ConvocatoriasPantalla({ tipo }: { tipo?: TipoTorneo }) {
  /* Ámbar las copas, azul las ligas: las dos mitades son la misma pantalla. */
  const acento = acentoDe(tipo);
  const router = useRouter();
  const { user, season, seasonId, setSeason, isInitialized } = useUser();

  /* Poder abrir la pantalla ES el permiso: quien llega aquí ya pasó el filtro de páginas
     de su perfil. Adentro no hay un segundo nivel, así que da de alta, edita y ve la
     tarjeta completa. */
  const puedeEditar = !!user;
  const [convocatorias, setConvocatorias] = useState<ConvocatoriaSummary[]>([]);
  const [profesores, setProfesores] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);



  // Edit Modal State
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editConvocatoria, setEditConvocatoria] = useState({
    oldColor: '',
    newColor: '',
    fechaInicio: '',
    fechaFin: '',
    idProfesor: '' as string | number,
    costoLiga: '',
    costoProfesor: '',
    costoArbitro: '',
    cantidadJornadas: '',
    eliminatoria: ''
  });

  // Players Modal State
  const [isPlayersModalOpen, setIsPlayersModalOpen] = useState(false);
  const [selectedConvocatoria, setSelectedConvocatoria] = useState<ConvocatoriaSummary | null>(null);
  const [players, setPlayers] = useState<any[]>([]);
  const [totalPrice, setTotalPrice] = useState<number>(0);
  const [totalPagos, setTotalPagos] = useState<number>(0);
  const [totalCXC, setTotalCXC] = useState<number>(0);
  const [recordCount, setRecordCount] = useState<number>(0);
  const [isLoadingPlayers, setIsLoadingPlayers] = useState(false);
  const [busquedaJugador, setBusquedaJugador] = useState('');
  const [playerSortConfig, setPlayerSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);

  // Invite Modal State
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [availablePlayers, setAvailablePlayers] = useState<any[]>([]);
  const [isLoadingAvailablePlayers, setIsLoadingAvailablePlayers] = useState(false);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string>('');
  const [playerSearchQuery, setPlayerSearchQuery] = useState<string>('');
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
  const [showClosed, setShowClosed] = useState(false);
  /* Arranca en false: al abrir una convocatoria se ve la plantilla completa, que es
     desde donde se convoca. Filtrar a los ya convocados es lo que se hace al final,
     para revisar la lista cerrada. */
  const [showOnlyConvocados, setShowOnlyConvocados] = useState(false);
  const [showOnlyBecados, setShowOnlyBecados] = useState(false);
  const [summarySearchQuery, setSummarySearchQuery] = useState('');
  /* Tarjetas por defecto: es como se leía esta pantalla y la tabla queda de apoyo
     para comparar cifras entre convocatorias. */
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('cards');
  const [playerPayments, setPlayerPayments] = useState<any[]>([]);
  const [isPaymentDetailsModalOpen, setIsPaymentDetailsModalOpen] = useState(false);
  const [isLoadingPayments, setIsLoadingPayments] = useState(false);
  const [jugadorPagosConvocatoria, setJugadorPagosConvocatoria] = useState<PagosTarget | null>(null);
  /* Historial de pagos del jugador (todos sus pagos: inscripción, mensualidades,
     copas…), no solo lo que abonó a esta convocatoria. Reutiliza el mismo modal
     que Inscripciones y Adeudos para no tener dos vistas del mismo dato. */
  const [pagosTarget, setPagosTarget] = useState<PagosTarget | null>(null);

  // Check if user is logged in, redirect to login if not
  useEffect(() => {
    if (isInitialized && !user) {
      router.push('/login');
    }
  }, [user, isInitialized, router]);


  /**
   * Pone al corriente lo que YA existe y averigua qué faltaría.
   *
   * Antes esta llamada creaba sola las convocatorias de las ligas y copas pagadas.
   * Ahora solo avisa: las que falten se dan de alta desde la pantalla de alta, con los
   * renglones precargados. Lo que sí sigue haciendo el servidor es marcar como
   * convocado a quien ya pagó y refrescar precios, que no crea nada.
   *
   * Solo lo dispara la administración, y si falla no se interrumpe la pantalla.
   */
  const revisarPendientes = async () => {
    if (!puedeEditar) return;
    try {
      const res = await fetch('/api/convocatorias/pendientes', { method: 'POST' });
      const json = await res.json();
      if (json.success) setFaltantes(json.faltantes ?? []);
    } catch (error) {
      console.error('Error revisando convocatorias pendientes:', error);
    }
  };

  // Fetch convocatorias summary
  const fetchConvocatorias = async () => {
    setIsLoading(true);
    try {
      await revisarPendientes();
      const response = await fetch(`/api/convocatorias/summary`);
      const data = await response.json();
      if (data.success) {
        setConvocatorias(data.data);
      } else {
        console.error('Error fetching convocatorias:', data.message);
        alert('Error al cargar convocatorias: ' + data.message);
      }
    } catch (error) {
      console.error('Error invoking API:', error);
      alert('Ocurrió un error al cargar los datos.');
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch convocatorias summary on mount
  useEffect(() => {
    if (isInitialized && user) {
      fetchConvocatorias();
    }
  }, [isInitialized, user]);

  // Fetch current season and leagues
  useEffect(() => {
    fetch('/api/season')
      .then(res => res.json())
      .then(data => {
        if (data.success && data.season) {
          setSeason(data.season.Temporada, data.season.IdTemporada);
        }
      })
      .catch(err => console.error('Error fetching season:', err));

    fetch('/api/users')
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setProfesores(data.data);
        }
      })
      .catch(err => console.error('Error fetching professors:', err));

  }, [setSeason]);

  /* Portada por torneo: null = se ven las copas y ligas; con IdLiga, el detalle de
     ese torneo, que es la misma vista de tarjetas y tabla de siempre. */
  const [ligaAbierta, setLigaAbierta] = useState<number | null>(null);
  /* Pagos de copas y ligas sin convocatoria: se avisan, no se crean solas. */
  const [faltantes, setFaltantes] = useState<Array<{ idLiga: number; liga: string; idTipoLiga?: number; categoria: string; jugadores: number }>>([]);

  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  /* Lo que el usuario puede ver ahora mismo, sin acotar todavía a un torneo: de aquí
     sale el resumen de la portada, que tiene que contar TODAS las copas y ligas. */
  const convocatoriasVisibles = convocatorias.filter((item) => {
    // Filter by closed status if toggle is off
    if (!showClosed && item.Cerrada === 1) return false;

    const q = summarySearchQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      item.Liga.toLowerCase().includes(q) ||
      item.Categoria.toLowerCase().includes(q) ||
      (item.Profesor ?? '').toLowerCase().includes(q) ||
      (item.Color ?? '').toLowerCase().includes(q)
    );
  });

  /* Y lo mismo acotado al torneo abierto. Todo lo que había antes —tabla, tarjetas,
     exportaciones y el pie— cuelga de aquí, así que al entrar a una copa se ve y se
     exporta solo esa. */
  const filteredConvocatorias = ligaAbierta === null
    ? convocatoriasVisibles
    : convocatoriasVisibles.filter((item) => item.IdLiga === ligaAbierta);

  const resumenLigas = resumirPorCopaLiga(convocatoriasVisibles);
  /* Copas y ligas van en bloques aparte: son dos negocios distintos —la copa es un
     torneo con fecha, la liga es un ciclo— y mezclarlas en una sola rejilla obligaba a
     leer la etiqueta de cada tarjeta para saber qué se estaba comparando. */
  /* Con tipo fijo, la ruta ya dijo qué se ve: el otro bloque queda vacío y ni siquiera
     se dibuja su encabezado. Sin tipo, salen los dos. */
  const copas = tipo === 'liga' ? [] : resumenLigas.filter((r) => r.esCopa);
  const ligas = tipo === 'copa' ? [] : resumenLigas.filter((r) => !r.esCopa);
  const totalesCopas = totalesGenerales(copas);
  const totalesLigas = totalesGenerales(ligas);
  const totalesPortada = totalesGenerales([...copas, ...ligas]);
  const ligaActual = ligaAbierta === null
    ? null
    : resumenLigas.find((r) => r.idLiga === ligaAbierta) ?? null;

  /* El aviso se agrupa por torneo: dar de alta se hace por copa o liga, con todas sus
     categorías juntas, que es como está armada la pantalla de alta. */
  const faltantesPorLiga = Object.values(
    faltantes
      // En la pantalla de un tipo, los pendientes del otro no son asunto suyo.
      .filter((f) => !tipo || (tipo === 'copa') === (Number(f.idTipoLiga) === TIPO_COPA))
      .reduce<Record<number, { idLiga: number; liga: string; categorias: string[]; jugadores: number }>>(
      (acc, f) => {
        const g = acc[f.idLiga] ?? { idLiga: f.idLiga, liga: f.liga, categorias: [], jugadores: 0 };
        g.categorias.push(f.categoria);
        g.jugadores += f.jugadores;
        return { ...acc, [f.idLiga]: g };
      },
      {},
    ),
  );

  const sortedConvocatorias = [...filteredConvocatorias].sort((a, b) => {
    if (!sortConfig) return 0;
    const { key, direction } = sortConfig;
    const getSortValue = (item: ConvocatoriaSummary, key: string) => {
      if (key === 'CXC') return item.Total - item.Pagos;
      const val = item[key as keyof ConvocatoriaSummary];
      if (val === undefined || val === null) return typeof val === 'number' ? 0 : '';
      return val;
    };

    const aValue = getSortValue(a, key) ?? '';
    const bValue = getSortValue(b, key) ?? '';

    if (aValue < bValue) {
      return direction === 'asc' ? -1 : 1;
    }
    if (aValue > bValue) {
      return direction === 'asc' ? 1 : -1;
    }
    return 0;
  });

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleDateString('es-MX', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const handleOpenEditModal = (item: ConvocatoriaSummary) => {
    setSelectedConvocatoria(item);
    setEditConvocatoria({
      oldColor: item.Color || '',
      newColor: item.Color || '',
      fechaInicio: item.FechaInicio ? item.FechaInicio.substring(0, 10) : '',
      fechaFin: item.FechaFin ? item.FechaFin.substring(0, 10) : '',
      idProfesor: item.IdProfesor || '',
      costoLiga: item.CostoLiga == null ? '' : String(item.CostoLiga),
      costoProfesor: item.CostoProfesor == null ? '' : String(item.CostoProfesor),
      costoArbitro: item.CostoArbitro == null ? '' : String(item.CostoArbitro),
      cantidadJornadas: item.CantidadJornadas ? String(item.CantidadJornadas) : '',
      eliminatoria: item.Eliminatoria || ''
    });
    setIsEditModalOpen(true);
  };

  const handleUpdateConvocatoria = async () => {
    if (!selectedConvocatoria) return;
    if (!editConvocatoria.fechaInicio || !editConvocatoria.fechaFin) {
      alert('Las fechas son obligatorias');
      return;
    }

    try {
      const response = await fetch('/api/convocatorias/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          seasonId: selectedConvocatoria.IdTemporada,
          leagueId: selectedConvocatoria.IdLiga,
          oldCategoria: selectedConvocatoria.Categoria,
          oldColor: editConvocatoria.oldColor,
          newColor: editConvocatoria.newColor,
          fechaInicio: editConvocatoria.fechaInicio,
          fechaFin: editConvocatoria.fechaFin,
          idProfesor: editConvocatoria.idProfesor,
          costoLiga: editConvocatoria.costoLiga,
          costoProfesor: editConvocatoria.costoProfesor,
          costoArbitro: editConvocatoria.costoArbitro,
          cantidadJornadas: editConvocatoria.cantidadJornadas,
          eliminatoria: editConvocatoria.eliminatoria
        })
      });

      const data = await response.json();
      if (data.success) {
        alert('Convocatoria actualizada exitosamente');
        setIsEditModalOpen(false);
        fetchConvocatorias();
      } else {
        alert('Error al actualizar: ' + data.message);
      }
    } catch (error) {
      console.error('Error updating convocatoria:', error);
      alert('Error al procesar la solicitud');
    }
  };

  const handleCloseConvocatoria = async (item: ConvocatoriaSummary) => {
    const confirmClose = confirm(`¿Está seguro de cerrar la convocatoria de ${item.Liga} - ${item.Categoria} (${item.Color})?`);
    if (!confirmClose) return;

    try {
      const response = await fetch('/api/convocatorias/close', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          seasonId: item.IdTemporada,
          leagueId: item.IdLiga,
          categoria: item.Categoria,
          color: item.Color ?? ''
        })
      });

      const data = await response.json();
      if (data.success) {
        alert('Convocatoria cerrada exitosamente');
        // Refresh the list
        const refreshResponse = await fetch('/api/convocatorias/summary');
        const refreshData = await refreshResponse.json();
        if (refreshData.success) {
          setConvocatorias(refreshData.data);
        }
      } else {
        alert('Error al cerrar convocatoria: ' + data.message);
      }
    } catch (error) {
      console.error('Error closing convocatoria:', error);
      alert('Error al procesar la solicitud');
    }
  };

  const exportToExcel = async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Convocatorias');

    // Título
    const titleCell = worksheet.getCell('A1');
    titleCell.value = `CONVOCATORIAS - ${season || 'N/A'}`;
    titleCell.font = { bold: true, size: 16, color: { argb: 'FF1E293B' } };
    
    // Configurar columnas (sin header automático para controlar la posición)
    worksheet.columns = [
      { key: 'liga', width: 25 },
      { key: 'categoria', width: 25 },
      { key: 'periodo', width: 35 },
      { key: 'cerrada', width: 12 },
      { key: 'jugadores', width: 10 },
      { key: 'total', width: 15, style: { numFmt: '"$"#,##0.00' } },
      { key: 'pagos', width: 15, style: { numFmt: '"$"#,##0.00' } },
      { key: 'utilidad', width: 15, style: { numFmt: '"$"#,##0.00' } },
      { key: 'cxc', width: 15, style: { numFmt: '"$"#,##0.00' } }
    ];

    // Encabezados (Fila 3 para dejar espacio al título)
    const headerRow = worksheet.getRow(3);
    headerRow.values = ['Liga', 'Categoría', 'Periodo', 'Cerrada', 'Jug.', 'Total Esp.', 'Total Rec.', 'Utilidad Rec.', 'CXC'];
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } };
      cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    });

    // Datos
    sortedConvocatorias.forEach((item) => {
      const row = worksheet.addRow([
        item.Liga,
        item.Categoria,
        `${formatDate(item.FechaInicio)} - ${formatDate(item.FechaFin)}`,
        item.Cerrada ? 'Sí' : 'No',
        item.JugadoresConvocados,
        item.Total,
        item.Pagos,
        item.Pagos - ((item.CostoLiga || 0) + (item.CostoProfesor || 0) + (item.CostoArbitro || 0)),
        item.CXC
      ]);
      row.eachCell((cell) => {
        cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
      });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `Convocatorias_${season || 'AngelesSoccer'}.xlsx`;
    anchor.click();
    window.URL.revokeObjectURL(url);
  };

  const exportToPDF = () => {
    const doc = new jsPDF();
    doc.text(`Resumen de Convocatorias - ${season || ''}`, 14, 15);
    
    const tableData = sortedConvocatorias.map(item => [
      item.Liga,
      item.Categoria,
      `${formatDate(item.FechaInicio)} - ${formatDate(item.FechaFin)}`,
      item.Cerrada ? 'Sí' : 'No',
      item.JugadoresConvocados,
      new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(item.Total),
      new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(item.Pagos),
      new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(item.Pagos - ((item.CostoLiga || 0) + (item.CostoProfesor || 0) + (item.CostoArbitro || 0))),
      new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(item.Total - item.Pagos)
    ]);

    autoTable(doc, {
      head: [['Liga', 'Categoría', 'Periodo', 'Cerrada', 'Jug.', 'Total Esp.', 'Total Rec.', 'Util. Rec.', 'CXC']],
      body: tableData,
      startY: 20,
      theme: 'grid',
      styles: { fontSize: 8 },
      headStyles: { fillColor: [51, 65, 85] }
    });

    presentarPdf(doc, `Convocatorias_${season || 'AngelesSoccer'}.pdf`);
  };

  const exportPlayersToExcel = async () => {
    if (!selectedConvocatoria) return;
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Detalle');

    const totalPrecio = sortedPlayers.reduce((sum, p) => sum + (p.Precio || 0), 0);
    const totalPago = sortedPlayers.reduce((sum, p) => sum + (p.PagoJugador || 0), 0);
    const totalCXC = sortedPlayers.reduce((sum, p) => sum + (p.CXC || 0), 0);
    const numConvocados = sortedPlayers.filter(p => p.EsConvocado).length;

    // Título y Periodo
    const titleCell = worksheet.getCell('A1');
    titleCell.value = `${selectedConvocatoria.Liga} - ${selectedConvocatoria.Categoria} ${selectedConvocatoria.Color ? `(${selectedConvocatoria.Color})` : ''}`;
    titleCell.font = { bold: true, size: 16, color: { argb: 'FF1E293B' } };
    
    worksheet.getCell('A2').value = `Periodo: ${formatDate(selectedConvocatoria.FechaInicio)} - ${formatDate(selectedConvocatoria.FechaFin)}`;
    worksheet.getCell('A2').font = { italic: true, size: 11 };

    worksheet.getCell('A3').value = `Convocados: ${numConvocados} | Total: ${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(totalPrecio)} | Pagado: ${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(totalPago)} | CXC: ${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(totalCXC)}`;
    worksheet.getCell('A3').font = { bold: true, size: 11, color: { argb: 'FF1E40AF' } };

    // Configurar columnas (sin header automático)
    worksheet.columns = [
      { key: 'id', width: 10 },
      { key: 'jugador', width: 35 },
      { key: 'categoria', width: 25 },
      { key: 'beca', width: 12 },
      { header: '', key: 'precio', width: 15, style: { numFmt: '"$"#,##0.00' } },
      { header: '', key: 'pago', width: 15, style: { numFmt: '"$"#,##0.00' } },
      { header: '', key: 'cxc', width: 15, style: { numFmt: '"$"#,##0.00' } },
      { key: 'estado', width: 15 }
    ];

    // Encabezados (Fila 5)
    const headerRow = worksheet.getRow(5);
    headerRow.values = ['ID', 'Jugador', 'Categoría', 'Beca', 'Precio', 'Pago', 'CXC', 'Estado'];
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } };
      cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    });

    // Datos
    sortedPlayers.forEach((player) => {
      const row = worksheet.addRow([
        player.IdJugador,
        player.Jugador,
        player.Categoria,
        etiquetaBeca(player.Beca) ?? '—',
        player.Precio,
        player.PagoJugador,
        player.CXC,
        player.EsConvocado ? 'Convocado' : player.EsEliminado ? 'Eliminado' : player.EsInvitado ? 'Invitado' : 'Disponible'
      ]);
      row.eachCell((cell) => {
        cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
      });
    });

    // Totales
    const totalRow = worksheet.addRow([
      '',
      'TOTALES',
      '',
      '',
      sortedPlayers.reduce((sum, p) => sum + (p.Precio || 0), 0),
      sortedPlayers.reduce((sum, p) => sum + (p.PagoJugador || 0), 0),
      sortedPlayers.reduce((sum, p) => sum + (p.CXC || 0), 0),
      ''
    ]);
    totalRow.font = { bold: true };
    totalRow.eachCell((cell) => {
      cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `Detalle_${selectedConvocatoria.Liga}_${selectedConvocatoria.Categoria}.xlsx`;
    anchor.click();
    window.URL.revokeObjectURL(url);
  };

  const exportPlayersToPDF = () => {
    if (!selectedConvocatoria) return;
    const totalPrecio = sortedPlayers.reduce((sum, p) => sum + (p.Precio || 0), 0);
    const totalPago = sortedPlayers.reduce((sum, p) => sum + (p.PagoJugador || 0), 0);
    const totalCXC = sortedPlayers.reduce((sum, p) => sum + (p.CXC || 0), 0);
    const numConvocados = sortedPlayers.filter(p => p.EsConvocado).length;

    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text(`${selectedConvocatoria.Liga} - ${selectedConvocatoria.Categoria} ${selectedConvocatoria.Color ? `(${selectedConvocatoria.Color})` : ''}`, 14, 15);
    
    doc.setFontSize(10);
    doc.text(`Periodo: ${formatDate(selectedConvocatoria.FechaInicio)} - ${formatDate(selectedConvocatoria.FechaFin)}`, 14, 22);
    
    const formatCurrencyPDF = (val: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(val).replace(/\u00a0/g, ' ');
    
    doc.setFont('helvetica', 'bold');
    doc.text(`Convocados: ${numConvocados}`, 14, 28);
    doc.text(`Total: ${formatCurrencyPDF(totalPrecio)} | Pagado: ${formatCurrencyPDF(totalPago)} | CXC: ${formatCurrencyPDF(totalCXC)}`, 14, 33);
    doc.setFont('helvetica', 'normal');
    
    const tableData = sortedPlayers.map(player => [
      player.IdJugador,
      player.Jugador,
      player.Categoria,
      etiquetaBeca(player.Beca) ?? '\u2014',
      new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(player.Precio).replace(/\u00a0/g, ' '),
      new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(player.PagoJugador).replace(/\u00a0/g, ' '),
      new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(player.CXC).replace(/\u00a0/g, ' '),
      player.EsConvocado ? 'Convocado' : player.EsEliminado ? 'Eliminado' : player.EsInvitado ? 'Invitado' : 'Disponible'
    ]);

    tableData.push([
      '',
      'TOTALES',
      '',
      '',
      new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(totalPrecio).replace(/\u00a0/g, ' '),
      new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(totalPago).replace(/\u00a0/g, ' '),
      new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(totalCXC).replace(/\u00a0/g, ' '),
      ''
    ]);

    autoTable(doc, {
      head: [['ID', 'Jugador', 'Categoría', 'Beca', 'Precio', 'Pago', 'CXC', 'Estado']],
      body: tableData,
      startY: 40,
      theme: 'grid',
      styles: { fontSize: 8 },
      headStyles: { fillColor: [51, 65, 85] }
    });

    presentarPdf(doc, `Detalle_${selectedConvocatoria.Liga}_${selectedConvocatoria.Categoria}.pdf`);
  };

  const handleDeleteConvocatoria = async (item: ConvocatoriaSummary) => {
    const confirmDelete = confirm(`¿Está seguro de BORRAR permanentemente la convocatoria de ${item.Liga} - ${item.Categoria} (${item.Color})?`);
    if (!confirmDelete) return;

    try {
      const response = await fetch('/api/convocatorias/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          seasonId: item.IdTemporada,
          leagueId: item.IdLiga,
          categoria: item.Categoria,
          color: item.Color ?? ''
        })
      });

      const data = await response.json();
      if (data.success) {
        alert('Convocatoria eliminada exitosamente');
        // Refresh the list
        const refreshResponse = await fetch('/api/convocatorias/summary');
        const refreshData = await refreshResponse.json();
        if (refreshData.success) {
          setConvocatorias(refreshData.data);
        }
      } else {
        alert('Error al eliminar convocatoria: ' + data.message);
      }
    } catch (error) {
      console.error('Error deleting convocatoria:', error);
      alert('Error al procesar la solicitud');
    }
  };

  const handleNavigateToConvocatoria = async (item: ConvocatoriaSummary) => {
    /* Esta misma función refresca la lista después de convocar, y ahí NO debe tocar los
       filtros: el usuario ya eligió qué está viendo. Solo al abrir se decide el estado
       inicial; si no, convocar al primero prendía "Solo Convocados" y desaparecía del
       modal la gente que faltaba por convocar. */
    const abriendo = !isPlayersModalOpen;

    setSelectedConvocatoria(item);
    setIsPlayersModalOpen(true);
    setIsLoadingPlayers(true);

    if (abriendo) {
      setBusquedaJugador('');
      /* Siempre apagado al abrir: la pantalla se usa para convocar, y eso se hace desde
         la plantilla completa. Antes se encendía solo cuando la convocatoria ya tenía
         gente dentro, y entonces abrir una convocatoria a medias escondía justo a los
         que faltaban por convocar. Filtrar a los convocados es el paso final, y para
         eso está el interruptor. */
      setShowOnlyConvocados(false);
    }

    try {
      const response = await fetch(
        `/api/convocatorias/players?seasonId=${item.IdTemporada}&leagueId=${item.IdLiga}&categoria=${encodeURIComponent(item.Categoria)}&color=${encodeURIComponent(item.Color || '')}`
      );
      const data = await response.json();
      if (data.success) {
        setPlayers(data.data);
        setTotalPrice(data.total || 0);
        setRecordCount(data.count || 0);
        setTotalPagos(data.totalPagos || 0);
        setTotalCXC(data.totalCXC || 0);
      } else {
        alert('Error al cargar jugadores: ' + data.message);
      }
    } catch (error) {
      console.error('Error loading players:', error);
      alert('Error al cargar jugadores');
    } finally {
      setIsLoadingPlayers(false);
    }
  };

  const handleConvocarPlayer = async (player: any) => {
    if (!selectedConvocatoria) return;

    try {
      const response = await fetch('/api/convocatorias/convoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          seasonId: selectedConvocatoria.IdTemporada,
          leagueId: selectedConvocatoria.IdLiga,
          playerId: player.IdJugador,
          categoria: selectedConvocatoria.Categoria,
          color: selectedConvocatoria.Color ?? ''
        })
      });

      const data = await response.json();
      if (data.success) {
        // Refresh players list
        await handleNavigateToConvocatoria(selectedConvocatoria);
      } else if (response.status === 409) {
        /* Regla de negocio (no inscrito o con adeudo), no una falla: el mensaje del
           servidor ya explica qué hacer, así que se muestra tal cual. */
        alert(`${player.Jugador}\n\n${data.message}`);
        await handleNavigateToConvocatoria(selectedConvocatoria);
      } else {
        alert('Error al convocar: ' + data.message);
      }
    } catch (error) {
      console.error('Error convocando jugador:', error);
      alert('Error al procesar la solicitud');
    }
  };

  const handleQuitarPlayer = async (player: any) => {
    if (!selectedConvocatoria) return;

    const confirmRemove = confirm(`¿Está seguro de quitar a ${player.Jugador}?`);
    if (!confirmRemove) return;

    try {
      const response = await fetch('/api/convocatorias/remove', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          seasonId: selectedConvocatoria.IdTemporada,
          leagueId: selectedConvocatoria.IdLiga,
          playerId: player.IdJugador,
          categoria: selectedConvocatoria.Categoria,
          color: selectedConvocatoria.Color ?? ''
        })
      });

      const data = await response.json();
      if (data.success) {
        // Refresh players list
        await handleNavigateToConvocatoria(selectedConvocatoria);
      } else {
        alert('Error al quitar: ' + data.message);
      }
    } catch (error) {
      console.error('Error quitando jugador:', error);
      alert('Error al procesar la solicitud');
    }
  };

  const handleEliminarPlayer = async (player: any) => {
    if (!selectedConvocatoria) return;

    const confirmEliminar = confirm(`¿Está seguro de eliminar a ${player.Jugador}? Esta acción marcará al jugador como eliminado.`);
    if (!confirmEliminar) return;

    try {
      const response = await fetch('/api/convocatorias/remove', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          seasonId: selectedConvocatoria.IdTemporada,
          leagueId: selectedConvocatoria.IdLiga,
          playerId: player.IdJugador,
          categoria: selectedConvocatoria.Categoria,
          color: selectedConvocatoria.Color ?? ''
        })
      });

      const data = await response.json();
      if (data.success) {
        // Refresh players list
        await handleNavigateToConvocatoria(selectedConvocatoria);
      } else {
        alert('Error al eliminar: ' + data.message);
      }
    } catch (error) {
      console.error('Error eliminando jugador:', error);
      alert('Error al procesar la solicitud');
    }
  };

  // Filter and sort players
  const filteredPlayers = players.filter((player) => {
    if (showOnlyConvocados && !player.EsConvocado) return false;

    // Solo becados: cualquier porcentaje de beca mayor que cero.
    if (showOnlyBecados && becaPct(player.Beca) === 0) return false;

    const q = busquedaJugador.trim().toLowerCase();
    if (!q) return true;
    return (
      String(player.Jugador ?? '').toLowerCase().includes(q) ||
      String(player.IdJugador ?? '').includes(q) ||
      String(player.Categoria ?? '').toLowerCase().includes(q)
    );
  });

  /* Cuántos de la categoría traen algo pendiente. Se cuenta sobre la lista completa, no
     sobre la filtrada: el aviso habla de la categoría, no de lo que se está buscando. */
  const sinAlCorriente = players.filter(
    (p: { Inscrito?: number; Exento?: number; MesesDebe?: number }) =>
      (p.Inscrito === 0 && p.Exento === 0) || Number(p.MesesDebe) > 0,
  ).length;

  const sortedPlayers = [...filteredPlayers].sort((a, b) => {
    if (!playerSortConfig) return 0;
    const { key, direction } = playerSortConfig;

    let aValue = a[key] ?? '';
    let bValue = b[key] ?? '';

    // Handle virtual/special columns
    if (key === 'CXC') {
      aValue = a.CXC || 0;
      bValue = b.CXC || 0;
    } else if (key === 'Estado') {
      aValue = a.EsConvocado ? 'Convocado' : a.EsEliminado ? 'Eliminado' : 'Disponible';
      bValue = b.EsConvocado ? 'Convocado' : b.EsEliminado ? 'Eliminado' : 'Disponible';
    }

    if (aValue < bValue) {
      return direction === 'asc' ? -1 : 1;
    }
    if (aValue > bValue) {
      return direction === 'asc' ? 1 : -1;
    }
    return 0;
  });

  const handlePlayerSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (playerSortConfig && playerSortConfig.key === key && playerSortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setPlayerSortConfig({ key, direction });
  };

  const handleUpdatePrice = async (player: any) => {
    if (!selectedConvocatoria) return;

    /* El importe capturado se queda fijo si difiere del de la liga: el sincronizado de
       precios lo respeta. Volver a capturar el precio de la liga lo regresa al
       automático. Se explica aquí porque es donde el usuario toma la decisión. */
    const newPrice = prompt(
      `Nuevo precio para ${player.Jugador}:` +
        '\n\nSi es distinto al de la liga, queda fijo y ya no se le cambia solo.' +
        '\nPara devolverlo al automático, captura el mismo precio que tiene la liga.',
      (player.Precio ?? 0).toString(),
    );
    if (newPrice === null) return;

    const precio = Number(newPrice);
    if (isNaN(precio) || precio < 0) {
      alert('Por favor ingrese un precio válido');
      return;
    }

    try {
      const response = await fetch('/api/convocatorias/update-price', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          seasonId: selectedConvocatoria.IdTemporada,
          leagueId: selectedConvocatoria.IdLiga,
          playerId: player.IdJugador,
          categoria: selectedConvocatoria.Categoria,
          color: selectedConvocatoria.Color ?? '',
          precio
        })
      });

      const data = await response.json();
      if (data.success) {
        // Refresh players list
        await handleNavigateToConvocatoria(selectedConvocatoria);
      } else {
        alert('Error al actualizar precio: ' + data.message);
      }
    } catch (error) {
      console.error('Error actualizando precio:', error);
      alert('Error al procesar la solicitud');
    }
  };

  /** Abre el historial completo de pagos del jugador. */
  const abrirHistorialPagos = (player: { IdJugador: number; Jugador: string }) => {
    setPagosTarget({ idJugador: player.IdJugador, jugador: player.Jugador });
  };

  /* El historial arranca acotado a la temporada de la convocatoria abierta. El nombre
     solo se pone cuando la temporada seleccionada arriba es esa misma; si no coinciden
     es preferible el rótulo genérico del modal a etiquetar mal los importes. */
  const temporadaDeLaLista = selectedConvocatoria?.IdTemporada ?? (seasonId ? Number(seasonId) : null);
  const nombreTemporadaDeLaLista =
    temporadaDeLaLista !== null && Number(seasonId) === temporadaDeLaLista
      ? season ?? undefined
      : undefined;

  const fetchPlayerPayments = async (player: any) => {
    if (!selectedConvocatoria) return;
    
    setIsLoadingPayments(true);
    setJugadorPagosConvocatoria({ idJugador: player.IdJugador, jugador: player.Jugador });
    setIsPaymentDetailsModalOpen(true);
    
    try {
      const response = await fetch(`/api/convocatorias/payments?seasonId=${selectedConvocatoria.IdTemporada}&leagueId=${selectedConvocatoria.IdLiga}&playerId=${player.IdJugador}`);
      const data = await response.json();
      if (data.success) {
        setPlayerPayments(data.data);
      }
    } catch (error) {
      console.error('Error fetching payments:', error);
    } finally {
      setIsLoadingPayments(false);
    }
  };

  const handleOpenInviteModal = async () => {
    if (!selectedConvocatoria) return;

    setIsInviteModalOpen(true);
    setIsLoadingAvailablePlayers(true);

    try {
      const response = await fetch(
        `/api/convocatorias/available-players?seasonId=${selectedConvocatoria.IdTemporada}&leagueId=${selectedConvocatoria.IdLiga}&categoria=${encodeURIComponent(selectedConvocatoria.Categoria)}&color=${encodeURIComponent(selectedConvocatoria.Color || '')}`
      );
      const data = await response.json();
      if (data.success) {
        setAvailablePlayers(data.data);
      } else {
        alert('Error al cargar jugadores disponibles: ' + data.message);
      }
    } catch (error) {
      console.error('Error loading available players:', error);
      alert('Error al cargar jugadores disponibles');
    } finally {
      setIsLoadingAvailablePlayers(false);
    }
  };

  /* Etiqueta corta para el listado de invitables: la advertencia completa va en el title. */
  const etiquetaAdvertencia = (player: any): string => {
    if (player.Inscrito === 0 && player.Exento === 0) return 'Sin inscripción';
    return player.MesesDebe === 1 ? 'Adeudo: 1 mes' : `Adeudo: ${player.MesesDebe} meses`;
  };

  const handleInvitePlayer = async () => {
    if (!selectedConvocatoria || !selectedPlayerId) {
      alert('Por favor seleccione un jugador');
      return;
    }

    try {
      const response = await fetch('/api/convocatorias/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          seasonId: selectedConvocatoria.IdTemporada,
          leagueId: selectedConvocatoria.IdLiga,
          playerId: selectedPlayerId,
          categoria: selectedConvocatoria.Categoria,
          color: selectedConvocatoria.Color ?? ''
        })
      });

      const data = await response.json();
      if (data.success) {
        // Invitar ya convoca; la advertencia de adeudo o inscripción se informa aparte.
        alert(
          data.advertencia
            ? `Jugador invitado y convocado.\n\nOJO: ${data.advertencia}`
            : 'Jugador invitado y convocado'
        );
        setIsInviteModalOpen(false);
        setSelectedPlayerId('');
        // Refresh players list
        await handleNavigateToConvocatoria(selectedConvocatoria);
      } else {
        alert('Error al invitar jugador: ' + data.message);
      }
    } catch (error) {
      console.error('Error invitando jugador:', error);
      alert('Error al procesar la solicitud');
    }
  };

  return (
    <DashboardLayout>
      <main className={`p-4 md:p-8 overflow-y-auto flex-1 ${acento?.fondo ?? ''}`}>
        <div className="max-w-7xl mx-auto">
          <div className={`bg-[#0f172a] backdrop-blur-sm rounded-xl shadow-2xl p-4 md:p-8 border border-white/20 ${acento?.filoSuperior ?? ''}`}>
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 mb-4">
              <h2 className="text-2xl md:text-3xl font-bold text-white flex items-center gap-3">
                {acento && <span className={`w-1.5 h-7 rounded-full ${acento.barra}`} />}
                {tipo === 'copa' ? 'Copas' : tipo === 'liga' ? 'Ligas' : 'Resumen de Convocatorias'}
              </h2>
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 w-full lg:w-auto">
                <label className="relative inline-flex items-center cursor-pointer group">
                  <input
                    type="checkbox"
                    className="sr-only peer"
                    checked={showClosed}
                    onChange={(e) => setShowClosed(e.target.checked)}
                  />
                  <div className="w-11 h-6 bg-white/15 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-white/20 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                  <span className="ml-3 text-sm font-semibold text-slate-300 group-hover:text-white transition-colors">
                    Ver Cerradas
                  </span>
                </label>
                {puedeEditar && (
                  <div className="flex gap-2 w-full sm:w-auto">
                    <button
                      onClick={exportToExcel}
                      className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white text-xs font-bold py-2.5 px-4 rounded-lg shadow transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      Excel
                    </button>
                    <button
                      onClick={exportToPDF}
                      className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold py-2.5 px-4 rounded-lg shadow transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                      </svg>
                      PDF
                    </button>
                  </div>
                )}
                <button
                  onClick={() => router.push('/convocatorias/torneo')}
                  disabled={!puedeEditar}
                  className="w-full sm:w-auto bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 text-white font-bold py-3 px-6 rounded-lg shadow-md hover:shadow-lg transition-all duration-200 transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                  title={!puedeEditar ? "Inicia sesión para crear convocatorias" : ""}
                >
                  + Nueva Convocatoria
                </button>
              </div>
            </div>



              {ligaAbierta !== null && (
              <div className="mb-3 flex justify-end">
                <div className="flex bg-white/5 border border-white/10 p-1 rounded-lg">
                  <button
                    onClick={() => setViewMode('cards')}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-md transition-all ${viewMode === 'cards' ? 'bg-white/15 text-white' : 'text-slate-500 hover:text-white'}`}
                  >
                    <LayoutGrid size={14} />
                    <span className="text-xs font-bold">Tarjetas</span>
                  </button>
                  <button
                    onClick={() => setViewMode('table')}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-md transition-all ${viewMode === 'table' ? 'bg-white/15 text-white' : 'text-slate-500 hover:text-white'}`}
                  >
                    <List size={14} />
                    <span className="text-xs font-bold">Tabla</span>
                  </button>
                </div>
              </div>
              )}

              <div className="mb-3 bg-white/5 p-3 rounded-lg border border-white/10 shadow-sm">
                <div className="flex items-center gap-2 mb-2 text-slate-400 font-bold text-[10px] uppercase tracking-wider">
                  <Search size={14} />
                  {ligaAbierta === null ? 'Buscar copa, liga o categoría' : 'Buscar Convocatoria'}
                </div>
                <input
                  type="text"
                  value={summarySearchQuery}
                  onChange={(e) => setSummarySearchQuery(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm focus:bg-white/5 focus:border-blue-500 outline-none transition-all"
                  placeholder="Liga, categoría, profesor o color..."
                />
              </div>

              {/* ── Pagos de copas y ligas sin convocatoria ──
                  Antes estas se creaban solas al entrar. Ahora se avisan y se dan de
                  alta a mano: así nadie se encuentra en la base renglones que no
                  capturó, y quien decide es quien está viendo la pantalla. */}
              {ligaAbierta === null && puedeEditar && faltantesPorLiga.length > 0 && (
                <div className="mb-4 bg-amber-500/10 border border-amber-500/30 rounded-xl p-4">
                  <div className="flex items-start gap-2 mb-3">
                    <Info size={15} className="text-amber-300 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-black text-amber-200">
                        Hay pagos de copas y ligas sin convocatoria
                      </p>
                      <p className="text-[11px] text-amber-200/70 mt-0.5">
                        {faltantesPorLiga.reduce((n, g) => n + g.categorias.length, 0)} categoría(s) con gente
                        que ya pagó y todavía no tienen convocatoria en este ciclo. Revísalas y dales de alta
                        desde la pantalla de alta.
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {faltantesPorLiga.map((g) => (
                      <button
                        key={g.idLiga}
                        onClick={() =>
                          router.push(
                            `/convocatorias/torneo?liga=${g.idLiga}&categorias=${encodeURIComponent(g.categorias.join(','))}`,
                          )
                        }
                        title={`Categorías: ${g.categorias.join(', ')}`}
                        className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-100 text-xs font-bold hover:bg-amber-500/25 transition-colors"
                      >
                        {g.liga}
                        <span className="text-[10px] font-black text-amber-200/70">
                          {g.categorias.length} categoría(s) · {g.jugadores} jugador(es)
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Portada: una tarjeta por copa o liga ── */}
              {ligaAbierta === null && (
                <>
                  {isLoading ? (
                    <div className="py-12 text-center text-slate-400 bg-white/5 rounded-xl border border-white/10">
                      Cargando convocatorias...
                    </div>
                  ) : resumenLigas.length === 0 ? (
                    <div className="py-12 text-center text-slate-400 bg-white/5 rounded-xl border border-white/10">
                      No se encontraron copas ni ligas.
                    </div>
                  ) : (
                    <div className="space-y-8">
                      {[
                        { clave: 'copas', titulo: 'Copas', lista: copas, totales: totalesCopas, chip: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
                        { clave: 'ligas', titulo: 'Ligas', lista: ligas, totales: totalesLigas, chip: 'bg-blue-500/15 text-blue-300 border-blue-500/30' },
                      ].filter((bloque) => bloque.lista.length > 0).map((bloque) => (
                        <section key={bloque.clave}>
                          <div className="flex flex-wrap items-center justify-between gap-3 mb-3 pb-2 border-b border-white/10">
                            <div className="flex items-center gap-2">
                              <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded border ${bloque.chip}`}>
                                {bloque.titulo}
                              </span>
                              <span className="text-xs font-bold text-slate-400">
                                {bloque.lista.length} · {bloque.totales.categorias} categoría(s) · {bloque.totales.jugadores} jugador(es)
                              </span>
                            </div>
                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-bold tabular-nums">
                              <span className="text-slate-400">
                                Esperado <span className="text-slate-200">{moneda(bloque.totales.esperado)}</span>
                              </span>
                              <span className="text-slate-400">
                                Recaudado <span className="text-emerald-300">{moneda(bloque.totales.recaudado)}</span>
                              </span>
                              <span className="text-slate-400">
                                Utilidad rec.{' '}
                                <span className={bloque.totales.utilidadRecaudada >= 0 ? 'text-emerald-300' : 'text-rose-300'}>
                                  {moneda(bloque.totales.utilidadRecaudada)}
                                </span>
                              </span>
                            </div>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                            {bloque.lista.map((r) => (
                              <TarjetaCopaLiga key={r.idLiga} resumen={r} onAbrir={() => setLigaAbierta(r.idLiga)} />
                            ))}
                          </div>
                        </section>
                      ))}
                    </div>
                  )}

                  <div className="mt-8 pt-6 border-t border-white/10 flex flex-wrap justify-center gap-x-6 gap-y-2 text-slate-400">
                    <h3 className="text-lg md:text-xl font-bold italic">
                      {isLoading
                        ? 'Cargando...'
                        : `${
                            tipo === 'copa' ? `${copas.length} copa(s)`
                              : tipo === 'liga' ? `${ligas.length} liga(s)`
                              : `${copas.length} copa(s) y ${ligas.length} liga(s)`
                          } · ${totalesPortada.categorias} categoría(s) · ${totalesPortada.jugadores} jugador(es)`}
                    </h3>
                    {!isLoading && (
                      <p className="text-sm font-bold self-center tabular-nums">
                        Esperado {moneda(totalesPortada.esperado)} · Recaudado{' '}
                        <span className="text-emerald-300">{moneda(totalesPortada.recaudado)}</span>
                      </p>
                    )}
                  </div>
                </>
              )}

              {/* ── Torneo abierto: de aquí para abajo, el detalle de siempre ── */}
              {ligaAbierta !== null && (
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3 bg-white/5 border border-white/10 rounded-lg p-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <button
                      onClick={() => setLigaAbierta(null)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/15 text-slate-300 hover:text-white hover:bg-white/10 text-xs font-bold transition-colors"
                    >
                      ← {tipo === 'copa' ? 'Copas' : tipo === 'liga' ? 'Ligas' : 'Copas y ligas'}
                    </button>
                    {/* El escudo del torneo: es lo que lo identifica de un vistazo. */}
                    {ligaActual?.tieneFoto ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={`/api/copas-ligas/foto/${ligaActual.idLiga}?v=${ligaActual.fotoVersion ?? '0'}`}
                        alt=""
                        className="w-10 h-10 rounded-lg object-contain bg-white/5 border border-white/10 flex-shrink-0"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center flex-shrink-0">
                        <Trophy size={16} className="text-slate-500" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-black text-white truncate">{ligaActual?.liga ?? ''}</p>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                        {ligaActual?.esCopa ? 'Copa' : 'Liga'} · {ligaActual?.categorias.length ?? 0} categoría(s) ·{' '}
                        {ligaActual?.jugadores ?? 0} jugador(es)
                      </p>
                    </div>
                    {ligaActual && puedeEditar && (
                      <button
                        onClick={() => router.push(`/convocatorias/torneo?liga=${ligaActual.idLiga}`)}
                        title="Editar la ficha del torneo y todas sus categorías"
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/15 text-slate-300 hover:text-white hover:bg-white/10 text-xs font-bold transition-colors flex-shrink-0"
                      >
                        Editar torneo
                      </button>
                    )}
                  </div>
                  {ligaActual && (
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-bold tabular-nums">
                      <span className="text-slate-400">
                        Esperado <span className="text-slate-200">{moneda(ligaActual.esperado)}</span>
                      </span>
                      <span className="text-slate-400">
                        Recaudado <span className="text-emerald-300">{moneda(ligaActual.recaudado)}</span>
                      </span>
                      <span className="text-slate-400">
                        Utilidad rec.{' '}
                        <span className={ligaActual.utilidadRecaudada >= 0 ? 'text-emerald-300' : 'text-rose-300'}>
                          {moneda(ligaActual.utilidadRecaudada)}
                        </span>
                      </span>
                    </div>
                  )}
                </div>
              )}

              {ligaAbierta !== null && (
              <>
              {/* En pantallas chicas la tabla se desplaza en horizontal. */}
              <div className={`${viewMode === 'table' ? 'block' : 'hidden'} overflow-x-auto shadow-xl rounded-xl border border-white/10`}>
                <table className="min-w-full bg-white/5">
                  <thead>
                    <tr className="bg-gradient-to-r from-slate-700 to-slate-800 text-white">
                      <th
                        className="py-3 px-4 text-left font-semibold text-xs uppercase tracking-wider cursor-pointer hover:bg-slate-600 transition-colors select-none"
                        onClick={() => handleSort('Liga')}
                      >
                        <div className="flex items-center gap-2">
                          Liga
                          {sortConfig?.key === 'Liga' && (
                            <span className="text-blue-300">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                          )}
                        </div>
                      </th>
                      <th
                        className="py-3 px-4 text-left font-semibold text-xs uppercase tracking-wider cursor-pointer hover:bg-slate-600 transition-colors select-none"
                        onClick={() => handleSort('Profesor')}
                      >
                        <div className="flex items-center gap-2">
                          Profesor
                          {sortConfig?.key === 'Profesor' && (
                            <span className="text-blue-300">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                          )}
                        </div>
                      </th>
                      <th
                        className="py-3 px-4 text-left font-semibold text-xs uppercase tracking-wider cursor-pointer hover:bg-slate-600 transition-colors select-none"
                        onClick={() => handleSort('Categoria')}
                      >
                        <div className="flex items-center gap-2">
                          Categoría
                          {sortConfig?.key === 'Categoria' && (
                            <span className="text-blue-300">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                          )}
                        </div>
                      </th>
                      <th
                        className="py-3 px-4 text-left font-semibold text-xs uppercase tracking-wider cursor-pointer hover:bg-slate-600 transition-colors select-none"
                        onClick={() => handleSort('Color')}
                      >
                        <div className="flex items-center gap-2">
                          Color
                          {sortConfig?.key === 'Color' && (
                            <span className="text-blue-300">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                          )}
                        </div>
                      </th>
                      {/* Jornadas y eliminatoria: vivían solo en las tarjetas, que ya
                          no existen, así que la tabla tiene que mostrarlas. */}
                      <th className="py-3 px-4 text-left font-semibold text-xs uppercase tracking-wider">
                        Torneo
                      </th>
                      <th
                        className="py-3 px-4 text-left font-semibold text-xs uppercase tracking-wider cursor-pointer hover:bg-slate-600 transition-colors select-none"
                        onClick={() => handleSort('FechaInicio')}
                      >
                        <div className="flex items-center gap-2">
                          Periodo
                          {sortConfig?.key === 'FechaInicio' && (
                            <span className="text-blue-300">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                          )}
                        </div>
                      </th>
                      <th
                        className="py-3 px-4 text-center font-semibold text-xs uppercase tracking-wider cursor-pointer hover:bg-slate-600 transition-colors select-none"
                        onClick={() => handleSort('Cerrada')}
                      >
                        <div className="flex items-center justify-center gap-2">
                          Cerrada
                          {sortConfig?.key === 'Cerrada' && (
                            <span className="text-blue-300">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                          )}
                        </div>
                      </th>
                      {puedeEditar && (
                        <>
                          <th
                            className="py-3 px-4 text-center font-semibold text-xs uppercase tracking-wider cursor-pointer hover:bg-slate-600 transition-colors select-none"
                            onClick={() => handleSort('JugadoresConvocados')}
                          >
                            <div className="flex items-center justify-center gap-2">
                              Jugadores
                              {sortConfig?.key === 'JugadoresConvocados' && (
                                <span className="text-blue-300">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                              )}
                            </div>
                          </th>
                          <th
                            className="py-3 px-4 text-center font-semibold text-xs uppercase tracking-wider cursor-pointer hover:bg-slate-600 transition-colors select-none"
                            onClick={() => handleSort('Total')}
                          >
                            <div className="flex items-center justify-center gap-2">
                              T. Esperado
                              {sortConfig?.key === 'Total' && (
                                <span className="text-blue-300">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                              )}
                            </div>
                          </th>
                          <th
                            className="py-3 px-4 text-center font-semibold text-xs uppercase tracking-wider cursor-pointer hover:bg-slate-600 transition-colors select-none"
                            onClick={() => handleSort('Pagos')}
                          >
                            <div className="flex items-center justify-center gap-2">
                              T. Recaudado
                              {sortConfig?.key === 'Pagos' && (
                                <span className="text-blue-300">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                              )}
                            </div>
                          </th>
                          <th className="py-3 px-4 text-center font-semibold text-xs uppercase tracking-wider">
                            Utilidad
                          </th>
                          <th
                            className="py-3 px-4 text-center font-semibold text-xs uppercase tracking-wider cursor-pointer hover:bg-slate-600 transition-colors select-none"
                            onClick={() => handleSort('CXC')}
                          >
                            <div className="flex items-center justify-center gap-2">
                              CXC
                              {sortConfig?.key === 'CXC' && (
                                <span className="text-blue-300">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                              )}
                            </div>
                          </th>
                        </>
                      )}
                      <th className="py-3 px-4 text-center font-semibold text-xs uppercase tracking-wider">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {isLoading ? (
                      <tr>
                        <td colSpan={12} className="py-12 text-center text-slate-400">
                          <div className="flex items-center justify-center gap-2">
                            <svg className="animate-spin h-5 w-5 text-blue-300" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            <span className="font-medium">Cargando convocatorias...</span>
                          </div>
                        </td>
                      </tr>
                    ) : sortedConvocatorias.length > 0 ? (
                      sortedConvocatorias.map((item, index) => (
                        <tr
                          key={`${item.IdTemporada}-${item.IdLiga}-${item.Categoria}-${index}`}
                          className="hover:bg-white/5 hover:shadow-sm transition-all duration-200"
                        >
                          <td className="py-2 px-4 text-xs font-medium">
                            <span className="flex items-center gap-2">
                              {fotoLiga(item) && (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={fotoLiga(item)!}
                                  alt=""
                                  className="w-6 h-6 rounded object-contain bg-slate-950/50 border border-white/10 flex-shrink-0"
                                />
                              )}
                              {item.Liga}
                            </span>
                          </td>
                          <td className="py-2 px-4 text-xs font-medium text-slate-300">{item.Profesor || '-'}</td>
                          <td className="py-2 px-4 text-sm font-black text-white">{item.Categoria}</td>
                          <td className="py-2 px-4 text-xs font-medium text-slate-300 italic">
                            {item.Color || '-'}
                          </td>
                          <td className="py-2 px-4">
                            <div className="flex flex-wrap gap-1">
                              {etiquetaJornadas(item.CantidadJornadas) && (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-white/10 text-slate-200 border border-white/10 whitespace-nowrap">
                                  {etiquetaJornadas(item.CantidadJornadas)}
                                </span>
                              )}
                              {item.Eliminatoria && (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200 whitespace-nowrap">
                                  {item.Eliminatoria}
                                </span>
                              )}
                              {!etiquetaJornadas(item.CantidadJornadas) && !item.Eliminatoria && (
                                <span className="text-xs text-slate-600">—</span>
                              )}
                            </div>
                          </td>
                          <td className="py-2 px-4 text-xs whitespace-nowrap">
                            {formatDate(item.FechaInicio)} - {formatDate(item.FechaFin)}
                          </td>
                          <td className="py-2 px-4 text-center text-xs">
                            {item.Cerrada ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/15 text-red-800">
                                ✓ Sí
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/15 text-green-800">
                                No
                              </span>
                            )}
                          </td>
                          {puedeEditar && (
                            <>
                              <td className="py-2 px-4 text-center text-xs font-bold text-blue-300">
                                {item.JugadoresConvocados}
                              </td>
                              <td className="py-2 px-4 text-center text-xs font-bold text-emerald-300">
                                {new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(item.Total || 0)}
                              </td>
                              <td className="py-2 px-4 text-center text-xs font-bold text-emerald-300">
                                {new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(item.Pagos || 0)}
                              </td>
                              {/* Utilidad recaudada: lo cobrado menos los tres costos del
                                  torneo. Misma fórmula que la exportación. */}
                              <td
                                className={`py-2 px-4 text-center text-xs font-bold ${
                                  (item.Pagos || 0) - ((item.CostoLiga || 0) + (item.CostoProfesor || 0) + (item.CostoArbitro || 0)) >= 0
                                    ? 'text-emerald-300'
                                    : 'text-rose-300'
                                }`}
                                title={`Costos — liga: ${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(item.CostoLiga || 0)} · profesor: ${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(item.CostoProfesor || 0)} · árbitro: ${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(item.CostoArbitro || 0)}`}
                              >
                                {new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(
                                  (item.Pagos || 0) - ((item.CostoLiga || 0) + (item.CostoProfesor || 0) + (item.CostoArbitro || 0))
                                )}
                              </td>
                              <td className="py-2 px-4 text-center text-xs font-bold text-rose-300 bg-red-50/30">
                                {new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(item.CXC || 0)}
                              </td>
                            </>
                          )}
                          <td className="py-2 px-4 text-center">
                            <div className="flex gap-2 justify-center items-center">
                              {item.Cerrada === 0 ? (
                                <>
                                  <button
                                    onClick={() => handleNavigateToConvocatoria(item)}
                                    className="bg-gradient-to-r from-green-600 to-green-500 hover:from-green-700 hover:to-green-600 text-white text-xs font-bold py-2 px-4 rounded-lg shadow-md hover:shadow-lg transition-all duration-200 transform hover:scale-105"
                                  >
                                    Convocar
                                  </button>
                                  {puedeEditar && (
                                    <>
                                      <button
                                        onClick={() => handleOpenEditModal(item)}
                                        className="bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 text-white text-xs font-bold py-2 px-4 rounded-lg shadow-md hover:shadow-lg transition-all duration-200 transform hover:scale-105"
                                      >
                                        Editar
                                      </button>
                                      <button
                                        onClick={() => handleCloseConvocatoria(item)}
                                        className="bg-gradient-to-r from-orange-600 to-orange-500 hover:from-orange-700 hover:to-orange-600 text-white text-xs font-bold py-2 px-4 rounded-lg shadow-md hover:shadow-lg transition-all duration-200 transform hover:scale-105"
                                      >
                                        Cerrar
                                      </button>
                                    </>
                                  )}
                                </>
                              ) : (
                                <span className="text-slate-500 text-xs font-medium px-2">Cerrada</span>
                              )}
                              {puedeEditar && (
                                <button
                                  onClick={() => handleDeleteConvocatoria(item)}
                                  className="bg-gradient-to-r from-red-600 to-red-500 hover:from-red-700 hover:to-red-600 text-white text-xs font-bold py-2 px-4 rounded-lg shadow-md hover:shadow-lg transition-all duration-200 transform hover:scale-105"
                                >
                                  Borrar
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={10} className="py-12 text-center text-slate-400">
                          No se encontraron convocatorias.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className={`${viewMode === 'cards' ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4' : 'lg:hidden space-y-4'}`}>

                {isLoading ? (
                  <div className="py-12 text-center text-slate-400 bg-white/5 rounded-xl border border-white/10 shadow-sm">
                    <div className="flex flex-col items-center justify-center gap-3">
                      <svg className="animate-spin h-8 w-8 text-blue-300" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      <span className="font-medium">Cargando convocatorias...</span>
                    </div>
                  </div>
                ) : sortedConvocatorias.filter(item => 
                    item.Liga.toLowerCase().includes(summarySearchQuery.toLowerCase()) || 
                    item.Categoria.toLowerCase().includes(summarySearchQuery.toLowerCase()) ||
                    (item.Profesor || '').toLowerCase().includes(summarySearchQuery.toLowerCase())
                  ).length > 0 ? (
                  sortedConvocatorias
                    .filter(item => 
                      item.Liga.toLowerCase().includes(summarySearchQuery.toLowerCase()) || 
                      item.Categoria.toLowerCase().includes(summarySearchQuery.toLowerCase()) ||
                      (item.Profesor || '').toLowerCase().includes(summarySearchQuery.toLowerCase())
                    )
                    .map((item, index) => (
                    <div
                      key={`${item.IdTemporada}-${item.IdLiga}-${item.Categoria}-${index}`}
                      className="bg-white/5 rounded-xl border border-white/10 shadow-md p-4 md:p-3 relative overflow-hidden"
                    >
                      {item.Cerrada ? (
                        <div className="absolute top-0 right-0 bg-red-500 text-white text-[9px] font-bold px-2.5 py-0.5 rounded-bl-lg uppercase tracking-wider">
                          Cerrada
                        </div>
                      ) : (
                        <div className="absolute top-0 right-0 bg-green-500 text-white text-[9px] font-bold px-2.5 py-0.5 rounded-bl-lg uppercase tracking-wider">
                          Activa
                        </div>
                      )}
                      
                      <div className="mb-3">
                        {/* Escudo grande a la izquierda y, a su derecha, los tres datos
                            que identifican la convocatoria: torneo, categoría y profesor.
                            En una cuadrícula de tarjetas la imagen se reconoce antes que
                            el texto, y la categoría es lo que el entrenador busca. */}
                        <div className="flex items-start gap-3">
                          {fotoLiga(item) && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={fotoLiga(item)!}
                              alt=""
                              className="w-20 h-20 md:w-[72px] md:h-[72px] rounded-xl object-contain bg-slate-950/50 border border-white/10 flex-shrink-0"
                            />
                          )}
                          {/* pr-14 deja libre la esquina donde va la insignia
                              Activa/Cerrada, que está posicionada por encima. */}
                          <div className="min-w-0 flex-1 pr-14">
                            <div className="text-[10px] md:text-[9px] font-bold text-blue-300 uppercase leading-tight truncate">
                              {item.Liga}
                            </div>
                            <h4 className="text-2xl md:text-xl font-black text-white leading-none tracking-tight mt-0.5">
                              {item.Categoria}
                            </h4>
                            <div className="text-xs md:text-[11px] text-slate-400 flex items-center gap-1 mt-1.5">
                              <span className="font-medium">Profesor:</span> {item.Profesor || '-'}
                            </div>
                          </div>
                        </div>
                        {item.Color && (
                          <div className="text-[10px] md:text-[9px] text-slate-500 mt-0.5 italic">Color: {item.Color}</div>
                        )}
                        {/* Formato del torneo. Las convocatorias anteriores a este campo
                            no traen el dato, así que la fila entera no se pinta. */}
                        {(etiquetaJornadas(item.CantidadJornadas) || item.Eliminatoria) && (
                          <div className="flex flex-wrap items-center gap-1 mt-1.5">
                            {etiquetaJornadas(item.CantidadJornadas) && (
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-white/10 text-slate-300 border border-white/10">
                                {etiquetaJornadas(item.CantidadJornadas)}
                              </span>
                            )}
                            {item.Eliminatoria && (
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-amber-500/10 text-amber-700 border border-amber-200">
                                {item.Eliminatoria}
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      {puedeEditar && (
                        <div className="grid grid-cols-2 gap-2 mb-3 p-2 bg-white/5 rounded-lg">
                          <div className="col-span-2 grid grid-cols-3 gap-1 mb-2 pb-2 border-b border-white/10">
                            <div>
                              <div className="text-[8px] text-slate-500 uppercase font-bold">Liga</div>
                              <div className="text-[10px] font-bold text-slate-200">{new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(item.CostoLiga || 0)}</div>
                            </div>
                            <div>
                              <div className="text-[8px] text-slate-500 uppercase font-bold">Prof.</div>
                              <div className="text-[10px] font-bold text-slate-200">{new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(item.CostoProfesor || 0)}</div>
                            </div>
                            <div>
                              <div className="text-[8px] text-slate-500 uppercase font-bold">Arb.</div>
                              <div className="text-[10px] font-bold text-slate-200">{new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(item.CostoArbitro || 0)}</div>
                            </div>
                          </div>

                          <div>
                            <div className="text-[9px] text-slate-500 uppercase font-bold">Costo Total</div>
                            <div className="text-xs font-bold text-white">
                              {new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format((item.CostoLiga || 0) + (item.CostoProfesor || 0) + (item.CostoArbitro || 0))}
                            </div>
                          </div>
                          <div>
                            <div className="text-[9px] text-slate-500 uppercase font-bold">Jugadores</div>
                            <div className="text-xs font-bold text-blue-300">{item.JugadoresConvocados}</div>
                          </div>

                          <div className="pt-1 border-t border-white/10">
                            <div className="text-[9px] text-slate-500 uppercase font-bold">Total Esperado</div>
                            <div className="text-xs font-bold text-emerald-300">{new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(item.Total || 0)}</div>
                          </div>
                          <div className="pt-1 border-t border-white/10">
                            <div className="text-[9px] text-slate-500 uppercase font-bold">Total Recaudado</div>
                            <div className="text-xs font-bold text-blue-300">{new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(item.Pagos || 0)}</div>
                          </div>

                          <div className="pt-1 border-t border-white/10">
                            <div className="text-[9px] text-slate-500 uppercase font-bold">Utilidad Esp.</div>
                            <div className={`text-xs font-bold ${(item.Total - ((item.CostoLiga || 0) + (item.CostoProfesor || 0) + (item.CostoArbitro || 0))) >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                              {new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(item.Total - ((item.CostoLiga || 0) + (item.CostoProfesor || 0) + (item.CostoArbitro || 0)))}
                            </div>
                          </div>
                          <div className="pt-1 border-t border-white/10">
                            <div className="text-[9px] text-slate-500 uppercase font-bold">Utilidad Rec.</div>
                            <div className={`text-xs font-bold ${(item.Pagos - ((item.CostoLiga || 0) + (item.CostoProfesor || 0) + (item.CostoArbitro || 0))) >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                              {new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(item.Pagos - ((item.CostoLiga || 0) + (item.CostoProfesor || 0) + (item.CostoArbitro || 0)))}
                            </div>
                          </div>

                          <div className="col-span-2 pt-1 border-t border-white/10">
                            <div className="text-[9px] text-slate-500 uppercase font-bold">Periodo</div>
                            <div className="text-[10px] text-slate-300">{formatDate(item.FechaInicio)} - {formatDate(item.FechaFin)}</div>
                          </div>
                        </div>
                      )}

                      {(!puedeEditar) && (
                        <div className="mb-3 p-2 bg-white/5 rounded-lg">
                           <div className="text-[9px] text-slate-500 uppercase font-bold">Periodo</div>
                           <div className="text-[10px] text-slate-300 font-bold">{formatDate(item.FechaInicio)} - {formatDate(item.FechaFin)}</div>
                        </div>
                      )}

                      <div className="flex flex-wrap gap-1.5 pt-2 border-t border-white/10">
                        {item.Cerrada === 0 ? (
                          <>
                            <button
                              onClick={() => handleNavigateToConvocatoria(item)}
                              className="flex-1 bg-green-600 hover:bg-green-700 text-white text-[11px] font-bold py-2 rounded-lg transition-colors shadow-sm"
                            >
                              Convocar
                            </button>
                            {puedeEditar && (
                              <>
                                <button
                                  onClick={() => handleOpenEditModal(item)}
                                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-bold py-2 rounded-lg transition-colors shadow-sm"
                                >
                                  Editar
                                </button>
                                <button
                                  onClick={() => handleCloseConvocatoria(item)}
                                  className="flex-1 bg-orange-500 hover:bg-orange-600 text-white text-[11px] font-bold py-2 rounded-lg transition-colors shadow-sm"
                                >
                                  Cerrar
                                </button>
                              </>
                            )}
                          </>
                        ) : (
                          <div className="w-full text-center py-2 text-slate-500 font-medium text-xs">Esta convocatoria está cerrada</div>
                        )}
                        {puedeEditar && (
                          <button
                            onClick={() => handleDeleteConvocatoria(item)}
                            className="w-full bg-rose-500/15 hover:bg-red-200 text-rose-300 text-[10px] font-bold py-1.5 rounded-lg transition-colors mt-0.5"
                          >
                            Eliminar Permanente
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="py-12 text-center text-slate-400 bg-white/5 rounded-xl border border-white/10">
                    No se encontraron convocatorias.
                  </div>
                )}
              </div>

              <div className="mt-8 pt-6 border-t border-white/10 flex justify-center">
                <h3 className="text-lg md:text-xl font-bold text-slate-400 italic">
                  {isLoading ? 'Cargando...' : `${sortedConvocatorias.length} Convocatorias en total`}
                </h3>
              </div>
              </>
              )}
            </div>
          </div>
      </main>

      {/* Edit Convocatoria Modal */}
      {isEditModalOpen && selectedConvocatoria && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center z-50">
          <div className="bg-[#0f172a] backdrop-blur-sm rounded-lg p-6 w-[500px] shadow-lg relative">
            <button
              onClick={() => setIsEditModalOpen(false)}
              className="absolute top-4 right-4 text-slate-500 hover:text-slate-300 transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <h3 className="text-xl font-bold mb-4 text-white">Editar Convocatoria</h3>
            <p className="text-sm text-slate-400 mb-4">
              Editando: <span className="font-bold">{selectedConvocatoria.Liga} - {selectedConvocatoria.Categoria}</span>
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-200 mb-2">Profesor</label>
                <select
                  value={editConvocatoria.idProfesor}
                  onChange={(e) => setEditConvocatoria(prev => ({ ...prev, idProfesor: e.target.value }))}
                  className="w-full appearance-none bg-white/5 border border-white/15 text-slate-200 py-2 px-3 rounded-lg leading-tight focus:outline-none focus:border-blue-500"
                >
                  <option value="">Seleccione Profesor</option>
                  {profesores.map((prof) => (
                    <option key={prof.IdUsuario} value={prof.IdUsuario}>
                      {prof.Usuario}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-200 mb-2">Color Distintivo</label>
                <input
                  type="text"
                  value={editConvocatoria.newColor}
                  onChange={(e) => setEditConvocatoria(prev => ({ ...prev, newColor: e.target.value.toUpperCase() }))}
                  className="w-full appearance-none bg-white/5 border border-white/15 text-slate-200 py-2 px-3 rounded-lg leading-tight focus:outline-none focus:border-blue-500 uppercase"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-200 mb-2">Fecha Inicio</label>
                <input
                  type="date"
                  value={editConvocatoria.fechaInicio}
                  onChange={(e) => setEditConvocatoria(prev => ({ ...prev, fechaInicio: e.target.value }))}
                  className="w-full appearance-none bg-white/5 border border-white/15 text-slate-200 py-2 px-3 rounded-lg leading-tight focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-200 mb-2">Fecha Fin</label>
                <input
                  type="date"
                  value={editConvocatoria.fechaFin}
                  onChange={(e) => setEditConvocatoria(prev => ({ ...prev, fechaFin: e.target.value }))}
                  className="w-full appearance-none bg-white/5 border border-white/15 text-slate-200 py-2 px-3 rounded-lg leading-tight focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Costo Liga</label>
                  <input
                    type="number"
                    value={editConvocatoria.costoLiga}
                    onChange={(e) => setEditConvocatoria(prev => ({ ...prev, costoLiga: e.target.value }))}
                    className="w-full bg-white/5 border border-white/15 text-slate-200 py-1.5 px-3 rounded-lg text-sm focus:border-blue-500 outline-none"
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Costo Profesor</label>
                  <input
                    type="number"
                    value={editConvocatoria.costoProfesor}
                    onChange={(e) => setEditConvocatoria(prev => ({ ...prev, costoProfesor: e.target.value }))}
                    className="w-full bg-white/5 border border-white/15 text-slate-200 py-1.5 px-3 rounded-lg text-sm focus:border-blue-500 outline-none"
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Costo Árbitro</label>
                  <input
                    type="number"
                    value={editConvocatoria.costoArbitro}
                    onChange={(e) => setEditConvocatoria(prev => ({ ...prev, costoArbitro: e.target.value }))}
                    className="w-full bg-white/5 border border-white/15 text-slate-200 py-1.5 px-3 rounded-lg text-sm focus:border-blue-500 outline-none"
                    placeholder="0.00"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Cantidad de Jornadas</label>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={editConvocatoria.cantidadJornadas}
                    onChange={(e) => setEditConvocatoria(prev => ({ ...prev, cantidadJornadas: e.target.value }))}
                    className="w-full bg-white/5 border border-white/15 text-slate-200 py-1.5 px-3 rounded-lg text-sm focus:border-blue-500 outline-none"
                    placeholder="Ej. 10"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Eliminatoria</label>
                  <select
                    value={editConvocatoria.eliminatoria}
                    onChange={(e) => setEditConvocatoria(prev => ({ ...prev, eliminatoria: e.target.value }))}
                    className="w-full bg-white/5 border border-white/15 text-slate-200 py-1.5 px-3 rounded-lg text-sm focus:border-blue-500 outline-none"
                  >
                    <option value="">Sin eliminatoria</option>
                    {ELIMINATORIAS.map((e) => <option key={e} value={e}>{e}</option>)}
                  </select>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="bg-white/10 hover:bg-white/15 text-white font-bold py-2 px-4 rounded transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleUpdateConvocatoria}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded transition-colors"
              >
                Actualizar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Players Modal */}
      {isPlayersModalOpen && selectedConvocatoria && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-md flex items-center justify-center z-50 p-2 md:p-4">
          <div className="bg-[#0f172a] rounded-2xl w-full max-w-6xl h-full md:h-auto max-h-screen md:max-h-[92vh] overflow-hidden shadow-2xl border border-white/10 flex flex-col">

            {/* ── Encabezado fijo: identidad, cifras, filtros y avisos ──
                Vive FUERA del área que hace scroll, así que al bajar por la lista de
                jugadores siguen a la vista el buscador, la alerta y las cifras. Lo único
                que se desplaza es la tabla, que además deja sus encabezados pegados. */}
            <div className="flex-shrink-0 border-b border-white/10 bg-white/[0.03]">

              <div className="flex items-start justify-between gap-3 p-4 md:px-5 md:pt-5 md:pb-4">
                <div className="flex items-center gap-3 md:gap-4 min-w-0">
                  {fotoLiga(selectedConvocatoria) && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={fotoLiga(selectedConvocatoria)!}
                      alt=""
                      className="w-16 h-16 md:w-20 md:h-20 rounded-2xl object-contain bg-slate-950/50 border border-white/10 flex-shrink-0"
                    />
                  )}
                  <div className="min-w-0">
                    {/* La liga en pequeño arriba y la categoría grande: dentro del modal
                        el torneo ya se da por sabido, lo que se consulta es la categoría. */}
                    <p className="text-[10px] md:text-[11px] font-black text-blue-300 uppercase tracking-[0.15em] truncate">
                      {selectedConvocatoria.Liga}
                    </p>
                    <h3 className="text-2xl md:text-3xl font-black text-white leading-none tracking-tight flex flex-wrap items-center gap-2 mt-1">
                      {selectedConvocatoria.Categoria}
                      {selectedConvocatoria.Color && (
                        <span className="text-[10px] font-bold text-slate-300 bg-white/10 px-2 py-1 rounded-md border border-white/10 uppercase tracking-wider">
                          {selectedConvocatoria.Color}
                        </span>
                      )}
                    </h3>
                    <p className="text-[11px] md:text-xs text-slate-400 mt-1.5">
                      {formatDate(selectedConvocatoria.FechaInicio)} — {formatDate(selectedConvocatoria.FechaFin)}
                    </p>
                  </div>
                </div>
                <button
                  onClick={async () => {
                    setIsPlayersModalOpen(false);
                    setSelectedConvocatoria(null);
                    setPlayers([]);
                    await fetchConvocatorias();
                  }}
                  title="Cerrar"
                  className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-all flex-shrink-0"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Las cifras de la convocatoria, arriba y en una sola línea. */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 px-4 md:px-5">
                <CifraConvocatoria etiqueta="Convocados" valor={String(recordCount)} clase="text-white" />
                <CifraConvocatoria etiqueta="Total" valor={moneda(totalPrice)} clase="text-blue-300" />
                <CifraConvocatoria etiqueta="Pagado" valor={moneda(totalPagos)} clase="text-emerald-300" />
                <CifraConvocatoria etiqueta="Por cobrar" valor={moneda(totalCXC)} clase="text-rose-300" />
              </div>

              {/* Buscador, filtros y acciones */}
              <div className="flex flex-col lg:flex-row lg:items-center gap-3 p-4 md:px-5 md:py-4">
                <div className="relative flex-1 min-w-[220px]">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Buscar jugador por nombre, ID o categoría..."
                    className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-24 py-2.5 text-sm text-slate-100 placeholder-slate-500 outline-none focus:border-blue-500/60 focus:bg-white/[0.07] transition-all"
                    value={busquedaJugador}
                    onChange={(e) => setBusquedaJugador(e.target.value)}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-black text-slate-500 tabular-nums">
                    {sortedPlayers.length}/{players.length}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-3 md:gap-4">
                  <label className="relative inline-flex items-center cursor-pointer group">
                    <input
                      type="checkbox"
                      className="sr-only peer"
                      checked={showOnlyConvocados}
                      onChange={(e) => setShowOnlyConvocados(e.target.checked)}
                    />
                    <div className="w-10 h-5 bg-white/15 peer-focus-visible:ring-2 peer-focus-visible:ring-blue-500/60 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-white/20 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600 transition-colors"></div>
                    <span className="ml-2 text-[10px] md:text-xs font-semibold text-slate-300 whitespace-nowrap">Solo convocados</span>
                  </label>

                  <label className="relative inline-flex items-center cursor-pointer group" title="Deja solo a los jugadores con algún porcentaje de beca">
                    <input
                      type="checkbox"
                      className="sr-only peer"
                      checked={showOnlyBecados}
                      onChange={(e) => setShowOnlyBecados(e.target.checked)}
                    />
                    <div className="w-10 h-5 bg-white/15 peer-focus-visible:ring-2 peer-focus-visible:ring-purple-500/60 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-white/20 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-purple-600 transition-colors"></div>
                    <span className="ml-2 text-[10px] md:text-xs font-semibold text-slate-300 whitespace-nowrap">Solo becados</span>
                  </label>
                </div>

                <div className="flex gap-2 w-full lg:w-auto">
                  <button
                    onClick={exportPlayersToExcel}
                    className="flex-1 lg:flex-none inline-flex items-center justify-center gap-1.5 bg-emerald-600/15 hover:bg-emerald-600/25 border border-emerald-500/30 text-emerald-200 text-[11px] font-bold py-2 px-3 rounded-xl transition-colors"
                  >
                    <FileSpreadsheet size={13} /> Excel
                  </button>
                  <button
                    onClick={exportPlayersToPDF}
                    className="flex-1 lg:flex-none inline-flex items-center justify-center gap-1.5 bg-blue-600/15 hover:bg-blue-600/25 border border-blue-500/30 text-blue-200 text-[11px] font-bold py-2 px-3 rounded-xl transition-colors"
                  >
                    <FileText size={13} /> PDF
                  </button>
                  <button
                    onClick={handleOpenInviteModal}
                    className="flex-[2] lg:flex-none inline-flex items-center justify-center gap-1.5 bg-purple-600 hover:bg-purple-500 text-white text-[11px] font-bold py-2 px-4 rounded-xl transition-colors shadow-sm"
                  >
                    <UserPlus size={13} /> Invitar
                  </button>
                </div>
              </div>

              {/* Aquí está toda la categoría. Los que traen adeudo o no tienen
                  inscripción salen en ámbar: se pueden convocar, pero conviene saberlo. */}
              {sinAlCorriente > 0 && (
                <div className="mx-4 md:mx-5 mb-4 flex items-start gap-2 px-3.5 py-2.5 rounded-xl bg-amber-500/10 border border-amber-400/25 text-amber-200">
                  <Info size={15} className="flex-shrink-0 mt-0.5 text-amber-400" />
                  <p className="text-[11px] font-semibold leading-relaxed">
                    {sinAlCorriente} jugador{sinAlCorriente !== 1 ? 'es' : ''} de la categoría
                    {sinAlCorriente !== 1 ? ' tienen' : ' tiene'} adeudo o no
                    {sinAlCorriente !== 1 ? ' tienen' : ' tiene'} inscripción pagada en la temporada
                    (marcados en ámbar). Se pueden convocar igual.
                  </p>
                </div>
              )}
            </div>

            {/* ── Lo único que se desplaza: la lista ──
                min-h-0 es lo que le permite encogerse dentro del flex y darle a la tabla
                una altura contra la cual desplazarse; sin él, el hijo crecería y el
                scroll se saldría del modal. */}
            <div className="flex-1 min-h-0 p-4 md:p-5 bg-white/5 flex flex-col">
              {isLoadingPlayers ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-3 text-slate-400">
                  <Loader2 size={30} className="animate-spin text-blue-400" />
                  <p className="text-sm font-bold">Cargando jugadores...</p>
                </div>
              ) : (
                <ConvocatoriaPlayersTable
                  players={sortedPlayers}
                  sortConfig={playerSortConfig}
                  onSort={handlePlayerSort}
                  onConvocar={handleConvocarPlayer}
                  onQuitar={handleQuitarPlayer}
                  onPrecio={handleUpdatePrice}
                  onHistorial={abrirHistorialPagos}
                  onPagosConvocatoria={fetchPlayerPayments}
                />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Invite Player Modal */}
      {isInviteModalOpen && selectedConvocatoria && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="bg-[#0f172a] backdrop-blur-sm rounded-lg w-full max-w-md shadow-lg">
            <div className="p-6 border-b border-white/10">
              <div className="flex justify-between items-center">
                <h3 className="text-xl font-bold text-white">Invitar Jugador</h3>
                <button
                  onClick={() => {
                    setIsInviteModalOpen(false);
                    setSelectedPlayerId('');
                  }}
                  className="text-slate-500 hover:text-slate-300 transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="p-6">
              {isLoadingAvailablePlayers ? (
                <div className="flex items-center justify-center py-8">
                  <svg className="animate-spin h-8 w-8 text-blue-300" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                </div>
              ) : availablePlayers.length === 0 ? (
                <p className="text-center text-slate-300 py-8">No hay jugadores disponibles para invitar</p>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-slate-200 mb-2">Buscar jugador</label>
                  <input
                    type="text"
                    value={playerSearchQuery}
                    onChange={(e) => setPlayerSearchQuery(e.target.value)}
                    placeholder="Escribe para buscar..."
                    className="w-full mb-4 appearance-none bg-white/5 border border-white/15 text-slate-200 py-2 px-3 rounded-lg leading-tight focus:outline-none focus:border-blue-500"
                  />
                  <label className="block text-sm font-medium text-slate-200 mb-2">Seleccione un jugador</label>
                  <select
                    value={selectedPlayerId}
                    onChange={(e) => setSelectedPlayerId(e.target.value)}
                    size={8}
                    className="w-full appearance-none bg-white/5 border border-white/15 text-slate-200 py-2 px-3 rounded-lg leading-tight focus:outline-none focus:border-blue-500"
                  >
                    <option value="">-- Seleccione --</option>
                    {availablePlayers
                      .filter(player =>
                        player.Jugador.toLowerCase().includes(playerSearchQuery.toLowerCase()) ||
                        player.Categoria.toLowerCase().includes(playerSearchQuery.toLowerCase())
                      )
                      .map((player) => (
                        <option
                          key={player.IdJugador}
                          value={player.IdJugador}
                          title={
                            player.Advertencia
                              ? `${player.Advertencia} Aun así lo puedes invitar.`
                              : undefined
                          }
                        >
                          {player.Jugador} ({player.Categoria}){player.Advertencia ? ` — ⚠ ${etiquetaAdvertencia(player)}` : ''}
                        </option>
                      ))}
                  </select>
                  {availablePlayers.some(p => p.Advertencia) && (
                    <p className="mt-2 text-xs text-amber-300/90">
                      Los marcados con ⚠ traen adeudo o no tienen inscripción en la temporada. Se pueden invitar igual.
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 p-6 border-t border-white/10">
              <button
                onClick={() => {
                  setIsInviteModalOpen(false);
                  setSelectedPlayerId('');
                  setPlayerSearchQuery('');
                }}
                className="bg-white/10 hover:bg-white/15 text-white font-bold py-2 px-4 rounded transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleInvitePlayer}
                disabled={!selectedPlayerId}
                className="bg-purple-600 hover:bg-purple-700 disabled:bg-white/15 disabled:cursor-not-allowed text-white font-bold py-2 px-4 rounded transition-colors"
              >
                Invitar
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Payment Details Modal */}
      {isPaymentDetailsModalOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center z-[60] p-4">
          <div className="bg-white/5 rounded-lg w-full max-w-lg shadow-xl overflow-hidden">
            <div className="p-4 border-b border-white/10 bg-white/5 flex justify-between items-center">
              <h3 className="text-lg font-bold text-white">Pagos de {jugadorPagosConvocatoria?.jugador}</h3>
              <button
                onClick={() => setIsPaymentDetailsModalOpen(false)}
                className="text-slate-500 hover:text-slate-300 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="p-6 max-h-[60vh] overflow-y-auto">
              {isLoadingPayments ? (
                <div className="flex items-center justify-center py-8">
                  <svg className="animate-spin h-8 w-8 text-blue-300" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                </div>
              ) : playerPayments.length === 0 ? (
                <div className="text-center py-8 text-slate-400 italic">No se registran pagos para este jugador en esta convocatoria.</div>
              ) : (
                <div className="space-y-3">
                  {playerPayments.map((p: any) => (
                    <div key={p.IdPago} className="bg-white/5 p-3 rounded-lg border border-white/10 flex justify-between items-center hover:bg-white/10 transition-colors">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[10px] font-bold text-blue-300 bg-blue-500/10 px-1.5 py-0.5 rounded">Recibo #{p.Recibo || 'N/A'}</span>
                          <span className="text-[10px] text-slate-500 font-bold uppercase">{formatDate(p.FechaPago)}</span>
                        </div>
                        <div className="text-sm text-slate-200 font-medium leading-tight">{p.Comentario || 'Pago de convocatoria'}</div>
                      </div>
                      <div className="text-base font-bold text-emerald-300 ml-4">
                        {new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(p.Pago)}
                      </div>
                    </div>
                  ))}
                  <div className="pt-4 mt-4 border-t-2 border-white/10 flex justify-between items-center font-bold text-lg">
                    <span className="text-white">Total:</span>
                    <span className="text-blue-300">
                      {new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(playerPayments.reduce((sum, p) => sum + p.Pago, 0))}
                    </span>
                  </div>
                </div>
              )}
            </div>
            
            <div className="p-4 bg-white/5 border-t border-white/10 flex justify-between items-center gap-3">
              {/* Este modal solo muestra lo abonado a ESTA convocatoria. Desde aquí se
                  salta al historial completo del jugador, que es otra pregunta. */}
              <button
                onClick={() => {
                  setIsPaymentDetailsModalOpen(false);
                  if (jugadorPagosConvocatoria) setPagosTarget(jugadorPagosConvocatoria);
                }}
                className="flex items-center gap-1.5 text-slate-300 hover:text-blue-300 font-bold text-xs transition-colors"
              >
                <History size={14} />
                Ver historial completo del jugador
              </button>
              <button
                onClick={() => setIsPaymentDetailsModalOpen(false)}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-6 rounded-lg transition-colors shadow-sm"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Historial de pagos del jugador. Es el MISMO modal de Inscripciones y Adeudos:
          arranca en la temporada de la convocatoria y trae el interruptor para ver todo
          el histórico, además de la exportación a PDF y Excel. */}
      <PlayerPagosModal
        target={pagosTarget}
        temporadaId={temporadaDeLaLista}
        temporadaNombre={nombreTemporadaDeLaLista}
        onClose={() => setPagosTarget(null)}
        onDataChanged={() => { if (selectedConvocatoria) handleNavigateToConvocatoria(selectedConvocatoria); }}
      />
  </DashboardLayout>
  );
}
