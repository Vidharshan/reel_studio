"""
Automated Interval Runner: Viral Reels, Sounds & Template Harvester
===================================================================
Runs periodically (or via cron / Antigravity schedule) to keep B-rolls,
sound effects, and viral editing blueprints fresh.
"""

import sys
import os
import time
import json
import argparse
from datetime import datetime
from pathlib import Path

# Ensure UTF-8 output on Windows
if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

ROOT_DIR = Path(__file__).parent.parent
sys.path.append(str(ROOT_DIR))

from scripts.viral_asset_fetcher import fetch_viral_sfx, fetch_broll_library, synthesize_viral_templates

LOG_FILE = ROOT_DIR / "agent_temp" / "scheduler.log"
LOG_FILE.parent.mkdir(parents=True, exist_ok=True)

def log_event(message: str):
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    formatted = f"[{timestamp}] {message}"
    print(formatted)
    try:
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write(formatted + "\n")
    except Exception:
        pass

def run_harvest_cycle():
    log_event("Starting automated viral reel harvesting cycle...")
    try:
        sfx = fetch_viral_sfx()
        log_event(f"Successfully refreshed {len(sfx)} viral sound effects.")
        
        brolls = fetch_broll_library()
        log_event(f"Successfully harvested {len(brolls)} portrait B-roll assets.")
        
        templates = synthesize_viral_templates()
        log_event(f"Updated {len(templates)} high-retention viral reel templates.")
        
        log_event("Harvest cycle completed successfully.")
        return True
    except Exception as e:
        log_event(f"Error during harvest cycle: {e}")
        return False

def main():
    parser = argparse.ArgumentParser(description="Reeltrix Viral Asset & Template Scheduler")
    parser.add_argument("--interval", type=int, default=0, help="Interval in seconds between runs (0 for one-shot)")
    parser.add_argument("--once", action="store_true", help="Run once and exit immediately")
    args = parser.parse_args()

    log_event(f"Viral Asset Scheduler initialized. Mode: {'One-Shot' if args.once or args.interval == 0 else f'Recurring every {args.interval}s'}")
    
    if args.once or args.interval <= 0:
        run_harvest_cycle()
        return

    # Daemon / Interval Loop
    while True:
        run_harvest_cycle()
        log_event(f"Sleeping for {args.interval} seconds until next harvest...")
        try:
            time.sleep(args.interval)
        except KeyboardInterrupt:
            log_event("Scheduler stopped by user.")
            break

if __name__ == "__main__":
    main()
