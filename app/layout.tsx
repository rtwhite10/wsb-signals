import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "WSB Trading Signals",
  description: "Live trading signals from WallStreetBets",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-gray-100 min-h-screen font-sans">
        {children}
      </body>
    </html>
  );
}
