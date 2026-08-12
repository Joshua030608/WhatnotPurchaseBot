# Whatnot Purchase Bot

A permissioned Chrome Manifest V3 demonstration that watches a Whatnot live auction and interacts with the visible bidding UI. It does not use Whatnot's native Max Bid feature and does not call a private purchase or bidding endpoint.

The extension is intentionally fail-closed. Test mode is enabled by default, live bidding requires an explicit confirmation, and uncertain UI states stop the bot instead of retrying blindly.

## What it does

- Lets the user enter a maximum bid in the auction's displayed currency.
- Arms only the current browser tab.
- Detects the visible current price, next valid bid, bid button, auction status, and winning/outbid state.
- Clicks the normal Whatnot bid button only when the next valid bid is at or below the configured maximum.
- Uses Whatnot's current `show-bid-button` press-and-release interaction instead of relying on a generic click.
- Waits for a positive outbid signal before bidding again, preventing the extension from bidding against itself.
- Supports bid confirmation dialogs when the exact amount can be verified.
- Provides test mode, browser notifications, an in-page status panel, an emergency stop, diagnostics, and an activity log.
- Includes a packaged simulator that exercises the same detection, decision, and click code without contacting Whatnot.

## Safety behavior

The extension will not bid when any of these conditions apply:

- The current tab has not been explicitly armed.
- The maximum is missing or invalid.
- The active auction or visible bid control cannot be identified.
- The next valid bid cannot be read from the page.
- The next valid bid is greater than the maximum.
- Whatnot indicates that the user is already winning.
- The extension has bid during the current auction and Whatnot has not positively indicated that the user was outbid.
- A confirmation dialog appears but its amount cannot be matched to the intended bid.
- The outcome of a UI click cannot be verified.

Changing between test and live mode, reloading the page, or navigating to another page requires the bot to be armed again. The in-page panel provides a Stop button while the bot is armed.

The maximum applies only to the visible auction bid. Shipping, taxes, duties, and other charges are not included.

## Install in Chrome

No build step or package installation is required.

1. Open `chrome://extensions` in Chrome.
2. Turn on **Developer mode**.
3. Select **Load unpacked**.
4. Choose this repository folder:

   ```text
   /Users/joshuaford/Documents/Dev/WebDev/WhatnotPurchaseBot
   ```

5. Pin **Whatnot Purchase Bot** to the Chrome toolbar.
6. Reload any Whatnot tabs that were already open when the extension was installed.

When source files change, return to `chrome://extensions`, press the extension's reload button, and reload the Whatnot tab.

## Use test mode on Whatnot

1. Sign in to Whatnot and open the live show that will be used for the approved test.
2. Wait for a live auction and confirm that the normal bid button is visible.
3. Open the extension.
4. Enter the maximum bid. Enter it in the seller's displayed currency.
5. Leave **Test mode** enabled.
6. Select **Start test mode**.
7. Keep the live show tab open.

When a qualifying bid is detected, the extension records a `Would bid` event, displays a browser notification, and does not click the bid button. The page overlay shows the detected current price, next bid, maximum, and current decision.

After a simulated bid, each externally increased next-bid amount produces another `Would bid` event until the next bid exceeds the maximum. Test mode never clicks the bid button, so it does not require Whatnot to show a real winning-to-outbid transition for the simulated bidder. Starting a new auction resets that state.

## Use live mode

Live mode can place binding bids that may result in a purchase.

1. Complete the test-mode checks for the same Whatnot page and account first.
2. Open the extension and turn off **Test mode**.
3. Confirm the live-mode warning.
4. Recheck the maximum bid.
5. Select **Start live bidding**.

The extension re-reads the next bid immediately before interacting with the button. If a supported confirmation dialog appears, it clicks the confirmation only when the displayed amount exactly matches the intended bid. It reports success only after Whatnot shows the user winning or displays an explicit bid confirmation. Price movement by another bidder is not treated as proof that the extension's bid succeeded.

If the result is uncertain, the extension stops. It does not retry.

## Use the simulator

The simulator is the safest way to verify the complete extension flow.

1. Open the extension popup.
2. Select **Open simulator**.
3. Set a maximum and leave **Test mode** enabled.
4. Select **Arm bot**.
5. Observe the `Would bid` notification and event log.
6. Select **Competitor outbids** to verify that another eligible decision occurs.
7. Start a new auction or push the next bid above the maximum to verify the stop conditions.

To test direct clicks locally, turn off **Test mode** in the simulator and arm it again. The simulated bid button updates to a winning state when clicked. Enable **Require bid confirmation** to exercise the exact-amount confirmation path.

The simulator loads the production content script, adapter, decision engine, settings, overlay, service worker, and notification flow. Only the auction page itself is simulated.

## Calibrate against Whatnot's live UI

Whatnot's logged-in live-auction DOM is not part of its public API and can change independently of this repository. The adapter includes semantic text matching and common `data-testid`, ARIA, and data-attribute patterns, but a live test should confirm the selectors before enabling real bids.

With a live auction visible:

1. Open the extension.
2. Confirm that the status says **Auction detected** and that Current and Next show the correct amounts.
3. Run test mode through at least one complete auction and one outbid event.
4. Select **Copy diagnostics** if detection is missing or incorrect.
5. Review the copied JSON. It contains the page URL, detected auction fields, and limited metadata for visible bid-like buttons. It does not include cookies, payment data, authentication tokens, or a page HTML dump.

Selector adjustments belong in [`content/whatnot-adapter.js`](content/whatnot-adapter.js). Prefer stable attributes supplied or approved by Whatnot, such as dedicated `data-testid` values. Do not select elements by generated CSS class names.

The most useful integration contract for Whatnot to provide is:

- A stable selector for the active auction container.
- Stable selectors for current price and next valid bid.
- A stable selector for the primary incremental bid button.
- Explicit machine-readable `winning`, `outbid`, `active`, and `ended` states.
- A stable auction or listing identifier.
- The exact expected confirmation-dialog behavior.

## Decision model

```text
Disarmed
   │ user arms current tab
   ▼
Monitor active auction
   │ next bid is known and <= maximum
   ▼
Test mode: notify        Live mode: click visible Bid control
   │                                  │
   └──────────────┬───────────────────┘
                  ▼
       Wait for winning/outbid state
                  │
        confirmed outbid and still
          within maximum → bid again
```

In live mode, an increase in price alone is not treated as an outbid. This is deliberate: bidding again based only on a price change could make the bot bid against itself. In test mode, a higher visible next bid is treated as a simulated outbid because no bid was actually submitted.

## Activity and privacy

Settings and the latest 75 events are stored locally through `chrome.storage.local`. Stored event details are limited to bid-decision metadata such as auction title, prices, mode, and timestamp.

The extension:

- Does not request or store Whatnot credentials.
- Does not read payment-card data.
- Does not inspect browser cookies or session storage.
- Does not send analytics or telemetry.
- Does not inject remotely hosted code.
- Has host access only to `https://whatnot.com/*` and `https://www.whatnot.com/*`.

## Development and verification

The extension has no runtime or build dependencies. Node.js is optional and is used only for tests and static validation.

```bash
npm test
npm run validate
```

`npm test` covers price parsing and bid-decision safety rules. `npm run validate` parses the Manifest V3 file, checks every referenced asset, and syntax-checks the JavaScript files.

## Project structure

```text
background/           Notifications, badge state, and activity storage
content/              Whatnot DOM adapter, state machine, and page overlay
icons/                Extension artwork
popup/                Toolbar popup
shared/               Money, settings, and pure decision logic
simulator/            Packaged local auction simulator
tests/                Dependency-free Node test suite
manifest.json         Chrome Manifest V3 configuration
```

## Known limitations

- DOM automation depends on the structure of Whatnot's current logged-in web interface.
- A site can reject programmatic clicks or introduce an interaction that requires adapter changes.
- Very fast sudden-death auctions are subject to page rendering, browser scheduling, and network latency.
- Browser notifications depend on operating-system and Chrome notification settings.
- Live mode requires a positive outbid signal before a repeat bid. If Whatnot does not expose one, it will safely wait rather than infer from price alone.
- The bot operates only while the authorized Whatnot page is open in Chrome.

For a controlled demonstration, keep the Whatnot tab in the foreground, use a dedicated approved test account and auction, begin in test mode, and keep the in-page Stop button visible.
