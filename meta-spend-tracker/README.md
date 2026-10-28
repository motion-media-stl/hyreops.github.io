# Meta Spend Tracker

A private dashboard that shows every active Meta campaign across your client ad accounts, with today's spend, yesterday's spend, month-to-date spend, leads, and cost per lead for each campaign and each client, plus a daily spend chart and a projected month-end total for everything combined.

It talks directly to Meta's Marketing API using a single System User token, so there is no third-party connector and no monthly fee. On Vercel's free Hobby plan it costs nothing to run.

Until you add a token, the dashboard shows sample data so you can see the layout.

## How the data stays current

The page pulls from Meta at most once an hour. The first visit after the hour fetches fresh numbers; anyone loading the page within that hour gets the cached version, which keeps you well inside Meta's rate limits even with dozens of accounts. The **Refresh now** button clears the cache and pulls immediately.

The month-to-date totals come from account-level insights, not just active campaigns. If you paused a campaign on the 10th, the spend it ran up before then still counts toward the month, and the client card notes how much of the total came from campaigns that are no longer running.

## How leads are counted

Leads match what Ads Manager shows for lead campaigns: Instant Form leads and website leads tracked by the Meta pixel, counted once each, using each ad account's default attribution setting. Each campaign shows its month-to-date leads with yesterday's count underneath.

Cost per lead only uses spend from campaigns that actually produced leads, so a client's awareness or retargeting spend doesn't inflate the number. Campaigns with no leads show a dash.

If a client tracks leads with a custom conversion instead of the standard Lead event (for example, a "Booked Call" custom conversion), those won't be counted here. That's a small change in `leadsFrom()` in `lib/meta.ts` if you need it.

## One-time setup (about 20 minutes)

### 1. Make sure each client's ad account is in your Business portfolio

In Meta Business Settings, go to **Accounts → Ad accounts**. Every client account you want on the dashboard needs to be listed there, either owned by your business or shared with it as a partner. If a client account isn't there yet, request access from that page and have the client approve it.

### 2. Create a Meta app

Go to developers.facebook.com, open **My Apps**, and create a new app. Choose the **Business** app type and connect it to your Business portfolio when asked. You don't need to submit it for review; development mode is fine for reading accounts your own business manages. Add the **Marketing API** product to the app if it isn't added automatically.

### 3. Create a System User and assign your ad accounts

Back in Business Settings, go to **Users → System users** and add one (name it something like "Spend Tracker"). An Employee role is enough.

With the System User selected, click **Assign assets**, choose **Ad accounts**, select every client account, and give it **View performance** access only. The dashboard never changes anything, so it shouldn't have permission to.

### 4. Generate the token

Still on the System User, click **Generate new token**. Pick the app from step 2, set the expiration to **Never**, and check the **ads_read** permission. Copy the token somewhere safe right away, because Meta only shows it once.

Treat this token like a password. It goes into Vercel's environment variables and nowhere else, never into the code or a message.

### 5. Deploy to Vercel

Push this folder to a private GitHub repository, then in Vercel choose **Add New → Project** and import it. Before the first deploy, open **Environment Variables** and add:

| Variable | Value |
| --- | --- |
| `META_ACCESS_TOKEN` | The token from step 4 |
| `DASHBOARD_PASSWORD` | A password you'll use to log in |

Deploy. When you open the site, your browser asks for a username and password; type anything as the username and your `DASHBOARD_PASSWORD` as the password. The site refuses to load your real data until that password is set.

The optional variables in `.env.example` let you limit the dashboard to specific account IDs, change the time zone used for "today" and the projection (it defaults to Central), or pin a different Marketing API version.

## Adding a new client

Get their ad account into your Business portfolio (step 1), then assign it to the System User with View performance access (step 3). It shows up on the dashboard on the next refresh. There's nothing to change in the code or in Vercel.

If you set `META_AD_ACCOUNT_IDS`, you'll need to add the new ID there instead, which is why leaving it blank is the easier default.

## Maintenance

Meta releases a new Marketing API version every few months and retires old ones on a rolling basis. The dashboard is pinned to v26.0. When Meta announces that version's retirement (they email app admins), change `META_API_VERSION` in Vercel to the current version and redeploy. If an account ever shows "Couldn't load this account" with an error, the message comes straight from Meta and usually points to a permissions change on that account.

## Running it locally

```
npm install
cp .env.example .env.local   # then fill in the values
npm run dev
```

Open http://localhost:3000.

## What's in here

`lib/meta.ts` handles every Meta API call: finding the ad accounts, pulling active campaigns and their budgets (rolling up ad set budgets for campaigns that use them), and fetching today, yesterday, month-to-date, and daily spend. `app/page.tsx` is the dashboard itself, `middleware.ts` handles the password, and `lib/demo.ts` is the sample data.
