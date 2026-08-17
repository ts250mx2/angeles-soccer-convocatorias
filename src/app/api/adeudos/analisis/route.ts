import Anthropic from '@anthropic-ai/sdk';
import { anthropic } from '@/lib/anthropic';

export const dynamic = 'force-dynamic';
// El análisis con Opus 5 (esfuerzo alto) puede tardar; damos margen amplio.
export const maxDuration = 300;

/** Modelo del análisis profundo: Claude Opus 5 (lo pidió el usuario). */
const MODEL_ANALISIS = process.env.ANTHROPIC_MODEL_OPUS || 'claude-opus-5';

const MESES = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

interface DebeMes {
    mes: number;
    cantidad: number;
}

interface SedeRow {
    Sede: string;
    EsClinics?: number;
    Activos: number;
    ActivosNormal: number;
    ActivosKeepers: number;
    ActivosFutsal: number;
    ActivosVentaPublico: number;
    ActivosExcluido: number;
    ActualDebe: number;
    ActualAlCorriente: number;
    ActualKeepers: number;
    ActualKeepersDebe?: number;
    ActualKeepersSinPagos?: number;
    ActualKeepersBecadosSinPagos?: number;
    ActualBecadosSinInscripcion: number;
    ActualDebeInscripcion: number;
    ActualSinInscripcion?: number;
    ActualDebeMeses?: DebeMes[];
    ActualFutsalSinPagos?: number;
    ActualFutsal1Mes?: number;
    ActualFutsal2Meses?: number;
    ActualFutsal3Mas?: number;
    AnteriorDebe: number;
    AnteriorAlCorriente: number;
    AnteriorKeepers: number;
    AnteriorKeepersDebe?: number;
    AnteriorKeepersSinPagos?: number;
    AnteriorKeepersBecadosSinPagos?: number;
    AnteriorBecadosSinInscripcion: number;
    AnteriorPosiblesBajas: number;
    AnteriorDebeInscripcion: number;
    AnteriorDebeMeses?: DebeMes[];
    AnteriorFutsalSinPagos?: number;
    AnteriorFutsal1Mes?: number;
    AnteriorFutsal2Meses?: number;
    AnteriorFutsal3Mas?: number;
}

const num = (v: unknown) => (Number(v) || 0);

/** Suma un campo numérico sobre todas las sedes. */
function total(sedes: SedeRow[], pick: (s: SedeRow) => number | undefined): number {
    return sedes.reduce((acc, s) => acc + num(pick(s)), 0);
}

/** Combina los desgloses por mes de todas las sedes en uno solo, ordenado. */
function totalMeses(sedes: SedeRow[], pick: (s: SedeRow) => DebeMes[] | undefined): DebeMes[] {
    const acc = new Map<number, number>();
    for (const s of sedes) {
        for (const m of pick(s) ?? []) acc.set(m.mes, (acc.get(m.mes) ?? 0) + num(m.cantidad));
    }
    return [...acc.entries()]
        .map(([mes, cantidad]) => ({ mes, cantidad }))
        .filter((m) => m.cantidad > 0)
        .sort((a, b) => a.mes - b.mes);
}

const desgloseTexto = (insc: number, meses: DebeMes[]) => {
    const partes: string[] = [];
    if (insc > 0) partes.push(`inscripción: ${insc}`);
    for (const m of meses) partes.push(`${MESES[m.mes - 1]}: ${m.cantidad}`);
    return partes.length ? partes.join(', ') : 'sin desglose';
};

/** Arma el bloque de datos (en markdown) que se le entrega al modelo. */
function construirDatos(sedes: SedeRow[], actualNombre: string, anteriorNombre: string | null): string {
    const activos = total(sedes, (s) => s.Activos);
    const activosNormal = total(sedes, (s) => s.ActivosNormal);
    const activosKeepers = total(sedes, (s) => s.ActivosKeepers);
    const activosFutsal = total(sedes, (s) => s.ActivosFutsal);
    const activosVentaPublico = total(sedes, (s) => s.ActivosVentaPublico);
    const activosClinics = total(sedes, (s) => s.ActivosExcluido);

    const antDebe = total(sedes, (s) => s.AnteriorDebe);
    const antAlCorriente = total(sedes, (s) => s.AnteriorAlCorriente);
    const antKeepers = total(sedes, (s) => s.AnteriorKeepers);
    const antKeepersDebe = total(sedes, (s) => s.AnteriorKeepersDebe);
    const antKeepersSinPagos = total(sedes, (s) => s.AnteriorKeepersSinPagos);
    const antKeepersBecados = total(sedes, (s) => s.AnteriorKeepersBecadosSinPagos);
    const antBecados = total(sedes, (s) => s.AnteriorBecadosSinInscripcion);
    const antPosiblesBajas = total(sedes, (s) => s.AnteriorPosiblesBajas);
    const antInsc = total(sedes, (s) => s.AnteriorDebeInscripcion);
    const antMeses = totalMeses(sedes, (s) => s.AnteriorDebeMeses);

    const antFutsalSinPagos = total(sedes, (s) => s.AnteriorFutsalSinPagos);
    const antFutsal1Mes = total(sedes, (s) => s.AnteriorFutsal1Mes);
    const antFutsal2Meses = total(sedes, (s) => s.AnteriorFutsal2Meses);
    const antFutsal3Mas = total(sedes, (s) => s.AnteriorFutsal3Mas);

    const actDebe = total(sedes, (s) => s.ActualDebe);
    const actAlCorriente = total(sedes, (s) => s.ActualAlCorriente);
    const actKeepers = total(sedes, (s) => s.ActualKeepers);
    const actKeepersDebe = total(sedes, (s) => s.ActualKeepersDebe);
    const actKeepersSinPagos = total(sedes, (s) => s.ActualKeepersSinPagos);
    const actKeepersBecados = total(sedes, (s) => s.ActualKeepersBecadosSinPagos);
    const actBecados = total(sedes, (s) => s.ActualBecadosSinInscripcion);
    const actSinInsc = total(sedes, (s) => s.ActualSinInscripcion);
    const actMeses = totalMeses(sedes, (s) => s.ActualDebeMeses);

    const actFutsalSinPagos = total(sedes, (s) => s.ActualFutsalSinPagos);
    const actFutsal1Mes = total(sedes, (s) => s.ActualFutsal1Mes);
    const actFutsal2Meses = total(sedes, (s) => s.ActualFutsal2Meses);
    const actFutsal3Mas = total(sedes, (s) => s.ActualFutsal3Mas);

    const lineas: string[] = [];

    lineas.push('## Plantilla (jugadores activos)');
    lineas.push(`- Total activos: ${activos}`);
    lineas.push(`- Sedes normales: ${activosNormal}`);
    lineas.push(`- Keepers/porteros: ${activosKeepers}`);
    lineas.push(`- Futsal: ${activosFutsal}`);
    lineas.push(`- Venta al público (fuera de adeudos): ${activosVentaPublico}`);
    lineas.push(`- Clinics (fuera de adeudos): ${activosClinics}`);
    lineas.push('');

    lineas.push(`## Adeudos — Temporada anterior (${anteriorNombre ?? 'sin datos'})`);
    if (anteriorNombre) {
        lineas.push(`- Con adeudo (sedes): ${antDebe}`);
        lineas.push(`- Desglose de lo adeudado: ${desgloseTexto(antInsc, antMeses)}`);
        lineas.push(`- Al corriente (sedes): ${antAlCorriente}`);
        lineas.push(`- Porteros (${antKeepers} en total): con adeudo ${antKeepersDebe}, sin ninguna mensualidad pagada ${antKeepersSinPagos}, becados 100% sin pago ${antKeepersBecados}, al corriente ${Math.max(0, antKeepers - antKeepersDebe - antKeepersSinPagos - antKeepersBecados)}`);
        lineas.push(`- Futsal (meses pagados): Sin pagos: ${antFutsalSinPagos}, 1 mes: ${antFutsal1Mes}, 2 meses: ${antFutsal2Meses}, 3+: ${antFutsal3Mas}`);
        lineas.push(`- Becados 100% sin inscripción: ${antBecados}`);
        lineas.push(`- Posibles bajas (no pagaron inscripción ni un solo mes): ${antPosiblesBajas}`);
    } else {
        lineas.push('- No hay temporada anterior disponible.');
    }
    lineas.push('');

    lineas.push(`## Adeudos — Esta temporada (${actualNombre})`);
    lineas.push('- Nota: en la temporada en curso solo los jugadores YA INSCRITOS generan adeudo, y únicamente de mensualidades. Los no inscritos no cuentan como deuda: se reportan aparte en "Sin inscripción".');
    lineas.push(`- Con adeudo (sedes, solo mensualidades): ${actDebe}`);
    lineas.push(`- Desglose de lo adeudado: ${desgloseTexto(0, actMeses)}`);
    lineas.push(`- Sin inscripción (activos que aún no se inscriben): ${actSinInsc}`);
    lineas.push(`- Al corriente (sedes): ${actAlCorriente}`);
    lineas.push(`- Porteros (${actKeepers} en total): con adeudo ${actKeepersDebe}, sin ninguna mensualidad pagada ${actKeepersSinPagos}, becados 100% sin pago ${actKeepersBecados}, al corriente ${Math.max(0, actKeepers - actKeepersDebe - actKeepersSinPagos - actKeepersBecados)}`);
    lineas.push(`- Futsal (meses pagados): Sin pagos: ${actFutsalSinPagos}, 1 mes: ${actFutsal1Mes}, 2 meses: ${actFutsal2Meses}, 3+: ${actFutsal3Mas}`);
    lineas.push(`- Becados 100% sin inscripción: ${actBecados}`);
    lineas.push('');

    // Detalle por sede (solo las que tienen jugadores activos), ordenadas por
    // adeudo de esta temporada (más deuda primero) para resaltar prioridades.
    const conActivos = sedes
        .filter((s) => num(s.Activos) > 0)
        .sort((a, b) => num(b.ActualDebe) - num(a.ActualDebe));

    lineas.push('## Detalle por sede (con jugadores activos)');
    lineas.push('| Sede | Activos | Ant. c/adeudo | Ant. al corriente | Ant. posibles bajas | Actual c/adeudo | Actual al corriente |');
    lineas.push('|---|---|---|---|---|---|---|');
    for (const s of conActivos) {
        lineas.push(
            `| ${s.Sede} | ${num(s.Activos)} | ${num(s.AnteriorDebe)} | ${num(s.AnteriorAlCorriente)} | ${num(s.AnteriorPosiblesBajas)} | ${num(s.ActualDebe)} | ${num(s.ActualAlCorriente)} |`
        );
    }

    return lineas.join('\n');
}

const SYSTEM_PROMPT = `Eres un analista financiero y de operaciones experto de Ángeles Soccer, una academia de futbol con varias sedes/campus. Tu trabajo es analizar los adeudos (cuotas de inscripción y mensualidades) de los jugadores para apoyar la cobranza, la retención y la toma de decisiones de dirección.

Glosario de conceptos que recibirás:
- "Con adeudo": jugadores activos que deben una o más mensualidades ya vencidas y/o la inscripción. En la TEMPORADA ANTERIOR incluye la inscripción; en la TEMPORADA EN CURSO solo cuentan los ya inscritos y solo por mensualidades.
- "Sin inscripción" (solo temporada en curso): jugadores activos que aún no se inscriben. No generan adeudo todavía, pero son riesgo de no continuidad y la prioridad comercial más clara.
- "Al corriente": jugadores activos que están al día (no incluye keepers/porteros ni futsal, que se reportan aparte).
- "Porteros" (keepers): tienen regla propia (una sola inscripción de portero vale para todas las temporadas), así que su adeudo se mide solo por mensualidades y se parte en cuatro grupos que suman el total: "con adeudo" = ya empezaron a pagar y traen al menos un mes ya vencido sin pagar; "sin ninguna mensualidad pagada" = todavía no empiezan a pagar; "becados 100% sin pago" = su beca cubre todo y no hay pago capturado; "al corriente" = ya pagan y están al día.
- "Futsal": cuenta dentro de los adeudos igual que una sede normal, pero se reporta por separado.
- "Becados 100% sin inscripción": beca total; no deben dinero pero no están formalmente inscritos.
- "Posibles bajas": jugadores que no pagaron ni la inscripción ni un solo mes vencido de esa temporada; son los candidatos más probables a darse de baja.
- "Desglose de lo adeudado": cuántos deben la inscripción y cuántos cada mes.
- La temporada anterior ya terminó (cuentan todos sus meses); en la temporada actual solo cuentan los meses ya vencidos.
- "Venta al público" y "Clinics" NO entran en los adeudos.

Reglas:
- Analiza SOLO con los números que recibes; no inventes cifras ni jugadores.
- Sé concreto, cuantitativo y accionable. Prioriza por impacto (sedes/conceptos con más deuda o más riesgo).
- Compara temporada anterior vs. esta temporada e identifica tendencias, riesgos y oportunidades de cobranza y retención.
- Responde en español, en markdown claro (usa encabezados ##, listas, negritas y tablas cuando aporten).`;

export async function POST(request: Request) {
    try {
        const body = await request.json().catch(() => null);
        const sedes: SedeRow[] = Array.isArray(body?.sedes) ? body.sedes : [];
        const actualNombre: string = body?.actual?.temporadaNombre || body?.actual?.nombre || 'Temporada actual';
        const anteriorNombre: string | null = body?.anterior?.temporadaNombre || body?.anterior?.nombre || null;

        if (sedes.length === 0) {
            return Response.json(
                { success: false, message: 'No hay datos de sedes para analizar.' },
                { status: 400 }
            );
        }

        const datos = construirDatos(sedes, actualNombre, anteriorNombre);

        const userPrompt = `Analiza a profundidad los siguientes datos de adeudos por sede de Ángeles Soccer.

${datos}

Entrega un análisis profundo y estructurado que incluya:
1. **Panorama general**: salud financiera de la cobranza esta temporada y comparación con la anterior.
2. **Prioridades de cobranza**: qué sedes y qué conceptos (inscripción o mes) concentran la mayor deuda y deben atenderse primero.
3. **Riesgo de bajas y retención**: lectura de las posibles bajas de la temporada anterior y qué implica para esta temporada.
4. **Sedes destacadas**: mejores y peores desempeños (por adeudo y por proporción respecto a sus activos).
5. **Recomendaciones accionables**: pasos concretos, priorizados, para reducir la cartera vencida y mejorar la inscripción.`;

        // Streaming del lado del servidor para evitar timeouts en peticiones largas;
        // recolectamos el mensaje final y lo devolvemos completo al cliente.
        const stream = anthropic.messages.stream({
            model: MODEL_ANALISIS,
            max_tokens: 16000,
            system: SYSTEM_PROMPT,
            messages: [{ role: 'user', content: userPrompt }],
            thinking: { type: 'adaptive' },
            // 'medium' da un análisis profundo con Opus 5 en un tiempo razonable;
            // subir a 'high' lo hace más exhaustivo pero mucho más lento.
            output_config: { effort: 'medium' },
        } as Anthropic.MessageCreateParamsStreaming);

        const msg = await stream.finalMessage();

        if (msg.stop_reason === 'refusal') {
            return Response.json(
                { success: false, message: 'El modelo no pudo generar el análisis para estos datos.' },
                { status: 422 }
            );
        }

        const analisis = msg.content
            .filter((b): b is Anthropic.TextBlock => b.type === 'text')
            .map((b) => b.text)
            .join('\n')
            .trim();

        if (!analisis) {
            return Response.json(
                { success: false, message: 'El modelo no devolvió contenido de análisis.' },
                { status: 502 }
            );
        }

        return Response.json({ success: true, analisis, modelo: msg.model });
    } catch (e: any) {
        console.error('[adeudos/analisis] error:', e);
        const message =
            e instanceof Anthropic.AuthenticationError
                ? 'La llave de Anthropic (ANTHROPIC_API_KEY) es inválida o falta.'
                : e instanceof Anthropic.RateLimitError
                    ? 'Demasiadas solicitudes al modelo. Intenta de nuevo en unos segundos.'
                    : e?.message || 'Ocurrió un error inesperado al generar el análisis.';
        return Response.json({ success: false, message }, { status: 500 });
    }
}
