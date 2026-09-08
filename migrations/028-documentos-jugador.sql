-- La carpeta de documentos del jugador: actas, CURP, INE del papá, certificados médicos.
--
-- Hasta hoy la ficha solo guardaba la FOTO (migración 019, tblJugadores.Foto). Todo lo
-- demás —el acta de nacimiento que pide la liga, la credencial del papá, el certificado
-- médico— vive en carpetas de WhatsApp y en el escritorio de quien lo recibió. El día
-- que la liga pide el acta de un niño, alguien tiene que acordarse de en qué chat estaba.
--
-- Los archivos van DENTRO de la base y no en el disco del servidor, que es lo que se
-- pidió. Tiene una consecuencia que conviene tener presente: el respaldo de la base pasa
-- a llevárselos, así que el .sql crece con cada documento. Por eso el tope por archivo
-- (10 MB, en @/lib/jugador-documentos) y por eso el borrado es de verdad y no un Status:
-- un blob dado de baja seguiría pesando lo mismo en cada respaldo.
--
-- ── Por qué el contenido va en esta misma tabla ──
--
-- Se podría partir en dos (metadatos aquí, bytes allá) para que listar no arrastre los
-- archivos. No hace falta: InnoDB guarda un LONGBLOB grande fuera de la página del
-- renglón y solo lo lee cuando la consulta lo pide, así que basta con NO poner Contenido
-- en el SELECT de la lista. Es lo que hace /api/jugadores/documentos.
--
-- ── Detalles ──
--
--   LONGBLOB y no MEDIUMBLOB: cuestan lo mismo por renglón (un byte más de longitud) y
--   dejan subir el tope sin volver a tocar el esquema. El límite real lo pone la
--   aplicación, que es donde se puede dar un mensaje decente en vez de un error de MySQL.
--
--   InnoDB aunque el resto del esquema sea MyISAM, igual que las tablas nuevas de las
--   migraciones 010 y 024: MyISAM no tiene transacciones y aquí se borra y se escribe
--   contenido binario.
--
--   El índice es (IdJugador, FechaAlta): la única consulta que existe es "los documentos
--   de este niño, del más nuevo al más viejo", y así sale del índice sin ordenar aparte.
--
--   NO hay llave foránea contra tblJugadores: esa tabla es MyISAM y no las admite. El
--   huérfano se evita comprobando el jugador antes de insertar, en la API.
--
-- Para revertir (se pierden los documentos subidos, no hay copia en disco):
--   DROP TABLE tblJugadoresDocumentos;

CREATE TABLE IF NOT EXISTS tblJugadoresDocumentos (
    IdDocumento INT          NOT NULL AUTO_INCREMENT,
    IdJugador   INT          NOT NULL,
    -- El nombre del archivo tal como venía, que es como la gente lo reconoce.
    Nombre      VARCHAR(255) NOT NULL,
    -- Nota opcional de quien lo sube: 'acta certificada 2024', 'INE de la mamá'.
    Descripcion VARCHAR(255) NOT NULL DEFAULT '',
    -- El tipo ya normalizado por la aplicación, no el que declaró el navegador.
    TipoMime    VARCHAR(120) NOT NULL,
    Bytes       INT UNSIGNED NOT NULL,
    Contenido   LONGBLOB     NOT NULL,
    -- Quién lo subió. NULL si la sesión no traía usuario.
    IdUsuario   INT          NULL,
    FechaAlta   DATETIME     NOT NULL,
    PRIMARY KEY (IdDocumento),
    KEY IX_JugadoresDocumentos_Jugador (IdJugador, FechaAlta)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
