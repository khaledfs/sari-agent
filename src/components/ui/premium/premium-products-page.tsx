"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Search, Heart, ShoppingCart, Sparkles, TrendingUp, Clock, X, Check } from "lucide-react";
import { useState } from "react";

interface Product {
  _id: string;
  name: string;
  sku: string;
  price: number;
  unit: string;
  imageUrl?: string;
  category?: string;
  frequency?: number;
}

interface ProductCardProps {
  product: Product;
  onAddToCart: (id: string) => void;
  onToggleFavorite: (id: string, isFav: boolean) => void;
  isFavorite: boolean;
  isAdding: boolean;
  isAdded: boolean;
  isFavBusy: boolean;
  showFrequency?: boolean;
}

export const PremiumProductCard = ({
  product,
  onAddToCart,
  onToggleFavorite,
  isFavorite,
  isAdding,
  isAdded,
  isFavBusy,
  showFrequency,
}: ProductCardProps) => {
  const [imageLoaded, setImageLoaded] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9 }}
      whileHover={{ y: -8, scale: 1.02 }}
      transition={{ type: "spring", stiffness: 300, damping: 25 }}
      className="group relative h-full"
    >
      {/* Glow effect */}
      <div className="absolute -inset-1 bg-gradient-to-r from-[#c9a54c]/20 via-[#d4af37]/20 to-[#b8962e]/20 rounded-[24px] blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

      <div className="relative h-full bg-gradient-to-br from-white to-[#faf8f3] border border-[#e8e4dc] rounded-[22px] overflow-hidden shadow-[0_4px_14px_rgba(15,23,42,0.08)] group-hover:shadow-[0_20px_50px_rgba(201,165,76,0.18)] group-hover:border-[#d4cfc4] transition-all duration-300">
        {/* Image container */}
        <div className="relative aspect-[4/3] overflow-hidden bg-[#f7f6f3] border-b border-[#e8e4dc]">
          {product.imageUrl ? (
            <>
              <img
                src={product.imageUrl}
                alt={product.name}
                loading="lazy"
                referrerPolicy="no-referrer"
                onLoad={() => setImageLoaded(true)}
                className={`w-full h-full object-cover transition-all duration-700 ${
                  imageLoaded ? "opacity-100 scale-100" : "opacity-0 scale-105"
                } group-hover:scale-110`}
              />
              {!imageLoaded && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-10 h-10 border-4 border-[#c9a54c]/20 border-t-[#c9a54c] rounded-full animate-spin" />
                </div>
              )}
            </>
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-[#f7f6f3] via-[#eeece6] to-[#e8e4dc] flex items-center justify-center">
              <div className="w-16 h-16 rounded-full bg-[#c9a54c]/10 flex items-center justify-center">
                <Sparkles className="w-8 h-8 text-[#c9a54c]/40" />
              </div>
            </div>
          )}

          {/* Favorite button overlay */}
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => onToggleFavorite(product._id, !isFavorite)}
            disabled={isFavBusy}
            className={`absolute top-2 right-2 w-9 h-9 rounded-full backdrop-blur-xl border transition-all duration-300 ${
              isFavorite
                ? "bg-[#c9a54c] border-[#b8962e] text-white shadow-[0_4px_12px_rgba(201,165,76,0.4)]"
                : "bg-white/90 border-white/50 text-[#8a8477] hover:text-[#c9a54c]"
            } flex items-center justify-center`}
          >
            <Heart className={`w-4 h-4 ${isFavorite ? "fill-current" : ""}`} />
          </motion.button>

          {/* Frequency badge */}
          {showFrequency && typeof product.frequency === "number" && (
            <div className="absolute top-2 left-2 px-2.5 py-1 bg-[#c9a54c] text-white text-xs font-bold rounded-full shadow-lg flex items-center gap-1">
              <TrendingUp className="w-3 h-3" />
              {product.frequency}x
            </div>
          )}

          {/* Gradient overlay on hover */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
        </div>

        {/* Content */}
        <div className="p-3 flex flex-col gap-2">
          {/* Product name */}
          <h3 className="font-bold text-[#1a1814] text-sm leading-tight line-clamp-2 min-h-[2rem] group-hover:text-[#c9a54c] transition-colors">
            {product.name}
          </h3>

          {/* Price */}
          <div className="flex items-baseline gap-1.5">
            <span className="text-xl font-black bg-gradient-to-r from-[#c9a54c] to-[#b8962e] bg-clip-text text-transparent">
              ₪{product.price}
            </span>
            <span className="text-xs text-[#8a8477]">/ {product.unit}</span>
          </div>

          {/* SKU */}
          <p className="text-xs text-[#8a8477] font-medium">SKU: {product.sku}</p>

          {/* Actions */}
          <div className="flex flex-col gap-2 mt-1.5">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => onAddToCart(product._id)}
              disabled={isAdding}
              className="relative w-full px-3 py-2.5 bg-gradient-to-r from-[#d4af37] to-[#b8962e] hover:from-[#c9a54c] hover:to-[#a67c00] text-white font-bold text-sm rounded-xl shadow-[0_10px_22px_rgba(201,165,76,0.26)] hover:shadow-[0_14px_28px_rgba(201,165,76,0.34)] transition-all duration-300 flex items-center justify-center gap-2 overflow-hidden group/btn"
            >
              <AnimatePresence mode="wait">
                {isAdding ? (
                  <motion.div
                    key="loading"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    className="flex items-center gap-2"
                  >
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Adding...
                  </motion.div>
                ) : isAdded ? (
                  <motion.div
                    key="added"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    className="flex items-center gap-2"
                  >
                    <Check className="w-5 h-5" />
                    Added!
                  </motion.div>
                ) : (
                  <motion.div
                    key="add"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    className="flex items-center gap-2"
                  >
                    <ShoppingCart className="w-5 h-5 group-hover/btn:rotate-12 transition-transform" />
                    Add to Cart
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Shine effect */}
              <div className="absolute inset-0 -translate-x-full group-hover/btn:translate-x-full transition-transform duration-1000 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
            </motion.button>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

interface SmartSectionProps {
  title: string;
  icon: React.ReactNode;
  products: Product[];
  emptyMessage: string;
  loading: boolean;
  onAddToCart: (id: string) => void;
  onToggleFavorite: (id: string, isFav: boolean) => void;
  favoriteIds: Set<string>;
  addingId: string | null;
  addedId: string | null;
  favBusyId: string | null;
  showFrequency?: boolean;
}

export const SmartSection = ({
  title,
  icon,
  products,
  emptyMessage,
  loading,
  onAddToCart,
  onToggleFavorite,
  favoriteIds,
  addingId,
  addedId,
  favBusyId,
  showFrequency,
}: SmartSectionProps) => {
  if (loading) {
    return (
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-gradient-to-br from-[#c9a54c]/20 to-[#b8962e]/20 rounded-xl">
            {icon}
          </div>
          <h2 className="text-xl font-bold text-[#1a1814]">{title}</h2>
        </div>
        <div className="flex gap-4 overflow-x-auto pb-4">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="min-w-[240px] h-[320px] bg-gradient-to-br from-[#f7f6f3] to-[#eeece6] rounded-[22px] animate-pulse"
            />
          ))}
        </div>
      </motion.section>
    );
  }

  if (products.length === 0) {
    return (
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-gradient-to-br from-[#c9a54c]/20 to-[#b8962e]/20 rounded-xl">
            {icon}
          </div>
          <h2 className="text-xl font-bold text-[#1a1814]">{title}</h2>
        </div>
        <div className="bg-gradient-to-br from-[#fdf6e3]/50 to-white border border-[#e8e4dc] rounded-2xl p-8 text-center">
          <p className="text-[#8a8477]">{emptyMessage}</p>
        </div>
      </motion.section>
    );
  }

  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-8"
    >
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 bg-gradient-to-br from-[#c9a54c]/20 to-[#b8962e]/20 rounded-xl">
          {icon}
        </div>
        <h2 className="text-xl font-bold text-[#1a1814]">{title}</h2>
      </div>
      <div className="flex gap-4 overflow-x-auto pb-4 snap-x snap-mandatory scrollbar-thin scrollbar-thumb-[#c9a54c] scrollbar-track-transparent">
        {products.map((product, idx) => (
          <motion.div
            key={product._id}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: idx * 0.05 }}
            className="min-w-[240px] snap-start"
          >
            <PremiumProductCard
              product={product}
              onAddToCart={onAddToCart}
              onToggleFavorite={onToggleFavorite}
              isFavorite={favoriteIds.has(product._id)}
              isAdding={addingId === product._id}
              isAdded={addedId === product._id}
              isFavBusy={favBusyId === product._id}
              showFrequency={showFrequency}
            />
          </motion.div>
        ))}
      </div>
    </motion.section>
  );
};

export const PremiumSearchBar = ({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative group"
    >
      <div className="absolute -inset-1 bg-gradient-to-r from-[#c9a54c]/20 via-[#d4af37]/20 to-[#b8962e]/20 rounded-[20px] blur-lg opacity-0 group-focus-within:opacity-100 transition-opacity duration-300" />
      <div className="relative flex items-center">
        <Search className="absolute left-5 w-5 h-5 text-[#8a8477] group-focus-within:text-[#c9a54c] transition-colors pointer-events-none" />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full pl-14 pr-12 py-4 bg-gradient-to-br from-white to-[#fcfbf8] border border-[#e8e4dc] rounded-[18px] text-[#1a1814] placeholder:text-[#8a8477] focus:outline-none focus:border-[#c9a54c] focus:shadow-[0_0_0_3px_rgba(201,165,76,0.18)] transition-all duration-300 text-base"
        />
        {value && (
          <motion.button
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => onChange("")}
            className="absolute right-4 w-8 h-8 bg-[#8a8477]/10 hover:bg-[#c9a54c]/20 rounded-full flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4 text-[#8a8477]" />
          </motion.button>
        )}
      </div>
    </motion.div>
  );
};
