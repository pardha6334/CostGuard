# Deploy CostGuard via Git (CI/CD)

Push code to a **private** Git repo; Vercel will auto-deploy on every push to your main branch.

---

## 1. Create a private repository (GitHub / GitLab / Bitbucket)

### GitHub
1. Go to [github.com/new](https://github.com/new).
2. **Repository name:** `costguard` (or any name).
3. Set visibility to **Private**.
4. Do **not** add a README, .gitignore, or license (we already have them).
5. Click **Create repository**.

### GitLab
1. New Project → Create blank project.
2. Name: `costguard`, visibility **Private**.
3. Uncheck "Initialize with a README".
4. Create project.

### Bitbucket
1. Create repository → **Private**.
2. Do not add a READout or .gitignore.
3. Create.

---

## 2. Push this project to the new repo

From the project root (`c:\CostGuard`), run (replace `YOUR_USERNAME` and `costguard` with your actual org/repo):

**GitHub:**
```bash
git remote add origin https://github.com/YOUR_USERNAME/costguard.git
git branch -M main
git push -u origin main
```

**GitLab:**
```bash
git remote add origin https://gitlab.com/YOUR_USERNAME/costguard.git
git branch -M main
git push -u origin main
```

**Bitbucket:**
```bash
git remote add origin https://bitbucket.org/YOUR_USERNAME/costguard.git
git branch -M main
git push -u origin main
```

Use SSH if you prefer, e.g. `git@github.com:YOUR_USERNAME/costguard.git`.

---

## 3. Connect Vercel to the Git repo (one-time)

1. Go to [vercel.com/dashboard](https://vercel.com/dashboard).
2. Open your **costguard** project (or Import if you haven’t linked it yet).
3. **Settings** → **Git**.
4. Under **Connected Git Repository**, click **Connect Git Repository**.
5. Choose your provider (GitHub / GitLab / Bitbucket), authorize if asked, and select the **costguard** repo.
6. Set **Production Branch** to `main` (or `master` if you kept it).
7. Save.

From now on, every **push to the production branch** will trigger a new Vercel deployment.

---

## 4. Optional: use `main` as default branch

If you created the repo with `master` and want `main`:

```bash
git branch -M main
git push -u origin main
```

Then in Vercel → Project → Settings → Git, set Production Branch to `main`.

---

## 5. Workflow from here

1. Edit code locally.
2. `git add .` and `git commit -m "your message"`.
3. `git push origin main`.
4. Vercel builds and deploys automatically; check the **Deployments** tab for status and the live URL.

Environment variables are configured in **Vercel → Project → Settings → Environment Variables** (not in Git). They apply to every deployment.
