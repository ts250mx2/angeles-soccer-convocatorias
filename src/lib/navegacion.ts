/**
 * Catálogo de navegación de la aplicación: la ÚNICA lista de módulos que existe.
 *
 * Vive aquí y no en el Sidebar porque tres consumidores distintos la necesitan:
 *   - el Sidebar, que la pinta;
 *   - el Manual de Operación, que arma sus secciones con las mismas claves;
 *   - los permisos por perfil, que se guardan en la base y se validan en el servidor.
 *
 * Por eso el icono viaja como NOMBRE (texto) y no como JSX: así este archivo lo puede
 * importar una ruta de API sin arrastrar React ni lucide-react al servidor.
 *
 * La CLAVE de un módulo es su `href`. Es la misma clave que usa el manual y la que se
 * guarda en tblPerfilPaginas, de modo que un módulo nuevo solo se declara una vez.
 */
import type { TipoTorneo } from '@/lib/acento-torneo';

export type IconoNav =
    | 'Award'
    | 'LayoutDashboard'
    | 'Trophy'
    | 'Users'
    | 'ClipboardList'
    | 'MapPin'
    | 'UserCheck'
    | 'Banknote'
    | 'LayoutList'
    | 'ShoppingCart'
    | 'Receipt'
    | 'CalendarRange'
    | 'LayoutGrid'
    | 'Boxes'
    | 'CalendarDays'
    | 'CalendarCheck'
    | 'CreditCard'
    | 'GraduationCap'
    | 'QrCode'
    | 'Bot'
    | 'Ban'
    | 'BookOpen'
    | 'ShieldCheck'
    | 'UserCog'
    | 'UserRoundPlus'
    | 'UserPlus'
    | 'Shirt'
    | 'Goal';

export interface NavItem {
    label: string;
    /** Ruta del módulo. Ausente en los grupos, que solo agrupan hijos. */
    href?: string;
    icono: IconoNav;
    children?: NavItem[];
    /**
     * Valor por omisión del permiso: `true` = solo administración. NO se evalúa en
     * tiempo de ejecución (para eso está tblPerfilPaginas); sirve para sembrar los
     * permisos de un perfil nuevo y documenta con qué criterio nació cada módulo.
     */
    adminOnly?: boolean;
    /**
     * Rutas que cuelgan del módulo y comparten su permiso (detalles, drill-downs).
     * Sin esto, `/adeudos/multi` no tendría dueño y quedaría fuera del control.
     */
    cubre?: string[];
    /**
     * El módulo NO se pinta en el menú, pero sigue existiendo: conserva su clave, su
     * permiso y su sección del manual.
     *
     * Hace falta para la raíz `/`: se llega a ella desde Copas y Ligas, y sacarla del
     * catálogo la dejaría sin dueño —`claveDeRuta('/')` devolvería null— y por tanto sin
     * control de acceso, visible para cualquiera con sesión.
     */
    oculto?: boolean;
    /**
     * De qué torneos es la entrada, para pintarla de su color.
     *
     * Seis entradas del menú son tres pantallas repetidas —Convocatorias, Pagos y
     * Catálogo, cada una en copas y en ligas—, y con el nombre solo se confunden.
     */
    acento?: TipoTorneo;
}

export const NAV_ITEMS: NavItem[] = [
    {
        label: 'Dashboard',
        href: '/dashboard',
        icono: 'LayoutDashboard',
        adminOnly: true,
    },
    {
        label: 'QR Accesos',
        href: '/qr-accesos',
        icono: 'QrCode',
        adminOnly: true,
    },
    {
        label: 'Agente Inteligente',
        href: '/agente',
        icono: 'Bot',
        adminOnly: true,
    },
    {
        label: 'Copas y Ligas',
        icono: 'Trophy',
        children: [
            {
                /* La portada completa. No se pinta en el menú —ahí van Copas y Ligas
                   por separado—, pero sigue siendo el módulo dueño de la raíz y de la
                   pantalla de alta: sin él, `/` se quedaría sin permiso. */
                label: 'Convocatorias (todas)',
                href: '/',
                icono: 'ClipboardList',
                cubre: ['/convocatorias/torneo'],
                oculto: true,
            },
            {
                label: 'Convocatorias Copas',
                href: '/convocatorias/copas',
                icono: 'Trophy',
                acento: 'copa',
            },
            {
                label: 'Convocatorias Ligas',
                href: '/convocatorias/ligas',
                icono: 'ClipboardList',
                acento: 'liga',
            },
            {
                /* La pantalla completa. Se queda fuera del menú —ahí van copas y ligas
                   por separado— pero sigue siendo el módulo dueño de la ruta. */
                label: 'Pagos de Copas y Ligas (todos)',
                href: '/pagos-copas',
                icono: 'Trophy',
                adminOnly: true,
                oculto: true,
            },
            {
                label: 'Pagos de Copas',
                href: '/pagos-copas/copas',
                icono: 'Trophy',
                adminOnly: true,
                acento: 'copa',
            },
            {
                label: 'Pagos de Ligas',
                href: '/pagos-copas/ligas',
                icono: 'Trophy',
                adminOnly: true,
                acento: 'liga',
            },
            {
                label: 'Incorporaciones',
                href: '/incorporaciones',
                icono: 'UserRoundPlus',
                adminOnly: true,
            },
            {
                /* Igual que arriba: fuera del menú, dueño de la ruta y de su API. */
                label: 'Catálogo de Copas y Ligas (todos)',
                href: '/copas-ligas',
                icono: 'Boxes',
                adminOnly: true,
                oculto: true,
            },
            {
                label: 'Catálogo de Copas',
                href: '/copas-ligas/copas',
                icono: 'Boxes',
                adminOnly: true,
                acento: 'copa',
            },
            {
                label: 'Catálogo de Ligas',
                href: '/copas-ligas/ligas',
                icono: 'Boxes',
                adminOnly: true,
                acento: 'liga',
            },
        ],
    },
    {
        label: 'Caja',
        icono: 'Banknote',
        adminOnly: true,
        children: [
            {
                label: 'Control de Caja',
                href: '/caja',
                icono: 'LayoutList',
                adminOnly: true,
            },
        ],
    },
    {
        label: 'Gastos',
        icono: 'Receipt',
        adminOnly: true,
        children: [
            {
                label: 'Egresos por Sede',
                href: '/gastos/egresos',
                icono: 'MapPin',
                adminOnly: true,
            },
            {
                label: 'Gastos por Forma de Pago',
                href: '/gastos/por-forma-pago',
                icono: 'CreditCard',
                adminOnly: true,
            },
            {
                label: 'Gastos por Tipo',
                href: '/gastos/por-tipo',
                icono: 'LayoutGrid',
                adminOnly: true,
            },
        ],
    },
    {
        label: 'Jugadores',
        icono: 'Users',
        children: [
            {
                label: 'Lista de Jugadores',
                href: '/jugadores',
                icono: 'Users',
            },
            {
                label: 'Inscripciones',
                href: '/inscripciones',
                icono: 'UserCheck',
            },
            {
                label: 'Categorías',
                href: '/jugadores/categorias',
                icono: 'LayoutGrid',
            },
            {
                label: 'Becas',
                href: '/jugadores/becas',
                icono: 'GraduationCap',
            },
            {
                label: 'Lealtad',
                href: '/jugadores/lealtad',
                icono: 'Award',
            },
            {
                label: 'Preregistros',
                href: '/preregistros',
                icono: 'UserPlus',
                adminOnly: true,
            },
            {
                label: 'Adeudos por Sede',
                href: '/adeudos/sede',
                icono: 'MapPin',
                adminOnly: true,
                cubre: ['/adeudos'],
            },
        ],
    },
    {
        /* El grupo es solo rótulo: la clave del permiso es el href de su hijo
           ('/administracion-deportiva/plantillas'), que NO cambia. Por eso renombrarlo
           no toca tblPerfilPaginas ni le quita el módulo a nadie. */
        label: 'Admon Deportiva',
        icono: 'Shirt',
        children: [
            {
                label: 'Plantilla de Equipos',
                href: '/administracion-deportiva/plantillas',
                icono: 'Goal',
            },
            {
                label: 'Asistencia',
                href: '/administracion-deportiva/asistencia',
                icono: 'CalendarCheck',
            },
        ],
    },
    {
        label: 'Ventas',
        icono: 'ShoppingCart',
        adminOnly: true,
        children: [
            {
                label: 'Historial de ventas',
                href: '/ventas',
                icono: 'ShoppingCart',
                adminOnly: true,
            },
            {
                label: 'Ventas por Producto',
                href: '/ventas/por-producto',
                icono: 'Boxes',
                adminOnly: true,
            },
            {
                label: 'Ventas por Día',
                href: '/ventas/por-dia',
                icono: 'CalendarDays',
                adminOnly: true,
            },
            {
                label: 'Ventas Canceladas',
                href: '/ventas/canceladas',
                icono: 'Ban',
                adminOnly: true,
            },
            {
                label: 'Cortes de Caja',
                href: '/caja',
                icono: 'Receipt',
                adminOnly: true,
            },
            {
                label: 'Cortes de Caja por Mes',
                href: '/cortes-mensuales',
                icono: 'CalendarRange',
                adminOnly: true,
            },
            {
                label: 'Ventas por Tipo de Producto',
                href: '/ventas/por-tipo',
                icono: 'LayoutGrid',
                adminOnly: true,
            },
            {
                label: 'Ventas por Forma de Pago',
                href: '/ventas/por-forma-pago',
                icono: 'CreditCard',
                adminOnly: true,
            },
        ],
    },
    {
        label: 'Administración',
        icono: 'ShieldCheck',
        adminOnly: true,
        children: [
            {
                label: 'Usuarios',
                href: '/usuarios',
                icono: 'UserCog',
                adminOnly: true,
            },
            {
                label: 'Perfiles y Permisos',
                href: '/perfiles',
                icono: 'ShieldCheck',
                adminOnly: true,
            },
        ],
    },
    {
        label: 'Manual de Operación',
        href: '/manual',
        icono: 'BookOpen',
    },
];

/**
 * Clave del módulo de perfiles. Se usa como llave maestra: quien puede entrar aquí
 * puede repartir permisos, así que el servidor la protege aparte.
 */
export const CLAVE_PERFILES = '/perfiles';
export const CLAVE_USUARIOS = '/usuarios';
export const CLAVE_AGENTE = '/agente';
export const CLAVE_INCORPORACIONES = '/incorporaciones';
export const CLAVE_PREREGISTROS = '/preregistros';
export const CLAVE_LISTA_JUGADORES = '/jugadores';
export const CLAVE_BECAS = '/jugadores/becas';
export const CLAVE_LEALTAD = '/jugadores/lealtad';
export const CLAVE_CATEGORIAS = '/jugadores/categorias';
export const CLAVE_PLANTILLAS = '/administracion-deportiva/plantillas';
export const CLAVE_ASISTENCIA = '/administracion-deportiva/asistencia';
export const CLAVE_COPAS_LIGAS = '/copas-ligas';
export const CLAVE_COPAS = '/convocatorias/copas';
/** Las tres claves del catálogo: la completa y las dos mitades. Su API acepta cualquiera. */
export const CLAVES_CATALOGO = ['/copas-ligas', '/copas-ligas/copas', '/copas-ligas/ligas'];
export const CLAVE_LIGAS = '/convocatorias/ligas';

/**
 * Los módulos que muestran la FOTO de un jugador, y por tanto pueden pedirla.
 *
 * La foto de un menor no es un dato cualquiera: basta con tener sesión para pedir
 * cualquier IdJugador, así que /api/jugadores/foto la reserva a estos módulos. La lista
 * vive aquí y no dentro de la ruta porque son cinco pantallas las que la pintan —lista,
 * becas, plantilla y las dos de convocatorias— y con la comprobación repartida, agregar
 * una sexta significaría acordarse de tocar la ruta.
 *
 * Antes de sumar una clave aquí, la pregunta es si ese módulo tiene razón para ver la
 * cara del niño, no si le resulta cómodo.
 */
export const CLAVES_VEN_FOTO_JUGADOR = [
    CLAVE_LISTA_JUGADORES,
    CLAVE_BECAS,
    // Lealtad pinta la lista con la foto de cada alumno, igual que la Lista.
    CLAVE_LEALTAD,
    CLAVE_CATEGORIAS,
    CLAVE_PLANTILLAS,
    CLAVE_ASISTENCIA,
    CLAVE_COPAS,
    CLAVE_LIGAS,
    // La portada completa de convocatorias, que es la dueña de la raíz.
    '/',
];

export interface PaginaCatalogo {
    /** href del módulo: la misma clave del manual y de tblPerfilPaginas. */
    clave: string;
    label: string;
    /** Grupo del menú al que pertenece, o null si es un módulo de primer nivel. */
    grupo: string | null;
    icono: IconoNav;
    adminOnly: boolean;
    /** Rutas hijas que heredan este permiso. */
    cubre: string[];
}

/**
 * Todos los módulos con ruta, aplanados. Se deduplica por clave porque el menú repite
 * a propósito algún módulo en dos grupos (Cortes de Caja aparece en Caja y en Ventas).
 */
export const PAGINAS: PaginaCatalogo[] = (() => {
    const out: PaginaCatalogo[] = [];
    const vistas = new Set<string>();

    const agrega = (item: NavItem, grupo: string | null) => {
        if (!item.href || vistas.has(item.href)) return;
        vistas.add(item.href);
        out.push({
            clave: item.href,
            label: item.label,
            grupo,
            icono: item.icono,
            adminOnly: item.adminOnly ?? false,
            cubre: item.cubre ?? [],
        });
    };

    for (const item of NAV_ITEMS) {
        if (item.children) {
            for (const hijo of item.children) agrega(hijo, item.label);
            continue;
        }
        agrega(item, null);
    }
    return out;
})();

/** Claves válidas, para que el servidor rechace cualquier cosa que no sea un módulo real. */
export const CLAVES_VALIDAS: ReadonlySet<string> = new Set(PAGINAS.map((p) => p.clave));

/** Claves que un perfil recién creado recibe por omisión (las no administrativas). */
export const CLAVES_BASICAS: string[] = PAGINAS.filter((p) => !p.adminOnly).map((p) => p.clave);

/** Patrón → clave, del más específico al más general. */
const PATRONES: { patron: string; clave: string }[] = PAGINAS.flatMap((p) =>
    [p.clave, ...p.cubre].map((patron) => ({ patron, clave: p.clave })),
).sort((a, b) => b.patron.length - a.patron.length);

function coincide(patron: string, ruta: string): boolean {
    // "/" es prefijo de todo, así que solo vale exacto.
    if (patron === '/') return ruta === '/';
    return ruta === patron || ruta.startsWith(`${patron}/`);
}

/**
 * Módulo al que pertenece una ruta, incluidas sus pantallas de detalle
 * (`/inscripciones/5/2011FC` → `/inscripciones`).
 *
 * Devuelve null si la ruta no pertenece a ningún módulo del catálogo; quien la use
 * decide qué hacer con eso (el layout la deja pasar, para no romper pantallas nuevas
 * que todavía no se den de alta aquí).
 */
export function claveDeRuta(ruta: string): string | null {
    const sinBarra = ruta.length > 1 && ruta.endsWith('/') ? ruta.slice(0, -1) : ruta;
    return PATRONES.find(({ patron }) => coincide(patron, sinBarra))?.clave ?? null;
}

/** ¿El perfil tiene concedido este módulo? `paginas` viene de tblPerfilPaginas. */
export function puedeVerPagina(clave: string | null, paginas: ReadonlySet<string>): boolean {
    if (!clave) return true;
    return paginas.has(clave);
}

/** ¿Se pinta esta entrada del menú? Un grupo se ve si al menos un hijo se ve. */
export function puedeVerItem(item: NavItem, paginas: ReadonlySet<string>): boolean {
    if (item.children) return item.children.some((hijo) => puedeVerItem(hijo, paginas));
    return puedeVerPagina(item.href ?? null, paginas);
}
