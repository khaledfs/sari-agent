import { NextResponse } from "next/server";
import { z } from "zod";

import { getTopProductMatches, matchActiveProductByQuery } from "@/services/product-matching.service";

const bodySchema = z.object({
  query: z.string().trim().min(1, "query is required."),
});

export async function POST(req: Request) {
  try {
    const raw = (await req.json().catch(() => ({}))) as unknown;
    const body = bodySchema.parse(raw);

    const bestMatch = await matchActiveProductByQuery(body.query);
    const topCandidates = await getTopProductMatches(body.query, 5);

    return NextResponse.json(
      {
        success: true,
        data: {
          query: body.query,
          bestMatch,
          topCandidates,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to debug product match.";
    return NextResponse.json({ success: false, message }, { status: 400 });
  }
}

