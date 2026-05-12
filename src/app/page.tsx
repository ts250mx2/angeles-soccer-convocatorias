"use client";
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { LogOut, Search, ChevronDown, LayoutGrid, List, CreditCard } from 'lucide-react';
import { useRef } from 'react';
import { useUser } from '@/contexts/user-context';
import { useEffect, useState } from 'react';
import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface ConvocatoriaSummary {
  IdTemporada: number;
  IdLiga: number;
  Categoria: string;
  Color?: string;
  IdProfesor?: number;
  Profesor?: string;
  Liga: string;
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
}

export default function Home() {
  const router = useRouter();
  const { user, season, seasonId, setSeason, isInitialized } = useUser();
  const [convocatorias, setConvocatorias] = useState<ConvocatoriaSummary[]>([]);
  const [leagues, setLeagues] = useState<any[]>([]);
  const [profesores, setProfesores] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [filters, setFilters] = useState({
    liga: '',
    profesor: '',
    categoria: '',
    color: '',
    fechaInicio: '',
    fechaFin: '',
    cerrada: '',
    jugadoresConvocados: '',
    total: '',
    pagos: ''
  });

  // Create Modal State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const today = new Date().toISOString().split('T')[0];
  const [newConvocatoria, setNewConvocatoria] = useState({
    leagueId: '',
    idProfesor: '',
    categoria: '',
    fechaInicio: today,
    fechaFin: today,
    color: '',
    costoLiga: 0,
    costoProfesor: 0,
    costoArbitro: 0
  });
  const [dbCategories, setDbCategories] = useState<string[]>([]);
  const [categorySearchQuery, setCategorySearchQuery] = useState('');
  const [isCategoryDropdownOpen, setIsCategoryDropdownOpen] = useState(false);
  const categoryDropdownRef = useRef<HTMLDivElement>(null);

  const [leagueSearchQuery, setLeagueSearchQuery] = useState('');
  const [isLeagueDropdownOpen, setIsLeagueDropdownOpen] = useState(false);
  const leagueDropdownRef = useRef<HTMLDivElement>(null);

  const [profesorSearchQuery, setProfesorSearchQuery] = useState('');
  const [isProfesorDropdownOpen, setIsProfesorDropdownOpen] = useState(false);
  const profesorDropdownRef = useRef<HTMLDivElement>(null);

  // Edit Modal State
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editConvocatoria, setEditConvocatoria] = useState({
    oldColor: '',
    newColor: '',
    fechaInicio: '',
    fechaFin: '',
    idProfesor: '' as string | number,
    costoLiga: 0,
    costoProfesor: 0,
    costoArbitro: 0
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
  const [playerFilters, setPlayerFilters] = useState({
    idJugador: '',
    jugador: '',
    categoria: '',
    precio: '',
    estado: '',
    pago: '',
    cxc: ''
  });
  const [playerSortConfig, setPlayerSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);

  // Invite Modal State
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [availablePlayers, setAvailablePlayers] = useState<any[]>([]);
  const [isLoadingAvailablePlayers, setIsLoadingAvailablePlayers] = useState(false);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string>('');
  const [playerSearchQuery, setPlayerSearchQuery] = useState<string>('');
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
  const [showClosed, setShowClosed] = useState(false);
  const [showOnlyConvocados, setShowOnlyConvocados] = useState(true);
  const [showOnlyDebts, setShowOnlyDebts] = useState(false);
  const [summarySearchQuery, setSummarySearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('cards');
  const [playerViewMode, setPlayerViewMode] = useState<'table' | 'cards'>('cards');
  const [playerPayments, setPlayerPayments] = useState<any[]>([]);
  const [isPaymentDetailsModalOpen, setIsPaymentDetailsModalOpen] = useState(false);
  const [isLoadingPayments, setIsLoadingPayments] = useState(false);
  const [selectedPlayerName, setSelectedPlayerName] = useState('');

  // Check if user is logged in, redirect to login if not
  useEffect(() => {
    if (isInitialized && !user) {
      router.push('/login');
    }
  }, [user, isInitialized, router]);


  // Fetch convocatorias summary
  const fetchConvocatorias = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/convocatorias/summary?userId=${user?.IdUsuario}&adminLevel=${user?.AdminConvocatorias}`);
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

    fetch('/api/leagues')
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setLeagues(data.leagues);
        }
      })
      .catch(err => console.error('Error fetching leagues:', err));

    fetch('/api/users')
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setProfesores(data.data);
        }
      })
      .catch(err => console.error('Error fetching professors:', err));

    fetch('/api/convocatorias/categories')
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setDbCategories(data.data.map((item: any) => item.Categoria));
        }
      })
      .catch(err => console.error('Error fetching categories:', err));
  }, [setSeason]);

  // Click outside to close category dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (categoryDropdownRef.current && !categoryDropdownRef.current.contains(event.target as Node)) {
        setIsCategoryDropdownOpen(false);
      }
      if (leagueDropdownRef.current && !leagueDropdownRef.current.contains(event.target as Node)) {
        setIsLeagueDropdownOpen(false);
      }
      if (profesorDropdownRef.current && !profesorDropdownRef.current.contains(event.target as Node)) {
        setIsProfesorDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const filteredConvocatorias = convocatorias.filter((item) => {
    // Filter by closed status if toggle is off
    if (!showClosed && item.Cerrada === 1) return false;

    return (
      item.Liga.toLowerCase().includes(filters.liga.toLowerCase()) &&
      (item.Profesor?.toLowerCase() ?? '').includes(filters.profesor.toLowerCase()) &&
      item.Categoria.toLowerCase().includes(filters.categoria.toLowerCase()) &&
      (item.Color?.toLowerCase() ?? '').includes(filters.color.toLowerCase()) &&
      (filters.fechaInicio === '' || item.FechaInicio?.includes(filters.fechaInicio)) &&
      (filters.fechaFin === '' || item.FechaFin?.includes(filters.fechaFin)) &&
      (filters.cerrada === '' || (item.Cerrada ? 'sí' : 'no').includes(filters.cerrada.toLowerCase())) &&
      (item.JugadoresConvocados?.toString() ?? '0').includes(filters.jugadoresConvocados) &&
      (item.Total?.toString() ?? '0').includes(filters.total) &&
      (item.Pagos?.toString() ?? '0').includes(filters.pagos)
    );
  });

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

  const handleCreateConvocatoria = async () => {
    if (!seasonId || !newConvocatoria.leagueId || !newConvocatoria.categoria || !newConvocatoria.fechaInicio || !newConvocatoria.fechaFin) {
      alert('Por favor complete todos los campos');
      return;
    }

    try {
      const response = await fetch('/api/convocatorias/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          seasonId,
          leagueId: newConvocatoria.leagueId,
          categoria: newConvocatoria.categoria,
          fechaInicio: newConvocatoria.fechaInicio,
          fechaFin: newConvocatoria.fechaFin,
          color: newConvocatoria.color,
          idProfesor: newConvocatoria.idProfesor,
          costoLiga: newConvocatoria.costoLiga,
          costoProfesor: newConvocatoria.costoProfesor,
          costoArbitro: newConvocatoria.costoArbitro
        })
      });

      const data = await response.json();
      if (data.success) {
        alert('Convocatoria creada exitosamente');
        setIsCreateModalOpen(false);
        setNewConvocatoria({
          leagueId: '',
          idProfesor: '',
          categoria: '',
          fechaInicio: today,
          fechaFin: today,
          color: '',
          costoLiga: 0,
          costoProfesor: 0,
          costoArbitro: 0
        });
        // Refresh the list
        const refreshResponse = await fetch('/api/convocatorias/summary');
        const refreshData = await refreshResponse.json();
        if (refreshData.success) {
          setConvocatorias(refreshData.data);
        }
      } else {
        alert('Error al crear convocatoria: ' + data.message);
      }
    } catch (error) {
      console.error('Error creating convocatoria:', error);
      alert('Error al procesar la solicitud');
    }
  };

  const handleOpenEditModal = (item: ConvocatoriaSummary) => {
    setSelectedConvocatoria(item);
    setEditConvocatoria({
      oldColor: item.Color || '',
      newColor: item.Color || '',
      fechaInicio: item.FechaInicio ? item.FechaInicio.substring(0, 10) : '',
      fechaFin: item.FechaFin ? item.FechaFin.substring(0, 10) : '',
      idProfesor: item.IdProfesor || '',
      costoLiga: item.CostoLiga || 0,
      costoProfesor: item.CostoProfesor || 0,
      costoArbitro: item.CostoArbitro || 0
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
          costoArbitro: editConvocatoria.costoArbitro
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
          color: item.Color
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

    doc.save(`Convocatorias_${season || 'AngelesSoccer'}.pdf`);
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
      { header: '', key: 'precio', width: 15, style: { numFmt: '"$"#,##0.00' } },
      { header: '', key: 'pago', width: 15, style: { numFmt: '"$"#,##0.00' } },
      { header: '', key: 'cxc', width: 15, style: { numFmt: '"$"#,##0.00' } },
      { key: 'estado', width: 15 }
    ];

    // Encabezados (Fila 5)
    const headerRow = worksheet.getRow(5);
    headerRow.values = ['ID', 'Jugador', 'Categoría', 'Precio', 'Pago', 'CXC', 'Estado'];
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
      new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(player.Precio).replace(/\u00a0/g, ' '),
      new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(player.PagoJugador).replace(/\u00a0/g, ' '),
      new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(player.CXC).replace(/\u00a0/g, ' '),
      player.EsConvocado ? 'Convocado' : player.EsEliminado ? 'Eliminado' : player.EsInvitado ? 'Invitado' : 'Disponible'
    ]);

    tableData.push([
      '',
      'TOTALES',
      '',
      new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(totalPrecio).replace(/\u00a0/g, ' '),
      new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(totalPago).replace(/\u00a0/g, ' '),
      new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(totalCXC).replace(/\u00a0/g, ' '),
      ''
    ]);

    autoTable(doc, {
      head: [['ID', 'Jugador', 'Categoría', 'Precio', 'Pago', 'CXC', 'Estado']],
      body: tableData,
      startY: 40,
      theme: 'grid',
      styles: { fontSize: 8 },
      headStyles: { fillColor: [51, 65, 85] }
    });

    doc.save(`Detalle_${selectedConvocatoria.Liga}_${selectedConvocatoria.Categoria}.pdf`);
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
          color: item.Color
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
    setSelectedConvocatoria(item);
    setIsPlayersModalOpen(true);
    setIsLoadingPlayers(true);
    setShowOnlyDebts(false);
    setShowOnlyConvocados(item.JugadoresConvocados > 0);

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
          color: selectedConvocatoria.Color
        })
      });

      const data = await response.json();
      if (data.success) {
        // Refresh players list
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
          color: selectedConvocatoria.Color
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
          color: selectedConvocatoria.Color
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
    // Filter by convocado status if toggle is on
    if (showOnlyConvocados && !player.EsConvocado) return false;

    // Filter by debts if toggle is on
    if (showOnlyDebts && (player.Precio - (player.PagoJugador || 0)) <= 0) return false;

    return (
      (player.IdJugador?.toString() ?? '').includes(playerFilters.idJugador) &&
      player.Jugador.toLowerCase().includes(playerFilters.jugador.toLowerCase()) &&
      player.Categoria.toLowerCase().includes(playerFilters.categoria.toLowerCase()) &&
      (player.Precio?.toString() ?? '0').includes(playerFilters.precio) &&
      (player.PagoJugador?.toString() ?? '0').includes(playerFilters.pago) &&
      ((player.Precio - (player.PagoJugador || 0))?.toString() ?? '0').includes(playerFilters.cxc) &&
      (playerFilters.estado === '' ||
        (playerFilters.estado.toLowerCase() === 'convocado' && player.EsConvocado) ||
        (playerFilters.estado.toLowerCase() === 'eliminado' && player.EsEliminado) ||
        (playerFilters.estado.toLowerCase() === 'disponible' && !player.EsConvocado && !player.EsEliminado)
      )
    );
  });

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

    const newPrice = prompt(`Ingrese el nuevo precio para ${player.Jugador}:`, (player.Precio ?? 0).toString());
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
          color: selectedConvocatoria.Color,
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

  const fetchPlayerPayments = async (player: any) => {
    if (!selectedConvocatoria) return;
    
    setIsLoadingPayments(true);
    setSelectedPlayerName(player.Jugador);
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
          color: selectedConvocatoria.Color
        })
      });

      const data = await response.json();
      if (data.success) {
        alert('Jugador invitado exitosamente');
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
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900">
      <nav className="bg-white/10 backdrop-blur-xl border-b border-white/20 px-6 py-4 flex justify-between items-center shadow-lg">
        <div>
          <h1 className="text-xl font-bold text-white">Convocatorias Angeles Soccer</h1>
          {user && (
            <p className="text-sm text-blue-200 mt-0.5 flex items-center gap-2">
              <span>Hola, {user.Usuario}</span>
              {user.AdminConvocatorias !== undefined && (
                <span title={user.AdminConvocatorias >= 2 ? "Acceso completo" : "Acceso restringido"}>
                  {user.AdminConvocatorias >= 2 ? (
                    <svg className="w-4 h-4 text-green-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4 text-red-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  )}
                </span>
              )}
              {season && <span className="font-medium text-blue-300 ml-1">| {season}</span>}
            </p>
          )}
        </div>
        <div className="flex gap-4">
          {user && (user.AdminConvocatorias ?? 0) >= 2 && (
            <Link href="/adeudos" className="flex items-center text-blue-200 hover:text-white transition-colors">
              <CreditCard size={18} className="mr-2" />
              Adeudos
            </Link>
          )}
          <Link href="/login" className="flex items-center text-blue-200 hover:text-white transition-colors">
            <LogOut size={18} className="mr-2" />
            Salir
          </Link>
        </div>
      </nav>
      <main className="p-4 md:p-8">
        <div className="max-w-7xl mx-auto">
          <div className="bg-white/95 backdrop-blur-sm rounded-xl shadow-2xl p-4 md:p-8 border border-white/20">
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 mb-4">
              <h2 className="text-2xl md:text-3xl font-bold text-slate-800">Resumen de Convocatorias</h2>
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 w-full lg:w-auto">
                <label className="relative inline-flex items-center cursor-pointer group">
                  <input
                    type="checkbox"
                    className="sr-only peer"
                    checked={showClosed}
                    onChange={(e) => setShowClosed(e.target.checked)}
                  />
                  <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                  <span className="ml-3 text-sm font-semibold text-slate-600 group-hover:text-slate-800 transition-colors">
                    Ver Cerradas
                  </span>
                </label>
                {(user?.AdminConvocatorias ?? 0) >= 2 && (
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
                <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-lg w-full sm:w-auto justify-center">
                  <button
                    onClick={() => setViewMode('cards')}
                    className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-3 py-1.5 rounded-md transition-all ${viewMode === 'cards' ? 'bg-white shadow-sm text-blue-600 font-bold' : 'text-slate-400 hover:text-slate-600'}`}
                  >
                    <LayoutGrid size={18} />
                    <span className="text-xs">Tarjetas</span>
                  </button>
                  <button
                    onClick={() => setViewMode('table')}
                    className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-3 py-1.5 rounded-md transition-all ${viewMode === 'table' ? 'bg-white shadow-sm text-blue-600 font-bold' : 'text-slate-400 hover:text-slate-600'}`}
                  >
                    <List size={18} />
                    <span className="text-xs">Tabla</span>
                  </button>
                </div>
                <button
                  onClick={() => setIsCreateModalOpen(true)}
                  disabled={!user || (user.AdminConvocatorias ?? 0) < 2}
                  className="w-full sm:w-auto bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 text-white font-bold py-3 px-6 rounded-lg shadow-md hover:shadow-lg transition-all duration-200 transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                  title={!user || (user.AdminConvocatorias ?? 0) < 2 ? "No tienes permisos para crear convocatorias" : ""}
                >
                  + Nueva Convocatoria
                </button>
              </div>
            </div>



              {/* Desktop View Mode Container */}
              <div className={`${viewMode === 'table' ? 'hidden lg:block' : 'hidden'} overflow-x-auto shadow-xl rounded-xl border border-slate-200`}>
                <table className="min-w-full bg-white">
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
                      {(user?.AdminConvocatorias ?? 0) >= 2 && (
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
                    {/* Filter Row */}
                    <tr className="bg-slate-100 border-b-2 border-slate-300">
                      <th className="p-2">
                        <input
                          type="text"
                          value={filters.liga}
                          onChange={(e) => setFilters(prev => ({ ...prev, liga: e.target.value }))}
                          className="w-full text-xs border-2 border-slate-300 rounded-lg px-2 py-1 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none transition-all"
                          placeholder="Filtro..."
                        />
                      </th>
                      <th className="p-2">
                        <input
                          type="text"
                          value={filters.profesor}
                          onChange={(e) => setFilters(prev => ({ ...prev, profesor: e.target.value }))}
                          className="w-full text-xs border-2 border-slate-300 rounded-lg px-2 py-1 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none transition-all"
                          placeholder="Filtro..."
                        />
                      </th>
                      <th className="p-2">
                        <input
                          type="text"
                          value={filters.categoria}
                          onChange={(e) => setFilters(prev => ({ ...prev, categoria: e.target.value }))}
                          className="w-full text-xs border-2 border-slate-300 rounded-lg px-2 py-1 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none transition-all"
                          placeholder="Filtro..."
                        />
                      </th>
                      <th className="p-2">
                        <input
                          type="text"
                          value={filters.color}
                          onChange={(e) => setFilters(prev => ({ ...prev, color: e.target.value }))}
                          className="w-full text-xs border-2 border-slate-300 rounded-lg px-2 py-1 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none transition-all"
                          placeholder="Filtro..."
                        />
                      </th>
                      <th className="p-2">
                        <input
                          type="text"
                          value={filters.fechaInicio}
                          onChange={(e) => setFilters(prev => ({ ...prev, fechaInicio: e.target.value }))}
                          className="w-full text-xs border-2 border-slate-300 rounded-lg px-2 py-1 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none transition-all"
                          placeholder="Filtro..."
                        />
                      </th>
                      <th className="p-2">
                        <input
                          type="text"
                          value={filters.cerrada}
                          onChange={(e) => setFilters(prev => ({ ...prev, cerrada: e.target.value }))}
                          className="w-full text-xs border-2 border-slate-300 rounded-lg px-2 py-1 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none transition-all"
                          placeholder="Sí/No"
                        />
                      </th>
                      <th className="p-2"></th>
                      <th className="p-2"></th>
                      <th className="p-2"></th>
                      <th className="p-2"></th>
                      <th className="p-2"></th>
                      <th className="p-2"></th>
                      <th className="p-2"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {isLoading ? (
                      <tr>
                        <td colSpan={10} className="py-12 text-center text-slate-500">
                          <div className="flex items-center justify-center gap-2">
                            <svg className="animate-spin h-5 w-5 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
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
                          className="hover:bg-slate-50 hover:shadow-sm transition-all duration-200"
                        >
                          <td className="py-2 px-4 text-xs font-medium">{item.Liga}</td>
                          <td className="py-2 px-4 text-xs font-medium text-slate-600">{item.Profesor || '-'}</td>
                          <td className="py-2 px-4 text-xs font-semibold">{item.Categoria}</td>
                          <td className="py-2 px-4 text-xs font-medium text-slate-600 italic">
                            {item.Color || '-'}
                          </td>
                          <td className="py-2 px-4 text-xs">
                            {formatDate(item.FechaInicio)} - {formatDate(item.FechaFin)}
                          </td>
                          <td className="py-2 px-4 text-center text-xs">
                            {item.Cerrada ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-800">
                                ✓ Sí
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-green-100 text-green-800">
                                No
                              </span>
                            )}
                          </td>
                          {(user?.AdminConvocatorias ?? 0) >= 2 && (
                            <>
                              <td className="py-2 px-4 text-center text-xs font-bold text-blue-700">
                                {item.JugadoresConvocados}
                              </td>
                              <td className="py-2 px-4 text-center text-xs font-bold text-green-700">
                                {new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(item.Total || 0)}
                              </td>
                              <td className="py-2 px-4 text-center text-xs font-bold text-green-700">
                                {new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(item.Pagos || 0)}
                              </td>
                              <td className="py-2 px-4 text-center text-xs font-bold text-red-700 bg-red-50/30">
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
                                  {(user?.AdminConvocatorias ?? 0) >= 2 && (
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
                                <span className="text-slate-400 text-xs font-medium px-2">Cerrada</span>
                              )}
                              {(user?.AdminConvocatorias ?? 0) >= 2 && (
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
                        <td colSpan={10} className="py-12 text-center text-slate-500">
                          No se encontraron convocatorias.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Cards View (Mobile default, Desktop optional) */}
              <div className={`${viewMode === 'cards' ? 'block' : 'lg:hidden'} mb-2`}>
                <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
                  <div className="flex items-center gap-2 mb-2 text-slate-500 font-bold text-[10px] uppercase tracking-wider">
                    <Search size={14} />
                    Buscar Convocatoria
                  </div>
                  <input 
                    type="text" 
                    value={summarySearchQuery}
                    onChange={(e) => setSummarySearchQuery(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:bg-white focus:border-blue-500 outline-none transition-all"
                    placeholder="Liga, categoría o profesor..."
                  />
                </div>
              </div>

              <div className={`${viewMode === 'cards' ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4' : 'lg:hidden space-y-4'}`}>

                {isLoading ? (
                  <div className="py-12 text-center text-slate-500 bg-white rounded-xl border border-slate-200 shadow-sm">
                    <div className="flex flex-col items-center justify-center gap-3">
                      <svg className="animate-spin h-8 w-8 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
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
                      className="bg-white rounded-xl border border-slate-200 shadow-md p-4 md:p-3 relative overflow-hidden"
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
                        <div className="text-[9px] md:text-[8px] font-bold text-blue-600 uppercase mb-0.5">{item.Liga}</div>
                        <h4 className="text-base md:text-sm font-bold text-slate-800 leading-tight">{item.Categoria}</h4>
                        <div className="text-xs md:text-[11px] text-slate-500 flex items-center gap-1 mt-1">
                          <span className="font-medium">Profesor:</span> {item.Profesor || '-'}
                        </div>
                        {item.Color && (
                          <div className="text-[10px] md:text-[9px] text-slate-400 mt-0.5 italic">Color: {item.Color}</div>
                        )}
                      </div>

                      {(user?.AdminConvocatorias ?? 0) >= 2 && (
                        <div className="grid grid-cols-2 gap-2 mb-3 p-2 bg-slate-50 rounded-lg">
                          <div className="col-span-2 grid grid-cols-3 gap-1 mb-2 pb-2 border-b border-slate-200">
                            <div>
                              <div className="text-[8px] text-slate-400 uppercase font-bold">Liga</div>
                              <div className="text-[10px] font-bold text-slate-700">{new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(item.CostoLiga || 0)}</div>
                            </div>
                            <div>
                              <div className="text-[8px] text-slate-400 uppercase font-bold">Prof.</div>
                              <div className="text-[10px] font-bold text-slate-700">{new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(item.CostoProfesor || 0)}</div>
                            </div>
                            <div>
                              <div className="text-[8px] text-slate-400 uppercase font-bold">Arb.</div>
                              <div className="text-[10px] font-bold text-slate-700">{new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(item.CostoArbitro || 0)}</div>
                            </div>
                          </div>

                          <div>
                            <div className="text-[9px] text-slate-400 uppercase font-bold">Costo Total</div>
                            <div className="text-xs font-bold text-slate-900">
                              {new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format((item.CostoLiga || 0) + (item.CostoProfesor || 0) + (item.CostoArbitro || 0))}
                            </div>
                          </div>
                          <div>
                            <div className="text-[9px] text-slate-400 uppercase font-bold">Jugadores</div>
                            <div className="text-xs font-bold text-blue-700">{item.JugadoresConvocados}</div>
                          </div>

                          <div className="pt-1 border-t border-slate-200">
                            <div className="text-[9px] text-slate-400 uppercase font-bold">Total Esperado</div>
                            <div className="text-xs font-bold text-green-700">{new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(item.Total || 0)}</div>
                          </div>
                          <div className="pt-1 border-t border-slate-200">
                            <div className="text-[9px] text-slate-400 uppercase font-bold">Total Recaudado</div>
                            <div className="text-xs font-bold text-blue-700">{new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(item.Pagos || 0)}</div>
                          </div>

                          <div className="pt-1 border-t border-slate-200">
                            <div className="text-[9px] text-slate-400 uppercase font-bold">Utilidad Esp.</div>
                            <div className={`text-xs font-bold ${(item.Total - ((item.CostoLiga || 0) + (item.CostoProfesor || 0) + (item.CostoArbitro || 0))) >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                              {new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(item.Total - ((item.CostoLiga || 0) + (item.CostoProfesor || 0) + (item.CostoArbitro || 0)))}
                            </div>
                          </div>
                          <div className="pt-1 border-t border-slate-200">
                            <div className="text-[9px] text-slate-400 uppercase font-bold">Utilidad Rec.</div>
                            <div className={`text-xs font-bold ${(item.Pagos - ((item.CostoLiga || 0) + (item.CostoProfesor || 0) + (item.CostoArbitro || 0))) >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                              {new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(item.Pagos - ((item.CostoLiga || 0) + (item.CostoProfesor || 0) + (item.CostoArbitro || 0)))}
                            </div>
                          </div>

                          <div className="col-span-2 pt-1 border-t border-slate-200">
                            <div className="text-[9px] text-slate-400 uppercase font-bold">Periodo</div>
                            <div className="text-[10px] text-slate-600">{formatDate(item.FechaInicio)} - {formatDate(item.FechaFin)}</div>
                          </div>
                        </div>
                      )}

                      {(!user || (user.AdminConvocatorias ?? 0) < 2) && (
                        <div className="mb-3 p-2 bg-slate-50 rounded-lg">
                           <div className="text-[9px] text-slate-400 uppercase font-bold">Periodo</div>
                           <div className="text-[10px] text-slate-600 font-bold">{formatDate(item.FechaInicio)} - {formatDate(item.FechaFin)}</div>
                        </div>
                      )}

                      <div className="flex flex-wrap gap-1.5 pt-2 border-t border-slate-100">
                        {item.Cerrada === 0 ? (
                          <>
                            <button
                              onClick={() => handleNavigateToConvocatoria(item)}
                              className="flex-1 bg-green-600 hover:bg-green-700 text-white text-[11px] font-bold py-2 rounded-lg transition-colors shadow-sm"
                            >
                              Convocar
                            </button>
                            {(user?.AdminConvocatorias ?? 0) >= 2 && (
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
                          <div className="w-full text-center py-2 text-slate-400 font-medium text-xs">Esta convocatoria está cerrada</div>
                        )}
                        {(user?.AdminConvocatorias ?? 0) >= 2 && (
                          <button
                            onClick={() => handleDeleteConvocatoria(item)}
                            className="w-full bg-red-100 hover:bg-red-200 text-red-700 text-[10px] font-bold py-1.5 rounded-lg transition-colors mt-0.5"
                          >
                            Eliminar Permanente
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="py-12 text-center text-slate-500 bg-white rounded-xl border border-slate-200">
                    No se encontraron convocatorias.
                  </div>
                )}
              </div>

              <div className="mt-8 pt-6 border-t border-slate-100 flex justify-center">
                <h3 className="text-lg md:text-xl font-bold text-slate-500 italic">
                  {isLoading ? 'Cargando...' : `${sortedConvocatorias.length} Convocatorias en total`}
                </h3>
              </div>
            </div>
          </div>
        </main>

      {/* Create Convocatoria Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50">
          <div className="bg-white/95 backdrop-blur-sm rounded-lg p-6 w-[500px] shadow-lg relative">
            <button
              onClick={() => {
                setIsCreateModalOpen(false);
                setNewConvocatoria({
                  leagueId: '',
                  idProfesor: '',
                  categoria: '',
                  fechaInicio: today,
                  fechaFin: today,
                  color: '',
                  costoLiga: 0,
                  costoProfesor: 0,
                  costoArbitro: 0
                });
              }}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <h3 className="text-xl font-bold mb-4 text-slate-800">Nueva Convocatoria</h3>

            <div className="space-y-4">
              <div className="relative" ref={leagueDropdownRef}>
                <label className="block text-sm font-medium text-slate-700 mb-2">Liga o Torneo</label>
                <div 
                  className="w-full bg-white border border-slate-300 text-slate-700 py-2 px-3 rounded-lg flex justify-between items-center cursor-pointer hover:border-blue-500 transition-all"
                  onClick={() => setIsLeagueDropdownOpen(!isLeagueDropdownOpen)}
                >
                  <span className={newConvocatoria.leagueId ? "text-slate-800 font-medium" : "text-slate-400"}>
                    {leagues.find(l => l.IdLiga.toString() === newConvocatoria.leagueId.toString())?.Liga || "Seleccione una liga"}
                  </span>
                  <ChevronDown size={18} className={`text-slate-400 transition-transform duration-200 ${isLeagueDropdownOpen ? 'rotate-180' : ''}`} />
                </div>

                {isLeagueDropdownOpen && (
                  <div className="absolute z-[70] w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-xl max-h-60 overflow-y-auto animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="p-2 sticky top-0 bg-white border-b border-slate-100">
                      <div className="relative">
                        <Search className="absolute left-2 top-2.5 text-slate-400" size={14} />
                        <input
                          type="text"
                          className="w-full pl-8 pr-3 py-1.5 text-sm bg-slate-50 border-none rounded-md focus:ring-0 placeholder-slate-400"
                          placeholder="Buscar liga..."
                          value={leagueSearchQuery}
                          onChange={(e) => setLeagueSearchQuery(e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="py-1">
                      {leagues
                        .filter(l => l.Liga.toLowerCase().includes(leagueSearchQuery.toLowerCase()))
                        .length > 0 ? (
                        leagues
                          .filter(l => l.Liga.toLowerCase().includes(leagueSearchQuery.toLowerCase()))
                          .map((league) => (
                            <div
                              key={league.IdLiga}
                              className="px-4 py-2 text-sm text-slate-700 hover:bg-blue-50 hover:text-blue-700 cursor-pointer transition-colors"
                              onClick={() => {
                                setNewConvocatoria(prev => ({ ...prev, leagueId: league.IdLiga.toString() }));
                                setIsLeagueDropdownOpen(false);
                                setLeagueSearchQuery('');
                              }}
                            >
                              {league.Liga}
                            </div>
                          ))
                      ) : (
                        <div className="px-4 py-3 text-sm text-slate-500 text-center">No se encontraron ligas</div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="relative" ref={profesorDropdownRef}>
                <label className="block text-sm font-medium text-slate-700 mb-2">Profesor</label>
                <div 
                  className="w-full bg-white border border-slate-300 text-slate-700 py-2 px-3 rounded-lg flex justify-between items-center cursor-pointer hover:border-blue-500 transition-all"
                  onClick={() => setIsProfesorDropdownOpen(!isProfesorDropdownOpen)}
                >
                  <span className={newConvocatoria.idProfesor ? "text-slate-800 font-medium" : "text-slate-400"}>
                    {profesores.find(p => p.IdUsuario.toString() === newConvocatoria.idProfesor.toString())?.Usuario || "Seleccione Profesor"}
                  </span>
                  <ChevronDown size={18} className={`text-slate-400 transition-transform duration-200 ${isProfesorDropdownOpen ? 'rotate-180' : ''}`} />
                </div>

                {isProfesorDropdownOpen && (
                  <div className="absolute z-[70] w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-xl max-h-60 overflow-y-auto animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="p-2 sticky top-0 bg-white border-b border-slate-100">
                      <div className="relative">
                        <Search className="absolute left-2 top-2.5 text-slate-400" size={14} />
                        <input
                          type="text"
                          className="w-full pl-8 pr-3 py-1.5 text-sm bg-slate-50 border-none rounded-md focus:ring-0 placeholder-slate-400"
                          placeholder="Buscar profesor..."
                          value={profesorSearchQuery}
                          onChange={(e) => setProfesorSearchQuery(e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="py-1">
                      {profesores
                        .filter(p => p.Usuario.toLowerCase().includes(profesorSearchQuery.toLowerCase()))
                        .length > 0 ? (
                        profesores
                          .filter(p => p.Usuario.toLowerCase().includes(profesorSearchQuery.toLowerCase()))
                          .map((prof) => (
                            <div
                              key={prof.IdUsuario}
                              className="px-4 py-2 text-sm text-slate-700 hover:bg-blue-50 hover:text-blue-700 cursor-pointer transition-colors"
                              onClick={() => {
                                setNewConvocatoria(prev => ({ ...prev, idProfesor: prof.IdUsuario.toString() }));
                                setIsProfesorDropdownOpen(false);
                                setProfesorSearchQuery('');
                              }}
                            >
                              {prof.Usuario}
                            </div>
                          ))
                      ) : (
                        <div className="px-4 py-3 text-sm text-slate-500 text-center">No se encontraron profesores</div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="relative" ref={categoryDropdownRef}>
                <label className="block text-sm font-medium text-slate-700 mb-2">Categoría</label>
                <div className="relative">
                  <input
                    type="text"
                    value={newConvocatoria.categoria}
                    onFocus={() => setIsCategoryDropdownOpen(true)}
                    onChange={(e) => {
                      setNewConvocatoria(prev => ({ ...prev, categoria: e.target.value.toUpperCase() }));
                      setCategorySearchQuery(e.target.value);
                      setIsCategoryDropdownOpen(true);
                    }}
                    className="w-full appearance-none bg-white border border-slate-300 text-slate-700 py-2 pl-3 pr-10 rounded-lg leading-tight focus:outline-none focus:border-blue-500 uppercase transition-all"
                    placeholder="Escriba o seleccione categoría"
                  />
                  <div 
                    className="absolute inset-y-0 right-0 flex items-center pr-3 cursor-pointer text-slate-400"
                    onClick={() => setIsCategoryDropdownOpen(!isCategoryDropdownOpen)}
                  >
                    <ChevronDown size={18} className={`transition-transform duration-200 ${isCategoryDropdownOpen ? 'rotate-180' : ''}`} />
                  </div>
                </div>

                {isCategoryDropdownOpen && (
                  <div className="absolute z-[60] w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-xl max-h-60 overflow-y-auto animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="p-2 sticky top-0 bg-white border-b border-slate-100">
                      <div className="relative">
                        <Search className="absolute left-2 top-2.5 text-slate-400" size={14} />
                        <input
                          type="text"
                          className="w-full pl-8 pr-3 py-1.5 text-sm bg-slate-50 border-none rounded-md focus:ring-0 placeholder-slate-400"
                          placeholder="Buscar categoría existente..."
                          value={categorySearchQuery}
                          onChange={(e) => setCategorySearchQuery(e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="py-1">
                      {dbCategories
                        .filter(cat => cat.toLowerCase().includes(categorySearchQuery.toLowerCase()))
                        .length > 0 ? (
                        dbCategories
                          .filter(cat => cat.toLowerCase().includes(categorySearchQuery.toLowerCase()))
                          .map((cat, idx) => (
                            <div
                              key={idx}
                              className="px-4 py-2.5 text-sm text-slate-700 hover:bg-blue-50 hover:text-blue-700 cursor-pointer transition-colors flex justify-between items-center group"
                              onClick={() => {
                                setNewConvocatoria(prev => ({ ...prev, categoria: cat }));
                                setCategorySearchQuery('');
                                setIsCategoryDropdownOpen(false);
                              }}
                            >
                              <span className="font-medium">{cat}</span>
                              <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity">Seleccionar</span>
                            </div>
                          ))
                      ) : (
                        <div className="px-4 py-3 text-sm text-slate-500 text-center">
                          {categorySearchQuery ? (
                            <>
                              No se encontró "<span className="font-semibold">{categorySearchQuery}</span>"
                              <p className="text-xs mt-1">Puedes seguir escribiendo para crear una nueva.</p>
                            </>
                          ) : (
                            "No hay categorías disponibles"
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Color Distintivo (Rojo, Azul, etc.)</label>
                <input
                  type="text"
                  value={newConvocatoria.color}
                  onChange={(e) => setNewConvocatoria(prev => ({ ...prev, color: e.target.value.toUpperCase() }))}
                  className="w-full appearance-none bg-white border border-slate-300 text-slate-700 py-2 px-3 rounded-lg leading-tight focus:outline-none focus:border-blue-500 uppercase"
                  placeholder="Ej: ROJO, AZUL, BLANCO"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Fecha Inicio</label>
                <input
                  type="date"
                  value={newConvocatoria.fechaInicio}
                  onChange={(e) => setNewConvocatoria(prev => ({ ...prev, fechaInicio: e.target.value }))}
                  className="w-full appearance-none bg-white border border-slate-300 text-slate-700 py-2 px-3 rounded-lg leading-tight focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Fecha Fin</label>
                <input
                  type="date"
                  value={newConvocatoria.fechaFin}
                  onChange={(e) => setNewConvocatoria(prev => ({ ...prev, fechaFin: e.target.value }))}
                  className="w-full appearance-none bg-white border border-slate-300 text-slate-700 py-2 px-3 rounded-lg leading-tight focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Costo Liga</label>
                  <input
                    type="number"
                    value={newConvocatoria.costoLiga}
                    onChange={(e) => setNewConvocatoria(prev => ({ ...prev, costoLiga: parseFloat(e.target.value) || 0 }))}
                    className="w-full bg-white border border-slate-300 text-slate-700 py-1.5 px-3 rounded-lg text-sm focus:border-blue-500 outline-none"
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Costo Profesor</label>
                  <input
                    type="number"
                    value={newConvocatoria.costoProfesor}
                    onChange={(e) => setNewConvocatoria(prev => ({ ...prev, costoProfesor: parseFloat(e.target.value) || 0 }))}
                    className="w-full bg-white border border-slate-300 text-slate-700 py-1.5 px-3 rounded-lg text-sm focus:border-blue-500 outline-none"
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Costo Árbitro</label>
                  <input
                    type="number"
                    value={newConvocatoria.costoArbitro}
                    onChange={(e) => setNewConvocatoria(prev => ({ ...prev, costoArbitro: parseFloat(e.target.value) || 0 }))}
                    className="w-full bg-white border border-slate-300 text-slate-700 py-1.5 px-3 rounded-lg text-sm focus:border-blue-500 outline-none"
                    placeholder="0.00"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => {
                  setIsCreateModalOpen(false);
                  setNewConvocatoria({
                    leagueId: '',
                    idProfesor: '',
                    categoria: '',
                    fechaInicio: today,
                    fechaFin: today,
                    color: '',
                    costoLiga: 0,
                    costoProfesor: 0,
                    costoArbitro: 0
                  });
                }}
                className="bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold py-2 px-4 rounded transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleCreateConvocatoria}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded transition-colors"
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Convocatoria Modal */}
      {isEditModalOpen && selectedConvocatoria && (
        <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50">
          <div className="bg-white/95 backdrop-blur-sm rounded-lg p-6 w-[500px] shadow-lg relative">
            <button
              onClick={() => setIsEditModalOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <h3 className="text-xl font-bold mb-4 text-slate-800">Editar Convocatoria</h3>
            <p className="text-sm text-slate-500 mb-4">
              Editando: <span className="font-bold">{selectedConvocatoria.Liga} - {selectedConvocatoria.Categoria}</span>
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Profesor</label>
                <select
                  value={editConvocatoria.idProfesor}
                  onChange={(e) => setEditConvocatoria(prev => ({ ...prev, idProfesor: e.target.value }))}
                  className="w-full appearance-none bg-white border border-slate-300 text-slate-700 py-2 px-3 rounded-lg leading-tight focus:outline-none focus:border-blue-500"
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
                <label className="block text-sm font-medium text-slate-700 mb-2">Color Distintivo</label>
                <input
                  type="text"
                  value={editConvocatoria.newColor}
                  onChange={(e) => setEditConvocatoria(prev => ({ ...prev, newColor: e.target.value.toUpperCase() }))}
                  className="w-full appearance-none bg-white border border-slate-300 text-slate-700 py-2 px-3 rounded-lg leading-tight focus:outline-none focus:border-blue-500 uppercase"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Fecha Inicio</label>
                <input
                  type="date"
                  value={editConvocatoria.fechaInicio}
                  onChange={(e) => setEditConvocatoria(prev => ({ ...prev, fechaInicio: e.target.value }))}
                  className="w-full appearance-none bg-white border border-slate-300 text-slate-700 py-2 px-3 rounded-lg leading-tight focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Fecha Fin</label>
                <input
                  type="date"
                  value={editConvocatoria.fechaFin}
                  onChange={(e) => setEditConvocatoria(prev => ({ ...prev, fechaFin: e.target.value }))}
                  className="w-full appearance-none bg-white border border-slate-300 text-slate-700 py-2 px-3 rounded-lg leading-tight focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Costo Liga</label>
                  <input
                    type="number"
                    value={editConvocatoria.costoLiga}
                    onChange={(e) => setEditConvocatoria(prev => ({ ...prev, costoLiga: parseFloat(e.target.value) || 0 }))}
                    className="w-full bg-white border border-slate-300 text-slate-700 py-1.5 px-3 rounded-lg text-sm focus:border-blue-500 outline-none"
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Costo Profesor</label>
                  <input
                    type="number"
                    value={editConvocatoria.costoProfesor}
                    onChange={(e) => setEditConvocatoria(prev => ({ ...prev, costoProfesor: parseFloat(e.target.value) || 0 }))}
                    className="w-full bg-white border border-slate-300 text-slate-700 py-1.5 px-3 rounded-lg text-sm focus:border-blue-500 outline-none"
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Costo Árbitro</label>
                  <input
                    type="number"
                    value={editConvocatoria.costoArbitro}
                    onChange={(e) => setEditConvocatoria(prev => ({ ...prev, costoArbitro: parseFloat(e.target.value) || 0 }))}
                    className="w-full bg-white border border-slate-300 text-slate-700 py-1.5 px-3 rounded-lg text-sm focus:border-blue-500 outline-none"
                    placeholder="0.00"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold py-2 px-4 rounded transition-colors"
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
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white/95 backdrop-blur-sm rounded-lg w-full max-w-6xl h-full md:h-auto max-h-screen md:max-h-[90vh] overflow-hidden shadow-lg flex flex-col">
            <div className="p-4 md:p-6 border-b border-slate-200">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-xl md:text-2xl font-bold text-slate-800 flex flex-wrap items-center gap-2 md:gap-3">
                    {selectedConvocatoria.Liga}
                    <span className="hidden md:inline text-slate-300">/</span>
                    {selectedConvocatoria.Categoria}
                    {selectedConvocatoria.Color && (
                      <span className="text-xs font-normal text-slate-500 bg-slate-100 px-2 py-1 rounded border">
                        {selectedConvocatoria.Color}
                      </span>
                    )}
                  </h3>
                  <p className="text-xs md:text-sm text-slate-600 mt-1">
                    {formatDate(selectedConvocatoria.FechaInicio)} - {formatDate(selectedConvocatoria.FechaFin)}
                  </p>
                </div>
                <button
                  onClick={async () => {
                    setIsPlayersModalOpen(false);
                    setSelectedConvocatoria(null);
                    setPlayers([]);
                    await fetchConvocatorias();
                  }}
                  className="text-slate-400 hover:text-slate-600 transition-colors p-1"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="flex flex-col lg:flex-row gap-4 lg:items-center mt-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 w-full lg:w-auto">
                  <div className="text-xs md:text-sm font-medium text-slate-600 bg-slate-100 px-3 py-2 rounded-lg text-center">
                    Conv.: <span className="text-slate-800 font-bold">{recordCount}</span>
                  </div>
                  <div className="text-xs md:text-sm font-medium text-slate-600 bg-blue-50 px-3 py-2 rounded-lg text-center">
                    Total: <span className="text-blue-700 font-bold text-[10px] md:text-xs">
                      {new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(totalPrice)}
                    </span>
                  </div>
                  <div className="text-xs md:text-sm font-medium text-slate-600 bg-green-50 px-3 py-2 rounded-lg text-center">
                    Pagado: <span className="text-green-700 font-bold text-[10px] md:text-xs">
                      {new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(totalPagos)}
                    </span>
                  </div>
                  <div className="text-xs md:text-sm font-medium text-slate-600 bg-red-50 px-3 py-2 rounded-lg text-center">
                    CXC: <span className="text-red-700 font-bold text-[10px] md:text-xs">
                      {new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(totalCXC)}
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 md:gap-4">
                  <label className="relative inline-flex items-center cursor-pointer group">
                    <input
                      type="checkbox"
                      className="sr-only peer"
                      checked={showOnlyConvocados}
                      onChange={(e) => setShowOnlyConvocados(e.target.checked)}
                    />
                    <div className="w-10 h-5 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                    <span className="ml-2 text-[10px] md:text-xs font-semibold text-slate-600 whitespace-nowrap">Solo Convocados</span>
                  </label>

                  <label className="relative inline-flex items-center cursor-pointer group">
                    <input
                      type="checkbox"
                      className="sr-only peer"
                      checked={showOnlyDebts}
                      onChange={(e) => setShowOnlyDebts(e.target.checked)}
                    />
                    <div className="w-10 h-5 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                    <span className="ml-2 text-[10px] md:text-xs font-semibold text-slate-600 whitespace-nowrap">Ver adeudos</span>
                  </label>
                </div>

                <div className="flex gap-2 w-full lg:w-auto">
                  <button onClick={exportPlayersToExcel} className="flex-1 lg:flex-none bg-green-600 text-white text-[10px] font-bold py-2 px-3 rounded-lg shadow-sm">Excel</button>
                  <button onClick={exportPlayersToPDF} className="flex-1 lg:flex-none bg-red-600 text-white text-[10px] font-bold py-2 px-3 rounded-lg shadow-sm">PDF</button>
                  <button onClick={handleOpenInviteModal} className="flex-[2] lg:flex-none bg-purple-600 text-white text-[10px] font-bold py-2 px-4 rounded-lg shadow-sm">+ Invitar</button>
                </div>

                <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200 ml-auto">
                  <button
                    onClick={() => setPlayerViewMode('table')}
                    className={`p-1.5 rounded-md transition-all ${playerViewMode === 'table' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}
                    title="Vista Tabla"
                  >
                    <List size={16} />
                  </button>
                  <button
                    onClick={() => setPlayerViewMode('cards')}
                    className={`p-1.5 rounded-md transition-all ${playerViewMode === 'cards' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}
                    title="Vista Cards"
                  >
                    <LayoutGrid size={16} />
                  </button>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-auto p-4 md:p-6 bg-slate-50/50">
              {isLoadingPlayers ? (
                <div className="flex items-center justify-center py-12">
                  <svg className="animate-spin h-8 w-8 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                </div>
              ) : (
                <>
                  {/* Players Search for Cards */}
                  {playerViewMode === 'cards' && (
                    <div className="mb-4">
                      <input
                        type="text"
                        placeholder="Buscar jugador..."
                        className="w-full bg-white border border-slate-200 rounded-lg px-4 py-2.5 text-sm outline-none focus:border-blue-500 shadow-sm"
                        value={playerFilters.jugador}
                        onChange={(e) => setPlayerFilters(prev => ({ ...prev, jugador: e.target.value }))}
                      />
                    </div>
                  )}

                  {/* Players View Container */}
                  <div className="flex-1">
                    {playerViewMode === 'table' ? (
                      /* Table View */
                      <div className="overflow-hidden rounded-xl border border-slate-200 shadow-sm bg-white overflow-x-auto">
                        <table className="min-w-full bg-white">
                  <thead className="sticky top-0 bg-white">
                    <tr className="bg-gradient-to-r from-slate-700 to-slate-800 text-white">
                      <th
                        className="py-3 px-4 text-left font-semibold text-sm uppercase tracking-wider cursor-pointer hover:bg-slate-600 transition-colors"
                        onClick={() => handlePlayerSort('IdJugador')}
                      >
                        <div className="flex items-center gap-2">
                          ID
                          {playerSortConfig?.key === 'IdJugador' && (
                            <span className="text-blue-300">{playerSortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                          )}
                        </div>
                      </th>
                      <th
                        className="py-3 px-4 text-left font-semibold text-sm uppercase tracking-wider cursor-pointer hover:bg-slate-600 transition-colors"
                        onClick={() => handlePlayerSort('Jugador')}
                      >
                        <div className="flex items-center gap-2">
                          Jugador
                          {playerSortConfig?.key === 'Jugador' && (
                            <span className="text-blue-300">{playerSortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                          )}
                        </div>
                      </th>
                      <th
                        className="py-3 px-4 text-left font-semibold text-sm uppercase tracking-wider cursor-pointer hover:bg-slate-600 transition-colors"
                        onClick={() => handlePlayerSort('Categoria')}
                      >
                        <div className="flex items-center gap-2">
                          Categoría
                          {playerSortConfig?.key === 'Categoria' && (
                            <span className="text-blue-300">{playerSortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                          )}
                        </div>
                      </th>
                      <th
                        className="py-3 px-4 text-left font-semibold text-sm uppercase tracking-wider cursor-pointer hover:bg-slate-600 transition-colors"
                        onClick={() => handlePlayerSort('Precio')}
                      >
                        <div className="flex items-center gap-2">
                          Precio
                          {playerSortConfig?.key === 'Precio' && (
                            <span className="text-blue-300">{playerSortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                          )}
                        </div>
                      </th>
                      <th
                        className="py-3 px-4 text-left font-semibold text-sm uppercase tracking-wider cursor-pointer hover:bg-slate-600 transition-colors"
                        onClick={() => handlePlayerSort('PagoJugador')}
                      >
                        <div className="flex items-center gap-2">
                          Pago
                          {playerSortConfig?.key === 'PagoJugador' && (
                            <span className="text-blue-300">{playerSortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                          )}
                        </div>
                      </th>
                      <th
                        className="py-3 px-4 text-left font-semibold text-sm uppercase tracking-wider cursor-pointer hover:bg-slate-600 transition-colors"
                        onClick={() => handlePlayerSort('CXC')}
                      >
                        <div className="flex items-center gap-2">
                          CXC
                          {playerSortConfig?.key === 'CXC' && (
                            <span className="text-blue-300">{playerSortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                          )}
                        </div>
                      </th>
                      <th
                        className="py-3 px-4 text-center font-semibold text-sm uppercase tracking-wider cursor-pointer hover:bg-slate-600 transition-colors"
                        onClick={() => handlePlayerSort('Estado')}
                      >
                        <div className="flex items-center justify-center gap-2">
                          Estado
                          {playerSortConfig?.key === 'Estado' && (
                            <span className="text-blue-300">{playerSortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                          )}
                        </div>
                      </th>
                      <th className="py-3 px-4 text-center font-semibold text-sm uppercase tracking-wider">Acciones</th>
                    </tr>
                    {/* Filter Row */}
                    <tr className="bg-slate-100 border-b-2 border-slate-300">
                      <th className="p-2">
                        <input
                          type="text"
                          value={playerFilters.idJugador}
                          onChange={(e) => setPlayerFilters(prev => ({ ...prev, idJugador: e.target.value }))}
                          className="w-full text-xs border border-slate-300 rounded px-1 py-1 focus:border-blue-500 outline-none"
                          placeholder="ID..."
                        />
                      </th>
                      <th className="p-2">
                        <input
                          type="text"
                          value={playerFilters.jugador}
                          onChange={(e) => setPlayerFilters(prev => ({ ...prev, jugador: e.target.value }))}
                          className="w-full text-xs border border-slate-300 rounded px-1 py-1 focus:border-blue-500 outline-none"
                          placeholder="Jugador..."
                        />
                      </th>
                      <th className="p-2">
                        <input
                          type="text"
                          value={playerFilters.categoria}
                          onChange={(e) => setPlayerFilters(prev => ({ ...prev, categoria: e.target.value }))}
                          className="w-full text-xs border border-slate-300 rounded px-1 py-1 focus:border-blue-500 outline-none"
                          placeholder="Cat..."
                        />
                      </th>
                      <th className="p-2">
                        <input
                          type="text"
                          value={playerFilters.precio}
                          onChange={(e) => setPlayerFilters(prev => ({ ...prev, precio: e.target.value }))}
                          className="w-full text-xs border border-slate-300 rounded px-1 py-1 focus:border-blue-500 outline-none"
                          placeholder="Precio..."
                        />
                      </th>
                      <th className="p-2">
                        <input
                          type="text"
                          value={playerFilters.pago}
                          onChange={(e) => setPlayerFilters(prev => ({ ...prev, pago: e.target.value }))}
                          className="w-full text-xs border border-slate-300 rounded px-1 py-1 focus:border-blue-500 outline-none"
                          placeholder="Pago..."
                        />
                      </th>
                      <th className="p-2">
                        <input
                          type="text"
                          value={playerFilters.cxc}
                          onChange={(e) => setPlayerFilters(prev => ({ ...prev, cxc: e.target.value }))}
                          className="w-full text-xs border border-slate-300 rounded px-1 py-1 focus:border-blue-500 outline-none"
                          placeholder="CXC..."
                        />
                      </th>
                      <th className="p-2">
                        <input
                          type="text"
                          value={playerFilters.estado}
                          onChange={(e) => setPlayerFilters(prev => ({ ...prev, estado: e.target.value }))}
                          className="w-full text-xs border border-slate-300 rounded px-1 py-1 focus:border-blue-500 outline-none"
                          placeholder="Estado..."
                        />
                      </th>
                      <th className="p-2"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {sortedPlayers.map((player) => (
                      <tr
                        key={player.IdJugador}
                        className={`transition-all duration-200 ${player.EsConvocado
                          ? 'bg-green-50'
                          : player.EsEliminado
                            ? 'bg-red-50 opacity-60'
                            : player.EsInvitado
                              ? 'bg-yellow-50'
                              : 'hover:bg-slate-50'
                          }`}
                      >
                        <td className="py-3 px-4 text-sm font-medium">{player.IdJugador}</td>
                        <td className="py-3 px-4 text-sm font-medium">
                          <div className="flex items-center gap-2">
                            {player.Jugador}
                            {player.EsInvitado === 1 && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-yellow-200 text-yellow-800" title="Jugador invitado de otra categoría">
                                ⚠️ Invitado
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-sm">{player.Categoria}</td>
                        <td className="py-3 px-4 text-sm">
                          {user ? (
                            <button
                              onClick={() => handleUpdatePrice(player)}
                              className="font-semibold text-blue-600 hover:text-blue-800 hover:underline transition-colors cursor-pointer"
                            >
                              {new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(player.Precio)}
                            </button>
                          ) : (
                            <span className="font-semibold text-slate-600">
                              {new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(player.Precio)}
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-sm font-bold text-green-700">
                          {new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(player.PagoJugador || 0)}
                        </td>
                        <td className="py-3 px-4 text-sm font-bold text-red-700 bg-red-50/30">
                          {new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(player.CXC || 0)}
                        </td>
                        <td className="py-3 px-4 text-center text-sm">
                          {player.EsConvocado ? (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-bold bg-green-100 text-green-800">
                              Convocado
                            </span>
                          ) : player.EsEliminado ? (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
                              Eliminado
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
                              Disponible
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <div className="flex gap-2 justify-center">
                            {!player.EsConvocado && (
                              <button
                                onClick={() => handleConvocarPlayer(player)}
                                className="bg-gradient-to-r from-green-600 to-green-500 hover:from-green-700 hover:to-green-600 text-white text-xs font-bold py-1 px-3 rounded-lg shadow-md hover:shadow-lg transition-all duration-200"
                              >
                                Convocar
                              </button>
                            )}
                            {player.EsConvocado && (
                              <button
                                onClick={() => handleQuitarPlayer(player)}
                                className="bg-gradient-to-r from-red-600 to-red-500 hover:from-red-700 hover:to-red-600 text-white text-xs font-bold py-1 px-3 rounded-lg shadow-md hover:shadow-lg transition-all duration-200"
                              >
                                Quitar
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                    </table>
                  </div>
                ) : (
                    /* Card View (for all screen sizes) */
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4 pb-20">
                      {sortedPlayers.length > 0 ? (
                        sortedPlayers.map((player) => (
                          <div 
                            key={player.IdJugador} 
                            className={`shadow-sm transition-all hover:shadow-md ${
                              player.EsConvocado 
                                ? 'p-4 bg-white border-l-4 border-l-green-500 rounded-xl z-10 scale-[1.02]' 
                                : 'p-2.5 bg-slate-100/50 border-l-[3px] border-l-slate-300 rounded-lg opacity-75 grayscale-[0.3]'
                            } ${player.EsEliminado ? 'opacity-50 grayscale border-l-red-500' : ''}`}
                          >
                            <div className="flex justify-between items-start mb-2">
                              <div>
                                <div className="text-[8px] text-slate-400 font-bold uppercase">#{player.IdJugador}</div>
                                <h5 className={`text-sm font-black text-slate-900 ${player.EsConvocado ? '' : 'line-clamp-2'} leading-tight tracking-tight`}>
                                  {player.Jugador}
                                </h5>
                                <div className="text-[10px] text-slate-500">{player.Categoria}</div>
                              </div>
                              <div className="text-right flex flex-col items-end gap-1">
                                {player.EsInvitado === 1 && (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-yellow-100 text-yellow-800">
                                    Invitado
                                  </span>
                                )}
                                {player.EsConvocado ? (
                                  <div className="flex flex-col items-end">
                                    <div className="flex items-center justify-center w-6 h-6 bg-green-500 rounded-full shadow-sm border-2 border-white mb-1">
                                      <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                      </svg>
                                    </div>
                                    <span className="text-[9px] font-bold text-green-600 uppercase tracking-tighter">Convocado</span>
                                  </div>
                                ) : player.EsEliminado ? (
                                  <span className="text-[8px] font-bold text-red-600 bg-red-50 px-1.5 py-0.5 rounded-full">X</span>
                                ) : (
                                  <span className="text-[8px] font-bold text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded-full">D</span>
                                )}
                              </div>
                            </div>
                            
                             <div className={`grid grid-cols-3 gap-1 ${player.EsConvocado ? 'my-3 p-2' : 'my-2 p-1.5'} bg-slate-50 rounded-md border border-slate-100`}>
                               <div className="text-center border-r border-slate-200">
                                 <div className="text-[8px] text-slate-400 font-bold uppercase">Precio</div>
                                 <div className="text-[10px] font-bold text-blue-600">
                                   ${player.Precio}
                                 </div>
                               </div>
                               <div 
                                 className="text-center border-r border-slate-200 cursor-pointer hover:bg-slate-200/50 transition-colors rounded"
                                 onClick={() => player.EsConvocado && fetchPlayerPayments(player)}
                               >
                                 <div className="text-[8px] text-slate-400 font-bold uppercase">Pag.</div>
                                 <div className="text-[10px] font-bold text-green-600">
                                   ${player.PagoJugador || 0}
                                 </div>
                               </div>
                               <div className="text-center">
                                 <div className="text-[8px] text-slate-400 font-bold uppercase">CXC</div>
                                 <div className="text-[10px] font-bold text-red-600">
                                   ${player.CXC || 0}
                                 </div>
                               </div>
                             </div>
  
                            <div className="flex gap-1.5 items-center">
                              {!player.EsConvocado ? (
                                <button 
                                  onClick={() => handleConvocarPlayer(player)} 
                                  className="flex-1 bg-green-600 hover:bg-green-700 text-white text-[10px] font-bold py-1 rounded-md transition-colors shadow-sm"
                                >
                                  Convocar
                                </button>
                              ) : (
                                <button 
                                  onClick={() => handleQuitarPlayer(player)} 
                                  className="flex-none bg-red-600 hover:bg-red-700 text-white text-[8px] font-bold py-0.5 px-1.5 rounded transition-colors shadow-sm"
                                >
                                  Quitar
                                </button>
                              )}
                              <button 
                                onClick={() => handleUpdatePrice(player)} 
                                className="bg-slate-100 hover:bg-slate-200 text-slate-600 text-[10px] font-bold px-2 py-1 rounded-md transition-colors"
                              >
                                $
                              </button>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="col-span-full text-center py-12 text-slate-500 bg-white rounded-xl border border-slate-200 shadow-sm">
                          No se encontraron jugadores
                        </div>
                      )}
                    </div>
                  )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Invite Player Modal */}
      {isInviteModalOpen && selectedConvocatoria && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white/95 backdrop-blur-sm rounded-lg w-full max-w-md shadow-lg">
            <div className="p-6 border-b border-slate-200">
              <div className="flex justify-between items-center">
                <h3 className="text-xl font-bold text-slate-800">Invitar Jugador</h3>
                <button
                  onClick={() => {
                    setIsInviteModalOpen(false);
                    setSelectedPlayerId('');
                  }}
                  className="text-slate-400 hover:text-slate-600 transition-colors"
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
                  <svg className="animate-spin h-8 w-8 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                </div>
              ) : availablePlayers.length === 0 ? (
                <p className="text-center text-slate-600 py-8">No hay jugadores disponibles para invitar</p>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Buscar jugador</label>
                  <input
                    type="text"
                    value={playerSearchQuery}
                    onChange={(e) => setPlayerSearchQuery(e.target.value)}
                    placeholder="Escribe para buscar..."
                    className="w-full mb-4 appearance-none bg-white border border-slate-300 text-slate-700 py-2 px-3 rounded-lg leading-tight focus:outline-none focus:border-blue-500"
                  />
                  <label className="block text-sm font-medium text-slate-700 mb-2">Seleccione un jugador</label>
                  <select
                    value={selectedPlayerId}
                    onChange={(e) => setSelectedPlayerId(e.target.value)}
                    size={8}
                    className="w-full appearance-none bg-white border border-slate-300 text-slate-700 py-2 px-3 rounded-lg leading-tight focus:outline-none focus:border-blue-500"
                  >
                    <option value="">-- Seleccione --</option>
                    {availablePlayers
                      .filter(player =>
                        player.Jugador.toLowerCase().includes(playerSearchQuery.toLowerCase()) ||
                        player.Categoria.toLowerCase().includes(playerSearchQuery.toLowerCase())
                      )
                      .map((player) => (
                        <option key={player.IdJugador} value={player.IdJugador}>
                          {player.Jugador} ({player.Categoria})
                        </option>
                      ))}
                  </select>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 p-6 border-t border-slate-200">
              <button
                onClick={() => {
                  setIsInviteModalOpen(false);
                  setSelectedPlayerId('');
                  setPlayerSearchQuery('');
                }}
                className="bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold py-2 px-4 rounded transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleInvitePlayer}
                disabled={!selectedPlayerId}
                className="bg-purple-600 hover:bg-purple-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-bold py-2 px-4 rounded transition-colors"
              >
                Invitar
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Payment Details Modal */}
      {isPaymentDetailsModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-lg w-full max-w-lg shadow-xl overflow-hidden">
            <div className="p-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
              <h3 className="text-lg font-bold text-slate-800">Pagos de {selectedPlayerName}</h3>
              <button
                onClick={() => setIsPaymentDetailsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="p-6 max-h-[60vh] overflow-y-auto">
              {isLoadingPayments ? (
                <div className="flex items-center justify-center py-8">
                  <svg className="animate-spin h-8 w-8 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                </div>
              ) : playerPayments.length === 0 ? (
                <div className="text-center py-8 text-slate-500 italic">No se registran pagos para este jugador en esta convocatoria.</div>
              ) : (
                <div className="space-y-3">
                  {playerPayments.map((p: any) => (
                    <div key={p.IdPago} className="bg-slate-50 p-3 rounded-lg border border-slate-200 flex justify-between items-center hover:bg-slate-100 transition-colors">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">Recibo #{p.Recibo || 'N/A'}</span>
                          <span className="text-[10px] text-slate-400 font-bold uppercase">{formatDate(p.FechaPago)}</span>
                        </div>
                        <div className="text-sm text-slate-700 font-medium leading-tight">{p.Comentario || 'Pago de convocatoria'}</div>
                      </div>
                      <div className="text-base font-bold text-green-700 ml-4">
                        {new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(p.Pago)}
                      </div>
                    </div>
                  ))}
                  <div className="pt-4 mt-4 border-t-2 border-slate-200 flex justify-between items-center font-bold text-lg">
                    <span className="text-slate-800">Total:</span>
                    <span className="text-blue-700">
                      {new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(playerPayments.reduce((sum, p) => sum + p.Pago, 0))}
                    </span>
                  </div>
                </div>
              )}
            </div>
            
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end">
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
    </div>
  );
}
