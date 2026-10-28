# Meta Spend Tracker

A private dashboard with two tabs. **Spend & leads** shows every active Meta campaign across your client ad accounts, with today's spend, yesterday's spend, month-to-date spend, leads, and cost per lead for each campaign and each client, plus a daily spend chart and a projected month-end total. **Revenue** shows the revenue those ads generated for each client, pulled from deals marked Won in GoHighLevel, with return on ad spend, close rate, and cost per closed job.

It talks directly to Meta's Marketing API using a single System User token, so there is no third-party connector and no monthly fee. On Vercel's free Hobby plan it costs nothing to run.

Until you add a token, the dashboard shows sample data so you can see the layout.

## How the data stays current

The page pulls from Meta at most once an hour. The first visit after the hour fetches fresh numbers; anyone loading the page within that hour gets the cached version, which keeps you well inside Meta's rate limits even with dozens of accounts. The **Refresh now** button clears the cache and pulls immediately.

The month-to-date totals come from account-level insights, not just active campaigns. If you paused a campaign on the 10th, the spend it ran up before then still counts toward the month, and the client card notes how much of the total came from campaigns that are no longer running.

## Looking at past months

Both tabs have a month picker next to the tabs. Use the arrows or the dropdown to go back up to three years (as far as Meta keeps ad data), and **This month** to jump back. Switching tabs keeps the month you picked, and on the Revenue tab you can click any bar in the six-month chart to open that month.

Each month starts fresh on the 1st automatically. A past month shows the full month as it ended:

* **Spend & leads:** total spend, daily average, biggest day, leads, cost per lead, and every campaign that ran that month, including ones that are paused or deleted now. Budgets and Today/Yesterday only appear for the current month, since they don't apply to a finished one.
* **Revenue:** jobs closed that month, measured against that month's ad spend and leads, with the full list of that month's closed jobs.

Clients that didn't run ads in a given month are left out of that month. Finished months are cached for a day instead of an hour since they don't change, which keeps the dashboard fast as you click back through history.

The address bar changes as you pick months (for example `?month=2026-08`), so you can bookmark a specific month.

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

## Revenue tab (GoHighLevel → Google Sheet → dashboard)

The Revenue tab shows what your ads actually made each client. The top row is built for your whole book of clients: total revenue, change against the same point last month, overall return on ad spend, ad spend, how many clients are hitting your ROAS target (with the weakest one named), and your best performer. The client table underneath has the per-client numbers that only make sense one client at a time: leads, jobs, close rate, average job value, cost per job, and ROAS. There's also a six-month trend and the list of closed jobs.

The ROAS target defaults to 3×. To change it, add `ROAS_TARGET` in Vercel (for example `4`) and redeploy. ROAS pills in the client table turn red below the target.

It works like this. When an opportunity is marked **Won** in a client's GoHighLevel pipeline, a workflow sends the job to a Google Sheet. The sheet has a small script attached that adds the row and serves as a private API, protected by a secret key. The dashboard reads the sheet with that key every hour, the same as the Meta data.

### 1. Create the sheet and its API key (10 minutes)

1. Create a new Google Sheet in your Motion Media Google account and name it something like "Motion Media Revenue."
2. Open **Extensions → Apps Script**. Delete whatever is in the editor, paste in the entire contents of `google-apps-script/Code.gs` from this project, and click the save icon.
3. In the function dropdown at the top of the editor, choose **setup** and click **Run**. Google will ask you to authorize the script. Because it's your own script and not a published app, Google shows an "unverified app" warning; click **Advanced**, then **Go to (your project name)**, then **Allow**.
4. When it finishes, the **Execution log** at the bottom shows `Your API key: ...`. Copy that key. The sheet now has a **Revenue** tab with the column headers filled in.
5. Click **Deploy → New deployment**. Click the gear icon next to "Select type" and choose **Web app**. Set **Execute as** to **Me** and **Who has access** to **Anyone**, then click **Deploy**. Copy the **Web app URL** (it ends in `/exec`).

"Anyone" sounds open, but the script refuses every request that doesn't include your key, so the URL alone gets nobody anywhere.

### 2. Send won jobs from GoHighLevel (5 minutes per client, or once with a snapshot)

In a client's sub-account, go to **Automation → Workflows** and create a new workflow from scratch.

**Trigger:** choose **Opportunity Status Changed** and add a filter so it only fires when the status changes to **Won**. If the sub-account has more than one pipeline, add a pipeline filter too.

If you only want revenue from your ads (recommended, so ROAS is honest), add a filter on the opportunity or contact source so it only fires for Facebook and Instagram leads. Leave it off if every opportunity in that sub-account comes from your ads anyway.

**Action:** add a **Webhook** action.

* **Method:** POST
* **URL:** your Web app URL with `?key=` and your API key on the end, for example `https://script.google.com/macros/s/AKfy.../exec?key=YOUR_KEY`
* **Custom Data:** add these keys, choosing the values from GHL's merge-field picker:

| Key | Value |
| --- | --- |
| `client` | The client's name. Type it exactly as the ad account is named in Meta, or use the location name merge field. |
| `amount` | The opportunity's value (monetary value) |
| `customer` | The contact's full name |
| `source` | The opportunity or contact source |
| `opportunity_id` | The opportunity's ID, so a deal marked Won twice is only counted once |
| `ad_account` | Optional. The client's Meta ad account ID, if the name in GHL doesn't match the name in Meta. |

Save and publish the workflow. To test it, mark a test opportunity Won with a value filled in; a new row should appear on the sheet within a few seconds. Delete the test row afterward.

Build the workflow once in one sub-account, then copy it to the others or include it in your snapshot. The only thing that changes per client is the `client` value, and if you use the location name merge field, nothing changes at all.

**The opportunity value has to be filled in when a deal is marked Won.** A Won opportunity with no value is skipped, since there's no revenue to record. Make that part of how your clients close deals in GHL.

### 3. Connect the sheet to the dashboard

In your Vercel project, go to **Settings → Environment Variables** and add:

| Variable | Value |
| --- | --- |
| `REVENUE_SHEET_URL` | The Web app URL, without the `?key=` part |
| `REVENUE_SHEET_KEY` | The API key from step 1 |

Redeploy, and the Revenue tab switches from sample data to your real closed jobs.

### Good to know

**Matching clients.** Each row is matched to a Meta ad account by the `ad_account` ID if present, otherwise by name. Name matching ignores capitalization, punctuation, and words like LLC or Inc, so "Gateway Home Services LLC" in GHL matches "Gateway Home Services" in Meta. A row that doesn't match anything still shows up, flagged "No matching Meta ad account," and is left out of ROAS and close rate so those stay accurate. Adding the `ad_account` value in that client's workflow fixes it.

**Clients that don't report revenue** are listed under the client table and left out of the totals, so one client without GHL tracking doesn't drag down your overall ROAS.

**Corrections.** The sheet is the source of truth. If a job is refunded or entered wrong, edit or delete that row and hit Refresh now on the dashboard. You can also add jobs by hand: fill in Date, Client, and Amount at minimum.

**Close rate** compares jobs closed this month to leads generated this month. A deal closed on the 3rd may come from a lead in the previous month, so treat it as a trend, not an exact conversion rate.

**If the key ever leaks,** open the script editor, go to **Project Settings → Script Properties**, delete `API_KEY`, and run `setup` again for a new one. Then update the key in your GHL workflows and in Vercel.

**If you change the script later,** use **Deploy → Manage deployments**, edit the existing deployment, and choose **New version**. That keeps the same URL so nothing else needs updating.

## Adding a new client

Get their ad account into your Business portfolio (step 1), then assign it to the System User with View performance access (step 3). It shows up on the dashboard on the next refresh. There's nothing to change in the code or in Vercel. For the Revenue tab, add the won-opportunity workflow to their GHL sub-account.

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

`lib/meta.ts` handles every Meta API call: finding the ad accounts, pulling active campaigns and their budgets (rolling up ad set budgets for campaigns that use them), and fetching today, yesterday, month-to-date, and daily spend. `app/page.tsx` is the Spend & leads tab and `app/revenue/page.tsx` is the Revenue tab. `lib/revenue.ts` reads the revenue sheet and matches rows to ad accounts, and `google-apps-script/Code.gs` is the script that lives in the Google Sheet. `middleware.ts` handles the password, and `lib/demo.ts` is the sample data.
