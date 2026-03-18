/**
 * Durable Workflow for Search Intelligence Ingestion (template)
 *
 * Fetches search performance data from Google Search Console and
 * Bing Webmaster Tools, storing it in D1. Each API call and DB write
 * is a discrete, retryable step. Triggered by the thin worker router.
 *
 * Delegates to @esolia/core/seo/ingest for API calls and data transforms.
 */

import { WorkflowEntrypoint, WorkflowEvent, WorkflowStep } from 'cloudflare:workers';
import { NonRetryableError } from 'cloudflare:workflows';
import {
	gscAuth,
	isNonRetryableGoogleError,
	fetchGSCDay,
	buildUpsertStatements,
	fetchBingQueryStats,
	bingStatsToSearchRows,
} from '@esolia/core/seo/ingest';

interface WorkflowEnv {
	GSC_SITE_URL: string;
	GSC_SERVICE_ACCOUNT_KEY: string;
	BING_SITE_URL: string;
	BING_API_KEY: string;
	DB: D1Database;
}

export interface IngestParams {
	mode: 'daily' | 'backfill';
	days?: number;
}

const RETENTION_DAYS = 90;

// ---------------------------------------------------------------------------
// D1 helper — executes PreparedQuery batches from the library
// ---------------------------------------------------------------------------

async function upsertRows(db: D1Database, rows: import('@esolia/core/seo/ingest').SearchRow[]): Promise<number> {
	const batches = buildUpsertStatements(rows);
	let inserted = 0;

	for (const batch of batches) {
		const statements = batch.map((q) => db.prepare(q.sql).bind(...q.params));
		await db.batch(statements);
		inserted += batch.length;
	}

	return inserted;
}

// ---------------------------------------------------------------------------
// Workflow
// ---------------------------------------------------------------------------

export class SearchIngestWorkflow extends WorkflowEntrypoint<WorkflowEnv, IngestParams> {
	private async authenticateGoogle(): Promise<string> {
		try {
			return await gscAuth(this.env.GSC_SERVICE_ACCOUNT_KEY);
		} catch (error) {
			if (isNonRetryableGoogleError(error)) {
				const msg = error instanceof Error ? error.message : 'Unknown auth error';
				throw new NonRetryableError(`Google auth failed: ${msg}`);
			}
			throw error;
		}
	}

	private dateAgo(eventTimestamp: Date, daysAgo: number): string {
		const d = new Date(eventTimestamp);
		d.setDate(d.getDate() - daysAgo);
		return d.toISOString().slice(0, 10);
	}

	override async run(event: WorkflowEvent<IngestParams>, step: WorkflowStep) {
		const { mode, days } = event.payload;
		const eventTime = new Date(event.timestamp);

		console.log(`[Workflow] Starting search ingest (mode=${mode})`);

		if (mode === 'daily') {
			return await this.runDaily(eventTime, step);
		} else {
			return await this.runBackfill(eventTime, days ?? 28, step);
		}
	}

	private async runDaily(eventTime: Date, step: WorkflowStep) {
		const googleDates = [3, 4, 5].map((d) => this.dateAgo(eventTime, d));
		let totalGoogleRows = 0;

		for (const date of googleDates) {
			const result = await step.do(
				`ingest-google-${date}`,
				{ retries: { limit: 3, backoff: 'exponential', delay: '10 seconds' }, timeout: '120 seconds' },
				async () => {
					const accessToken = await this.authenticateGoogle();
					const searchRows = await fetchGSCDay(accessToken, this.env.GSC_SITE_URL, date);
					const rows = await upsertRows(this.env.DB, searchRows);
					console.log(`[Workflow] Google ${date}: ${rows} rows`);
					return { date, rows };
				},
			);
			totalGoogleRows += result.rows;
		}

		const bingResult = await step.do(
			'ingest-bing',
			{ retries: { limit: 3, backoff: 'exponential', delay: '10 seconds' }, timeout: '60 seconds' },
			async () => {
				if (!this.env.BING_API_KEY) {
					console.log('[Workflow] Bing: skipped (no API key)');
					return { rows: 0, skipped: true };
				}

				const bingStats = await fetchBingQueryStats(this.env.BING_SITE_URL, this.env.BING_API_KEY);
				const searchRows = bingStatsToSearchRows(bingStats, 30);
				const totalRows = await upsertRows(this.env.DB, searchRows);
				console.log(`[Workflow] Bing: ${totalRows} rows`);
				return { rows: totalRows, skipped: false };
			},
		);

		const cleanupResult = await step.do(
			'cleanup-old-data',
			{ retries: { limit: 3, backoff: 'exponential', delay: '5 seconds' }, timeout: '30 seconds' },
			async () => {
				const cutoff = new Date(eventTime);
				cutoff.setDate(cutoff.getDate() - RETENTION_DAYS);
				const cutoffDate = cutoff.toISOString().slice(0, 10);

				const result = await this.env.DB
					.prepare('DELETE FROM search_performance WHERE date < ?')
					.bind(cutoffDate)
					.run();

				const cleaned = result.meta.changes ?? 0;
				console.log(`[Workflow] Cleanup: ${cleaned} old rows deleted`);
				return { cleaned };
			},
		);

		return await step.do('daily-summary', async () => {
			const summary = {
				timestamp: new Date().toISOString(),
				mode: 'daily' as const,
				google: { dates: [3, 4, 5].map((d) => this.dateAgo(eventTime, d)), totalRows: totalGoogleRows },
				bing: bingResult,
				cleaned: cleanupResult.cleaned,
			};
			console.log(`[Workflow] Complete: ${JSON.stringify(summary)}`);
			return summary;
		});
	}

	private async runBackfill(eventTime: Date, days: number, step: WorkflowStep) {
		const clampedDays = Math.min(Math.max(days, 1), 90);
		const startDaysAgo = clampedDays + 2;
		const endDaysAgo = 3;

		const results: { date: string; status: string; rows: number }[] = [];

		for (let daysAgo = endDaysAgo; daysAgo <= startDaysAgo; daysAgo++) {
			const date = this.dateAgo(eventTime, daysAgo);

			const dayResult = await step.do(
				`backfill-${date}`,
				{ retries: { limit: 3, backoff: 'exponential', delay: '10 seconds' }, timeout: '120 seconds' },
				async () => {
					const existing = await this.env.DB
						.prepare("SELECT COUNT(*) as cnt FROM search_performance WHERE source = 'google' AND date = ?")
						.bind(date)
						.first<{ cnt: number }>();

					if (existing && existing.cnt > 0) {
						console.log(`[Workflow] Backfill ${date}: skipped (${existing.cnt} rows exist)`);
						return { date, status: 'skipped' as const, rows: existing.cnt };
					}

					const accessToken = await this.authenticateGoogle();
					const searchRows = await fetchGSCDay(accessToken, this.env.GSC_SITE_URL, date);
					const rows = await upsertRows(this.env.DB, searchRows);
					console.log(`[Workflow] Backfill ${date}: ${rows} rows ingested`);
					return { date, status: 'ingested' as const, rows };
				},
			);

			results.push(dayResult);
		}

		return await step.do('backfill-summary', async () => {
			const ingested = results.filter((r) => r.status === 'ingested');
			const skipped = results.filter((r) => r.status === 'skipped');

			const summary = {
				timestamp: new Date().toISOString(),
				mode: 'backfill' as const,
				totalDays: results.length,
				ingested: ingested.length,
				skipped: skipped.length,
				totalRowsAdded: ingested.reduce((s, r) => s + r.rows, 0),
				results,
			};
			console.log(`[Workflow] Backfill complete: ${JSON.stringify(summary)}`);
			return summary;
		});
	}
}
