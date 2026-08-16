-- Índice de tblPagos por jugador.
--
-- tblPagos (≈85 mil filas) solo tenía la PRIMARY KEY sobre IdPago, así que TODA
-- consulta "los pagos de estos jugadores" barría la tabla completa. Se notaba al abrir
-- la lista de jugadores de una convocatoria, que ahora pregunta inscripción y adeudo:
-- 2.6 s con el barrido contra 0.16 s con el índice (misma consulta, mismos datos).
--
-- Es aditivo: no cambia ni un dato, solo agrega una vía de acceso. Aprovecha también a
-- cualquier otra pantalla que pida los pagos de un jugador (historial, adeudos, kardex).
--
-- OJO: no acelera las consultas de adeudo que recorren la temporada COMPLETA (Adeudos
-- por Sede, Pagos de Copas), porque esas agregan sobre todos los pagos y el barrido es
-- inevitable. Ahí el índice ni ayuda ni estorba.
--
-- Para revertir:
--   ALTER TABLE tblPagos DROP INDEX idx_pagos_jugador;

ALTER TABLE tblPagos ADD INDEX idx_pagos_jugador (IdJugador);
