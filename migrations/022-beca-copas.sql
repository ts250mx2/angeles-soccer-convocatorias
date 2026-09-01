-- Separa la beca de copas de la beca de ligas.
--
-- Hasta hoy habia UNA sola beca para los dos torneos (tblJugadores.BecaLigas) y con ella
-- se cobraba tanto una copa como una liga. Son cobros distintos —una copa es un evento
-- suelto y una liga es un torneo largo, con precios que no se parecen— y el club los
-- beca por separado, asi que se parten en dos: BecaCopas para las copas, BecaLigas para
-- las ligas. Cual de las dos manda lo decide tblLigas.IdTipoLiga (1 liga, 2 copa).
--
-- La columna BecaCopas NO es nueva: ya existia en la base, declarada double y en cero en
-- los 4,463 jugadores. Nadie la escribia ni la leia. Se aprovecha en vez de agregar una
-- segunda, igual que se hizo con Foto en la 019.
--
-- Dos cambios:
--
--   1. Default 0, para igualarla a BecaLigas. Sin default, un alta que no mencione la
--      columna la deja NULL, y aunque todo el codigo la lee con COALESCE, tener media
--      tabla en NULL y media en 0 solo invita a que alguna consulta futura se equivoque.
--
--   2. Se COPIA BecaLigas a BecaCopas. Este es el paso que no se puede saltar: los 116
--      becados de torneos tienen hoy su descuento en BecaLigas y ese descuento ya se les
--      venia aplicando en las copas. Si BecaCopas se quedara en cero, el dia que la
--      aplicacion empiece a usarla esos becados perderian la beca en sus copas sin que
--      nadie lo pidiera —17 de ellos ya estan convocados a una copa vigente— y el precio
--      les subiria solo. Copiando el valor, el dia del cambio nadie nota nada y a partir
--      de ahi las dos becas se editan por separado desde la ficha del jugador.
--
-- Idempotente: la condicion final evita reescribir lo que ya quedo igual.
--
-- Para revertir (la beca de copas vuelve a ser la de ligas, que es como estaba):
--   ALTER TABLE tblJugadores MODIFY BecaCopas DOUBLE NULL DEFAULT NULL;

ALTER TABLE tblJugadores MODIFY BecaCopas DOUBLE NULL DEFAULT 0;

UPDATE tblJugadores
   SET BecaCopas = COALESCE(BecaLigas, 0)
 WHERE COALESCE(BecaCopas, 0) <> COALESCE(BecaLigas, 0);
