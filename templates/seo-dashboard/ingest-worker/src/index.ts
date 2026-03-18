/**
 * Search Intelligence Ingest Worker (thin router — copy and customize)
 *
 * Triggers a durable Workflow for search data ingestion.
 * The worker returns immediately; the workflow handles retries.
 *
 * Endpoints:
 * - GET /health       — D1 row counts (no workflow)
 * - GET /run          — trigger daily ingest workflow
 * - GET /backfill?days=28 — trigger backfill workflow
 * - cron              — trigger daily ingest workflow
 */

import type { IngestParams } from './workflow';

export { SearchIngestWorkflow } from './workflow';

export interface Env {
	GSC_SITE_URL: string;
	GSC_SERVICE_ACCOUNT_KEY: string;
	BING_SITE_URL: string;
	BING_API_KEY: string;
	DB: D1Database;
	/** Workflow binding — configured in wrangler.jsonc */
	INGEST_WORKFLOW: Workflow<IngestParams>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json' },
	});
}

// ---------------------------------------------------------------------------
// Worker entry points
// ---------------------------------------------------------------------------

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);

		// Health check (synchronous, no workflow)
		if (url.pathname === '/health') {
			try {
				const googleCount = await env.DB.prepare(
					"SELECT COUNT(*) as count FROM search_performance WHERE source = 'google'",
				).first<{ count: number }>();
				const bingCount = await env.DB.prepare(
					"SELECT COUNT(*) as count FROM search_performance WHERE source = 'bing'",
				).first<{ count: number }>();
				return jsonResponse({
					status: 'ok',
					google: { rows: googleCount?.count ?? 0, siteUrl: env.GSC_SITE_URL },
					bing: { rows: bingCount?.count ?? 0, siteUrl: env.BING_SITE_URL ?? 'not configured' },
				});
			} catch (err) {
				return jsonResponse(
					{ status: 'error', message: err instanceof Error ? err.message : String(err) },
					500,
				);
			}
		}

		// GET /backfill?days=28 — trigger backfill workflow
		if (url.pathname === '/backfill' && request.method === 'GET') {
			const daysParam = parseInt(url.searchParams.get('days') ?? '28', 10);
			const days = Math.min(Math.max(daysParam, 1), 90);

			const workflowId = `backfill-${Date.now()}`;
			const instance = await env.INGEST_WORKFLOW.create({
				id: workflowId,
				params: { mode: 'backfill', days },
			});

			return jsonResponse({ triggered: true, workflowId: instance.id, days });
		}

		// GET /run — trigger daily ingest workflow
		if (url.pathname === '/run' && request.method === 'GET') {
			const workflowId = `daily-${Date.now()}`;
			const instance = await env.INGEST_WORKFLOW.create({
				id: workflowId,
				params: { mode: 'daily' },
			});

			return jsonResponse({ triggered: true, workflowId: instance.id });
		}

		return jsonResponse({ error: 'Not found' }, 404);
	},

	async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
		console.log(`[SearchIngest] Cron triggered at ${new Date(event.scheduledTime).toISOString()}`);

		const workflowId = `cron-${Date.now()}`;
		const promise = env.INGEST_WORKFLOW.create({
			id: workflowId,
			params: { mode: 'daily' },
		});

		ctx.waitUntil(promise.then((instance) => {
			console.log(`[SearchIngest] Workflow triggered: ${instance.id}`);
		}));
	},
};
