import type { Metadata } from "next";
import { Outfit, Geist_Mono } from "next/font/google";
import { Web3Provider } from "@/providers/Web3Provider";
import { UserProvider } from "@/contexts/UserContext";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/ThemeProvider";
import { ThemeToggle } from "@/components/ThemeToggle";
import "./globals.css";

const outfit = Outfit({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Vehicle Lifecycle Management",
  description: "Secure, transparent, and decentralized vehicle lifecycle management.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
      <html
        lang="en"
        className={`${outfit.variable} ${geistMono.variable} h-full antialiased font-sans`}
        suppressHydrationWarning
      >
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <Web3Provider>
            <UserProvider>
              <TooltipProvider>
                {children}
              </TooltipProvider>
              <Toaster position="top-right" richColors />
            </UserProvider>
          </Web3Provider>
        </ThemeProvider>
      </body>
    </html>
  );
}
