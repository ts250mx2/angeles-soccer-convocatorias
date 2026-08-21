import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "Preinscripción de Incorporación — Ángeles Soccer",
  description: "Formulario para sumarse a un equipo de Ángeles Soccer",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function PreincorporacionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="min-h-screen bg-slate-100">{children}</div>;
}
