// The site's Worker. Static files are served by Cloudflare directly; only
// /v1/contact/* runs this code, which hands the request to the existing
// kuschonink-contact Worker (Turnstile check + email) over a service binding.

interface Env {
  ASSETS: Fetcher;
  CONTACT: Fetcher;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/v1/contact/')) {
      return env.CONTACT.fetch(request);
    }
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
