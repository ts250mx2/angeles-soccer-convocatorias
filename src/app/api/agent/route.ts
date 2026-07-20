import Anthropic from '@anthropic-ai/sdk';
import { anthropic, resolveModel } from '@/lib/anthropic';
import { assertReadOnly } from '@/lib/sql-sandbox';
import { requireAdmin } from '@/lib/auth';
import { pool } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_TOOL_ITERATIONS = 8;   // evita loops infinitos / costos descontrolados
const MAX_HISTORY_TURNS = 12;    // pares user/assistant que conservamos como contexto

// ── Esquema de la base de datos (BDAngelesSoccer) que el agente puede consultar ──
const DB_SCHEMA = `
Base de datos MySQL de Ángeles Soccer (academia de futbol). Módulos y tablas:

── JUGADORES / INSCRIPCIONES ──
tblJugadores (J): IdJugador, Jugador, Categoria, Nombre, ApellidoPaterno, ApellidoMaterno,
  FechaNacimiento, Genero(1=M,2=F), CURP, IdSede, Sede, Status(0=ACTIVO, 2=BAJA), Beca(% descuento),
  IdTemporadaActiva, IdEscuela, Padre, TelPadre, Madre, TelMadre, Calle, Colonia, Municipio, Estado,
  CodigoPostal, AnioNacimiento, Talla, Coach.
  -> INSCRITOS: un jugador cuenta como inscrito si J.Status = 0 (2 = baja).
  -> TEMPORADA: los jugadores SIEMPRE se acotan por J.IdTemporadaActiva. Un mismo jugador
     puede existir en varias temporadas, así que contar sin filtrar por temporada
     INFLA los totales. Si el usuario no menciona temporada, usa la ACTIVA.
     Patrón correcto para "jugadores inscritos por sede":
       SELECT S.Sede, COUNT(*) AS Inscritos
       FROM tblJugadores J
       INNER JOIN tblSedes S ON J.IdSede = S.IdSede
       WHERE J.Status = 0
         AND J.IdTemporadaActiva = (SELECT IdTemporada FROM tblTemporadas WHERE EsActiva = 1)
       GROUP BY S.Sede
       ORDER BY Inscritos DESC;
     Si el usuario pide otra temporada, resuélvela por nombre contra tblTemporadas.Temporada
     (p.ej. 'ENERO - JULIO 2026') y menciona en la respuesta qué temporada usaste.

tblJugadoresPre (JP): preregistros públicos (mismos campos base + IdSede, IdEscuela, Status, FechaAlta).

tblSedes (S): IdSede, Sede, Estado, Municipio, Colonia, CodigoPostal, Status(0=activa), UUID, EsClinics.
tblTemporadas (T): IdTemporada, Temporada, FechaInicio, FechaFin, EsActiva(1=temporada vigente).
tblEscuelas: IdEscuela, Escuela, Municipio, Estado, NivelEducativo.
tblEstados: IdEstado, Estado (mayúsculas, p.ej. 'NUEVO LEON'). tblMunicipios: IdMunicipio, Municipio, IdEstado.
tblCodigosPostales: CodigoPostal, Colonia, Municipio, Estado (catálogo SEPOMEX).

── PAGOS / ADEUDOS / VENTAS ──
tblPagos (P): IdPago, IdJugador, Jugador, IdProducto, Pago(double), FechaPago(datetime EN UTC),
  Mes(int 1-12 = mes de la mensualidad pagada), Anio, IdTemporada, Status(0=válido),
  IdFormaPago, FormaPago, Recibo, Referencia, IdSedePago(sede DONDE SE COBRÓ), IdApertura, Dolares.
  -> IMPORTANTE: FechaPago está en UTC. Para fechas locales usa
     CONVERT_TZ(P.FechaPago,'+00:00','-06:00').
  -> Filtra SIEMPRE P.Status = 0 para pagos válidos.

tblProductos (PR): IdProducto, Producto, Precio, IdTipoProducto, IdSede, IdTemporada, IdLiga, Status.
tblTiposProductos (TP): IdTipoProducto, TipoProducto.
  -> 1=MENSUALIDAD, 2=INSCRIPCION Y REINSCRIPCION, 3=LIGA, 4=COPA, 5=COMISION, 6=ROPA.

tblVentas (V): IdVenta, FechaVenta, IdJugador, Jugador, ConceptoVenta, Total, Subtotal, Iva,
  IdFormaPago, FormaPago, Recibo, IdSede, Status(0=válida).
  -> Módulo POS de productos. Distinto de tblPagos (que son cobros ligados a tblProductos).

── CAJA ──
tblAperturasCierres (AC): IdApertura, IdSede, FechaApertura, FechaCierre, IdCajero,
  IdSupervisorApertura, IdSupervisorCierre, FondoCaja, Efectivo, TarjetaCredito, TarjetaDebito,
  Depositos, Transferencias, OpenPay, Dolares.
  -> OJO: FechaApertura ya está en hora LOCAL (no le apliques CONVERT_TZ).
  -> Una apertura está cerrada si FechaCierre no es NULL.

tblEgresos (E): IdEgreso, IdApertura, IdSedePago, Total, Concepto, FechaEgreso, IdFormaPago, Status.

── COPAS Y LIGAS ──
tblConvocatorias (C): IdConvocatoria, IdTemporada, IdLiga, Categoria, Color, FechaInicio, FechaFin,
  IdProfesor, CostoLiga, CostoProfesor, CostoArbitro, Status.
tblDetalleConvocatorias (DC): IdJugador, IdTemporada, IdLiga, Categoria, Color, EsConvocado, Precio.
tblLigas (L): IdLiga, Liga.

── USUARIOS ──
tblUsuarios (U): IdUsuario, Usuario, AdminConvocatorias, Status.

Relaciones clave:
  tblPagos.IdProducto = tblProductos.IdProducto
  tblProductos.IdTipoProducto = tblTiposProductos.IdTipoProducto
  tblPagos.IdJugador = tblJugadores.IdJugador
  tblPagos.IdSedePago = tblSedes.IdSede   (sede del cobro)
  tblJugadores.IdSede = tblSedes.IdSede   (sede del jugador)
  tblPagos.IdApertura = tblAperturasCierres.IdApertura
  tblEgresos.IdApertura = tblAperturasCierres.IdApertura
  tblJugadores.IdTemporadaActiva = tblTemporadas.IdTemporada
`.trim();

function buildSystemPrompt(): string {
    const hoy = new Date().toLocaleDateString('es-MX', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });
    return `Eres el asistente inteligente de Ángeles Soccer, una academia de futbol.
Respondes SIEMPRE en español, de forma clara, directa y profesional.

Fecha de hoy: ${hoy}.

Puedes consultar la base de datos del negocio para responder preguntas reales sobre CUALQUIER módulo:
inscripciones, jugadores, adeudos, pagos, cortes de caja, ventas por tipo de producto, copas y ligas,
preregistros, sedes y usuarios. Usa la herramienta "query_database" para ello.

REGLAS PARA CONSULTAR:
- Escribe SQL de MySQL, SOLO de lectura (SELECT / WITH). Nunca intentes modificar datos.
- Para pagos válidos filtra siempre P.Status = 0; para jugadores inscritos J.Status = 0 (2 = baja).
- tblPagos.FechaPago está en UTC: usa CONVERT_TZ(P.FechaPago,'+00:00','-06:00') para fechas locales.
  En cambio tblAperturasCierres.FechaApertura ya está en hora local (no la conviertas).
- Si la pregunta no indica temporada, usa la temporada activa:
  (SELECT IdTemporada FROM tblTemporadas WHERE EsActiva = 1).
- Agrupa, ordena y usa LIMIT cuando tenga sentido. Puedes hacer varias consultas para cruzar información.
- Si no estás seguro de los valores de una columna, primero explórala (por ejemplo con GROUP BY).

FORMATO DE RESPUESTA (importante — tus respuestas se renderizan como markdown):
- Empieza SIEMPRE con la conclusión en una línea destacada, con un emoji y el dato clave en **negritas**.
  Ejemplo: "📊 Hay **334 jugadores inscritos** en la temporada AGOSTO - DICIEMBRE 2026."
- Usa **tablas markdown** siempre que compares varios elementos (sedes, categorías, meses, productos).
  Pon los montos y cantidades alineados y con formato: $1,234.50 / 1,234.
- Usa encabezados "## " para separar secciones cuando la respuesta tenga varias partes,
  y viñetas "- " para listas de hallazgos.
- Cierra con una línea de "💡 " cuando detectes algo accionable o llamativo (una sede que destaca,
  una caída, un adeudo alto). Si no hay nada relevante, omítela.
- Emojis por tema (úsalos con moderación, uno por encabezado o dato clave):
  📊 métricas · 👥 jugadores/inscritos · 💰 dinero/ingresos · ⚠️ adeudos/alertas · 🏫 sedes ·
  📅 fechas/temporadas · 🏆 copas y ligas · 👕 ropa/uniformes · 🧾 caja/cortes · 📈 crecimiento · 📉 caída.
- Menciona SIEMPRE el alcance del dato: temporada, rango de fechas y/o sede considerados.
- Sé conciso: sin relleno, sin repetir la pregunta, sin explicar el SQL salvo que te lo pidan.

Si la pregunta NO requiere datos (saludo, ayuda, explicación de un módulo), responde directamente sin consultar.

Esquema disponible:
${DB_SCHEMA}`;
}

const TOOLS: Anthropic.Tool[] = [
    {
        name: 'query_database',
        description:
            'Ejecuta una consulta SQL de SOLO LECTURA (SELECT/WITH) contra la base de datos MySQL de Ángeles Soccer y devuelve las filas en JSON. Úsala para responder preguntas sobre inscripciones, jugadores, adeudos, pagos, caja, ventas, copas y ligas.',
        input_schema: {
            type: 'object',
            properties: {
                sql: {
                    type: 'string',
                    description: 'Consulta MySQL de solo lectura (SELECT o WITH). Un solo statement, sin punto y coma final.',
                },
            },
            required: ['sql'],
        },
    },
];

interface IncomingTurn {
    role: 'user' | 'assistant';
    content: string;
}

async function runQuery(sql: string): Promise<{ ok: boolean; text: string }> {
    let clean: string;
    try {
        clean = assertReadOnly(sql);
    } catch (e: any) {
        return { ok: false, text: e.message };
    }
    try {
        const [rows] = await pool.query(clean);
        const arr = Array.isArray(rows) ? (rows as any[]) : [];
        const capped = arr.slice(0, 200);
        let json = JSON.stringify(capped);
        if (json.length > 60000) json = json.slice(0, 60000) + ' …(truncado)';
        const note = arr.length > capped.length ? ` (mostrando ${capped.length} de ${arr.length} filas)` : '';
        return { ok: true, text: `Filas: ${arr.length}${note}\n${json}` };
    } catch (e: any) {
        return { ok: false, text: `Error de SQL: ${e.message}` };
    }
}

export async function POST(req: Request) {
    // Autorización de servidor: valida la sesión firmada y relee el rol en la BD.
    const auth = await requireAdmin();
    if (!auth.ok) {
        return Response.json({ error: auth.message }, { status: auth.status });
    }

    if (!process.env.ANTHROPIC_API_KEY) {
        return Response.json(
            { error: 'Falta configurar ANTHROPIC_API_KEY en el archivo .env del servidor.' },
            { status: 500 },
        );
    }

    let body: any;
    try {
        body = await req.json();
    } catch {
        return Response.json({ error: 'Cuerpo inválido' }, { status: 400 });
    }

    const prompt: string = (body?.prompt ?? '').toString().trim();
    if (!prompt) {
        return Response.json({ error: 'Falta el mensaje (prompt)' }, { status: 400 });
    }

    const { config } = resolveModel(body?.model);
    const rawHistory: IncomingTurn[] = Array.isArray(body?.history) ? body.history : [];

    const messages: Anthropic.MessageParam[] = rawHistory
        .filter((t) => (t.role === 'user' || t.role === 'assistant') && typeof t.content === 'string' && t.content.trim())
        .slice(-MAX_HISTORY_TURNS * 2)
        .map((t) => ({ role: t.role, content: t.content.slice(0, 8000) }));
    messages.push({ role: 'user', content: prompt });

    const system = buildSystemPrompt();

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
        async start(controller) {
            const send = (obj: unknown) => {
                try {
                    controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n'));
                } catch {
                    /* stream cerrado */
                }
            };

            try {
                for (let iter = 0; iter < MAX_TOOL_ITERATIONS; iter++) {
                    const mstream = anthropic.messages.stream({
                        model: config.id,
                        max_tokens: 16000,
                        system,
                        tools: TOOLS,
                        messages,
                        thinking: { type: 'adaptive' },
                        output_config: { effort: config.effort },
                    } as Anthropic.MessageCreateParamsStreaming);

                    for await (const event of mstream) {
                        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
                            send({ type: 'text', text: event.delta.text });
                        }
                    }

                    const msg = await mstream.finalMessage();
                    // Preserva el contenido completo (incluye bloques de thinking firmados)
                    messages.push({ role: 'assistant', content: msg.content });

                    if (msg.stop_reason !== 'tool_use') break;

                    const toolUses = msg.content.filter(
                        (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
                    );

                    const toolResults: Anthropic.ToolResultBlockParam[] = [];
                    for (const tu of toolUses) {
                        if (tu.name === 'query_database') {
                            const sql = (tu.input as any)?.sql ?? '';
                            send({ type: 'tool', sql });
                            const result = await runQuery(sql);
                            toolResults.push({
                                type: 'tool_result',
                                tool_use_id: tu.id,
                                content: result.text,
                                is_error: !result.ok,
                            });
                        } else {
                            toolResults.push({
                                type: 'tool_result',
                                tool_use_id: tu.id,
                                content: `Herramienta desconocida: ${tu.name}`,
                                is_error: true,
                            });
                        }
                    }

                    messages.push({ role: 'user', content: toolResults });
                }

                send({ type: 'done' });
            } catch (e: any) {
                console.error('[agent] error:', e);
                const message =
                    e instanceof Anthropic.AuthenticationError
                        ? 'La llave de Anthropic (ANTHROPIC_API_KEY) es inválida o falta.'
                        : e instanceof Anthropic.RateLimitError
                            ? 'Demasiadas solicitudes. Intenta de nuevo en unos segundos.'
                            : e?.message || 'Ocurrió un error inesperado.';
                send({ type: 'error', message });
            } finally {
                controller.close();
            }
        },
    });

    return new Response(stream, {
        headers: {
            'Content-Type': 'application/x-ndjson; charset=utf-8',
            'Cache-Control': 'no-cache, no-transform',
            Connection: 'keep-alive',
        },
    });
}
