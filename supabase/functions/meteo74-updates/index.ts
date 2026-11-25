import manifest from "./latest.json" with { type: "json" };

const bucket = "meteo74-releases";
const basePath = /^(?:\/functions\/v1)?\/meteo74-updates\/([^/]+)$/;

export async function handler(req: Request): Promise<Response> {
  if (req.method !== "GET" && req.method !== "HEAD") {
    return new Response(null, { status: 405, headers: { Allow: "GET, HEAD" } });
  }
  const name = new URL(req.url).pathname.match(basePath)?.[1];
  if (name === "latest.json") {
    return new Response(req.method === "HEAD" ? null : JSON.stringify(manifest), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
      },
    });
  }
  if (name !== manifest.file) return new Response(null, { status: 404 });

  // Use the function's project and credentials. The client can only request this release.
  const project = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const headers = new Headers({ apikey: key, Authorization: "Bearer " + key, "Accept-Encoding": "identity" });
  const range = req.headers.get("Range");
  if (range) headers.set("Range", range);
  const url = project + "/storage/v1/object/authenticated/" + bucket + "/" + encodeURIComponent(manifest.file);
  const file = await fetch(url, { method: req.method, headers, redirect: "error" });
  if (file.status !== 200 && file.status !== 206 && file.status !== 416) {
    await file.body?.cancel();
    return new Response(null, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  const out = new Headers({
    "Content-Type": "application/vnd.android.package-archive",
    "Content-Disposition": 'attachment; filename="' + manifest.file + '"',
    "Accept-Ranges": "bytes", "Cache-Control": "private, max-age=86400, immutable",
    ETag: '"' + manifest.sha256 + '"', "X-Content-Type-Options": "nosniff",
  });
  for (const field of ["Content-Length", "Content-Range"]) {
    const value = file.headers.get(field);
    if (value) out.set(field, value);
  }
  if (file.status === 416) {
    await file.body?.cancel();
    out.delete("Content-Length");
    out.set("Content-Range", "bytes */" + manifest.size);
    return new Response(null, { status: 416, headers: out });
  }
  return new Response(req.method === "HEAD" ? null : file.body, { status: file.status, headers: out });
}

Deno.serve(handler);
