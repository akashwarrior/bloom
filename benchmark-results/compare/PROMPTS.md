# Comparison prompts

Run each prompt once in Lovable and once in v0, exactly as written, in a new project each time.

- Paste the prompt as the first and only message. Do not attach images, pick templates or send follow-ups.
- Wait until the first generation finishes, then publish it (Lovable: Publish; v0: Deploy) and copy the public site URL, not the chat URL.
- Paste each URL into `benchmark-results/compare/urls.json` under the provider and prompt key.
- Bloom was given the same text through `benchmark/bench.mjs`, also as a single message.
- If a site blocks automated capture, save full-page screenshots yourself as `desktop.png` (1440 px wide) and `mobile.png` (390 px wide) in `benchmark-results/compare/<provider>/<prompt key>/`.

1. **Coffee roaster** (`01-coffee-roaster`)

   ```
   a website for a small-batch coffee roaster in Portland, Oregon
   ```

2. **Meeting notes app** (`02-meeting-notes`)

   ```
   a landing page for an AI meeting notes app that turns calls into searchable notes
   ```

3. **Furniture studio** (`03-furniture-studio`)

   ```
   a portfolio website for an independent furniture designer and maker
   ```

4. **Patagonia lodge** (`04-patagonia-lodge`)

   ```
   a website for a boutique wilderness lodge in Patagonia, Chile
   ```

5. **Bike co-op** (`05-bike-coop`)

   ```
   a website for a community-run bicycle repair co-op in Minneapolis
   ```

6. **Kestrel keyboard** (`06-kestrel-keyboard`)

   ```
   a product page for a mechanical keyboard called the Kestrel 65
   ```

7. **Lisbon film festival** (`07-lisbon-film`)

   ```
   a website for an independent film festival in Lisbon
   ```

8. **Freelance finance app** (`08-freelance-finance`)

   ```
   a website for a personal finance app for freelancers
   ```
