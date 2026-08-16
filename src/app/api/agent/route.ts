import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { anthropic, openai, resolveModel, type ModelConfig } from '@/lib/anthropic';
import { manualComoTexto } from '@/lib/manual-contenido';
import { MARCA_SUGERENCIAS } from '@/lib/agent-sugerencias';
import { assertReadOnly } from '@/lib/sql-sandbox';
import { requierePagina } from '@/lib/permisos';
import { CLAVE_AGENTE } from '@/lib/navegacion';
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
  -> Status: 0 = ACTIVO, 2 = BAJA.
  -> ⚠️ NO uses J.IdTemporadaActiva para acotar por temporada: ese campo solo refleja la
     última temporada capturada del jugador, NO en cuáles participó realmente.

  ** REGLA DE NEGOCIO — pertenencia a una temporada (inscripciones / jugadores activos) **
  Un jugador pertenece a una temporada si tiene al menos un pago de INSCRIPCIÓN /
  REINSCRIPCIÓN (IdTipoProducto = 2) registrado en esa temporada. Las MENSUALIDADES
  (IdTipoProducto = 1) NO cuentan para esto. SIEMPRE usa este patrón:

     J.IdJugador IN (
       SELECT A.IdJugador FROM tblPagos A
       INNER JOIN tblProductos B ON A.IdProducto = B.IdProducto
       WHERE A.IdTemporada = <idTemporada> AND B.IdTipoProducto = 2 AND A.Status = 0
     )

  Ejemplo — "jugadores inscritos por sede en la temporada activa":
     SELECT S.Sede, COUNT(*) AS Inscritos
     FROM tblJugadores J
     INNER JOIN tblSedes S ON J.IdSede = S.IdSede
     WHERE J.Status = 0
       AND J.IdJugador IN (
         SELECT A.IdJugador FROM tblPagos A
         INNER JOIN tblProductos B ON A.IdProducto = B.IdProducto
         WHERE A.IdTemporada = (SELECT IdTemporada FROM tblTemporadas WHERE EsActiva = 1)
           AND B.IdTipoProducto = 2 AND A.Status = 0
       )
     GROUP BY S.Sede
     ORDER BY Inscritos DESC;

  La FECHA DE INSCRIPCIÓN de un jugador en una temporada es MIN(FechaPago) de sus
  pagos con IdTipoProducto = 2 en esa temporada.

  Si el usuario no menciona temporada, usa la ACTIVA. Si pide otra, resuélvela por nombre
  contra tblTemporadas.Temporada (p.ej. 'ENERO - JULIO 2026') y menciona en la respuesta
  qué temporada usaste.

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

PREGUNTAS DE SEGUIMIENTO (obligatorio, va al final de TODA respuesta):
Termina siempre con una última línea con este formato exacto, y NADA después:
${MARCA_SUGERENCIAS} pregunta 1 || pregunta 2 || pregunta 3
- Son 2 o 3 preguntas que el usuario querría hacer DESPUÉS de leer tu respuesta,
  derivadas de lo que acabas de contestar y de los datos que viste: profundizar en
  algo que llamó la atención, abrir por sede/categoría/mes, comparar contra otra
  temporada, o revisar la causa de algo raro.
- Escríbelas como las diría el usuario, en primera persona y listas para enviarse
  tal cual. Concretas y cortas (máximo ~12 palabras).
  Bien: "¿Cómo se reparte ese adeudo por categoría en GANTE?"
  Mal: "Más información" / "¿Quieres ver el detalle?" / repetir la pregunta original.
- No inventes preguntas sobre datos que no existen en el sistema.
- Esa línea es para la interfaz: NO la anuncies, no la comentes y no la numeres.

PREGUNTAS SOBRE CÓMO USAR EL SISTEMA:
Abajo tienes el Manual de Operación completo. Cuando te pregunten cómo se hace algo, dónde está una
pantalla, qué significa un indicador o por qué dos reportes no cuadran, responde CON EL MANUAL y NO
consultes la base de datos: es una pregunta de uso, no de datos.
- Di en qué pantalla se hace, con su ruta del menú (por ejemplo "Jugadores › Adeudos por Sede").
- Si el manual trae una fórmula o una advertencia sobre ese dato, inclúyela: son justo los puntos
  que más se malinterpretan.
- Si la pregunta mezcla las dos cosas ("¿cómo veo los adeudos y cuántos hay?"), explica con el
  manual Y consulta la base para la cifra.
- Si algo no está en el manual, dilo en vez de suponerlo.

MANUAL DE OPERACIÓN:
${manualComoTexto()}

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

/* La misma herramienta en el formato de la Responses API de OpenAI. Ahí el nombre y
   los parámetros van al ras del objeto, no anidados bajo `function` como en
   chat.completions. `strict` exige additionalProperties: false. */
const TOOLS_OPENAI = TOOLS.map((t) => ({
    type: 'function' as const,
    name: t.name,
    description: t.description,
    parameters: { ...(t.input_schema as Record<string, unknown>), additionalProperties: false },
    strict: true,
}));

interface IncomingTurn {
    role: 'user' | 'assistant';
    content: string;
}

/** Mensajes que la pantalla manda de vuelta, ya recortados. */
function historialLimpio(raw: IncomingTurn[]): IncomingTurn[] {
    return raw
        .filter((t) => (t.role === 'user' || t.role === 'assistant') && typeof t.content === 'string' && t.content.trim())
        .slice(-MAX_HISTORY_TURNS * 2)
        .map((t) => ({ role: t.role, content: t.content.slice(0, 8000) }));
}

/** Lo que la pantalla consume del NDJSON; idéntico para ambos proveedores. */
type Emitir = (obj: unknown) => void;

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

/** Bucle de herramientas con Anthropic (bloques tool_use / tool_result). */
async function correrAnthropic(
    send: Emitir, system: string, prompt: string, historial: IncomingTurn[], config: ModelConfig,
) {
    const messages: Anthropic.MessageParam[] = historial.map((t) => ({ role: t.role, content: t.content }));
    messages.push({ role: 'user', content: prompt });

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

        const toolUses = msg.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
        const toolResults: Anthropic.ToolResultBlockParam[] = [];
        for (const tu of toolUses) {
            if (tu.name === 'query_database') {
                const sql = (tu.input as { sql?: string })?.sql ?? '';
                send({ type: 'tool', sql });
                const result = await runQuery(sql);
                toolResults.push({
                    type: 'tool_result', tool_use_id: tu.id, content: result.text, is_error: !result.ok,
                });
            } else {
                toolResults.push({
                    type: 'tool_result', tool_use_id: tu.id,
                    content: `Herramienta desconocida: ${tu.name}`, is_error: true,
                });
            }
        }
        messages.push({ role: 'user', content: toolResults });
    }
}

/**
 * Bucle de herramientas con OpenAI, sobre la Responses API.
 *
 * Se usa Responses y no chat.completions porque gpt-5.6-terra es un modelo de
 * razonamiento: con herramientas, chat.completions exige reasoning_effort:'none'
 * —es decir, apagar justo aquello por lo que se eligió el modelo—. Responses las
 * admite conservando el razonamiento.
 *
 * El protocolo también difiere de Anthropic: la conversación es una lista de
 * ITEMS (no de mensajes), la instrucción de sistema va en `instructions`, las
 * llamadas llegan como items `function_call` con `call_id`, y cada resultado se
 * devuelve como un item `function_call_output`. Los items de razonamiento deben
 * reenviarse tal cual para no perder el hilo entre vueltas.
 */
async function correrOpenAI(
    send: Emitir, system: string, prompt: string, historial: IncomingTurn[], config: ModelConfig,
) {
    const input: OpenAI.Responses.ResponseInputItem[] = [
        ...historial.map((t) => ({ role: t.role, content: t.content })),
        { role: 'user' as const, content: prompt },
    ];

    for (let iter = 0; iter < MAX_TOOL_ITERATIONS; iter++) {
        const stream = await openai.responses.create({
            model: config.id,
            instructions: system,
            input,
            tools: TOOLS_OPENAI,
            stream: true,
        });

        let final: OpenAI.Responses.Response | null = null;
        for await (const ev of stream) {
            if (ev.type === 'response.output_text.delta') {
                send({ type: 'text', text: ev.delta });
            } else if (ev.type === 'response.completed') {
                final = ev.response;
            }
        }
        if (!final) break;

        // Se reenvían todos los items (incluidos los de razonamiento) para la vuelta siguiente.
        input.push(...(final.output as unknown as OpenAI.Responses.ResponseInputItem[]));

        const llamadas = final.output.filter(
            (o): o is OpenAI.Responses.ResponseFunctionToolCall => o.type === 'function_call',
        );
        if (llamadas.length === 0) break;

        for (const c of llamadas) {
            let salida: string;
            if (c.name === 'query_database') {
                let sql = '';
                try {
                    sql = (JSON.parse(c.arguments || '{}') as { sql?: string }).sql ?? '';
                } catch {
                    sql = '';
                }
                if (sql) {
                    send({ type: 'tool', sql });
                    salida = (await runQuery(sql)).text;
                } else {
                    salida = 'Faltó el parámetro sql o los argumentos no son JSON válido.';
                }
            } else {
                salida = `Herramienta desconocida: ${c.name}`;
            }
            input.push({ type: 'function_call_output', call_id: c.call_id, output: salida });
        }
    }
}

export async function POST(req: Request) {
    // Autorización de servidor: valida la sesión firmada y relee en la BD los
    // módulos del perfil, igual que hace el menú.
    const auth = await requierePagina(CLAVE_AGENTE);
    if (!auth.ok) {
        return Response.json({ error: auth.message }, { status: auth.status });
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

    // La llave que hace falta depende del modelo elegido, no siempre la de Anthropic.
    if (!process.env[config.envLlave]) {
        return Response.json(
            { error: `Falta configurar ${config.envLlave} en el archivo .env del servidor para usar ${config.label}.` },
            { status: 500 },
        );
    }

    const historial = historialLimpio(Array.isArray(body?.history) ? body.history : []);
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
                if (config.proveedor === 'openai') {
                    await correrOpenAI(send, system, prompt, historial, config);
                } else {
                    await correrAnthropic(send, system, prompt, historial, config);
                }
                send({ type: 'done' });
            } catch (e: any) {
                console.error('[agent] error:', e);
                const autenticacion =
                    e instanceof Anthropic.AuthenticationError || e instanceof OpenAI.AuthenticationError;
                const limite =
                    e instanceof Anthropic.RateLimitError || e instanceof OpenAI.RateLimitError;
                const message = autenticacion
                    ? `La llave ${config.envLlave} es inválida o falta.`
                    : limite
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
