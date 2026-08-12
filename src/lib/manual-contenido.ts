/**
 * Contenido del Manual de Operación.
 *
 * Cada sección se identifica con la MISMA clave que su entrada del menú (el href, o
 * `grupo:<label>` para los grupos que se documentan completos). La pantalla del manual
 * recorre NAV_ITEMS y solo pinta las secciones cuyo módulo el usuario puede ver, así que
 * el permiso nunca se duplica aquí: vive en el menú y este archivo solo aporta el texto.
 *
 * El texto admite **negritas** con dobles asteriscos; se convierte a nodos de React sin
 * insertar HTML crudo.
 */

export type Audiencia = 'operacion' | 'direccion';

export type Bloque =
    | { tipo: 'parrafo'; texto: string }
    | { tipo: 'subtitulo'; texto: string }
    | { tipo: 'lista'; items: string[] }
    | { tipo: 'pasos'; items: string[] }
    | { tipo: 'tabla'; encabezados: string[]; filas: string[][] }
    | { tipo: 'formula'; lineas: string[] }
    | { tipo: 'nota'; estilo: 'ojo' | 'calculo' | 'cuidado'; titulo: string; texto: string }
    /**
     * Imagen del manual. `src` es una ruta dentro de /public. El `alt` describe la
     * figura para quien no la ve, y el `pie` es el texto que se imprime debajo; ambos
     * son lo único que llega al agente, así que la figura nunca debe cargar sola con
     * información que no esté también escrita.
     */
    | { tipo: 'imagen'; src: string; alt: string; ancho: number; alto: number; pie?: string };

export interface SeccionManual {
    /** Clave del menú: href del módulo, o `grupo:<label>` para un grupo completo. */
    clave: string;
    titulo: string;
    audiencia: Audiencia[];
    bloques: Bloque[];
}

/** Secciones que se muestran siempre, antes de los módulos. */
export const INTRO: SeccionManual[] = [
    {
        clave: 'intro:acceso',
        titulo: 'Entrar al sistema',
        audiencia: ['operacion', 'direccion'],
        bloques: [
            {
                tipo: 'parrafo',
                texto: 'Se entra con usuario y contraseña. La cuenta define **qué menús aparecen**: quien no es administrador ve solo Convocatorias, Inscripciones y este manual. Si echas de menos una pantalla que alguien más sí tiene, es cuestión de permisos, no de que falle el sistema.',
            },
            {
                tipo: 'imagen',
                src: '/manual/login.JPG',
                ancho: 950,
                alto: 690,
                alt: 'Pantalla de acceso con los campos Usuario y Contraseña y el botón Iniciar Sesión.',
            },
            {
                tipo: 'parrafo',
                texto: 'Ya dentro, el menú de la izquierda se colapsa con el botón de la esquina superior para ganar espacio, y arriba se ve siempre la temporada activa.',
            },
        ],
    },
    {
        clave: 'intro:conceptos',
        titulo: 'Conceptos que se repiten',
        audiencia: ['operacion', 'direccion'],
        bloques: [
            {
                tipo: 'parrafo',
                texto: 'Cuatro ideas atraviesan todo el sistema. Si estas quedan claras, la mayoría de las dudas sobre los reportes se resuelven solas.',
            },
            { tipo: 'subtitulo', texto: 'La temporada es un sello, no una fecha' },
            {
                tipo: 'parrafo',
                texto: 'Cuando se captura un pago se le graba a qué temporada pertenece. Ese sello es un dato guardado en el recibo: **no se deduce de la fecha del cobro**. Por eso una inscripción cobrada en julio puede pertenecer a la temporada que arranca en agosto, y por eso un pago capturado con la temporada equivocada aparece en el reporte equivocado.',
            },
            {
                tipo: 'imagen',
                src: '/manual/temporada-sello.svg',
                ancho: 760,
                alto: 208,
                alt: 'Una inscripción cobrada el 15 de julio de 2026 lleva sellada la temporada 2026-2027; por eso entra en el reporte de esa temporada y no en el de la anterior.',
                pie: 'El mes del cobro y la temporada del recibo son datos distintos. Manda el sello.',
            },
            {
                tipo: 'parrafo',
                texto: 'Una sola temporada está marcada como activa. El Dashboard siempre trabaja con esa; Inscripciones y Adeudos permiten elegir cuál ver.',
            },
            { tipo: 'subtitulo', texto: 'Sede de registro y sede de cobro no son lo mismo' },
            {
                tipo: 'parrafo',
                texto: 'Un jugador pertenece a una sede, pero puede pagar en otra. Los reportes distinguen ambas cosas, y por eso un mismo día puede verse distinto "por sede" según qué reporte abras.',
            },
            {
                tipo: 'imagen',
                src: '/manual/sede-registro-cobro.svg',
                ancho: 760,
                alto: 208,
                alt: 'Un jugador registrado en Matriz paga en San Nicolás: Inscripciones por Sede lo cuenta en Matriz, mientras que Caja y los cortes lo cuentan en San Nicolás.',
                pie: 'Un mismo pago, dos sedes distintas según el reporte. Ninguno de los dos está mal: miden cosas diferentes.',
            },
            { tipo: 'subtitulo', texto: 'Nada se borra: se cancela' },
            {
                tipo: 'parrafo',
                texto: 'Pagos, ventas y egresos cancelados siguen en la base pero quedan marcados. Todos los totales cuentan **solo lo vigente**. Por eso existe la pantalla de Ventas Canceladas: para ver justamente lo que los demás reportes excluyen.',
            },
            {
                tipo: 'imagen',
                src: '/manual/cancelado.svg',
                ancho: 760,
                alto: 206,
                alt: 'De tres ventas del día, una cancelada sigue guardada pero no suma: los totales cuentan $1,350.00 y solo la pantalla de Ventas Canceladas muestra los $450.00 que faltan.',
                pie: 'La venta cancelada no desaparece del sistema; desaparece de los totales.',
            },
            { tipo: 'subtitulo', texto: 'Tipos de producto y formas de pago' },
            {
                tipo: 'tabla',
                encabezados: ['Agrupación', 'Qué incluye'],
                filas: [
                    ['Membresías', 'Inscripciones, mensualidades, copas y ligas: todo lo que no es uniforme.'],
                    ['Uniformes', 'Playeras, shorts y demás artículos. Se reporta por separado en el corte de caja.'],
                    ['Formas de pago', 'Efectivo, tarjeta de crédito, tarjeta de débito, depósito en efectivo y transferencia. Los **dólares** se manejan aparte y no se mezclan con los pesos en el corte.'],
                ],
            },
        ],
    },
];

/** Secciones que se muestran siempre, al final. */
export const CIERRE: SeccionManual[] = [
    {
        clave: 'cierre:no-cuadran',
        titulo: 'Por qué dos pantallas no dan el mismo número',
        audiencia: ['direccion'],
        bloques: [
            {
                tipo: 'parrafo',
                texto: 'Casi siempre es una de estas razones. Antes de reportar un error, vale la pena descartarlas.',
            },
            {
                tipo: 'tabla',
                encabezados: ['Síntoma', 'Explicación'],
                filas: [
                    ['El Dashboard y el acumulado de temporada no coinciden', 'Los indicadores de arriba son del **período** elegido; el acumulado es de **toda la temporada**. Son cortes distintos del mismo dinero.'],
                    ['Adeudos no cuadra con Inscripciones', 'Adeudos excluye clinics, venta al público, futsal y porteros del cálculo normal. Inscripciones los cuenta, solo que separados.'],
                    ['Los egresos del mes no cuadran con los de caja', 'Caja solo ve gastos que salieron por una caja abierta. Egresos por Sede los ve todos.'],
                    ['Un pago aparece en la temporada equivocada', 'Se capturó con el sello de otra temporada. En Adeudos, el modal marca estos casos y permite reasignarlos.'],
                    ['Una cifra no cuadra al peso', 'Varias pantallas muestran importes abreviados ($1.2M). El acumulado de temporada trae la cifra exacta al pasar el mouse.'],
                ],
            },
            {
                tipo: 'nota',
                estilo: 'ojo',
                titulo: 'Regla práctica',
                texto: 'Antes de dudar del sistema, pregunta tres cosas: **qué período** está seleccionado, **qué temporada**, y **qué grupos de jugadores** incluye ese reporte. La mayoría de los descuadres se explican ahí.',
            },
        ],
    },
];

/** Una sección por módulo, indexada por la clave del menú. */
export const SECCIONES: SeccionManual[] = [
    {
        clave: '/',
        titulo: 'Convocatorias',
        audiencia: ['operacion'],
        bloques: [
            {
                tipo: 'parrafo',
                texto: 'Una convocatoria es la lista de jugadores que van a un torneo: se define por **temporada, liga, categoría y color**. El color distingue dos equipos de la misma categoría; si no manejas equipos separados, puedes dejarlo vacío.',
            },
            { tipo: 'subtitulo', texto: 'Armar una convocatoria' },
            {
                tipo: 'pasos',
                items: [
                    'Crea la convocatoria con su temporada, liga, categoría, fechas y profesor responsable.',
                    'Ábrela: verás a todos los jugadores de esa categoría, con el estado Disponible.',
                    'Pulsa **Convocar** en cada jugador que participa. El sistema le asigna el precio de la liga.',
                    'Si necesitas a alguien de otra categoría, agrégalo como **invitado**; queda marcado para distinguirlo.',
                    'Al terminar, marca la convocatoria como **cerrada**.',
                ],
            },
            {
                tipo: 'imagen',
                src: '/manual/convocatorias.JPG',
                ancho: 991,
                alto: 505,
                alt: 'Resumen de Convocatorias con el buscador, el interruptor Ver Cerradas, los botones Excel y PDF, el cambio entre vista de Tarjetas y Tabla, y el botón + Nueva Convocatoria.',
                pie: 'La pantalla de arranque. El interruptor **Ver Cerradas** trae de vuelta las que ya se marcaron como terminadas.',
            },
            {
                tipo: 'imagen',
                src: '/manual/nuevaconvocatoria.JPG',
                ancho: 398,
                alto: 558,
                alt: 'Formulario Nueva Convocatoria con liga o torneo, profesor, categoría, color distintivo, fechas de inicio y fin, y los costos de liga, profesor y árbitro.',
                pie: 'Los tres costos de abajo son del torneo, no del jugador: sirven para saber qué deja la convocatoria.',
            },
            {
                tipo: 'imagen',
                src: '/manual/convocar.JPG',
                ancho: 884,
                alto: 871,
                alt: 'Jugadores de la categoría 2011FC en vista de tarjetas, cada uno con su botón verde Convocar y un botón de precio.',
                pie: 'Al abrir la convocatoria salen todos los jugadores de la categoría. Se convoca uno por uno con el botón verde.',
            },
            { tipo: 'subtitulo', texto: 'Precios, pagos y saldo' },
            {
                tipo: 'parrafo',
                texto: 'Cada jugador convocado muestra tres cifras: **Precio** (lo que le toca pagar), **Pago** (lo que ya entregó) y **CXC** (lo que falta). Puedes cambiar el precio de un jugador en particular para casos especiales.',
            },
            {
                tipo: 'nota',
                estilo: 'ojo',
                titulo: 'Ojo',
                texto: 'Esas tres cifras **solo aparecen en los jugadores convocados**. En los disponibles verás un guion, porque hasta que no están convocados no deben nada. El precio sigue siendo editable aunque no se muestre, por si quieres dejarlo listo de antemano.',
            },
            {
                tipo: 'imagen',
                src: '/manual/cambiarprecioconvocado.JPG',
                ancho: 929,
                alto: 923,
                alt: 'Vista de tabla de la convocatoria: los jugadores convocados muestran precio, pago y CXC, los disponibles muestran guiones, y encima un cuadro de diálogo pide el nuevo precio para un jugador.',
                pie: 'Compara los renglones: los **Convocados** traen sus tres cifras y los **Disponibles** un guion. El diálogo de arriba es el cambio de precio individual.',
            },
            { tipo: 'subtitulo', texto: 'Filtros y salidas' },
            {
                tipo: 'lista',
                items: [
                    '**Solo Convocados** oculta al resto y deja la lista final del torneo.',
                    'El filtro de adeudo deja solo a quienes tienen saldo pendiente.',
                    'Se exporta a Excel y a PDF con los totales de precio, pagado y por cobrar.',
                ],
            },
            {
                tipo: 'nota',
                estilo: 'ojo',
                titulo: 'Ojo',
                texto: 'Las exportaciones sí incluyen a los no convocados con sus importes; ocultarlos es un comportamiento de la pantalla, no del archivo.',
            },
        ],
    },
    {
        clave: '/pagos-copas',
        titulo: 'Pagos de Copas y Ligas',
        audiencia: ['direccion'],
        bloques: [
            {
                tipo: 'parrafo',
                texto: 'Concentra lo recaudado por concepto de torneos en la temporada: el total, el acumulado y el desglose por categoría. Sirve para responder "¿cuánto dejaron las copas este año y qué categorías aportaron más?".',
            },
            {
                tipo: 'imagen',
                src: '/manual/pagoscopasligas.JPG',
                ancho: 1893,
                alto: 843,
                alt: 'Tarjetas de cada copa o liga con lo recaudado, el número de pagos y cuántos jugadores participaron, y arriba a la derecha el total de la temporada.',
                pie: 'Una tarjeta por torneo, ordenadas de mayor a menor recaudación. El recuadro verde de la esquina es el total de la temporada.',
            },
            {
                tipo: 'imagen',
                src: '/manual/detallepagoscopasligas.JPG',
                ancho: 708,
                alto: 837,
                alt: 'Desglose por categoría de una liga: cada categoría con su recaudación, los pagos y los jugadores distintos que pagaron, y abajo el total del producto.',
                pie: 'Al abrir un torneo se ve qué categorías lo sostienen. El número entre paréntesis son jugadores distintos, no pagos.',
            },
        ],
    },
    {
        clave: '/inscripciones',
        titulo: 'Inscripciones por Sede',
        audiencia: ['operacion', 'direccion'],
        bloques: [
            {
                tipo: 'parrafo',
                texto: 'Mide el avance de la inscripción de una temporada, sede por sede. Arriba eliges la temporada y todo lo demás se recalcula.',
            },
            {
                tipo: 'imagen',
                src: '/manual/inscripciones.JPG',
                ancho: 1876,
                alto: 812,
                alt: 'Inscripciones por Sede: el selector de temporada arriba a la derecha, los bloques de Total Inscritos, Total Bajas y Sin Inscripción, y debajo una tarjeta por sede con inscritos, becados, bajas y jugadores con pagos sin inscripción.',
                pie: 'Cada tarjeta de sede se abre en el detalle por categoría con **Ver categorías**.',
            },
            { tipo: 'subtitulo', texto: 'Los cuatro indicadores' },
            {
                tipo: 'tabla',
                encabezados: ['Indicador', 'Qué cuenta'],
                filas: [
                    ['Jugadores Activos', 'La plantilla completa, dividida en sedes, keepers, futsal, venta al público y clinics. **No depende de la temporada.**'],
                    ['Total Inscritos', 'Quienes ya pagaron inscripción de esa temporada, separando **Nuevas** (primera inscripción histórica) de **Reinscripciones**.'],
                    ['Total Bajas', 'Jugadores dados de baja que sí tenían inscripción en esa temporada.'],
                    ['Sin inscripción', 'Están pagando mensualidades pero nunca pagaron la inscripción. Es una lista de cobro inmediata.'],
                ],
            },
            {
                tipo: 'nota',
                estilo: 'ojo',
                titulo: 'Ojo',
                texto: 'Al elegir **la temporada más reciente**, el bloque de Jugadores Activos desaparece. Es a propósito: en una temporada que apenas arranca, la plantilla activa todavía es la del ciclo anterior y compararla contra los inscritos nuevos da una lectura falsa.',
            },
            { tipo: 'subtitulo', texto: 'La regla del portero' },
            {
                tipo: 'parrafo',
                texto: 'Los porteros y keepers no vuelven a pagar inscripción cada temporada. Para ellos, una inscripción de cualquier año cuenta como vigente. Por eso aparecen inscritos aunque no tengan un pago del ciclo en curso.',
            },
            { tipo: 'subtitulo', texto: 'Del resumen al jugador' },
            {
                tipo: 'parrafo',
                texto: 'Cada tarjeta de sede se abre en el detalle por categoría, y cualquier cifra abre la lista de jugadores que la componen. Desde ahí salen tres archivos: PDF, Excel y **Excel de Movimientos**, que trae un renglón por pago con su recibo, fecha, concepto y forma de pago, más una hoja de resumen.',
            },
        ],
    },
    {
        clave: '/adeudos/sede',
        titulo: 'Adeudos por Sede',
        audiencia: ['direccion'],
        bloques: [
            {
                tipo: 'parrafo',
                texto: 'La pantalla de cobranza. Compara siempre dos ciclos: la **temporada anterior** (ya cerrada, cuentan todos sus meses) y **esta temporada** (solo los meses ya vencidos). Las reglas de las dos no son iguales, y esa es la parte que más confunde.',
            },
            {
                tipo: 'imagen',
                src: '/manual/adeudossede.JPG',
                ancho: 1855,
                alto: 829,
                alt: 'Adeudos por Sede: los cuatro bloques superiores de Jugadores Activos, Jugadores Bajas, Adeudos temporada anterior y Adeudos esta temporada, este último con su tarjeta amarilla de Sin Inscripción, y debajo una tarjeta por sede.',
                pie: 'Los dos bloques de la derecha son los ciclos que se comparan. El recuadro amarillo **Sin inscripción** solo existe en el ciclo en curso.',
            },
            { tipo: 'subtitulo', texto: 'Esta temporada: solo cuentan los inscritos' },
            {
                tipo: 'parrafo',
                texto: 'En el ciclo en curso un jugador genera adeudo **únicamente si ya se inscribió**, y solo por mensualidades vencidas. Quien no se ha inscrito no aparece como deudor: sale en su propia tarjeta, **Sin inscripción**.',
            },
            {
                tipo: 'formula',
                lineas: [
                    'Con adeudo (esta temporada) = inscrito Y le falta al menos un mes vencido',
                    'Sin inscripción             = activo, del grupo normal, sin inscripción de la temporada',
                ],
            },
            {
                tipo: 'nota',
                estilo: 'calculo',
                titulo: 'Cómo se calcula',
                texto: 'El adeudo de cada quien arranca en el mes en que pagó su inscripción, no al inicio de la temporada: quien entró a mitad de ciclo no arrastra los meses previos.',
            },
            { tipo: 'subtitulo', texto: 'Temporada anterior: incluye la inscripción' },
            {
                tipo: 'parrafo',
                texto: 'En el ciclo cerrado sí cuenta la inscripción no pagada como adeudo. Además se calculan los **Posibles bajas**: quienes no pagaron ni la inscripción ni un solo mes. La casilla Descartar los quita del "Con adeudo" para que la cifra refleje cobranza realista; el conteo de posibles bajas no cambia.',
            },
            { tipo: 'subtitulo', texto: 'Quién queda fuera del cálculo' },
            {
                tipo: 'tabla',
                encabezados: ['Grupo', 'Tratamiento'],
                filas: [
                    ['Porteros / keepers', 'Tarjeta propia. No entran al "Con adeudo" normal.'],
                    ['Futsal', 'Se clasifica por meses pagados (sin pagos, 1, 2, 3 o más), no por deuda.'],
                    ['Beca 100%', 'No deben nada. Si además no están inscritos, salen en "Becados 100% s/inscripción".'],
                    ['Clinics y venta al público', 'Fuera por completo: no manejan inscripción ni mensualidad.'],
                ],
            },
            { tipo: 'subtitulo', texto: 'Análisis Profundo' },
            {
                tipo: 'parrafo',
                texto: 'El botón morado manda los totales a un modelo de IA que redacta un análisis de cobranza y retención comparando ambos ciclos. Trabaja solo con las cifras en pantalla.',
            },
        ],
    },
    {
        clave: '/caja',
        titulo: 'Control de Caja',
        audiencia: ['operacion'],
        bloques: [
            {
                tipo: 'parrafo',
                texto: 'Cada jornada de cobro en una sede es una **apertura**. Se abre con un fondo de caja, se cobra durante el día y al final se captura lo que hay físicamente para cerrarla.',
            },
            {
                tipo: 'imagen',
                src: '/manual/controlcaja.JPG',
                ancho: 1895,
                alto: 835,
                alt: 'Control de Caja: totales del período arriba y debajo una fila por sede con la hora de apertura, el cajero, el fondo de caja, las ventas, los egresos y la hora de corte.',
                pie: 'Una fila por apertura. A la derecha, **Cerrado** o **En curso**: las que siguen abiertas muestran "Sin Corte".',
            },
            { tipo: 'subtitulo', texto: 'El corte, paso a paso' },
            {
                tipo: 'pasos',
                items: [
                    'Se abre la caja registrando el **fondo** con el que arranca el cajero.',
                    'Durante el día se cobran membresías y uniformes, y se registran los gastos que salen de esa caja.',
                    'Al cerrar se captura cuánto hay de cada forma de pago: efectivo, tarjetas, transferencias y dólares.',
                    'El sistema compara lo capturado contra lo que debería haber y muestra la **diferencia**.',
                ],
            },
            {
                tipo: 'formula',
                lineas: [
                    'Efectivo esperado = Fondo de caja + Ventas en efectivo − Gastos en efectivo',
                    'Diferencia        = Efectivo capturado − Efectivo esperado',
                ],
            },
            {
                tipo: 'nota',
                estilo: 'calculo',
                titulo: 'Cómo se calcula',
                texto: 'Diferencia negativa es faltante; positiva, sobrante. Los **dólares se cuadran aparte**, contra las ventas cobradas en dólares, y no entran en la fórmula de pesos.',
            },
            {
                tipo: 'imagen',
                src: '/manual/cortecaja.JPG',
                ancho: 782,
                alto: 431,
                alt: 'Ventana del corte de caja en tres columnas: Datos de la apertura, Captura de lo que hay por cada forma de pago, y Efectivo con el fondo, las ventas, los gastos, el esperado, el capturado y la diferencia.',
                pie: 'La columna de en medio es lo único que se captura a mano. La de la derecha calcula sola y termina en la **Diferencia**.',
            },
            { tipo: 'subtitulo', texto: 'Qué ves en cada apertura' },
            {
                tipo: 'lista',
                items: [
                    '**Ventas de membresías** y **ventas de uniformes**, separadas.',
                    '**Egresos** de esa jornada, con concepto, forma de pago e importe.',
                    'El detalle de movimientos que forman cada total.',
                    'Las aperturas sin cerrar quedan marcadas como Sin corte.',
                ],
            },
            {
                tipo: 'imagen',
                src: '/manual/detalleventascontrolcaja.JPG',
                ancho: 880,
                alto: 361,
                alt: 'Detalle de ventas de una apertura, con las membresías y los uniformes desglosados por forma de pago en tablas separadas y el total de ventas a la derecha.',
                pie: 'Membresías y uniformes van en tablas aparte porque el corte los reporta por separado.',
            },
            {
                tipo: 'imagen',
                src: '/manual/detalleegresoscontrolcaja.JPG',
                ancho: 688,
                alto: 523,
                alt: 'Detalle de egresos de una apertura: el resumen por forma de pago a la izquierda y a la derecha cada gasto con su hora, concepto, forma de pago e importe.',
                pie: 'Estos son los gastos que salieron **de esa caja**. Los gastos de la sede que no pasaron por una caja abierta se ven en Egresos por Sede.',
            },
        ],
    },
    {
        clave: '/cortes-mensuales',
        titulo: 'Cortes de Caja por Mes',
        audiencia: ['direccion'],
        bloques: [
            {
                tipo: 'parrafo',
                texto: 'La misma información del control de caja, consolidada por mes y con filtro por sede. Sirve para revisar un período completo sin abrir apertura por apertura, y para detectar sedes con diferencias recurrentes. Exporta a PDF.',
            },
            {
                tipo: 'imagen',
                src: '/manual/cortescajames.JPG',
                ancho: 1903,
                alto: 858,
                alt: 'Cortes de Caja por Mes: selector de año, filtro por sede con el acumulado de cada una, totales del año y una tarjeta por mes con ventas, egresos y neto.',
                pie: 'El neto de un mes puede salir **en rojo** cuando los egresos superan a las ventas de ese período.',
            },
        ],
    },
    {
        clave: 'grupo:Ventas',
        titulo: 'Ventas',
        audiencia: ['operacion', 'direccion'],
        bloques: [
            {
                tipo: 'parrafo',
                texto: 'Varias vistas del mismo universo de cobros, cada una respondiendo una pregunta distinta.',
            },
            {
                tipo: 'tabla',
                encabezados: ['Vista', 'Responde'],
                filas: [
                    ['Historial de ventas', '¿Qué le vendimos a este jugador? Búsqueda por comprador.'],
                    ['Ventas por Día', '¿Cómo se comportó el mostrador día con día?'],
                    ['Ventas por Producto', '¿Qué artículo o concepto se movió más?'],
                    ['Ventas por Tipo de Producto', 'Lo mismo, agrupado por familia en vez de artículo suelto.'],
                    ['Ventas Canceladas', '¿Qué se canceló, cuándo y por cuánto? Es lo único que los demás reportes excluyen.'],
                ],
            },
            { tipo: 'parrafo', texto: 'Todas permiten buscar y exportar a Excel y PDF.' },
            {
                tipo: 'imagen',
                src: '/manual/historialventas.JPG',
                ancho: 1879,
                alto: 837,
                alt: 'Historial de Ventas: totales por forma de pago arriba, buscador por comprador, filtro de sede y período, y una tabla con fecha, comprador, concepto, sede, forma de pago, recibo e importe.',
                pie: 'La vista más fina: un renglón por concepto cobrado. Un mismo recibo puede ocupar varios renglones.',
            },
            {
                tipo: 'imagen',
                src: '/manual/ventasdia.JPG',
                ancho: 1904,
                alto: 774,
                alt: 'Ventas por Día: totales de ventas, gastos y neto, y una tabla con un renglón por día que muestra número de ventas, importe vendido, número de gastos, importe gastado y neto.',
                pie: 'Es la única vista de Ventas que resta los gastos. Al hacer clic en un día se abre su detalle.',
            },
            {
                tipo: 'imagen',
                src: '/manual/ventasproducto.JPG',
                ancho: 1894,
                alto: 827,
                alt: 'Ventas por Producto: mapa de rectángulos donde el tamaño de cada bloque es su peso en la venta, y a la derecha la lista de productos ordenada por importe con su cantidad y porcentaje.',
                pie: 'El tamaño del rectángulo es proporcional a lo vendido: de un vistazo se ve qué concepto sostiene el mes.',
            },
            {
                tipo: 'imagen',
                src: '/manual/ventastipoproducto.JPG',
                ancho: 1912,
                alto: 796,
                alt: 'Ventas por Tipo de Producto: el mismo mapa de rectángulos pero agrupado en familias como mensualidad, liga, ropa, inscripción y reinscripción, copa y comisión.',
                pie: 'La misma venta del reporte anterior, agrupada por familia en vez de por artículo suelto.',
            },
            {
                tipo: 'imagen',
                src: '/manual/ventascanceladas.JPG',
                ancho: 1898,
                alto: 850,
                alt: 'Ventas Canceladas: total cancelado desglosado por forma de pago, filtro por sede y período, y la tabla de cancelaciones con su etiqueta roja CANCELADA.',
                pie: 'Todo lo que sale aquí está **excluido** de los demás reportes. Varios renglones seguidos del mismo comprador suelen ser un recibo completo cancelado.',
            },
        ],
    },
    {
        clave: '/gastos/egresos',
        titulo: 'Egresos por Sede',
        audiencia: ['direccion'],
        bloques: [
            {
                tipo: 'parrafo',
                texto: 'Todo lo que sale de las sedes, en el período que elijas: hoy, ayer, esta semana, este mes, este año o un rango de fechas propio.',
            },
            {
                tipo: 'lista',
                items: [
                    'Arriba: **total del período**, desglose por forma de pago y cuántas sedes tuvieron gasto.',
                    'Una tarjeta por sede con su importe y una barra que compara su peso contra la sede que más gastó.',
                    'Al abrir una sede: cada movimiento con fecha, concepto, a quién se pagó, factura, forma de pago e importe, con buscador.',
                ],
            },
            {
                tipo: 'imagen',
                src: '/manual/egresossede.JPG',
                ancho: 1882,
                alto: 787,
                alt: 'Egresos por Sede: los botones PDF y Excel arriba a la izquierda, el selector de período a la derecha, los tres recuadros de total, formas de pago y sedes con gasto, y una tarjeta por sede con su barra comparativa.',
                pie: 'Los botones **PDF** y **Excel** de arriba bajan el resumen completo: el desglose por sede y el de formas de pago.',
            },
            {
                tipo: 'imagen',
                src: '/manual/detalleegresossede.JPG',
                ancho: 681,
                alto: 454,
                alt: 'Detalle de egresos de una sede con su propio PDF y Excel, un buscador, y cada movimiento con fecha, proveedor, forma de pago, factura e importe, más el total abajo.',
                pie: 'El detalle trae sus propios PDF y Excel, y **respetan el buscador**: si filtras, el archivo sale filtrado.',
            },
            {
                tipo: 'nota',
                estilo: 'ojo',
                titulo: 'Ojo',
                texto: 'Este reporte agrupa por la **sede a la que pertenece el gasto**. El control de caja agrupa por la caja de la que salió el dinero, y solo ve los gastos que pasaron por una caja abierta. Por eso los totales de las dos pantallas no coinciden: miden cosas distintas, y este es el que da la foto completa.',
            },
            { tipo: 'parrafo', texto: 'El detalle se limita a 3,000 movimientos; si se recorta, la pantalla te avisa.' },
        ],
    },
    {
        clave: '/dashboard',
        titulo: 'Dashboard',
        audiencia: ['direccion'],
        bloques: [
            {
                tipo: 'parrafo',
                texto: 'La foto financiera de la temporada activa. **Todo el tablero está acotado a esa temporada**, y casi todo responde además al selector de período de arriba.',
            },
            {
                tipo: 'imagen',
                src: '/manual/dashboard.JPG',
                ancho: 1903,
                alto: 849,
                alt: 'Dashboard: selector de período arriba a la derecha, los cuatro indicadores de recaudado, pagos, jugadores pagantes y promedio, la gráfica de tendencia de pagos por día, y abajo los cortes por sede, por liga y la tarjeta de Acumulado de la temporada.',
                pie: 'La tarjeta de la esquina inferior derecha lleva la etiqueta **Toda la temporada**: es la única que ignora el selector de período de arriba.',
            },
            { tipo: 'subtitulo', texto: 'Los cuatro indicadores del período' },
            {
                tipo: 'parrafo',
                texto: 'Total recaudado, pagos registrados, jugadores pagantes y promedio por pago. El de jugadores pagantes se abre para ver la distribución por sucursal, incluso cruzando sede de cobro contra sede de registro.',
            },
            { tipo: 'subtitulo', texto: 'Acumulado de la temporada' },
            {
                tipo: 'parrafo',
                texto: 'Esta tarjeta es la excepción: **no obedece al selector de período**, por eso lleva la etiqueta "Toda la temporada".',
            },
            {
                tipo: 'tabla',
                encabezados: ['Renglón', 'Qué es'],
                filas: [
                    ['Recaudado', 'Todo el dinero cobrado con el sello de esta temporada, sin importar la fecha. Incluye inscripciones, mensualidades, copas, ligas y ventas.'],
                    ['Transacciones', 'Número de recibos vigentes. Un recibo puede cubrir varios conceptos.'],
                    ['Jugadores con pagos', 'Jugadores distintos que han pagado algo. **No es la plantilla ni los inscritos.**'],
                ],
            },
            {
                tipo: 'parrafo',
                texto: 'Debajo va la recaudación mes a mes, con el mes en curso resaltado, y el comparativo contra la temporada anterior a la misma altura del ciclo.',
            },
            {
                tipo: 'nota',
                estilo: 'cuidado',
                titulo: 'Cuidado con este dato',
                texto: 'El comparativo mide **meses calendario completos desde el inicio de cada temporada**. Al principio de un ciclo eso compara unos pocos días contra un mes entero del año anterior, y arroja caídas enormes que no son reales. Además, buena parte del dinero entra antes de que la temporada arranque (inscripciones anticipadas) y esa parte queda fuera de la ventana. Tómalo con reservas durante las primeras semanas.',
            },
            { tipo: 'subtitulo', texto: 'Tendencia y desgloses' },
            {
                tipo: 'parrafo',
                texto: 'La gráfica de tendencia muestra el monto cobrado por día con su cifra encima. Ojo: los días sin ningún cobro **no generan barra**, se saltan, así que una racha floja se ve menos marcada de lo que fue. Abajo, los cortes por sede y por liga se abren al detalle de pagos que los componen.',
            },
        ],
    },
    {
        clave: '/agente',
        titulo: 'Agente Inteligente',
        audiencia: ['direccion'],
        bloques: [
            {
                tipo: 'parrafo',
                texto: 'Un asistente al que le preguntas en español sobre cualquier módulo —cobranza, inscripciones, ventas, egresos— y responde consultando los datos reales. Útil para preguntas que no tienen pantalla propia: cruces entre sedes, comparaciones entre períodos o rankings específicos.',
            },
            {
                tipo: 'imagen',
                src: '/manual/agenteinteligente.JPG',
                ancho: 1904,
                alto: 787,
                alt: 'Agente Inteligente con cuatro preguntas de ejemplo listas para pulsar y, arriba a la derecha, el selector del modelo que responde.',
                pie: 'Las cuatro tarjetas del centro son ejemplos para arrancar. Arriba a la derecha se elige el modelo que contesta. También está disponible como chat flotante desde cualquier pantalla.',
            },
            {
                tipo: 'nota',
                estilo: 'cuidado',
                titulo: 'Cuidado con este dato',
                texto: 'Trátalo como a un analista: verifica contra el reporte correspondiente cualquier cifra que vayas a usar para decidir.',
            },
        ],
    },
    {
        clave: '/qr-accesos',
        titulo: 'Preregistro y códigos QR',
        audiencia: ['operacion'],
        bloques: [
            {
                tipo: 'parrafo',
                texto: 'Cada sede tiene su propio código QR. Al escanearlo, el interesado abre un formulario público donde captura sus datos, y el registro llega ya asociado a esa sede: no hay que preguntarle de dónde viene ni transcribir nada a mano.',
            },
            {
                tipo: 'pasos',
                items: [
                    'Entra a QR Accesos y verás un código por sede.',
                    'Imprímelos y colócalos en recepción, en la cancha o en material promocional.',
                    'Los preregistros van cayendo listos para convertirse en alta formal.',
                ],
            },
            {
                tipo: 'parrafo',
                texto: 'El formulario ayuda con el domicilio a partir del código postal, para evitar errores de captura.',
            },
        ],
    },
];

/** Índice por clave, para que la pantalla resuelva rápido. */
export const POR_CLAVE: Record<string, SeccionManual> = Object.fromEntries(
    SECCIONES.map((s) => [s.clave, s]),
);

/** Un bloque como texto plano, para alimentar al agente. */
function bloqueATexto(b: Bloque): string {
    switch (b.tipo) {
        case 'subtitulo':
            return `\n### ${b.texto}`;
        case 'parrafo':
            return b.texto;
        case 'lista':
            return b.items.map((i) => `- ${i}`).join('\n');
        case 'pasos':
            return b.items.map((i, n) => `${n + 1}. ${i}`).join('\n');
        case 'formula':
            return b.lineas.join('\n');
        case 'nota':
            return `[${b.titulo}] ${b.texto}`;
        // El agente no ve la figura; recibe su descripción para poder explicarla.
        case 'imagen':
            return `[Figura: ${b.alt}${b.pie ? ` — ${b.pie}` : ''}]`;
        case 'tabla':
            return [
                `| ${b.encabezados.join(' | ')} |`,
                `| ${b.encabezados.map(() => '---').join(' | ')} |`,
                ...b.filas.map((f) => `| ${f.join(' | ')} |`),
            ].join('\n');
    }
}

/**
 * El manual completo como texto, para inyectarlo en el prompt del agente.
 *
 * Se deriva de las MISMAS secciones que pinta la pantalla del manual, así que el
 * agente y el documento nunca se contradicen: al editar el contenido, ambos cambian.
 */
export function manualComoTexto(): string {
    const partes: string[] = [];
    for (const s of [...INTRO, ...SECCIONES, ...CIERRE]) {
        const ruta = s.clave.startsWith('/') ? ` (pantalla: ${s.clave})` : '';
        partes.push(`## ${s.titulo}${ruta}`);
        partes.push(s.bloques.map(bloqueATexto).join('\n'));
        partes.push('');
    }
    // El manual se escribe con **negritas** de markdown; sobran en el prompt.
    return partes.join('\n').replace(/\*\*/g, '').trim();
}
