export default async function(req: Request): Promise<Response> {
  const hasApiKey = !!Deno.env.get('API_KEY');
  const baseUrl = Deno.env.get('INSFORGE_BASE_URL');
  return new Response(JSON.stringify({ hasApiKey, baseUrl }), {
    headers: { 'Content-Type': 'application/json' }
  });
}
