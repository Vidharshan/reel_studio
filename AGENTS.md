<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Storage & Working Drive Rule

> [!CRITICAL]
> **DRIVE LOCATION RULE**: The `C:` drive has 0 free space.
> All project files, temporary build artifacts, video/audio render outputs, upload caches (`tusd`), temporary directories (`tmp`), downloaded binaries, and subagent working directories MUST strictly use `D:\2026\reel_studio` (or paths explicitly on `D:`).
> NEVER write temporary files to `C:\` or default system temp (`os.tmpdir()` / `AppData\Local\Temp`).

## Reusable Commands

Every time you see a repeatable action or command, store it as a command in your tool set — a custom slash command in `.claude/commands/<appropriate-name>.md` — by naming it appropriately. Next time you encounter the same action, just execute the stored command without rethinking it.
