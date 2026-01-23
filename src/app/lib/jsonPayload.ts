export type JsonPayloadKind = 'json' | 'json-string' | 'text';

export interface JsonPayloadAnalysis {
  kind: JsonPayloadKind;
  isJson: boolean;
  display: string;
  jsonText?: string;
}

const tryParseJsonContainer = (value: string): unknown | null => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!(trimmed.startsWith('{') || trimmed.startsWith('['))) return null;

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (typeof parsed === 'object' && parsed !== null) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
};

export function analyzeJsonPayload(payload: string): JsonPayloadAnalysis {
  const trimmed = payload.trim();
  if (!trimmed) {
    return { kind: 'text', isJson: false, display: payload };
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;

    if (typeof parsed === 'string') {
      const nested = tryParseJsonContainer(parsed);
      if (nested !== null) {
        const formatted = JSON.stringify(nested, null, 2);
        return { kind: 'json-string', isJson: true, display: formatted, jsonText: formatted };
      }
      return { kind: 'text', isJson: false, display: parsed };
    }

    const formatted = JSON.stringify(parsed, null, 2);
    return { kind: 'json', isJson: true, display: formatted };
  } catch {
    return { kind: 'text', isJson: false, display: payload };
  }
}
