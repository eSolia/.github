#!/usr/bin/env -S npx tsx
/**
 * ASVS Compliance Checker - Template
 *
 * Pattern-based security checks against OWASP ASVS 5.0.
 * Copy this file to your project's scripts/ directory and customize.
 *
 * Usage:
 *   npx tsx scripts/asvs-check.ts                    # Console output
 *   npx tsx scripts/asvs-check.ts --format json      # JSON output
 *   npx tsx scripts/asvs-check.ts --format json --output path/to/report.json
 *
 * Source: https://github.com/eSolia/.github/blob/main/security-assessment/
 */

import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from 'fs';
import { join, relative } from 'path';
import { execSync } from 'child_process';

// ============================================================================
// PROJECT CONFIGURATION - CUSTOMIZE THIS SECTION
// ============================================================================

const PROJECT_CONFIG = {
  // Project name (used in reports)
  name: 'your-project-name',

  // Paths to scan for source files
  sourcePaths: ['src/'],

  // API/server-side paths (for authentication, DB, etc. checks)
  apiPaths: ['src/routes/api/', 'src/lib/server/'],

  // Frontend/web paths (for XSS, client-side checks)
  webPaths: ['src/routes/', 'src/lib/components/'],

  // Package manager: 'npm' | 'pnpm' | 'yarn' | 'bun'
  packageManager: 'npm',

  // Expected CORS origins (for CORS check)
  corsOrigins: ['yourdomain.com'],

  // File extensions to scan
  extensions: ['.ts', '.tsx', '.js', '.svelte'],

  // Directories to skip
  skipDirs: ['node_modules', '.svelte-kit', 'dist', '.git', 'build'],
};

// ============================================================================
// TYPES
// ============================================================================

interface CheckResult {
  id: string;
  category: string;
  name: string;
  status: 'pass' | 'fail' | 'warning' | 'info';
  description: string;
  locations?: { file: string; line: number; snippet?: string }[];
  remediation?: string;
  asvsRef: string;
}

interface Report {
  timestamp: string;
  version: string;
  summary: {
    total: number;
    passed: number;
    failed: number;
    warnings: number;
  };
  checks: CheckResult[];
}

// ============================================================================
// CONSOLE COLORS
// ============================================================================

const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
};

// ============================================================================
// FILE UTILITIES
// ============================================================================

function getSourceFiles(dir: string, extensions = PROJECT_CONFIG.extensions): string[] {
  const files: string[] = [];
  const rootDir = process.cwd();
  const fullDir = join(rootDir, dir);

  if (!existsSync(fullDir)) return files;

  const entries = readdirSync(fullDir);
  for (const entry of entries) {
    const fullPath = join(fullDir, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      if (!PROJECT_CONFIG.skipDirs.includes(entry)) {
        files.push(...getSourceFiles(join(dir, entry), extensions));
      }
    } else if (extensions.some((ext) => entry.endsWith(ext))) {
      files.push(fullPath);
    }
  }

  return files;
}

function searchPattern(
  files: string[],
  pattern: RegExp
): { file: string; line: number; snippet: string }[] {
  const results: { file: string; line: number; snippet: string }[] = [];

  for (const file of files) {
    try {
      const content = readFileSync(file, 'utf-8');
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        if (pattern.test(lines[i])) {
          results.push({
            file: relative(process.cwd(), file),
            line: i + 1,
            snippet: lines[i].trim().slice(0, 100),
          });
        }
      }
    } catch {
      // Skip unreadable files
    }
  }

  return results;
}

function patternExists(files: string[], pattern: RegExp): boolean {
  return searchPattern(files, pattern).length > 0;
}

// ============================================================================
// ASVS CHECKS
// ============================================================================

function runChecks(rootDir: string): CheckResult[] {
  const results: CheckResult[] = [];

  // Collect files
  const apiFiles: string[] = [];
  for (const path of PROJECT_CONFIG.apiPaths) {
    apiFiles.push(...getSourceFiles(path));
  }

  const webFiles: string[] = [];
  for (const path of PROJECT_CONFIG.webPaths) {
    webFiles.push(...getSourceFiles(path));
  }

  const allFiles: string[] = [];
  for (const path of PROJECT_CONFIG.sourcePaths) {
    allFiles.push(...getSourceFiles(path));
  }

  // -------------------------------------------------------------------------
  // V2 Authentication
  // -------------------------------------------------------------------------

  // V2.1.1 - Password Hashing
  const hashingLocations = searchPattern(apiFiles, /crypto\.subtle\.digest|SHA-256|bcrypt|argon2/i);
  const saltLocations = searchPattern(apiFiles, /getRandomValues|randomUUID|salt/i);
  results.push({
    id: 'V2.1.1',
    category: 'V2 Authentication',
    name: 'Password Hashing',
    status: hashingLocations.length > 0 && saltLocations.length > 0 ? 'pass' : 'warning',
    description: 'Passwords must be hashed using approved algorithms with salt',
    locations: hashingLocations,
    asvsRef: 'V2.1.1',
    remediation:
      hashingLocations.length === 0
        ? 'Use Web Crypto API or bcrypt/argon2 for password hashing with unique salts'
        : undefined,
  });

  // V2.2.1 - Token Entropy
  const tokenGenLocations = searchPattern(apiFiles, /getRandomValues\(new Uint8Array\((\d+)\)/);
  const has32ByteToken = tokenGenLocations.some((loc) => {
    const match = loc.snippet.match(/Uint8Array\((\d+)\)/);
    return match && parseInt(match[1], 10) >= 32;
  });
  results.push({
    id: 'V2.2.1',
    category: 'V2 Authentication',
    name: 'Token Entropy',
    status: has32ByteToken ? 'pass' : 'warning',
    description: 'Access tokens must have at least 256 bits (32 bytes) of entropy',
    locations: tokenGenLocations,
    asvsRef: 'V2.2.1',
    remediation: !has32ByteToken
      ? 'Generate tokens with: crypto.getRandomValues(new Uint8Array(32))'
      : undefined,
  });

  // -------------------------------------------------------------------------
  // V3 Session Management
  // -------------------------------------------------------------------------

  // V3.3.1 - Token Expiration
  const expiryLocations = searchPattern(apiFiles, /expires_at|expiry|expiresAt|maxAge|max-age/i);
  results.push({
    id: 'V3.3.1',
    category: 'V3 Session Management',
    name: 'Token Expiration',
    status: expiryLocations.length > 0 ? 'pass' : 'warning',
    description: 'Access tokens must have expiration times',
    locations: expiryLocations,
    asvsRef: 'V3.3.1',
    remediation:
      expiryLocations.length === 0
        ? 'Add expiration to tokens/sessions (e.g., expires_at column, cookie maxAge)'
        : undefined,
  });

  // -------------------------------------------------------------------------
  // V4 Access Control
  // -------------------------------------------------------------------------

  // V4.1.1 - CORS Configuration
  const corsPattern = new RegExp(
    `cors\\(|Access-Control|${PROJECT_CONFIG.corsOrigins.map((o) => o.replace('.', '\\.')).join('|')}`,
    'i'
  );
  const corsLocations = searchPattern(apiFiles, corsPattern);
  results.push({
    id: 'V4.1.1',
    category: 'V4 Access Control',
    name: 'CORS Restrictions',
    status: corsLocations.length > 0 ? 'pass' : 'warning',
    description: 'CORS must be configured to restrict origins',
    locations: corsLocations,
    asvsRef: 'V4.1.1',
    remediation:
      corsLocations.length === 0
        ? 'Configure CORS middleware to restrict allowed origins'
        : undefined,
  });

  // V4.2.1 - Rate Limiting
  const rateLimitLocations = searchPattern(apiFiles, /rate.*limit|throttle|Too many|429/i);
  results.push({
    id: 'V4.2.1',
    category: 'V4 Access Control',
    name: 'Rate Limiting',
    status: rateLimitLocations.length > 0 ? 'pass' : 'warning',
    description: 'Sensitive endpoints should have rate limiting',
    locations: rateLimitLocations,
    asvsRef: 'V4.2.1',
    remediation:
      rateLimitLocations.length === 0
        ? 'Add rate limiting to authentication and API endpoints'
        : undefined,
  });

  // -------------------------------------------------------------------------
  // V5 Validation
  // -------------------------------------------------------------------------

  // V5.1.1 - Input Validation (MIME types)
  const mimeLocations = searchPattern(apiFiles, /ALLOWED.*TYPE|MIME|content-type.*check|accept.*image/i);
  results.push({
    id: 'V5.1.1',
    category: 'V5 Validation',
    name: 'Input Validation - MIME Types',
    status: mimeLocations.length > 0 ? 'pass' : 'info',
    description: 'File uploads must validate MIME types against allowlist',
    locations: mimeLocations,
    asvsRef: 'V5.1.1',
  });

  // V5.3.4 - SQL Injection Prevention
  const ormLocations = searchPattern(
    apiFiles,
    /\.select\(\)|\.insert\(\)|\.update\(\)|\.prepare\(|\.bind\(/
  );
  const rawSqlLocations = searchPattern(
    apiFiles,
    /\.raw\(|execute\s*\(\s*`|query\s*\(\s*`|\$\{.*\}.*SELECT|SELECT.*\+/i
  );
  results.push({
    id: 'V5.3.4',
    category: 'V5 Validation',
    name: 'SQL Injection Prevention',
    status:
      ormLocations.length > 0 && rawSqlLocations.length === 0
        ? 'pass'
        : rawSqlLocations.length > 0
          ? 'fail'
          : 'warning',
    description: 'Use parameterized queries or ORM to prevent SQL injection',
    locations: rawSqlLocations.length > 0 ? rawSqlLocations : ormLocations.slice(0, 3),
    asvsRef: 'V5.3.4',
    remediation:
      rawSqlLocations.length > 0
        ? 'Replace raw SQL string interpolation with parameterized queries (.bind() or ORM methods)'
        : undefined,
  });

  // V5.3.3 - XSS Prevention
  const unsafeHtmlLocations = searchPattern(webFiles, /@html|innerHTML|dangerouslySetInnerHTML/);
  const sanitizeLocations = searchPattern(allFiles, /sanitize|DOMPurify|escape.*html/i);
  results.push({
    id: 'V5.3.3',
    category: 'V5 Validation',
    name: 'XSS Prevention',
    status:
      unsafeHtmlLocations.length === 0
        ? 'pass'
        : sanitizeLocations.length > 0
          ? 'pass'
          : 'warning',
    description: 'Dynamic HTML must be sanitized to prevent XSS',
    locations: unsafeHtmlLocations,
    asvsRef: 'V5.3.3',
    remediation:
      unsafeHtmlLocations.length > 0 && sanitizeLocations.length === 0
        ? 'Sanitize HTML before using @html/innerHTML (use DOMPurify or similar)'
        : undefined,
  });

  // -------------------------------------------------------------------------
  // V7 Error Handling
  // -------------------------------------------------------------------------

  // V7.1.1 - Production Error Messages
  const envCheckLocations = searchPattern(apiFiles, /NODE_ENV|ENVIRONMENT|production|development/i);
  const stackExposure = searchPattern(apiFiles, /error\.stack|\.stack.*json|json.*stack/i);
  results.push({
    id: 'V7.1.1',
    category: 'V7 Error Handling',
    name: 'Production Error Messages',
    status:
      envCheckLocations.length > 0 && stackExposure.length === 0
        ? 'pass'
        : stackExposure.length > 0
          ? 'warning'
          : 'info',
    description: 'Stack traces must not be exposed in production',
    locations: stackExposure.length > 0 ? stackExposure : envCheckLocations,
    asvsRef: 'V7.1.1',
    remediation:
      stackExposure.length > 0
        ? 'Ensure stack traces are only returned in development environment'
        : undefined,
  });

  // -------------------------------------------------------------------------
  // V8 Data Protection
  // -------------------------------------------------------------------------

  // V8.3.1 - Secrets Management
  const hardcodedSecrets = searchPattern(
    allFiles,
    /password\s*=\s*['"][^'"]{8,}|api[_-]?key\s*=\s*['"][^'"]+|secret\s*=\s*['"][^'"]+/i
  );
  // Filter out common false positives (empty strings, placeholders)
  const realSecrets = hardcodedSecrets.filter(
    (loc) => !loc.snippet.includes('""') && !loc.snippet.includes("''") && !loc.snippet.includes('YOUR_')
  );
  const envUsage = searchPattern(apiFiles, /process\.env\.|platform\.env\.|c\.env\.|Deno\.env/);
  results.push({
    id: 'V8.3.1',
    category: 'V8 Data Protection',
    name: 'Secrets Management',
    status:
      realSecrets.length === 0 && envUsage.length > 0
        ? 'pass'
        : realSecrets.length > 0
          ? 'fail'
          : 'warning',
    description: 'Secrets must not be hardcoded; use environment variables',
    locations: realSecrets.length > 0 ? realSecrets : envUsage.slice(0, 3),
    asvsRef: 'V8.3.1',
    remediation:
      realSecrets.length > 0
        ? 'Move hardcoded secrets to environment variables or secret manager'
        : undefined,
  });

  // -------------------------------------------------------------------------
  // V9 Communication
  // -------------------------------------------------------------------------

  // V9.1.1 - Security Headers
  const headerPatterns = [
    { name: 'X-Frame-Options', pattern: /X-Frame-Options/i },
    { name: 'X-Content-Type-Options', pattern: /X-Content-Type-Options/i },
    { name: 'Content-Security-Policy', pattern: /Content-Security-Policy/i },
  ];
  const foundHeaders = headerPatterns.filter((h) => patternExists(allFiles, h.pattern));
  results.push({
    id: 'V9.1.1',
    category: 'V9 Communication',
    name: 'Security Headers',
    status: foundHeaders.length >= 2 ? 'pass' : 'warning',
    description: `Security headers: ${foundHeaders.map((h) => h.name).join(', ') || 'none found'}`,
    locations: searchPattern(allFiles, /X-Frame-Options|X-Content-Type|Content-Security-Policy/i),
    asvsRef: 'V9.1.1',
    remediation:
      foundHeaders.length < 2
        ? 'Add security headers: X-Frame-Options, X-Content-Type-Options, CSP'
        : undefined,
  });

  // -------------------------------------------------------------------------
  // V10 Malicious Code
  // -------------------------------------------------------------------------

  // V10.3.1 - Dependency Audit
  let auditResult: 'pass' | 'fail' | 'warning' = 'warning';
  let auditInfo = '';
  const auditCmd =
    PROJECT_CONFIG.packageManager === 'pnpm'
      ? 'pnpm audit --audit-level=high'
      : PROJECT_CONFIG.packageManager === 'yarn'
        ? 'yarn audit --level high'
        : PROJECT_CONFIG.packageManager === 'bun'
          ? 'bun audit'
          : 'npm audit --audit-level=high';

  try {
    execSync(`${auditCmd} 2>&1`, { encoding: 'utf-8', cwd: rootDir });
    auditResult = 'pass';
    auditInfo = 'No high/critical vulnerabilities found';
  } catch (e) {
    const output = (e as { stdout?: string }).stdout || '';
    if (output.includes('critical') || output.includes('high')) {
      auditResult = 'fail';
      auditInfo = 'High or critical vulnerabilities found';
    } else {
      auditResult = 'warning';
      auditInfo = 'Some vulnerabilities may exist';
    }
  }
  results.push({
    id: 'V10.3.1',
    category: 'V10 Malicious Code',
    name: 'Dependency Audit',
    status: auditResult,
    description: auditInfo,
    asvsRef: 'V10.3.1',
    remediation:
      auditResult !== 'pass'
        ? `Run "${auditCmd}" and update vulnerable packages`
        : undefined,
  });

  return results;
}

// ============================================================================
// REPORT GENERATION
// ============================================================================

function generateReport(checks: CheckResult[]): Report {
  let version = 'unknown';
  try {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf-8'));
    version = pkg.version || 'unknown';
  } catch {
    // package.json not found
  }

  return {
    timestamp: new Date().toISOString(),
    version,
    summary: {
      total: checks.length,
      passed: checks.filter((c) => c.status === 'pass').length,
      failed: checks.filter((c) => c.status === 'fail').length,
      warnings: checks.filter((c) => c.status === 'warning').length,
    },
    checks,
  };
}

// ============================================================================
// OUTPUT FORMATTERS
// ============================================================================

function printConsole(report: Report): void {
  console.log(`\n${colors.bold}ASVS Compliance Check - ${PROJECT_CONFIG.name}${colors.reset}`);
  console.log(`${colors.dim}Version: ${report.version} | ${report.timestamp}${colors.reset}\n`);

  for (const check of report.checks) {
    const icon =
      check.status === 'pass'
        ? `${colors.green}✓${colors.reset}`
        : check.status === 'fail'
          ? `${colors.red}✗${colors.reset}`
          : check.status === 'warning'
            ? `${colors.yellow}⚠${colors.reset}`
            : `${colors.blue}ℹ${colors.reset}`;

    console.log(`${icon} ${colors.bold}[${check.id}]${colors.reset} ${check.name}`);
    console.log(`  ${colors.dim}${check.description}${colors.reset}`);

    if (check.locations && check.locations.length > 0) {
      for (const loc of check.locations.slice(0, 3)) {
        console.log(`  ${colors.cyan}${loc.file}:${loc.line}${colors.reset}`);
      }
      if (check.locations.length > 3) {
        console.log(`  ${colors.dim}... and ${check.locations.length - 3} more${colors.reset}`);
      }
    }

    if (check.remediation) {
      console.log(`  ${colors.yellow}Fix:${colors.reset} ${check.remediation.split('\n')[0]}`);
    }
    console.log();
  }

  // Summary
  console.log(`${colors.bold}Summary${colors.reset}`);
  console.log(
    `  ${colors.green}Passed: ${report.summary.passed}${colors.reset} | ` +
      `${colors.red}Failed: ${report.summary.failed}${colors.reset} | ` +
      `${colors.yellow}Warnings: ${report.summary.warnings}${colors.reset}`
  );

  const score = Math.round((report.summary.passed / report.summary.total) * 100);
  console.log(`  ${colors.bold}Score: ${score}%${colors.reset}\n`);
}

// ============================================================================
// MAIN
// ============================================================================

function main(): void {
  const args = process.argv.slice(2);
  const formatIdx = args.indexOf('--format');
  const format = formatIdx !== -1 ? args[formatIdx + 1] : 'console';
  const outputIdx = args.indexOf('--output');
  const output = outputIdx !== -1 ? args[outputIdx + 1] : undefined;

  const checks = runChecks(process.cwd());
  const report = generateReport(checks);

  if (format === 'json') {
    const json = JSON.stringify(report, null, 2);
    if (output) {
      writeFileSync(output, json);
      console.log(`Report written to ${output}`);
    } else {
      console.log(json);
    }
  } else {
    printConsole(report);
  }

  // Exit with error code if any checks failed
  if (report.summary.failed > 0) {
    process.exit(1);
  }
}

main();
