"use client";

import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, ShoppingCart, X } from "lucide-react";
import { useEffect } from "react";

interface NotificationProps {
  show: boolean;
  message: string;
  onClose: () => void;
  autoHideDuration?: number;
}

export const PremiumNotification = ({
  show,
  message,
  onClose,
  autoHideDuration = 3000,
}: NotificationProps) => {
  useEffect(() => {
    if (show && autoHideDuration > 0) {
      const timer = setTimeout(onClose, autoHideDuration);
      return () => clearTimeout(timer);
    }
  }, [show, autoHideDuration, onClose]);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: -100, scale: 0.3 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, scale: 0.5, transition: { duration: 0.2 } }}
          className="fixed top-6 right-6 z-50"
        >
          <div className="relative group">
            {/* Glow effect */}
            <div className="absolute -inset-2 bg-gradient-to-r from-[#15803d]/30 via-[#22c55e]/30 to-[#15803d]/30 rounded-[20px] blur-xl opacity-75 group-hover:opacity-100 transition-opacity" />

            <div className="relative bg-gradient-to-br from-white to-[#dcfce7] border-2 border-[#22c55e]/50 rounded-[18px] shadow-2xl p-4 pr-12 backdrop-blur-xl">
              <div className="flex items-center gap-3">
                {/* Icon */}
                <motion.div
                  initial={{ scale: 0, rotate: -180 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
                  className="p-2 bg-gradient-to-br from-[#22c55e] to-[#15803d] rounded-full shadow-lg"
                >
                  <ShoppingCart className="w-5 h-5 text-white" />
                </motion.div>

                {/* Message */}
                <div>
                  <motion.p
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.3 }}
                    className="font-bold text-[#15803d] flex items-center gap-2"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    {message}
                  </motion.p>
                </div>
              </div>

              {/* Close button */}
              <motion.button
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.4 }}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={onClose}
                className="absolute top-3 right-3 w-8 h-8 bg-white/50 hover:bg-white rounded-full flex items-center justify-center transition-all"
              >
                <X className="w-4 h-4 text-[#15803d]" />
              </motion.button>

              {/* Progress bar */}
              <motion.div
                initial={{ scaleX: 1 }}
                animate={{ scaleX: 0 }}
                transition={{ duration: autoHideDuration / 1000, ease: "linear" }}
                className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-[#22c55e] to-[#15803d] rounded-b-[18px] origin-left"
              />
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
