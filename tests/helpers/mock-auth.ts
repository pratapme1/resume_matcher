import { vi } from 'vitest';

export const TEST_USER_ID = 'test-user-uuid-001';
export const TEST_USER_ID_2 = 'test-user-uuid-002';

type MockGetUserResult = { data: { user: { id: string; email: string } | null }; error: null | Error };

let mockGetUserImpl: () => Promise<MockGetUserResult> = async () => ({
  data: { user: null },
  error: null,
});

export function setMockUser(userId: string | null, error: Error | null = null) {
  mockGetUserImpl = async () => ({
    data: { user: userId ? { id: userId, email: `${userId}@test.com` } : null },
    error,
  });
}

export function resetMockUser() {
  setMockUser(null, null);
}

// Returns a factory compatible with vi.mock('@supabase/supabase-js', () => createMockSupabaseFactory())
export function createMockSupabaseFactory() {
  return {
    createClient: vi.fn(() => ({
      auth: {
        getUser: vi.fn(() => mockGetUserImpl()),
      },
    })),
  };
}
