/**
 * SEO target keyword clusters mapped to ideal landing pages.
 * Single source of truth for "what we want to rank for."
 *
 * Customize for your site:
 * - Define keyword clusters by search intent, not internal service names
 * - Group by audience (who is searching)
 * - Map each cluster to the page that should rank for those keywords
 * - Use SQL LIKE patterns with % wildcards
 *
 * Edit this file and redeploy — no D1 schema changes needed.
 */

import type { SeoTarget } from '@esolia/core/seo';
export type { SeoTarget };

export const SEO_TARGETS: SeoTarget[] = [
	// ── Example: English-language audience ─────────────────────────

	{
		name: 'Primary Service (EN)',
		audience: 'english-searcher',
		keywords: [
			'%your service%japan%',
			'%your service%tokyo%',
			'%japan%your service%',
		],
		targetPages: {
			en: '/en/services/your-service/',
			ja: '/services/your-service/',
		},
	},

	// ── Example: Japanese-language audience ────────────────────────

	{
		name: 'プライマリサービス (JA)',
		audience: 'japanese-searcher',
		keywords: [
			'%あなたのサービス%東京%',
			'%あなたのサービス%日本%',
		],
		targetPages: {
			en: '/en/services/your-service/',
			ja: '/services/your-service/',
		},
	},

	// ── Example: Brand queries ─────────────────────────────────────

	{
		name: 'Brand Name',
		audience: 'both',
		keywords: [
			'%your company name%',
			'%your brand%',
		],
		targetPages: {
			en: '/en/',
			ja: '/',
		},
	},
];
