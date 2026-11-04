## Git
- After committing, push straight to `main` (origin: https://github.com/naufalhanifr/pantau.git) without asking. No feature branches or PRs; the user works solo.
- The repo must stay private. Before pushing, check: `curl -s -o /dev/null -w "%{http_code}" https://api.github.com/repos/naufalhanifr/pantau` (404 = private, 200 = public). If it is public, hold the push and warn. `gh` is not installed on the user's Mac.
