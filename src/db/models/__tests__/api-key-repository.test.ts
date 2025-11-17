/**
 * API Key Repository Tests
 * Comprehensive tests for API key management with bcrypt validation
 */
import bcrypt from 'bcrypt';

// Mock the database client BEFORE importing repository
const mockQuery = jest.fn();
jest.mock('../../client', () => ({
  db: {
    query: mockQuery,
  },
}));

// Mock logger BEFORE importing repository
const mockLogger = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
};
jest.mock('@utils/logger', () => mockLogger);

// Now import the repository (after mocks are set up)
import { APIKeyRepository, CreateAPIKeyParams } from '../api-key-repository';

describe('APIKeyRepository', () => {
  let repository: APIKeyRepository;

  beforeEach(() => {
    repository = new APIKeyRepository();
    jest.clearAllMocks();
  });

  describe('hashApiKey', () => {
    it('should hash API key using bcrypt', async () => {
      const key = 'llmpe_test123456789';
      const hash = await repository.hashApiKey(key);

      expect(hash).toBeDefined();
      expect(hash).not.toBe(key);
      expect(hash.startsWith('$2b$12$')).toBe(true); // bcrypt hash format

      // Verify hash is valid
      const isValid = await bcrypt.compare(key, hash);
      expect(isValid).toBe(true);
    });

    it('should generate different hashes for same key', async () => {
      const key = 'llmpe_test123456789';
      const hash1 = await repository.hashApiKey(key);
      const hash2 = await repository.hashApiKey(key);

      expect(hash1).not.toBe(hash2); // Salts should differ
    });

    it('should handle empty strings', async () => {
      const hash = await repository.hashApiKey('');
      expect(hash).toBeDefined();
    });
  });

  describe('createApiKey', () => {
    it('should create API key with all parameters', async () => {
      const params: CreateAPIKeyParams = {
        name: 'Test API Key',
        permissions: ['policy:read', 'policy:evaluate'],
        rateLimit: 1000,
        expiresAt: new Date('2025-12-31'),
        createdBy: 'user-123',
      };

      const mockApiKey = {
        id: 'key-123',
        name: params.name,
        key_hash: 'hashed_value',
        key_prefix: 'llmpe_abcdef',
        permissions: params.permissions,
        rate_limit: params.rateLimit,
        expires_at: params.expiresAt,
        last_used_at: null,
        created_at: new Date(),
        created_by: params.createdBy,
        revoked: false,
      };

      mockQuery.mockResolvedValue({
        rows: [mockApiKey],
        rowCount: 1,
      } as any);

      const result = await repository.createApiKey(params);

      expect(result).toBeDefined();
      expect(result.apiKey).toEqual(mockApiKey);
      expect(result.rawKey).toBeDefined();
      expect(result.rawKey.startsWith('llmpe_')).toBe(true);
      expect(result.rawKey.length).toBeGreaterThan(20);

      // Verify database query
      expect(mockQuery).toHaveBeenCalledTimes(1);
      const callArgs = mockQuery.mock.calls[0];
      expect(callArgs[0]).toContain('INSERT INTO api_keys');
      expect(callArgs[1]).toEqual([
        params.name,
        expect.any(String), // hashed key
        expect.any(String), // key prefix
        params.permissions,
        params.rateLimit,
        params.expiresAt,
        params.createdBy,
      ]);
    });

    it('should create API key with default rate limit', async () => {
      const params: CreateAPIKeyParams = {
        name: 'Test API Key',
        permissions: ['policy:read'],
      };

      const mockApiKey = {
        id: 'key-456',
        name: params.name,
        key_hash: 'hashed_value',
        key_prefix: 'llmpe_xyz123',
        permissions: params.permissions,
        rate_limit: 100, // default
        expires_at: null,
        last_used_at: null,
        created_at: new Date(),
        created_by: null,
        revoked: false,
      };

      mockQuery.mockResolvedValue({
        rows: [mockApiKey],
        rowCount: 1,
      } as any);

      const result = await repository.createApiKey(params);

      expect(result.apiKey.rate_limit).toBe(100);

      const callArgs = mockQuery.mock.calls[0];
      expect(callArgs[1][4]).toBe(100); // rate_limit parameter
    });

    it('should generate unique API keys', async () => {
      const params: CreateAPIKeyParams = {
        name: 'Test API Key',
        permissions: ['policy:read'],
      };

      mockQuery.mockResolvedValue({
        rows: [
          {
            id: 'key-1',
            name: params.name,
            key_hash: 'hash1',
            key_prefix: 'llmpe_abc',
            permissions: params.permissions,
            rate_limit: 100,
            expires_at: null,
            last_used_at: null,
            created_at: new Date(),
            created_by: null,
            revoked: false,
          },
        ],
        rowCount: 1,
      } as any);

      const key1 = await repository.createApiKey(params);
      const key2 = await repository.createApiKey(params);

      expect(key1.rawKey).not.toBe(key2.rawKey);
    });

    it('should throw error if database insert fails', async () => {
      const params: CreateAPIKeyParams = {
        name: 'Test API Key',
        permissions: ['policy:read'],
      };

      mockQuery.mockResolvedValue({
        rows: [],
        rowCount: 0,
      } as any);

      await expect(repository.createApiKey(params)).rejects.toThrow(
        'Failed to create API key',
      );
    });
  });

  describe('validateApiKey', () => {
    it('should validate correct API key', async () => {
      const rawKey = 'llmpe_abcdef123456789';
      const keyHash = await bcrypt.hash(rawKey, 12);

      const mockApiKey = {
        id: 'key-123',
        name: 'Test Key',
        key_hash: keyHash,
        key_prefix: 'llmpe_abcdef',
        permissions: ['policy:read', 'policy:evaluate'],
        rate_limit: 100,
        expires_at: null,
        last_used_at: null,
        created_at: new Date(),
        created_by: 'user-123',
        revoked: false,
      };

      mockQuery.mockResolvedValue({
        rows: [mockApiKey],
        rowCount: 1,
      } as any);

      const result = await repository.validateApiKey(rawKey);

      expect(result).toEqual(mockApiKey);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM api_keys'),
        ['llmpe_abcdef'],
      );
    });

    it('should reject invalid API key format', async () => {
      const result = await repository.validateApiKey('invalid_key');

      expect(result).toBeNull();
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('should reject empty API key', async () => {
      const result = await repository.validateApiKey('');

      expect(result).toBeNull();
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('should reject revoked API key', async () => {
      const rawKey = 'llmpe_xyz123456789';

      mockQuery.mockResolvedValue({
        rows: [], // Revoked keys filtered out by query
        rowCount: 0,
      } as any);

      const result = await repository.validateApiKey(rawKey);

      expect(result).toBeNull();
    });

    it('should reject expired API key', async () => {
      const rawKey = 'llmpe_expired123456789';

      mockQuery.mockResolvedValue({
        rows: [], // Expired keys filtered out by query
        rowCount: 0,
      } as any);

      const result = await repository.validateApiKey(rawKey);

      expect(result).toBeNull();
    });

    it('should handle wrong password', async () => {
      const correctKey = 'llmpe_correct123456789';
      const wrongKey = 'llmpe_wrong123456789';
      const keyHash = await bcrypt.hash(correctKey, 12);

      const mockApiKey = {
        id: 'key-123',
        name: 'Test Key',
        key_hash: keyHash,
        key_prefix: 'llmpe_wrong1234',
        permissions: ['policy:read'],
        rate_limit: 100,
        expires_at: null,
        last_used_at: null,
        created_at: new Date(),
        created_by: null,
        revoked: false,
      };

      mockQuery.mockResolvedValue({
        rows: [mockApiKey],
        rowCount: 1,
      } as any);

      const result = await repository.validateApiKey(wrongKey);

      expect(result).toBeNull();
    });

    it('should handle multiple keys with same prefix', async () => {
      const rawKey = 'llmpe_test123456789';
      const correctHash = await bcrypt.hash(rawKey, 12);
      const wrongHash = await bcrypt.hash('llmpe_test987654321', 12);

      const mockApiKeys = [
        {
          id: 'key-1',
          name: 'Key 1',
          key_hash: wrongHash,
          key_prefix: 'llmpe_test12',
          permissions: ['policy:read'],
          rate_limit: 100,
          expires_at: null,
          last_used_at: null,
          created_at: new Date(),
          created_by: null,
          revoked: false,
        },
        {
          id: 'key-2',
          name: 'Key 2',
          key_hash: correctHash,
          key_prefix: 'llmpe_test12',
          permissions: ['policy:read', 'policy:write'],
          rate_limit: 100,
          expires_at: null,
          last_used_at: null,
          created_at: new Date(),
          created_by: null,
          revoked: false,
        },
      ];

      mockQuery.mockResolvedValue({
        rows: mockApiKeys,
        rowCount: 2,
      } as any);

      const result = await repository.validateApiKey(rawKey);

      expect(result).toEqual(mockApiKeys[1]); // Should find the correct one
    });

    it('should handle database errors gracefully', async () => {
      const rawKey = 'llmpe_test123456789';

      mockQuery.mockRejectedValue(new Error('Database connection failed'));

      const result = await repository.validateApiKey(rawKey);

      expect(result).toBeNull();
    });
  });

  describe('updateLastUsed', () => {
    it('should update last_used_at timestamp', async () => {
      const keyId = 'key-123';

      mockQuery.mockResolvedValue({
        rows: [],
        rowCount: 1,
      } as any);

      await repository.updateLastUsed(keyId);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE api_keys SET last_used_at = NOW()'),
        [keyId],
      );
    });

    it('should throw error on database failure', async () => {
      const keyId = 'key-123';

      mockQuery.mockRejectedValue(new Error('Database error'));

      await expect(repository.updateLastUsed(keyId)).rejects.toThrow(
        'Failed to update last_used_at',
      );
    });
  });

  describe('revokeApiKey', () => {
    it('should revoke API key', async () => {
      const keyId = 'key-123';

      mockQuery.mockResolvedValue({
        rows: [{ id: keyId, revoked: true }],
        rowCount: 1,
      } as any);

      await repository.revokeApiKey(keyId);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE api_keys SET revoked = true'),
        [keyId],
      );
    });

    it('should throw error if key not found', async () => {
      const keyId = 'nonexistent-key';

      mockQuery.mockResolvedValue({
        rows: [],
        rowCount: 0,
      } as any);

      await expect(repository.revokeApiKey(keyId)).rejects.toThrow(
        'API key not found',
      );
    });
  });

  describe('getApiKeyById', () => {
    it('should get API key by ID', async () => {
      const mockApiKey = {
        id: 'key-123',
        name: 'Test Key',
        key_hash: 'hashed_value',
        key_prefix: 'llmpe_abc',
        permissions: ['policy:read'],
        rate_limit: 100,
        expires_at: null,
        last_used_at: null,
        created_at: new Date(),
        created_by: null,
        revoked: false,
      };

      mockQuery.mockResolvedValue({
        rows: [mockApiKey],
        rowCount: 1,
      } as any);

      const result = await repository.getApiKeyById('key-123');

      expect(result).toEqual(mockApiKey);
    });

    it('should return null if key not found', async () => {
      mockQuery.mockResolvedValue({
        rows: [],
        rowCount: 0,
      } as any);

      const result = await repository.getApiKeyById('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('listApiKeys', () => {
    it('should list all API keys', async () => {
      const mockKeys = [
        {
          id: 'key-1',
          name: 'Key 1',
          key_prefix: 'llmpe_abc',
          permissions: ['policy:read'],
          rate_limit: 100,
          expires_at: null,
          last_used_at: null,
          created_at: new Date(),
          created_by: null,
          revoked: false,
        },
        {
          id: 'key-2',
          name: 'Key 2',
          key_prefix: 'llmpe_xyz',
          permissions: ['policy:write'],
          rate_limit: 200,
          expires_at: null,
          last_used_at: new Date(),
          created_at: new Date(),
          created_by: 'user-123',
          revoked: false,
        },
      ];

      mockQuery.mockResolvedValue({
        rows: mockKeys,
        rowCount: 2,
      } as any);

      const result = await repository.listApiKeys();

      expect(result).toEqual(mockKeys);
      expect(result).toHaveLength(2);
    });

    it('should filter by revoked status', async () => {
      const mockKeys = [
        {
          id: 'key-1',
          name: 'Active Key',
          key_prefix: 'llmpe_abc',
          permissions: ['policy:read'],
          rate_limit: 100,
          expires_at: null,
          last_used_at: null,
          created_at: new Date(),
          created_by: null,
          revoked: false,
        },
      ];

      mockQuery.mockResolvedValue({
        rows: mockKeys,
        rowCount: 1,
      } as any);

      const result = await repository.listApiKeys({ revoked: false });

      expect(result).toHaveLength(1);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('AND revoked = $1'),
        [false],
      );
    });

    it('should filter by createdBy', async () => {
      mockQuery.mockResolvedValue({
        rows: [],
        rowCount: 0,
      } as any);

      await repository.listApiKeys({ createdBy: 'user-123' });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('AND created_by = $1'),
        ['user-123'],
      );
    });

    it('should filter by multiple criteria', async () => {
      mockQuery.mockResolvedValue({
        rows: [],
        rowCount: 0,
      } as any);

      await repository.listApiKeys({
        revoked: false,
        createdBy: 'user-123',
      });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('AND revoked = $1'),
        [false, 'user-123'],
      );
    });
  });

  describe('deleteApiKey', () => {
    it('should delete API key', async () => {
      const keyId = 'key-123';

      mockQuery.mockResolvedValue({
        rows: [{ id: keyId }],
        rowCount: 1,
      } as any);

      await repository.deleteApiKey(keyId);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM api_keys'),
        [keyId],
      );
    });

    it('should throw error if key not found', async () => {
      mockQuery.mockResolvedValue({
        rows: [],
        rowCount: 0,
      } as any);

      await expect(repository.deleteApiKey('nonexistent')).rejects.toThrow(
        'API key not found',
      );
    });
  });

  describe('rotateApiKey', () => {
    it('should rotate API key', async () => {
      const oldKeyId = 'key-123';
      const oldKey = {
        id: oldKeyId,
        name: 'Old Key',
        key_hash: 'old_hash',
        key_prefix: 'llmpe_old',
        permissions: ['policy:read', 'policy:write'],
        rate_limit: 500,
        expires_at: new Date('2025-12-31'),
        last_used_at: null,
        created_at: new Date(),
        created_by: 'user-123',
        revoked: false,
      };

      const newKey = {
        id: 'key-456',
        name: 'Old Key (rotated)',
        key_hash: 'new_hash',
        key_prefix: 'llmpe_new',
        permissions: ['policy:read', 'policy:write'],
        rate_limit: 500,
        expires_at: new Date('2025-12-31'),
        last_used_at: null,
        created_at: new Date(),
        created_by: 'user-123',
        revoked: false,
      };

      // Mock getApiKeyById
      mockQuery.mockResolvedValueOnce({
        rows: [oldKey],
        rowCount: 1,
      } as any);

      // Mock createApiKey
      mockQuery.mockResolvedValueOnce({
        rows: [newKey],
        rowCount: 1,
      } as any);

      // Mock revokeApiKey
      mockQuery.mockResolvedValueOnce({
        rows: [{ ...oldKey, revoked: true }],
        rowCount: 1,
      } as any);

      const result = await repository.rotateApiKey(oldKeyId);

      expect(result.apiKey.id).toBe('key-456');
      expect(result.rawKey).toBeDefined();
      expect(mockQuery).toHaveBeenCalledTimes(3); // get, create, revoke
    });

    it('should throw error if old key not found', async () => {
      mockQuery.mockResolvedValue({
        rows: [],
        rowCount: 0,
      } as any);

      await expect(repository.rotateApiKey('nonexistent')).rejects.toThrow(
        'API key not found',
      );
    });
  });

  describe('API Key Format', () => {
    it('should generate keys with correct prefix', async () => {
      const params: CreateAPIKeyParams = {
        name: 'Test Key',
        permissions: ['policy:read'],
      };

      mockQuery.mockResolvedValue({
        rows: [
          {
            id: 'key-123',
            name: params.name,
            key_hash: 'hash',
            key_prefix: 'llmpe_abc',
            permissions: params.permissions,
            rate_limit: 100,
            expires_at: null,
            last_used_at: null,
            created_at: new Date(),
            created_by: null,
            revoked: false,
          },
        ],
        rowCount: 1,
      } as any);

      const result = await repository.createApiKey(params);

      expect(result.rawKey).toMatch(/^llmpe_[a-f0-9]+$/);
    });

    it('should generate sufficiently long keys', async () => {
      const params: CreateAPIKeyParams = {
        name: 'Test Key',
        permissions: ['policy:read'],
      };

      mockQuery.mockResolvedValue({
        rows: [
          {
            id: 'key-123',
            name: params.name,
            key_hash: 'hash',
            key_prefix: 'llmpe_abc',
            permissions: params.permissions,
            rate_limit: 100,
            expires_at: null,
            last_used_at: null,
            created_at: new Date(),
            created_by: null,
            revoked: false,
          },
        ],
        rowCount: 1,
      } as any);

      const result = await repository.createApiKey(params);

      // llmpe_ (6 chars) + 64 hex chars (32 bytes) = 70 chars
      expect(result.rawKey.length).toBe(70);
    });
  });

  describe('Security', () => {
    it('should never return raw key after initial creation', async () => {
      const mockApiKey = {
        id: 'key-123',
        name: 'Test Key',
        key_hash: 'hashed_value',
        key_prefix: 'llmpe_abc',
        permissions: ['policy:read'],
        rate_limit: 100,
        expires_at: null,
        last_used_at: null,
        created_at: new Date(),
        created_by: null,
        revoked: false,
      };

      mockQuery.mockResolvedValue({
        rows: [mockApiKey],
        rowCount: 1,
      } as any);

      const retrieved = await repository.getApiKeyById('key-123');

      expect(retrieved).not.toHaveProperty('rawKey');
      expect(retrieved?.key_hash).toBeDefined();
    });

    it('should not include hash in list results', async () => {
      const mockKeys = [
        {
          id: 'key-1',
          name: 'Key 1',
          key_prefix: 'llmpe_abc',
          permissions: ['policy:read'],
          rate_limit: 100,
          expires_at: null,
          last_used_at: null,
          created_at: new Date(),
          created_by: null,
          revoked: false,
        },
      ];

      mockQuery.mockResolvedValue({
        rows: mockKeys,
        rowCount: 1,
      } as any);

      const result = await repository.listApiKeys();

      expect(result[0]).not.toHaveProperty('key_hash');
    });
  });
});
