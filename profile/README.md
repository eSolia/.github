[![Proven.lol Lightweight Proof](https://img.shields.io/badge/Proven.lol-Lightweight_Proof-green?style=flat-square&logo=cachet)](https://proven.lol/fbd788)

**Last Updated:** December 18th, 2025 at 1:41:52 AM GMT+9


## Welcome 👋

We're eSolia — a Tokyo-based IT consultancy that builds software. Since 1999, we've helped international companies navigate Japan's business technology landscape, and along the way, we've developed serious software engineering capabilities.

This GitHub profile is where we share our work: internal tools that solve real problems for our clients, and open-source utilities that might help you too.

## What We're Building

We develop business software focused on **security**, **compliance**, and **operational visibility** for international companies in Japan.

| Product | Purpose | Stack |
|---------|---------|-------|
| **Pulse** | Compliance dashboard for SOC 2, ISO 27001, PCI-DSS — accumulates evidence against vetted control lists with secure, shareable executive reports | SvelteKit, Cloudflare Pages, D1, R2 |
| **Periodic** | DNS drift monitoring and alerting — detects unauthorized changes before they become security incidents | SvelteKit, Bits UI, Deno Deploy |
| **Nexus** | Secure document sharing with provenance — watermarking, audit trails, and expiring access for sensitive materials | SvelteKit, Cloudflare R2 |

All three emphasize **physical data isolation per client** — we don't do shared databases with logical separation for compliance-grade applications.

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

We incorporate **ISO 27001:2022** good practices into our development work. Here's how we address Annex A Control 8.25 ("rules for secure development of software and systems"):

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
* [📣 New Blog Post &#xA;We’ve summarized the key basics and tips for using Microsoft Teams Webinars.&#xA;It’s easy to follow—perfect for first-time hosts. Check it out👇&#xA;https://blog.esolia.pro/en/posts/20251212-teams-webinar-en/ &#xA;#MicrosoftTeams #Webinar #OnlineEvents #RemoteWork #TeamsTips](https://bsky.app/profile/esolia.com/post/3m7shlkwwuw2c)
* [📣 New Blog Post &#xA;Microsoft Teamsのウェビナー機能の基本と活用方法をまとめました！初めての方にもわかりやすく解説しています。オンラインイベント開催の参考にぜひご覧ください👇&#xA;https://blog.esolia.pro/posts/20251212-teams-webinar-%E5%9F%BA%E6%9C%AC%E3%81%A8%E6%B4%BB%E7%94%A8-ja/ &#xA;#MicrosoftTeams #ウェビナー #オンラインイベント #リモートワーク #TeamsTips #Webinar #オンラインセミナー](https://bsky.app/profile/esolia.com/post/3m7r2ztdxad2e)
* [📣 New Blog Post &#xA;Have you upgraded to Windows 11 yet?&#xA;I’ve highlighted three useful features in my latest blog post — they might just boost your productivity. Check out the article here👇&#xA;https://blog.esolia.pro/en/posts/20251120-windows-11-features-en/ &#xA;#Windows11Tips　#Windows11Features](https://bsky.app/profile/esolia.com/post/3m635bycpd42a)


## Stats:

| Item | Value |
| --- | --- |
| Repo Total Files | 1 |
| Repo Size in MB | 147 |
| Lume Version | v2.4.2 |
| Deno Version | 2.6.0 |
| V8 Version | 14.2.231.17-rusty |
| Typescript Version | 5.9.2 |
| Timezone | Asia/Tokyo |

### How does this readme work?

We're generating this readme using the [Lume](https://lume.land/) static site generator from within the eSolia [.github](https://github.com/esolia/.github) repository. See [this page](https://rickcogley.github.io/rickcogley/) for details to get your own dynamic readme!

<details>
<summary><strong>How does this README work?</strong></summary>

We generate this README using the [Lume](https://lume.land/) static site generator from within the eSolia [.github](https://github.com/esolia/.github) repository. See [this page](https://rickcogley.github.io/rickcogley/) for details to get your own dynamic README.

</details>


