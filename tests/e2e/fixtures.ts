import { test as base, expect } from '@playwright/test';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * E2E test fixtures for database setup/teardown and utilities
 */

type TestFixtures = {
  dbClient: Awaited<ReturnType<typeof createAdminClient>>;
  resetDatabase: () => Promise<void>;
  createTestUser: (email: string, role: 'admin' | 'gestor' | 'vendedor') => Promise<string>;
  createTestLead: (data: any) => Promise<string>;
};

export const test = base.extend<TestFixtures>({
  dbClient: async ({}, use) => {
    const client = await createAdminClient();
    await use(client);
  },

  resetDatabase: async ({ dbClient }, use) => {
    const reset = async () => {
      try {
        // Clear test data
        await dbClient.from('lead_notes').delete().eq('created_by', 'test');
        await dbClient.from('leads').delete().eq('source', 'manual');
        // Note: Don't delete profiles or auth users during tests as it's risky
      } catch (error) {
        console.error('Reset database error:', error);
      }
    };
    await use(reset);
  },

  createTestUser: async ({ dbClient }, use) => {
    const createUser = async (email: string, role: 'admin' | 'gestor' | 'vendedor') => {
      try {
        // Sign up new user
        const { data: authData, error: authError } = await dbClient.auth.admin.createUser({
          email,
          password: 'testpass123',
          email_confirm: true,
        });

        if (authError) throw authError;
        if (!authData.user) throw new Error('User creation failed');

        // Create profile
        await dbClient.from('profiles').insert({
          id: authData.user.id,
          email,
          name: email.split('@')[0],
          role,
          sector: 'vendas',
          active: true,
        });

        return authData.user.id;
      } catch (error) {
        console.error('Create test user error:', error);
        throw error;
      }
    };

    await use(createUser);
  },

  createTestLead: async ({ dbClient }, use) => {
    const createLead = async (data: any) => {
      try {
        const { data: leadData, error } = await dbClient
          .from('leads')
          .insert({
            name: data.name || 'Test Lead',
            phone: data.phone || '11987654321',
            email: data.email || 'test@example.com',
            source: data.source || 'manual',
            pipeline_id: data.pipeline_id,
            stage_id: data.stage_id,
            sector: data.sector || 'vendas',
            owner_id: data.owner_id,
            position: 0,
          })
          .select('id')
          .single();

        if (error) throw error;
        return leadData.id;
      } catch (error) {
        console.error('Create test lead error:', error);
        throw error;
      }
    };

    await use(createLead);
  },
});

export { expect };
