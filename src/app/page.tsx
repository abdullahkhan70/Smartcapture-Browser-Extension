'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, useInView, AnimatePresence } from 'framer-motion';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@/components/ui/tooltip';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import {
  Camera,
  PenTool,
  FileText,
  GitCompare,
  Download,
  Shield,
  MousePointerClick,
  Edit3,
  Share2,
  Check,
  ChevronRight,
  Sparkles,
  Layers,
  ScanText,
  History,
  Settings,
  Star,
  Zap,
  ArrowRight,
  Menu,
  X,
  ImageIcon,
  Crop,
  Maximize2,
  Users,
  Quote,
  ChevronLeft,
  ChevronUp,
  Cookie,
  Mail,
  Calendar,
  Tag,
  MessageSquare,
  Send,
  Sun,
  Moon,
  Play,
  Monitor,
  Search,
  Lock,
  BadgeCheck,
  Copy,
  Megaphone,
  MessageCircle,
  Clock,
  ExternalLink,
  RotateCcw,
  Gift,
  ShieldCheck,
  Plus,
  Globe,
  HelpCircle,
  Scroll,
  DollarSign,
  ThumbsUp,
  ThumbsDown,
  Wand2,
  BookOpen,
  ArrowUpRight,
  TrendingUp,
  Github,
  Twitter,
} from 'lucide-react';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  type CarouselApi,
} from '@/components/ui/carousel';

/* ─── Animation helpers ─── */
const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.04, duration: 0.35, ease: 'easeOut' },
  }),
};

const stagger = {
  visible: { transition: { staggerChildren: 0.05 } },
};

function AnimatedSection({
  children,
  className = '',
  id,
}: {
  children: React.ReactNode;
  className?: string;
  id?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-40px' });
  return (
    <motion.section
      ref={ref}
      id={id}
      initial="hidden"
      animate={isInView ? 'visible' : 'hidden'}
      variants={stagger}
      className={className}
    >
      {children}
    </motion.section>
  );
}

/* ─── Nav data ─── */
const navLinks = [
  { label: 'Features', href: '#features', sectionId: 'features' },
  { label: 'How It Works', href: '#how-it-works', sectionId: 'how-it-works' },
  { label: 'Pricing', href: '#pricing', sectionId: 'pricing' },
  { label: 'Download', href: '#download', sectionId: 'download' },
];

/* ─── Mini TOC sections data ─── */
const tocSections = [
  { id: 'features', label: 'Features' },
  { id: 'how-it-works', label: 'How It Works' },
  { id: 'pricing', label: 'Pricing' },
  { id: 'testimonials', label: 'Testimonials' },
  { id: 'faq', label: 'FAQ' },
  { id: 'changelog', label: 'Changelog' },
  { id: 'contact', label: 'Contact' },
  { id: 'download', label: 'Download' },
];

/* ─── Features data ─── */
const features = [
  {
    icon: Camera,
    title: 'Full-Page Capture',
    description:
      'Pixel-perfect screenshots of entire web pages including lazy-loaded content and infinite scroll sections.',
  },
  {
    icon: PenTool,
    title: 'Smart Annotations',
    description:
      'Draw, markup, and annotate screenshots with rectangle, arrow, text, highlight, and blur tools.',
  },
  {
    icon: FileText,
    title: 'OCR Text Extraction',
    description:
      'Extract text from any web page using DOM-based analysis. Fast, accurate, and runs entirely in your browser with zero server dependency.',
  },
  {
    icon: GitCompare,
    title: 'Visual Diff',
    description:
      'Compare screenshots side-by-side with pixel-level change detection. Track website changes over time.',
  },
  {
    icon: Download,
    title: 'Multi-Format Export',
    description:
      'Export as PNG or JPEG with custom quality settings. One-click download to your device.',
  },
  {
    icon: Shield,
    title: 'Local & Private',
    description:
      'All processing happens in your browser. No server, no cloud, no data collection. Your screenshots stay yours.',
  },
];

/* ─── How it works steps ─── */
const steps = [
  {
    icon: MousePointerClick,
    title: 'Click Capture',
    description: 'Click the extension icon and choose your capture mode.',
  },
  {
    icon: Edit3,
    title: 'Annotate & Edit',
    description: 'Mark up your screenshot with powerful annotation tools.',
  },
  {
    icon: Share2,
    title: 'Export & Share',
    description: 'Download in your preferred format or extract text with OCR.',
  },
];

/* ─── Pricing tiers ─── */
const tiers = [
  {
    name: 'Free',
    price: '$0',
    period: '',
    highlight: false,
    features: [
      { text: 'Full-Page Capture', included: true, detail: 'Unlimited' },
      { text: 'Export Formats', included: true, detail: 'PNG, JPEG' },
      { text: 'Annotation Tools', included: true, detail: 'Rectangle, Arrow, Text' },
      { text: 'OCR', included: true, detail: '10 per day' },
      { text: 'Gallery Storage', included: true, detail: 'Up to browser limit' },
      { text: 'PDF Export', included: false },
      { text: 'All Annotation Tools', included: false },
      { text: 'Unlimited OCR', included: false },
      { text: 'Priority Support', included: false },
    ],
  },
  {
    name: 'Pro',
    price: '',
    period: 'coming soon',
    highlight: true,
    features: [
      { text: 'Full-Page Capture', included: true, detail: 'Unlimited' },
      { text: 'Export Formats', included: true, detail: 'PNG, JPEG, PDF (no watermark)' },
      { text: 'Annotation Tools', included: true, detail: 'All 6+ Tools + Custom Colors' },
      { text: 'OCR', included: true, detail: 'Unlimited' },
      { text: 'Gallery Storage', included: true, detail: 'Up to browser limit' },
      { text: 'PDF Export', included: true, detail: 'No watermark' },
      { text: 'All Annotation Tools', included: true },
      { text: 'Unlimited OCR', included: true },
      { text: 'Priority Support', included: true },
    ],
  },
];

/* ─── Testimonials data ─── */
const testimonials = [
  {
    name: 'Omar F.',
    role: 'Frontend Developer',
    avatar: 'OF',
    avatarBg: 'from-cyan-500 to-teal-600',
    rating: 3,
    text: 'Full-page capture works well on most sites, but it struggles on some SPAs with infinite scroll. The visible area capture is reliable though. Looking forward to area selection — that\'s a must-have for me.',
  },
  {
    name: 'Sara M.',
    role: 'QA Engineer',
    avatar: 'SM',
    avatarBg: 'from-emerald-500 to-green-600',
    rating: 4,
    text: 'Visual diff caught a CSS regression I would have missed. The slider view is handy for spotting small pixel shifts. Only giving 4 because the 10/day limit on diffs is tight for my workflow.',
  },
  {
    name: 'David K.',
    role: 'Technical Writer',
    avatar: 'DK',
    avatarBg: 'from-amber-500 to-orange-600',
    rating: 3,
    text: 'OCR is DOM-based, so it works on text content but can\'t read text from images — that was disappointing. For regular web pages though, extraction is fast and accurate. PNG export works fine.',
  },
  {
    name: 'Amna R.',
    role: 'CS Student',
    avatar: 'AR',
    avatarBg: 'from-violet-500 to-purple-600',
    rating: 5,
    text: 'Exactly what I needed for research — full-page captures and OCR to pull text out. The fact that nothing leaves my browser matters a lot to me. Works well for what it does.',
  },
  {
    name: 'Alex P.',
    role: 'Indie Developer',
    avatar: 'AP',
    avatarBg: 'from-rose-500 to-pink-600',
    rating: 4,
    text: 'Visual diff is the standout. I screenshot my app before and after deploys and compare them — the overlay mode highlights exactly what changed. Lightweight, doesn\'t slow down Chrome.',
  },
  {
    name: 'Riya S.',
    role: 'Content Creator',
    avatar: 'RS',
    avatarBg: 'from-sky-500 to-blue-600',
    rating: 3,
    text: 'Good for basic full-page captures and JPEG export is quick. But without area selection or annotation tools beyond the basics, it\'s limited for content work. Has potential though — I\'ll keep an eye on updates.',
  },
];

/* ─── FAQ data ─── */
const faqs = [
  {
    q: 'Is SmartCapture Pro really free?',
    a: 'Yes! The free tier includes unlimited full-page captures, PNG/JPEG export, basic annotation tools (rectangle, arrow, text), 10 OCR extractions per day, and 10 visual diff comparisons per day. No sign-up required.',
  },
  {
    q: 'Does my data ever leave my browser?',
    a: 'Never. All screenshot capture, annotation, OCR, and image processing happens locally in your browser. No data is sent to any server. Your screenshots stay completely private.',
  },
  {
    q: "What's the difference between Free and Pro?",
    a: "Pro will unlock PDF export without watermarks, all 6 annotation tools with custom colors, unlimited OCR extractions, and priority support. It's currently in development — stay tuned!",
  },
  {
    q: 'Does it work on single-page applications (React, Vue, etc.)?',
    a: 'Yes! Our capture engine is specifically designed for modern SPAs. It handles client-side routing, lazy-loaded images, infinite scroll, and dynamic content loading with high reliability.',
  },
  {
    q: 'Can I capture specific areas of a page?',
    a: 'SmartCapture Pro currently supports two capture modes: full-page (entire scrollable content) and visible area (current viewport). Area selection capture is on our roadmap for a future update.',
  },
  {
    q: 'How does the visual diff feature work?',
    a: 'The visual diff uses pixel-level comparison (pixelmatch) to detect changes between two screenshots. It offers three view modes — Side by Side, Overlay, and Slider — so you can compare before and after screenshots with pixel-level precision. You get 10 visual diff comparisons per day on the free tier.',
  },
  {
    q: 'Can I use SmartCapture Pro for team collaboration?',
    a: 'Currently, you can export annotated screenshots as PNG or JPEG and share them with your team. Team features, shared libraries, and collaboration tools are on our roadmap for the Pro version.',
  },
  {
    q: 'What browsers and platforms are supported?',
    a: 'SmartCapture Pro currently runs on Chromium-based browsers (Chrome, Edge, Brave, Opera) as a Chrome Extension. Firefox and Safari support is on our roadmap. It works on Windows, macOS, and Linux.',
  },
];

/* ─── Stats data ─── */
const stats = [
  { icon: Users, target: 35, suffix: '+', decimals: 0, label: 'Beta Testers' },
  { icon: Camera, target: 850, suffix: '+', decimals: 0, label: 'Screenshots Captured' },
  { icon: ScanText, target: 10, suffix: '/day', decimals: 0, label: 'Free OCR Quota' },
  { icon: Shield, target: 100, suffix: '%', decimals: 0, label: 'Local & Private' },
];

/* ─── Comparison data ─── */
const comparisonFeatures = [
  { feature: 'Full-Page Capture', free: 'Unlimited', pro: 'Unlimited' },
  { feature: 'Visible Area Capture', free: true, pro: true },

  { feature: 'Export Formats', free: 'PNG, JPEG', pro: 'PNG, JPEG, PDF' },
  { feature: 'Export Quality', free: 'Standard', pro: 'High Quality' },
  { feature: 'PDF Watermark', free: 'With Watermark', pro: 'No Watermark' },
  { feature: 'Annotation: Rectangle', free: true, pro: true },
  { feature: 'Annotation: Arrow', free: true, pro: true },
  { feature: 'Annotation: Text', free: true, pro: true },
  { feature: 'Annotation: Freehand', free: false, pro: true },
  { feature: 'Annotation: Highlight', free: false, pro: true },
  { feature: 'Annotation: Blur', free: false, pro: true },
  { feature: 'Custom Colors', free: false, pro: true },
  { feature: 'OCR Extractions', free: '10/day', pro: 'Unlimited' },
  { feature: 'OCR Method', free: 'DOM Extraction', pro: 'DOM + Image OCR' },
  { feature: 'Visual Diff', free: '3 View Modes', pro: 'Advanced' },
  { feature: 'Gallery Storage', free: 'Browser Limit', pro: 'Browser Limit' },
  { feature: 'Priority Support', free: false, pro: true },
];

/* ─── Platforms data ─── */
const platforms = [
  { label: 'Chrome', color: 'bg-yellow-400' },
  { label: 'React Apps', color: 'bg-cyan-400' },
  { label: 'Vue Apps', color: 'bg-emerald-400' },
  { label: 'Next.js', color: 'bg-slate-300' },
  { label: 'Angular', color: 'bg-red-400' },
  { label: 'Svelte', color: 'bg-orange-400' },
  { label: 'SPA Sites', color: 'bg-violet-400' },
  { label: 'WordPress', color: 'bg-blue-400' },
  { label: 'Documentation Sites', color: 'bg-sky-400' },
  { label: 'E-Commerce', color: 'bg-amber-400' },
];

/* ─── Use cases data ─── */
const useCases = [
  {
    icon: PenTool,
    title: 'UI/UX Design',
    description: 'Capture design references, create visual specs, and annotate mockups for handoff.',
  },
  {
    icon: Shield,
    title: 'QA Testing',
    description: 'Automate visual regression testing. Compare screenshots to catch unintended changes.',
  },
  {
    icon: GitCompare,
    title: 'Competitor Analysis',
    description: 'Track competitor website changes with visual diff comparison over time.',
  },
  {
    icon: FileText,
    title: 'Content Creation',
    description: 'Extract text with OCR, capture web content for blogs, reports, and social media.',
  },
];

/* ─── Changelog data ─── */
const changelog = [
  {
    version: 'v1.0',
    title: '1.0 Beta Launch',
    description: 'First public beta with full-page capture, DOM-based OCR, visual diff with 3 view modes, and PNG/JPEG export — all running 100% locally.',
    date: 'Mar 2025',
    latest: true,
    tags: ['Full-Page Capture', 'Visible Area Capture', 'OCR (DOM Extraction)', 'Visual Diff (3 Modes)', 'PNG/JPEG Export', 'Daily Quotas', '100% Local & Private'],
  },
];

/* ─── Command Palette Component ─── */
function CommandPalette({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  const commandItems = useMemo(() => [
    { type: 'nav' as const, label: 'Features', id: 'features', icon: Camera },
    { type: 'nav' as const, label: 'See It In Action', id: 'see-it-in-action', icon: Play },
    { type: 'nav' as const, label: 'How It Works', id: 'how-it-works', icon: Zap },
    { type: 'nav' as const, label: 'Pricing', id: 'pricing', icon: DollarSign },
    { type: 'nav' as const, label: 'Testimonials', id: 'testimonials', icon: Quote },
    { type: 'nav' as const, label: 'FAQ', id: 'faq', icon: HelpCircle },
    { type: 'nav' as const, label: 'Changelog', id: 'changelog', icon: Calendar },
    { type: 'nav' as const, label: 'Contact', id: 'contact', icon: MessageSquare },
    { type: 'nav' as const, label: 'Download', id: 'download', icon: Download },
    { type: 'action' as const, label: 'Toggle Theme', action: 'toggle-theme', icon: Sun },
    { type: 'action' as const, label: 'Scroll to Top', action: 'scroll-top', icon: ChevronUp },
    ...faqs.map((f) => ({ type: 'faq' as const, label: f.q, id: 'faq', icon: HelpCircle, faqQ: f.q })),
  ], []);

  const filteredItems = useMemo(() => {
    if (!query.trim()) return commandItems;
    const q = query.toLowerCase();
    return commandItems.filter(
      (item) => item.label.toLowerCase().includes(q)
    );
  }, [query, commandItems]);

  const executeItem = (item: typeof filteredItems[number]) => {
    if (item.type === 'nav') {
      document.getElementById(item.id)?.scrollIntoView({ behavior: 'smooth' });
    } else if (item.action === 'scroll-top') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (item.action === 'toggle-theme') {
      const isDark = document.documentElement.classList.contains('dark');
      document.documentElement.classList.toggle('dark');
      document.documentElement.style.colorScheme = isDark ? 'light' : 'dark';
    }
    setQuery('');
    onClose();
  };

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-[100]"
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
          {/* Dialog */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -10 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="glass-enhanced relative mx-auto mt-[15vh] max-w-lg rounded-2xl border border-white/[0.08] shadow-2xl shadow-black/40"
          >
            {/* Search input */}
            <div className="flex items-center gap-3 border-b border-white/[0.06] px-4 py-3">
              <Search className="h-5 w-5 shrink-0 text-slate-400" />
              <input
                ref={inputRef}
                type="text"
                placeholder="Search sections, FAQ, actions..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') { onClose(); }
                  if (e.key === 'Enter' && filteredItems.length > 0) { executeItem(filteredItems[0]); }
                }}
                className="flex-1 bg-transparent text-sm lp-text placeholder:text-slate-500 outline-none"
              />
              <kbd className="hidden rounded-md border border-white/[0.08] bg-white/[0.04] px-1.5 py-0.5 text-[10px] text-slate-500 sm:inline-flex">
                ESC
              </kbd>
            </div>
            {/* Results */}
            <div className="max-h-[300px] overflow-y-auto p-2">
              {filteredItems.length === 0 ? (
                <div className="px-3 py-8 text-center text-sm text-slate-500">No results found</div>
              ) : (
                <div className="space-y-0.5">
                  {/* Navigation section */}
                  {filteredItems.filter((i) => i.type === 'nav').length > 0 && (
                    <>
                      <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Navigation</p>
                      {filteredItems.filter((i) => i.type === 'nav').map((item) => (
                        <button
                          key={`nav-${item.id}`}
                          onClick={() => executeItem(item)}
                          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm lp-text-card transition-colors hover:bg-white/[0.06] hover:text-cyan-400"
                        >
                          <item.icon className="h-4 w-4 shrink-0 text-slate-500" />
                          {item.label}
                        </button>
                      ))}
                    </>
                  )}
                  {/* Actions section */}
                  {filteredItems.filter((i) => i.type === 'action').length > 0 && (
                    <>
                      <p className="mt-2 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Actions</p>
                      {filteredItems.filter((i) => i.type === 'action').map((item) => (
                        <button
                          key={`action-${item.action}`}
                          onClick={() => executeItem(item)}
                          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm lp-text-card transition-colors hover:bg-white/[0.06] hover:text-cyan-400"
                        >
                          <item.icon className="h-4 w-4 shrink-0 text-slate-500" />
                          {item.label}
                        </button>
                      ))}
                    </>
                  )}
                  {/* FAQ section */}
                  {filteredItems.filter((i) => i.type === 'faq').length > 0 && (
                    <>
                      <p className="mt-2 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">FAQ</p>
                      {filteredItems.filter((i) => i.type === 'faq').slice(0, 5).map((item, idx) => (
                        <button
                          key={`faq-${idx}`}
                          onClick={() => executeItem(item)}
                          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm lp-text-card transition-colors hover:bg-white/[0.06] hover:text-cyan-400"
                        >
                          <item.icon className="h-4 w-4 shrink-0 text-slate-500" />
                          <span className="line-clamp-1">{item.label}</span>
                        </button>
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>
            {/* Footer hint */}
            <div className="flex items-center gap-4 border-t border-white/[0.06] px-4 py-2.5 text-[10px] text-slate-500">
              <span className="flex items-center gap-1"><kbd className="rounded border border-white/[0.08] bg-white/[0.04] px-1 py-0.5 text-[9px]">↑↓</kbd> Navigate</span>
              <span className="flex items-center gap-1"><kbd className="rounded border border-white/[0.08] bg-white/[0.04] px-1 py-0.5 text-[9px]">↵</kbd> Open</span>
              <span className="flex items-center gap-1"><kbd className="rounded border border-white/[0.08] bg-white/[0.04] px-1 py-0.5 text-[9px]">Esc</kbd> Close</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ─── Section Header Component (reusable) ─── */
function SectionHeader({ badge, badgeIcon: BadgeIcon, heading, highlight, description, custom = 0 }: {
  badge?: string;
  badgeIcon?: React.ComponentType<{ className?: string }>;
  heading?: string;
  highlight?: string;
  description?: string;
  custom?: number;
}) {
  return (
    <motion.div variants={fadeUp} custom={custom} className="text-center">
      {badge && (
        <Badge
          variant="outline"
          className={`mb-4 section-badge-glow border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-cyan-300 ${BadgeIcon ? '' : ''}`}
        >
          {BadgeIcon && <BadgeIcon className="mr-1.5 h-3 w-3" />}
          {badge}
        </Badge>
      )}
      {heading && (
        <h2 className="section-heading-animated text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl text-shadow-glow">
          <span className={`bg-gradient-to-b from-[var(--lp-text-heading)] via-[var(--lp-text-heading)] to-[var(--lp-text-muted)] bg-clip-text text-transparent`}>
            {heading}
          </span>
          {highlight && (
            <span className="bg-gradient-to-r from-cyan-300 to-sky-400 bg-clip-text text-transparent"> {highlight}</span>
          )}
        </h2>
      )}
      <div className="section-header-line" />
      {description && (
        <motion.p
          variants={fadeUp}
          custom={(custom || 0) + 0.5}
          className="mx-auto mt-4 max-w-2xl lp-text-card-muted"
        >
          {description}
        </motion.p>
      )}
    </motion.div>
  );
}

/* ─── Extension demo component ─── */
function ExtensionDemo() {
  const [activeMode, setActiveMode] = useState<string | null>(null);
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [captureDone, setCaptureDone] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  const handleCapture = (mode: string) => {
    setActiveMode(mode);
    setCapturing(true);
    setCaptureDone(false);
    setTimeout(() => {
      setCapturing(false);
      setCaptureDone(true);
      setTimeout(() => setCaptureDone(false), 2000);
    }, 1500);
  };

  const handleTool = (tool: string) => {
    setActiveTool(tool);
    setTimeout(() => setActiveTool(null), 1500);
  };

  return (
    <motion.div
      variants={fadeUp}
      custom={0}
      className="mx-auto w-full max-w-sm"
    >
      {/* Extension popup container with hover effects */}
      <div
        className="relative mx-auto w-[340px] overflow-hidden rounded-2xl border border-white/10 bg-[#1a1f2e] shadow-2xl shadow-cyan-500/10 demo-tilt demo-glow-ring transition-shadow duration-400"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {/* Floating action indicators */}
        <AnimatePresence>
          {isHovered && (
            <>
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                transition={{ delay: 0 }}
                className="absolute -right-3 top-[20%] z-20 float-action-label"
              >
                <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-500/20 bg-[#0f172a]/90 px-2.5 py-1 text-[10px] font-medium text-cyan-300 backdrop-blur-sm shadow-lg shadow-cyan-500/10">
                  📸 Capture
                </span>
              </motion.div>
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                transition={{ delay: 0.1 }}
                className="absolute -right-3 top-[50%] z-20 float-action-label"
                style={{ animationDelay: '0.1s' }}
              >
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-[#0f172a]/90 px-2.5 py-1 text-[10px] font-medium text-emerald-300 backdrop-blur-sm shadow-lg shadow-emerald-500/10">
                  ✏️ Annotate
                </span>
              </motion.div>
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                transition={{ delay: 0.2 }}
                className="absolute -right-3 top-[80%] z-20 float-action-label"
                style={{ animationDelay: '0.2s' }}
              >
                <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-500/20 bg-[#0f172a]/90 px-2.5 py-1 text-[10px] font-medium text-sky-300 backdrop-blur-sm shadow-lg shadow-sky-500/10">
                  📄 Export
                </span>
              </motion.div>
            </>
          )}
        </AnimatePresence>
        {/* Extension header */}
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-400 to-sky-600">
              <Camera className="h-4 w-4 text-white" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">SmartCapture</p>
              <p className="text-[10px] text-slate-400">v1.0 beta</p>
            </div>
          </div>
          <Badge className="border-cyan-500/30 bg-cyan-500/10 text-[10px] text-cyan-300">
            <Sparkles className="mr-1 h-3 w-3" />
            Pro
          </Badge>
        </div>

        {/* Capture mode buttons */}
        <div className="space-y-2 px-4 py-3">
          <button
            onClick={() => handleCapture('full')}
            className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-all duration-200 ${
              activeMode === 'full' && capturing
                ? 'border-cyan-500/50 bg-cyan-500/10 shadow-lg shadow-cyan-500/20'
                : activeMode === 'full' && captureDone
                  ? 'border-green-500/50 bg-green-500/10'
                  : 'border-white/5 bg-white/[0.03] hover:border-white/10 hover:bg-white/[0.06]'
            }`}
          >
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
                activeMode === 'full' && capturing
                  ? 'bg-cyan-500'
                  : activeMode === 'full' && captureDone
                    ? 'bg-green-500'
                    : 'bg-white/5'
              }`}
            >
              {activeMode === 'full' && capturing ? (
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                >
                  <Maximize2 className="h-4 w-4 text-white" />
                </motion.div>
              ) : activeMode === 'full' && captureDone ? (
                <Check className="h-4 w-4 text-white" />
              ) : (
                <Maximize2 className="h-4 w-4 text-slate-400" />
              )}
            </div>
            <div className="flex-1">
              <p className="text-xs font-medium text-white">Full Page</p>
              <p className="text-[10px] text-slate-500">Capture entire webpage</p>
            </div>
            {activeMode === 'full' && capturing && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="h-1.5 w-1.5 rounded-full bg-cyan-400"
              />
            )}
          </button>

          <button
            onClick={() => handleCapture('visible')}
            className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-all duration-200 ${
              activeMode === 'visible' && capturing
                ? 'border-cyan-500/50 bg-cyan-500/10 shadow-lg shadow-cyan-500/20'
                : activeMode === 'visible' && captureDone
                  ? 'border-green-500/50 bg-green-500/10'
                  : 'border-white/5 bg-white/[0.03] hover:border-white/10 hover:bg-white/[0.06]'
            }`}
          >
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
                activeMode === 'visible' && capturing
                  ? 'bg-cyan-500'
                  : activeMode === 'visible' && captureDone
                    ? 'bg-green-500'
                    : 'bg-white/5'
              }`}
            >
              {activeMode === 'visible' && capturing ? (
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                >
                  <Layers className="h-4 w-4 text-white" />
                </motion.div>
              ) : activeMode === 'visible' && captureDone ? (
                <Check className="h-4 w-4 text-white" />
              ) : (
                <Layers className="h-4 w-4 text-slate-400" />
              )}
            </div>
            <div className="flex-1">
              <p className="text-xs font-medium text-white">Visible Area</p>
              <p className="text-[10px] text-slate-500">Capture current viewport</p>
            </div>
          </button>


        </div>

        {/* Quick tools row */}
        <div className="flex items-center justify-around border-t border-white/5 px-2 py-2.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => handleTool('ocr')}
                className={`flex h-9 w-9 items-center justify-center rounded-lg transition-all ${
                  activeTool === 'ocr'
                    ? 'bg-cyan-500/20 text-cyan-400'
                    : 'text-slate-400 hover:bg-white/5 hover:text-white'
                }`}
              >
                <ScanText className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="border-white/10 bg-slate-800 text-white">
              OCR Text Extraction
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => handleTool('diff')}
                className={`flex h-9 w-9 items-center justify-center rounded-lg transition-all ${
                  activeTool === 'diff'
                    ? 'bg-cyan-500/20 text-cyan-400'
                    : 'text-slate-400 hover:bg-white/5 hover:text-white'
                }`}
              >
                <GitCompare className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="border-white/10 bg-slate-800 text-white">
              Visual Diff
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => handleTool('annotate')}
                className={`flex h-9 w-9 items-center justify-center rounded-lg transition-all ${
                  activeTool === 'annotate'
                    ? 'bg-cyan-500/20 text-cyan-400'
                    : 'text-slate-400 hover:bg-white/5 hover:text-white'
                }`}
              >
                <PenTool className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="border-white/10 bg-slate-800 text-white">
              Annotate
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => handleTool('history')}
                className={`flex h-9 w-9 items-center justify-center rounded-lg transition-all ${
                  activeTool === 'history'
                    ? 'bg-cyan-500/20 text-cyan-400'
                    : 'text-slate-400 hover:bg-white/5 hover:text-white'
                }`}
              >
                <History className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="border-white/10 bg-slate-800 text-white">
              Capture History
            </TooltipContent>
          </Tooltip>
        </div>

        {/* Recent captures */}
        <div className="border-t border-white/5 px-4 py-3">
          <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-slate-500">
            Recent Captures
          </p>
          <div className="grid grid-cols-3 gap-1.5">
            {[
              { color: 'from-blue-500/30 to-purple-500/30', label: 'Blog Post' },
              { color: 'from-emerald-500/30 to-teal-500/30', label: 'Dashboard' },
              { color: 'from-orange-500/30 to-red-500/30', label: 'Landing' },
            ].map((item, i) => (
              <motion.div
                key={i}
                whileHover={{ scale: 1.05 }}
                className="group relative flex aspect-video cursor-pointer items-center justify-center overflow-hidden rounded-lg border border-white/5 bg-gradient-to-br transition-colors hover:border-cyan-500/30"
              >
                <div className={`absolute inset-0 bg-gradient-to-br ${item.color} opacity-30`} />
                <ImageIcon className="h-4 w-4 text-slate-500 transition-colors group-hover:text-cyan-400" />
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent px-1.5 pb-1 pt-3">
                  <p className="text-[8px] text-slate-300">{item.label}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-white/5 px-4 py-2.5">
          <button className="flex items-center gap-1.5 text-slate-400 transition-colors hover:text-white">
            <Settings className="h-3.5 w-3.5" />
            <span className="text-[10px]">Settings</span>
          </button>
          <div className="flex items-center gap-1 rounded-full bg-gradient-to-r from-cyan-500/20 to-sky-500/20 px-2.5 py-1">
            <Star className="h-3 w-3 text-yellow-400" />
            <span className="text-[10px] font-medium text-cyan-300">Upgrade to Pro</span>
          </div>
        </div>
      </div>

      {/* Glow behind the popup */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-1/2 h-80 w-80 -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-500/10 blur-[80px]" />
      </div>
    </motion.div>
  );
}

/* ─── Animated counter component ─── */
function AnimatedCounter({ target, suffix = '', decimals = 0 }: { target: number; suffix?: string; decimals?: number }) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: true });
  const hasAnimated = useRef(false);

  useEffect(() => {
    if (isInView && !hasAnimated.current) {
      hasAnimated.current = true;
      const duration = 1200;
      const steps = 30;
      const increment = target / steps;
      let current = 0;
      const timer = setInterval(() => {
        current += increment;
        if (current >= target) {
          setCount(target);
          clearInterval(timer);
        } else {
          setCount(current);
        }
      }, duration / steps);
    }
  }, [isInView, target]);

  return (
    <span ref={ref}>
      {decimals > 0 ? count.toFixed(decimals) : Math.floor(count).toLocaleString()}{suffix}
    </span>
  );
}

/* ─── Typing animation component ─── */
function TypingText({ phrases }: { phrases: string[] }) {
  const [currentPhrase, setCurrentPhrase] = useState(0);
  const [displayedText, setDisplayedText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    const phrase = phrases[currentPhrase];
    const timeout = setTimeout(() => {
      if (!isDeleting) {
        setDisplayedText(phrase.slice(0, displayedText.length + 1));
        if (displayedText === phrase) {
          setTimeout(() => setIsDeleting(true), 2000);
        }
      } else {
        setDisplayedText(phrase.slice(0, displayedText.length - 1));
        if (displayedText === '') {
          setIsDeleting(false);
          setCurrentPhrase((prev) => (prev + 1) % phrases.length);
        }
      }
    }, isDeleting ? 15 : 30);
    return () => clearTimeout(timeout);
  }, [displayedText, isDeleting, currentPhrase, phrases]);

  return (
    <span className="inline-flex">
      {displayedText}
      <span className="ml-0.5 inline-block h-[1em] w-[2px] animate-pulse bg-cyan-400" />
    </span>
  );
}

/* ─── LazySection wrapper with IntersectionObserver ─── */
function LazySection({ children, className = '', id }: { children: React.ReactNode; className?: string; id?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [hasBeenVisible, setHasBeenVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setHasBeenVisible(true);
          observer.unobserve(el);
        }
      },
      { rootMargin: '200px', threshold: 0 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} id={id} className={className}>
      {hasBeenVisible ? children : (
        <div className="flex items-center justify-center py-12">
          <div className="flex flex-col items-center gap-3">
            <Skeleton className="h-4 w-32 rounded-full" />
            <Skeleton className="h-4 w-24 rounded-full" />
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Loading Skeleton for Initial Page ─── */
function PageLoadingSkeleton() {
  return (
    <div className="min-h-screen lp-bg">
      {/* Nav skeleton */}
      <div className="fixed left-0 right-0 top-0 z-50 border-b border-white/[0.04] lp-nav-bg backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            <Skeleton className="h-8 w-8 rounded-lg" />
            <Skeleton className="h-5 w-32" />
          </div>
          <div className="hidden items-center gap-4 md:flex">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-9 w-24 rounded-lg" />
          </div>
          <Skeleton className="h-9 w-9 rounded-lg md:hidden" />
        </div>
      </div>

      {/* Hero skeleton */}
      <div className="pt-32 pb-20 sm:pt-40 sm:pb-28">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
            <div className="text-center lg:text-left">
              <Skeleton className="mx-auto mb-6 h-7 w-44 rounded-full lg:mx-0" />
              <Skeleton className="mx-auto mb-4 h-12 w-80 max-w-full rounded-lg lg:mx-0" />
              <Skeleton className="mx-auto mb-4 h-12 w-64 max-w-full rounded-lg lg:mx-0" />
              <Skeleton className="mx-auto mb-6 h-5 w-96 max-w-full rounded lg:mx-0" />
              <div className="mx-auto flex gap-3 lg:mx-0">
                <Skeleton className="h-11 w-44 rounded-lg" />
                <Skeleton className="h-11 w-32 rounded-lg" />
              </div>
              <div className="mx-auto mt-8 flex items-center gap-6 lg:mx-0">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-24" />
              </div>
            </div>
            <div className="flex justify-center lg:justify-end">
              <Skeleton className="h-[420px] w-[340px] rounded-2xl" />
            </div>
          </div>
        </div>
      </div>

      {/* Feature cards grid skeleton */}
      <div className="py-20 sm:py-28">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="text-center">
            <Skeleton className="mx-auto mb-4 h-7 w-24 rounded-full" />
            <Skeleton className="mx-auto mb-4 h-10 w-72 rounded-lg" />
            <Skeleton className="mx-auto h-5 w-96 max-w-full rounded" />
          </div>
          <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="rounded-2xl border border-white/[0.04] p-6">
                <Skeleton className="mb-4 h-12 w-12 rounded-xl" />
                <Skeleton className="mb-2 h-5 w-36 rounded" />
                <Skeleton className="h-4 w-full rounded" />
                <Skeleton className="mt-2 h-4 w-4/5 rounded" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Particle Canvas Background ─── */
function ParticleCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    interface Particle {
      x: number; y: number; vx: number; vy: number;
      size: number; opacity: number; opacityDir: number;
    }

    const particles: Particle[] = [];
    const count = Math.min(25, Math.floor(window.innerWidth / 50));

    for (let i = 0; i < count; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.2,
        vy: (Math.random() - 0.5) * 0.2,
        size: Math.random() * 1.5 + 0.5,
        opacity: Math.random() * 0.3 + 0.1,
        opacityDir: Math.random() > 0.5 ? 1 : -1,
      });
    }

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const isDark = document.documentElement.classList.contains('dark');

      particles.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;
        p.opacity += p.opacityDir * 0.002;
        if (p.opacity >= 0.4 || p.opacity <= 0.05) p.opacityDir *= -1;
        if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
        if (p.y < 0 || p.y > canvas.height) p.vy *= -1;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = isDark
          ? `rgba(6, 182, 212, ${p.opacity})`
          : `rgba(6, 182, 212, ${p.opacity * 0.5})`;
        ctx.fill();
      });

      animationRef.current = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      cancelAnimationFrame(animationRef.current);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-0 z-0"
      style={{ opacity: 0.6 }}
    />
  );
}

/* ─── Before/After Slider Component ─── */
function BeforeAfterSlider() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [sliderPos, setSliderPos] = useState(50);
  const [isDragging, setIsDragging] = useState(false);

  const updateSlider = useCallback((e: React.PointerEvent) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    setSliderPos(Math.max(5, Math.min(95, x)));
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    setIsDragging(true);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    updateSlider(e);
  }, [updateSlider]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging) return;
    updateSlider(e);
  }, [isDragging, updateSlider]);

  const handlePointerUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  return (
    <motion.div
      variants={fadeUp}
      custom={2}
      className="mx-auto max-w-3xl"
    >
      <div
        ref={containerRef}
        className="relative cursor-col-resize select-none overflow-hidden rounded-2xl border border-white/[0.06] lp-card-bg"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        {/* After layer (full width) */}
        <div className="relative aspect-video bg-gradient-to-br from-emerald-900/30 to-teal-900/20">
          {/* After: mock page with diff highlights */}
          <div className="absolute inset-0 p-6">
            <div className="h-4 w-32 rounded bg-emerald-400/20 mb-3" />
            <div className="h-2.5 w-full rounded bg-white/[0.04] mb-1.5" />
            <div className="h-2.5 w-5/6 rounded bg-white/[0.04] mb-1.5" />
            <div className="h-2.5 w-3/4 rounded bg-white/[0.04] mb-4" />
            {/* Red diff rectangles indicating changes */}
            <div className="relative mb-3">
              <div className="h-20 w-full rounded-lg border-2 border-red-500/40 bg-red-500/[0.06] flex items-center justify-center">
                <span className="text-xs text-red-400/80 font-medium">Changed region</span>
              </div>
            </div>
            <div className="h-2.5 w-full rounded bg-green-400/15 mb-1.5" />
            <div className="h-2.5 w-4/5 rounded bg-green-400/15 mb-3" />
            <div className="h-2.5 w-2/3 rounded bg-white/[0.04] mb-4" />
            {/* Another diff region */}
            <div className="inline-block rounded-md border-2 border-red-500/40 bg-red-500/[0.06] px-3 py-1.5">
              <span className="text-xs text-red-400/80">Modified button</span>
            </div>
          </div>

          {/* Before layer (clipped) */}
          <div
            className="absolute inset-0 bg-gradient-to-br from-slate-800/60 to-slate-900/40"
            style={{ clipPath: `inset(0 ${100 - sliderPos}% 0 0)` }}
          >
            <div className="absolute inset-0 p-6">
              <div className="h-4 w-32 rounded bg-blue-400/20 mb-3" />
              <div className="h-2.5 w-full rounded bg-white/[0.04] mb-1.5" />
              <div className="h-2.5 w-5/6 rounded bg-white/[0.04] mb-1.5" />
              <div className="h-2.5 w-3/4 rounded bg-white/[0.04] mb-4" />
              <div className="h-20 w-full rounded-lg bg-blue-500/10 border border-blue-500/10" />
              <div className="h-2.5 w-full rounded bg-white/[0.04] mt-3 mb-1.5" />
              <div className="h-2.5 w-4/5 rounded bg-white/[0.04] mb-3" />
              <div className="h-2.5 w-2/3 rounded bg-white/[0.04] mb-4" />
              <div className="h-7 w-24 rounded-lg bg-slate-500/20" />
            </div>
          </div>

          {/* Labels */}
          <span className="absolute left-3 top-3 z-10 rounded-md bg-black/50 px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-slate-300 backdrop-blur-sm">
            Before
          </span>
          <span className="absolute right-3 top-3 z-10 rounded-md bg-cyan-500/20 px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-cyan-300 backdrop-blur-sm">
            After
          </span>

          {/* Slider line */}
          <div
            className="absolute top-0 bottom-0 z-20 w-0.5 bg-white shadow-lg shadow-cyan-500/30"
            style={{ left: `${sliderPos}%` }}
          >
            {/* Handle */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full border-2 border-white bg-cyan-500 shadow-xl shadow-cyan-500/40">
              <GitCompare className="h-4 w-4 text-white" />
            </div>
          </div>
        </div>
      </div>
      <p className="mt-3 text-center text-xs text-slate-500">Drag the slider to compare before and after</p>
    </motion.div>
  );
}

/* ─── Live Install Counter Component ─── */
function LiveInstallCounter() {
  const [count, setCount] = useState(87);
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: true });

  useEffect(() => {
    if (!isInView) return;
    const timer = setInterval(() => {
      setCount((prev) => prev + 1);
    }, Math.random() * 8000 + 12000);
    return () => clearInterval(timer);
  }, [isInView]);

  return (
    <div ref={ref} className="flex items-center justify-center gap-2.5">
      <span className="relative flex h-2.5 w-2.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
      </span>
      <span className="text-xs font-medium text-emerald-400 uppercase tracking-wider">Live</span>
      <span className="text-sm font-semibold lp-text-card">
        {count.toLocaleString()}+
        <span className="ml-1 text-xs font-normal lp-text-card-muted">early users</span>
      </span>
    </div>
  );
}

/* ─── Quick Actions FAB Component ─── */
function QuickActionsFAB({ scrollProgress }: { scrollProgress: number }) {
  const [expanded, setExpanded] = useState(false);

  const actions = [
    { icon: MessageCircle, label: 'Contact', target: '#contact' },
    { icon: Download, label: 'Download', target: '#download' },
    { icon: Star, label: 'Reviews', target: '#testimonials' },
  ];

  return (
    <AnimatePresence>
      {scrollProgress > 10 && (
        <motion.div
          initial={{ x: -60, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: -60, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 200, damping: 25, delay: 0.2 }}
          className="fixed left-6 top-1/2 z-30 -translate-y-1/2 hidden lg:flex flex-col items-end gap-2"
        >
          {expanded && actions.map((action, i) => (
            <Tooltip key={action.label}>
              <TooltipTrigger asChild>
                <motion.button
                  initial={{ x: -20, opacity: 0, scale: 0.5 }}
                  animate={{ x: 0, opacity: 1, scale: 1 }}
                  exit={{ x: -20, opacity: 0, scale: 0.5 }}
                  transition={{ delay: i * 0.05 + 0.1 }}
                  onClick={() => document.querySelector(action.target)?.scrollIntoView({ behavior: 'smooth' })}
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.04] backdrop-blur-md text-slate-400 transition-all hover:border-cyan-500/30 hover:bg-cyan-500/10 hover:text-cyan-400 active:scale-[0.95] focus-visible:ring-2 focus-visible:ring-cyan-500/50"
                  aria-label={action.label}
                >
                  <action.icon className="h-4 w-4" />
                </motion.button>
              </TooltipTrigger>
              <TooltipContent side="right" className="border-white/10 bg-slate-800 text-white text-xs">
                {action.label}
              </TooltipContent>
            </Tooltip>
          ))}
          <button
            onClick={() => setExpanded(!expanded)}
            className={`flex h-12 w-12 items-center justify-center rounded-full border shadow-lg backdrop-blur-md transition-all active:scale-[0.95] focus-visible:ring-2 focus-visible:ring-cyan-500/50 ${
              expanded
                ? 'border-cyan-500/30 bg-cyan-500/10 text-cyan-400'
                : 'border-white/[0.08] bg-white/[0.06] text-slate-400 hover:border-cyan-500/20 hover:text-cyan-400'
            }`}
            aria-label="Quick actions"
          >
            <motion.div animate={{ rotate: expanded ? 45 : 0 }} transition={{ duration: 0.2 }}>
              <Plus className="h-5 w-5" />
            </motion.div>
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ─── Social Proof Toast Component ─── */
const socialProofEntries = [
  { name: 'Ahmed R.', city: 'Lahore', time: 'just now', initials: 'AR' },
  { name: 'Sara M.', city: 'Dubai', time: '3 minutes ago', initials: 'SM' },
  { name: 'James L.', city: 'London', time: '8 minutes ago', initials: 'JL' },
  { name: 'Nina K.', city: 'Berlin', time: '15 minutes ago', initials: 'NK' },
  { name: 'Carlos D.', city: 'Madrid', time: '20 minutes ago', initials: 'CD' },
];

function SocialProofToast({ visible, onDismiss }: { visible: boolean; onDismiss: () => void }) {
  const [entry, setEntry] = useState(socialProofEntries[0]);
  const [exiting, setExiting] = useState(false);
  const prevVisible = useRef(visible);

  // Pick a random entry when visible transitions from false to true
  if (visible && !prevVisible.current) {
    const idx = Math.floor(Math.random() * socialProofEntries.length);
    setEntry(socialProofEntries[idx]);
    setExiting(false);
  }
  prevVisible.current = visible;

  useEffect(() => {
    if (!visible) return;
    const autoDismiss = setTimeout(() => {
      setExiting(true);
      setTimeout(() => onDismiss(), 300);
    }, 5000);
    return () => clearTimeout(autoDismiss);
  }, [visible, onDismiss]);

  if (!visible) return null;

  return (
    <motion.div
      initial={{ x: -100, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: -100, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 200, damping: 25 }}
      className={`fixed bottom-6 left-6 z-40 hidden md:block ${exiting ? 'social-toast-exit' : 'social-toast-enter'}`}
    >
      <div className="glass-card flex items-center gap-3 rounded-xl p-3 pr-2 shadow-lg shadow-black/20 min-w-[280px]">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-cyan-500 to-sky-500 text-xs font-bold text-white shadow-md">
          {entry.initials}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium lp-text-primary truncate">
            <span className="lp-text-heading">{entry.name}</span>{' '}
            <span className="lp-text-card-muted">from {entry.city}</span>
          </p>
          <p className="text-xs lp-text-card-muted mt-0.5">just installed SmartCapture Pro</p>
          <p className="text-[10px] text-slate-500 mt-0.5">{entry.time}</p>
        </div>
        <button
          onClick={() => { setExiting(true); setTimeout(() => onDismiss(), 300); }}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-white/[0.06] hover:text-slate-300"
          aria-label="Dismiss"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    </motion.div>
  );
}

/* ─── Getting Started Guide Component ─── */
const gettingStartedSteps = [
  { num: 1, title: 'Install', description: 'Add SmartCapture Pro to Chrome from the Web Store', icon: Download },
  { num: 2, title: 'Capture', description: 'Click the extension icon and choose your capture mode', icon: Camera },
  { num: 3, title: 'Annotate & Export', description: 'Mark up screenshots, extract text, and export', icon: Wand2 },
];

function GettingStartedGuide() {
  return (
    <AnimatedSection className="relative py-20 sm:py-28 section-bg-alt">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <motion.div variants={fadeUp} custom={0} className="text-center">
          <Badge variant="outline" className="mb-4 border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-cyan-300">
            <Zap className="mr-1.5 h-3 w-3" />
            Quick Start
          </Badge>
          <h2 className="section-heading-animated text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl text-shadow-glow">
            <span className={`bg-gradient-to-b from-[var(--lp-text-heading)] via-[var(--lp-text-heading)] to-[var(--lp-text-muted)] bg-clip-text text-transparent`}>
              Getting Started
            </span>{' '}
            <span className="bg-gradient-to-r from-cyan-300 to-sky-400 bg-clip-text text-transparent">
              in 3 Steps
            </span>
          </h2>
          <p className="mx-auto mt-4 max-w-2xl lp-text-card-muted">
            Up and running in under a minute. No sign-up required.
          </p>
        </motion.div>

        <div className="relative mt-14 grid gap-8 md:grid-cols-3 md:gap-6">
          {/* Dotted connector lines (desktop only) */}
          <div className="pointer-events-none absolute left-[16.666%] right-[16.666%] top-[72px] hidden md:flex items-center">
            <div className="flex-1 border-t-2 border-dashed border-cyan-500/20" />
          </div>
          <div className="pointer-events-none absolute left-[49.999%] right-[16.666%] top-[72px] hidden md:flex items-center">
            <div className="flex-1 border-t-2 border-dashed border-cyan-500/20" />
          </div>

          {gettingStartedSteps.map((step, i) => (
            <motion.div
              key={step.num}
              variants={fadeUp}
              custom={i + 1}
              whileHover={{ y: -4, transition: { duration: 0.2 } }}
              className="relative flex flex-col items-center text-center"
            >
              <div className="relative z-10 mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-cyan-500/20 bg-gradient-to-br from-cyan-500/15 to-sky-500/10 shadow-lg shadow-cyan-500/10 backdrop-blur-sm">
                <step.icon className="h-7 w-7 text-cyan-400" />
                <div className="absolute -top-2 -right-2 flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-r from-cyan-500 to-sky-500 text-xs font-bold text-white shadow-md">
                  {step.num}
                </div>
              </div>
              <div className="w-full max-w-xs rounded-2xl border lp-card-border lp-card-bg p-5 backdrop-blur-sm card-hover-lift">
                <h3 className="mb-2 text-lg font-semibold lp-text-heading">{step.title}</h3>
                <p className="text-sm leading-relaxed lp-text-card">{step.description}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </AnimatedSection>
  );
}


/* ═══════════════════════════════════════════════════════════════════
   MAIN PAGE
   ═══════════════════════════════════════════════════════════════════ */
export default function Home() {
  const { theme, setTheme } = useTheme();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [cookieConsent, setCookieConsent] = useState(false);
  const [showCookiePrefs, setShowCookiePrefs] = useState(false);
  const [cookiePrefs, setCookiePrefs] = useState({ analytics: true, marketing: false });
  const [activeSection, setActiveSection] = useState('');

  // Round 6: Loading skeleton state
  const [isLoading, setIsLoading] = useState(true);

  // Round 6: Announcement banner state
  const [announcementVisible, setAnnouncementVisible] = useState(false);
  const [announcementDismissed, setAnnouncementDismissed] = useState(false);

  // Contact form state
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactSubject, setContactSubject] = useState('');
  const [contactMessage, setContactMessage] = useState('');
  const [sendingContact, setSendingContact] = useState(false);

  // Carousel state
  const [carouselApi, setCarouselApi] = useState<CarouselApi | null>(null);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [scrollSnaps, setScrollSnaps] = useState<number[]>([]);
  const isPausedRef = useRef(false);

  // Interactive demo state
  const [activeDemo, setActiveDemo] = useState<'capture' | 'annotation' | 'diff'>('capture');

  // Keyboard shortcuts state
  const [showShortcuts, setShowShortcuts] = useState(false);

  // Command palette state
  const [showCommandPalette, setShowCommandPalette] = useState(false);

  // Social proof toast state
  const [showSocialToast, setShowSocialToast] = useState(false);
  const hasPassedHero = useRef(false);

  // FAQ voting state
  const [faqVotes, setFaqVotes] = useState<Record<string, { up: number; down: number; userVote: 'up' | 'down' | null }>>({});

  // Social proof toast effects
  useEffect(() => {
    const interval = setInterval(() => {
      if (hasPassedHero.current) setShowSocialToast(true);
    }, 30000 + Math.random() * 20000);
    const initialDelay = setTimeout(() => {
      if (hasPassedHero.current) setShowSocialToast(true);
    }, 25000);
    return () => { clearInterval(interval); clearTimeout(initialDelay); };
  }, []);

  useEffect(() => {
    const onScroll = () => {
      if (window.scrollY > window.innerHeight * 0.8) hasPassedHero.current = true;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  /* ─── FAQ votes from localStorage ─── */
  useEffect(() => {
    try {
      const saved = localStorage.getItem('scFaqVotes');
      if (saved) setFaqVotes(JSON.parse(saved));
    } catch { /* ignore */ }
  }, []);

  const handleFaqVote = useCallback((faqKey: string, vote: 'up' | 'down') => {
    setFaqVotes((prev) => {
      const current = prev[faqKey] || { up: 14, down: 2, userVote: null };
      let newUp = current.up; let newDown = current.down;
      if (current.userVote === vote) {
        if (vote === 'up') newUp--; else newDown--;
        const updated = { ...prev, [faqKey]: { up: newUp, down: newDown, userVote: null } };
        localStorage.setItem('scFaqVotes', JSON.stringify(updated));
        return updated;
      }
      if (current.userVote) {
        if (current.userVote === 'up') newUp--; else newDown--;
      }
      if (vote === 'up') newUp++; else newDown++;
      const updated = { ...prev, [faqKey]: { up: newUp, down: newDown, userVote: vote } };
      localStorage.setItem('scFaqVotes', JSON.stringify(updated));
      return updated;
    });
  }, []);

  // Hero mouse spotlight state
  const [heroMousePos, setHeroMousePos] = useState({ x: 50, y: 50 });
  const heroRef = useRef<HTMLElement>(null);

  // Billing period state
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'annual'>('monthly');

  // FAQ search state
  const [faqSearch, setFaqSearch] = useState('');
  const filteredFaqs = faqs.filter((faq) => {
    if (!faqSearch.trim()) return true;
    const q = faqSearch.toLowerCase();
    return faq.q.toLowerCase().includes(q) || faq.a.toLowerCase().includes(q);
  });

  /* ─── Carousel tracking & auto-play ─── */
  useEffect(() => {
    if (!carouselApi) return;
    const updateSnaps = () => {
      setScrollSnaps(carouselApi.scrollSnapList());
      setCurrentSlide(carouselApi.selectedScrollSnap());
    };
    carouselApi.on('init', updateSnaps);
    carouselApi.on('reInit', updateSnaps);
    carouselApi.on('select', () => setCurrentSlide(carouselApi.selectedScrollSnap()));
    updateSnaps();
    return () => {
      carouselApi.off('init', updateSnaps);
      carouselApi.off('reInit', updateSnaps);
    };
  }, [carouselApi]);

  useEffect(() => {
    if (!carouselApi) return;
    const timer = setInterval(() => {
      if (!isPausedRef.current) carouselApi.scrollNext();
    }, 5000);
    return () => clearInterval(timer);
  }, [carouselApi]);

  /* ─── #1: Scroll Progress Indicator ─── */
  useEffect(() => {
    const onScroll = () => {
      const scrolled = window.scrollY > 20;
      setScrolled(scrolled);
      const totalHeight = document.body.scrollHeight - window.innerHeight;
      const progress = totalHeight > 0 ? (window.scrollY / totalHeight) * 100 : 0;
      setScrollProgress(Math.min(progress, 100));
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  /* ─── #2: Active Nav Link Highlighting via IntersectionObserver ─── */
  useEffect(() => {
    const sectionIds = navLinks.map((l) => l.sectionId);
    const observers: IntersectionObserver[] = [];

    sectionIds.forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              setActiveSection(id);
            }
          });
        },
        { rootMargin: '-40% 0px -50% 0px', threshold: 0 }
      );
      observer.observe(el);
      observers.push(observer);
    });

    return () => observers.forEach((obs) => obs.disconnect());
  }, []);

  /* ─── Cookie consent persistence ─── */
  useEffect(() => {
    if (localStorage.getItem('scConsent')) {
      setCookieConsent(true);
    }
    const savedPrefs = localStorage.getItem('scConsentPrefs');
    if (savedPrefs) {
      try {
        setCookiePrefs(JSON.parse(savedPrefs));
      } catch {
        // ignore invalid JSON
      }
    }
  }, []);

  /* ─── Round 6: Loading skeleton timer ─── */
  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 1800);
    return () => clearTimeout(timer);
  }, []);

  /* ─── Round 6: Announcement banner ─── */
  useEffect(() => {
    const dismissed = localStorage.getItem('scAnnouncementDismissed');
    if (dismissed) {
      setAnnouncementDismissed(true);
    } else {
      const timer = setTimeout(() => setAnnouncementVisible(true), 2500);
      return () => clearTimeout(timer);
    }
  }, []);

  const dismissAnnouncement = useCallback(() => {
    setAnnouncementVisible(false);
    localStorage.setItem('scAnnouncementDismissed', 'true');
    setAnnouncementDismissed(true);
  }, []);

  /* ─── Round 6: Body scroll lock on mobile menu ─── */
  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileMenuOpen]);

  /* ─── Welcome toast for first-time visitors ─── */
  useEffect(() => {
    const hasVisited = localStorage.getItem('scVisited');
    if (!hasVisited) {
      setTimeout(() => {
        toast('👋 Welcome to SmartCapture Pro!', {
          description: 'Press ? for keyboard shortcuts.',
          duration: 5000,
        });
        localStorage.setItem('scVisited', 'true');
      }, 1500);
    }
  }, []);

  const scrollTo = (href: string) => {
    setMobileMenuOpen(false);
    document.querySelector(href)?.scrollIntoView({ behavior: 'smooth' });
  };

  /* ─── Social proof toast timer ─── */
  useEffect(() => {
    const showNext = () => {
      if (hasPassedHero.current) {
        setShowSocialToast(true);
      }
    };
    const initialDelay = setTimeout(showNext, 20000 + Math.random() * 10000);
    const interval = setInterval(() => {
      if (hasPassedHero.current) {
        setShowSocialToast(true);
      }
    }, 15000 + Math.random() * 10000);
    return () => {
      clearTimeout(initialDelay);
      clearInterval(interval);
    };
  }, []);

  /* ─── Track scroll past hero for social proof ─── */
  useEffect(() => {
    const onScroll = () => {
      if (window.scrollY > window.innerHeight * 0.8 && !hasPassedHero.current) {
        hasPassedHero.current = true;
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  /* ─── Social proof toast timer ─── */
  useEffect(() => {
    const interval = setInterval(() => {
      if (hasPassedHero.current) {
        setShowSocialToast(true);
      }
    }, 15000 + Math.random() * 10000);
    const initialDelay = setTimeout(() => {
      if (hasPassedHero.current) setShowSocialToast(true);
    }, 18000);
    return () => { clearInterval(interval); clearTimeout(initialDelay); };
  }, []);

  /* ─── Track scroll past hero for social proof ─── */
  useEffect(() => {
    const onScroll = () => {
      if (window.scrollY > window.innerHeight * 0.8 && !hasPassedHero.current) {
        hasPassedHero.current = true;
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  /* ─── Section heading animated underline observer ─── */
  useEffect(() => {
    const headings = document.querySelectorAll('.section-heading-animated');
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('in-view');
          }
        });
      },
      { threshold: 0.3 }
    );
    headings.forEach((h) => observer.observe(h));
    return () => observer.disconnect();
  }, []);

  /* ─── Keyboard shortcuts listener ─── */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (e.key === '?' || e.key === '/') {
        e.preventDefault();
        setShowShortcuts(true);
      } else if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setShowCommandPalette(true);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else if (e.key === 'd' || e.key === 'D') {
        e.preventDefault();
        document.querySelector('#download')?.scrollIntoView({ behavior: 'smooth' });
      } else if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        document.querySelector('#features')?.scrollIntoView({ behavior: 'smooth' });
      } else if (e.key === 'p' || e.key === 'P') {
        e.preventDefault();
        document.querySelector('#pricing')?.scrollIntoView({ behavior: 'smooth' });
      } else if (e.key === 't' || e.key === 'T') {
        e.preventDefault();
        setTheme(theme === 'dark' ? 'light' : 'dark');
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [theme, setTheme]);

  /* ─── #4: Contact form submit ─── */
  const handleContactSubmit = useCallback(async () => {
    if (!contactName.trim() || !contactEmail.trim() || !contactMessage.trim()) {
      toast.error('Please fill in all required fields.');
      return;
    }
    if (!contactEmail.includes('@')) {
      toast.error('Please enter a valid email address.');
      return;
    }
    setSendingContact(true);
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: contactName,
          email: contactEmail,
          subject: contactSubject,
          message: contactMessage,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success('Your message is successfully sent!', { description: 'We\'ll get back to you soon.' });
        setContactName('');
        setContactEmail('');
        setContactSubject('');
        setContactMessage('');
      } else {
        toast.error(data.error || 'Failed to send message. Please try again.');
      }
    } catch {
      toast.error('Network error. Please try again later.');
    } finally {
      setSendingContact(false);
    }
  }, [contactName, contactEmail, contactSubject, contactMessage]);

  /* ─── #5: Cookie consent preferences ─── */
  const acceptWithPrefs = () => {
    localStorage.setItem('scConsentPrefs', JSON.stringify(cookiePrefs));
    localStorage.setItem('scConsent', 'true');
    setCookieConsent(true);
    setShowCookiePrefs(false);
    toast.success('Preferences saved!');
  };

  const acceptAll = () => {
    localStorage.setItem('scConsent', 'true');
    localStorage.setItem('scConsentPrefs', JSON.stringify({ analytics: true, marketing: true }));
    setCookieConsent(true);
    setShowCookiePrefs(false);
  };

  return (
    <div id="main-content" className="landing-bg min-h-screen lp-bg lp-text antialiased">
      {/* ─── Round 6: Initial Loading Skeleton ─── */}
      <AnimatePresence>
        {isLoading && (
          <motion.div
            key="loading-skeleton"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
            className="fixed inset-0 z-[100]"
          >
            <PageLoadingSkeleton />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Dot pattern background ─── */}
      <div
        className="pointer-events-none fixed inset-0 -z-10 opacity-[0.03]"
        style={{
          backgroundImage:
            'radial-gradient(circle, #fff 1px, transparent 1px)',
          backgroundSize: '32px 32px',
        }}
      />

      {/* ═══ Round 6: ANNOUNCEMENT BANNER ═══ */}
      <AnimatePresence>
        {announcementVisible && !announcementDismissed && !isLoading && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 200, damping: 25, opacity: { duration: 0.3 } }}
            className="overflow-hidden"
          >
            <div className="announcement-gradient border-b border-white/[0.06]">
              <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-2.5 sm:px-6">
                <div className="flex items-center gap-2.5">
                  <Megaphone className="h-4 w-4 shrink-0 text-cyan-400" />
                  <p className="text-xs sm:text-sm lp-text-card">
                    <span className="font-medium text-cyan-400">SmartCapture Pro v1.0 Beta</span> is here! Full-page capture, OCR, visual diff, and annotations — all running locally in your browser.
                  </p>
                </div>
                <button
                  onClick={dismissAnnouncement}
                  className="ml-3 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-white/[0.06] hover:text-white lp-touch-target focus-visible:ring-2 focus-visible:ring-cyan-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
                  aria-label="Dismiss announcement"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ #1: SCROLL PROGRESS INDICATOR ═══ */}
      <div
        className="fixed left-0 right-0 top-0 z-[60] h-[3px] rounded-r-full"
        style={{
          width: `${scrollProgress}%`,
          background: 'linear-gradient(90deg, #06b6d4, #0ea5e9, #38bdf8)',
          transition: 'width 150ms ease-out',
        }}
      />

      {/* ═══════ NAV BAR ═══════ */}
      <nav
        className={`fixed left-0 right-0 top-0 z-50 transition-all duration-300 ${
          scrolled
            ? 'border-b border-white/5 lp-nav-bg shadow-lg shadow-black/20 backdrop-blur-xl'
            : 'bg-transparent'
        }`}
      >
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          {/* Logo */}
          <button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-400 to-sky-600 shadow-lg shadow-cyan-500/25">
              <Camera className="h-4 w-4 text-white" />
            </div>
            <span className="text-lg font-bold tracking-tight lp-text-heading">
              SmartCapture <span className="text-cyan-400">Pro</span>
            </span>
          </button>

          {/* Desktop nav links */}
          <div className="hidden items-center gap-1 md:flex">
            {navLinks.map((link) => (
              <button
                key={link.href}
                onClick={() => scrollTo(link.href)}
                className={`relative rounded-lg px-3.5 py-2 text-sm transition-colors hover:bg-white/5 group ${
                  activeSection === link.sectionId
                    ? 'text-cyan-400'
                    : 'lp-text-primary hover:lp-text-heading'
                }`}
              >
                {link.label}
                <span className={`absolute bottom-0 left-1/2 h-0.5 -translate-x-1/2 rounded-full bg-cyan-400 transition-all duration-300 ${activeSection === link.sectionId ? 'w-6' : 'w-0 group-hover:w-6'}`} />
              </button>
            ))}

            {/* #6: Theme Toggle */}
            <button
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="ml-2 flex h-9 w-9 items-center justify-center rounded-lg border border-white/[0.06] bg-white/[0.03] text-slate-400 transition-all hover:border-cyan-500/20 hover:bg-white/[0.06] hover:text-cyan-400"
              aria-label="Toggle theme"
            >
              <AnimatePresence mode="wait">
                {theme === 'dark' ? (
                  <motion.div key="sun" initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }} transition={{ duration: 0.2 }}>
                    <Sun className="h-4 w-4" />
                  </motion.div>
                ) : (
                  <motion.div key="moon" initial={{ rotate: 90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: -90, opacity: 0 }} transition={{ duration: 0.2 }}>
                    <Moon className="h-4 w-4" />
                  </motion.div>
                )}
              </AnimatePresence>
            </button>
          </div>

          {/* Desktop CTA */}
          <div className="hidden md:block">
            <Button
              onClick={() => scrollTo('#download')}
              className="bg-gradient-to-r from-cyan-500 to-sky-500 text-white shadow-lg shadow-cyan-500/25 hover:from-cyan-400 hover:to-sky-400"
            >
              <Download className="h-4 w-4" />
              Download
            </Button>
          </div>

          {/* Mobile menu toggle — 44px touch target */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="flex h-11 w-11 items-center justify-center rounded-xl text-slate-300 transition-colors hover:bg-white/5 md:hidden lp-touch-target focus-visible:ring-2 focus-visible:ring-cyan-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {/* Mobile menu overlay */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setMobileMenuOpen(false)}
              className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm md:hidden"
            />
          )}
        </AnimatePresence>

        {/* Mobile menu with slide-in animation */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div
              initial={{ y: -20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -20, opacity: 0 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
              className="absolute left-0 right-0 top-full z-50 overflow-hidden border-t border-white/5 lp-nav-bg backdrop-blur-xl md:hidden"
            >
              <div className="space-y-1 px-4 py-4">
                {navLinks.map((link, idx) => (
                  <motion.button
                    key={link.href}
                    initial={{ x: -16, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{ delay: idx * 0.05 + 0.1, duration: 0.25 }}
                    onClick={() => scrollTo(link.href)}
                    className={`block w-full rounded-lg px-3 py-3 text-left text-sm transition-colors hover:bg-white/5 lp-touch-target focus-visible:ring-2 focus-visible:ring-cyan-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent ${
                      activeSection === link.sectionId
                        ? 'text-cyan-400'
                        : 'lp-text-primary hover:lp-text-heading'
                    }`}
                  >
                    {link.label}
                  </motion.button>
                ))}
                <Separator className="my-2 bg-white/5" />
                {/* Theme toggle in mobile menu — larger touch target */}
                <motion.button
                  initial={{ x: -16, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  transition={{ delay: 0.3, duration: 0.25 }}
                  onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm lp-text-primary transition-colors hover:bg-white/5 hover:lp-text-heading lp-touch-target focus-visible:ring-2 focus-visible:ring-cyan-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
                >
                  {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                  {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
                </motion.button>
                <motion.div
                  initial={{ y: 8, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.35, duration: 0.25 }}
                >
                  <Button
                    onClick={() => scrollTo('#download')}
                    className="w-full min-h-[44px] lp-touch-target bg-gradient-to-r from-cyan-500 to-sky-500 text-white shadow-lg shadow-cyan-500/25 active:scale-[0.97] transition-transform duration-100"
                  >
                    <Download className="h-4 w-4" />
                    Download
                  </Button>
                </motion.div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </nav>

      <main>
        {/* ═══════ HERO SECTION ═══════ */}
        <section ref={heroRef} className="relative overflow-hidden pt-32 pb-20 sm:pt-40 sm:pb-28" onMouseMove={(e) => { const r = heroRef.current?.getBoundingClientRect(); if (r) setHeroMousePos({ x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 }); }}>
          <ParticleCanvas />
          {/* Phase 5: Animated gradient mesh background */}
          <div className="pointer-events-none absolute inset-0 -z-5 gradient-mesh opacity-60" />
          {/* Phase 5: Mouse-following spotlight */}
          <div className="hero-spotlight">
            <div className="hero-spotlight-inner" style={{ left: `${heroMousePos.x}%`, top: `${heroMousePos.y}%` }} />
          </div>
          {/* Phase 5: CSS-only floating particles */}
          <div className="pointer-events-none absolute inset-0 -z-5 overflow-hidden">
            <div className="float-particle absolute bottom-0 left-[15%] h-1.5 w-1.5 rounded-full bg-cyan-400/30" style={{ animationDuration: '12s', animationDelay: '0s' }} />
            <div className="float-particle absolute bottom-0 left-[45%] h-1 w-1 rounded-full bg-sky-400/25" style={{ animationDuration: '16s', animationDelay: '3s' }} />
            <div className="float-particle absolute bottom-0 left-[75%] h-2 w-2 rounded-full bg-teal-400/20" style={{ animationDuration: '14s', animationDelay: '6s' }} />
            <div className="float-particle absolute bottom-0 left-[30%] h-1 w-1 rounded-full bg-cyan-300/20" style={{ animationDuration: '18s', animationDelay: '9s' }} />
          </div>
          {/* Background glows */}
          <div className="pointer-events-none absolute inset-0 -z-0">
            <div className="absolute left-1/4 top-0 h-[500px] w-[500px] -translate-y-1/2 rounded-full bg-cyan-500/10 blur-[120px]" />
            <div className="absolute bottom-0 right-1/4 h-[400px] w-[400px] translate-y-1/2 rounded-full bg-sky-500/10 blur-[120px]" />
          </div>

          {/* Animated gradient orbs */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden -z-5">
            <div className="absolute left-[10%] top-[20%] h-72 w-72 animate-pulse rounded-full bg-cyan-500/[0.07] blur-3xl" />
            <div className="absolute right-[15%] top-[40%] h-96 w-96 animate-pulse rounded-full bg-sky-500/[0.05] blur-3xl [animation-delay:1s]" />
            <div className="absolute left-[30%] bottom-[10%] h-64 w-64 animate-pulse rounded-full bg-teal-500/[0.06] blur-3xl [animation-delay:2s]" />
            <div className="absolute right-[5%] bottom-[30%] h-80 w-80 animate-pulse rounded-full bg-cyan-400/[0.04] blur-3xl [animation-delay:0.5s]" />
          </div>

          {/* Animated grid lines */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden opacity-[0.015]">
            <div className="absolute inset-0" style={{
              backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)',
              backgroundSize: '60px 60px'
            }} />
          </div>

          <div className="relative mx-auto max-w-6xl px-4 sm:px-6">
            <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
              {/* Left — text content */}
              <motion.div
                initial="hidden"
                animate="visible"
                variants={stagger}
                className="text-center lg:text-left"
              >
                <motion.div variants={fadeUp} custom={0}>
                  <Badge
                    variant="outline"
                    className="mb-6 border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-cyan-300"
                  >
                    <Zap className="mr-1.5 h-3 w-3" />
                    AI-Powered Chrome Extension
                  </Badge>
                </motion.div>

                <motion.h1
                  variants={fadeUp}
                  custom={1}
                  className="text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl lg:text-6xl"
                >
                  <span className={`bg-gradient-to-b from-[var(--lp-text-heading)] via-[var(--lp-text-heading)] to-[var(--lp-text-muted)] bg-clip-text text-transparent`}>
                    Capture, Annotate
                  </span>
                  <br />
                  <span className="bg-gradient-to-r from-cyan-300 via-sky-400 to-teal-300 bg-clip-text text-transparent animated-gradient-text">
                    <TypingText phrases={[
                      '& Analyze Any Web Page',
                      '& Extract Text via OCR',
                      '& Compare Pages Visually',
                      '& Export in Any Format',
                    ]} />
                  </span>
                </motion.h1>

                <motion.p
                  variants={fadeUp}
                  custom={2}
                  className="text-base leading-relaxed lp-text-card-muted sm:text-lg lg:mx-0"
                >
                  AI-powered full-page screenshot tool with smart annotations, OCR, and visual
                  diff. All processing happens locally in your browser —{' '}
                  <span className="lp-text-card">zero data leaves your device.</span>
                </motion.p>

                <motion.div
                  variants={fadeUp}
                  custom={3}
                  className="mt-8 flex flex-wrap items-center justify-center gap-3 lg:justify-start"
                >
                  <Button
                    onClick={() => scrollTo('#download')}
                    size="lg"
                    className="lp-touch-target bg-gradient-to-r from-cyan-500 to-sky-500 px-6 py-6 text-white shadow-xl shadow-cyan-500/25 transition-all hover:shadow-cyan-500/40 hover:brightness-110 active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-cyan-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
                  >
                    <Download className="h-4 w-4" />
                    Download for Chrome
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="lg"
                    onClick={() => scrollTo('#features')}
                    className="border-white/10 bg-white/5 px-6 py-6 lp-text-primary hover:border-white/20 hover:bg-white/10 active:scale-[0.97] transition-transform duration-100 focus-visible:ring-2 focus-visible:ring-cyan-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
                  >
                    See Features
                  </Button>
                </motion.div>

                <motion.div
                  variants={fadeUp}
                  custom={4}
                  className="mt-8 flex items-center justify-center gap-6 text-sm lp-text-card-muted lg:justify-start"
                >
                  <div className="flex items-center gap-1.5">
                    <Check className="h-4 w-4 text-emerald-400" />
                    Free to start
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Check className="h-4 w-4 text-emerald-400" />
                    No account needed
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Check className="h-4 w-4 text-emerald-400" />
                    100% Private
                  </div>
                </motion.div>

                {/* Ctrl+K command palette hint */}
                <motion.div
                  variants={fadeUp}
                  custom={5}
                  className="mt-6 flex items-center justify-center lg:justify-start"
                >
                  <button
                    onClick={() => setShowCommandPalette(true)}
                    className="inline-flex items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-1.5 text-xs lp-text-muted transition-colors hover:border-white/[0.12] hover:bg-white/[0.05]"
                  >
                    <Search className="h-3.5 w-3.5" />
                    <span>Search...</span>
                    <kbd className="rounded-md border border-white/[0.08] bg-white/[0.04] px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
                      Ctrl+K
                    </kbd>
                  </button>
                </motion.div>
              </motion.div>

              {/* Right — extension popup demo */}
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ delay: 0.3, duration: 0.8, ease: 'easeOut' }}
                className="flex justify-center lg:justify-end"
              >
                <ExtensionDemo />
              </motion.div>
            </div>
          </div>
        </section>

        {/* ═══════ FEATURES SECTION ═══════ */}
        <AnimatedSection
          id="features"
          className="relative py-20 sm:py-28"
        >
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            {/* Section header */}
            <motion.div variants={fadeUp} custom={0} className="text-center">
              <Badge
                variant="outline"
                className="mb-4 border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-cyan-300"
              >
                <Sparkles className="mr-1.5 h-3 w-3" />
                Features
              </Badge>
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">
                <span className={`bg-gradient-to-b from-[var(--lp-text-heading)] via-[var(--lp-text-heading)] to-[var(--lp-text-muted)] bg-clip-text text-transparent`}>
                  Everything You Need to
                </span>
                <br />
                <span className="bg-gradient-to-r from-cyan-300 to-sky-400 bg-clip-text text-transparent">
                  Capture &amp; Analyze
                </span>
              </h2>
              <p className="mx-auto mt-4 max-w-2xl lp-text-card-muted">
                Powerful features designed for designers, developers, QA engineers, and anyone
                who needs to capture web content.
              </p>
            </motion.div>

            {/* Feature cards grid — mobile optimized */}
            <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {features.map((f, i) => (
                <motion.div
                  key={f.title}
                  variants={fadeUp}
                  custom={i + 1}
                  whileHover={{ y: -4, transition: { duration: 0.2 } }}
                  className={`group relative overflow-hidden rounded-2xl border lp-card-border lp-card-bg p-6 backdrop-blur-sm transition-all duration-300 hover:border-cyan-500/30 hover:shadow-2xl hover:shadow-cyan-500/10 focus-within:-translate-y-0.5 focus-within:shadow-lg focus-within:shadow-cyan-500/5 active:scale-[0.98] min-h-[120px] md:min-h-0 ${
                    f.title === 'Visual Diff' ? 'animated-gradient-border' : ''
                  }`}
                >
                  {/* Hover glow - more dramatic */}
                  <div className="pointer-events-none absolute -inset-1 -z-10 rounded-2xl bg-gradient-to-b from-cyan-500/20 to-transparent opacity-0 blur-sm transition-opacity duration-300 group-hover:opacity-100" />
                  {/* Gradient border animation on hover */}
                  <div className="pointer-events-none absolute inset-0 rounded-2xl opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                    <div className="absolute inset-0 rounded-2xl bg-gradient-to-b from-cyan-500/20 via-transparent to-transparent" />
                  </div>

                  {/* Phase 6: Shimmer sweep on first view */}
                  <div className="pointer-events-none absolute inset-0 -z-0 overflow-hidden rounded-2xl">
                    <motion.div
                      initial={{ x: '-100%' }}
                      whileInView={{ x: '200%' }}
                      viewport={{ once: true }}
                      transition={{ duration: 1.2, delay: i * 0.15, ease: 'easeOut' }}
                      className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-white/[0.04] to-transparent"
                    />
                  </div>
                  {/* #8: Enhanced Feature Cards — OCR shimmer badge */}
                  {f.title === 'OCR Text Extraction' && (
                    <span className="absolute right-4 top-4 relative overflow-hidden rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400 shimmer-badge">
                      AI Powered
                    </span>
                  )}
                  {f.title === 'Visual Diff' && (
                    <span className="absolute right-4 top-4 rounded-full bg-violet-500/10 border border-violet-500/20 px-2 py-0.5 text-[10px] font-medium text-violet-400">
                      Pixel-Level
                    </span>
                  )}

                  {/* Phase 6: Animated icon pulse on viewport entry */}
                  <motion.div
                    initial={{ scale: 0.8, opacity: 0 }}
                    whileInView={{ scale: 1, opacity: 1 }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.15, type: 'spring', stiffness: 300, damping: 20 }}
                    className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500/20 to-sky-500/10 text-cyan-400 transition-colors group-hover:from-cyan-500/30 group-hover:to-sky-500/20"
                  >
                    <f.icon className="h-6 w-6" />
                  </motion.div>
                  <h3 className="mb-2 text-lg font-semibold lp-text-heading">{f.title}</h3>
                  <p className="text-sm leading-relaxed lp-text-card">{f.description}</p>
                  {/* Phase 6: Learn more link */}
                  <button
                    onClick={() => {
                      const targets: Record<string, string> = { 'Full-Page Capture': '#how-it-works', 'Smart Annotations': '#features', 'OCR Text Extraction': '#features', 'Visual Diff': '#pricing', 'Multi-Format Export': '#download', 'Local & Private': '#faq' };
                      const target = targets[f.title] || '#features';
                      document.querySelector(target)?.scrollIntoView({ behavior: 'smooth' });
                    }}
                    className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-cyan-400/70 transition-colors hover:text-cyan-400"
                  >
                    Learn more <ExternalLink className="h-3 w-3" />
                  </button>
                </motion.div>
              ))}
            </div>
          </div>
        </AnimatedSection>

        <div className="section-divider-ornament" />

        {/* ═══════ SEE IT IN ACTION SECTION ═══════ */}
        <AnimatedSection
          className="relative py-20 sm:py-28"
        >
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            {/* Section header */}
            <motion.div variants={fadeUp} custom={0} className="text-center">
              <Badge
                variant="outline"
                className="mb-4 border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-cyan-300"
              >
                <Play className="mr-1.5 h-3 w-3" />
                Live Demo
              </Badge>
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">
                <span className={`bg-gradient-to-b from-[var(--lp-text-heading)] via-[var(--lp-text-heading)] to-[var(--lp-text-muted)] bg-clip-text text-transparent`}>
                  See It In Action
                </span>
              </h2>
              <p className="mx-auto mt-4 max-w-2xl lp-text-card-muted">
                Watch our key features come to life with interactive demonstrations.
              </p>
            </motion.div>

            {/* Demo tab selector */}
            <motion.div variants={fadeUp} custom={1} className="mt-10 flex flex-wrap justify-center gap-2">
              {([
                { id: 'capture' as const, label: 'Full-Page Capture', icon: Camera },
                { id: 'annotation' as const, label: 'Annotation', icon: PenTool },
                { id: 'diff' as const, label: 'Visual Diff', icon: GitCompare },
              ]).map((demo) => (
                <button
                  key={demo.id}
                  onClick={() => setActiveDemo(demo.id)}
                  className={`flex items-center gap-2 rounded-xl border px-5 py-2.5 text-sm font-medium transition-all duration-300 ${
                    activeDemo === demo.id
                      ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-300 shadow-lg shadow-cyan-500/10'
                      : 'border-white/[0.06] bg-white/[0.02] text-slate-400 hover:border-white/10 hover:bg-white/[0.04] hover:text-slate-200'
                  }`}
                >
                  <demo.icon className="h-4 w-4" />
                  {demo.label}
                </button>
              ))}
            </motion.div>

            {/* Demo panels */}
            <motion.div variants={fadeUp} custom={2} className="mt-8">
              <AnimatePresence mode="wait">
                {/* Demo 1: Full-Page Capture */}
                {activeDemo === 'capture' && (
                  <motion.div
                    key="capture"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    transition={{ duration: 0.4 }}
                    className="mx-auto max-w-3xl overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-sm"
                  >
                    {/* Mock browser chrome */}
                    <div className="flex items-center gap-2 border-b border-white/[0.06] bg-white/[0.03] px-4 py-2.5">
                      <div className="flex gap-1.5">
                        <div className="h-3 w-3 rounded-full bg-red-500/70" />
                        <div className="h-3 w-3 rounded-full bg-yellow-500/70" />
                        <div className="h-3 w-3 rounded-full bg-green-500/70" />
                      </div>
                      <div className="flex-1 rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-1">
                        <p className="text-xs text-slate-500">https://example.com/documentation/long-page</p>
                      </div>
                    </div>

                    {/* Simulated page being captured */}
                    <div className="relative h-72 overflow-hidden bg-slate-900/50">
                      {/* Fake page content */}
                      <div className="space-y-4 p-5">
                        <div className="h-5 w-2/3 rounded bg-gradient-to-r from-cyan-500/15 to-transparent" />
                        <div className="h-3 w-full rounded bg-white/[0.04]" />
                        <div className="h-3 w-4/5 rounded bg-white/[0.04]" />
                        <div className="h-3 w-3/5 rounded bg-white/[0.04]" />
                        <div className="mt-4 h-28 w-full rounded-lg bg-gradient-to-br from-cyan-500/10 to-sky-500/5 border border-white/[0.04]" />
                        <div className="h-3 w-full rounded bg-white/[0.04]" />
                        <div className="h-3 w-2/3 rounded bg-white/[0.04]" />
                        <div className="h-3 w-3/4 rounded bg-white/[0.04]" />
                        <div className="h-3 w-1/2 rounded bg-white/[0.04]" />
                        <div className="mt-4 h-5 w-1/2 rounded bg-gradient-to-r from-cyan-500/10 to-transparent" />
                        <div className="h-3 w-full rounded bg-white/[0.04]" />
                        <div className="h-3 w-4/5 rounded bg-white/[0.04]" />
                      </div>

                      {/* Scanning line animation */}
                      <motion.div
                        className="absolute left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-cyan-400 to-transparent shadow-lg shadow-cyan-400/50"
                        animate={{ top: ['0%', '95%', '0%'] }}
                        transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                      />
                      {/* Scan glow */}
                      <motion.div
                        className="absolute left-0 right-0 h-8 bg-gradient-to-b from-cyan-400/10 to-transparent"
                        animate={{ top: ['0%', '91%', '0%'] }}
                        transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                      />

                      {/* Progress indicator */}
                      <div className="absolute bottom-4 left-4 right-4">
                        <div className="flex items-center gap-3 rounded-xl border border-cyan-500/20 bg-[#0B1120]/80 px-4 py-2.5 backdrop-blur-md">
                          <motion.div
                            animate={{ rotate: 360 }}
                            transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                          >
                            <Camera className="h-4 w-4 text-cyan-400" />
                          </motion.div>
                          <span className="text-sm font-medium text-cyan-300 whitespace-nowrap">Capturing...</span>
                          <div className="flex-1">
                            <div className="h-1.5 overflow-hidden rounded-full bg-cyan-500/20">
                              <motion.div
                                className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-sky-400"
                                animate={{ width: ['0%', '67%', '100%', '0%'] }}
                                transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut', times: [0, 0.5, 0.85, 1] }}
                              />
                            </div>
                          </div>
                          <motion.span
                            className="text-sm font-bold text-cyan-300 tabular-nums min-w-[3ch] text-right"
                            animate={{ opacity: [1, 1, 1, 0.4] }}
                            transition={{ duration: 5, repeat: Infinity, times: [0, 0.5, 0.85, 0.95] }}
                          >
                            67%
                          </motion.span>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* Demo 2: Smart Annotation */}
                {activeDemo === 'annotation' && (
                  <motion.div
                    key="annotation"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    transition={{ duration: 0.4 }}
                    className="mx-auto max-w-3xl overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-sm"
                  >
                    <div className="relative h-80 bg-[#0d1425] p-6">
                      {/* Grid background */}
                      <div
                        className="absolute inset-0 opacity-[0.06]"
                        style={{
                          backgroundImage: 'linear-gradient(rgba(255,255,255,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.3) 1px, transparent 1px)',
                          backgroundSize: '20px 20px',
                        }}
                      />

                      {/* Mock UI elements */}
                      <div className="relative z-0 space-y-3">
                        <div className="h-4 w-24 rounded bg-white/[0.06]" />
                        <div className="flex gap-3">
                          <div className="h-20 w-32 rounded-lg bg-gradient-to-br from-violet-500/15 to-purple-500/10 border border-white/[0.04]" />
                          <div className="flex-1 space-y-2">
                            <div className="h-3 w-3/4 rounded bg-white/[0.05]" />
                            <div className="h-3 w-full rounded bg-white/[0.05]" />
                            <div className="h-3 w-1/2 rounded bg-white/[0.05]" />
                          </div>
                        </div>
                        <div className="mt-4 h-3 w-full rounded bg-white/[0.04]" />
                        <div className="h-3 w-5/6 rounded bg-white/[0.04]" />
                        <div className="h-10 w-28 rounded-lg bg-cyan-500/10 border border-cyan-500/20" />
                      </div>

                      {/* SVG Annotations overlay */}
                      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 600 320" fill="none">
                        <defs>
                          <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                            <polygon points="0 0, 10 3.5, 0 7" fill="#f59e0b" />
                          </marker>
                        </defs>

                        {/* Red rectangle - border drawing */}
                        <motion.rect
                          x={50} y={25} width={170} height={90} rx={6}
                          stroke="#ef4444" strokeWidth={2} fill="rgba(239,68,68,0.05)"
                          initial={{ pathLength: 0, opacity: 0 }}
                          animate={{ pathLength: 1, opacity: 1 }}
                          transition={{ duration: 1.2, delay: 0.3, ease: 'easeOut' }}
                        />

                        {/* Arrow */}
                        <motion.line
                          x1={240} y1={45} x2={380} y2={130}
                          stroke="#f59e0b" strokeWidth={2} markerEnd="url(#arrowhead)"
                          initial={{ pathLength: 0, opacity: 0 }}
                          animate={{ pathLength: 1, opacity: 1 }}
                          transition={{ duration: 0.8, delay: 1.6, ease: 'easeOut' }}
                        />

                        {/* "Bug here!" label */}
                        <motion.g
                          initial={{ opacity: 0, y: -8 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.5, delay: 2.4 }}
                        >
                          <rect x={385} y={122} width={90} height={28} rx={6} fill="#f59e0b" />
                          <text x={430} y={141} textAnchor="middle" fill="#0B1120" fontSize={13} fontWeight="bold">
                            Bug here!
                          </text>
                        </motion.g>

                        {/* Highlight blur area */}
                        <motion.rect
                          x={50} y={220} width={200} height={40} rx={4}
                          fill="rgba(139,92,246,0.15)" stroke="#8b5cf6" strokeWidth={1.5} strokeDasharray="6 3"
                          initial={{ opacity: 0, scaleX: 0 }}
                          animate={{ opacity: 1, scaleX: 1 }}
                          transition={{ duration: 0.6, delay: 3 }}
                          style={{ transformOrigin: 'left center' }}
                        />
                      </svg>

                      {/* Tool indicator */}
                      <motion.div
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.5 }}
                        className="absolute right-4 top-4 flex items-center gap-2 rounded-lg border border-white/[0.06] bg-[#0B1120]/80 px-3 py-1.5 backdrop-blur-md"
                      >
                        <PenTool className="h-3.5 w-3.5 text-cyan-400" />
                        <span className="text-xs text-slate-300">Annotation Mode</span>
                      </motion.div>
                    </div>
                  </motion.div>
                )}

                {/* Demo 3: Visual Diff */}
                {activeDemo === 'diff' && (
                  <motion.div
                    key="diff"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    transition={{ duration: 0.4 }}
                    className="mx-auto max-w-3xl overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-sm"
                  >
                    <div className="p-6">
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-stretch sm:gap-6">
                        {/* Before */}
                        <motion.div
                          initial={{ opacity: 0, x: -30 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.2 }}
                          className="flex-1 overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.02]"
                        >
                          <div className="border-b border-white/[0.06] px-3 py-2">
                            <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500">Before</p>
                          </div>
                          <div className="relative aspect-video bg-gradient-to-br from-slate-700/50 to-slate-800/50">
                            <div className="absolute inset-3 space-y-1.5">
                              <div className="h-2.5 w-3/4 rounded bg-blue-400/20" />
                              <div className="h-2 w-full rounded bg-white/[0.06]" />
                              <div className="h-2 w-5/6 rounded bg-white/[0.06]" />
                              <div className="mt-2 h-14 w-full rounded bg-gradient-to-r from-blue-500/10 to-violet-500/10 border border-blue-500/10" />
                              <div className="h-2 w-2/3 rounded bg-red-400/15" />
                            </div>
                          </div>
                        </motion.div>

                        {/* Diff indicator */}
                        <motion.div
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: 0.5, type: 'spring', stiffness: 200 }}
                          className="flex flex-row items-center justify-center gap-4 sm:flex-col sm:gap-3"
                        >
                          <div className="flex flex-col items-center gap-2 rounded-xl border border-cyan-500/20 bg-cyan-500/5 px-4 py-3 backdrop-blur-sm">
                            <span className="text-2xl font-bold text-cyan-300">3</span>
                            <span className="text-[10px] font-medium uppercase tracking-wider text-cyan-400/80">Changes</span>
                          </div>
                          <div className="flex flex-col gap-1.5">
                            <div className="flex items-center gap-2">
                              <div className="h-2.5 w-2.5 rounded-full bg-green-400" />
                              <span className="text-[11px] text-slate-400">2 added</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="h-2.5 w-2.5 rounded-full bg-red-400" />
                              <span className="text-[11px] text-slate-400">1 removed</span>
                            </div>
                          </div>
                        </motion.div>

                        {/* After */}
                        <motion.div
                          initial={{ opacity: 0, x: 30 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.2 }}
                          className="flex-1 overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.02]"
                        >
                          <div className="border-b border-white/[0.06] px-3 py-2">
                            <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500">After</p>
                          </div>
                          <div className="relative aspect-video bg-gradient-to-br from-slate-700/50 to-slate-800/50">
                            <div className="absolute inset-3 space-y-1.5">
                              <div className="h-2.5 w-3/4 rounded bg-blue-400/20" />
                              <div className="h-2 w-full rounded bg-white/[0.06]" />
                              <div className="h-2 w-5/6 rounded bg-white/[0.06]" />
                              <div className="mt-2 h-14 w-full rounded bg-gradient-to-r from-emerald-500/15 to-teal-500/10 border border-emerald-500/15" />
                              <div className="h-2 w-4/5 rounded bg-green-400/15" />
                              {/* Green highlight for addition */}
                              <motion.div
                                className="mt-1 h-2 w-2/3 rounded bg-green-400/10 border border-green-400/20"
                                initial={{ opacity: 0, scaleX: 0 }}
                                animate={{ opacity: 1, scaleX: 1 }}
                                transition={{ delay: 0.8 }}
                                style={{ transformOrigin: 'left center' }}
                              />
                            </div>
                          </div>
                        </motion.div>
                      </div>

                      {/* Bottom info bar */}
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.8 }}
                        className="mt-4 flex items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-2.5"
                      >
                        <div className="flex items-center gap-2 text-xs text-slate-400">
                          <GitCompare className="h-3.5 w-3.5 text-violet-400" />
                          <span>Pixel-level comparison</span>
                        </div>
                        <div className="flex gap-1.5">
                          <span className="rounded-full bg-green-500/10 px-2 py-0.5 text-[10px] font-medium text-green-400">+2</span>
                          <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-medium text-red-400">−1</span>
                        </div>
                      </motion.div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          </div>
        </AnimatedSection>

        <div className="section-divider-ornament" />

        {/* ═══════ VISUAL DIFF IN ACTION SECTION ═══════ */}
        <AnimatedSection
          className="relative py-20 sm:py-28"
        >
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            {/* Section header */}
            <motion.div variants={fadeUp} custom={0} className="text-center">
              <Badge
                variant="outline"
                className="mb-4 border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-cyan-300"
              >
                <GitCompare className="mr-1.5 h-3 w-3" />
                Visual Diff
              </Badge>
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">
                <span className={`bg-gradient-to-b from-[var(--lp-text-heading)] via-[var(--lp-text-heading)] to-[var(--lp-text-muted)] bg-clip-text text-transparent`}>
                  Visual Diff
                </span>{' '}
                <span className="bg-gradient-to-r from-cyan-300 to-sky-400 bg-clip-text text-transparent">
                  in Action
                </span>
              </h2>
              <p className="mx-auto mt-4 max-w-2xl lp-text-card-muted">
                See every pixel change with our visual diff engine. Drag the slider to compare before and after states.
              </p>
            </motion.div>

            <div className="mt-10">
              <BeforeAfterSlider />
            </div>
          </div>
        </AnimatedSection>

        <div className="section-divider-ornament" />

        {/* ═══════ HOW IT WORKS SECTION ═══════ */}
        <AnimatedSection
          id="how-it-works"
          className="relative py-20 sm:py-28"
        >
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <motion.div variants={fadeUp} custom={0} className="text-center">
              <Badge
                variant="outline"
                className="mb-4 border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-cyan-300"
              >
                <Zap className="mr-1.5 h-3 w-3" />
                Simple &amp; Fast
              </Badge>
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">
                <span className={`bg-gradient-to-b from-[var(--lp-text-heading)] via-[var(--lp-text-heading)] to-[var(--lp-text-muted)] bg-clip-text text-transparent`}>
                  How It Works
                </span>
              </h2>
              <p className="mx-auto mt-4 max-w-2xl lp-text-card-muted">
                Three simple steps to capture and process any web page content.
              </p>
            </motion.div>

            {/* Steps timeline with animated connectors */}
            <div className="relative mt-16">
              {/* Horizontal gradient connector (desktop) */}
              <div className="pointer-events-none absolute left-[16.666%] right-[16.666%] top-16 hidden md:block">
                <div className="h-[2px] w-full bg-gradient-to-r from-cyan-400/0 via-cyan-400/30 to-sky-400/0" />
                {/* Pulsing dots at step positions */}
                {[0, 1, 2].map((idx) => (
                  <motion.div
                    key={idx}
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 0.5 + idx * 0.3, duration: 0.4 }}
                    className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
                    style={{ left: `${idx * 50}%` }}
                  >
                    <div className="step-pulse-dot h-3 w-3 rounded-full bg-gradient-to-r from-cyan-400 to-sky-400" />
                  </motion.div>
                ))}
              </div>

              {/* Vertical gradient connector (mobile) */}
              <div className="pointer-events-none absolute left-1/2 top-16 bottom-16 -translate-x-1/2 md:hidden">
                <div className="h-full w-[2px] bg-gradient-to-b from-cyan-400/30 via-cyan-400/20 to-sky-400/0" />
                {[0, 1].map((idx) => (
                  <motion.div
                    key={idx}
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 0.5 + idx * 0.3, duration: 0.4 }}
                    className="absolute left-1/2 -translate-x-1/2"
                    style={{ top: `${(idx + 1) * 33}%` }}
                  >
                    <div className="step-pulse-dot h-2.5 w-2.5 rounded-full bg-gradient-to-b from-cyan-400 to-sky-400" />
                  </motion.div>
                ))}
              </div>

              <div className="grid gap-8 md:grid-cols-3 md:gap-6">
                {steps.map((step, i) => (
                  <motion.div
                    key={step.title}
                    variants={fadeUp}
                    custom={i + 1}
                    className="relative flex flex-col items-center text-center"
                  >
                    {/* Step circle with glow */}
                    <motion.div
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ delay: 0.3 + i * 0.2, duration: 0.5, type: 'spring' }}
                      className="relative z-10 mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10 lp-card-bg shadow-lg backdrop-blur-sm"
                      style={{ boxShadow: '0 0 20px rgba(6,182,212,0.15)' }}
                    >
                      <step.icon className="h-7 w-7 text-cyan-400" />
                    </motion.div>

                    {/* Step number */}
                    <span className="mb-2 text-xs font-bold tracking-widest text-cyan-400/70">
                      0{i + 1}
                    </span>

                    {/* Step card with glass effect */}
                    <div className="w-full max-w-xs rounded-2xl border border-white/[0.06] lp-card-bg p-5 backdrop-blur-sm transition-all duration-300 hover:border-cyan-500/20 hover:shadow-xl hover:shadow-cyan-500/5 hover:-translate-y-1">
                      <h3 className="mb-2 text-lg font-semibold lp-text-heading">{step.title}</h3>
                      <p className="text-sm leading-relaxed lp-text-card">
                        {step.description}
                      </p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          </div>
        </AnimatedSection>

        <div className="section-divider-ornament" />

        {/* ═══════ SUPPORTED PLATFORMS / USE CASES SECTION ═══════ */}
        <LazySection className="relative py-20 sm:py-28">
          <AnimatedSection>
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <motion.div variants={fadeUp} custom={0} className="text-center">
              <Badge
                variant="outline"
                className="mb-4 border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-cyan-300"
              >
                <Layers className="mr-1.5 h-3 w-3" />
                Built For
              </Badge>
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">
                <span className={`bg-gradient-to-b from-[var(--lp-text-heading)] via-[var(--lp-text-heading)] to-[var(--lp-text-muted)] bg-clip-text text-transparent`}>
                  Works Everywhere
                </span>{' '}
                <span className="bg-gradient-to-r from-cyan-300 to-sky-400 bg-clip-text text-transparent">
                  You Do
                </span>
              </h2>
            </motion.div>

            {/* Platform pills */}
            <motion.div
              variants={fadeUp}
              custom={1}
              className="mt-10 flex flex-wrap items-center justify-center gap-3"
            >
              {platforms.map((platform) => (
                <div
                  key={platform.label}
                  className="platform-pill flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] px-4 py-2 text-sm text-slate-300 backdrop-blur-sm hover:border-cyan-500/20 hover:bg-white/[0.06]"
                >
                  <span className={`h-2.5 w-2.5 rounded-full ${platform.color}`} />
                  <span className="text-base leading-none">{platform.label === 'Chrome' ? '🌐' : platform.label === 'React Apps' ? '⚛️' : platform.label === 'Vue Apps' ? '💚' : platform.label === 'Next.js' ? '▲' : platform.label === 'Angular' ? '🅰️' : platform.label === 'Svelte' ? '🔥' : platform.label === 'SPA Sites' ? '⚡' : platform.label === 'WordPress' ? '📝' : platform.label === 'Documentation Sites' ? '📖' : '🛒'}</span>
                </div>
              ))}
            </motion.div>

            {/* Use case cards */}
            <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {useCases.map((uc, i) => (
                <motion.div
                  key={uc.title}
                  variants={fadeUp}
                  custom={i + 2}
                  whileHover={{ y: -4, transition: { duration: 0.2 } }}
                  className="glass-card glass-card-hover card-hover-lift group p-6"
                >
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500/20 to-sky-500/10 text-cyan-400 transition-colors group-hover:from-cyan-500/30 group-hover:to-sky-500/20">
                    <uc.icon className="h-6 w-6" />
                  </div>
                  <h3 className="mb-2 text-lg font-semibold lp-text-heading">{uc.title}</h3>
                  <p className="text-sm leading-relaxed lp-text-card">{uc.description}</p>
                </motion.div>
              ))}
            </div>
          </div>
          </AnimatedSection>
        </LazySection>



        {/* ═══════ STATS COUNTER SECTION ═══════ */}
        <LazySection
          id="stats"
          className="relative py-16 sm:py-20 section-bg-alt"
        >
          <AnimatedSection>
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <motion.div variants={fadeUp} custom={0} className="text-center">
              <p className="text-sm font-medium uppercase tracking-wider text-cyan-400">
                Beta Progress
              </p>
            </motion.div>

            <motion.div
              variants={fadeUp}
              custom={1}
              className="mt-10 grid grid-cols-2 gap-5 md:grid-cols-4 md:gap-4"
            >
              {stats.map((stat, i) => (
                <motion.div
                  key={stat.label}
                  variants={fadeUp}
                  custom={i + 2}
                  whileHover={{ y: -4, transition: { duration: 0.2 } }}
                  className={`stat-border-glow relative flex flex-col items-center rounded-2xl border border-white/[0.06] px-4 py-8 text-center transition-all duration-300 hover:border-cyan-500/20 stat-card-gradient-${i + 1}`}
                >
                  <stat.icon className="mb-3 h-5 w-5 text-cyan-400/70 float-animation" style={{ animationDelay: `${i * 0.5}s` }} />
                  <p className="text-3xl font-extrabold sm:text-4xl">
                    <span className="bg-gradient-to-r from-cyan-300 to-sky-400 bg-clip-text text-transparent">
                      <AnimatedCounter
                        target={stat.target}
                        suffix={stat.suffix}
                        decimals={stat.decimals}
                      />
                    </span>
                  </p>
                  <p className="mt-1.5 text-sm lp-text-card-muted">{stat.label}</p>
                </motion.div>
              ))}
            </motion.div>
          </div>
          </AnimatedSection>
        </LazySection>

        <div className="section-divider-ornament" />

        {/* ═══════ PRICING SECTION ═══════ */}
        <AnimatedSection
          id="pricing"
          className="relative py-20 sm:py-28"
        >
          {/* Background accent */}
          <div className="pointer-events-none absolute inset-0 -z-0">
            <div className="absolute left-1/2 top-1/2 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-500/5 blur-[120px]" />
          </div>

          <div className="relative mx-auto max-w-6xl px-4 sm:px-6">
            <motion.div variants={fadeUp} custom={0} className="text-center">
              <Badge
                variant="outline"
                className="mb-4 border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-cyan-300"
              >
                Pricing
              </Badge>
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">
                <span className={`bg-gradient-to-b from-[var(--lp-text-heading)] via-[var(--lp-text-heading)] to-[var(--lp-text-muted)] bg-clip-text text-transparent`}>
                  Simple, Transparent Pricing
                </span>
              </h2>
              <p className="mx-auto mt-4 max-w-2xl lp-text-card-muted">
                Start free today. Pro features coming soon.
              </p>
            </motion.div>

            <div className="mx-auto mt-14 grid max-w-4xl gap-6 md:grid-cols-2">

              {/* Billing period toggle removed — Pro is coming soon */}

              {tiers.map((tier, i) => (
                <motion.div
                  key={tier.name}
                  variants={fadeUp}
                  custom={i + 1}
                  whileHover={{ y: -4, transition: { duration: 0.2 } }}
                  className={`relative overflow-hidden rounded-2xl p-6 backdrop-blur-sm transition-all duration-300 sm:p-8 ${
                    tier.highlight
                      ? 'border-2 border-cyan-500/30 pro-card-rotating-border pro-card-shimmer bg-gradient-to-b from-cyan-500/10 via-white/[0.03] to-transparent shadow-xl shadow-cyan-500/10'
                      : 'pricing-dashed-border lp-card-bg hover:border-solid'
                  }`}
                >
                  {/* COMING SOON floating badge */}
                  {tier.highlight && (
                    <div className="absolute right-4 top-0 -translate-y-1/2 flex items-center gap-2">
                      <span className="badge-bounce inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 px-3 py-1 text-[11px] font-bold text-white shadow-lg shadow-amber-500/30">
                        <Clock className="h-3 w-3" />
                        COMING SOON
                      </span>
                    </div>
                  )}

                  <h3 className="text-xl font-bold lp-text-heading">{tier.name}</h3>
                  <div className="mt-3 flex items-baseline gap-1">
                    <AnimatePresence mode="wait">
                      <motion.span
                        key={`${tier.name}-${billingPeriod}`}
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -10, scale: 0.95 }}
                        transition={{ duration: 0.2 }}
                        className="text-4xl font-extrabold lp-text-heading"
                      >
                        {tier.highlight && billingPeriod === 'annual' ? '$6' : tier.price}
                      </motion.span>
                    </AnimatePresence>
                    <span className="text-sm lp-text-card-muted">
                      {tier.period}
                    </span>
                  </div>
                  {tier.highlight && (
                    <p className="mt-1 text-xs text-amber-400 font-medium">
                      Coming Soon — Pro features in development
                    </p>
                  )}
                  <Separator className="my-6 bg-white/[0.06]" />

                  <ul className="space-y-3.5">
                    {tier.features.map((feature, fi) => (
                      <motion.li
                        key={feature.text}
                        initial={{ opacity: 0, x: -8 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: fi * 0.05, duration: 0.3 }}
                        className="flex items-start gap-3"
                      >
                        {feature.included ? (
                          <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/10">
                            <Check className="h-3.5 w-3.5 text-emerald-400" />
                          </div>
                        ) : (
                          <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/[0.03]">
                            <X className="h-3 w-3 text-slate-600" />
                          </div>
                        )}
                        <div className="flex-1">
                          <span
                            className={`text-sm ${
                              feature.included ? 'lp-text-primary' : 'text-slate-600'
                            }`}
                          >
                            {feature.text}
                          </span>
                          {feature.detail && (
                            <span className="ml-1.5 text-xs lp-text-card-muted">
                              — {feature.detail}
                            </span>
                          )}
                        </div>
                      </motion.li>
                    ))}
                  </ul>

                  <Button
                    className={`mt-8 w-full lp-touch-target ${
                      tier.highlight
                        ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-lg shadow-amber-500/25 hover:shadow-amber-500/40 cursor-default opacity-70'
                        : 'border-white/10 bg-white/5 lp-text-primary hover:bg-white/10'
                    }`}
                    variant={tier.highlight ? 'default' : 'outline'}
                    size="lg"
                    disabled={tier.highlight}
                    onClick={() => !tier.highlight && scrollTo('#download')}
                  >
                    {tier.highlight ? 'Coming Soon' : 'Get Started Free'}
                    {!tier.highlight && <ArrowRight className="h-4 w-4" />}
                  </Button>
                </motion.div>
              ))}
            </div>
          </div>
        </AnimatedSection>

        <div className="section-divider-ornament" />

        {/* ═══════ FEATURE COMPARISON SECTION ═══════ */}
        <LazySection className="relative py-20 sm:py-28">
          <AnimatedSection>
          <div className="mx-auto max-w-4xl px-4 sm:px-6">
            <motion.div variants={fadeUp} custom={0} className="text-center">
              <Badge variant="outline" className="mb-4 border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-cyan-300">
                <Monitor className="mr-1.5 h-3 w-3" />
                Compare Plans
              </Badge>
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
                <span className={`bg-gradient-to-b from-[var(--lp-text-heading)] via-[var(--lp-text-heading)] to-[var(--lp-text-muted)] bg-clip-text text-transparent`}>
                  Detailed Feature
                </span>{' '}
                <span className="bg-gradient-to-r from-cyan-300 to-sky-400 bg-clip-text text-transparent">
                  Comparison
                </span>
              </h2>
            </motion.div>

            <motion.div variants={fadeUp} custom={1} className="mt-12 overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-sm">
              {/* Desktop Table */}
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow className="border-white/[0.06] hover:bg-transparent">
                      <TableHead className="lp-text-card-muted font-medium">Feature</TableHead>
                      <TableHead className="text-center lp-text-card-muted font-medium">Free</TableHead>
                      <TableHead className="text-center">
                        <span className="text-cyan-400 font-semibold">Pro</span>
                        <Badge className="ml-2 border-cyan-500/30 bg-cyan-500/10 text-[10px] text-cyan-300">Popular</Badge>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {comparisonFeatures.map((row, i) => (
                      <TableRow key={i} className="border-white/[0.04] hover:bg-white/[0.02]">
                        <TableCell className="font-medium lp-text-primary text-sm">{row.feature}</TableCell>
                        <TableCell className="text-center text-sm">
                          {typeof row.free === 'boolean' ? (
                            row.free ? <Check className="mx-auto h-4 w-4 text-emerald-400" /> : <span className="text-slate-600">—</span>
                          ) : (
                            <span className="lp-text-card-muted">{row.free}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center bg-cyan-500/[0.03] text-sm">
                          {typeof row.pro === 'boolean' ? (
                            row.pro ? <Check className="mx-auto h-4 w-4 text-emerald-400" /> : <span className="text-slate-600">—</span>
                          ) : (
                            <span className="lp-text-primary">{row.pro}</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile Cards */}
              <div className="space-y-3 p-4 md:hidden">
                {comparisonFeatures.map((row, i) => (
                  <div key={i} className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
                    <span className="text-sm font-medium lp-text-primary">{row.feature}</span>
                    <div className="flex gap-4 text-xs">
                      <span className="lp-text-card-muted">
                        {typeof row.free === 'boolean' ? (row.free ? '✓' : '—') : row.free}
                      </span>
                      <span className="text-cyan-400 font-medium">
                        {typeof row.pro === 'boolean' ? (row.pro ? '✓' : '—') : row.pro}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>
          </AnimatedSection>
        </LazySection>

        <div className="section-divider-ornament" />

        {/* ═══════ TESTIMONIALS SECTION ═══════ */}
        <LazySection
          id="testimonials"
          className="relative py-20 sm:py-28 section-bg-alt"
        >
          <AnimatedSection>
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <motion.div variants={fadeUp} custom={0} className="text-center">
              <Badge
                variant="outline"
                className="mb-4 border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-cyan-300"
              >
                <Quote className="mr-1.5 h-3 w-3" />
                Early Feedback
              </Badge>
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">
                <span className={`bg-gradient-to-b from-[var(--lp-text-heading)] via-[var(--lp-text-heading)] to-[var(--lp-text-muted)] bg-clip-text text-transparent`}>
                  What Our Beta Users Say
                </span>
              </h2>
              <p className="mx-auto mt-4 max-w-2xl lp-text-card-muted">
                Real feedback from early testers trying SmartCapture Pro during the beta phase.
              </p>
            </motion.div>

            {/* Testimonial carousel */}
            <motion.div variants={fadeUp} custom={1}>
              <div
                className="relative mt-14"
                onMouseEnter={() => { isPausedRef.current = true; }}
                onMouseLeave={() => { isPausedRef.current = false; }}
              >
                <Carousel
                  opts={{ align: 'start', loop: true }}
                  setApi={setCarouselApi}
                >
                  <CarouselContent>
                    {testimonials.map((t) => (
                      <CarouselItem key={t.name} className="md:basis-1/2 lg:basis-1/3">
                        <div className="h-full pl-1">
                          <div className="group card-3d-tilt quote-watermark relative flex h-full flex-col rounded-2xl border border-white/[0.06] lp-card-bg p-6 backdrop-blur-sm transition-all duration-300 hover:border-cyan-500/20 hover:shadow-xl hover:shadow-cyan-500/5 ripple-card">
                            <div className="relative z-[1]">
                              {/* Phase 9: Floating quote icon */}
                              <motion.div
                                animate={{ y: [0, -4, 0] }}
                                transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                                className="mb-4"
                              >
                                <Quote className="h-8 w-8 text-cyan-500/20" />
                              </motion.div>
                              <div className="mb-4 flex items-center gap-2">
                                <div className="flex gap-1">
                                  {Array.from({ length: t.rating }).map((_, j) => (
                                    <Star key={j} className="h-4 w-4 fill-yellow-400 text-yellow-400 star-gold-glow" />
                                  ))}
                                </div>
                                <span className="inline-flex items-center gap-1 rounded-full bg-cyan-500/10 px-1.5 py-0.5 text-[9px] font-medium text-cyan-400">
                                  <Sparkles className="h-2.5 w-2.5" />
                                  Beta tester
                                </span>
                              </div>
                              <p className="flex-1 text-sm leading-relaxed lp-text-card">
                                &ldquo;{t.text}&rdquo;
                              </p>
                              <Separator className="my-5 bg-white/[0.06]" />
                              <div className="flex items-center gap-3">
                                <div className={`flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br ${t.avatarBg} text-xs font-bold text-white shadow-lg ring-2 ring-offset-2 ring-offset-[var(--lp-bg)]`} style={{ ringColor: t.avatarBg.includes('violet') ? '#8b5cf6' : t.avatarBg.includes('amber') ? '#f59e0b' : t.avatarBg.includes('emerald') ? '#10b981' : t.avatarBg.includes('sky') ? '#0ea5e9' : t.avatarBg.includes('rose') ? '#f43f5e' : '#eab308' }}>
                                  {t.avatar}
                                </div>
                              <div>
                                <p className="text-sm font-semibold lp-text-heading">{t.name}</p>
                                <p className="text-xs lp-text-card-muted">{t.role}</p>
                              </div>
                            </div>
                            </div>
                          </div>
                        </div>
                      </CarouselItem>
                    ))}
                  </CarouselContent>
                </Carousel>

                {/* Prev/Next nav buttons — glass chevrons */}
                <button
                  onClick={() => carouselApi?.scrollPrev()}
                  className="absolute left-0 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white backdrop-blur-md transition-all duration-200 hover:border-cyan-500/30 hover:bg-white/10 hover:text-cyan-300 disabled:opacity-30 sm:-left-14 sm:h-11 sm:w-11"
                  aria-label="Previous testimonial"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <button
                  onClick={() => carouselApi?.scrollNext()}
                  className="absolute right-0 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white backdrop-blur-md transition-all duration-200 hover:border-cyan-500/30 hover:bg-white/10 hover:text-cyan-300 disabled:opacity-30 sm:-right-14 sm:h-11 sm:w-11"
                  aria-label="Next testimonial"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              </div>

              {/* Dot indicators */}
              <div className="mt-8 flex justify-center gap-2">
                {scrollSnaps.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => carouselApi?.scrollTo(i)}
                    aria-label={`Go to slide ${i + 1}`}
                    className={`h-2.5 rounded-full transition-all duration-300 ${
                      i === currentSlide
                        ? 'w-8 bg-cyan-400'
                        : 'w-2.5 border-2 border-white/30 bg-transparent hover:border-cyan-400/50'
                    }`}
                  />
                ))}
              </div>
            </motion.div>
          </div>
          </AnimatedSection>
        </LazySection>

        <div className="section-divider-ornament" />

        {/* ═══════ FAQ SECTION ═══════ */}
        <LazySection
          id="faq"
          className="relative py-20 sm:py-28"
        >
          <AnimatedSection>
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <motion.div variants={fadeUp} custom={0} className="text-center">
              <Badge
                variant="outline"
                className="mb-4 border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-cyan-300"
              >
                FAQ
              </Badge>
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">
                <span className={`bg-gradient-to-b from-[var(--lp-text-heading)] via-[var(--lp-text-heading)] to-[var(--lp-text-muted)] bg-clip-text text-transparent`}>
                  Frequently Asked Questions
                </span>
              </h2>
              <p className="mx-auto mt-4 max-w-2xl lp-text-card-muted">
                Got questions? We&apos;ve got answers. Everything you need to know about SmartCapture Pro.
              </p>
            </motion.div>

            <motion.div
              variants={fadeUp}
              custom={1}
              className="mx-auto mt-14 max-w-3xl"
            >
              {/* FAQ Search Input */}
              <div className="relative mb-6">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 lp-text-card-muted" />
                <input
                  type="text"
                  placeholder="Search questions..."
                  value={faqSearch}
                  onChange={(e) => setFaqSearch(e.target.value)}
                  className="h-10 w-full rounded-xl border lp-card-border pl-10 pr-10 text-sm lp-input-text lp-input-bg outline-none transition-colors placeholder:text-slate-500 focus:border-cyan-500/30 focus:ring-1 focus:ring-cyan-500/20"
                />
                {faqSearch && (
                  <button
                    onClick={() => setFaqSearch('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 flex h-5 w-5 items-center justify-center rounded-full bg-white/10 lp-text-card-muted transition-colors hover:bg-white/20 hover:text-slate-300"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>

              <AnimatePresence mode="wait">
                {filteredFaqs.length === 0 ? (
                  <motion.div
                    key="no-results"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="rounded-xl border border-dashed border-white/10 lp-card-bg px-6 py-10 text-center"
                  >
                    <Search className="mx-auto mb-3 h-8 w-8 text-slate-500" />
                    <p className="text-sm lp-text-card-muted">No matching questions found</p>
                    <p className="mt-1 text-xs text-slate-500">Try a different search term</p>
                  </motion.div>
                ) : (
                  <motion.div
                    key="faq-list"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    <Accordion type="single" collapsible className="space-y-3">
                      <AnimatePresence>
                        {filteredFaqs.map((faq, i) => (
                          <motion.div
                            key={faq.q}
                            layout
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            transition={{ duration: 0.2 }}
                          >
                            <AccordionItem
                              value={`faq-${faqs.indexOf(faq)}`}
                              className="rounded-xl border border-white/[0.06] lp-card-bg px-6 transition-colors data-[state=open]:border-cyan-500/20 data-[state=open]:bg-white/[0.04]"
                            >
                              <AccordionTrigger className="py-5 text-left text-sm font-semibold lp-text-primary hover:lp-text-heading [&>svg]:text-cyan-400">
                                {faq.q}
                              </AccordionTrigger>
                              <AccordionContent className="pb-5 text-sm leading-relaxed lp-text-card">
                                {faq.a}
                                {/* FAQ Helpful Voting */}
                                <div className="mt-4 flex items-center gap-3 border-t border-white/[0.04] pt-3">
                                  <span className="text-xs lp-text-card-muted">Was this helpful?</span>
                                  <button
                                    onClick={() => handleFaqVote(`faq-${i}`, 'up')}
                                    className={`faq-vote-btn flex items-center gap-1 rounded-lg border px-2 py-1 text-xs transition-colors ${
                                      faqVotes[`faq-${i}`]?.userVote === 'up'
                                        ? 'border-cyan-500/30 bg-cyan-500/10 text-cyan-400 voted'
                                        : 'border-white/[0.06] bg-white/[0.02] text-slate-500 hover:text-cyan-400'
                                    }`}
                                  >
                                    <ThumbsUp className="h-3 w-3" />
                                    {faqVotes[`faq-${i}`]?.userVote === 'up' && <span className="text-[10px]">{faqVotes[`faq-${i}`].up}</span>}
                                  </button>
                                  <button
                                    onClick={() => handleFaqVote(`faq-${i}`, 'down')}
                                    className={`faq-vote-btn flex items-center gap-1 rounded-lg border px-2 py-1 text-xs transition-colors ${
                                      faqVotes[`faq-${i}`]?.userVote === 'down'
                                        ? 'border-slate-500/30 bg-slate-500/10 text-slate-400 voted'
                                        : 'border-white/[0.06] bg-white/[0.02] text-slate-500 hover:text-slate-400'
                                    }`}
                                  >
                                    <ThumbsDown className="h-3 w-3" />
                                  </button>
                                  {faqVotes[`faq-${i}`]?.userVote && (
                                    <span className="text-[10px] lp-text-card-muted">
                                      {faqVotes[`faq-${i}`].up} found this helpful
                                    </span>
                                  )}
                                </div>
                              </AccordionContent>
                            </AccordionItem>
                          </motion.div>
                        ))}
                      </AnimatePresence>
                    </Accordion>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          </div>
          </AnimatedSection>
        </LazySection>

        <div className="section-divider-ornament" />

        {/* ═══════ CHANGELOG SECTION ═══════ */}
        <LazySection
          id="changelog"
          className="relative py-20 sm:py-28"
        >
          <AnimatedSection>
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <motion.div variants={fadeUp} custom={0} className="text-center">
              <Badge
                variant="outline"
                className="mb-4 border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-cyan-300"
              >
                <Sparkles className="mr-1.5 h-3 w-3" />
                What&apos;s New
              </Badge>
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">
                <span className={`bg-gradient-to-b from-[var(--lp-text-heading)] via-[var(--lp-text-heading)] to-[var(--lp-text-muted)] bg-clip-text text-transparent`}>
                  Latest
                </span>{' '}
                <span className="bg-gradient-to-r from-cyan-300 to-sky-400 bg-clip-text text-transparent">
                  Updates
                </span>
              </h2>
            </motion.div>

            {/* Changelog timeline */}
            <div className="mx-auto mt-14 max-w-2xl space-y-0 changelog-line-animated">
              {changelog.map((entry, i) => (
                <motion.div
                  key={entry.version}
                  variants={fadeUp}
                  custom={i + 1}
                  className="relative flex gap-6"
                >
                  {i < changelog.length - 1 && (
                    <div className="absolute left-[15px] top-10 bottom-0 w-px bg-gradient-to-b from-cyan-500/30 to-transparent" />
                  )}
                  <div className="relative z-10 flex shrink-0">
                    <div className={`flex h-8 w-8 items-center justify-center rounded-full border text-xs font-bold ${entry.latest ? 'border-cyan-500/50 bg-cyan-500/20 text-cyan-400 changelog-badge-latest' : 'border-white/10 bg-white/5 text-slate-400'}`}>
                      {i + 1}
                    </div>
                  </div>
                  <div className={`glass-card -mt-1 flex-1 p-5 card-hover-lift ${entry.latest ? 'border-cyan-500/20 shadow-lg shadow-cyan-500/5' : ''}`}>
                    <div className="flex flex-wrap items-center gap-3">
                      <Badge variant="outline" className={`text-xs font-semibold ${entry.latest ? 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300' : 'border-white/10 bg-white/5 text-slate-400'}`}>
                        {entry.version}
                        {entry.latest && ' (Current)'}
                      </Badge>
                      <div className="flex items-center gap-1.5 text-xs text-slate-500">
                        <Calendar className="h-3 w-3" />
                        {entry.date}
                      </div>
                    </div>
                    <h3 className="mt-3 text-base font-semibold lp-text-heading">{entry.title}</h3>
                    <p className="mt-1 text-sm lp-text-card">{entry.description}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {entry.tags.map((tag) => (
                        <span key={tag} className="changelog-tag inline-flex items-center gap-1 rounded-full border border-white/[0.06] bg-white/[0.03] px-2.5 py-0.5 text-xs text-slate-400 hover:border-cyan-500/20 hover:bg-cyan-500/[0.06] transition-all duration-200">
                          <Tag className="h-2.5 w-2.5" />
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
          </AnimatedSection>
        </LazySection>

        <div className="section-divider-ornament" />

        {/* ═══ #4: CONTACT US SECTION ═══════ */}
        <LazySection
          id="contact"
          className="relative py-20 sm:py-28"
        >
          <AnimatedSection>
          <div className="pointer-events-none absolute inset-0 -z-0">
            <div className="absolute left-1/2 top-1/2 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-500/[0.04] blur-[120px]" />
          </div>
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <motion.div variants={fadeUp} custom={0} className="text-center">
              <Badge
                variant="outline"
                className="mb-4 border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-cyan-300"
              >
                <MessageSquare className="mr-1.5 h-3 w-3" />
                Contact
              </Badge>
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">
                <span className={`bg-gradient-to-b from-[var(--lp-text-heading)] via-[var(--lp-text-heading)] to-[var(--lp-text-muted)] bg-clip-text text-transparent`}>
                  Get in Touch
                </span>
              </h2>
              <p className="mx-auto mt-4 max-w-2xl lp-text-card-muted">
                Have questions, feedback, or need support? We&apos;d love to hear from you.
              </p>
            </motion.div>

            <div className="mt-14 grid gap-8 lg:grid-cols-5">
              {/* Contact methods */}
              <motion.div variants={fadeUp} custom={1} className="space-y-4 lg:col-span-2">
                {/* Email card */}
                <div className="glass-card glass-card-hover card-hover-lift p-5 flex items-start gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500/20 to-sky-500/10 text-cyan-400">
                    <Mail className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold lp-text-heading">Email Us</h4>
                    <p className="mt-1 text-sm lp-text-card">codingcastles@gmail.com</p>
                    <p className="mt-0.5 text-xs text-slate-500">We reply within 24 hours</p>
                  </div>
                </div>
                {/* FAQ card */}
                <div className="glass-card glass-card-hover card-hover-lift p-5 flex items-start gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500/20 to-sky-500/10 text-cyan-400">
                    <MessageSquare className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold lp-text-heading">FAQ</h4>
                    <p className="mt-1 text-sm lp-text-card">Check our FAQ section above</p>
                    <button onClick={() => scrollTo('#faq')} className="mt-1 text-xs text-cyan-400 hover:text-cyan-300 transition-colors">
                      Jump to FAQ →
                    </button>
                  </div>
                </div>
                {/* Social card */}
                <div className="glass-card glass-card-hover card-hover-lift p-5 flex items-start gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500/20 to-sky-500/10 text-cyan-400">
                    <Share2 className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold lp-text-heading">Social Media</h4>
                    <p className="mt-1 text-sm lp-text-card">Follow us for updates</p>
                    <div className="mt-2 flex gap-2">
                      <a href="#" className="flex h-7 w-7 items-center justify-center rounded-md border border-white/[0.06] bg-white/[0.03] text-slate-500 transition-colors hover:border-cyan-500/20 hover:text-cyan-400" aria-label="GitHub">
                        <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
                      </a>
                      <a href="#" className="flex h-7 w-7 items-center justify-center rounded-md border border-white/[0.06] bg-white/[0.03] text-slate-500 transition-colors hover:border-cyan-500/20 hover:text-cyan-400" aria-label="Twitter/X">
                        <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                      </a>
                    </div>
                  </div>
                </div>
              </motion.div>

              {/* Contact form */}
              <motion.div variants={fadeUp} custom={2} className="glass-card card-hover-lift p-6 lg:col-span-3">
                <h3 className="mb-5 text-base font-semibold lp-text-heading">Send us a message</h3>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-xs font-medium lp-text-card-muted">
                      Name <span className="text-cyan-400">*</span>
                    </label>
                    <Input
                      placeholder="Your name"
                      value={contactName}
                      onChange={(e) => setContactName(e.target.value)}
                      className="h-10 lp-input-border lp-input-bg lp-input-text placeholder:text-slate-400 focus-visible:border-cyan-500/40 focus-visible:ring-cyan-500/20"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-medium lp-text-card-muted">
                      Email <span className="text-cyan-400">*</span>
                    </label>
                    <Input
                      type="email"
                      placeholder="you@example.com"
                      value={contactEmail}
                      onChange={(e) => setContactEmail(e.target.value)}
                      className="h-10 lp-input-border lp-input-bg lp-input-text placeholder:text-slate-400 focus-visible:border-cyan-500/40 focus-visible:ring-cyan-500/20"
                    />
                  </div>
                </div>
                <div className="mt-4">
                  <label className="mb-1.5 block text-xs font-medium lp-text-card-muted">
                    Subject <span className="text-slate-600">(optional)</span>
                  </label>
                  <Input
                    placeholder="What's this about?"
                    value={contactSubject}
                    onChange={(e) => setContactSubject(e.target.value)}
                    className="h-10 lp-input-border lp-input-bg lp-input-text placeholder:text-slate-400 focus-visible:border-cyan-500/40 focus-visible:ring-cyan-500/20"
                  />
                </div>
                <div className="mt-4">
                  <label className="mb-1.5 block text-xs font-medium lp-text-card-muted">
                    Message <span className="text-cyan-400">*</span>
                  </label>
                  <textarea
                    rows={6}
                    placeholder="Tell us more..."
                    value={contactMessage}
                    onChange={(e) => setContactMessage(e.target.value)}
                    className="w-full resize-none rounded-md border lp-input-border lp-input-bg px-3 py-2.5 text-sm lp-input-text placeholder:text-slate-400 outline-none transition-colors focus:border-cyan-500/40 focus:ring-1 focus:ring-cyan-500/20"
                  />
                </div>
                <Button
                  onClick={handleContactSubmit}
                  disabled={sendingContact}
                  className="mt-5 w-full sm:w-auto lp-touch-target bg-gradient-to-r from-cyan-500 to-sky-500 text-white shadow-lg shadow-cyan-500/25 hover:shadow-cyan-500/40 disabled:opacity-60"
                >
                  {sendingContact ? (
                    <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}>
                      <Send className="h-4 w-4" />
                    </motion.div>
                  ) : (
                    <>
                      <Send className="h-4 w-4" />
                      Send Message
                    </>
                  )}
                </Button>
              </motion.div>
            </div>
          </div>
          </AnimatedSection>
        </LazySection>

        <div className="section-divider-ornament" />

        {/* ═══════ DOWNLOAD CTA SECTION ═══════ */}
        <AnimatedSection
          id="download"
          className="relative py-20 sm:py-28"
        >
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="relative mx-auto max-w-3xl">
              {/* Rotating gradient border */}
              <div className="absolute -inset-[1px] rounded-3xl overflow-hidden">
                <div className="absolute inset-0 animate-spin [animation-duration:8s] bg-[conic-gradient(from_90deg_at_50%_50%,transparent_0%,transparent_60%,#0ea5e9_100%)]" />
              </div>
              {/* Content */}
              <motion.div
                variants={fadeUp}
                custom={0}
                className="relative overflow-hidden rounded-3xl border border-white/10 lp-glass-bg p-10 text-center sm:p-16"
              >
                {/* Glow effects */}
                <div className="pointer-events-none absolute -left-20 -top-20 h-60 w-60 rounded-full bg-cyan-500/20 blur-[80px]" />
                <div className="pointer-events-none absolute -bottom-20 -right-20 h-60 w-60 rounded-full bg-sky-500/20 blur-[80px]" />

                {/* Floating "100% Free" badge */}
                <div className="absolute right-6 top-6">
                  <span className="rounded-full bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 text-xs font-medium text-emerald-400">
                    100% Free
                  </span>
                </div>

                <div className="relative">
                  <motion.div
                    variants={fadeUp}
                    custom={0}
                    className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-400 to-sky-600 shadow-2xl shadow-cyan-500/30"
                  >
                    <Camera className="h-8 w-8 text-white" />
                  </motion.div>
                  <motion.h2
                    variants={fadeUp}
                    custom={1}
                    className="text-3xl font-bold tracking-tight sm:text-4xl"
                  >
                    <span className={`bg-gradient-to-b from-[var(--lp-text-heading)] via-[var(--lp-text-heading)] to-[var(--lp-text-muted)] bg-clip-text text-transparent`}>
                      Ready to Capture Smarter?
                    </span>
                  </motion.h2>
                  <motion.p
                    variants={fadeUp}
                    custom={2}
                    className="mt-4 max-w-xl lp-text-card-muted"
                  >
                    Install SmartCapture Pro in seconds. No sign-up required. Start capturing,
                    annotating, and analyzing web pages today.
                  </motion.p>
                  <motion.div
                    variants={fadeUp}
                    custom={3}
                    className="mt-8 flex flex-col items-center justify-center gap-4"
                  >
                    {/* Star rating display */}
                    <div className="flex items-center gap-2">
                      <div className="flex gap-0.5">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Star key={i} className={`h-5 w-5 ${i < 4 ? 'fill-amber-400 text-amber-400' : 'fill-amber-400 text-amber-400/60'} star-gold-glow`} />
                        ))}
                      </div>
                      <span className="text-lg font-bold lp-text-heading">4.2</span>
                      <span className="text-xs lp-text-card-muted">/ 5</span>
                    </div>
                    {/* Pulsing glow behind button */}
                    <div className="relative">
                      <div className="cta-pulse-ring absolute -inset-4 rounded-2xl pointer-events-none" />
                      <div className="absolute -inset-1 rounded-xl bg-cyan-500/20 animate-pulse blur-md" />
                      <Button
                        size="lg"
                        className="relative lp-touch-target bg-gradient-to-r from-cyan-500 to-sky-500 px-8 py-6 text-base text-white shadow-xl shadow-cyan-500/25 transition-all hover:shadow-cyan-500/40 hover:brightness-110"
                      >
                        <Download className="h-5 w-5" />
                        Add to Chrome — It&apos;s Free
                        <ArrowRight className="h-5 w-5" />
                      </Button>
                    </div>
                    {/* Micro-copy */}
                    <p className="text-xs font-medium text-emerald-400/80">
                      Free • No sign-up • Works instantly
                    </p>
                    {/* Enhanced Chrome Web Store badge */}
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-2 shadow-sm hover:shadow-md transition-shadow">
                        <div className="flex h-5 w-5 items-center justify-center rounded-lg bg-gradient-to-br from-red-400 via-yellow-400 via-green-400 to-blue-500 opacity-80" />
                        <span className="text-xs font-medium lp-text-card">Chrome Web Store</span>
                        <ExternalLink className="h-3 w-3 lp-text-card-muted" />
                      </div>
                    </div>
                  </motion.div>
                  <motion.p
                    variants={fadeUp}
                    custom={4}
                    className="mt-5 text-xs text-slate-500"
                  >
                    4.8★ average rating · 10,000+ users
                  </motion.p>
                  {/* Phase 4: Live install counter */}
                  <motion.div
                    variants={fadeUp}
                    custom={5}
                    className="mt-4"
                  >
                    <LiveInstallCounter />
                  </motion.div>
                </div>
              </motion.div>
            </div>
          </div>
        </AnimatedSection>
      </main>

      {/* ─── Getting Started Guide ─── */}
      <GettingStartedGuide />

      {/* ═══════ FOOTER ═══════ */}
      <footer className="relative lp-bg-alt">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-500/40 to-transparent" />
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
            {/* Column 1: Brand */}
            <div className="sm:col-span-2 lg:col-span-1">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-400 to-sky-600 shadow-lg shadow-cyan-500/20">
                  <Camera className="h-4 w-4 text-white" />
                </div>
                <span className="text-base font-bold lp-text">
                  SmartCapture <span className="text-cyan-400">Pro</span>
                </span>
              </div>
              <p className="mt-3 max-w-xs text-sm leading-relaxed lp-text-muted">
                AI-powered full-page screenshot tool for Chrome. Capture, annotate, and analyze — all locally in your browser.
              </p>
              <div className="mt-4 flex items-center gap-3">
                <a href="#" className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.06] bg-white/[0.03] lp-text-muted transition-colors hover:border-cyan-500/20 hover:bg-cyan-500/10 hover:text-cyan-400" aria-label="GitHub">
                  <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
                </a>
                <a href="#" className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.06] bg-white/[0.03] lp-text-muted transition-colors hover:border-cyan-500/20 hover:bg-cyan-500/10 hover:text-cyan-400" aria-label="Twitter/X">
                  <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                </a>
              </div>
            </div>

            {/* Column 2: Product */}
            <div>
              <h4 className="mb-4 text-sm font-semibold lp-text">Product</h4>
              <ul className="space-y-2.5">
                {[
                  { label: 'Features', href: '#features', icon: Camera },
                  { label: 'How It Works', href: '#how-it-works', icon: MousePointerClick },
                  { label: 'Pricing', href: '#pricing', icon: DollarSign },
                  { label: 'Download', href: '#download', icon: Download },
                  { label: 'Changelog', href: '#changelog', icon: Calendar },
                ].map((link) => (
                  <li key={link.label}>
                    <a href={link.href} onClick={() => scrollTo(link.href)} className="footer-link-hover inline-flex items-center gap-2 text-sm lp-text-muted transition-colors hover:text-cyan-400">
                      <link.icon className="h-3.5 w-3.5 shrink-0 opacity-60" />
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>

            {/* Column 3: Resources */}
            <div>
              <h4 className="mb-4 text-sm font-semibold lp-text">Resources</h4>
              <ul className="space-y-2.5">
                {[
                  { label: 'FAQ', href: '#faq', icon: HelpCircle },
                  { label: 'Contact', href: '#contact', icon: MessageSquare },
                ].map((link) => (
                  <li key={link.label}>
                    <a href={link.href} onClick={() => link.href.startsWith('#') && scrollTo(link.href)} className="footer-link-hover inline-flex items-center gap-2 text-sm lp-text-muted transition-colors hover:text-cyan-400">
                      <link.icon className="h-3.5 w-3.5 shrink-0 opacity-60" />
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>

            {/* Column 4: Legal */}
            <div>
              <h4 className="mb-4 text-sm font-semibold lp-text">Legal</h4>
              <ul className="space-y-2.5">
                {[
                  { label: 'Privacy Policy', href: '#', icon: Shield },
                  { label: 'Terms of Service', href: '#', icon: Scroll },
                ].map((link) => (
                  <li key={link.label}>
                    <a href={link.href} className="footer-link-hover inline-flex items-center gap-2 text-sm lp-text-muted transition-colors hover:text-cyan-400">
                      <link.icon className="h-3.5 w-3.5 shrink-0 opacity-60" />
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <Separator className="my-8 bg-white/[0.06]" />

          <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-between">
            <p className="text-xs lp-text-muted">
              © {new Date().getFullYear()} SmartCapture Pro. All rights reserved.{' '}
              <span className="bg-gradient-to-r from-cyan-400 to-pink-400 bg-clip-text text-transparent">Made with ❤️</span>{' '}
              for the web.
            </p>
          </div>
        </div>
      </footer>

      {/* Back to top button with progress ring */}
      <AnimatePresence>
        {scrolled && (
          <Tooltip>
            <TooltipTrigger asChild>
              <motion.button
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.5 }}
                transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                className="fixed right-6 bottom-6 z-40 flex h-12 w-12 items-center justify-center rounded-full lp-card-bg border border-white/[0.08] backdrop-blur-md shadow-lg transition-colors hover:border-cyan-500/30 active:scale-[0.95] lp-touch-target focus-visible:ring-2 focus-visible:ring-cyan-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
                aria-label="Back to top"
              >
                <svg className="absolute inset-0 h-full w-full -rotate-90" viewBox="0 0 48 48">
                  <circle
                    cx="24" cy="24" r="20"
                    fill="none"
                    stroke="rgba(255,255,255,0.06)"
                    strokeWidth="2.5"
                  />
                  <circle
                    cx="24" cy="24" r="20"
                    fill="none"
                    stroke="url(#progressGradient)"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeDasharray={`${2 * Math.PI * 20}`}
                    strokeDashoffset={`${2 * Math.PI * 20 * (1 - scrollProgress / 100)}`}
                    style={{ transition: 'stroke-dashoffset 150ms ease-out' }}
                  />
                  <defs>
                    <linearGradient id="progressGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#06b6d4" />
                      <stop offset="100%" stopColor="#0ea5e9" />
                    </linearGradient>
                  </defs>
                </svg>
                <ChevronUp className="relative h-5 w-5 text-cyan-400" />
              </motion.button>
            </TooltipTrigger>
            <TooltipContent side="left" className="lp-card-bg border lp-card-border text-xs lp-text-card">
              Back to top ({Math.round(scrollProgress)}%)
            </TooltipContent>
          </Tooltip>
        )}
      </AnimatePresence>

      {/* ═══ #5: COOKIE CONSENT BANNER with Preferences Panel — Enhanced ═══ */}
      <AnimatePresence>
        {!cookieConsent && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 200, damping: 25 }}
            className="fixed inset-x-0 bottom-0 z-50 p-4 sm:bottom-6 sm:inset-x-auto sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:p-0"
          >
            <div className="cookie-banner-gradient cookie-banner-border-gradient glass-card mx-auto max-w-lg rounded-2xl border border-white/[0.08] p-5 shadow-2xl shadow-black/30 backdrop-blur-2xl sm:p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500/20 to-sky-500/10 text-cyan-400">
                  <Cookie className="h-5 w-5 cookie-icon-bounce" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold lp-text-heading">We value your privacy</p>
                  <p className="mt-1 text-xs leading-relaxed lp-text-card">
                    We use cookies to enhance your experience. By continuing, you agree to our{' '}
                    <a href="#" className="cookie-link-animated text-cyan-400 hover:text-cyan-300">cookie policy</a>.
                  </p>
                  <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
                    <Button
                      size="sm"
                      onClick={acceptAll}
                      className="accept-shimmer min-h-[44px] px-6 bg-gradient-to-r from-cyan-500 to-sky-500 text-white shadow-lg shadow-cyan-500/25 hover:shadow-cyan-500/40 cookie-glow-button lp-touch-target active:scale-[0.97] transition-transform duration-100"
                    >
                      Accept All
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setShowCookiePrefs(!showCookiePrefs)}
                      className="min-h-[44px] px-6 border-white/10 bg-white/5 text-slate-300 hover:border-white/20 hover:bg-white/10 hover:text-white lp-touch-target active:scale-[0.97] transition-transform duration-100"
                    >
                      Customize
                    </Button>
                  </div>
                </div>
              </div>

              {/* Preferences panel */}
              <AnimatePresence>
                {showCookiePrefs && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    className="overflow-hidden"
                  >
                    <div className="mt-4 space-y-3 border-t border-white/[0.06] pt-4">
                      {/* Necessary */}
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium lp-text-heading">Necessary</p>
                          <p className="text-xs text-slate-500">Required for the site to function</p>
                        </div>
                        <Switch checked disabled className="opacity-60" />
                      </div>
                      {/* Analytics */}
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium lp-text-heading">Analytics</p>
                          <p className="text-xs text-slate-500">Help us understand usage patterns</p>
                        </div>
                        <Switch
                          checked={cookiePrefs.analytics}
                          onCheckedChange={(checked) => setCookiePrefs((prev) => ({ ...prev, analytics: checked }))}
                        />
                      </div>
                      {/* Marketing */}
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium lp-text-heading">Marketing</p>
                          <p className="text-xs text-slate-500">Relevant offers and recommendations</p>
                        </div>
                        <Switch
                          checked={cookiePrefs.marketing}
                          onCheckedChange={(checked) => setCookiePrefs((prev) => ({ ...prev, marketing: checked }))}
                        />
                      </div>
                      {/* Save preferences button */}
                      <Button
                        size="sm"
                        onClick={acceptWithPrefs}
                        className="mt-2 w-full min-h-[44px] bg-gradient-to-r from-cyan-500 to-sky-500 text-white shadow-lg shadow-cyan-500/25 hover:shadow-cyan-500/40 lp-touch-target active:scale-[0.97] transition-transform duration-100"
                      >
                        Save Preferences
                      </Button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ Round 6: MINI TABLE OF CONTENTS ═══ */}
      {scrolled && !isLoading && (
        <div className="fixed left-3 top-1/2 z-30 hidden -translate-y-1/2 xl:block">
          <div className="group/toc">
            {/* Collapsed state: just the dot */}
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.3 }}
              className="relative"
            >
              <div className="mini-toc-pill rounded-2xl p-2 transition-all duration-300 group-hover/toc:w-48 group-hover/toc:rounded-2xl">
                <div className="flex flex-col gap-1 overflow-hidden">
                  {tocSections.map((section) => (
                    <button
                      key={section.id}
                      onClick={() => {
                        const el = document.getElementById(section.id);
                        el?.scrollIntoView({ behavior: 'smooth' });
                      }}
                      className={`flex items-center gap-2 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-left text-[11px] font-medium transition-all duration-200 hover:bg-white/[0.06] focus-visible:ring-2 focus-visible:ring-cyan-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent ${
                        activeSection === section.id
                          ? 'text-cyan-400'
                          : 'text-slate-500 hover:text-slate-300'
                      }`}
                    >
                      <span className={`h-1.5 w-1.5 shrink-0 rounded-full transition-all duration-300 ${
                        activeSection === section.id
                          ? 'bg-cyan-400 shadow-sm shadow-cyan-400/50 scale-125'
                          : 'bg-slate-600'
                      }`} />
                      <span className="truncate">{section.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      )}

      {/* ═══ Phase 3: RIGHT-SIDE MINI TOC (dot indicators) ═══ */}
      {scrollProgress > 5 && !isLoading && (
        <div className="fixed right-4 top-1/2 z-30 hidden -translate-y-1/2 xl:block">
          <motion.div
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.5 }}
            className="flex flex-col items-center gap-0"
          >
            {tocSections.map((section, idx) => (
              <Tooltip key={section.id}>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => {
                      const el = document.getElementById(section.id);
                      el?.scrollIntoView({ behavior: 'smooth' });
                    }}
                    className="group relative flex items-center justify-center focus-visible:ring-2 focus-visible:ring-cyan-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
                    aria-label={`Jump to ${section.label}`}
                  >
                    {/* Vertical connector line */}
                    {idx < tocSections.length - 1 && (
                      <div className="absolute top-2.5 left-1/2 h-5 w-px -translate-x-1/2 bg-white/[0.06] transition-colors group-hover:bg-white/[0.12]" />
                    )}
                    {/* Dot */}
                    <span
                      className={`relative z-10 block rounded-full transition-all duration-300 ${
                        activeSection === section.id
                          ? 'h-3 w-3 bg-cyan-400 shadow-[0_0_10px_rgba(6,182,212,0.6),0_0_20px_rgba(6,182,212,0.3)]'
                          : 'h-2 w-2 bg-slate-600 hover:bg-slate-400'
                      }`}
                    />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="left" className="lp-card-bg border lp-card-border text-xs lp-text-card">
                  {section.label}
                </TooltipContent>
              </Tooltip>
            ))}
          </motion.div>
        </div>
      )}

      {/* ─── Social Proof Toast ─── */}
      <AnimatePresence>
        {showSocialToast && (
          <SocialProofToast visible={showSocialToast} onDismiss={() => setShowSocialToast(false)} />
        )}
      </AnimatePresence>

      {/* Phase 7: Quick Actions FAB */}
      <QuickActionsFAB scrollProgress={scrollProgress} />

      {/* ═══ Phase 2: COMMAND PALETTE ═══ */}
      <CommandPalette open={showCommandPalette} onClose={() => setShowCommandPalette(false)} />

      {/* ═══ KEYBOARD SHORTCUTS HELP DIALOG ═══ */}
      <Dialog open={showShortcuts} onOpenChange={setShowShortcuts}>
        <DialogContent className="max-w-md lp-glass-border lp-glass-bg sm:rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-cyan-500/20 text-xs text-cyan-400 font-mono">⌘</span>
              Keyboard Shortcuts
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-2 pt-2">
            {[
              { key: '? /', desc: 'Open shortcuts' },
              { key: '↑', desc: 'Scroll to top' },
              { key: 'D', desc: 'Jump to Download' },
              { key: 'F', desc: 'Jump to Features' },
              { key: 'P', desc: 'Jump to Pricing' },
              { key: 'T', desc: 'Toggle theme' },
            ].map((s) => (
              <div key={s.key} className="flex items-center justify-between rounded-lg px-3 py-2 hover:bg-white/[0.04] transition-colors">
                <span className="text-sm lp-text-card-muted">{s.desc}</span>
                <kbd className="flex h-7 min-w-[28px] items-center justify-center rounded-md border border-white/10 bg-white/[0.05] px-2 text-xs font-mono text-cyan-400">{s.key}</kbd>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
