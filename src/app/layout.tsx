import type { Metadata } from "next";
import "./globals.css";
import "./ui-foundation.css";
import "./quote-production-experience.css";
import "./email-center.css";
import "./ai-assistant.css";
import "./customer-self-service.css";
import "./portal-requests.css";
import "./auth-access-v063.css";
import "./fast-navigation-v064.css";
import "./owner-operations-v065.css";
import "./multi-item-orders-v066.css";
import "./v0674-b2b-smart-quotes.css";
import "./mis-comfort-v068.css";
import "./clean-workspace-v0720.css";
import "./option-one-workspace-v0736.css";

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
