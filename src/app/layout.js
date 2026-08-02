import "./globals.css";

export const metadata = {
  title: "Atlas Core",
  description: "Comprender antes de decidir.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
