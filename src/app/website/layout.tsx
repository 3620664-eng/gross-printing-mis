import type { Metadata } from "next";
import "./website.css";
import { WebsiteHeader } from "@/components/website/WebsiteHeader";
import { WebsiteFooter } from "@/components/website/WebsiteFooter";

export const metadata: Metadata = {
  title: {
    default: "Gross Printing | Professional Print Shop",
    template: "%s | Gross Printing"
  },
  description:
    "High-quality business cards, flyers, booklets, banners, and commercial printing. Fast turnaround, competitive pricing, and expert support."
};

export default function WebsiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="gp-website">
      <WebsiteHeader />
      <main className="gp-main">{children}</main>
      <WebsiteFooter />
    </div>
  );
}
