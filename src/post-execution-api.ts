import type { PostExecutionInput, PostExecutionOrchestrator } from './post-execution-orchestrator.js';
export async function handlePostExecutionApiRequest(method: string | undefined, body: Record<string, unknown>, create: () => PostExecutionOrchestrator & { run(input: PostExecutionInput): ReturnType<PostExecutionOrchestrator['run']> }, client: PostExecutionInput['client']) {
  if (method !== 'POST') return { status: 400, body: { message: 'POST メソッドで実行してください。' } };
  if (!Number.isInteger(body.productId) || typeof body.parentPostText !== 'string' || (body.affiliateUrl !== undefined && typeof body.affiliateUrl !== 'string') || (body.dryRun !== undefined && typeof body.dryRun !== 'boolean')) return { status: 400, body: { message: '入力が不正です。' } };
  const result = await create().run({ productId: body.productId as number, parentPostText: body.parentPostText as string, affiliateUrl: body.affiliateUrl as string | undefined, dryRun: body.dryRun as boolean | undefined, client });
  const status = result.status === 'not_found' ? 404 : result.status === 'blocked' || result.status === 'already_running' ? 409 : result.status === 'failed' ? 500 : 200;
  return { status, body: { action: result.action, status: result.status, productId: result.productId, eligibilityReason: result.eligibilityReason, retryReplyPossible: result.retryReplyPossible, warnings: result.warnings, errors: result.errors } };
}
