declare module 'mailparser' {
  export function simpleParser(source: Buffer): Promise<{
    from?: { text?: string };
    subject?: string;
    text?: string;
    html?: string | false;
  }>;
}
