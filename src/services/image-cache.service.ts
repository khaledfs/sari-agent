import { createHash } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";

type CacheImageInput = {
  /** Remote http(s) URL */
  url: string;
  /** A relative path under /public (e.g. "categories/flours/category.png") */
  publicRelativePath: string;
};

function safePublicRelativePath(p: string) {
  const normalized = p.replaceAll("\\", "/").replace(/^\/+/, "");
  if (!normalized || normalized.includes("..")) {
    throw new Error("Invalid publicRelativePath.");
  }
  return normalized;
}

function contentTypeToExt(contentType: string | null) {
  const ct = (contentType ?? "").toLowerCase();
  if (ct.includes("image/webp")) return "webp";
  if (ct.includes("image/png")) return "png";
  if (ct.includes("image/jpeg") || ct.includes("image/jpg")) return "jpg";
  if (ct.includes("image/svg+xml")) return "svg";
  return "";
}

function inferExtFromUrl(url: string) {
  const u = url.toLowerCase();
  for (const ext of ["webp", "png", "jpg", "jpeg", "svg"] as const) {
    if (u.includes(`.${ext}`)) return ext === "jpeg" ? "jpg" : ext;
  }
  return "";
}

/**
 * Downloads a remote image and saves it under /public so the frontend can load it as "/<publicRelativePath>".
 * Returns the public URL path (e.g. "/categories/flours/category.png").
 */
export async function cacheRemoteImageToPublic(input: CacheImageInput): Promise<string> {
  const url = input.url.trim();
  if (!url) return "";
  if (!url.startsWith("http://") && !url.startsWith("https://")) return "";

  const publicRelativePath = safePublicRelativePath(input.publicRelativePath);

  const res = await fetch(url, {
    method: "GET",
    headers: { accept: "image/*" },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Image download failed: ${res.status} ${res.statusText}`);
  }

  const buf = Buffer.from(await res.arrayBuffer());
  if (!buf.length) {
    throw new Error("Image download returned empty body.");
  }

  // If caller passed a path without extension, add one.
  const extFromHeader = contentTypeToExt(res.headers.get("content-type"));
  const extFromUrl = inferExtFromUrl(url);
  const ext = extFromHeader || extFromUrl || "jpg";

  const relHasExt = /\.[A-Za-z0-9]+$/.test(publicRelativePath);
  const finalRelative = relHasExt ? publicRelativePath : `${publicRelativePath}.${ext}`;

  const outAbs = path.join(process.cwd(), "public", finalRelative);
  const outDir = path.dirname(outAbs);
  await mkdir(outDir, { recursive: true });

  // Small integrity marker: if same name reused, content changes won't be silent in git.
  const hash = createHash("sha1").update(buf).digest("hex").slice(0, 10);
  const withHash = finalRelative.replace(/\.[A-Za-z0-9]+$/, (m) => `.${hash}${m}`);

  const outAbsHashed = path.join(process.cwd(), "public", withHash);
  await writeFile(outAbsHashed, buf);

  return `/${withHash.replaceAll("\\", "/")}`;
}

