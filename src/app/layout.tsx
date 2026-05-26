import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "next-themes";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "SmartCapture Pro",
  applicationCategory: "DeveloperApplication",
  operatingSystem: "Chrome",
  description:
    "AI-powered full-page screenshot Chrome extension with smart annotations, OCR text extraction, and visual diff comparison. All processing happens locally in your browser.",
  url: "https://smartcapture.pro",
  offers: {
    "@type": "AggregateOffer",
    lowPrice: "0",
    highPrice: "0",
    priceCurrency: "USD",
    offerCount: "1",
    offers: [
      {
        "@type": "Offer",
        name: "Free",
        price: "0",
        priceCurrency: "USD",
        availability: "https://schema.org/InStock",
      },
    ],
  },
  aggregateRating: {
    "@type": "AggregateRating",
    ratingValue: "4.2",
    ratingCount: "12",
    bestRating: "5",
    worstRating: "1",
  },
  featureList: [
    "Full-page screenshot capture",
    "Smart annotation tools",
    "OCR text extraction (DOM-based)",
    "Visual diff comparison",
    "Multi-format export (PNG, JPEG)",
    "100% local processing",
    "No data collection",
  ],
};

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "Is SmartCapture Pro really free?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes! The free tier includes unlimited full-page captures, PNG/JPEG export, basic annotation tools (rectangle, arrow, text), and 10 OCR extractions per day. No sign-up required.",
      },
    },
    {
      "@type": "Question",
      name: "Does my data ever leave my browser?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Never. All screenshot capture, annotation, OCR, and image processing happens locally in your browser using WebAssembly. No data is sent to any server. Your screenshots stay completely private.",
      },
    },
    {
      "@type": "Question",
      name: "What's the difference between Free and Pro?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Pro will unlock PDF export without watermarks, all 6 annotation tools with custom colors, unlimited OCR extractions, and priority support. It's currently in development — stay tuned!",
      },
    },
    {
      "@type": "Question",
      name: "Does it work on single-page applications?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes! Our capture engine is specifically designed for modern SPAs. It handles client-side routing, lazy-loaded images, infinite scroll, and dynamic content loading with high reliability.",
      },
    },
    {
      "@type": "Question",
      name: "Can I capture specific areas of a page?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "SmartCapture Pro currently supports two capture modes: full-page (entire scrollable content) and visible area (current viewport). Area selection capture is on our roadmap.",
      },
    },
    {
      "@type": "Question",
      name: "How does the visual diff feature work?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "The visual diff uses pixel-level comparison to detect changes between two screenshots. It highlights additions (green), removals (red), and modifications (yellow) with adjustable sensitivity. Perfect for tracking competitor changes.",
      },
    },
  ],
};

export const metadata: Metadata = {
  title: "SmartCapture Pro — AI-Powered Full-Page Screenshot Chrome Extension",
  description:
    "Capture, annotate & analyze any web page. AI-powered full-page screenshot tool with smart annotations, OCR, and visual diff. All processing happens locally in your browser.",
  keywords: [
    "SmartCapture Pro",
    "screenshot extension",
    "Chrome extension",
    "full-page screenshot",
    "OCR",
    "visual diff",
    "annotate screenshots",
    "AI-powered screenshot",
    "screenshot tool",
    "web capture",
    "page capture",
    "screenshot annotation",
    "text extraction from image",
    "screenshot comparison",
  ],
  authors: [{ name: "SmartCapture Pro Team", url: "https://smartcapture.pro" }],
  creator: "SmartCapture Pro Team",
  publisher: "SmartCapture Pro",
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
  openGraph: {
    title: "SmartCapture Pro — AI-Powered Full-Page Screenshot Chrome Extension",
    description:
      "Capture, annotate & analyze any web page with AI-powered tools. Full-page capture, smart annotations, OCR, and visual diff — all locally in your browser.",
    type: "website",
    locale: "en_US",
    siteName: "SmartCapture Pro",
  },
  twitter: {
    card: "summary_large_image",
    title: "SmartCapture Pro",
    description:
      "AI-powered full-page screenshot Chrome extension with smart annotations, OCR, and visual diff. 100% private.",
    creator: "@smartcapturepro",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
