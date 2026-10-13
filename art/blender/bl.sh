#!/bin/sh
# Run Blender in its own memory-capped scope: if a build ever balloons, the
# system kills Blender alone — not the editor it was started from (VS Code
# was killed twice on 2026-10-13 when Blender, counted in its group, filled
# memory and swap).  Usage: art/blender/bl.sh -b -P art/blender/build.py -- …
exec systemd-run --user --scope --quiet -p MemoryMax=8G -p MemorySwapMax=1G \
  "$HOME/.local/opt/blender-4.2.3-linux-x64/blender" --python-exit-code 1 "$@"
