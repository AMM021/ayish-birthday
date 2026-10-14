#!/bin/bash
# the whole suite, one after another; a summary line per test
cd "$(dirname "$0")"
B=${B:-http://127.0.0.1:5400/}
run() { local name="$1"; shift; echo "=== $name"; env BASE=$B "$@" 2>&1 | tail -${TAIL:-4}; }
TAIL=9 run passcode GPU=1 timeout 300 node passcode.mjs
TAIL=6 run pause GPU=1 timeout 300 node pause.mjs
TAIL=10 run intros GPU=1 timeout 600 node intros.mjs
TAIL=2 run controls GPU=1 timeout 300 node controls.mjs
TAIL=2 run torii GPU=1 timeout 600 node v3torii.mjs
TAIL=6 run compile GPU=1 timeout 600 node v2compile.mjs
TAIL=2 run stars GPU=1 timeout 600 node v3stars.mjs
TAIL=2 run petals GPU=1 timeout 900 node v3petals.mjs
TAIL=4 run final_laptop_letter GPU=1 timeout 600 node v2home.mjs
TAIL=4 run reveal GPU=1 timeout 600 node v3reveal.mjs
TAIL=3 run goodbye GPU=1 timeout 600 node goodbye.mjs
TAIL=2 run compliments timeout 600 node compl.mjs
for r in gate up top bath out off engawa street_w street_e lane_end yard_out park_out lot_n lot_s; do echo "=== walk $r"; env BASE=$B GPU=1 timeout 500 node walk.mjs $r 2>&1 | grep RESULT; done
echo "=== stair"; env BASE=$B GPU=1 timeout 500 node stairfence.mjs 2>&1 | grep RESULT
TAIL=4 run doors_two_visits GPU=1 timeout 400 node doorshot.mjs
TAIL=6 run decor GPU=1 timeout 600 node decorcheck.mjs
TAIL=2 run decor_final GPU=1 timeout 300 node decorcheck.mjs FINAL
TAIL=4 run reduced_motion GPU=1 timeout 300 node rmstars.mjs
echo "=== perf 8 Mbps"; env DWELL=1 GPU=1 timeout 1500 node perf.mjs 1 slow 2>&1 | grep -E "load|^END|total"
echo ALLDONE
