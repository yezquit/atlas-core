import "./globals.css";

export const metadata = {
  title: "Atlas · Inteligencia Deportiva by YEZQUIT",
  description: "Atlas Personal: comprender antes de decidir.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
