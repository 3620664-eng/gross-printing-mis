import Link from "next/link";

export function WebsiteFooter() {
  return (
    <footer className="gp-footer">
      <div className="gp-footer-inner">
        <div className="gp-footer-brand">
          <Link href="/" className="gp-logo" style={{ color: "white" }}>
            <span className="gp-logo-mark">GP</span>
            Gross Printing
          </Link>
          <p>
            Commercial printing, customer file intake, and order tracking from one Gross Printing account.
          </p>
        </div>

        <div>
          <h4>Services</h4>
          <Link href="/services">Business Cards</Link>
          <Link href="/services">Flyers & Brochures</Link>
          <Link href="/services">Booklets & Books</Link>
          <Link href="/services">Signs & Banners</Link>
          <Link href="/services">Labels & Stickers</Link>
          <Link href="/services">Envelopes & Invitations</Link>
        </div>

        <div>
          <h4>Quick Links</h4>
          <Link href="/quote">Request a Quote</Link>
          <Link href="/portfolio">Portfolio</Link>
          <Link href="/track">Track My Order</Link>
          <Link href="/portal">Customer Portal</Link>
          <Link href="/contact">Contact Us</Link>
          <Link href="/login">Staff Login</Link>
        </div>

        <div>
          <h4>Contact</h4>
          <a href="mailto:jobs@grossprinting.com">jobs@grossprinting.com</a>
          <Link href="/quote">Request a Quote</Link>
        </div>
      </div>

      <div className="gp-footer-bottom">
        <span>© {new Date().getFullYear()} Gross Printing. All rights reserved.</span>
        <span>
          <Link href="/">Home</Link>
          {" · "}
          <Link href="/quote">Quote</Link>
          {" · "}
          <Link href="/portal">Portal</Link>
        </span>
      </div>
    </footer>
  );
}
