import { describe, expect, it } from 'vitest';
import { normalizeApiError } from './apiClient';
import { isJwtActive } from './youtubeService';

describe('normalizeApiError', () => {
  it('handles { detail: string } format from FastAPI', () => {
    const error = {
      response: {
        status: 404,
        data: {
          detail: 'Channel with ID uc-live-001 not found',
        },
      },
    };

    const normalized = normalizeApiError(error);
    expect(normalized.status).toBe(404);
    expect(normalized.kind).toBe('not_found');
    expect(normalized.message).toBe('Channel with ID uc-live-001 not found');
  });

  it('handles { detail: array } format from FastAPI validation errors', () => {
    const error = {
      response: {
        status: 422,
        data: {
          detail: [
            { loc: ['query', 'channel_id'], msg: 'field required', type: 'value_error.missing' },
            { loc: ['query', 'date_range'], msg: 'invalid range', type: 'type_error' },
          ],
        },
      },
    };

    const normalized = normalizeApiError(error);
    expect(normalized.status).toBe(422);
    expect(normalized.kind).toBe('unknown');
    expect(normalized.message).toBe('field required; invalid range');
  });

  it('handles { error: { code, message } } future format', () => {
    const error = {
      response: {
        status: 401,
        data: {
          error: {
            code: 'AUTH_SESSION_EXPIRED',
            message: 'Your Google OAuth session has expired',
          },
        },
      },
    };

    const normalized = normalizeApiError(error);
    expect(normalized.status).toBe(401);
    expect(normalized.code).toBe('AUTH_SESSION_EXPIRED');
    expect(normalized.kind).toBe('unauthorized');
    expect(normalized.message).toBe('Your Google OAuth session has expired');
  });

  it('handles { message } format', () => {
    const error = {
      response: {
        status: 503,
        data: {
          message: 'Upstream YouTube telemetry service timeout',
        },
      },
    };

    const normalized = normalizeApiError(error);
    expect(normalized.status).toBe(503);
    expect(normalized.kind).toBe('unavailable');
    expect(normalized.message).toBe('Upstream YouTube telemetry service timeout');
  });

  it('classifies network error when response is missing', () => {
    const error = {
      message: 'Network Error: Connection refused',
    };

    const normalized = normalizeApiError(error);
    expect(normalized.status).toBeUndefined();
    expect(normalized.kind).toBe('network');
    expect(normalized.message).toBe('Network Error: Connection refused');
  });

  it('sanitizes messages to never leak Bearer tokens or sensitive headers', () => {
    const errorWithToken = {
      response: {
        status: 401,
        data: {
          message: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.token123 was rejected',
        },
      },
    };

    const normalized = normalizeApiError(errorWithToken);
    expect(normalized.message).not.toContain('Bearer');
    expect(normalized.message).not.toContain('eyJhbGci');
    expect(normalized.message).toBe('Authentication failed. Please check credentials.');
  });
});

describe('isJwtActive', () => {
  it('returns false for null, empty or invalid string', () => {
    expect(isJwtActive(null)).toBe(false);
    expect(isJwtActive('')).toBe(false);
    expect(isJwtActive('not-a-jwt')).toBe(false);
    expect(isJwtActive('part1.part2')).toBe(false);
  });

  it('returns true for future exp timestamp', () => {
    const futureExp = Math.floor(Date.now() / 1000) + 3600;
    const payload = btoa(JSON.stringify({ sub: 'user_123', exp: futureExp }));
    const token = `header.${payload}.signature`;
    expect(isJwtActive(token)).toBe(true);
  });

  it('returns false for expired timestamp', () => {
    const pastExp = Math.floor(Date.now() / 1000) - 60;
    const payload = btoa(JSON.stringify({ sub: 'user_123', exp: pastExp }));
    const token = `header.${payload}.signature`;
    expect(isJwtActive(token)).toBe(false);
  });

  it('returns false within the 30-second clock skew buffer', () => {
    const nearExp = Math.floor(Date.now() / 1000) + 15;
    const payload = btoa(JSON.stringify({ sub: 'user_123', exp: nearExp }));
    const token = `header.${payload}.signature`;
    expect(isJwtActive(token)).toBe(false);
  });
});
