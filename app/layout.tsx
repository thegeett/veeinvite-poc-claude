import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VeeInvite — AI Wedding Hero Generator",
  description:
    "Generate a premium wedding website hero section using OpenAI or Anthropic.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
