-- La beca de torneo deja de aplicarse sola: ahora se aplica con un botón.
--
-- Hasta hoy, convocar a un becado le rebajaba el precio en el acto (producto de la liga
-- por su BecaCopas o BecaLigas, ver 022) y el sincronizado se lo volvía a rebajar en
-- cada visita a la pantalla. La beca de la ficha del jugador es una condición general
-- del club, no una decisión torneo por torneo: hay copas en las que sí se le respeta y
-- otras en las que no, y con el automatismo no había manera de cobrarle completo sin
-- pelearse con el sincronizado en cada carga.
--
-- Esta tabla es la memoria de esa decisión, renglón por renglón del detalle: si el
-- jugador aparece aquí, su convocatoria cobra CON beca; si no aparece, cobra el precio
-- de lista aunque el jugador tenga beca en su ficha.
--
-- Va en tabla aparte, y no como columna de tblDetalleConvocatorias, por lo mismo que la
-- 010: esa tabla la comparte el sistema de escritorio y agregarle columnas puede romper
-- sus inserciones. InnoDB porque el cambio de color de una convocatoria arrastra estas
-- filas dentro de una transacción, igual que las de precios manuales.
--
-- ── El sembrado inicial, que es lo que no se puede saltar ──
--
-- Los convocados becados de hoy YA traen su precio rebajado. Si la tabla naciera vacía,
-- la primera visita a la pantalla les subiría el precio al de lista sin que nadie lo
-- pidiera y los estados de cuenta cambiarían solos. Por eso se siembra la marca de
-- todos los convocados cuyo precio de hoy es exactamente el de lista con su beca: para
-- ellos nada cambia, y de ahí en adelante la beca se decide con el botón.
--
-- Se comparan con tolerancia de medio centavo porque Precio es double.
--
-- Quedan FUERA del sembrado a propósito:
--   - Los que no están convocados: su precio va en 0 por convención y la decisión se
--     tomará al convocarlos.
--   - Los que cobran algo distinto al precio con beca (un ajuste manual de la 010, o un
--     precio viejo de una temporada anterior): ahí no se sabe qué se quiso cobrar, y la
--     marca de precio manual ya los protege del sincronizado.
--
-- Idempotente: INSERT IGNORE sobre la llave primaria.
--
-- Para revertir (la beca vuelve a aplicarse sola, como antes):
--   DROP TABLE tblConvocatoriasBecas;

CREATE TABLE IF NOT EXISTS tblConvocatoriasBecas (
    IdJugador   INT          NOT NULL,
    IdTemporada INT          NOT NULL,
    IdLiga      INT          NOT NULL,
    Categoria   VARCHAR(45)  NOT NULL COLLATE utf8mb4_0900_ai_ci,
    Color       VARCHAR(100) NOT NULL DEFAULT '' COLLATE utf8mb4_0900_ai_ci,
    FechaAct    DATETIME     NULL,
    PRIMARY KEY (IdJugador, IdTemporada, IdLiga, Categoria, Color)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT IGNORE INTO tblConvocatoriasBecas
    (IdJugador, IdTemporada, IdLiga, Categoria, Color, FechaAct)
SELECT D.IdJugador, D.IdTemporada, D.IdLiga, D.Categoria, D.Color, NOW()
  FROM tblDetalleConvocatorias D
 INNER JOIN tblJugadores J ON J.IdJugador = D.IdJugador
 INNER JOIN tblLigas L ON L.IdLiga = D.IdLiga
 INNER JOIN (
     SELECT IdLiga, MAX(Precio) AS Precio
       FROM tblProductos
      WHERE IdTipoProducto IN (3, 4)
      GROUP BY IdLiga
 ) PR ON PR.IdLiga = D.IdLiga
 WHERE D.EsConvocado = 1
   AND LEAST(GREATEST(COALESCE(IF(L.IdTipoLiga = 2, J.BecaCopas, J.BecaLigas), 0), 0), 100) > 0
   AND ABS(
           COALESCE(D.Precio, 0)
           - ROUND(PR.Precio * (1 - LEAST(GREATEST(COALESCE(IF(L.IdTipoLiga = 2, J.BecaCopas, J.BecaLigas), 0), 0), 100) / 100), 2)
       ) <= 0.005;
