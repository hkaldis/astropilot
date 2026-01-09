import starboardLogo from "@assets/image_1767820747888.png";

export function Footer() {
  const currentYear = new Date().getFullYear();
  
  return (
    <footer className="border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 py-4 px-4 sm:px-6 mt-auto">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 max-w-7xl mx-auto text-sm text-muted-foreground">
        <a 
          href="https://starboardstudio.com" 
          target="_blank" 
          rel="noopener noreferrer"
          className="flex items-center gap-2 hover:opacity-80 transition-opacity"
          data-testid="link-starboard-studio"
        >
          <img src={starboardLogo} alt="Starboard Studio" className="w-5 h-5 object-contain" />
          <span className="font-medium text-foreground">Starboard Studio</span>
        </a>
        <div className="flex items-center gap-4">
          <span>&copy; {currentYear} All rights reserved</span>
          <a 
            href="/privacy" 
            className="hover:text-foreground transition-colors"
            data-testid="link-footer-privacy"
          >
            Privacy
          </a>
          <a 
            href="/terms" 
            className="hover:text-foreground transition-colors"
            data-testid="link-footer-terms"
          >
            Terms
          </a>
        </div>
      </div>
    </footer>
  );
}
