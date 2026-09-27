---
description: Run the automated viral asset & template harvester on an interval or once
---

Run automated harvest cycle:

```powershell
python scripts/auto_scheduler.py --once
```

Or run periodically in background (e.g. every 6 hours / 21600s):

```powershell
python scripts/auto_scheduler.py --interval 21600
```
