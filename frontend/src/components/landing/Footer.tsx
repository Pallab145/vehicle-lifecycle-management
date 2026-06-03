import { Badge } from '@/components/ui/badge';

export function Footer() {
  return (
    <footer className="border-t border-border/40 bg-muted/20 backdrop-blur-md">
      <div className="mx-auto max-w-6xl px-6 py-10 flex flex-col sm:flex-row items-center justify-between gap-6">
        <p className="text-sm text-muted-foreground font-medium">
          © {new Date().getFullYear()} Vehicle Lifecycle Management — Final Year Project
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Badge variant="outline" className="text-xs bg-background/50 border-primary/20 text-primary/80">Polygon Amoy Testnet</Badge>
          <Badge variant="outline" className="text-xs bg-background/50">Next.js 16</Badge>
          <Badge variant="outline" className="text-xs bg-background/50">Solidity</Badge>
        </div>
      </div>
    </footer>
  );
}
