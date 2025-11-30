import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

const conflictKeys = ["order_id", "product_id", "post_id", "id", "comment_key", "post_key"];

const supabaseAdmin = url && serviceKey ? createClient(url, serviceKey) : null;

export async function POST(request) {
  if (!supabaseAdmin) {
    return NextResponse.json(
      { message: "Service key가 설정되지 않았습니다." },
      { status: 500 }
    );
  }

  try {
    const body = await request.json();
    const items = Array.isArray(body?.items) ? body.items : [];
    if (!items.length) {
      return NextResponse.json({ results: [], message: "no items" }, { status: 200 });
    }

    const results = [];

    for (const item of items) {
      const { table, op = "upsert", payload = {}, pkValue, id } = item || {};
      if (!table || !payload) {
        results.push({ id, ok: false, reason: "invalid payload" });
        continue;
      }

      const conflictKey = conflictKeys.find((k) => Object.prototype.hasOwnProperty.call(payload, k));
      const eqKey = conflictKey || Object.keys(payload)[0];
      const eqValue = pkValue || (conflictKey ? payload[conflictKey] : payload[eqKey]);

      try {
        if (op === "delete") {
          const { error } = await supabaseAdmin.from(table).delete().eq(eqKey, eqValue);
          if (error) throw error;
          results.push({ id, ok: true });
          continue;
        }

        const { error } = await supabaseAdmin
          .from(table)
          .upsert(payload, { onConflict: conflictKey || eqKey });
        if (error) throw error;
        results.push({ id, ok: true });
      } catch (err) {
        results.push({ id, ok: false, reason: err.message });
      }
    }

    return NextResponse.json({ results }, { status: 200 });
  } catch (err) {
    console.error("sync api error", err);
    return NextResponse.json({ message: err.message || "sync error" }, { status: 500 });
  }
}
