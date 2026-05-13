"use client";

import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";

export const PremiumLoader = () => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950">
      {/* Animated background */}
      <div className="absolute inset-0 overflow-hidden">
        <motion.div
          className="absolute w-[600px] h-[600px] rounded-full bg-gradient-to-r from-purple-500/30 to-pink-500/30 blur-3xl"
          animate={{
            x: ["-25%", "125%"],
            y: ["-25%", "125%"],
          }}
          transition={{
            duration: 10,
            repeat: Infinity,
            repeatType: "reverse",
          }}
        />
        <motion.div
          className="absolute w-[500px] h-[500px] rounded-full bg-gradient-to-r from-blue-500/30 to-cyan-500/30 blur-3xl"
          animate={{
            x: ["125%", "-25%"],
            y: ["125%", "-25%"],
          }}
          transition={{
            duration: 12,
            repeat: Infinity,
            repeatType: "reverse",
          }}
        />
      </div>

      {/* Loader content */}
      <div className="relative z-10 flex flex-col items-center gap-6">
        <motion.div
          className="relative"
          animate={{ rotate: 360 }}
          transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
        >
          <div className="absolute inset-0 bg-gradient-to-r from-purple-600 to-pink-600 rounded-full blur-xl opacity-50" />
          <div className="relative bg-gradient-to-br from-purple-600 to-pink-600 p-6 rounded-full">
            <Sparkles className="w-12 h-12 text-white" />
          </div>
        </motion.div>

        <div className="flex flex-col items-center gap-3">
          <motion.h2
            className="text-2xl font-bold bg-gradient-to-r from-white to-slate-300 bg-clip-text text-transparent"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5 }}
          >
            Loading Experience
          </motion.h2>

          <div className="flex gap-2">
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                className="w-2 h-2 bg-purple-500 rounded-full"
                animate={{
                  scale: [1, 1.5, 1],
                  opacity: [1, 0.5, 1],
                }}
                transition={{
                  duration: 1,
                  repeat: Infinity,
                  delay: i * 0.2,
                }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export const InlineLoader = () => {
  return (
    <div className="flex items-center justify-center gap-2">
      {[0, 1, 2, 3, 4].map((i) => (
        <motion.div
          key={i}
          className="w-1 h-8 bg-gradient-to-t from-purple-600 to-pink-600 rounded-full"
          animate={{
            scaleY: [1, 1.5, 1],
            opacity: [0.5, 1, 0.5],
          }}
          transition={{
            duration: 1,
            repeat: Infinity,
            delay: i * 0.1,
          }}
        />
      ))}
    </div>
  );
};
