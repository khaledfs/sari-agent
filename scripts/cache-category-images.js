/* eslint-disable no-console */
const path = require("path");
const fs = require("fs/promises");

async function download(url) {
  const res = await fetch(url, { headers: { accept: "image/*" } });
  if (!res.ok) throw new Error(`Failed ${res.status} ${res.statusText} for ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (!buf.length) throw new Error(`Empty body for ${url}`);
  const ct = (res.headers.get("content-type") || "").toLowerCase();
  let ext = "jpg";
  if (ct.includes("image/png")) ext = "png";
  if (ct.includes("image/webp")) ext = "webp";
  if (ct.includes("image/jpeg")) ext = "jpg";
  if (ct.includes("image/svg+xml")) ext = "svg";
  return { buf, ext };
}

async function main() {
  const outRoot = path.join(process.cwd(), "public", "categories");
  await fs.mkdir(outRoot, { recursive: true });

  const categories = [
    {
      slug: "butter-margarine-and-oils",
      url: "https://sarihassan.com/wp-content/uploads/2024/07/%D7%97%D7%9E%D7%90%D7%94-%D7%9E%D7%A8%D7%92%D7%A8%D7%99%D7%A0%D7%94-%D7%95%D7%A9%D7%9E%D7%A0%D7%99%D7%9D.png",
    },
    { slug: "legumes", url: "https://sarihassan.com/wp-content/uploads/2024/07/%D7%A7%D7%98%D7%A0%D7%99%D7%95%D7%AA.png" },
    { slug: "flours", url: "https://sarihassan.com/wp-content/uploads/2024/07/%D7%A7%D7%9E%D7%97%D7%99%D7%9D.png" },
    {
      slug: "cream-frozen-and-refrigerated-products",
      url: "https://sarihassan.com/wp-content/uploads/2024/07/%D7%A7%D7%A6%D7%A4%D7%AA-%D7%95%D7%A9%D7%9E%D7%A0%D7%AA-%D7%9E%D7%AA%D7%95%D7%A7%D7%94.png",
    },
    { slug: "baking-and-drink-powders", url: "https://sarihassan.com/wp-content/uploads/2024/07/%D7%90%D7%91%D7%A7%D7%95%D7%AA.png" },
    { slug: "packaging-and-disposable-items", url: "https://sarihassan.com/wp-content/uploads/2024/07/%D7%97%D7%93-%D7%A4%D7%A2%D7%9E%D7%99.png" },
    {
      slug: "biscuits-and-pastry-dough",
      url: "https://sarihassan.com/wp-content/uploads/2024/07/%D7%91%D7%A6%D7%A7-%D7%95%D7%A2%D7%92%D7%99%D7%95%D7%AA.png",
    },
    { slug: "tools", url: "https://sarihassan.com/wp-content/uploads/2024/07/%D7%A1%D7%99%D7%A0%D7%98%D7%A8%D7%99%D7%9D.png" },
    {
      slug: "mirror-glaze-syrup-and-glucose",
      url: "https://sarihassan.com/wp-content/uploads/2024/07/%D7%9E%D7%99%D7%A8%D7%95%D7%A8-%D7%A6%D7%99%D7%A4%D7%95%D7%99-%D7%A2%D7%95%D7%92%D7%95%D7%AA.png",
    },
    {
      slug: "improvers-and-yeast",
      url: "https://sarihassan.com/wp-content/uploads/2024/07/%D7%9E%D7%A9%D7%A4%D7%A8%D7%99-%D7%90%D7%A4%D7%99%D7%94.png",
    },
    {
      slug: "extracts-food-colors-and-concentrates",
      url: "https://sarihassan.com/wp-content/uploads/2024/08/FoodColors.jpg",
    },
    {
      slug: "cake-decorating-items",
      url: "https://sarihassan.com/wp-content/uploads/2024/07/%D7%91%D7%A6%D7%A7-%D7%A1%D7%95%D7%9B%D7%A8-%D7%95%D7%97%D7%95%D7%AA%D7%9B%D7%A0%D7%99%D7%9D.png",
    },
    {
      slug: "chocolate-and-fillings",
      url: "https://sarihassan.com/wp-content/uploads/2024/07/%D7%9E%D7%9C%D7%99%D7%95%D7%AA-%D7%9E%D7%9E%D7%A8%D7%97%D7%99%D7%9D.png",
    },
    { slug: "canned-goods", url: "https://sarihassan.com/wp-content/uploads/2024/08/Shimorim.jpg" },
    {
      slug: "spices",
      url: "https://sarihassan.com/wp-content/uploads/2024/07/%D7%A1%D7%95%D7%9B%D7%A8-%D7%95%D7%AA%D7%97%D7%9C%D7%A4%D7%99-%D7%A1%D7%95%D7%9B%D7%A8.png",
    },
  ];

  for (const c of categories) {
    const { buf, ext } = await download(c.url);
    const folder = path.join(outRoot, c.slug);
    await fs.mkdir(folder, { recursive: true });
    const out = path.join(folder, `category.${ext}`);
    await fs.writeFile(out, buf);
    console.log(`Saved ${c.slug} -> public/categories/${c.slug}/category.${ext}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

