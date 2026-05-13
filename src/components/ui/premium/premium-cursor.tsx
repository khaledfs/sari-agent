"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";

export const PremiumCursor = () => {
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [isHovering, setIsHovering] = useState(false);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMousePosition({ x: e.clientX, y: e.clientY });

      // Check if hovering over interactive element
      const target = e.target as HTMLElement;
      const isInteractive =
        target.tagName === "BUTTON" ||
        target.tagName === "A" ||
        target.onclick !== null ||
        target.closest("button") !== null ||
        target.closest("a") !== null;

      setIsHovering(isInteractive);
    };

    window.addEventListener("mousemove", handleMouseMove);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
    };
  }, []);

  return (
    <>
      {/* Main cursor dot */}
      <motion.div
        className="fixed pointer-events-none z-[9999] mix-blend-difference"
        animate={{
          x: mousePosition.x - 6,
          y: mousePosition.y - 6,
          scale: isHovering ? 0.8 : 1,
        }}
        transition={{
          type: "spring",
          stiffness: 500,
          damping: 28,
          mass: 0.5,
        }}
      >
        <div className="w-3 h-3 bg-white rounded-full" />
      </motion.div>

      {/* Outer ring */}
      <motion.div
        className="fixed pointer-events-none z-[9998]"
        animate={{
          x: mousePosition.x - 20,
          y: mousePosition.y - 20,
          scale: isHovering ? 1.5 : 1,
        }}
        transition={{
          type: "spring",
          stiffness: 150,
          damping: 15,
          mass: 0.1,
        }}
      >
        <div className="w-10 h-10 border-2 border-purple-400/50 rounded-full" />
      </motion.div>

      {/* Glow effect */}
      <motion.div
        className="fixed pointer-events-none z-[9997]"
        animate={{
          x: mousePosition.x - 40,
          y: mousePosition.y - 40,
          opacity: isHovering ? 0.4 : 0.2,
        }}
        transition={{
          type: "spring",
          stiffness: 100,
          damping: 20,
        }}
      >
        <div className="w-20 h-20 bg-gradient-to-r from-purple-600 to-pink-600 rounded-full blur-2xl opacity-50" />
      </motion.div>
    </>
  );
};
