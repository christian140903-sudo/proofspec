import { z } from 'zod';

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() => z.union([
  z.string(),
  z.number().finite(),
  z.boolean(),
  z.null(),
  z.array(jsonValueSchema),
  z.record(jsonValueSchema),
]));

const fileCheckSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('exists') }).strict(),
  z.object({ op: z.literal('not_exists') }).strict(),
  z.object({ op: z.literal('sha256'), equals: z.string().regex(/^[a-fA-F0-9]{64}$/) }).strict(),
  z.object({ op: z.literal('contains'), text: z.string().min(1).max(100_000) }).strict(),
  z.object({ op: z.literal('json_equals'), pointer: z.string().max(2_000), value: jsonValueSchema }).strict(),
  z.object({ op: z.literal('min_size'), bytes: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER) }).strict(),
  z.object({ op: z.literal('max_size'), bytes: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER) }).strict(),
]);

const httpCheckSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('status'), equals: z.number().int().min(100).max(599) }).strict(),
  z.object({ op: z.literal('contains'), text: z.string().min(1).max(100_000) }).strict(),
  z.object({ op: z.literal('json_equals'), pointer: z.string().max(2_000), value: jsonValueSchema }).strict(),
]);

const gitCheckSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('branch'), equals: z.string().min(1).max(500) }).strict(),
  z.object({ op: z.literal('clean'), equals: z.boolean().optional() }).strict(),
  z.object({ op: z.literal('head'), equals: z.string().min(1).max(500) }).strict(),
  z.object({ op: z.literal('tag_exists'), tag: z.string().min(1).max(500) }).strict(),
  z.object({ op: z.literal('remote_contains'), commit: z.string().min(1).max(500), remote: z.string().regex(/^[A-Za-z0-9._-]+$/).optional() }).strict(),
]);

const npmCheckSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('version_exists'), version: z.string().min(1).max(256) }).strict(),
  z.object({ op: z.literal('dist_tag'), tag: z.string().min(1).max(256), equals: z.string().min(1).max(256) }).strict(),
]);

export const verifierSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('file'), path: z.string().min(1).max(16_000), check: fileCheckSchema }).strict(),
  z.object({ kind: z.literal('http'), url: z.string().url().max(16_000), timeoutMs: z.number().int().min(100).max(30_000).optional(), check: httpCheckSchema }).strict(),
  z.object({ kind: z.literal('git'), cwd: z.string().min(1).max(16_000), check: gitCheckSchema }).strict(),
  z.object({
    kind: z.literal('npm'),
    package: z.string().regex(/^(?:@[a-z0-9][a-z0-9._~-]*\/[a-z0-9][a-z0-9._~-]*|[a-z0-9][a-z0-9._~-]*)$/i),
    registry: z.string().url().max(16_000).optional(),
    check: npmCheckSchema,
  }).strict(),
  z.object({ kind: z.literal('manual'), instructions: z.string().min(1).max(20_000) }).strict(),
]);

const idSchema = z.string().regex(/^[a-z][a-z0-9._-]{0,63}$/);
const policySchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('all') }).strict(),
  z.object({ mode: z.literal('any') }).strict(),
  z.object({ mode: z.literal('at_least'), count: z.number().int().min(1).max(50) }).strict(),
]);

const evidenceSchema = z.object({
  id: idSchema,
  description: z.string().trim().min(1).max(2_000).optional(),
  verifier: verifierSchema,
}).strict();

const claimSchema = z.object({
  id: idSchema,
  statement: z.string().trim().min(5).max(20_000),
  severity: z.enum(['error', 'warning', 'info']).optional(),
  policy: policySchema.optional(),
  evidence: z.array(evidenceSchema).max(50),
  dependsOn: z.array(idSchema).max(100).optional(),
  limitations: z.array(z.string().trim().min(1).max(4_000)).max(100).optional(),
  tags: z.array(z.string().trim().min(1).max(100)).max(100).optional(),
}).strict();

export const proofspecConfigSchema = z.object({
  $schema: z.string().url().optional(),
  schemaVersion: z.literal(1),
  project: z.object({
    name: z.string().trim().min(1).max(500),
    repository: z.string().url().optional(),
    homepage: z.string().url().optional(),
  }).strict(),
  defaults: z.object({
    ledgerPath: z.string().min(1).max(16_000).optional(),
    reportDir: z.string().min(1).max(16_000).optional(),
  }).strict().optional(),
  claims: z.array(claimSchema).min(1).max(500),
}).strict().superRefine((config, context) => {
  const ids = new Set<string>();
  for (const [claimIndex, claim] of config.claims.entries()) {
    if (ids.has(claim.id)) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: `Duplicate claim id: ${claim.id}`, path: ['claims', claimIndex, 'id'] });
    }
    ids.add(claim.id);
    const evidenceIds = new Set<string>();
    for (const [evidenceIndex, evidence] of claim.evidence.entries()) {
      if (evidenceIds.has(evidence.id)) {
        context.addIssue({ code: z.ZodIssueCode.custom, message: `Duplicate evidence id in ${claim.id}: ${evidence.id}`, path: ['claims', claimIndex, 'evidence', evidenceIndex, 'id'] });
      }
      evidenceIds.add(evidence.id);
    }
    if (claim.policy?.mode === 'at_least' && claim.policy.count > claim.evidence.length) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: `Claim ${claim.id} requires ${claim.policy.count} evidence checks but defines ${claim.evidence.length}.`, path: ['claims', claimIndex, 'policy', 'count'] });
    }
  }

  const byId = new Map(config.claims.map((claim) => [claim.id, claim]));
  for (const [claimIndex, claim] of config.claims.entries()) {
    for (const [dependencyIndex, dependency] of (claim.dependsOn ?? []).entries()) {
      if (!byId.has(dependency)) {
        context.addIssue({ code: z.ZodIssueCode.custom, message: `Unknown dependency ${dependency} in claim ${claim.id}.`, path: ['claims', claimIndex, 'dependsOn', dependencyIndex] });
      }
      if (dependency === claim.id) {
        context.addIssue({ code: z.ZodIssueCode.custom, message: `Claim ${claim.id} cannot depend on itself.`, path: ['claims', claimIndex, 'dependsOn', dependencyIndex] });
      }
    }
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): boolean => {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    for (const dependency of byId.get(id)?.dependsOn ?? []) {
      if (byId.has(dependency) && visit(dependency)) return true;
    }
    visiting.delete(id);
    visited.add(id);
    return false;
  };
  for (const id of byId.keys()) {
    if (visit(id)) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: `Claim dependency cycle detected at ${id}.`, path: ['claims'] });
      break;
    }
  }
});
