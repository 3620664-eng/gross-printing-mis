import type { Metadata } from "next";
import "./globals.css";
import "./ui-foundation.css";
import "./quote-production-experience.css";
import "./email-center.css";
import "./ai-assistant.css";
import "./customer-self-service.css";
import "./portal-requests.css";
import "./workspace-refinements.css";
// Loaded last so the design tokens it defines are the ones that apply.
import "./design-system.css";

export const metadata: Metadata = {
  title: {
    default: "Gross Printing | Professional Print Shop",
    template: "%s | Gross Printing"
  },
  description:
    "High-quality business cards, flyers, booklets, banners, and commercial printing. Fast turnaround and expert support."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
