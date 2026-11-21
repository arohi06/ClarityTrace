import dns from 'dns/promises';
import fs from 'fs';
import net from 'net';
import path from 'path';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';

let cachedJwtSecret: string | null = null;

export function getJwtSecret(): string {
  if (cachedJwtSecret) return cachedJwtSecret;

  const envSecret = process.env.JWT_SECRET?.trim();
  const isPlaceholder = !envSecret || envSecret === 'CHANGE_ME_IN_PRODUCTION';
  const isProd = process.env.NODE_ENV === 'production';

  if (!isPlaceholder) {
    if (isProd && envSecret.length < 16) {
      throw new Error('JWT_SECRET must be at least 16 characters when NODE_ENV=production.');
    }
    cachedJwtSecret = envSecret;
    return cachedJwtSecret;
  }

  if (isProd) {
    throw new Error(
      'JWT_SECRET environment variable is required in production. Refusing to start with an ephemeral or placeholder secret.'
    );
  }

  const dbDir = path.dirname(path.resolve(process.env.CLARITYTRACE_DB_PATH || './data/claritytrace.db'));
  const devSecretFile = path.join(dbDir, '.jwt_dev_secret');
  if (fs.existsSync(devSecretFile)) {
    const existing = fs.readFileSync(devSecretFile, 'utf8').trim();
    if (existing.length >= 32) {
      cachedJwtSecret = existing;
      return cachedJwtSecret;
    }
  }
  fs.mkdirSync(dbDir, { recursive: true });
  const generated = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(devSecretFile, generated, { mode: 0o600 });
  cachedJwtSecret = generated;
  return cachedJwtSecret;
}

export interface AuthPayload {
  userId: number;
  email: string;
  name: string;
  role: string;
}

export interface AuthRequest extends Request {
  user?: AuthPayload;
}

export function hashPassword(password: string): string {
  return bcrypt.hashSync(password, 10);
}

export function verifyPassword(password: string, hash: string): boolean {
  return bcrypt.compareSync(password, hash);
}

export function signAuthToken(payload: AuthPayload): string {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: '7d' });
}

export function verifyAuthToken(token: string): AuthPayload | null {
  try {
    return jwt.verify(token, getJwtSecret()) as AuthPayload;
  } catch {
    return null;
  }
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  const queryToken = typeof req.query.token === 'string' ? req.query.token : undefined;
  const rawToken =
    header && header.startsWith('Bearer ') ? header.slice(7).trim() : queryToken;

  if (!rawToken) {
    res.status(401).json({ error: 'Authentication required. Missing Bearer token.' });
    return;
  }

  const decoded = verifyAuthToken(rawToken);
  if (!decoded) {
    res.status(401).json({ error: 'Invalid or expired authentication token.' });
    return;
  }

  req.user = decoded;
  next();
}

function ipToLong(ip: string): number {
  const parts = ip.split('.').map(Number);
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

function inCidr4(ip: string, base: string, maskBits: number): boolean {
  const mask = maskBits === 0 ? 0 : (~0 << (32 - maskBits)) >>> 0;
  return (ipToLong(ip) & mask) === (ipToLong(base) & mask);
}

function parseHexPairToIpv4(highHex: string, lowHex: string): string | null {
  if (!/^[0-9a-f]{1,4}$/i.test(highHex) || !/^[0-9a-f]{1,4}$/i.test(lowHex)) return null;
  const hi = parseInt(highHex, 16);
  const lo = parseInt(lowHex, 16);
  return `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
}

export function isPrivateOrReservedIp(ip: string): boolean {
  const normalized = ip.trim().toLowerCase().split('%')[0];

  // Handle dotted or hex IPv4-mapped IPv6 addresses (e.g. ::ffff:127.0.0.1 or ::ffff:7f00:1)
  if (normalized.startsWith('::ffff:')) {
    const v4Part = normalized.slice(7);
    if (net.isIPv4(v4Part)) {
      return isPrivateOrReservedIp(v4Part);
    }
    const hexParts = v4Part.split(':');
    if (hexParts.length === 2) {
      const dotted = parseHexPairToIpv4(hexParts[0], hexParts[1]);
      if (dotted && net.isIPv4(dotted)) {
        return isPrivateOrReservedIp(dotted);
      }
    }
  }

  // Handle deprecated IPv4-compatible IPv6 (::127.0.0.1 or ::7f00:1)
  if (normalized.startsWith('::') && normalized !== '::' && normalized !== '::1') {
    const rest = normalized.slice(2);
    if (net.isIPv4(rest)) {
      return isPrivateOrReservedIp(rest);
    }
    const hexParts = rest.split(':');
    if (hexParts.length === 2) {
      const dotted = parseHexPairToIpv4(hexParts[0], hexParts[1]);
      if (dotted && net.isIPv4(dotted)) {
        return isPrivateOrReservedIp(dotted);
      }
    }
  }

  if (net.isIPv4(normalized)) {
    const blockedRanges: Array<[string, number]> = [
      ['0.0.0.0', 8],       // "This" network
      ['10.0.0.0', 8],      // RFC 1918 private
      ['100.64.0.0', 10],   // Carrier-grade NAT
      ['127.0.0.0', 8],     // Loopback
      ['169.254.0.0', 16],  // Link-local & cloud metadata (169.254.169.254)
      ['172.16.0.0', 12],   // RFC 1918 private
      ['192.0.0.0', 24],    // IETF protocol assignments
      ['192.0.2.0', 24],    // TEST-NET-1
      ['192.168.0.0', 16],  // RFC 1918 private
      ['198.18.0.0', 15],   // Benchmarking
      ['224.0.0.0', 4],     // Multicast
      ['240.0.0.0', 4],     // Reserved / Broadcast
    ];
    return blockedRanges.some(([base, bits]) => inCidr4(normalized, base, bits));
  }

  if (net.isIPv6(normalized)) {
    if (
      normalized === '::' ||
      normalized === '::1' ||
      normalized.startsWith('::ffff:') || // Any unparsed mapped prefix
      normalized.startsWith('64:ff9b:') || // NAT64
      normalized.startsWith('100::') || // Discard-only
      normalized.startsWith('2001:db8:') || // Documentation
      normalized.startsWith('fc') ||
      normalized.startsWith('fd') || // Unique local fc00::/7
      normalized.startsWith('fe8') ||
      normalized.startsWith('fe9') ||
      normalized.startsWith('fea') ||
      normalized.startsWith('feb') || // Link-local fe80::/10
      normalized.startsWith('ff') // Multicast
    ) {
      return true;
    }
  }

  return false;
}

export interface UrlValidationResult {
  valid: boolean;
  normalizedUrl?: string;
  domain?: string;
  isTestLab?: boolean;
  resolvedIps?: string[];
  reason?: string;
}

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'ip6-localhost',
  'ip6-loopback',
  'metadata.google.internal',
  'metadata.goog',
  '169.254.169.254',
]);

export function isLocalTestLabUrl(rawUrl: string, allowedPort = Number(process.env.PORT || 3000)): boolean {
  try {
    if (/%2f|%5c|\.\./i.test(rawUrl)) return false;
    const parsed = new URL(rawUrl);
    const isLocalHost = parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost';
    const portMatches = Number(parsed.port || (parsed.protocol === 'https:' ? 443 : 80)) === allowedPort;
    return (
      (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
      isLocalHost &&
      portMatches &&
      parsed.pathname.startsWith('/test-lab/')
    );
  } catch {
    return false;
  }
}

export async function validateScanTargetUrl(
  rawUrl: string,
  options: { allowTestLab?: boolean; serverPort?: number } = {}
): Promise<UrlValidationResult> {
  if (!rawUrl || typeof rawUrl !== 'string' || rawUrl.length > 2048) {
    return { valid: false, reason: 'URL must be a non-empty string under 2048 characters.' };
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    return { valid: false, reason: 'Invalid URL syntax. Include https:// or http://.' };
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return { valid: false, reason: `Protocol "${parsed.protocol}" is blocked. Only HTTP and HTTPS are allowed.` };
  }

  if (parsed.username || parsed.password) {
    return { valid: false, reason: 'URLs containing embedded credentials are prohibited.' };
  }

  // Controlled Test Lab bypass strictly for /test-lab/* on the local evaluation port
  if (options.allowTestLab && isLocalTestLabUrl(parsed.toString(), options.serverPort)) {
    return {
      valid: true,
      normalizedUrl: parsed.toString(),
      domain: parsed.hostname,
      isTestLab: true,
      resolvedIps: ['127.0.0.1'],
    };
  }

  const host = parsed.hostname.toLowerCase();
  if (
    BLOCKED_HOSTNAMES.has(host) ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host.endsWith('.localhost')
  ) {
    return { valid: false, reason: `SSRF guard blocked internal hostname "${host}".` };
  }

  // Direct IP literal check
  const bareIp = host.replace(/^\[|\]$/g, '');
  if (net.isIP(bareIp)) {
    if (isPrivateOrReservedIp(bareIp)) {
      return { valid: false, reason: `SSRF guard blocked private/loopback IP "${bareIp}".` };
    }
    return {
      valid: true,
      normalizedUrl: parsed.toString(),
      domain: host,
      isTestLab: false,
      resolvedIps: [bareIp],
    };
  }

  // DNS resolution SSRF verification (prevents DNS rebinding / internal A records)
  try {
    const records = await dns.lookup(host, { all: true, verbatim: true });
    if (!records || records.length === 0) {
      return { valid: false, reason: `DNS lookup returned no addresses for "${host}".` };
    }
    for (const rec of records) {
      if (isPrivateOrReservedIp(rec.address)) {
        return {
          valid: false,
          reason: `SSRF guard blocked "${host}" because it resolves to private/reserved IP ${rec.address}.`,
        };
      }
    }
    return {
      valid: true,
      normalizedUrl: parsed.toString(),
      domain: host,
      isTestLab: false,
      resolvedIps: records.map((r) => r.address),
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'DNS resolution failed';
    return { valid: false, reason: `Unable to resolve target domain "${host}": ${message}` };
  }
}

export function sanitizeUntrustedPolicyText(rawText: string, maxChars = 18000): string {
  // Strip control characters and potential instruction-injection delimiters
  const cleaned = rawText
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ')
    .replace(/<\/?untrusted_policy_document>/gi, '[REDACTED_TAG]')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.slice(0, maxChars);
}

export function resolveSafeEvidencePath(relPath: string): string | null {
  const dbDir = path.dirname(path.resolve(process.env.CLARITYTRACE_DB_PATH || './data/claritytrace.db'));
  const allowedRoots = [path.resolve('./data/evidence'), path.join(dbDir, 'evidence')];
  const resolved = path.resolve(process.cwd(), relPath);
  if (!allowedRoots.some((root) => resolved.startsWith(root + path.sep))) {
    return null;
  }
  return resolved;
}
