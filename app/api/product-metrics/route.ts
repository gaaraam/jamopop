// The Worker intercepts this route before authentication; this fallback also supports dev routing.
import { productMetricsEndpoint } from '@/build/product-metrics.mjs';
import { database } from '@/lib/store';
export async function POST(req: Request) {
  return productMetricsEndpoint(req, { DB: database() });
}
