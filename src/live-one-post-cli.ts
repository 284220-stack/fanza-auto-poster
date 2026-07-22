export type LiveOneCliOptions = { execute: boolean; confirmed: boolean; confirmationToken?: string };

export function parseLiveOneArguments(args: string[]): LiveOneCliOptions {
  const equals = args.find((arg) => arg.startsWith('--token='));
  const separateIndex = args.indexOf('--token');
  const token = equals?.slice('--token='.length) ?? (separateIndex >= 0 ? args[separateIndex + 1] : undefined);
  return { execute: args.includes('--execute'), confirmed: args.includes('--confirm-one-post'), confirmationToken: token?.trim() || undefined };
}

export function canExecuteLiveOne(options: LiveOneCliOptions, environment: NodeJS.ProcessEnv = process.env) {
  return options.execute && options.confirmed && Boolean(options.confirmationToken) && (environment.DRY_RUN ?? 'true').toLowerCase() === 'false';
}
