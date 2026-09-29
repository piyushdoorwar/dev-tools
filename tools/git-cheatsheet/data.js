// Task reference: https://git-scm.com/docs
globalThis.GIT_TASKS = [
  [
    "Inspect working tree",
    "git status --short",
    "See staged, unstaged, and untracked paths before modifying anything.",
  ],
  ["Review unstaged changes", "git diff", "Compare working tree with index."],
  [
    "Review staged changes",
    "git diff --staged",
    "Compare index with HEAD before committing.",
  ],
  [
    "Stage a file",
    "git add -- <file>",
    "Replace <file> with the path to stage.",
  ],
  [
    "Commit staged changes",
    'git commit -m "Describe the change"',
    "Records the index, not every working-tree change.",
  ],
  [
    "Create and switch branch",
    "git switch -c <branch>",
    "Creates a branch at the current commit.",
  ],
  [
    "Switch branch",
    "git switch <branch>",
    "Uncommitted changes may prevent switching.",
  ],
  [
    "View graph",
    "git log --oneline --graph --decorate -20",
    "Inspect recent history and branch tips.",
  ],
  [
    "Undo a published commit",
    "git revert <commit>",
    "Creates a new inverse commit, preserving shared history. Merge commits require selecting a mainline parent.",
  ],
  [
    "Undo last local commit, keep staged changes",
    "git reset --soft HEAD~1",
    "Rewrites local history. Use only for unpublished commits; requires a parent commit.",
  ],
  [
    "Unstage a file",
    "git restore --staged -- <file>",
    "Keeps the working-tree contents.",
  ],
  [
    "Discard uncommitted changes to a file",
    "git restore -- <file>",
    "DESTRUCTIVE: replaces unstaged contents from the index. Save a copy or stash first.",
  ],
  [
    "Amend latest commit",
    "git commit --amend --no-edit",
    "Rewrites the latest commit with staged changes. Avoid on shared history.",
  ],
  [
    "Stash including untracked files",
    'git stash push -u -m "work in progress"',
    "Ignored files are excluded. Saves work and cleans the affected working tree.",
  ],
  ["List stashes", "git stash list", "Inspect available stash entries."],
  [
    "Apply stash while keeping backup",
    "git stash apply stash@{0}",
    "May produce conflicts; stash remains available until dropped.",
  ],
  [
    "Cherry-pick a commit",
    "git cherry-pick <commit>",
    "Applies a commit to the current branch. Resolve conflicts, stage them, then continue.",
  ],
  [
    "Continue cherry-pick",
    "git cherry-pick --continue",
    "Run after resolving and staging conflicts.",
  ],
  [
    "Abort cherry-pick",
    "git cherry-pick --abort",
    "Returns to the state before the cherry-pick sequence.",
  ],
  [
    "Rebase onto branch",
    "git rebase <branch>",
    "Replays current-branch commits and rewrites their IDs. Use on unpublished work.",
  ],
  [
    "Interactive rebase",
    "git rebase -i HEAD~3",
    "Reorder, squash, or edit the last three commits. Rewrites history and requires at least three ancestors.",
  ],
  [
    "Continue rebase",
    "git rebase --continue",
    "Resolve conflicts and stage resolutions first.",
  ],
  [
    "Abort rebase",
    "git rebase --abort",
    "Returns to the state before rebase began.",
  ],
  [
    "Rescue detached HEAD",
    "git switch -c rescue-work",
    "Creates a branch at the detached commit so work stays reachable.",
  ],
  [
    "Find lost commits",
    "git reflog",
    "Find a previous tip, then create a branch at the desired commit. Reflog entries expire.",
  ],
  [
    "Recover a commit on a new branch",
    "git branch recovered <commit>",
    "Preserves the commit without replacing the current working tree.",
  ],
  [
    "Fetch remote changes",
    "git fetch origin",
    "Updates remote-tracking refs without merging into your branch.",
  ],
  [
    "Pull only if fast-forward",
    "git pull --ff-only",
    "Fails when histories diverge rather than making a merge commit.",
  ],
  [
    "Publish a branch",
    "git push -u origin <branch>",
    "Sends commits and sets an upstream.",
  ],
  ["List remotes", "git remote -v", "Shows configured fetch and push URLs."],
  [
    "Find who changed a line",
    "git blame -- <file>",
    "Shows the latest commit touching each line.",
  ],
  [
    "Check ignored paths",
    "git check-ignore -v -- <file>",
    "Explains which ignore rule matches a path.",
  ],
];
