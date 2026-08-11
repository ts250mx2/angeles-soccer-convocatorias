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
    | { tipo: 'nota'; estilo: 'ojo' | 'calculo' | 'cuidado'; titulo: string; texto: string };

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
                tipo: 'parrafo',
                texto: 'Una sola temporada está marcada como activa. El Dashboard siempre trabaja con esa; Inscripciones y Adeudos permiten elegir cuál ver.',
            },
            { tipo: 'subtitulo', texto: 'Sede de registro y sede de cobro no son lo mismo' },
            {
                tipo: 'parrafo',
                texto: 'Un jugador pertenece a una sede, pero puede pagar en otra. Los reportes distinguen ambas cosas, y por eso un mismo día puede verse distinto "por sede" según qué reporte abras.',
            },
            { tipo: 'subtitulo', texto: 'Nada se borra: se cancela' },
            {
                tipo: 'parrafo',
                texto: 'Pagos, ventas y egresos cancelados siguen en la base pero quedan marcados. Todos los totales cuentan **solo lo vigente**. Por eso existe la pantalla de Ventas Canceladas: para ver justamente lo que los demás reportes excluyen.',
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
