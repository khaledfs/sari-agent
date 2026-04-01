export type SupportedLocale = "he" | "en" | "ar";

export type ProductCategoryConfig = {
  slug: string;
  sourceUrl: string;
  /**
   * Public URL path served from /public (preferred).
   * Example: "/categories/flours/category.<hash>.png"
   */
  imageUrl: string;
  displayName: {
    he: string;
    en: string;
    ar: string;
  };
};

/**
 * Source of truth for the customer catalog category structure.
 * Based on the "Our Products" menu on sarihassan.com (Hebrew names + URLs).
 *
 * Notes:
 * - `displayName.he` is taken from the live site.
 * - `displayName.en/ar` are manual MVP translations.
 * - `slug` should match the WooCommerce product-category URL segment.
 */
export const PRODUCT_CATEGORIES: ProductCategoryConfig[] = [
  {
    slug: "butter-margarine-and-oils",
    sourceUrl: "https://sarihassan.com/product-category/butter-margarine-and-oils/",
    imageUrl: "/categories/butter-margarine-and-oils/category.png",
    displayName: {
      he: "חמאה מרגרינה ושמנים",
      en: "Butter, Margarine & Oils",
      ar: "الزبدة والسمن والزيوت",
    },
  },
  {
    slug: "legumes",
    sourceUrl: "https://sarihassan.com/product-category/legumes/",
    imageUrl: "/categories/legumes/category.png",
    displayName: {
      he: "קטניות",
      en: "Legumes",
      ar: "البقوليات",
    },
  },
  {
    slug: "flours",
    sourceUrl: "https://sarihassan.com/product-category/flours/",
    imageUrl: "/categories/flours/category.png",
    displayName: {
      he: "קמחים",
      en: "Flours",
      ar: "الطحين",
    },
  },
  {
    slug: "cream-frozen-and-refrigerated-products",
    sourceUrl: "https://sarihassan.com/product-category/cream-frozen-and-refrigerated-products/",
    imageUrl: "/categories/cream-frozen-and-refrigerated-products/category.png",
    displayName: {
      he: "קצפת,קפואים ומוצרי מקרר",
      en: "Cream, Frozen & Refrigerated",
      ar: "الكريمة والمجمّدات والمبرّدات",
    },
  },
  {
    slug: "baking-and-drink-powders",
    sourceUrl: "https://sarihassan.com/product-category/baking-and-drink-powders/",
    imageUrl: "/categories/baking-and-drink-powders/category.png",
    displayName: {
      he: "אבקות להכנת עוגות ומשקאות",
      en: "Baking & Drink Powders",
      ar: "مساحيق للخبز والمشروبات",
    },
  },
  {
    slug: "packaging-and-disposable-items",
    sourceUrl: "https://sarihassan.com/product-category/packaging-and-disposable-items/",
    imageUrl: "/categories/packaging-and-disposable-items/category.png",
    displayName: {
      he: "אריזות וחד פעמי",
      en: "Packaging & Disposables",
      ar: "التغليف والمواد أحادية الاستخدام",
    },
  },
  {
    slug: "biscuits-and-pastry-dough",
    sourceUrl: "https://sarihassan.com/product-category/biscuits-and-pastry-dough/",
    imageUrl: "/categories/biscuits-and-pastry-dough/category.png",
    displayName: {
      he: "ביסקוויט ובצק פריך",
      en: "Biscuits & Pastry Dough",
      ar: "البسكويت وعجينة التارت",
    },
  },
  {
    slug: "tools",
    sourceUrl: "https://sarihassan.com/product-category/tools/",
    imageUrl: "/categories/tools/category.png",
    displayName: {
      he: "כלים",
      en: "Tools",
      ar: "الأدوات",
    },
  },
  {
    slug: "mirror-glaze-syrup-and-glucose",
    sourceUrl: "https://sarihassan.com/product-category/mirror-glaze-syrup-and-glucose/",
    imageUrl: "/categories/mirror-glaze-syrup-and-glucose/category.png",
    displayName: {
      he: "מירור,סירופ וקלוקוזה",
      en: "Mirror Glaze, Syrup & Glucose",
      ar: "ميرور وغلوكوز وشراب",
    },
  },
  {
    slug: "improvers-and-yeast",
    sourceUrl: "https://sarihassan.com/product-category/improvers-and-yeast/",
    imageUrl: "/categories/improvers-and-yeast/category.png",
    displayName: {
      he: "משפרים ושמרים",
      en: "Improvers & Yeast",
      ar: "محسّنات وخميرة",
    },
  },
  {
    slug: "extracts-food-colors-and-concentrates",
    sourceUrl: "https://sarihassan.com/product-category/extracts-food-colors-and-concentrates/",
    imageUrl: "/categories/extracts-food-colors-and-concentrates/category.jpg",
    displayName: {
      he: "תמציות,צבעי מאכל ותרכיזים",
      en: "Extracts, Colors & Concentrates",
      ar: "مستخلصات وألوان ومركّزات",
    },
  },
  {
    slug: "cake-decorating-items",
    sourceUrl: "https://sarihassan.com/product-category/cake-decorating-items/",
    imageUrl: "/categories/cake-decorating-items/category.png",
    displayName: {
      he: "קישוטים לעיצוב עוגות",
      en: "Cake Decorations",
      ar: "زينة تزيين الكيك",
    },
  },
  {
    slug: "chocolate-and-fillings",
    sourceUrl: "https://sarihassan.com/product-category/chocolate-and-fillings/",
    imageUrl: "/categories/chocolate-and-fillings/category.png",
    displayName: {
      he: "שוקולד ומליות",
      en: "Chocolate & Fillings",
      ar: "الشوكولاتة والحشوات",
    },
  },
  {
    slug: "canned-goods",
    sourceUrl: "https://sarihassan.com/product-category/canned-goods/",
    imageUrl: "/categories/canned-goods/category.jpg",
    displayName: {
      he: "שימורים",
      en: "Canned Goods",
      ar: "المعلبات",
    },
  },
  {
    slug: "spices",
    sourceUrl: "https://sarihassan.com/product-category/spices/",
    imageUrl: "/categories/spices/category.png",
    displayName: {
      he: "תבלינים",
      en: "Spices",
      ar: "التوابل",
    },
  },
];

export function getProductCategoryBySlug(slug: string) {
  return PRODUCT_CATEGORIES.find((c) => c.slug === slug) ?? null;
}

export function getProductCategoryDisplayName(category: ProductCategoryConfig, locale: SupportedLocale) {
  return category.displayName[locale] ?? category.displayName.en;
}

