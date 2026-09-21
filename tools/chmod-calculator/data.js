/* Reference data for the chmod calculator.
 *
 * Kept out of script.js so the presets and the wording of the explanations can
 * be reviewed — and tested — as data rather than as strings buried in render
 * code. Octal values are written as strings because that is how a user types
 * them; the script parses them in base 8.
 */

globalThis.CHMOD_DATA = Object.freeze({
  /* Modes worth one click. `kind` picks the icon-free label colour and tells
     the calculator whether the mode is meant for a file or a directory, which
     changes how execute is explained. */
  presets: Object.freeze([
    { octal: "644", kind: "file", label: "Regular file", note: "Owner edits, everyone reads. Documents, config, source." },
    { octal: "755", kind: "dir", label: "Directory / program", note: "Owner edits, everyone enters or runs. The default for directories." },
    { octal: "600", kind: "file", label: "Private file", note: "Only the owner. SSH keys, .env files, credentials." },
    { octal: "700", kind: "dir", label: "Private directory", note: "Only the owner can enter. ~/.ssh, ~/.gnupg." },
    { octal: "664", kind: "file", label: "Group-writable file", note: "A team edits, everyone reads." },
    { octal: "775", kind: "dir", label: "Group-writable directory", note: "A team adds files, everyone browses." },
    { octal: "440", kind: "file", label: "Read-only, no others", note: "Owner and group read; nobody writes. sudoers-style config." },
    { octal: "400", kind: "file", label: "Read-only, owner", note: "Owner reads and nothing else. Archived secrets." },
    { octal: "1777", kind: "dir", label: "Shared scratch", note: "Anyone writes, but only the owner of a file can delete it. This is /tmp." },
    { octal: "2775", kind: "dir", label: "Group project", note: "setgid keeps new files in the directory's group." },
    { octal: "4755", kind: "file", label: "setuid program", note: "Runs as its owner regardless of who starts it. This is /usr/bin/passwd." },
    { octal: "777", kind: "dir", label: "Everyone, everything", note: "Almost never the right answer — see the warnings it raises." },
  ]),

  umaskPresets: Object.freeze([
    { octal: "022", label: "Default", note: "Files 644, directories 755. What most distributions ship." },
    { octal: "002", label: "Group-collaborative", note: "Files 664, directories 775. Shared group work." },
    { octal: "027", label: "Group-readable", note: "Files 640, directories 750. Nothing for other users." },
    { octal: "077", label: "Private", note: "Files 600, directories 700. Nothing leaves the owner." },
  ]),

  /* Execute means something different on a directory, and that difference is
     the single most misunderstood part of Unix permissions. */
  verbs: Object.freeze({
    file: Object.freeze({ r: "read it", w: "change or overwrite it", x: "run it as a program" }),
    dir: Object.freeze({ r: "list its contents", w: "add, rename and delete entries", x: "enter it and reach what is inside" }),
  }),

  special: Object.freeze([
    {
      key: "setuid",
      bit: 0o4000,
      label: "setuid",
      digit: 4,
      summary: "Runs the program as the file's owner, not as the user who started it.",
    },
    {
      key: "setgid",
      bit: 0o2000,
      label: "setgid",
      digit: 2,
      summary: "On a program, runs it as the file's group. On a directory, new entries inherit that group.",
    },
    {
      key: "sticky",
      bit: 0o1000,
      label: "sticky",
      digit: 1,
      summary: "In a shared directory, only a file's owner (or root) can delete or rename it.",
    },
  ]),
});
