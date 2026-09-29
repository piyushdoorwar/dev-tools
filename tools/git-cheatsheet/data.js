// Git task reference, grouped by what you are trying to do.
//
// Each task:
//   title     what you want to achieve
//   commands  one or more lines, each copied on its own
//   text      one-sentence explanation
//   danger    optional: "rewrites" (changes commit IDs) and/or "discards"
//             (uncommitted changes or commits can be lost)
//   note      optional alternatives, legacy spellings and caveats
//
// `backticks` in text and notes render as inline code. <angle-bracket> names in
// commands render as placeholders; <branch>, <commit>, <file> and <tag> can be
// filled in from the toolbar. `main` and `origin` are written literally because
// they are what most repositories use.
//
// Modern commands (git switch / git restore) need Git 2.23 or later.
// Reference: https://git-scm.com/docs
globalThis.GIT_DANGER = {
  rewrites: "Rewrites history",
  discards: "Discards work",
};

globalThis.GIT_CATEGORIES = [
  {
    id: "setup",
    title: "Setup & config",
    tasks: [
      {
        title: "Set your name and email",
        commands: [
          'git config --global user.name "Your Name"',
          'git config --global user.email "you@example.com"',
        ],
        text: "Recorded as the author of every commit you make.",
        note: "Drop `--global` to set them for the current repository only, for example a work address in a work repo.",
      },
      {
        title: "Start a new repository",
        commands: ["git init -b main"],
        text: "Creates a `.git` directory here with `main` as the first branch.",
        note: "`-b` needs Git 2.28 or later. `git config --global init.defaultBranch main` makes it the default for every new repository.",
      },
      {
        title: "Clone a repository",
        commands: ["git clone <url>"],
        text: "Copies the full history and checks out the default branch.",
        note: "`git clone <url> <dir>` picks the folder name. `--depth 1` fetches only the latest commit, which is faster for CI but has no history.",
      },
      {
        title: "See every setting and where it comes from",
        commands: ["git config --list --show-origin"],
        text: "Lists system, global and repository values with the file that sets each one.",
        note: "Read one value with `git config --get user.email`. Later files win: repository over global over system.",
      },
    ],
  },
  {
    id: "inspect",
    title: "Inspect",
    tasks: [
      {
        title: "Check what changed",
        commands: ["git status"],
        text: "Shows the current branch, staged and unstaged changes, and untracked files.",
        note: "`git status -sb` gives a compact one-line-per-file view. Run it before anything that modifies files.",
      },
      {
        title: "Review changes before committing",
        commands: ["git diff", "git diff --staged"],
        text: "The first compares your files with the index; the second compares the index with the last commit, which is what will be committed.",
        note: "`--cached` is the same as `--staged`. Add `--stat` for a per-file summary.",
      },
      {
        title: "View history as a graph",
        commands: ["git log --oneline --graph --decorate --all -20"],
        text: "The last 20 commits across every branch, with branch and tag names beside them.",
        note: "Drop `--all` to see only the current branch. Save it as an alias: `git config --global alias.lg \"log --oneline --graph --decorate --all\"`.",
      },
      {
        title: "Show one commit",
        commands: ["git show <commit>"],
        text: "Prints the commit's message, author and full diff.",
        note: "`--stat` lists only the files. `git show <commit>:<file>` prints a file as it was in that commit (path from the repository root).",
      },
      {
        title: "History of a file",
        commands: ["git log --follow -p -- <file>"],
        text: "Every commit that touched the file, with its diff, following renames.",
        note: "`--follow` works with a single path only. Drop `-p` for a list of commits.",
      },
      {
        title: "Find who changed each line",
        commands: ["git blame -- <file>"],
        text: "Shows the last commit, author and date for every line.",
        note: "`-L 10,20` limits it to those lines. `git log -L 10,20:<file>` shows how those lines evolved over time.",
      },
      {
        title: "Compare your branch with main",
        commands: ["git log --oneline main..HEAD", "git diff main...HEAD"],
        text: "Commits on your branch that main does not have, then the changes since your branch split off.",
        note: "Two dots for log, three for diff: `main...HEAD` diffs from the merge base, so new work on main does not show up as reversed changes.",
      },
      {
        title: "Find the commit that added or removed some text",
        commands: ['git log -S "<text>" --oneline'],
        text: "Searches the content of every change, not the commit messages.",
        note: "`-G <regex>` matches changed lines by pattern. `--grep \"<text>\"` searches commit messages instead.",
      },
    ],
  },
  {
    id: "stage",
    title: "Stage & commit",
    tasks: [
      {
        title: "Stage a file",
        commands: ["git add -- <file>"],
        text: "Adds the file's current contents to the next commit.",
        note: "The `--` ends the options, so a path that starts with a dash is still read as a path.",
      },
      {
        title: "Stage everything",
        commands: ["git add -A"],
        text: "Stages new, modified and deleted files across the whole repository.",
        note: "`git add .` limits it to the current directory. Check `git status` first so nothing unexpected goes in.",
      },
      {
        title: "Stage part of a file",
        commands: ["git add -p"],
        text: "Walks through each change and asks whether to stage it.",
        note: "Answer `y` or `n` per hunk, `s` to split it, `e` to edit it by hand. Add `-- <file>` to limit it to one file.",
      },
      {
        title: "Commit staged changes",
        commands: ['git commit -m "Describe the change"'],
        text: "Records what is in the index, not every change in your working tree.",
        note: "`git commit -am \"…\"` stages modified tracked files first, but never new files. Plain `git commit` opens your editor for a longer message.",
      },
    ],
  },
  {
    id: "branches",
    title: "Branches",
    tasks: [
      {
        title: "List branches",
        commands: ["git branch -vv"],
        text: "Local branches with their latest commit and the upstream each one tracks.",
        note: "`-a` includes remote-tracking branches such as `origin/main`. `--sort=-committerdate` puts recent ones first.",
      },
      {
        title: "Create a branch and switch to it",
        commands: ["git switch -c <branch>"],
        text: "Starts a new branch at the current commit and moves you onto it.",
        note: "Legacy: `git checkout -b <branch>`. Add a start point to branch from somewhere else: `git switch -c <branch> origin/main`.",
      },
      {
        title: "Switch to a branch",
        commands: ["git switch <branch>"],
        text: "Moves you onto an existing branch. Uncommitted changes that would conflict stop the switch.",
        note: "`git switch -` returns to the previous branch. If the branch exists only on the remote, this creates a local tracking branch for it. Legacy: `git checkout <branch>`.",
      },
      {
        title: "Rename the current branch",
        commands: ["git branch -m <new-name>"],
        text: "Renames the branch locally.",
        note: "If it was already pushed, publish the new name with `git push -u origin <new-name>` and remove the old one with `git push origin --delete <old-name>`.",
      },
      {
        title: "Merge a branch into the current one",
        commands: ["git merge <branch>"],
        text: "Brings the other branch's commits in, fast-forwarding when possible and otherwise creating a merge commit.",
        note: "`--no-ff` always creates a merge commit; `--ff-only` refuses unless it can fast-forward.",
      },
      {
        title: "Resolve merge conflicts",
        commands: ["git status", "git add -- <file>", "git merge --continue"],
        text: "Edit each conflicted file, stage it to mark it resolved, then finish the merge.",
        note: "To take one side of a file wholesale: `git restore --ours -- <file>` or `--theirs`. During a rebase the two are swapped: ours is the branch you are rebasing onto.",
      },
      {
        title: "Abort a merge",
        commands: ["git merge --abort"],
        text: "Returns to the state before the merge started, throwing away any conflict resolution done so far.",
        note: "Commit or stash your own changes before merging: with uncommitted changes present, the abort may not be able to restore them.",
      },
      {
        title: "Delete a merged branch",
        commands: ["git branch -d <branch>"],
        text: "Removes the local branch. Git refuses if its commits are not merged anywhere.",
        note: "This does not touch the remote; see \"Delete a remote branch\".",
      },
      {
        title: "Force-delete an unmerged branch",
        commands: ["git branch -D <branch>"],
        danger: ["discards"],
        text: "Deletes the branch even though its commits exist nowhere else.",
        note: "Until the reflog expires you can still get them back: `git reflog` shows the old tip, `git branch <branch> <commit>` restores it.",
      },
    ],
  },
  {
    id: "undo",
    title: "Undo & fix",
    tasks: [
      {
        title: "Discard changes to a file",
        commands: ["git restore -- <file>"],
        danger: ["discards"],
        text: "Replaces the file with its staged (or last committed) version. The edits are gone for good.",
        note: "Legacy: `git checkout -- <file>`. Not sure? `git stash push -- <file>` keeps a copy instead.",
      },
      {
        title: "Unstage a file",
        commands: ["git restore --staged -- <file>"],
        text: "Takes the file out of the next commit but keeps your edits in the working tree.",
        note: "Legacy: `git reset HEAD -- <file>`.",
      },
      {
        title: "Discard all uncommitted changes",
        commands: ["git reset --hard HEAD"],
        danger: ["discards"],
        text: "Resets every tracked file and the index to the last commit.",
        note: "Untracked files are kept; see Cleanup for `git clean`. `git restore --staged --worktree -- .` does the same with the modern command. `git stash -u` is the reversible alternative.",
      },
      {
        title: "Amend the last commit",
        commands: ["git add -- <file>", "git commit --amend --no-edit"],
        danger: ["rewrites"],
        text: "Folds the staged changes into the previous commit, which gets a new ID.",
        note: "Drop `--no-edit` to change the message too; with nothing staged, `git commit --amend -m \"New message\"` fixes only the message. Only for commits you have not pushed.",
      },
      {
        title: "Undo the last commit but keep its changes",
        commands: ["git reset --soft HEAD~1"],
        danger: ["rewrites"],
        text: "Moves the branch back one commit and leaves that commit's changes staged.",
        note: "`git reset HEAD~1` leaves them unstaged instead. Already pushed? Use `git revert` so nobody's history changes.",
      },
      {
        title: "Throw away the last commit entirely",
        commands: ["git reset --hard HEAD~1"],
        danger: ["rewrites", "discards"],
        text: "Removes the commit and every uncommitted change in tracked files.",
        note: "The commit itself can be recovered from `git reflog` for a while; uncommitted changes cannot.",
      },
      {
        title: "Undo a commit that is already pushed",
        commands: ["git revert <commit>"],
        text: "Adds a new commit that reverses the old one, so shared history stays intact.",
        note: "For a merge commit, name the parent to keep: `git revert -m 1 <commit>`. `--no-commit` lets you revert several commits into one.",
      },
      {
        title: "Restore a file from an older commit",
        commands: ["git restore --source=<commit> -- <file>"],
        danger: ["discards"],
        text: "Overwrites the file in your working tree with its version from that commit.",
        note: "Your current edits to that file are lost. Legacy: `git checkout <commit> -- <file>`, which also stages the result.",
      },
    ],
  },
  {
    id: "stash",
    title: "Stash",
    tasks: [
      {
        title: "Stash changes, including untracked files",
        commands: ['git stash push -u -m "work in progress"'],
        text: "Saves your changes on a stack and cleans the working tree so you can switch tasks.",
        note: "Plain `git stash` skips untracked files; ignored files are skipped unless you use `-a`. `git stash push -- <file>` stashes only that path.",
      },
      {
        title: "List stashes",
        commands: ["git stash list"],
        text: "Shows every saved stash, newest first, as `stash@{0}`, `stash@{1}` and so on.",
        note: "`git stash show -p stash@{0}` shows what a stash contains.",
      },
      {
        title: "Apply a stash and keep it",
        commands: ["git stash apply stash@{0}"],
        text: "Re-applies the changes and leaves the stash in place as a backup.",
        note: "Conflicts are possible; resolve them like a merge. Drop the stash once you are happy.",
      },
      {
        title: "Apply the latest stash and remove it",
        commands: ["git stash pop"],
        text: "Applies `stash@{0}` and drops it from the stack.",
        note: "If applying conflicts, the stash is kept so nothing is lost.",
      },
      {
        title: "Delete one stash",
        commands: ["git stash drop stash@{0}"],
        danger: ["discards"],
        text: "Removes the stash from the stack.",
        note: "Git prints the dropped commit's hash; `git stash apply <commit>` brings it back. Lost the hash? See Recovery.",
      },
      {
        title: "Delete every stash",
        commands: ["git stash clear"],
        danger: ["discards"],
        text: "Empties the stash stack in one go, with no confirmation.",
      },
    ],
  },
  {
    id: "rebase",
    title: "Rebase & history",
    tasks: [
      {
        title: "Rebase your branch onto the latest main",
        commands: ["git fetch origin", "git rebase origin/main"],
        danger: ["rewrites"],
        text: "Replays your commits on top of main, giving them new IDs and a linear history.",
        note: "A branch you already pushed then needs `git push --force-with-lease`. Never on a branch others build on; `git merge origin/main` is the safe alternative.",
      },
      {
        title: "Edit, squash or reorder recent commits",
        commands: ["git rebase -i HEAD~3"],
        danger: ["rewrites"],
        text: "Opens the last three commits in your editor as a to-do list.",
        note: "Change `pick` to `reword`, `edit`, `squash`, `fixup` or `drop`, or reorder the lines. `git rebase -i main` covers every commit since your branch left main.",
      },
      {
        title: "Fix an older commit with a fixup",
        commands: ["git commit --fixup=<commit>", "git rebase -i --autosquash <commit>~1"],
        danger: ["rewrites"],
        text: "Commits the staged change as a fixup, then folds it into the target commit.",
        note: "`git config --global rebase.autoSquash true` makes every interactive rebase do this. The target cannot be the root commit.",
      },
      {
        title: "Continue a rebase after resolving conflicts",
        commands: ["git add -- <file>", "git rebase --continue"],
        text: "Marks the conflicts resolved and moves on to the next commit.",
        note: "Keep going until the rebase reports success; `git status` shows how far through you are.",
      },
      {
        title: "Skip the commit a rebase stopped on",
        commands: ["git rebase --skip"],
        danger: ["discards"],
        text: "Leaves that commit out of the rebased branch entirely.",
        note: "Useful when the change is already upstream. Anything else in that commit is dropped.",
      },
      {
        title: "Abort a rebase",
        commands: ["git rebase --abort"],
        text: "Puts the branch back exactly where it was before the rebase began.",
        note: "Conflict resolutions made during the rebase are thrown away.",
      },
    ],
  },
  {
    id: "cherry-pick",
    title: "Cherry-pick",
    tasks: [
      {
        title: "Copy a commit onto the current branch",
        commands: ["git cherry-pick <commit>"],
        text: "Applies that commit's change here as a new commit with a new ID.",
        note: "`-x` adds \"cherry picked from commit …\" to the message. `-n` applies the change without committing.",
      },
      {
        title: "Cherry-pick a range of commits",
        commands: ["git cherry-pick <first>^..<last>"],
        text: "Applies every commit from first to last, oldest first.",
        note: "Without the `^`, the first commit itself is left out. The first must be an ancestor of the last.",
      },
      {
        title: "Continue a cherry-pick",
        commands: ["git add -- <file>", "git cherry-pick --continue"],
        text: "Run after resolving and staging the conflicts.",
        note: "`git cherry-pick --skip` drops the commit that conflicted and moves on to the next one.",
      },
      {
        title: "Abort a cherry-pick",
        commands: ["git cherry-pick --abort"],
        text: "Returns to the state before the cherry-pick sequence started.",
      },
    ],
  },
  {
    id: "remote",
    title: "Remote & sync",
    tasks: [
      {
        title: "List remotes",
        commands: ["git remote -v"],
        text: "Shows each remote's fetch and push URLs.",
        note: "`git remote add upstream <url>` adds another, such as the original of a fork. `git remote set-url origin <url>` repoints one.",
      },
      {
        title: "Fetch without merging",
        commands: ["git fetch origin"],
        text: "Updates remote-tracking branches like `origin/main`; your own branches are untouched.",
        note: "`--prune` also removes remote-tracking branches that were deleted on the server. `--all` fetches every remote.",
      },
      {
        title: "Pull only if it fast-forwards",
        commands: ["git pull --ff-only"],
        text: "Updates your branch when you have no local commits, and fails instead of creating a merge commit when histories diverge.",
        note: "`git config --global pull.ff only` makes this the behaviour of plain `git pull`.",
      },
      {
        title: "Pull and rebase local commits",
        commands: ["git pull --rebase"],
        text: "Fetches, then replays your unpushed commits on top of the updated branch.",
        note: "Only your local, unpushed commits get new IDs. `git config --global pull.rebase true` makes it the default.",
      },
      {
        title: "Publish a new branch",
        commands: ["git push -u origin <branch>"],
        text: "Pushes the branch and sets its upstream, so later `git push` and `git pull` need no arguments.",
        note: "`git push -u origin HEAD` publishes the current branch under its own name.",
      },
      {
        title: "Force-push after a rebase, safely",
        commands: ["git push --force-with-lease"],
        danger: ["rewrites"],
        text: "Replaces the remote branch, but only if nobody pushed to it since you last fetched.",
        note: "Plain `--force` silently overwrites other people's commits. Add `--force-if-includes` (Git 2.30+) so a background fetch cannot defeat the check.",
      },
      {
        title: "Delete a remote branch",
        commands: ["git push origin --delete <branch>"],
        text: "Removes the branch from the server. Your local branch is untouched.",
        note: "Teammates keep a stale `origin/<branch>` until they run `git fetch --prune`.",
      },
    ],
  },
  {
    id: "tags",
    title: "Tags",
    tasks: [
      {
        title: "Create an annotated tag",
        commands: ['git tag -a <tag> -m "Release <tag>"'],
        text: "Tags the current commit with a message, author and date, which is what releases should use.",
        note: "Tag an older commit with `git tag -a <tag> <commit> -m \"…\"`. List tags with `git tag -l \"v1.*\"`.",
      },
      {
        title: "Push a tag",
        commands: ["git push origin <tag>"],
        text: "Tags are not pushed with branches; send each one explicitly.",
        note: "`--tags` pushes every local tag. `--follow-tags` pushes annotated tags that point at the commits being pushed.",
      },
      {
        title: "Delete a tag",
        commands: ["git tag -d <tag>", "git push origin --delete refs/tags/<tag>"],
        text: "Removes the tag locally, then on the server.",
        note: "The full `refs/tags/` name avoids deleting a branch that has the same name. Clones that already fetched the tag keep it.",
      },
      {
        title: "Check out a tag",
        commands: ["git switch --detach <tag>"],
        text: "Moves to the tagged commit in detached HEAD state, for building or testing a release.",
        note: "To make changes, branch from it instead: `git switch -c <branch> <tag>`.",
      },
    ],
  },
  {
    id: "recovery",
    title: "Recovery",
    tasks: [
      {
        title: "Rescue work on a detached HEAD",
        commands: ["git switch -c rescue-work"],
        text: "Creates a branch at the detached commit so the commits you made there stay reachable.",
        note: "Any name works. Already switched away? Find the commit with `git reflog`, then `git branch rescue-work <commit>`.",
      },
      {
        title: "Leave a detached HEAD",
        commands: ["git switch <branch>"],
        text: "Returns to a branch. Commits made while detached become unreachable unless you rescue them first.",
        note: "`git switch -` goes back to wherever you were before. Git prints the hash of any commits you leave behind.",
      },
      {
        title: "Find lost commits",
        commands: ["git reflog", "git branch recovered <commit>"],
        text: "The reflog lists every commit HEAD has pointed at; put a branch on the one you want back.",
        note: "`git reflog show <branch>` narrows it to one branch. The reflog is local only, and entries expire (after 90 days by default, 30 for unreachable commits).",
      },
      {
        title: "Undo a bad reset, rebase or amend",
        commands: ["git reflog", "git reset --hard <commit>"],
        danger: ["discards"],
        text: "Find the entry from just before the operation and move the branch back to it.",
        note: "Right after a rebase or reset, `ORIG_HEAD` usually names that commit. Stash any uncommitted changes first; `--hard` removes them.",
      },
      {
        title: "Restore a deleted file",
        commands: ["git log --diff-filter=D --oneline -- <file>", "git restore --source=<commit>~1 -- <file>"],
        text: "Finds the commit that deleted the file, then brings back the version from just before it.",
        note: "Deleted but not committed yet? `git restore -- <file>` is enough.",
      },
      {
        title: "Recover a dropped stash",
        commands: ['git fsck --no-reflog | grep "dangling commit"', "git stash apply <commit>"],
        text: "Dropped stashes linger as dangling commits until garbage collection; apply the right one by hash.",
        note: "Inspect candidates with `git show <commit>`. On Windows cmd, use `findstr` instead of `grep`.",
      },
    ],
  },
  {
    id: "cleanup",
    title: "Cleanup",
    tasks: [
      {
        title: "Preview which untracked files would be deleted",
        commands: ["git clean -n -d"],
        text: "A dry run: lists untracked files and directories without touching them.",
      },
      {
        title: "Delete untracked files",
        commands: ["git clean -f -d"],
        danger: ["discards"],
        text: "Removes untracked files and directories. They were never committed, so Git cannot bring them back.",
        note: "Run the `-n` preview first. `-x` also deletes ignored files such as build output; `-i` asks file by file.",
      },
      {
        title: "Prune deleted remote branches",
        commands: ["git fetch --prune"],
        text: "Removes remote-tracking branches whose branch no longer exists on the server.",
        note: "`git config --global fetch.prune true` does it on every fetch.",
      },
      {
        title: "Tidy up merged local branches",
        commands: ["git branch --merged main", "git branch -d <branch>"],
        text: "Lists branches already merged into main, then deletes one at a time.",
        note: "Squash-merged branches do not show as merged; check them, then use `-D`.",
      },
      {
        title: "Stop tracking a file but keep it locally",
        commands: ["git rm --cached -- <file>", 'echo "<file>" >> .gitignore'],
        text: "Removes the file from the repository from the next commit on, and ignores it from now on.",
        note: "Commit both changes. When teammates pull, the file is deleted from their working trees. Add `-r` for a directory.",
      },
    ],
  },
];
