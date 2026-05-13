"use client";

import { DemoOne } from "@/components/ui/ai-prompt-demo";
import { PremiumShowcase } from "@/components/ui/premium/premium-showcase";
import { PremiumCursor } from "@/components/ui/premium/premium-cursor";
import { PremiumLoader } from "@/components/ui/premium/premium-loader";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MessageSquare, Sparkles } from "lucide-react";

export default function DemoPage() {
  const [activeView, setActiveView] = useState<"chat" | "showcase">("showcase");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 2000);
    return () => clearTimeout(timer);
  }, []);

  if (isLoading) {
    return <PremiumLoader />;
  }

  return (
    <div className="relative min-h-screen cursor-none">
      {/* Custom cursor */}
      <PremiumCursor />

      {/* Floating toggle button */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="fixed top-6 right-6 z-50"
      >
        <div className="flex gap-2 bg-slate-900/80 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-2 shadow-2xl">
          <button
            onClick={() => setActiveView("showcase")}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl font-medium transition-all ${
              activeView === "showcase"
                ? "bg-gradient-to-r from-purple-600 to-pink-600 text-white"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <Sparkles className="w-4 h-4" />
            Showcase
          </button>
          <button
            onClick={() => setActiveView("chat")}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl font-medium transition-all ${
              activeView === "chat"
                ? "bg-gradient-to-r from-purple-600 to-pink-600 text-white"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <MessageSquare className="w-4 h-4" />
            Chat Demo
          </button>
        </div>
      </motion.div>

      {/* Content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeView}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.3 }}
        >
          {activeView === "showcase" ? <PremiumShowcase /> : <DemoOne />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
