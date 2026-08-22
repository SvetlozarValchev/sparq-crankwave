interface ParsedWorkerUrl {
  protocol: string;
  username: string;
  password: string;
  host: string;
  pathname: string;
  search: string;
  hash: string;
}

function splitTail(value: string): { path: string; search: string; hash: string } {
  const hashIndex = value.indexOf('#');
  const withoutHash = hashIndex < 0 ? value : value.slice(0, hashIndex);
  const hash = hashIndex < 0 ? '' : value.slice(hashIndex);
  const searchIndex = withoutHash.indexOf('?');
  return {
    path: searchIndex < 0 ? withoutHash : withoutHash.slice(0, searchIndex),
    search: searchIndex < 0 ? '' : withoutHash.slice(searchIndex),
    hash,
  };
}

function normalizePath(path: string): string {
  const trailingSlash = path.endsWith('/');
  const segments: string[] = [];
  for (const segment of path.split('/')) {
    if (segment === '' || segment === '.') {
      continue;
    }
    if (segment === '..') {
      segments.pop();
    } else {
      segments.push(segment);
    }
  }
  const normalized = `/${segments.join('/')}`;
  return trailingSlash && normalized !== '/' ? `${normalized}/` : normalized;
}

function parseAbsolute(value: string): ParsedWorkerUrl | null {
  const match = /^([a-z][a-z0-9+.-]*:)?\/\/([^/?#]*)([^?#]*)(\?[^#]*)?(#.*)?$/iu.exec(value);
  if (match === null || match[1] === undefined || match[2] === undefined) {
    return null;
  }
  let authority = match[2];
  let username = '';
  let password = '';
  const at = authority.lastIndexOf('@');
  if (at >= 0) {
    const credentials = authority.slice(0, at);
    authority = authority.slice(at + 1);
    const colon = credentials.indexOf(':');
    username = colon < 0 ? credentials : credentials.slice(0, colon);
    password = colon < 0 ? '' : credentials.slice(colon + 1);
  }
  if (authority.length === 0) {
    return null;
  }
  return {
    protocol: match[1].toLowerCase(),
    username,
    password,
    host: authority.toLowerCase(),
    pathname: normalizePath(match[3] || '/'),
    search: match[4] ?? '',
    hash: match[5] ?? '',
  };
}

class CrankwaveWorkerUrl {
  readonly protocol: string;
  readonly username: string;
  readonly password: string;
  readonly host: string;
  readonly hostname: string;
  readonly port: string;
  readonly pathname: string;
  readonly search: string;
  readonly hash: string;
  readonly origin: string;
  readonly href: string;

  constructor(input: string | CrankwaveWorkerUrl, base?: string | CrankwaveWorkerUrl) {
    const inputText = typeof input === 'string' ? input : input.href;
    let parsed = parseAbsolute(inputText);
    if (parsed === null) {
      if (base === undefined) {
        throw new TypeError(`Invalid URL: ${inputText}`);
      }
      const baseText = typeof base === 'string' ? base : base.href;
      const parsedBase = parseAbsolute(baseText);
      if (parsedBase === null) {
        throw new TypeError(`Invalid base URL: ${baseText}`);
      }
      const tail = splitTail(inputText);
      const path = tail.path.startsWith('/')
        ? tail.path
        : `${parsedBase.pathname.slice(0, parsedBase.pathname.lastIndexOf('/') + 1)}${tail.path}`;
      parsed = {
        ...parsedBase,
        pathname: normalizePath(path),
        search: tail.search,
        hash: tail.hash,
      };
    }

    this.protocol = parsed.protocol;
    this.username = parsed.username;
    this.password = parsed.password;
    this.host = parsed.host;
    const portSeparator = parsed.host.lastIndexOf(':');
    this.hostname = portSeparator < 0 ? parsed.host : parsed.host.slice(0, portSeparator);
    this.port = portSeparator < 0 ? '' : parsed.host.slice(portSeparator + 1);
    this.pathname = parsed.pathname;
    this.search = parsed.search;
    this.hash = parsed.hash;
    const credentials = parsed.username === ''
      ? ''
      : `${parsed.username}${parsed.password === '' ? '' : `:${parsed.password}`}@`;
    this.origin = `${parsed.protocol}//${parsed.host}`;
    this.href = `${parsed.protocol}//${credentials}${parsed.host}${parsed.pathname}${parsed.search}${parsed.hash}`;
  }

  toString(): string {
    return this.href;
  }
}

/** Install the URL subset used to address entries inside an in-memory CRANKWAVE carrier. */
export function installCrankwaveWorkerUrl(): void {
  const scope = globalThis as unknown as { URL?: typeof URL };
  if (scope.URL === undefined) {
    scope.URL = CrankwaveWorkerUrl as unknown as typeof URL;
  }
}
