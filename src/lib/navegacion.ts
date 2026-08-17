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

export type IconoNav =
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
    | 'CreditCard'
    | 'QrCode'
    | 'Bot'
    | 'Ban'
    | 'BookOpen'
    | 'ShieldCheck'
    | 'UserCog'
    | 'UserPlus';

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
                label: 'Convocatorias',
                href: '/',
                icono: 'ClipboardList',
            },
            {
                label: 'Pagos de Copas y Ligas',
                href: '/pagos-copas',
                icono: 'Trophy',
                adminOnly: true,
            },
            {
                label: 'Catálogo de Copas y Ligas',
                href: '/copas-ligas',
                icono: 'Boxes',
                adminOnly: true,
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
export const CLAVE_PREREGISTROS = '/preregistros';
export const CLAVE_LISTA_JUGADORES = '/jugadores';
export const CLAVE_COPAS_LIGAS = '/copas-ligas';

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
