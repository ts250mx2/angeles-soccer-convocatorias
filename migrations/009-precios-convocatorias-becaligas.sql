-- Pone el precio de los convocados de la temporada activa al del producto de su liga o
-- copa, con BecaLigas aplicada.
--
-- Hasta ahora el precio solo se escribia al convocar, asi que los renglones capturados
-- antes conservan la tarifa vieja y sin descuento. El saldo salia mal sin que nada lo
-- delatara: se le cobraba de mas a un becado, y con beca del 100% se le cobraba todo a
-- quien no debia nada.
--
-- Solo toca a los convocados. Quien no lo esta va en 0 por convencion y ahi se queda.
-- Idempotente: la condicion final evita reescribir lo que ya esta bien.

UPDATE tblDetalleConvocatorias D
INNER JOIN tblTemporadas T ON T.IdTemporada = D.IdTemporada AND T.EsActiva = 1
INNER JOIN tblJugadores J  ON J.IdJugador   = D.IdJugador
INNER JOIN (
    SELECT IdLiga, MAX(Precio) AS Precio
    FROM tblProductos
    WHERE IdTipoProducto IN (3, 4)
    GROUP BY IdLiga
) PR ON PR.IdLiga = D.IdLiga
SET D.Precio = ROUND(
        PR.Precio * (1 - LEAST(GREATEST(COALESCE(J.BecaLigas, 0), 0), 100) / 100), 2)
WHERE D.EsConvocado = 1
  AND D.Precio <> ROUND(
        PR.Precio * (1 - LEAST(GREATEST(COALESCE(J.BecaLigas, 0), 0), 100) / 100), 2);
