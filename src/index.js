/** emergency restore stub — replace with full src/index.js from artifacts/RESTORE_src_index.js */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/health" || url.pathname === "/health/") {
      return new Response(JSON.stringify({ ok: true, service: "kirillovec-ai-studio", stub: true, time: new Date().toISOString() }), {
        headers: { "content-type": "application/json", "access-control-allow-origin": "*" }
      });
    }
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: {
        "Access-Control-Allow-Origin": request.headers.get("Origin") || "*",
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Credentials": "true"
      }});
    }
    return new Response(JSON.stringify({
      error: "DEPLOY_INCOMPLETE",
      message: "API временно на заглушке. Залей полный src/index.js из RESTORE_src_index.js или UPGRADE_src_index.js."
    }), { status: 503, headers: { "content-type": "application/json", "access-control-allow-origin": "*" } });
  }
};
