[![Proven.lol Lightweight Proof](https://img.shields.io/badge/Proven.lol-Lightweight_Proof-green?style=flat-square&logo=cachet)](https://proven.lol/fbd788)

**Last Updated:** January 26th, 2026 at 1:39:09 AM GMT+9


## Welcome 👋

We're eSolia — a Tokyo-based IT consultancy that builds software. Since 1999, we've helped international companies navigate Japan's business technology landscape, and along the way, we've developed serious software engineering capabilities.

This GitHub profile is where we share our work: internal tools that solve real problems for our clients, and open-source utilities that might help you too.

## What We're Building

We develop business software focused on **security**, **compliance**, and **operational visibility** for international companies in Japan.

| Product | Purpose | Stack |
|---------|---------|-------|
| **Nexus** | Central platform hub — OAuth provider, secure file sharing with provenance, unified client management across all apps | Hono, Cloudflare Workers, D1, R2, Queues |
| **Pulse** | Compliance dashboard for SOC 2, ISO 27001, PCI-DSS — accumulates evidence against vetted control lists with secure, shareable executive reports | SvelteKit, Cloudflare Pages, D1, R2 |
| **Periodic** | DNS drift monitoring and alerting — detects unauthorized changes before they become security incidents | SvelteKit, Cloudflare Pages, D1 |
| **Courier** | Desktop secure file sharing — PIN-protected document delivery with BCC-trigger workflow for frictionless sharing | SvelteKit, Cloudflare Pages |
| **Chōchō** | ESL listening comprehension trainer — pre-generated multi-accent TTS audio for Japanese staff preparing for international calls | SvelteKit PWA, Cloudflare Pages, D1, R2 |
| **Codex** *(coming soon)* | Unified knowledge infrastructure — single source of truth with dual authoring (CMS for staff, Git for power users), AI-powered RAG search, and SharePoint integration. Ask Miko (巫女) | SvelteKit, Cloudflare Pages, D1, R2 |

All apps emphasize **physical data isolation per client** — we don't do shared databases with logical separation for compliance-grade applications. Nexus provides **single sign-on** across the suite via OAuth2/OIDC with Microsoft 365 SSO and magic link authentication.

## Our Stack

We build primarily on **Cloudflare's platform** (Workers, Pages, D1, R2, Queues) for its compelling security-to-cost ratio: enterprise-grade edge security, DDoS protection, and WAF capabilities without enterprise pricing. For applications requiring Deno KV's strong consistency model, we deploy to **Deno Deploy**.

### Core Principles

| Principle | Policy |
|---------|---------|
| **OWASP Top 10** | → Every project, every review: Compliance-grade applications must adhere to the OWASP Top 10 security risks. |
| **ISO 27001** | → Incorporated into dev practices for comprehensive security management. |
| **Defense in depth** | → Multiple security layers, not one wall. |
| **Continuous Integration/Continuous Deployment (CI/CD)** | → Automated testing and deployment pipelines ensure quality and security. |
| **Security by Design** | → Security is integrated into the design and development process. |
| **Security Automation** | → Automated security tools and processes for faster response and prevention. |
| **Security Awareness Training** | → Regular training for developers and users to understand and mitigate security risks. |
| **Security Monitoring** | → Continuous monitoring for threats and anomalies. |
| **Edge-first** | → Security and performance at the edge. |
| **Zero Trust** | → Trust no one, verify everything. |

### Technologies

<div align="center">

**Languages & Frontend**

![Languages](https://skillicons.dev/icons?i=ts,js,svelte,html,css,tailwind)

**Platforms & Runtime**

![Platforms](https://skillicons.dev/icons?i=cloudflare,workers,deno,nodejs,sqlite,postgres)

**Tools & Environment**

![Tools](https://skillicons.dev/icons?i=git,github,bash,vscode,apple,linux)

</div>

## Security Practices

We incorporate **ISO 27001:2022** good practices into our development work, backed by automated security scanning in CI/CD.

### Centralized Security Scanning

We maintain a **reusable security workflow** ([`security.yml`](.github/workflows/security.yml)) that runs comprehensive OWASP-aligned checks across all our repositories:

| Scanner | Coverage |
|---------|----------|
| **Semgrep SAST** | OWASP Top 10, TypeScript/JavaScript patterns, secrets detection |
| **Trivy** | Dependency vulnerabilities, embedded secrets, license compliance |
| **Gitleaks** | Git history secret scanning |
| **Dependency Audit** | npm/pnpm/yarn vulnerability database |
| **ASVS Compliance** | OWASP Application Security Verification Standard checks |
| **TypeScript** | Type safety verification |
| **ESLint** | Code quality and security linting |

Any repository can adopt this workflow with minimal configuration:
```yaml
jobs:
  security:
    uses: eSolia/.github/.github/workflows/security.yml@main
```

<details>
<summary><strong>ISO 27001:2022 Annex A Control 8.25 Compliance</strong></summary>

| Requirement | How We Address It |
|-------------|-------------------|
| Separate dev, test, and production environments | Local development → protected preview branches → production. For PROdb, combined dev/test environments merge to production after approval. |
| Security guidance in SDLC | Handled via SOP with OWASP Top 10 as baseline for every project. |
| Security requirements in design phase | Every project specifies security requirements during initial specification. |
| Security checkpoints in projects | Security framework established in spec → developed per guidelines → security implementation reported. |
| Security and system testing | Security header validation for websites. Platform vendor penetration testing plus our checks on table, view, and form security for database projects. |
| Secure source code repositories | Write permissions (commit/merge) restricted to permitted personnel only. |
| Version control security | Change management process explicitly considers version control security. |
| Developer security knowledge | Ongoing training and knowledge development program. |
| Flaw recognition capability | Active effort to understand and identify security weaknesses in our work. |
| Licensing compliance | Full awareness and adherence to all licensing requirements. |

</details>

## Latest Bluesky Posts:
* [📣 New Blog Post&#xA;Feeling digital overload?&#xA;Discover simple digital detox habits used by IT professionals—like fewer notifications and more offline time. Easy tips for everyday life.&#xA;https://blog.esolia.pro/en/posts/20260122-digital-detox-habits-en/ &#xA;#DigitalDetox #OfflineTime #ScreenTime](https://bsky.app/profile/esolia.com/post/3mczkncfyhz22)
* [📣 New Blog Post &#xA;デジタル過多の時代、意識しないうちに情報疲れになっていませんか？&#xA;この記事ではIT担当者が実践する“無理なく続けるデジタルデトックス習慣”をまとめています。通知を減らす、小さなオフライン時間を作る…日常に取り入れやすいヒント満載！記事はこちらから👇&#xA;https://blog.esolia.pro/posts/20260122-%E3%83%87%E3%82%B8%E3%82%BF%E3%83%AB%E3%83%87%E3%83%88%E3%83%83%E3%82%AF%E3%82%B9-ja/ &#xA;#デジタルデトックス#オフライン時間#スクリーンタイム](https://bsky.app/profile/esolia.com/post/3mcy65kx5pt27)
* [📣 New Blog Post &#xA;A clear overview of PDF features, use cases, and the role of Acrobat—useful for both work and everyday life. Read more 👇&#xA;https://blog.esolia.pro/en/posts/20260106-what-is-pdf-en/](https://bsky.app/profile/esolia.com/post/3mbrd6eglht2h)


## Stats:

| Item | Value |
| --- | --- |
| Repo Total Files | 1 |
| Repo Size in MB | 269 |
| Lume Version | v2.4.2 |
| Deno Version | 2.6.6 |
| V8 Version | 14.2.231.17-rusty |
| Typescript Version | 5.9.2 |
| Timezone | Asia/Tokyo |

### How does this readme work?

We're generating this readme using the [Lume](https://lume.land/) static site generator from within the eSolia [.github](https://github.com/esolia/.github) repository. See [this page](https://rickcogley.github.io/rickcogley/) for details to get your own dynamic readme!

<details>
<summary><strong>How does this README work?</strong></summary>

We generate this README using the [Lume](https://lume.land/) static site generator from within the eSolia [.github](https://github.com/esolia/.github) repository. See [this page](https://rickcogley.github.io/rickcogley/) for details to get your own dynamic README.

</details>


