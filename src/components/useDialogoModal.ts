"use client";

import { useEffect, useRef } from "react";

/**
 * Teclado y foco para un diálogo modal.
 *
 * Los modales de la aplicación son divs condicionales, no elementos <dialog>, así que
 * el navegador no mueve el foco al abrirlos ni los cierra con Escape. Sin eso, quien
 * abre un modal desde un control que quedó tapado por el overlay sigue con el foco
 * detrás: Tab recorre lo que ya no se ve y Escape no responde.
 *
 * Devuelve la ref que se pone en el contenedor del diálogo. El contenedor necesita
 * `tabIndex={-1}` para poder recibir el foco.
 *
 * Escape cierra SOLO el diálogo de encima: la pila de módulo lleva el orden de apertura
 * porque en esta pantalla se apilan hasta cuatro (torneo → categorías → deudores → pagos).
 */

const pila: symbol[] = [];

export function useDialogoModal<T extends HTMLElement>(
  abierto: boolean,
  alCerrar: () => void,
) {
  const refDialogo = useRef<T>(null);
  // El handler se lee en el momento del evento, así el listener no se vuelve a
  // registrar cada vez que el componente rerenderiza con una lambda nueva.
  const alCerrarRef = useRef(alCerrar);

  useEffect(() => {
    alCerrarRef.current = alCerrar;
  }, [alCerrar]);

  useEffect(() => {
    if (!abierto) return;

    const id = Symbol("dialogo");
    pila.push(id);

    // A dónde vuelve el foco al cerrar: el control que abrió el diálogo.
    const previo = document.activeElement as HTMLElement | null;
    refDialogo.current?.focus({ preventScroll: true });

    const alTeclear = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Con varios diálogos abiertos, Escape solo cierra el de encima.
      if (pila[pila.length - 1] !== id) return;
      e.stopPropagation();
      alCerrarRef.current();
    };
    document.addEventListener("keydown", alTeclear);

    return () => {
      document.removeEventListener("keydown", alTeclear);
      const i = pila.lastIndexOf(id);
      if (i >= 0) pila.splice(i, 1);
      // El control de origen pudo desaparecer con el propio cierre; si sigue en el
      // documento recupera el foco, y si no, no pasa nada.
      if (previo && document.contains(previo)) previo.focus({ preventScroll: true });
    };
  }, [abierto]);

  return refDialogo;
}
