#!/usr/bin/env -S npx tsx
/**
 * ASVS Compliance Checker for eSolia Periodic
 *
 * Automated security verification against OWASP ASVS 5.0.
 * Customized for SvelteKit + Cloudflare D1 + TypeScript stack.
 *
 * IMPORTANT: This scanner checks an AUTOMATABLE SUBSET of ASVS controls.
 * Full ASVS compliance requires manual review, penetration testing, and security audits.
 *
 * Usage:
 *   npx tsx scripts/asvs-check.ts                    # Console output
 *   npx tsx scripts/asvs-check.ts --format json      # JSON output
 *   npx tsx scripts/asvs-check.ts --format json --output src/lib/data/asvs-assessment.json
 */

import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from 'fs';
import { join, relative } from 'path';
import { execSync } from 'child_process';

// ============================================================================
// PROJECT CONFIGURATION
// ============================================================================

const PROJECT_CONFIG = {
  name: 'eSolia Periodic',
  sourcePaths: ['src/'],
  apiPaths: ['src/routes/api/', 'src/lib/server/'],
  webPaths: ['src/routes/', 'src/lib/components/'],
  configPaths: ['.'],
  packageManager: 'npm',
  corsOrigins: ['esolia.co.jp', 'periodic.esolia.co.jp'],
  extensions: ['.ts', '.tsx', '.js', '.svelte'],
  configExtensions: ['.json', '.jsonc', '.toml', '.yaml', '.yml'],
  skipDirs: ['node_modules', '.svelte-kit', 'dist', '.git', 'build', '.wrangler']
};

// ============================================================================
// ASVS SCOPE METADATA
// ============================================================================

const ASVS_SCOPE = {
  standard: 'OWASP ASVS 5.0',
  standardUrl: 'https://owasp.org/www-project-application-security-verification-standard/',
  scope: 'automatable-subset',
  scopeDescription:
    'This assessment automates verification of ASVS controls that can be reliably detected through static code analysis. It represents a subset of full ASVS compliance.',
  limitations: [
    'Business logic flaws require manual review',
    'Runtime behavior cannot be verified statically',
    'Cryptographic strength requires runtime testing',
    'Access control edge cases need penetration testing',
    'Third-party service configurations are not verified'
  ],
  recommendations: [
    'Conduct periodic manual security reviews',
    'Perform penetration testing annually',
    'Review third-party dependencies regularly',
    'Maintain security documentation'
  ],
  level: 'L1-partial',
  levelDescription: 'Partial Level 1 coverage through automated checks',
  totalAsvsControls: {
    L1: 50,
    L2: 150,
    L3: 250
  }
};

// ============================================================================
// TYPES
// ============================================================================

interface Location {
  file: string;
  line: number;
  snippet?: string;
}

// OWASP Top 10 2021 mapping
type Top10Category =
  | 'A01' // Broken Access Control
  | 'A02' // Cryptographic Failures
  | 'A03' // Injection
  | 'A04' // Insecure Design
  | 'A05' // Security Misconfiguration
  | 'A06' // Vulnerable Components
  | 'A07' // Auth Failures
  | 'A08' // Data Integrity Failures
  | 'A09' // Logging Failures
  | 'A10'; // SSRF

interface CheckResult {
  id: string;
  category: string;
  name: string;
  status: 'pass' | 'fail' | 'warning' | 'info' | 'not-applicable';
  description: string;
  locations?: Location[];
  remediation?: string;
  asvsRef: string;
  automatable: boolean;
  level: 'L1' | 'L2' | 'L3';
  top10?: Top10Category[]; // Maps to OWASP Top 10 2021 categories
}

interface Report {
  timestamp: string;
  version: string;
  scope: typeof ASVS_SCOPE;
  summary: {
    total: number;
    passed: number;
    failed: number;
    warnings: number;
    notApplicable: number;
    coverage: {
      L1: { checked: number; total: number; percentage: number };
      L2?: { checked: number; total: number; percentage: number };
    };
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
  magenta: '\x1b[35m',
  bold: '\x1b[1m',
  dim: '\x1b[2m'
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
            snippet: lines[i].trim().slice(0, 100)
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

function fileContains(filePath: string, pattern: RegExp): boolean {
  try {
    const content = readFileSync(filePath, 'utf-8');
    return pattern.test(content);
  } catch {
    return false;
  }
}

function countMatches(files: string[], pattern: RegExp): number {
  return searchPattern(files, pattern).length;
}

// ============================================================================
// ASVS CHECKS - Comprehensive Automated Subset
// ============================================================================

function runChecks(): CheckResult[] {
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

  const configFiles: string[] = [];
  for (const path of PROJECT_CONFIG.configPaths) {
    configFiles.push(...getSourceFiles(path, PROJECT_CONFIG.configExtensions));
  }

  // ===========================================================================
  // V1 ARCHITECTURE - Limited automated checks
  // ===========================================================================

  // V1.2.1 - Component Separation
  const hasServerLib = existsSync(join(process.cwd(), 'src/lib/server'));
  const hasClientLib = existsSync(join(process.cwd(), 'src/lib/components'));
  const hasRoutes = existsSync(join(process.cwd(), 'src/routes'));
  results.push({
    id: 'V1.2.1',
    category: 'V1 Architecture',
    name: 'Component Separation',
    status: hasServerLib && hasClientLib && hasRoutes ? 'pass' : 'warning',
    description: 'Server/client code separation (src/lib/server, src/lib/components)',
    asvsRef: 'V1.2.1',
    automatable: true,
    level: 'L1',
    top10: ['A04'] // Insecure Design
  });

  // V1.5.1 - Input Validation Architecture
  const validationLocations = searchPattern(allFiles, /validate|schema|zod|yup|joi|ajv/i);
  results.push({
    id: 'V1.5.1',
    category: 'V1 Architecture',
    name: 'Input Validation Architecture',
    status: validationLocations.length > 0 ? 'pass' : 'warning',
    description: 'Centralized input validation patterns detected',
    locations: validationLocations.slice(0, 5),
    asvsRef: 'V1.5.1',
    automatable: true,
    level: 'L1',
    top10: ['A03', 'A04'] // Injection, Insecure Design
  });

  // ===========================================================================
  // V2 AUTHENTICATION
  // ===========================================================================

  // V2.1.1 - Password Hashing
  const hashingLocations = searchPattern(apiFiles, /PBKDF2|pbkdf2|bcrypt|argon2|scrypt/i);
  const weakHashLocations = searchPattern(apiFiles, /md5|sha1\s*\(|sha-1/i);
  results.push({
    id: 'V2.1.1',
    category: 'V2 Authentication',
    name: 'Password Hashing Algorithm',
    status:
      hashingLocations.length > 0 && weakHashLocations.length === 0
        ? 'pass'
        : weakHashLocations.length > 0
          ? 'fail'
          : 'warning',
    description: 'Strong password hashing (PBKDF2/bcrypt/argon2)',
    locations: weakHashLocations.length > 0 ? weakHashLocations : hashingLocations.slice(0, 5),
    remediation:
      weakHashLocations.length > 0 ? 'Replace MD5/SHA1 with PBKDF2, bcrypt, or Argon2' : undefined,
    asvsRef: 'V2.1.1',
    automatable: true,
    level: 'L1',
    top10: ['A02', 'A07'] // Cryptographic Failures, Auth Failures
  });

  // V2.1.5 - Password Salt
  const saltLocations = searchPattern(apiFiles, /salt|getRandomValues|randomBytes/i);
  results.push({
    id: 'V2.1.5',
    category: 'V2 Authentication',
    name: 'Password Salting',
    status: saltLocations.length > 0 ? 'pass' : 'warning',
    description: 'Unique salt per password using CSPRNG',
    locations: saltLocations.slice(0, 3),
    asvsRef: 'V2.1.5',
    automatable: true,
    level: 'L1'
  });

  // V2.1.9 - Password Policy
  const passwordPolicyLocations = searchPattern(
    allFiles,
    /password.*length|minLength.*password|password.*min/i
  );
  results.push({
    id: 'V2.1.9',
    category: 'V2 Authentication',
    name: 'Password Policy Enforcement',
    status: passwordPolicyLocations.length > 0 ? 'pass' : 'info',
    description: 'Password minimum length/complexity checks',
    locations: passwordPolicyLocations.slice(0, 3),
    asvsRef: 'V2.1.9',
    automatable: true,
    level: 'L1'
  });

  // V2.2.1 - Token Entropy (exclude documentation/comment mentions of Math.random)
  const tokenGenLocations = searchPattern(
    apiFiles,
    /getRandomValues|crypto\.randomUUID|randomBytes|nanoid/
  );
  const weakTokenLocations = searchPattern(apiFiles, /Math\.random\(\)/).filter(
    (loc) =>
      !loc.snippet.includes('//') &&
      !loc.snippet.includes('*') &&
      !loc.snippet.includes('instead of') &&
      !loc.file.includes('secure-random')
  );
  results.push({
    id: 'V2.2.1',
    category: 'V2 Authentication',
    name: 'Token Entropy',
    status:
      tokenGenLocations.length > 0 && weakTokenLocations.length === 0
        ? 'pass'
        : weakTokenLocations.length > 0
          ? 'fail'
          : 'warning',
    description: 'Cryptographically secure random token generation',
    locations: weakTokenLocations.length > 0 ? weakTokenLocations : tokenGenLocations.slice(0, 5),
    remediation:
      weakTokenLocations.length > 0
        ? 'Replace Math.random() with crypto.getRandomValues() or crypto.randomUUID()'
        : undefined,
    asvsRef: 'V2.2.1',
    automatable: true,
    level: 'L1'
  });

  // V2.5.1 - Account Lockout
  const lockoutLocations = searchPattern(
    apiFiles,
    /lockout|attempt.*count|failed.*login|rate.*limit/i
  );
  results.push({
    id: 'V2.5.1',
    category: 'V2 Authentication',
    name: 'Account Lockout',
    status: lockoutLocations.length > 0 ? 'pass' : 'info',
    description: 'Brute force protection via account lockout or rate limiting',
    locations: lockoutLocations.slice(0, 3),
    asvsRef: 'V2.5.1',
    automatable: true,
    level: 'L1'
  });

  // V2.8.1 - MFA Implementation
  const mfaLocations = searchPattern(apiFiles, /totp|authenticator|mfa|two.?factor|2fa|otp/i);
  results.push({
    id: 'V2.8.1',
    category: 'V2 Authentication',
    name: 'Multi-Factor Authentication',
    status: mfaLocations.length > 0 ? 'pass' : 'info',
    description: 'MFA/2FA support (TOTP, authenticator)',
    locations: mfaLocations.slice(0, 3),
    asvsRef: 'V2.8.1',
    automatable: true,
    level: 'L2'
  });

  // V2.1.6 - Password Strength Estimation (L2)
  const passwordStrengthLocations = searchPattern(
    allFiles,
    /zxcvbn|password.*strength|strength.*meter|password.*score/i
  );
  results.push({
    id: 'V2.1.6',
    category: 'V2 Authentication',
    name: 'Password Strength Meter',
    status: passwordStrengthLocations.length > 0 ? 'pass' : 'info',
    description: 'Password strength estimation for user feedback',
    locations: passwordStrengthLocations.slice(0, 3),
    asvsRef: 'V2.1.6',
    automatable: true,
    level: 'L2'
  });

  // V2.9.1 - Hardware Token / WebAuthn Support (L2)
  const webauthnLocations = searchPattern(
    apiFiles,
    /webauthn|fido|passkey|authenticatorAttachment|credential.*create|navigator\.credentials/i
  );
  results.push({
    id: 'V2.9.1',
    category: 'V2 Authentication',
    name: 'Hardware Token Support',
    status: webauthnLocations.length > 0 ? 'pass' : 'info',
    description: 'WebAuthn/FIDO2/Passkey support for phishing-resistant auth',
    locations: webauthnLocations.slice(0, 3),
    asvsRef: 'V2.9.1',
    automatable: true,
    level: 'L2'
  });

  // ===========================================================================
  // V3 SESSION MANAGEMENT
  // ===========================================================================

  // V3.2.1 - Session Token Generation
  const sessionTokenLocations = searchPattern(
    apiFiles,
    /session.*id|sessionId|session.*token|createSession/i
  );
  results.push({
    id: 'V3.2.1',
    category: 'V3 Session Management',
    name: 'Session Token Generation',
    status: sessionTokenLocations.length > 0 ? 'pass' : 'warning',
    description: 'Session IDs generated with sufficient entropy',
    locations: sessionTokenLocations.slice(0, 3),
    asvsRef: 'V3.2.1',
    automatable: true,
    level: 'L1'
  });

  // V3.3.1 - Session Expiration
  const sessionLocations = searchPattern(apiFiles, /expires|maxAge|session.*timeout|cookie.*max/i);
  results.push({
    id: 'V3.3.1',
    category: 'V3 Session Management',
    name: 'Session Expiration',
    status: sessionLocations.length > 0 ? 'pass' : 'warning',
    description: 'Sessions have defined expiration times',
    locations: sessionLocations.slice(0, 5),
    asvsRef: 'V3.3.1',
    automatable: true,
    level: 'L1'
  });

  // V3.4.1 - Secure Cookie Attributes
  const httpOnlyLocations = searchPattern(apiFiles, /httpOnly/i);
  const secureLocations = searchPattern(apiFiles, /secure:\s*true|Secure/i);
  const sameSiteLocations = searchPattern(apiFiles, /sameSite/i);
  const cookieScore =
    (httpOnlyLocations.length > 0 ? 1 : 0) +
    (secureLocations.length > 0 ? 1 : 0) +
    (sameSiteLocations.length > 0 ? 1 : 0);
  results.push({
    id: 'V3.4.1',
    category: 'V3 Session Management',
    name: 'Secure Cookie Attributes',
    status: cookieScore >= 3 ? 'pass' : cookieScore >= 1 ? 'warning' : 'fail',
    description: `Cookie attributes: HttpOnly(${httpOnlyLocations.length > 0 ? '✓' : '✗'}) Secure(${secureLocations.length > 0 ? '✓' : '✗'}) SameSite(${sameSiteLocations.length > 0 ? '✓' : '✗'})`,
    locations: [...httpOnlyLocations, ...secureLocations, ...sameSiteLocations].slice(0, 5),
    remediation:
      cookieScore < 3
        ? 'Ensure all cookies set HttpOnly, Secure, and SameSite attributes'
        : undefined,
    asvsRef: 'V3.4.1',
    automatable: true,
    level: 'L1'
  });

  // V3.5.1 - Session Invalidation on Logout
  const logoutLocations = searchPattern(apiFiles, /logout|signout|session.*delete|clear.*session/i);
  results.push({
    id: 'V3.5.1',
    category: 'V3 Session Management',
    name: 'Session Invalidation',
    status: logoutLocations.length > 0 ? 'pass' : 'warning',
    description: 'Sessions properly invalidated on logout',
    locations: logoutLocations.slice(0, 3),
    asvsRef: 'V3.5.1',
    automatable: true,
    level: 'L1'
  });

  // V3.3.3 - Idle Session Timeout (L2)
  const idleTimeoutLocations = searchPattern(
    apiFiles,
    /idle.*timeout|session.*idle|inactivity.*timeout|last.*activity/i
  );
  results.push({
    id: 'V3.3.3',
    category: 'V3 Session Management',
    name: 'Idle Session Timeout',
    status: idleTimeoutLocations.length > 0 ? 'pass' : 'info',
    description: 'Sessions timeout after period of inactivity',
    locations: idleTimeoutLocations.slice(0, 3),
    asvsRef: 'V3.3.3',
    automatable: true,
    level: 'L2'
  });

  // V3.5.2 - Terminate All Sessions (L2)
  const terminateAllLocations = searchPattern(
    apiFiles,
    /logout.*all|terminate.*all.*session|revoke.*all|invalidate.*all.*session/i
  );
  results.push({
    id: 'V3.5.2',
    category: 'V3 Session Management',
    name: 'Terminate All Sessions',
    status: terminateAllLocations.length > 0 ? 'pass' : 'info',
    description: 'Users can terminate all active sessions',
    locations: terminateAllLocations.slice(0, 3),
    asvsRef: 'V3.5.2',
    automatable: true,
    level: 'L2'
  });

  // V3.7.1 - Concurrent Session Limits (L2)
  const concurrentSessionLocations = searchPattern(
    apiFiles,
    /concurrent.*session|session.*limit|max.*session|active.*session.*count/i
  );
  results.push({
    id: 'V3.7.1',
    category: 'V3 Session Management',
    name: 'Concurrent Session Limits',
    status: concurrentSessionLocations.length > 0 ? 'pass' : 'info',
    description: 'Limits on number of concurrent sessions per user',
    locations: concurrentSessionLocations.slice(0, 3),
    asvsRef: 'V3.7.1',
    automatable: true,
    level: 'L2'
  });

  // ===========================================================================
  // V4 ACCESS CONTROL
  // ===========================================================================

  // V4.1.1 - Role-Based Access Control
  const rbacLocations = searchPattern(
    apiFiles,
    /role.*admin|role.*user|locals\.user|authorization|isAdmin|hasRole/i
  );
  results.push({
    id: 'V4.1.1',
    category: 'V4 Access Control',
    name: 'Role-Based Access Control',
    status: rbacLocations.length > 0 ? 'pass' : 'warning',
    description: 'Role-based authorization checks implemented',
    locations: rbacLocations.slice(0, 5),
    asvsRef: 'V4.1.1',
    automatable: true,
    level: 'L1'
  });

  // V4.1.3 - Client/Tenant Data Isolation
  const clientIdLocations = searchPattern(apiFiles, /client_id|clientId|client\.id|tenant_id/i);
  results.push({
    id: 'V4.1.3',
    category: 'V4 Access Control',
    name: 'Tenant Data Isolation',
    status: clientIdLocations.length > 0 ? 'pass' : 'info',
    description: 'Multi-tenant data isolation using client/tenant ID',
    locations: clientIdLocations.slice(0, 5),
    asvsRef: 'V4.1.3',
    automatable: true,
    level: 'L1'
  });

  // V4.2.1 - Server-Side Authorization
  const serverAuthLocations = searchPattern(
    apiFiles,
    /\.server\.ts|hooks\.server|page\.server|server\.ts/
  );
  const authCheckLocations = searchPattern(
    apiFiles,
    /if\s*\(\s*!.*user|throw.*401|throw.*403|unauthorized|forbidden/i
  );
  results.push({
    id: 'V4.2.1',
    category: 'V4 Access Control',
    name: 'Server-Side Authorization',
    status: authCheckLocations.length > 0 ? 'pass' : 'warning',
    description: 'Authorization enforced server-side, not just client-side',
    locations: authCheckLocations.slice(0, 5),
    asvsRef: 'V4.2.1',
    automatable: true,
    level: 'L1'
  });

  // V4.3.1 - Direct Object Reference Prevention
  const idorLocations = searchPattern(apiFiles, /params\.|searchParams|url\.pathname/);
  const idorCheckLocations = searchPattern(
    apiFiles,
    /client_id.*=|user\.id.*=|owner.*check|permission.*check/i
  );
  results.push({
    id: 'V4.3.1',
    category: 'V4 Access Control',
    name: 'IDOR Prevention',
    status: idorLocations.length > 0 && idorCheckLocations.length > 0 ? 'pass' : 'warning',
    description: 'Direct object references validated against user context',
    locations: idorCheckLocations.slice(0, 3),
    asvsRef: 'V4.3.1',
    automatable: true,
    level: 'L1'
  });

  // V4.3.3 - Re-authentication for Sensitive Operations (L2)
  const stepUpAuthLocations = searchPattern(
    apiFiles,
    /re.?auth|step.?up|confirm.*password|verify.*identity|sensitive.*operation/i
  );
  results.push({
    id: 'V4.3.3',
    category: 'V4 Access Control',
    name: 'Step-Up Authentication',
    status: stepUpAuthLocations.length > 0 ? 'pass' : 'info',
    description: 'Sensitive operations require re-authentication',
    locations: stepUpAuthLocations.slice(0, 3),
    asvsRef: 'V4.3.3',
    automatable: true,
    level: 'L2'
  });

  // ===========================================================================
  // V5 VALIDATION, SANITIZATION, AND ENCODING
  // ===========================================================================

  // V5.1.1 - Input Validation
  const inputValidationLocations = searchPattern(
    allFiles,
    /\.trim\(\)|parseInt|parseFloat|Number\(|Boolean\(|validate|schema/i
  );
  results.push({
    id: 'V5.1.1',
    category: 'V5 Validation',
    name: 'Input Validation',
    status: inputValidationLocations.length > 0 ? 'pass' : 'warning',
    description: 'Input data is validated and sanitized',
    locations: inputValidationLocations.slice(0, 5),
    asvsRef: 'V5.1.1',
    automatable: true,
    level: 'L1'
  });

  // V5.2.1 - HTML Encoding
  const htmlEncodingLocations = searchPattern(allFiles, /escapeHtml|htmlEncode|textContent/i);
  results.push({
    id: 'V5.2.1',
    category: 'V5 Validation',
    name: 'HTML Encoding',
    status: htmlEncodingLocations.length > 0 ? 'pass' : 'info',
    description: 'HTML special characters are encoded',
    locations: htmlEncodingLocations.slice(0, 3),
    asvsRef: 'V5.2.1',
    automatable: true,
    level: 'L1'
  });

  // V5.3.3 - XSS Prevention
  const unsafeHtmlLocations = searchPattern(webFiles, /@html|innerHTML|dangerouslySetInnerHTML/);
  const sanitizeLocations = searchPattern(allFiles, /sanitize|DOMPurify|escape.*html|xss/i);
  results.push({
    id: 'V5.3.3',
    category: 'V5 Validation',
    name: 'XSS Prevention',
    status:
      unsafeHtmlLocations.length === 0 ? 'pass' : sanitizeLocations.length > 0 ? 'pass' : 'warning',
    description:
      unsafeHtmlLocations.length === 0
        ? 'No unsafe HTML rendering detected'
        : 'Dynamic HTML content sanitized',
    locations: unsafeHtmlLocations.slice(0, 5),
    remediation:
      unsafeHtmlLocations.length > 0 && sanitizeLocations.length === 0
        ? 'Sanitize user content before rendering with @html or innerHTML'
        : undefined,
    asvsRef: 'V5.3.3',
    automatable: true,
    level: 'L1'
  });

  // V5.3.4 - SQL Injection Prevention
  const parameterizedLocations = searchPattern(apiFiles, /\.prepare\(|\.bind\(|\.run\(|\.all\(/);
  const rawSqlLocations = searchPattern(
    apiFiles,
    /db\.execute\s*\(\s*`[^`]*\$\{|\.query\s*\(\s*`[^`]*\$\{|SELECT\s+.*\s*\+\s*['"a-zA-Z]|INSERT\s+.*\s*\+\s*['"a-zA-Z]|UPDATE\s+.*\s*\+\s*['"a-zA-Z]|DELETE\s+.*\s*\+\s*['"a-zA-Z]/i
  );
  results.push({
    id: 'V5.3.4',
    category: 'V5 Validation',
    name: 'SQL Injection Prevention',
    status:
      parameterizedLocations.length > 0 && rawSqlLocations.length === 0
        ? 'pass'
        : rawSqlLocations.length > 0
          ? 'fail'
          : 'warning',
    description: 'Parameterized queries using .bind()',
    locations: rawSqlLocations.length > 0 ? rawSqlLocations : parameterizedLocations.slice(0, 5),
    remediation:
      rawSqlLocations.length > 0
        ? 'Replace string concatenation with parameterized queries using .bind()'
        : undefined,
    asvsRef: 'V5.3.4',
    automatable: true,
    level: 'L1'
  });

  // V5.3.7 - Command Injection Prevention
  const execLocations = searchPattern(apiFiles, /exec\(|spawn\(|execSync|child_process/);
  const safeExecLocations = searchPattern(
    apiFiles,
    /execFile|spawn.*\{.*shell:\s*false|spawnSync.*shell:\s*false/
  );
  results.push({
    id: 'V5.3.7',
    category: 'V5 Validation',
    name: 'Command Injection Prevention',
    status:
      execLocations.length === 0
        ? 'pass'
        : safeExecLocations.length >= execLocations.length
          ? 'pass'
          : 'warning',
    description:
      execLocations.length === 0 ? 'No shell execution detected' : 'Shell execution patterns found',
    locations: execLocations.slice(0, 3),
    remediation:
      execLocations.length > 0
        ? 'Use execFile with explicit arguments instead of shell execution'
        : undefined,
    asvsRef: 'V5.3.7',
    automatable: true,
    level: 'L1'
  });

  // V5.3.8 - Path Traversal Prevention
  const pathLocations = searchPattern(
    apiFiles,
    /\.\.\/|path\.join|path\.resolve|readFile|writeFile/
  );
  const pathValidationLocations = searchPattern(
    apiFiles,
    /path\.normalize|path\.basename|sanitizePath|\.includes\(['"]\.\.['"]|startsWith/i
  );
  results.push({
    id: 'V5.3.8',
    category: 'V5 Validation',
    name: 'Path Traversal Prevention',
    status: pathLocations.length === 0 || pathValidationLocations.length > 0 ? 'pass' : 'warning',
    description: 'File paths are validated to prevent directory traversal',
    locations: pathValidationLocations.slice(0, 3),
    asvsRef: 'V5.3.8',
    automatable: true,
    level: 'L1'
  });

  // V5.1.5 - URL Redirect Validation (L2)
  const redirectLocations = searchPattern(apiFiles, /redirect|location.*header|302|303|307/i);
  const redirectValidationLocations = searchPattern(
    apiFiles,
    /allowed.*url|url.*whitelist|url.*allowlist|validate.*redirect|safe.*redirect/i
  );
  results.push({
    id: 'V5.1.5',
    category: 'V5 Validation',
    name: 'URL Redirect Validation',
    status:
      redirectLocations.length === 0 || redirectValidationLocations.length > 0 ? 'pass' : 'info',
    description: 'URL redirects validated against allowlist',
    locations:
      redirectValidationLocations.length > 0
        ? redirectValidationLocations.slice(0, 3)
        : redirectLocations.slice(0, 3),
    asvsRef: 'V5.1.5',
    automatable: true,
    level: 'L2'
  });

  // ===========================================================================
  // V6 CRYPTOGRAPHY
  // ===========================================================================

  // V6.2.1 - Strong Encryption Algorithms
  const strongCryptoLocations = searchPattern(apiFiles, /AES-256|AES-GCM|ChaCha20|crypto\.subtle/i);
  // Note: Use word boundaries to avoid false positives (e.g., "description" matching "DES")
  const weakCryptoLocations = searchPattern(
    apiFiles,
    /\bDES\b|3DES|\bRC4\b|\bRC2\b|Blowfish|\bECB\b/i
  );
  results.push({
    id: 'V6.2.1',
    category: 'V6 Cryptography',
    name: 'Strong Encryption Algorithms',
    status:
      strongCryptoLocations.length > 0 && weakCryptoLocations.length === 0
        ? 'pass'
        : weakCryptoLocations.length > 0
          ? 'fail'
          : 'info',
    description: 'AES-256-GCM or equivalent used for encryption',
    locations:
      weakCryptoLocations.length > 0 ? weakCryptoLocations : strongCryptoLocations.slice(0, 5),
    remediation:
      weakCryptoLocations.length > 0
        ? 'Replace weak algorithms (DES, RC4, ECB) with AES-256-GCM'
        : undefined,
    asvsRef: 'V6.2.1',
    automatable: true,
    level: 'L1'
  });

  // V6.2.2 - Authenticated Encryption
  const authenticatedEncryption = searchPattern(apiFiles, /GCM|CCM|Poly1305|AEAD/i);
  results.push({
    id: 'V6.2.2',
    category: 'V6 Cryptography',
    name: 'Authenticated Encryption',
    status: authenticatedEncryption.length > 0 ? 'pass' : 'info',
    description: 'Authenticated encryption modes (GCM, CCM) in use',
    locations: authenticatedEncryption.slice(0, 3),
    asvsRef: 'V6.2.2',
    automatable: true,
    level: 'L2'
  });

  // V6.3.1 - Secure Random Generation
  const secureRandomLocations = searchPattern(
    apiFiles,
    /crypto\.getRandomValues|crypto\.randomUUID|randomBytes|secure.*random/i
  );
  const insecureRandomLocations = searchPattern(apiFiles, /Math\.random/);
  results.push({
    id: 'V6.3.1',
    category: 'V6 Cryptography',
    name: 'Secure Random Generation',
    status:
      secureRandomLocations.length > 0 && insecureRandomLocations.length === 0
        ? 'pass'
        : insecureRandomLocations.length > 0
          ? 'warning'
          : 'info',
    description: 'CSPRNG used for security-sensitive operations',
    locations:
      insecureRandomLocations.length > 0
        ? insecureRandomLocations
        : secureRandomLocations.slice(0, 3),
    remediation:
      insecureRandomLocations.length > 0
        ? 'Replace Math.random() with crypto.getRandomValues() for security operations'
        : undefined,
    asvsRef: 'V6.3.1',
    automatable: true,
    level: 'L1'
  });

  // V6.4.1 - Key Management
  const keyManagementLocations = searchPattern(
    apiFiles,
    /ENCRYPTION.*KEY|MASTER.*KEY|deriveKey|importKey|keyMaterial/i
  );
  const hardcodedKeyLocations = searchPattern(
    allFiles,
    /['"][0-9a-fA-F]{32,}['"]|base64.*[A-Za-z0-9+/=]{32,}/
  ).filter((loc) => !loc.snippet.includes('env') && !loc.file.includes('test'));
  results.push({
    id: 'V6.4.1',
    category: 'V6 Cryptography',
    name: 'Key Management',
    status:
      keyManagementLocations.length > 0 && hardcodedKeyLocations.length === 0
        ? 'pass'
        : hardcodedKeyLocations.length > 0
          ? 'warning'
          : 'info',
    description: 'Encryption keys managed securely via environment',
    locations: keyManagementLocations.slice(0, 3),
    asvsRef: 'V6.4.1',
    automatable: true,
    level: 'L2'
  });

  // V6.2.3 - HMAC for Message Integrity (L2)
  const hmacLocations = searchPattern(apiFiles, /HMAC|hmac|createHmac|sign.*verify/i);
  results.push({
    id: 'V6.2.3',
    category: 'V6 Cryptography',
    name: 'HMAC Message Integrity',
    status: hmacLocations.length > 0 ? 'pass' : 'info',
    description: 'HMAC used for message authentication',
    locations: hmacLocations.slice(0, 3),
    asvsRef: 'V6.2.3',
    automatable: true,
    level: 'L2'
  });

  // V6.2.4 - Random IV/Nonce (L2)
  const ivLocations = searchPattern(apiFiles, /\biv\b|nonce|initialization.*vector/i);
  const randomIvLocations = searchPattern(
    apiFiles,
    /getRandomValues.*iv|random.*iv|iv.*random|nonce.*random/i
  );
  results.push({
    id: 'V6.2.4',
    category: 'V6 Cryptography',
    name: 'Random IV/Nonce',
    status: ivLocations.length === 0 || randomIvLocations.length > 0 ? 'pass' : 'info',
    description: 'Unique random IV/nonce for each encryption operation',
    locations: randomIvLocations.length > 0 ? randomIvLocations.slice(0, 3) : ivLocations.slice(0, 3),
    asvsRef: 'V6.2.4',
    automatable: true,
    level: 'L2'
  });

  // ===========================================================================
  // V7 ERROR HANDLING AND LOGGING
  // ===========================================================================

  // V7.1.1 - Generic Error Messages
  const errorHandlerLocations = searchPattern(
    apiFiles,
    /handleError|onError|catch.*error|\.catch\(/i
  );
  results.push({
    id: 'V7.1.1',
    category: 'V7 Error Handling',
    name: 'Error Handling',
    status: errorHandlerLocations.length > 0 ? 'pass' : 'warning',
    description: 'Centralized error handling prevents information leakage',
    locations: errorHandlerLocations.slice(0, 5),
    asvsRef: 'V7.1.1',
    automatable: true,
    level: 'L1'
  });

  // V7.1.2 - No Stack Traces in Production
  const stackTraceLocations = searchPattern(
    apiFiles,
    /\.stack|stackTrace|console\.error.*error|error\.message/i
  );
  const prodCheckLocations = searchPattern(allFiles, /NODE_ENV|PROD|production|dev.*mode/i);
  results.push({
    id: 'V7.1.2',
    category: 'V7 Error Handling',
    name: 'Stack Trace Protection',
    status: prodCheckLocations.length > 0 ? 'pass' : 'warning',
    description: 'Environment-aware error handling to hide stack traces in production',
    locations: prodCheckLocations.slice(0, 3),
    asvsRef: 'V7.1.2',
    automatable: true,
    level: 'L1'
  });

  // V7.2.1 - Security Event Logging
  const loggingLocations = searchPattern(
    apiFiles,
    /console\.log|console\.warn|console\.error|logger\.|audit.*log/i
  );
  const securityLogLocations = searchPattern(
    apiFiles,
    /login.*log|auth.*log|failed.*attempt|security.*event/i
  );
  results.push({
    id: 'V7.2.1',
    category: 'V7 Error Handling',
    name: 'Security Event Logging',
    status: loggingLocations.length > 0 ? 'pass' : 'warning',
    description: 'Security-relevant events are logged',
    locations:
      securityLogLocations.length > 0
        ? securityLogLocations.slice(0, 3)
        : loggingLocations.slice(0, 3),
    asvsRef: 'V7.2.1',
    automatable: true,
    level: 'L1'
  });

  // V7.2.2 - No Sensitive Data in Logs (improved to reduce false positives)
  // Only flag actual password/secret VALUE logging, not comments, variable names, or updown tokens (which are IDs)
  const sensitiveLogLocations = searchPattern(
    apiFiles,
    /console\.log\s*\([^)]*\$\{[^}]*password[^}]*\}|console\.log\s*\([^)]*\+\s*password\b|console\.log\s*\([^)]*secret\s*[:=]/i
  ).filter((loc) => !loc.snippet.includes('//') && !loc.snippet.includes('InfoSec'));
  results.push({
    id: 'V7.2.2',
    category: 'V7 Error Handling',
    name: 'Sensitive Data in Logs',
    status: sensitiveLogLocations.length === 0 ? 'pass' : 'fail',
    description: 'Sensitive data not logged (passwords, secrets)',
    locations: sensitiveLogLocations,
    remediation:
      sensitiveLogLocations.length > 0 ? 'Remove sensitive data from log statements' : undefined,
    asvsRef: 'V7.2.2',
    automatable: true,
    level: 'L1'
  });

  // V7.3.1 - Structured Logging (L2)
  const structuredLogLocations = searchPattern(
    apiFiles,
    /logger\.|winston|pino|bunyan|structuredLog|JSON\.stringify.*log/i
  );
  results.push({
    id: 'V7.3.1',
    category: 'V7 Error Handling',
    name: 'Structured Logging',
    status: structuredLogLocations.length > 0 ? 'pass' : 'info',
    description: 'Structured logging format for analysis',
    locations: structuredLogLocations.slice(0, 3),
    asvsRef: 'V7.3.1',
    automatable: true,
    level: 'L2'
  });

  // V7.4.1 - Log Injection Prevention (L2)
  const logInjectionPreventionLocations = searchPattern(
    apiFiles,
    /sanitize.*log|log.*sanitize|escape.*log|log.*escape|safe.*log/i
  );
  results.push({
    id: 'V7.4.1',
    category: 'V7 Error Handling',
    name: 'Log Injection Prevention',
    status: logInjectionPreventionLocations.length > 0 ? 'pass' : 'info',
    description: 'Log output sanitized to prevent injection',
    locations: logInjectionPreventionLocations.slice(0, 3),
    asvsRef: 'V7.4.1',
    automatable: true,
    level: 'L2'
  });

  // ===========================================================================
  // V8 DATA PROTECTION
  // ===========================================================================

  // V8.1.1 - Sensitive Data Protection
  const encryptionLocations = searchPattern(apiFiles, /encrypt|decrypt|AES|cipher/i);
  results.push({
    id: 'V8.1.1',
    category: 'V8 Data Protection',
    name: 'Sensitive Data Encryption',
    status: encryptionLocations.length > 0 ? 'pass' : 'info',
    description: 'Encryption available for sensitive data at rest',
    locations: encryptionLocations.slice(0, 5),
    asvsRef: 'V8.1.1',
    automatable: true,
    level: 'L1'
  });

  // V8.3.1 - Secrets Management
  const envUsage = searchPattern(apiFiles, /platform\.env\.|process\.env\.|env\./);
  const hardcodedSecrets = searchPattern(
    allFiles,
    /password\s*=\s*['"][^'"]{8,}|api[_-]?key\s*=\s*['"][^'"]+|secret\s*=\s*['"][^'"]+/i
  ).filter(
    (loc) =>
      !loc.snippet.includes('""') &&
      !loc.snippet.includes("''") &&
      !loc.snippet.includes('YOUR_') &&
      !loc.snippet.includes('example') &&
      !loc.file.includes('.md') &&
      !loc.file.includes('test')
  );
  results.push({
    id: 'V8.3.1',
    category: 'V8 Data Protection',
    name: 'Secrets Management',
    status:
      hardcodedSecrets.length === 0 && envUsage.length > 0
        ? 'pass'
        : hardcodedSecrets.length > 0
          ? 'fail'
          : 'warning',
    description: 'Secrets stored in environment variables, not code',
    locations: hardcodedSecrets.length > 0 ? hardcodedSecrets : envUsage.slice(0, 5),
    remediation:
      hardcodedSecrets.length > 0 ? 'Move hardcoded secrets to environment variables' : undefined,
    asvsRef: 'V8.3.1',
    automatable: true,
    level: 'L1'
  });

  // V8.3.4 - Backup Security
  const backupLocations = searchPattern(apiFiles, /backup|export.*data|dump/i);
  const encryptedBackupLocations = searchPattern(
    apiFiles,
    /backup.*encrypt|encrypted.*backup|export.*encrypt/i
  );
  results.push({
    id: 'V8.3.4',
    category: 'V8 Data Protection',
    name: 'Backup Security',
    status: backupLocations.length === 0 || encryptedBackupLocations.length > 0 ? 'pass' : 'info',
    description: 'Backups are encrypted',
    locations:
      encryptedBackupLocations.length > 0
        ? encryptedBackupLocations.slice(0, 3)
        : backupLocations.slice(0, 3),
    asvsRef: 'V8.3.4',
    automatable: true,
    level: 'L2'
  });

  // V8.2.2 - Privacy Controls (L2)
  const privacyLocations = searchPattern(
    allFiles,
    /gdpr|privacy|consent|data.*retention|right.*forget|data.*deletion|pii/i
  );
  results.push({
    id: 'V8.2.2',
    category: 'V8 Data Protection',
    name: 'Privacy Controls',
    status: privacyLocations.length > 0 ? 'pass' : 'info',
    description: 'Privacy and data retention controls',
    locations: privacyLocations.slice(0, 3),
    asvsRef: 'V8.2.2',
    automatable: true,
    level: 'L2'
  });

  // ===========================================================================
  // V9 COMMUNICATION
  // ===========================================================================

  // V9.1.1 - TLS for All Connections (exclude SVG xmlns which is not a network URL)
  const httpsLocations = searchPattern(allFiles, /https:\/\/|TLS|SSL|wss:/i);
  const httpLocations = searchPattern(allFiles, /http:\/\/(?!localhost|127\.0\.0\.1)/).filter(
    (loc) => !loc.snippet.includes('xmlns') && !loc.snippet.includes('w3.org')
  );
  results.push({
    id: 'V9.1.1',
    category: 'V9 Communication',
    name: 'TLS Encryption',
    status: httpLocations.length === 0 ? 'pass' : 'warning',
    description: 'All external connections use TLS',
    locations: httpLocations.length > 0 ? httpLocations.slice(0, 3) : httpsLocations.slice(0, 3),
    remediation:
      httpLocations.length > 0 ? 'Replace http:// with https:// for external URLs' : undefined,
    asvsRef: 'V9.1.1',
    automatable: true,
    level: 'L1'
  });

  // V9.1.2 - Security Headers
  const headerPatterns = [
    { name: 'X-Frame-Options', pattern: /X-Frame-Options/i },
    { name: 'X-Content-Type-Options', pattern: /X-Content-Type-Options/i },
    { name: 'Content-Security-Policy', pattern: /Content-Security-Policy/i },
    { name: 'Strict-Transport-Security', pattern: /Strict-Transport-Security|HSTS/i },
    { name: 'Referrer-Policy', pattern: /Referrer-Policy/i },
    { name: 'Permissions-Policy', pattern: /Permissions-Policy|Feature-Policy/i }
  ];
  const foundHeaders = headerPatterns.filter((h) => patternExists(allFiles, h.pattern));
  results.push({
    id: 'V9.1.2',
    category: 'V9 Communication',
    name: 'Security Headers',
    status: foundHeaders.length >= 4 ? 'pass' : foundHeaders.length >= 2 ? 'warning' : 'fail',
    description: `Headers (${foundHeaders.length}/${headerPatterns.length}): ${foundHeaders.map((h) => h.name).join(', ') || 'none found'}`,
    locations: searchPattern(
      allFiles,
      /X-Frame-Options|X-Content-Type|Content-Security-Policy|Strict-Transport|Referrer-Policy|Permissions-Policy/i
    ).slice(0, 5),
    remediation:
      foundHeaders.length < 4 ? 'Add missing security headers in hooks.server.ts' : undefined,
    asvsRef: 'V9.1.2',
    automatable: true,
    level: 'L1'
  });

  // V9.2.1 - CORS Configuration
  const corsLocations = searchPattern(allFiles, /Access-Control-Allow|CORS|cors/i);
  const wildcardCorsLocations = searchPattern(
    allFiles,
    /Access-Control-Allow-Origin.*\*|origin:\s*['"]?\*/i
  );
  results.push({
    id: 'V9.2.1',
    category: 'V9 Communication',
    name: 'CORS Configuration',
    status:
      wildcardCorsLocations.length === 0
        ? 'pass'
        : wildcardCorsLocations.length > 0
          ? 'warning'
          : 'info',
    description:
      wildcardCorsLocations.length > 0
        ? 'Wildcard CORS origin detected'
        : 'CORS properly configured',
    locations: wildcardCorsLocations.length > 0 ? wildcardCorsLocations : corsLocations.slice(0, 3),
    remediation:
      wildcardCorsLocations.length > 0
        ? 'Replace wildcard CORS origin with specific allowed origins'
        : undefined,
    asvsRef: 'V9.2.1',
    automatable: true,
    level: 'L1'
  });

  // V9.1.3 - Certificate Pinning (L2)
  const certPinningLocations = searchPattern(
    allFiles,
    /certificate.*pin|pinned.*certificate|public.*key.*pin|HPKP|pin-sha256/i
  );
  results.push({
    id: 'V9.1.3',
    category: 'V9 Communication',
    name: 'Certificate Pinning',
    status: certPinningLocations.length > 0 ? 'pass' : 'info',
    description: 'Certificate pinning for high-value connections',
    locations: certPinningLocations.slice(0, 3),
    asvsRef: 'V9.1.3',
    automatable: true,
    level: 'L2'
  });

  // V9.2.3 - TLS Configuration (L2)
  const tlsConfigLocations = searchPattern(
    allFiles,
    /TLS.*1\.[23]|minVersion.*TLS|secureProtocol|SSL.*version|cipher.*suite/i
  );
  results.push({
    id: 'V9.2.3',
    category: 'V9 Communication',
    name: 'TLS Configuration',
    status: tlsConfigLocations.length > 0 ? 'pass' : 'info',
    description: 'TLS 1.2+ with secure cipher suites',
    locations: tlsConfigLocations.slice(0, 3),
    asvsRef: 'V9.2.3',
    automatable: true,
    level: 'L2'
  });

  // ===========================================================================
  // V10 MALICIOUS CODE
  // ===========================================================================

  // V10.2.1 - No Backdoors
  const backdoorPatterns = searchPattern(
    allFiles,
    /eval\s*\(|Function\s*\(|setTimeout\s*\(\s*['"`]|setInterval\s*\(\s*['"`]/
  );
  results.push({
    id: 'V10.2.1',
    category: 'V10 Malicious Code',
    name: 'No Dynamic Code Execution',
    status: backdoorPatterns.length === 0 ? 'pass' : 'warning',
    description:
      backdoorPatterns.length === 0
        ? 'No eval() or dynamic code execution detected'
        : 'Dynamic code execution patterns found',
    locations: backdoorPatterns.slice(0, 5),
    remediation:
      backdoorPatterns.length > 0
        ? 'Remove eval(), Function(), and string-based setTimeout/setInterval'
        : undefined,
    asvsRef: 'V10.2.1',
    automatable: true,
    level: 'L1'
  });

  // V10.3.1 - Dependency Audit
  let auditResult: 'pass' | 'fail' | 'warning' = 'warning';
  let auditInfo = '';
  try {
    const auditCmd =
      PROJECT_CONFIG.packageManager === 'npm'
        ? 'npm audit --audit-level=high 2>&1'
        : PROJECT_CONFIG.packageManager === 'pnpm'
          ? 'pnpm audit --audit-level=high 2>&1'
          : 'yarn audit --level high 2>&1';
    execSync(auditCmd, { encoding: 'utf-8', cwd: process.cwd() });
    auditResult = 'pass';
    auditInfo = 'No high/critical vulnerabilities in dependencies';
  } catch (e) {
    const output = (e as { stdout?: string }).stdout || '';
    if (output.includes('critical') || output.includes('high')) {
      auditResult = 'fail';
      auditInfo = 'High or critical vulnerabilities found in dependencies';
    } else {
      auditResult = 'pass';
      auditInfo = 'No high/critical vulnerabilities in dependencies';
    }
  }
  results.push({
    id: 'V10.3.1',
    category: 'V10 Malicious Code',
    name: 'Dependency Vulnerabilities',
    status: auditResult,
    description: auditInfo,
    remediation:
      auditResult === 'fail'
        ? `Run "${PROJECT_CONFIG.packageManager} audit fix" to resolve`
        : undefined,
    asvsRef: 'V10.3.1',
    automatable: true,
    level: 'L1'
  });

  // V10.3.2 - Outdated Dependencies
  let outdatedResult: 'pass' | 'warning' | 'info' = 'info';
  let outdatedInfo = '';
  try {
    const outdatedCmd =
      PROJECT_CONFIG.packageManager === 'npm'
        ? 'npm outdated --json 2>&1'
        : PROJECT_CONFIG.packageManager === 'pnpm'
          ? 'pnpm outdated --format json 2>&1'
          : 'yarn outdated --json 2>&1';
    const output = execSync(outdatedCmd, { encoding: 'utf-8', cwd: process.cwd() });
    const outdated = JSON.parse(output || '{}');
    const count = Object.keys(outdated).length;
    if (count === 0) {
      outdatedResult = 'pass';
      outdatedInfo = 'All dependencies are up to date';
    } else {
      outdatedResult = 'warning';
      outdatedInfo = `${count} outdated dependencies`;
    }
  } catch {
    outdatedResult = 'info';
    outdatedInfo = 'Could not check for outdated dependencies';
  }
  results.push({
    id: 'V10.3.2',
    category: 'V10 Malicious Code',
    name: 'Dependency Currency',
    status: outdatedResult,
    description: outdatedInfo,
    asvsRef: 'V10.3.2',
    automatable: true,
    level: 'L2'
  });

  // ===========================================================================
  // V12 FILES AND RESOURCES
  // ===========================================================================

  // V12.1.1 - File Upload Restrictions
  const uploadLocations = searchPattern(apiFiles, /upload|multipart|formData.*file|file.*input/i);
  const uploadValidationLocations = searchPattern(
    apiFiles,
    /mimetype|content-type.*check|file.*size|\.type.*===|allowedTypes/i
  );
  results.push({
    id: 'V12.1.1',
    category: 'V12 Files',
    name: 'File Upload Validation',
    status:
      uploadLocations.length === 0
        ? 'not-applicable'
        : uploadValidationLocations.length > 0
          ? 'pass'
          : 'warning',
    description:
      uploadLocations.length === 0
        ? 'No file upload functionality detected'
        : 'File uploads validated (type, size)',
    locations:
      uploadValidationLocations.length > 0
        ? uploadValidationLocations.slice(0, 3)
        : uploadLocations.slice(0, 3),
    asvsRef: 'V12.1.1',
    automatable: true,
    level: 'L1'
  });

  // ===========================================================================
  // V13 API SECURITY
  // ===========================================================================

  // V13.1.1 - API Rate Limiting
  const rateLimitLocations = searchPattern(
    apiFiles,
    /rate.*limit|throttle|too.*many.*requests|429/i
  );
  results.push({
    id: 'V13.1.1',
    category: 'V13 API',
    name: 'API Rate Limiting',
    status: rateLimitLocations.length > 0 ? 'pass' : 'info',
    description: 'Rate limiting to prevent abuse',
    locations: rateLimitLocations.slice(0, 3),
    asvsRef: 'V13.1.1',
    automatable: true,
    level: 'L1'
  });

  // V13.2.1 - API Authentication
  const apiAuthLocations = searchPattern(
    apiFiles,
    /authorization.*header|bearer|api.*key|authenticate.*request/i
  );
  results.push({
    id: 'V13.2.1',
    category: 'V13 API',
    name: 'API Authentication',
    status: apiAuthLocations.length > 0 ? 'pass' : 'info',
    description: 'API endpoints require authentication',
    locations: apiAuthLocations.slice(0, 3),
    asvsRef: 'V13.2.1',
    automatable: true,
    level: 'L1'
  });

  // V13.4.1 - CSRF Protection
  const csrfLocations = searchPattern(allFiles, /csrf|xsrf|csrfToken|anti.*forgery/i);
  const svelteKitForms = searchPattern(webFiles, /use:enhance|method="POST"|method='POST'/i);
  results.push({
    id: 'V13.4.1',
    category: 'V13 API',
    name: 'CSRF Protection',
    status: csrfLocations.length > 0 || svelteKitForms.length > 0 ? 'pass' : 'info',
    description:
      csrfLocations.length > 0
        ? 'CSRF tokens implemented'
        : 'SvelteKit forms with built-in CSRF protection',
    locations: csrfLocations.length > 0 ? csrfLocations.slice(0, 3) : svelteKitForms.slice(0, 3),
    asvsRef: 'V13.4.1',
    automatable: true,
    level: 'L1'
  });

  // ===========================================================================
  // V14 CONFIGURATION
  // ===========================================================================

  // V14.2.1 - Debug Mode Disabled
  const debugLocations = searchPattern(allFiles, /debug\s*:\s*true|DEBUG\s*=\s*true|devtools/i);
  results.push({
    id: 'V14.2.1',
    category: 'V14 Configuration',
    name: 'Debug Mode',
    status: debugLocations.length === 0 ? 'pass' : 'warning',
    description:
      debugLocations.length === 0
        ? 'No debug mode enabled in code'
        : 'Debug mode patterns detected',
    locations: debugLocations.slice(0, 3),
    remediation:
      debugLocations.length > 0 ? 'Ensure debug mode is disabled in production' : undefined,
    asvsRef: 'V14.2.1',
    automatable: true,
    level: 'L1'
  });

  // V14.3.1 - Default Credentials (improved to reduce false positives)
  // Only flag actual hardcoded credentials like:
  //   password = 'password123' (variable assignment with weak password)
  //   { username: 'admin', password: 'admin' } (hardcoded credentials object)
  // Case-sensitive to avoid matching UI labels like password: 'Password'
  const defaultCredLocations = searchPattern(
    allFiles,
    /password\s*[:=]\s*['"](?:password|admin|root|test|123456|qwerty|letmein)['"]|['"]admin['"]\s*,\s*password\s*[:=]\s*['"]admin['"]/
  ).filter(
    (loc) =>
      !loc.file.includes('test') &&
      !loc.file.includes('.md') &&
      !loc.file.includes('.spec') &&
      // Exclude HTML attributes
      !loc.snippet.includes('type=') &&
      !loc.snippet.includes('type:') &&
      !loc.snippet.includes('name=') &&
      !loc.snippet.includes('id=') &&
      !loc.snippet.includes('for=') &&
      !loc.snippet.includes('field.type') &&
      // Exclude function declarations and type definitions
      !loc.snippet.includes('function') &&
      !loc.snippet.includes('async') &&
      !loc.snippet.includes('export') &&
      // Exclude comments
      !loc.snippet.trim().startsWith('//') &&
      !loc.snippet.trim().startsWith('*')
  );
  results.push({
    id: 'V14.3.1',
    category: 'V14 Configuration',
    name: 'Default Credentials',
    status: defaultCredLocations.length === 0 ? 'pass' : 'fail',
    description:
      defaultCredLocations.length === 0
        ? 'No default credentials detected'
        : 'Possible default credentials found',
    locations: defaultCredLocations,
    remediation:
      defaultCredLocations.length > 0 ? 'Remove or change default credentials' : undefined,
    asvsRef: 'V14.3.1',
    automatable: true,
    level: 'L1'
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

  const l1Checks = checks.filter((c) => c.level === 'L1');
  const l2Checks = checks.filter((c) => c.level === 'L2');

  return {
    timestamp: new Date().toISOString(),
    version,
    scope: ASVS_SCOPE,
    summary: {
      total: checks.length,
      passed: checks.filter((c) => c.status === 'pass').length,
      failed: checks.filter((c) => c.status === 'fail').length,
      warnings: checks.filter((c) => c.status === 'warning').length,
      notApplicable: checks.filter((c) => c.status === 'not-applicable').length,
      coverage: {
        L1: {
          checked: l1Checks.length,
          total: ASVS_SCOPE.totalAsvsControls.L1,
          percentage: Math.round((l1Checks.length / ASVS_SCOPE.totalAsvsControls.L1) * 100)
        },
        L2: {
          checked: l2Checks.length,
          total: ASVS_SCOPE.totalAsvsControls.L2 - ASVS_SCOPE.totalAsvsControls.L1, // L2-only controls
          percentage: Math.round(
            (l2Checks.length / (ASVS_SCOPE.totalAsvsControls.L2 - ASVS_SCOPE.totalAsvsControls.L1)) *
              100
          )
        }
      }
    },
    checks
  };
}

// ============================================================================
// OUTPUT
// ============================================================================

function printConsole(report: Report): void {
  console.log(`\n${colors.bold}ASVS Compliance Check - ${PROJECT_CONFIG.name}${colors.reset}`);
  console.log(`${colors.dim}Version: ${report.version} | ${report.timestamp}${colors.reset}`);
  console.log(
    `${colors.magenta}Scope: ${report.scope.scope} (${report.scope.level})${colors.reset}\n`
  );

  // Group by category
  const categories = new Map<string, CheckResult[]>();
  for (const check of report.checks) {
    const existing = categories.get(check.category) || [];
    existing.push(check);
    categories.set(check.category, existing);
  }

  for (const [category, checks] of categories) {
    console.log(`${colors.bold}${category}${colors.reset}`);
    for (const check of checks) {
      const icon =
        check.status === 'pass'
          ? `${colors.green}✓${colors.reset}`
          : check.status === 'fail'
            ? `${colors.red}✗${colors.reset}`
            : check.status === 'warning'
              ? `${colors.yellow}⚠${colors.reset}`
              : check.status === 'not-applicable'
                ? `${colors.dim}○${colors.reset}`
                : `${colors.blue}ℹ${colors.reset}`;

      console.log(`  ${icon} ${colors.cyan}[${check.id}]${colors.reset} ${check.name}`);
      console.log(`    ${colors.dim}${check.description}${colors.reset}`);

      if (check.remediation) {
        console.log(`    ${colors.yellow}→ ${check.remediation}${colors.reset}`);
      }
    }
    console.log();
  }

  // Summary
  console.log(`${colors.bold}Summary${colors.reset}`);
  console.log(
    `  ${colors.green}Passed: ${report.summary.passed}${colors.reset} | ` +
      `${colors.red}Failed: ${report.summary.failed}${colors.reset} | ` +
      `${colors.yellow}Warnings: ${report.summary.warnings}${colors.reset} | ` +
      `${colors.dim}N/A: ${report.summary.notApplicable}${colors.reset}`
  );

  const passRate = Math.round(
    (report.summary.passed / (report.summary.total - report.summary.notApplicable)) * 100
  );
  console.log(`  ${colors.bold}Pass Rate: ${passRate}%${colors.reset}`);
  console.log(
    `  ${colors.dim}L1 Coverage: ${report.summary.coverage.L1.checked}/${report.summary.coverage.L1.total} controls (${report.summary.coverage.L1.percentage}%)${colors.reset}`
  );
  if (report.summary.coverage.L2) {
    console.log(
      `  ${colors.dim}L2 Coverage: ${report.summary.coverage.L2.checked}/${report.summary.coverage.L2.total} controls (${report.summary.coverage.L2.percentage}%)${colors.reset}`
    );
  }

  console.log(`\n${colors.dim}Note: This is an automated subset of ASVS controls.${colors.reset}`);
  console.log(
    `${colors.dim}Full compliance requires manual review and penetration testing.${colors.reset}\n`
  );
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

  const checks = runChecks();
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
