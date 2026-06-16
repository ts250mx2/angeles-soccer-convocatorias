import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "Preregistro de Jugadores — Ángeles Soccer",
  description: "Formulario de preregistro de jugadores",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function PreregistroLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="min-h-screen bg-slate-100">{children}</div>;
}
