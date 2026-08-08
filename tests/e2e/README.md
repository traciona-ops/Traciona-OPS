# E2E Tests

End-to-end tests using Playwright for critical flows in Traciona Eco Sistema.

## Setup

### Prerequisites

- Node.js 18+
- Playwright browsers installed: `npx playwright install`
- Running Next.js dev server: `npm run dev`

### Environment Variables

Create a `.env.local` file with test credentials:

```env
# Auth test users (use real test accounts from Supabase)
TEST_ADMIN_EMAIL=admin@test.local
TEST_ADMIN_PASSWORD=testpass123

TEST_MANAGER_EMAIL=manager@test.local
TEST_MANAGER_PASSWORD=testpass123

TEST_VENDOR_EMAIL=vendor@test.local
TEST_VENDOR_PASSWORD=testpass123

TEST_INACTIVE_EMAIL=inactive@test.local
TEST_INACTIVE_PASSWORD=testpass123

# Database (for direct DB fixture operations, optional)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ADMIN_KEY=your-admin-key
```

## Running Tests

```bash
# Run all tests
npm run test:e2e

# Run with UI (headed mode with interactive controls)
npm run test:e2e:ui

# Run in headed mode (browser visible)
npm run test:e2e:headed

# Run with debug mode (browser + inspector)
npm run test:e2e:debug

# Run specific test file
npx playwright test tests/e2e/auth.spec.ts

# Run single test
npx playwright test tests/e2e/auth.spec.ts -g "Admin can login"
```

## Test Structure

### `auth.spec.ts`
- Login flow for different roles (admin, manager, vendor)
- Role-based access control
- Inactive user handling
- Logout flow

### `lead.spec.ts`
- Create a new lead
- Move lead to different pipeline stage
- Add note to lead
- Delete lead
- Search and filter leads
- Edit lead details

### `whatsapp.spec.ts`
- Webhook payload validation
- Create lead from webhook message
- Link message to existing lead
- Rate limiting
- Malformed payload handling

## Test Fixtures

Custom fixtures are available in `fixtures.ts`:
- `dbClient` - Supabase admin client for direct DB operations
- `resetDatabase()` - Clear test data before/after tests
- `createTestUser()` - Create temporary test user with role
- `createTestLead()` - Create temporary test lead

## Best Practices

1. **Test Isolation**: Each test should be independent and not rely on other tests
2. **Cleanup**: Use `test.beforeEach()` and `test.afterEach()` to manage state
3. **Selectors**: Prefer semantic selectors (role, label) over CSS classes
4. **Waits**: Use explicit waits with timeouts, don't rely on arbitrary delays
5. **Screenshots**: Playwright captures screenshots on failure automatically
6. **Flakiness**: If a test is flaky, add explicit waits or retry logic

## Debugging

### Generate Report
```bash
npx playwright show-report
```

### Run with Trace
Traces are automatically captured on first retry; view with:
```bash
npx playwright show-trace trace.zip
```

### Inspect Element Locators
```bash
npx playwright codegen http://localhost:3000
```

## CI Integration

Add to GitHub Actions or your CI provider:

```yaml
- name: Run E2E Tests
  run: npm run test:e2e
  
- name: Upload Report
  if: always()
  uses: actions/upload-artifact@v3
  with:
    name: playwright-report
    path: playwright-report/
```

## Troubleshooting

### Tests timeout on login
- Verify test credentials exist in Supabase
- Check that Supabase auth is working: `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are set
- Ensure dev server is running on `http://localhost:3000`

### WebServer connection failed
- Make sure `npm run dev` is running
- Check `playwright.config.ts` baseURL matches your dev server

### Database connection errors in fixtures
- Set `SUPABASE_ADMIN_KEY` environment variable
- Verify admin key has proper permissions

### Tests fail in CI but pass locally
- Use `--workers=1` to disable parallelization
- Set `reuseExistingServer: false` in CI
- Check time zone differences affecting test data

## Performance Notes

- Tests are configured to run sequentially (`workers: 1`) to avoid race conditions
- Full test suite should complete in 2-5 minutes
- Individual test files can run in parallel if they use separate data

## Future Enhancements

- [ ] Add performance benchmarks (LCP, FID, CLS)
- [ ] Add accessibility audit tests
- [ ] Add visual regression tests
- [ ] Mock external APIs (WhatsApp, Asaas, etc.)
- [ ] Add database seeding fixtures
