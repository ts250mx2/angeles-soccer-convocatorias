import { TIPO_COPA } from '@/lib/copas-ligas';

/**
 * Cuál de las dos becas de torneo le toca a un cobro: la de copas o la de ligas.
 *
 * Son dos descuentos distintos de la ficha del jugador —tblJugadores.BecaCopas y
 * tblJugadores.BecaLigas— y un becado puede traer uno, el otro o los dos. Lo que decide
 * cuál se aplica es el TORNEO, no el jugador: una copa se cobra con BecaCopas y una liga
 * con BecaLigas. Ver migrations/022-beca-copas.sql.
 *
 * El cobro de convocatorias vive repartido en cuatro consultas (el precio al convocar,
 * el sincronizado de precios, el de pagados y la lista de la pantalla) y las cuatro
 * tienen que elegir IGUAL: si una tomara la beca equivocada, el precio guardado y el que
 * la pantalla dice que debería ser no coincidirían, y el sincronizado los estaría
 * peleando en cada visita. Por eso la elección se escribe una sola vez, aquí.
 *
 * Aquí se decide CUÁL beca, no SI se aplica: eso se decide convocatoria por convocatoria
 * con el botón de la pantalla, y vive en @/lib/convocatorias-becas. Las mismas cuatro
 * consultas usan el factor de allá, que envuelve al de aquí.
 */

/**
 * Expresión SQL con el PORCENTAJE de beca que aplica, ya acotado a 0-100.
 *
 * `jugador` y `liga` son los alias de tblJugadores y tblLigas en la consulta, así que la
 * consulta tiene que traer tblLigas: es de ahí de donde sale si el torneo es copa o liga.
 */
export const sqlBecaDeTorneo = (jugador: string, liga: string): string =>
    `LEAST(GREATEST(COALESCE(IF(${liga}.IdTipoLiga = ${TIPO_COPA}, ${jugador}.BecaCopas, ${jugador}.BecaLigas), 0), 0), 100)`;

/** Lo que hay que multiplicar al precio de lista para dejarlo con la beca aplicada. */
export const sqlFactorBecaDeTorneo = (jugador: string, liga: string): string =>
    `(1 - ${sqlBecaDeTorneo(jugador, liga)} / 100)`;
