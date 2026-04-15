// esolia-cicd-evidence Worker
//
// Receives CI/CD evidence bundles from GitHub Actions via OIDC auth,
// stores artifacts in R2, indexes metadata in D1.
//
// No static secrets needed — authentication is entirely via GitHub's
// OIDC tokens, verified against their public JWKS endpoint.

import { Hono } from 'hono';
import { verifyGitHubOidc } from './oidc';
import type { Env } from './types';

const app = new Hono<{ Bindings: Env }>();

// ── Health check ──

app.get('/health', (c) => {
  return c.json({ status: 'ok', service: 'esolia-cicd-evidence' });
});

// ── Receive evidence bundle ──

app.post('/api/v1/evidence', async (c) => {
  const env = c.env;

  // InfoSec: Authenticate via GitHub OIDC — no static API keys
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'Missing Authorization header' }, 401);
  }

  const token = authHeader.slice(7);
  let claims;
  try {
    claims = await verifyGitHubOidc(token, env.GITHUB_OIDC_AUDIENCE, env.GITHUB_ORG);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Authentication failed';
    console.error('OIDC verification failed:', message);
    return c.json({ error: 'Authentication failed', detail: message }, 401);
  }

  // Extract metadata from headers (set by the workflow)
  const repository = c.req.header('X-GitHub-Repository') ?? claims.repository;
  const runId = c.req.header('X-GitHub-Run-ID') ?? claims.run_id;
  const commitSha = c.req.header('X-GitHub-SHA') ?? claims.sha;
  const manifestHash = c.req.header('X-Evidence-Manifest-Hash');
  const policyVersion = c.req.header('X-Policy-Version') ?? '';
  const policyDecision = c.req.header('X-Policy-Decision') ?? '';

  if (!manifestHash) {
    return c.json({ error: 'Missing X-Evidence-Manifest-Hash header' }, 400);
  }

  // Read the gzipped tarball
  const body = await c.req.arrayBuffer();
  if (body.byteLength === 0) {
    return c.json({ error: 'Empty body' }, 400);
  }

  if (body.byteLength > 10 * 1024 * 1024) {
    return c.json({ error: 'Bundle too large (10MB max)' }, 413);
  }

  // Store the raw bundle in R2
  // Prefix: {repo-slug}/{run-id}/
  const repoSlug = repository.replace('/', '-');
  const r2Prefix = `${repoSlug}/${runId}`;
  const bundleKey = `${r2Prefix}/evidence-bundle.tar.gz`;

  await env.EVIDENCE_BUCKET.put(bundleKey, body, {
    httpMetadata: { contentType: 'application/gzip' },
    customMetadata: {
      repository,
      run_id: runId,
      commit_sha: commitSha,
      manifest_hash: manifestHash,
      actor: claims.actor,
      ref: claims.ref,
      uploaded_at: new Date().toISOString(),
    },
  });

  // Generate a ULID-ish ID (timestamp + random)
  const id = generateId();
  const now = new Date().toISOString();

  // Index in D1
  try {
    await env.EVIDENCE_DB.prepare(
      `INSERT INTO evidence_runs (
        id, repository, commit_sha, ref, run_id, run_url,
        actor, policy_version, decision, manifest_hash,
        r2_prefix, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        id,
        repository,
        commitSha,
        claims.ref,
        runId,
        `https://github.com/${repository}/actions/runs/${runId}`,
        claims.actor,
        policyVersion,
        policyDecision,
        manifestHash,
        r2Prefix,
        now
      )
      .run();
  } catch (e) {
    // D1 write failed — log but don't fail the request.
    // The evidence is already in R2 (the durable store).
    console.error('D1 index write failed:', e);
  }

  console.log(
    `Evidence stored: repo=${repository} run=${runId} sha=${commitSha.slice(0, 8)} r2=${bundleKey}`
  );

  return c.json(
    {
      id,
      r2_prefix: r2Prefix,
      manifest_hash: manifestHash,
      indexed_at: now,
    },
    201
  );
});

// ── Query evidence (for internal review / audit) ──

app.get('/api/v1/evidence', async (c) => {
  const env = c.env;

  // InfoSec: REQUIRES Cloudflare Access policy before deployment.
  // Without it, anyone with the Worker URL can enumerate all evidence runs
  // (repo names, commit SHAs, actors, policy decisions).
  // See runbook § "Protect the Worker" for Access setup.

  const repo = c.req.query('repository');
  const limit = Math.min(Number(c.req.query('limit') ?? 50), 100);

  let query = 'SELECT * FROM evidence_runs';
  const params: string[] = [];

  if (repo) {
    query += ' WHERE repository = ?';
    params.push(repo);
  }

  query += ' ORDER BY created_at DESC LIMIT ?';
  params.push(String(limit));

  const { results } = await env.EVIDENCE_DB.prepare(query)
    .bind(...params)
    .all();

  return c.json({ runs: results, count: results.length });
});

// ── Get specific run ──

app.get('/api/v1/evidence/:id', async (c) => {
  const env = c.env;
  const id = c.req.param('id');

  const row = await env.EVIDENCE_DB.prepare('SELECT * FROM evidence_runs WHERE id = ?')
    .bind(id)
    .first();

  if (!row) {
    return c.json({ error: 'Not found' }, 404);
  }

  return c.json({ run: row });
});

// ── Helpers ──

function generateId(): string {
  const timestamp = Date.now().toString(36);
  const randomBytes = crypto.getRandomValues(new Uint8Array(6));
  const random = Array.from(randomBytes)
    .map((b) => b.toString(36).padStart(2, '0'))
    .join('')
    .slice(0, 8);
  return `${timestamp}-${random}`;
}

export default app;
