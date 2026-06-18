"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { ThemeToggle } from "./theme-toggle";
import { motion } from "framer-motion";


export function Header() {
  const pathname = usePathname();

  // Hide header on login page
  if (pathname === "/login") {
    return null;
  }

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/60 backdrop-blur-md transition-all duration-300">
      <div className="container mx-auto flex h-16 max-w-screen-xl items-center justify-between px-6">
        <div className="flex items-center space-x-8">
          <Link href="/" className="flex items-center space-x-2.5 group">
            <div className="h-8 w-8 rounded-xl bg-gradient-to-tr from-primary to-pink-500 flex items-center justify-center shadow-lg shadow-primary/20 group-hover:scale-105 transition-transform duration-300">
              <span className="text-white font-extrabold text-sm tracking-tighter">NB</span>
            </div>
            <span className="font-heading font-black tracking-tight text-lg bg-gradient-to-r from-foreground to-foreground/80 bg-clip-text text-transparent group-hover:text-primary transition-colors">
              Naukri<span className="text-primary font-bold">Bot</span>
            </span>
          </Link>
          <nav className="flex items-center space-x-6 text-sm font-semibold">
            <Link 
              href="/" 
              className={`relative py-1.5 transition-colors hover:text-foreground ${pathname === '/' ? 'text-primary' : 'text-muted-foreground'}`}
            >
              Dashboard
              {pathname === '/' && (
                <motion.span 
                  layoutId="activeNav" 
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-primary to-pink-500 rounded-full" 
                  transition={{ type: "spring", stiffness: 380, damping: 30 }}
                />
              )}
            </Link>
            <Link 
              href="/settings" 
              className={`relative py-1.5 transition-colors hover:text-foreground ${pathname === '/settings' ? 'text-primary' : 'text-muted-foreground'}`}
            >
              Settings
              {pathname === '/settings' && (
                <motion.span 
                  layoutId="activeNav" 
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-primary to-pink-500 rounded-full" 
                  transition={{ type: "spring", stiffness: 380, damping: 30 }}
                />
              )}
            </Link>
          </nav>
        </div>
        <div className="flex items-center justify-end space-x-4">
          <ThemeToggle />
        </div>
      </div>
    </header>
  );

}
