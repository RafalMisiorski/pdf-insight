// Test stand-in for the Workers runtime module "cloudflare:workers": the real DurableObject base class
// exists only in Cloudflare's runtime. Vitest maps the import here (vitest.config.ts).
export class DurableObject {
  protected ctx: unknown
  protected env: unknown
  constructor(ctx: unknown, env: unknown) {
    this.ctx = ctx
    this.env = env
  }
}
