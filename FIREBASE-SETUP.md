# 🔥 Firebase Setup — Going Live

A step-by-step guide to switch Irmaan ERP from the in-memory mock adapter to real Firebase. Once done, your app will:

- Run on the public internet (free Vercel hosting)
- Save data centrally (Firestore)
- Support multiple users on different devices in real time
- Authenticate with real email/password
- Auto-assign DO/PO/INV numbers server-side
- Be backed up automatically by Google

**Time required:** ~30-45 minutes for first-time setup.
**Cost:** $0 to start. Firebase's free tier covers ~50K reads / 20K writes per day and 1 GB storage — plenty for a small trading business. Vercel hosting is free.

---

## Part 1 — Create your Firebase project (10 min)

### 1.1 Sign in to Firebase
Go to **https://console.firebase.google.com** and sign in with your Google account.

### 1.2 Create a new project
- Click **"Add project"**
- Name it: `irmaan-erp` (or anything you like)
- Disable Google Analytics (not needed for an internal tool — you can enable later)
- Click **Create project** → wait ~30 seconds → **Continue**

### 1.3 Register a Web App
In the project overview page:
- Click the **`</>`** Web icon (next to iOS/Android)
- App nickname: `Irmaan ERP Web`
- ❌ Do NOT check "Also set up Firebase Hosting" — we'll use Vercel instead
- Click **Register app**

Firebase shows you a `firebaseConfig` object that looks like this:
```js
const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "irmaan-erp.firebaseapp.com",
  projectId: "irmaan-erp",
  storageBucket: "irmaan-erp.appspot.com",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:abc123..."
};
```

**📋 Copy this** — you'll paste it in a moment. Click **Continue to console**.

### 1.4 Enable the services we need

In the left sidebar of the Firebase console:

**Authentication:**
- Click **Build → Authentication**
- Click **Get started**
- Under **Sign-in method**, click **Email/Password**
- Toggle **Enable** → **Save**

**Firestore Database:**
- Click **Build → Firestore Database**
- Click **Create database**
- Choose **Start in production mode** (we'll deploy rules in a moment)
- Pick a location close to your users (e.g. `eur3 (Europe-west)` or `nam5 (us-central)` — **this cannot be changed later**)
- Click **Enable**

**Storage:** *(optional now, used for future file attachments)*
- Click **Build → Storage** → **Get started** → **Next** → **Done**

---

## Part 2 — Configure the app (5 min)

### 2.1 Create `.env.local`
In the `irmaan-erp/` folder, copy `.env.example` to `.env.local`:

```bash
cd irmaan-erp
cp .env.example .env.local
```

Open `.env.local` in your editor and paste the values from your `firebaseConfig`:

```env
NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSy...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=irmaan-erp.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=irmaan-erp
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=irmaan-erp.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=1234567890
NEXT_PUBLIC_FIREBASE_APP_ID=1:1234567890:web:abc123...

NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_COMPANY_NAME=Irmaan Trading Company
```

> ⚠️ **`.env.local` is git-ignored** — it won't be committed. Good.

### 2.2 Switch the data adapter
Open `src/services/index.ts` — change:

```ts
import { mockAdapter } from "./mockAdapter";
// import { firebaseAdapter } from "./firebaseAdapter";

export const dataAdapter = mockAdapter;
```

…to:

```ts
// import { mockAdapter } from "./mockAdapter";
import { firebaseAdapter } from "./firebaseAdapter";

export const dataAdapter = firebaseAdapter;
```

**That's the entire code change.** Every page in the app already reads from `dataAdapter` — they don't care which adapter is active.

---

## Part 3 — Deploy security rules + Cloud Functions (10 min)

### 3.1 Install the Firebase CLI
```bash
npm install -g firebase-tools
firebase login           # opens browser to authenticate
```

### 3.2 Link your local code to your Firebase project
From the `irmaan-erp/` folder:
```bash
firebase use --add
```
Select your `irmaan-erp` project, give it an alias like `default`.

### 3.3 Deploy Firestore security rules
```bash
firebase deploy --only firestore:rules
```

This pushes the `firestore.rules` file we wrote — which:
- Forces login for everything except `/verify/*`
- Validates roles (admin, manager, sales, warehouse)
- Prevents clients from spoofing `doNumber`, `invoiceNumber`, etc.
- Makes the `counters/` and `activity_logs/` collections server-write-only

### 3.4 Deploy Cloud Functions *(optional but recommended)*
```bash
cd functions
npm install
cd ..
firebase deploy --only functions
```

This deploys:
- `assignDONumber` — stamps `DO-00001`, `DO-00002`… atomically when a DO is created
- `assignPONumber`, `assignInvoiceNumber` — same for POs and invoices
- `auditDO` — writes to `activity_logs` whenever a DO changes

> 💡 **Cloud Functions require a Blaze (pay-as-you-go) plan.** You won't be billed unless you exceed the generous free tier (2M invocations/month). If you want to skip this for now, the app still works — the client-side adapter generates document numbers using a Firestore transaction, which is good enough for low-traffic businesses.

### 3.5 Create your first admin user

Firebase Auth doesn't auto-create the user profile that our `users/` collection expects. Do this once:

**Option A — via Firebase Console (quickest):**
1. **Authentication → Users → Add user**
   - Email: `admin@irmaan.co`
   - Password: (choose a real password)
   - Copy the auto-generated **User UID**
2. **Firestore → Start collection** named `users`
   - Document ID: paste the UID
   - Add fields:
     ```
     email: "admin@irmaan.co" (string)
     displayName: "Your Name" (string)
     role: "admin" (string)
     active: true (boolean)
     createdAt: (timestamp — click the clock icon for "Now")
     ```

That's your admin login.

**Option B — via a quick script** (better for multiple users):
Create `scripts/seed-users.ts` and run it once with `tsx`. Not included here, but easy if you need it later — ask anytime.

---

## Part 4 — Run locally against Firebase (2 min)

```bash
npm run dev
```

Open http://localhost:3000, log in with `admin@irmaan.co` and the password you just set. You'll see an empty system — that's expected, because Firestore is fresh.

**Create your first records** to verify everything works:
1. Customers → add 1-2 customers
2. Products → add a couple of products
3. Delivery Orders → New D.O → fill in items + loading details → Issue
4. Open the DO → click **Download PDF** — the file you get has live data from Firestore
5. Open the **verify QR URL** on your phone → see the live document
6. Open the app on a second laptop/phone with the same login → see all the data sync 🎉

---

## Part 5 — Deploy to the public web (10 min)

The fastest path is **Vercel** (built by the Next.js team, free tier is generous).

### 5.1 Push your code to GitHub
```bash
git init
git add .
git commit -m "Initial commit"
# Create a private repo on github.com, then:
git remote add origin git@github.com:YOUR_USERNAME/irmaan-erp.git
git branch -M main
git push -u origin main
```

> ⚠️ Confirm `.env.local` is **NOT** in your commit (it's in `.gitignore` — verify with `git status`).

### 5.2 Deploy on Vercel
1. Go to **https://vercel.com/new**
2. Sign in with GitHub
3. Import your `irmaan-erp` repo
4. **Framework Preset:** Next.js (auto-detected)
5. Expand **Environment Variables** — paste each `NEXT_PUBLIC_FIREBASE_*` variable from your `.env.local`
6. Click **Deploy** → wait ~2 minutes

You'll get a live URL like `https://irmaan-erp.vercel.app`. That's your production app.

### 5.3 Authorize the Vercel domain in Firebase
- Firebase Console → **Authentication → Settings → Authorized domains**
- Click **Add domain** → paste your Vercel URL (e.g. `irmaan-erp.vercel.app`)

Without this, login will fail on the live site with "auth/unauthorized-domain".

### 5.4 Update the QR base URL
Update Vercel env var `NEXT_PUBLIC_APP_URL` to your production URL. The QR codes embed this — important for verification to work when scanned.

---

## Part 6 — Add your staff (5 min per person)

For each staff member:
1. Firebase Console → **Authentication → Add user** → email + temp password
2. Firestore → `users` collection → new doc with their UID → set `role` to one of:
   - `admin` — can do everything
   - `manager` — can create POs, record payments, view reports
   - `sales` — can create DOs and invoices
   - `warehouse` — can manage stock, create DOs, receive POs
3. Send them the URL + temp password → they sign in and change it under the **Topbar → user menu** (or directly via Firebase Auth's password reset).

---

## 🎉 You're live

You now have:
- A production ERP on the public internet
- Real user accounts with role-based access
- Centralized data accessible from any device
- Cryptographically signed document numbers
- Automatic backups via Firebase
- Server-enforced security rules

### Monthly cost expectations

For a small trading business (3-10 users, <1000 documents/month):
- **Firebase** (Spark/free plan): **$0**
- **Vercel** (Hobby plan): **$0**
- **Domain name** (optional, e.g. `irmaan-trading.com`): ~$12/year

Bigger usage (50K+ docs/month) starts costing $5-30/month. You'll see usage on the Firebase console — set a budget alert if you want to be safe.

---

## ⚠️ Common gotchas

| Problem | Fix |
|---|---|
| "auth/unauthorized-domain" on the live site | Add your domain in Firebase → Auth → Settings → Authorized domains |
| Login works, but pages show "Loading…" forever | The `users/{uid}` Firestore doc is missing for this user — create it with their UID |
| "Missing or insufficient permissions" | Either the user's `users/{uid}` doc is missing the `role` field, or the rule doesn't allow that role — check `firestore.rules` |
| DO numbers come out as empty strings | Cloud Functions aren't deployed. Either deploy them, or temporarily switch back to mock adapter for sequence generation |
| QR scanned on phone shows "Document not found" | `NEXT_PUBLIC_APP_URL` is wrong in production — make sure it matches your Vercel URL exactly |
| Slow loads on first visit | Firebase cold start. Normal. Subsequent loads are fast. |
| You break something — how to roll back? | Vercel keeps every deploy; click any previous deploy → "Promote to production" |

---

## 🔄 Switching back to mock for development

If you want to develop new features locally without touching Firebase, just flip the import in `src/services/index.ts` back to `mockAdapter`. The mock adapter still works perfectly — useful for fast iteration.

You can also keep both: use Firebase in production (Vercel), mock when running `npm run dev` locally. Just gate it with an env var:

```ts
// src/services/index.ts
import { mockAdapter } from "./mockAdapter";
import { firebaseAdapter } from "./firebaseAdapter";

export const dataAdapter = process.env.NEXT_PUBLIC_USE_FIREBASE === "true"
  ? firebaseAdapter
  : mockAdapter;
```

Then on Vercel set `NEXT_PUBLIC_USE_FIREBASE=true`, and locally leave it unset.

---

## 📞 What to do next

1. Spend a week running the app **in parallel** with your current process (paper/Excel) — find the gaps before they bite
2. Train your team on the basics: login, create DO, mark delivered, create invoice, record payment
3. Set a Firebase **billing alert** at $5/month so you're never surprised
4. Consider buying a custom domain (e.g. `app.irmaan-trading.co`) and pointing it at Vercel — looks more professional than `*.vercel.app`

Need help with any of these? Just ask.
