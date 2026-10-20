import type { Metadata } from "next";
import { Inter, Geist_Mono } from "next/font/google";
import "./globals.css";
import logo2 from "@/app/logo/logo2.png";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Faculty Attendance and Time Log System",
  description: "Ramon Magsaysay Memorial Colleges — Faculty Attendance and Time Log System",
  icons: {
    icon: logo2.src,
    shortcut: logo2.src,
    apple: logo2.src,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${geistMono.variable}`}>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
