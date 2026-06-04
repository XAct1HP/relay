# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: sell.spec.ts >> Create Listing (Sell) >> Step 1: Can fill shoe details and proceed
- Location: e2e\sell.spec.ts:55:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('heading', { name: /sell.*shoes/i })
Expected: visible
Timeout: 10000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 10000ms
  - waiting for getByRole('heading', { name: /sell.*shoes/i })

```

```
Error: apiRequestContext._wrapApiCall: ENOENT: no such file or directory, open 'C:\Users\trick\OneDrive\Documents\Claude\Projects\Relay\relay-app\test-results\.playwright-artifacts-1\traces\0524011b43faa2f324e1-d1f1073710b603d6564b-retry1.trace'
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - alert [ref=e2]: Relay | The Sneaker Marketplace
  - generic [ref=e4]:
    - generic [ref=e5]:
      - img "Relay" [ref=e6]
      - paragraph [ref=e7]: Sign in to your account
    - generic [ref=e8]:
      - generic [ref=e9]:
        - generic [ref=e10]:
          - generic [ref=e11]: Email
          - textbox "Email" [ref=e12]:
            - /placeholder: you@example.com
        - generic [ref=e13]:
          - generic [ref=e14]: Password
          - textbox "Password" [ref=e15]:
            - /placeholder: ••••••••
        - button "Sign In" [ref=e16] [cursor=pointer]
      - paragraph [ref=e18]:
        - text: Don't have an account?
        - link "Sign up" [ref=e19] [cursor=pointer]:
          - /url: /auth/signup
```